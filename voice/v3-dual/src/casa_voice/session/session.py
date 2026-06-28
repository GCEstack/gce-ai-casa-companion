"""Casa Voice V2/V3 — Session Manager (Wake Phrase + Dual-Mode)

Interaction Model:
- IDLE: Audio-capable clients stream mic audio continuously.
- Server detects wake phrase ("Hello", "Hey", "Wake up", "Wake") → LISTENING.
- User speaks → server collects audio until silence (800 ms).
- PROCESSING: STT → command/LLM pipeline.
- SPEAKING: TTS streaming. INTERRUPT command (Space/avatar/button) cuts it off.
- After SPEAKING → return to IDLE (not LISTENING).

Multi-client support:
- A session can have multiple clients: audio devices and dashboards.
- Audio clients receive binary TTS PCM and hardware-related commands.
- Dashboard clients receive transcripts and state changes.
- Commands from any client affect the shared session state.
"""

import os
import time
import uuid
import asyncio
import logging
from typing import Optional, Callable, Dict, List, Awaitable

from ..protocol import VoiceMessage, MessageType, VoiceState, CommandType
from ..providers import VoiceProviders, DEFAULT_LLM
from ..persistence import SessionStore
from ..wakeword import create_wake_word_detector
from ..story_queue import StoryQueue
from ..filler_generator import filler_generator
from .audio_buffer import AudioBuffer
from .client import ClientHandle

logger = logging.getLogger(__name__)


class VoiceSession:
    def __init__(
        self,
        session_id: str,
        providers: VoiceProviders,
        character: str = "default",
        mode: str = "default",
        store: Optional[SessionStore] = None,
    ):
        self.session_id = session_id
        self.providers = providers
        self.character = character
        self.mode = mode
        self.volume = 1.0
        self.store = store

        self.clients: Dict[str, ClientHandle] = {}
        self.input_buffer = AudioBuffer(max_seconds=10.0)
        self.vad_buffer = AudioBuffer(max_seconds=2.0)

        self._input_task: Optional[asyncio.Task] = None
        self._vad_task: Optional[asyncio.Task] = None

        self._speaking = asyncio.Event()
        self._interrupted = asyncio.Event()
        self._lock = asyncio.Lock()
        self._wake_event = asyncio.Event()
        self._manual_stop = False

        self._conversation_history: list = []
        self._interests: Dict[str, List[str]] = {}
        self._story_queue = StoryQueue(self.providers.llm, character=self.character)
        self._current_utterance: str = ""
        self._pending_utterance: str = ""
        self._pending_audio: bytes = b""
        self._utterance_start_time: float = 0.0
        self._native_history: list = []  # text-only context for native audio quick-chat mode
        self._current_request_id: Optional[str] = None  # per-turn tracing ID

        # Must be set last so the setter has access to _wake_event.
        self.state = VoiceState.IDLE

        # Tuning: shorter timeouts = snappier responses, but too short clips speech.
        self.wake_max_seconds = float(os.environ.get("WAKE_MAX_SECONDS", "1.5"))
        self.wake_silence_ms = int(os.environ.get("WAKE_SILENCE_MS", "200"))
        self.command_silence_ms = int(os.environ.get("COMMAND_SILENCE_MS", "250"))
        self.command_max_seconds = float(os.environ.get("COMMAND_MAX_SECONDS", "10.0"))

        # Real wake-word engine. Falls back to STT-based detection if disabled or unavailable.
        try:
            self.wake_word_detector = create_wake_word_detector()
        except Exception as e:
            logger.warning(f"Wake-word detector failed to load, falling back to STT: {e}")
            self.wake_word_detector = None

    @property
    def state(self) -> VoiceState:
        return self._state

    @state.setter
    def state(self, value: VoiceState) -> None:
        self._state = value
        self._wake_event.set()

    def _new_request_id(self) -> str:
        """Start a new per-turn request ID for tracing."""
        self._current_request_id = uuid.uuid4().hex[:12]
        return self._current_request_id

    def _clear_request_id(self):
        self._current_request_id = None

    @property
    def _ctx(self) -> str:
        """Log prefix including session and current request ID."""
        rid = self._current_request_id or "-"
        return f"[{self.session_id}/{rid}]"

    # ── Client management ───────────────────────────────────────────────────────

    def add_client(self, client: ClientHandle):
        self.clients[client.device_id] = client
        logger.info(f"[{self.session_id}] Client added: {client.device_id} ({client.device_type})")

        async def _notify_new_client():
            try:
                # Let the new client know the current state immediately
                await self._notify_client(client, VoiceMessage.state_change(self.state))
                # Catch the new client up on existing devices (so dashboards see audio devices)
                for existing in self.clients.values():
                    if existing.device_id != client.device_id:
                        await self._notify_client(
                            client,
                            VoiceMessage.device_connected(existing.device_id, existing.device_type),
                        )
                # Notify other clients that a new device joined
                await self._broadcast(
                    VoiceMessage.device_connected(client.device_id, client.device_type),
                    exclude_device_id=client.device_id,
                )
            except Exception as e:
                logger.error(f"[{self.session_id}] Error notifying new client {client.device_id}: {e}")

        asyncio.create_task(_notify_new_client())

    def remove_client(self, device_id: str):
        client = self.clients.get(device_id)
        if client:
            del self.clients[device_id]
            logger.info(f"[{self.session_id}] Client removed: {device_id}")

            async def _notify_disconnect():
                try:
                    await self._broadcast(
                        VoiceMessage.device_disconnected(device_id, client.device_type)
                    )
                except Exception as e:
                    logger.error(f"[{self.session_id}] Error broadcasting disconnect: {e}")

            asyncio.create_task(_notify_disconnect())

    @property
    def has_audio_client(self) -> bool:
        return any(c.is_audio for c in self.clients.values())

    @property
    def has_dashboard_client(self) -> bool:
        return any(c.is_dashboard for c in self.clients.values())

    @property
    def is_empty(self) -> bool:
        return len(self.clients) == 0

    # ── Broadcasting ────────────────────────────────────────────────────────────

    async def _broadcast(self, msg: VoiceMessage, exclude_device_id: Optional[str] = None):
        """Send a message to all appropriate clients."""
        if msg.binary:
            # Binary TTS audio goes only to audio-capable clients
            targets = [c for c in self.clients.values() if c.is_audio]
        else:
            # State changes, commands, errors, transcripts, device presence go to everyone
            targets = list(self.clients.values())

        if exclude_device_id:
            targets = [c for c in targets if c.device_id != exclude_device_id]

        if not targets:
            return

        await asyncio.gather(
            *[self._notify_client(c, msg) for c in targets],
            return_exceptions=True,
        )

    async def _notify_client(self, client: ClientHandle, msg: VoiceMessage):
        try:
            await client.send(msg)
        except Exception as e:
            logger.warning(
                f"[{self.session_id}] Failed to send to {client.device_id}: {e}; removing client"
            )
            self.remove_client(client.device_id)
            return

        # Also enqueue non-binary messages for SSE listeners
        if not msg.binary:
            try:
                client.events.put_nowait(msg.to_json())
            except asyncio.QueueFull:
                logger.warning(f"[{self.session_id}] SSE event queue full for {client.device_id}")

    async def start(self):
        self.state = VoiceState.IDLE
        if self.store:
            record = await self.store.load(self.session_id)
            if record:
                self._conversation_history = record.get("conversation_history") or []
                self._interests = (record.get("kid_profile") or {}).get("interests") or {}
                self.character = record.get("character", self.character)
                self.mode = record.get("mode", self.mode)
                logger.info(
                    f"Session {self.session_id} loaded from store: "
                    f"{len(self._conversation_history)} turns, character={self.character}, "
                    f"interests={sum(len(v) for v in self._interests.values())} items"
                )
        self._input_task = asyncio.create_task(self._input_loop())
        self._vad_task = asyncio.create_task(self._vad_loop())
        logger.info(f"Session {self.session_id} started (IDLE)")

    async def stop(self):
        if self._input_task:
            self._input_task.cancel()
        if self._vad_task:
            self._vad_task.cancel()
        try:
            await asyncio.gather(self._input_task, self._vad_task, return_exceptions=True)
        except Exception:
            pass
        logger.info(f"Session {self.session_id} stopped")

    # ── Message handlers ────────────────────────────────────────────────────────

    async def handle_audio(self, pcm: bytes):
        self.input_buffer.append(pcm)
        self.vad_buffer.append(pcm)
        self._wake_event.set()

    async def handle_text_input(self, text: str):
        """Process typed text from dashboard/mobile clients as if it were a transcript."""
        text = text.strip()
        if not text:
            return
        self._new_request_id()
        logger.info(f"{self._ctx} TEXT_INPUT: '{text}'")

        # Wake the session if it's dormant, then process the text immediately.
        if self.state == VoiceState.IDLE:
            await self._broadcast(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))
            await self._broadcast(VoiceMessage.state_change(VoiceState.LISTENING))
        elif self.state == VoiceState.SPEAKING:
            await self._trigger_interrupt()

        await self._broadcast(VoiceMessage.transcript(text))
        await self._process_text_turn(text)

    async def _process_text_turn(self, text: str):
        """Run the same pipeline used for voice transcripts on typed text."""
        # Fast-path trigger responses.
        trigger_reply = self.providers.commands.trigger_responder.match(text)
        if trigger_reply:
            await self._process_and_speak(trigger_reply, skip_history=True)
            return

        # Voice echo.
        echo = self.providers.commands.echo_responder.match(text)
        if echo:
            await self._echo_and_learn(text, echo)
            return

        # Story mode continuation.
        if self.mode == "story" and self._story_queue.is_continuation(text):
            segment = self._story_queue.next()
            if segment:
                self._conversation_history.append({"role": "user", "content": text})
                self._conversation_history.append({"role": "assistant", "content": segment})
                if self.store:
                    await self.store.save(
                        self.session_id,
                        self._conversation_history,
                        character=self.character,
                        mode=self.mode,
                        kid_profile={"interests": self._interests},
                    )
                if self.providers.llm:
                    asyncio.create_task(self._story_queue.prefill(self._interests))
                await self._speak(segment)
                return

        cmd_result = self.providers.commands.classifier.classify(text)
        if cmd_result.is_command:
            handled = await self._handle_command_in_transcript(cmd_result, text)
            if handled:
                return

        await self._process_and_speak(text)

    async def handle_config_change(
        self,
        character: Optional[str] = None,
        mode: Optional[str] = None,
        volume: Optional[float] = None,
    ):
        old_mode = self.mode
        if character:
            self.character = character
            self._story_queue.set_character(character)
        if mode:
            self.mode = mode
        if volume is not None:
            self.volume = max(0.0, min(1.0, volume))

        # Story queue is only valid while in story mode.
        if old_mode == "story" and self.mode != "story":
            self._story_queue.clear()

        logger.info(
            f"[{self.session_id}] Config changed: character={self.character}, "
            f"mode={self.mode}, volume={self.volume:.2f}"
        )
        await self._broadcast(
            VoiceMessage.config_change(
                character=self.character,
                mode=self.mode,
                volume=round(self.volume, 2),
            )
        )
        if self.store:
            await self.store.save(
                self.session_id,
                self._conversation_history,
                character=self.character,
                mode=self.mode,
            )

    # ── Core loops ──────────────────────────────────────────────────────────────

    async def _input_loop(self):
        while True:
            try:
                if self.state == VoiceState.IDLE:
                    woke = await self._wait_for_wake()
                    if not woke:
                        continue
                    # Wake detector (Porcupine/STT) already broadcast WAKE_DETECTED.
                    # Move to the explicit transition step below.
                    continue

                if self.state == VoiceState.WAKE_DETECTED:
                    async with self._lock:
                        self.state = VoiceState.LISTENING
                        self._utterance_start_time = time.perf_counter()
                        await self._broadcast(VoiceMessage.state_change(VoiceState.LISTENING))
                    continue

                if self.state == VoiceState.LISTENING:
                    # If the wake phrase carried a trailing command, use it immediately.
                    if self._pending_utterance:
                        transcript = self._pending_utterance
                        self._pending_utterance = ""
                        logger.info(f"[{self.session_id}] LISTENING: using pending utterance '{transcript}'")
                    else:
                        audio = self._pending_audio
                        self._pending_audio = b""
                        audio += await self._collect_utterance()
                        logger.info(f"[{self.session_id}] LISTENING: collected {len(audio)} bytes")
                        if not audio:
                            await self._return_to_idle()
                            continue

                        # Quick Chat mode: bypass STT/LLM/TTS pipeline and use native audio -> audio.
                        if self.mode == "quick_chat" and self.providers.native_audio is not None:
                            logger.info(f"{self._ctx} LISTENING: quick-chat native audio ({len(audio)} bytes)")
                            await self._process_native_audio(audio)
                            continue

                        logger.info(f"{self._ctx} LISTENING: sending {len(audio)} bytes to STT")
                        t0 = time.perf_counter()
                        transcript = await self.providers.stt.transcribe(audio)
                        logger.info(f"{self._ctx} LISTENING: STT took {(time.perf_counter() - t0):.2f}s -> '{transcript}'")
                        if not transcript:
                            await self._return_to_idle()
                            continue

                    # Safety net: strip any wake-phrase leakage from the transcript.
                    transcript = self.providers.commands.classifier.strip_wake_phrase(transcript)
                    if not transcript:
                        await self._return_to_idle()
                        continue

                    await self._broadcast(VoiceMessage.transcript(transcript))

                    # Fast-path trigger responses — zero LLM latency for common phrases.
                    trigger_reply = self.providers.commands.trigger_responder.match(transcript)
                    if trigger_reply:
                        logger.info(f"{self._ctx} Trigger response matched for '{transcript}'")
                        await self._process_and_speak(trigger_reply, skip_history=True)
                        continue

                    # Voice echo: fast acknowledgement + learn interests from keywords.
                    echo = self.providers.commands.echo_responder.match(transcript)
                    if echo:
                        logger.info(
                            f"{self._ctx} Voice echo matched for '{transcript}': {echo.interests}"
                        )
                        await self._echo_and_learn(transcript, echo)
                        continue

                    # Story mode: answer "what happens next?" instantly from the pre-generated queue.
                    if self.mode == "story" and self._story_queue.is_continuation(transcript):
                        segment = self._story_queue.next()
                        if segment:
                            logger.info(f"{self._ctx} Story queue segment: '{segment}'")
                            self._conversation_history.append({"role": "user", "content": transcript})
                            self._conversation_history.append({"role": "assistant", "content": segment})
                            if self.store:
                                await self.store.save(
                                    self.session_id,
                                    self._conversation_history,
                                    character=self.character,
                                    mode=self.mode,
                                    kid_profile={"interests": self._interests},
                                )
                            # Top up the queue in the background while speaking.
                            if self.providers.llm:
                                asyncio.create_task(self._story_queue.prefill(self._interests))
                            await self._speak(segment)
                            continue
                        logger.info(f"{self._ctx} Story continuation requested but queue empty")

                    cmd_result = self.providers.commands.classifier.classify(transcript)
                    if cmd_result.is_command:
                        logger.info(f"{self._ctx} Command classified: {cmd_result.command.value}")
                        handled = await self._handle_command_in_transcript(cmd_result, transcript)
                        if handled:
                            continue

                    await self._process_and_speak(transcript)
                    continue

                if self.state == VoiceState.SPEAKING:
                    # _speaking is set while audio is playing. asyncio.Event.wait()
                    # returns immediately when already set, so we must yield manually
                    # to avoid starving the event loop (and TTS network I/O).
                    if self._speaking.is_set():
                        await asyncio.sleep(0.05)
                    continue

                if self.state == VoiceState.INTERRUPTED:
                    await self._return_to_idle()
                    continue

                if self.state == VoiceState.PROCESSING:
                    await asyncio.sleep(0.05)
                    continue

                await asyncio.sleep(0.05)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Input loop error: {e}", exc_info=True)
                await self._return_to_idle()

    async def _vad_loop(self):
        while True:
            try:
                await asyncio.sleep(0.05)

                if self.state != VoiceState.SPEAKING:
                    continue

                # Don't discard audio until we have enough for VAD.
                if len(self.vad_buffer) < 3200:
                    continue

                audio = self.vad_buffer.get_and_clear()
                logger.debug(f"[{self.session_id}] VAD loop checking {len(audio)} bytes")
                if await self.providers.vad.detect_speech(audio):
                    logger.info(f"[{self.session_id}] Barge-in speech detected, transcribing...")
                    transcript = await self.providers.stt.transcribe(audio)
                    logger.info(f"[{self.session_id}] Barge-in transcript: '{transcript}'")
                    if transcript:
                        cmd_result = self.providers.commands.classifier.classify(transcript)
                        if cmd_result.is_command and cmd_result.command in (
                            CommandType.INTERRUPT, CommandType.STOP
                        ):
                            logger.info(f"Barge-in: {cmd_result.command.value}")
                            await self._trigger_interrupt()
                        else:
                            logger.info(f"Barge-in: user talking ('{transcript}')")
                            await self._trigger_interrupt()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"VAD loop error: {e}", exc_info=True)

    # ── Helpers ─────────────────────────────────────────────────────────────────

    async def _trigger_interrupt(self):
        self._interrupted.set()
        await self._broadcast(VoiceMessage.interrupt_ack())
        async with self._lock:
            self.state = VoiceState.INTERRUPTED

    async def _trigger_reset(self):
        logger.info(f"Session {self.session_id} reset")
        self._conversation_history.clear()
        self._native_history.clear()
        self._interests.clear()
        self._story_queue.clear()
        self._current_utterance = ""
        self.input_buffer.get_and_clear()
        self.vad_buffer.get_and_clear()
        if self.store:
            await self.store.save(
                self.session_id,
                self._conversation_history,
                character=self.character,
                mode=self.mode,
                kid_profile={"interests": self._interests},
            )
        await self._return_to_idle()

    async def _return_to_idle(self):
        async with self._lock:
            self.state = VoiceState.IDLE
            self._interrupted.clear()
            self._manual_stop = False
            self._current_utterance = ""
            self._clear_request_id()
            await self._broadcast(VoiceMessage.state_change(VoiceState.IDLE))
            logger.info(f"[{self.session_id}] → IDLE")

    async def _collect_utterance(self) -> bytes:
        audio = self.input_buffer.get_and_clear()
        silence_frames = 0
        max_frames = int(self.command_max_seconds * 1000 / 50)
        silence_limit = max(1, self.command_silence_ms // 50)

        for _ in range(max_frames):
            self._wake_event.clear()
            try:
                await asyncio.wait_for(self._wake_event.wait(), timeout=0.05)
            except asyncio.TimeoutError:
                pass

            # Manual push-to-talk stop: finish collecting immediately.
            if self._manual_stop:
                logger.info(f"[{self.session_id}] LISTENING: manual stop, collected {len(audio)} bytes")
                break

            chunk = self.input_buffer.get_and_clear()
            if not chunk:
                silence_frames += 1
            else:
                audio += chunk
                silence_frames = 0

            if silence_frames >= silence_limit:
                break

        return audio


# Attach method implementations split out into focused submodules.
from . import wake, streaming, native_turn, speech, commands

VoiceSession._wait_for_wake = wake._wait_for_wake
VoiceSession._wait_for_wake_porcupine = wake._wait_for_wake_porcupine
VoiceSession._wait_for_wake_stt = wake._wait_for_wake_stt
VoiceSession._collect_short_utterance = wake._collect_short_utterance
VoiceSession._process_and_speak_streaming = streaming._process_and_speak_streaming
VoiceSession._process_native_audio = native_turn._process_native_audio
VoiceSession._process_and_speak = speech._process_and_speak
VoiceSession._echo_and_learn = speech._echo_and_learn
VoiceSession._run_scene = speech._run_scene
VoiceSession._speak = speech._speak
VoiceSession._call_llm = speech._call_llm
VoiceSession._build_system_prompt = speech._build_system_prompt
VoiceSession.handle_command = commands.handle_command
VoiceSession._handle_command_in_transcript = commands._handle_command_in_transcript
