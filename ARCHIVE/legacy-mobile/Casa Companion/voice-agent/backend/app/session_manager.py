"""WebSocket session orchestration for the Casa Companion voice server."""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect

from .audio_pipeline import CartesiaTTSClient, DeepgramSTTClient, GroqLLMClient, TTSPipeline
from .coppa_layer import (
    ConsentError,
    DeviceNotFoundError,
    end_session,
    get_device_with_parent,
    record_session_start,
    require_consent,
    touch_session,
)
from .config import get_settings
from .prompt_router import PromptRouter


@dataclass
class SessionContext:
    device_id: str
    device: dict[str, Any]
    mode: Any
    system_prompt: str
    websocket: WebSocket
    deepgram: DeepgramSTTClient
    llm: GroqLLMClient
    tts_pipeline: TTSPipeline
    supabase: Any
    session_id: UUID
    manager: "SessionManager"

    state: str = "idle"  # idle | listening | thinking | speaking
    last_activity: float = field(default_factory=time.time)
    killed: bool = False
    battery: int | None = None
    messages: list[dict[str, str]] = field(default_factory=list)
    event_queues: list[asyncio.Queue[dict[str, Any]]] = field(default_factory=list)

    def touch(self):
        self.last_activity = time.time()

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

    async def broadcast_event(self, event: dict[str, Any]):
        """Push a sanitized event to dashboard SSE subscribers."""
        for q in list(self.event_queues):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def set_state(self, new_state: str):
        self.state = new_state
        await self.send_json({"type": "status", "state": new_state})
        await self.broadcast_event({
            "type": "status",
            "device_id": self.device_id,
            "state": new_state,
            "battery": self.battery,
            "timestamp": time.time(),
        })
        await touch_session(
            self.supabase,
            self.session_id,
            {"state": new_state, "battery": self.battery},
        )


class SessionManager:
    def __init__(self, supabase: Any, prompt_router: PromptRouter):
        self.supabase = supabase
        self.prompt_router = prompt_router
        self.settings = get_settings()
        self.sessions: dict[str, SessionContext] = {}
        self.deepgram_client_factory = lambda: DeepgramSTTClient(self.settings.deepgram_api_key)
        self.llm_client = GroqLLMClient(self.settings.groq_api_key)
        self.tts_client = CartesiaTTSClient(self.settings.cartesia_api_key)
        self.tts_pipeline = TTSPipeline(
            self.tts_client,
            self.prompt_router.chunk_for_tts,
            self.prompt_router.resolve_voice_id,
        )

    async def authenticate_device(self, device_id: str, token: str) -> dict[str, Any]:
        """Verify device exists and its api_key matches the supplied token."""
        device = await get_device_with_parent(self.supabase, device_id)
        if device.get("api_key") != token:
            raise PermissionError("Invalid device token")
        if not device.get("is_active", True):
            raise PermissionError("Device is deactivated")
        return device

    async def handle_connection(self, websocket: WebSocket, device_id: str, token: str):
        await websocket.accept()

        try:
            device = await self.authenticate_device(device_id, token)
            await require_consent(self.supabase, device_id)
        except (DeviceNotFoundError, PermissionError, ConsentError) as e:
            await websocket.send_json({"type": "error", "code": "auth", "message": str(e)})
            await websocket.close(code=4001)
            return

        character_id = device.get("character_id")
        mode_id = device.get("mode_id")
        mode = self.prompt_router.get_by_id(mode_id)
        system_prompt = self.prompt_router.format_system_prompt(mode, device)

        session_id = await record_session_start(
            self.supabase, device_id, self.settings.fly_machine_id
        )

        deepgram = self.deepgram_client_factory()
        await deepgram.start()

        ctx = SessionContext(
            device_id=device_id,
            device=device,
            mode=mode,
            system_prompt=system_prompt,
            websocket=websocket,
            deepgram=deepgram,
            llm=self.llm_client,
            tts_pipeline=self.tts_pipeline,
            supabase=self.supabase,
            session_id=session_id,
            manager=self,
            battery=device.get("battery"),
        )
        self.sessions[device_id] = ctx

        await ctx.set_state("idle")

        tasks = [
            asyncio.create_task(self._receive_loop(ctx)),
            asyncio.create_task(self._transcript_loop(ctx)),
            asyncio.create_task(self._timeout_guard(ctx)),
        ]

        try:
            await asyncio.gather(*tasks)
        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"[session {device_id}] error: {e}")
        finally:
            for t in tasks:
                t.cancel()
            await self._cleanup(ctx)

    async def _receive_loop(self, ctx: SessionContext):
        """Read binary audio and JSON control messages from the device."""
        try:
            while True:
                message = await ctx.websocket.receive()
                ctx.touch()

                if "bytes" in message:
                    await ctx.set_state("listening")
                    await ctx.deepgram.feed(message["bytes"])
                elif "text" in message:
                    await self._handle_control(ctx, json.loads(message["text"]))
                else:
                    break
        except WebSocketDisconnect:
            raise
        except Exception as e:
            print(f"[receive {ctx.device_id}] {e}")

    async def _handle_control(self, ctx: SessionContext, data: dict[str, Any]):
        msg_type = data.get("type")
        if msg_type == "ping":
            await ctx.send_json({"type": "pong", "ts": data.get("ts")})
        elif msg_type == "battery":
            ctx.battery = int(data.get("level", 0))
            if ctx.battery < 10:
                await ctx.send_json({"type": "command", "command": "sleep"})
            await ctx.broadcast_event({
                "type": "battery",
                "device_id": ctx.device_id,
                "battery": ctx.battery,
                "timestamp": time.time(),
            })
        elif msg_type == "medallion":
            # Allow a physical NFC medallion to switch character/mode mid-session.
            character_key = data.get("character_key")
            mode_key = data.get("mode_key")
            if character_key and mode_key:
                new_mode = ctx.manager.prompt_router.get_by_keys(character_key, mode_key)
                ctx.mode = new_mode
                ctx.system_prompt = ctx.manager.prompt_router.format_system_prompt(new_mode, ctx.device)
                await ctx.send_json({"type": "mode_changed", "mode": new_mode.name})
        elif msg_type == "pong":
            pass

    async def _transcript_loop(self, ctx: SessionContext):
        """Wait for finalized speech, generate a response, and stream audio back."""
        while True:
            transcript = await ctx.deepgram.final_transcript(timeout=5.0)
            if ctx.killed:
                return
            if not transcript:
                continue

            await ctx.set_state("thinking")
            ctx.messages.append({"role": "user", "content": transcript})

            try:
                answer = await ctx.llm.complete(ctx.messages, ctx.system_prompt)
            except Exception as e:
                print(f"[LLM {ctx.device_id}] {e}")
                answer = "I'm having trouble thinking right now. Let's try again."

            ctx.messages.append({"role": "assistant", "content": answer})

            await ctx.set_state("speaking")
            try:
                async for chunk in ctx.tts_pipeline.speak(answer, ctx.mode):
                    if ctx.killed:
                        break
                    await ctx.send_bytes(chunk)
            except Exception as e:
                print(f"[TTS {ctx.device_id}] {e}")
                await ctx.send_json({"type": "error", "code": "tts", "message": "TTS failed"})

            await ctx.set_state("idle")

    async def _timeout_guard(self, ctx: SessionContext):
        """Close the session after inactivity to keep the device battery alive."""
        while True:
            await asyncio.sleep(5)
            if ctx.killed:
                return
            if time.time() - ctx.last_activity > self.settings.session_timeout_seconds:
                await ctx.send_json({"type": "command", "command": "timeout"})
                await ctx.websocket.close(code=4000)
                return

    async def _cleanup(self, ctx: SessionContext):
        ctx.killed = True
        self.sessions.pop(ctx.device_id, None)
        try:
            await ctx.deepgram.stop()
        except Exception:
            pass
        await end_session(ctx.supabase, ctx.session_id)
        await ctx.broadcast_event({
            "type": "disconnected",
            "device_id": ctx.device_id,
            "timestamp": time.time(),
        })

    async def kill_session(self, device_id: str):
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
