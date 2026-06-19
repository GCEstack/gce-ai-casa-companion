"""Session management with concurrent I/O, barge-in, and voice commands.

All three solutions (A, B, C) import this module. The architecture is:

  Input Task  (always running)
    ├── Receives audio from WebSocket
    ├── Runs VAD on every chunk
    ├── Detects barge-in during TTS
    ├── Buffers audio until silence
    ├── Sends to OpenRouter Whisper
    ├── Classifies command vs. chat
    └── Handles command immediately OR sends to LLM

  Output Task (per TTS turn)
    ├── Streams TTS chunks to WebSocket
    ├── Checks for interrupt flag
    └── Stops immediately if interrupted

  Timeout Guard (always running)
    └── Closes session after 30s inactivity
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from postgrest.exceptions import APIError

from .providers import CharacterVoiceRouter, OpenRouterLLM, OpenRouterTTS, VADBufferedSTT, EnergyVAD
from .commands import CommandClassifier


class PermissionError(Exception):
    pass


@dataclass
class SessionContext:
    """Mutable state for a single connected device."""

    device_id: str
    device: dict[str, Any]
    websocket: WebSocket
    supabase: Any
    session_manager: "SessionManager"

    state: str = "idle"
    last_activity: float = field(default_factory=time.time)
    killed: bool = False
    interrupted: bool = False
    speaking: bool = False
    battery: int | None = None
    messages: list[dict[str, str]] = field(default_factory=list)
    event_queues: list[asyncio.Queue[dict[str, Any]]] = field(default_factory=list)
    character_key: str = "orsetto"
    mode: str = "default"
    current_output_task: asyncio.Task | None = None
    last_transcript: str = ""

    def __post_init__(self):
        self.battery = self.device.get("battery")
        self.character_key = self.device.get("character_key", "orsetto")
        self.mode = self.device.get("mode_key", "default")
        self.system_prompt = self._build_system_prompt()

    def _build_system_prompt(self) -> str:
        character_prompts = {
            "orsetto": "You are Orsetto, a gentle bear companion for children. You speak softly and kindly. You love hugs and honey.",
            "coniglio": "You are Coniglio, a playful rabbit companion for children. You are energetic, fun, and a bit silly. You love carrots and jumping.",
            "drago": "You are Drago, a brave dragon companion for children. You are adventurous, encouraging, and protective. You love flying and treasure hunts.",
        }
        base = character_prompts.get(self.character_key, f"You are {self.character_key}, a friendly companion for children.")

        mode_prompts = {
            "default": "Have a friendly chat. Keep it light and fun.",
            "story": "You are in story mode. Tell engaging, age-appropriate stories with a beginning, middle, and end. Use vivid descriptions.",
            "play": "You are in play mode. Be playful and interactive. Ask questions, make jokes, be silly.",
            "bedtime": "You are in bedtime mode. Speak softly and soothingly. Use gentle, calming language. Short responses.",
            "sing": "You are in sing mode. Sing songs, make up rhymes, be musical and rhythmic.",
        }
        mode_addition = mode_prompts.get(self.mode, "")

        return (
            f"{base} {mode_addition} "
            f"Keep responses short (2-4 sentences max). Use simple words a 4-year-old understands. "
            f"Be warm, patient, and encouraging. Never scary or sad."
        )

    def touch(self):
        self.last_activity = time.time()

    async def set_state(self, new_state: str):
        """Transition state with validation."""
        from .protocol import VoiceState
        try:
            current = VoiceState[self.state.upper()] if self.state else VoiceState.IDLE
            target = VoiceState[new_state.upper()]
            if not VoiceState.can_transition(current, target):
                print(f"[Session {self.device_id}] Invalid state transition: {current.name} -> {target.name}")
                return
        except KeyError:
            pass  # Unknown state, allow it

        self.state = new_state
        await self.send_json({"type": "state_change", "state": new_state})
        await self.broadcast_event({
            "type": "state_change",
            "device_id": self.device_id,
            "state": new_state,
            "battery": self.battery,
            "timestamp": time.time(),
        })

    async def interrupt(self):
        """Barge-in: stop current TTS, transition to listening."""
        self.interrupted = True
        self.cancel_output()
        await self.send_json({"type": "command", "command": "interrupt"})
        await self.set_state("listening")

    def cancel_output(self):
        """Cancel the current TTS output task."""
        self.interrupted = True
        self.speaking = False
        if self.current_output_task and not self.current_output_task.done():
            self.current_output_task.cancel()
        self.current_output_task = None

    async def interrupt(self):
        """Barge-in: stop current output and signal new turn."""
        self.interrupted = True
        self.cancel_output()

    async def send_json(self, data: dict[str, Any]):
        try:
            await self.websocket.send_json(data)
        except Exception:
            pass

    async def send_bytes(self, data: bytes):
        self.touch()
        try:
            await self.websocket.send_bytes(data)
        except Exception:
            pass

    async def send_binary(self, data: bytes):
        """Alias for send_bytes (compatibility with reference engine)."""
        await self.send_bytes(data)

    async def broadcast_event(self, event: dict[str, Any]):
        for q in list(self.event_queues):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def execute_command(self, command_id: str, config: dict):
        """Execute a voice command immediately (no LLM)."""
        commands = {
            "stop": self._cmd_stop,
            "story": self._cmd_story,
            "play": self._cmd_play,
            "bedtime": self._cmd_bedtime,
            "sing": self._cmd_sing,
            "switch_character": self._cmd_switch_character,
            "louder": self._cmd_volume_up,
            "softer": self._cmd_volume_down,
        }
        handler = commands.get(command_id)
        if handler:
            await handler(config)

    async def _cmd_stop(self, config: dict):
        self.interrupted = True
        self.cancel_output()
        await self.send_json({"type": "command", "command": "stop"})
        await self.set_state("idle")

    async def _cmd_story(self, config: dict):
        self.mode = "story"
        self.system_prompt = self._build_system_prompt()
        await self._acknowledge_mode("story")

    async def _cmd_play(self, config: dict):
        self.mode = "play"
        self.system_prompt = self._build_system_prompt()
        await self._acknowledge_mode("play")

    async def _cmd_bedtime(self, config: dict):
        self.mode = "bedtime"
        self.system_prompt = self._build_system_prompt()
        await self._acknowledge_mode("bedtime")

    async def _cmd_sing(self, config: dict):
        self.mode = "sing"
        self.system_prompt = self._build_system_prompt()
        await self._acknowledge_mode("sing")

    async def _cmd_switch_character(self, config: dict):
        new_char = config.get("character")
        if not new_char:
            new_char = self.session_manager.command_classifier.extract_character(self.last_transcript)
        if new_char:
            self.character_key = new_char
            self.system_prompt = self._build_system_prompt()
            await self.send_json({"type": "mode_changed", "mode": self.mode, "character": new_char})
            await self._acknowledge_mode(self.mode, f"Hi! I'm {new_char}! Ready to {self.mode}?")

    async def _cmd_volume_up(self, config: dict):
        await self.send_json({"type": "command", "command": "volume_up"})

    async def _cmd_volume_down(self, config: dict):
        await self.send_json({"type": "command", "command": "volume_down"})

    async def _acknowledge_mode(self, mode: str, custom_text: str | None = None):
        texts = {
            "story": "Let's have a story time!",
            "play": "Let's play!",
            "bedtime": "Goodnight, sweet dreams.",
            "sing": "Let's sing a song!",
            "default": "Okay!",
        }
        text = custom_text or texts.get(mode, "Okay!")
        self.cancel_output()
        self.current_output_task = asyncio.create_task(
            self.session_manager._output_loop(self, text)
        )


class SessionManager:
    """Central registry for all active sessions. Handles auth, consent, COPPA."""

    def __init__(self, supabase: Any, openrouter_key: str, tts=None):
        self.supabase = supabase
        self.sessions: dict[str, SessionContext] = {}
        self.openrouter_key = openrouter_key
        self.llm = OpenRouterLLM(openrouter_key)
        self.tts = tts or OpenRouterTTS(openrouter_key)
        self.command_classifier = CommandClassifier()
        self.voice_router = CharacterVoiceRouter(self.tts, provider="openrouter", dev_mode=False)

    async def authenticate_device(self, device_id: str, token: str) -> dict[str, Any]:
        result = await self.supabase.table("devices").select("*, parents(*)").eq("id", device_id).maybe_single().execute()
        if not result.data:
            raise PermissionError("Device not found")
        device = result.data
        if device.get("api_key") != token:
            raise PermissionError("Invalid device token")
        if not device.get("is_active", True):
            raise PermissionError("Device is deactivated")
        return device

    async def require_consent(self, device_id: str):
        result = await self.supabase.table("devices").select("*, parents(*)").eq("id", device_id).maybe_single().execute()
        row = result.data or {}
        parent = row.get("parents", {})
        if not parent.get("consent_verified"):
            raise PermissionError("Parental consent has not been verified")

    async def handle_connection(self, websocket: WebSocket, device_id: str, token: str):
        await websocket.accept()

        try:
            device = await self.authenticate_device(device_id, token)
            await self.require_consent(device_id)
        except Exception as e:
            await websocket.send_json({"type": "error", "code": "auth", "message": str(e)})
            await websocket.close(code=4001)
            return

        ctx = SessionContext(device_id, device, websocket, self.supabase, self)
        self.sessions[device_id] = ctx

        try:
            await asyncio.gather(
                self._input_loop(ctx),
                self._timeout_guard(ctx),
            )
        except Exception as e:
            print(f"[session {device_id}] error: {e}")
        finally:
            await self._cleanup(ctx)

    async def _input_loop(self, ctx: SessionContext):
        """Always running. Receives audio, VAD, barge-in, STT, commands, LLM."""
        stt = VADBufferedSTT(self.openrouter_key, EnergyVAD())
        classifier = self.command_classifier

        while not ctx.killed:
            try:
                message = await ctx.websocket.receive()
                ctx.touch()

                if "bytes" in message:
                    audio = message["bytes"]

                    # BARGE-IN DETECTION
                    if ctx.state == "speaking":
                        speech_detected, _ = stt.vad.feed(audio)
                        if speech_detected:
                            await ctx.interrupt()
                            # Continue with the new utterance (audio already in buffer)
                            stt.audio_buffer.extend(audio)
                            continue

                    # NORMAL STT BUFFERING
                    stt.audio_buffer.extend(audio)
                    _, utterance_complete = stt.vad.feed(audio)

                    if utterance_complete and stt.audio_buffer:
                        audio_data = bytes(stt.audio_buffer)
                        stt.audio_buffer = bytearray()
                        stt.vad.reset()

                        if audio_data:
                            transcript = await stt.transcribe(audio_data)
                            ctx.last_transcript = transcript

                            if transcript:
                                # Check for command
                                command = classifier.classify(transcript)
                                if command:
                                    command_id, config = command
                                    await ctx.execute_command(command_id, config)
                                else:
                                    await self._handle_llm_turn(ctx, transcript)

                elif "text" in message:
                    data = json.loads(message["text"])
                    await self._handle_control(ctx, data)

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"[input {ctx.device_id}] error: {e}")

        await stt.close()

    async def _handle_llm_turn(self, ctx: SessionContext, transcript: str):
        """Send transcript to LLM, stream TTS response."""
        ctx.cancel_output()
        ctx.interrupted = False

        ctx.messages.append({"role": "user", "content": transcript})
        await ctx.set_state("thinking")

        try:
            answer = await self.llm.complete(ctx.messages, ctx.system_prompt)
            ctx.messages.append({"role": "assistant", "content": answer})

            await ctx.set_state("speaking")
            ctx.current_output_task = asyncio.create_task(self._output_loop(ctx, answer))
        except Exception as e:
            print(f"[LLM {ctx.device_id}] error: {e}")
            await ctx.send_json({"type": "error", "code": "llm", "message": str(e)})
            await ctx.set_state("idle")

    # ── Output Task (per TTS turn) ───────────────────────────────────────────

    async def _output_loop(self, ctx: SessionContext, text: str):
        """Stream TTS chunks to client. Checks for interrupt flag."""
        ctx.speaking = True
        ctx.interrupted = False

        try:
            async for chunk in self.voice_router.speak(ctx.character_key, text, mode=ctx.mode):
                if not ctx.speaking or ctx.killed:
                    break
                await ctx.send_bytes(chunk)
        except Exception as e:
            print(f"[TTS {ctx.device_id}] error: {e}")
            await ctx.send_json({"type": "error", "code": "tts", "message": str(e)})
        finally:
            ctx.speaking = False
            if not ctx.killed:
                await ctx.set_state("idle")

    async def _handle_control(self, ctx: SessionContext, data: dict):
        """Handle text control messages from client."""
        msg_type = data.get("type")

        if msg_type in ("barge_in", "wake"):
            await ctx.interrupt()
        elif msg_type == "medallion":
            character_key = data.get("character_key")
            mode_key = data.get("mode_key")
            if character_key:
                ctx.character_key = character_key
            if mode_key:
                ctx.mode = mode_key
            ctx.system_prompt = ctx._build_system_prompt()
            await ctx.send_json({"type": "mode_changed", "mode": ctx.mode, "character": ctx.character_key})
            await self._output_loop(ctx, f"Hi! I'm {ctx.character_key}!")
        elif msg_type == "ping":
            await ctx.send_json({"type": "pong", "ts": data.get("ts")})
        elif msg_type == "battery":
            ctx.battery = int(data.get("level", 0))
            if ctx.battery < 10:
                await ctx.send_json({"type": "command", "command": "sleep"})
            await ctx.broadcast_event({"type": "battery", "device_id": ctx.device_id, "battery": ctx.battery, "timestamp": time.time()})

    async def _timeout_guard(self, ctx: SessionContext):
        """Close session after 30s of inactivity."""
        while not ctx.killed:
            await asyncio.sleep(5)
            if ctx.killed:
                return
            if time.time() - ctx.last_activity > 30:
                await ctx.send_json({"type": "command", "command": "timeout"})
                try:
                    await ctx.websocket.close(code=4000)
                except Exception:
                    pass
                return

    async def _cleanup(self, ctx: SessionContext):
        ctx.killed = True
        ctx.cancel_output()
        self.sessions.pop(ctx.device_id, None)
        await ctx.broadcast_event({"type": "disconnected", "device_id": ctx.device_id, "timestamp": time.time()})

    # ── Dashboard SSE ─────────────────────────────────────────────────────────

    def subscribe_events(self, device_id: str) -> asyncio.Queue[dict[str, Any]] | None:
        ctx = self.sessions.get(device_id)
        if not ctx:
            return None
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
        ctx.event_queues.append(q)
        return q

    def unsubscribe_events(self, device_id: str, q: asyncio.Queue[dict[str, Any]]):
        ctx = self.sessions.get(device_id)
        if ctx and q in ctx.event_queues:
            ctx.event_queues.remove(q)

    async def kill_session(self, device_id: str) -> bool:
        ctx = self.sessions.get(device_id)
        if not ctx:
            return False
        ctx.killed = True
        try:
            await ctx.send_json({"type": "command", "command": "kill"})
            await ctx.websocket.close(code=4002)
        except Exception:
            pass
        return True

    # ── COPPA Deletion ────────────────────────────────────────────────────────

    async def delete_parent_data(self, parent_id: str) -> dict[str, int]:
        counts: dict[str, int] = {}
        for table in ("sessions", "devices", "medallions"):
            try:
                result = await self.supabase.table(table).delete().eq("parent_id", parent_id).execute()
                counts[table] = len(result.data) if hasattr(result, "data") else 0
            except APIError as e:
                counts[table] = -1
                print(f"[COPPA] delete error on {table}: {e}")
        try:
            result = await self.supabase.table("parents").delete().eq("id", parent_id).execute()
            counts["parents"] = len(result.data) if hasattr(result, "data") else 0
        except APIError as e:
            counts["parents"] = -1
            print(f"[COPPA] delete error on parents: {e}")
        return counts
