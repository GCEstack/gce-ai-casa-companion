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
import re
import time
import asyncio
import logging
from typing import Optional, Callable, Dict, List, Awaitable
from dataclasses import dataclass, field

import numpy as np

from .protocol import VoiceMessage, MessageType, VoiceState, CommandType
from .providers import VoiceProviders, DEFAULT_LLM
from .persistence import SessionStore
from .wakeword import create_wake_word_detector
from .story_queue import StoryQueue

logger = logging.getLogger(__name__)


@dataclass
class AudioBuffer:
    max_seconds: float = 30.0
    sample_rate: int = 16000
    _data: bytearray = field(default_factory=bytearray)

    def append(self, pcm: bytes):
        self._data.extend(pcm)
        max_bytes = int(self.max_seconds * self.sample_rate * 2)
        if len(self._data) > max_bytes:
            self._data = self._data[-max_bytes:]

    def get_and_clear(self) -> bytes:
        data = bytes(self._data)
        self._data.clear()
        return data

    def __len__(self):
        return len(self._data)


@dataclass
class ClientHandle:
    """A single WebSocket connection attached to a session."""

    device_id: str
    device_type: str  # "audio" or "dashboard"
    send: Callable[[VoiceMessage], Awaitable[None]]
    events: asyncio.Queue = field(default_factory=asyncio.Queue)

    @property
    def is_audio(self) -> bool:
        return self.device_type == "audio"

    @property
    def is_dashboard(self) -> bool:
        return self.device_type == "dashboard"

    async def get_event(self, timeout: Optional[float] = None):
        """Get the next SSE event, or None on timeout."""
        try:
            return await asyncio.wait_for(self.events.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None


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
        self.state = VoiceState.IDLE

        self.clients: Dict[str, ClientHandle] = {}
        self.input_buffer = AudioBuffer(max_seconds=10.0)
        self.vad_buffer = AudioBuffer(max_seconds=2.0)

        self._input_task: Optional[asyncio.Task] = None
        self._vad_task: Optional[asyncio.Task] = None

        self._speaking = asyncio.Event()
        self._interrupted = asyncio.Event()
        self._lock = asyncio.Lock()

        self._conversation_history: list = []
        self._interests: Dict[str, List[str]] = {}
        self._story_queue = StoryQueue(self.providers.llm, character=self.character)
        self._current_utterance: str = ""
        self._pending_utterance: str = ""
        self._pending_audio: bytes = b""
        self._utterance_start_time: float = 0.0
        self._native_history: list = []  # text-only context for native audio quick-chat mode

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
            logger.warning(f"[{self.session_id}] Failed to send to {client.device_id}: {e}")

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

    async def handle_command(self, cmd: CommandType):
        if cmd == CommandType.INTERRUPT or cmd == CommandType.STOP:
            await self._trigger_interrupt()
        elif cmd == CommandType.RESET:
            await self._trigger_reset()
        elif cmd == CommandType.WAKE:
            if self.state == VoiceState.IDLE:
                async with self._lock:
                    self.state = VoiceState.WAKE_DETECTED
                    await self._broadcast(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))
        elif cmd == CommandType.LOUDER or cmd == CommandType.VOLUME_UP:
            await self.handle_config_change(volume=self.volume + 0.1)
        elif cmd == CommandType.SOFTER or cmd == CommandType.VOLUME_DOWN:
            await self.handle_config_change(volume=self.volume - 0.1)
        elif cmd == CommandType.CHARACTER_DRAGO:
            await self.handle_config_change(character="drago")
        elif cmd == CommandType.CHARACTER_LIAM:
            await self.handle_config_change(character="liam")
        elif cmd == CommandType.CHARACTER_JENNY:
            await self.handle_config_change(character="jenny")
        elif cmd == CommandType.CHARACTER_DEFAULT:
            await self.handle_config_change(character="default")
        elif cmd == CommandType.SCENE_BEDTIME:
            await self._run_scene("bedtime")
        elif cmd == CommandType.SCENE_GREETING:
            await self._run_scene("greeting")
        elif cmd == CommandType.SCENE_JOKE:
            await self._run_scene("joke")

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
                            logger.info(f"[{self.session_id}] LISTENING: quick-chat native audio ({len(audio)} bytes)")
                            await self._process_native_audio(audio)
                            continue

                        logger.info(f"[{self.session_id}] LISTENING: sending {len(audio)} bytes to STT")
                        t0 = time.perf_counter()
                        transcript = await self.providers.stt.transcribe(audio)
                        logger.info(f"[{self.session_id}] LISTENING: STT took {(time.perf_counter() - t0):.2f}s -> '{transcript}'")
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
                        logger.info(f"[{self.session_id}] Trigger response matched for '{transcript}'")
                        await self._process_and_speak(trigger_reply, skip_history=True)
                        continue

                    # Voice echo: fast acknowledgement + learn interests from keywords.
                    echo = self.providers.commands.echo_responder.match(transcript)
                    if echo:
                        logger.info(
                            f"[{self.session_id}] Voice echo matched for '{transcript}': {echo.interests}"
                        )
                        await self._echo_and_learn(transcript, echo)
                        continue

                    # Story mode: answer "what happens next?" instantly from the pre-generated queue.
                    if self.mode == "story" and self._story_queue.is_continuation(transcript):
                        segment = self._story_queue.next()
                        if segment:
                            logger.info(f"[{self.session_id}] Story queue segment: '{segment}'")
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
                        logger.info(f"[{self.session_id}] Story continuation requested but queue empty")

                    cmd_result = self.providers.commands.classifier.classify(transcript)
                    if cmd_result.is_command:
                        handled = await self._handle_command_in_transcript(cmd_result, transcript)
                        if handled:
                            continue

                    await self._process_and_speak(transcript)
                    continue

                if self.state == VoiceState.SPEAKING:
                    await self._speaking.wait()
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

    async def _wait_for_wake(self) -> Optional[str]:
        logger.info(f"[{self.session_id}] IDLE: wake listener active")

        # Fast path: use the local wake-word engine if available.
        if self.wake_word_detector:
            return await self._wait_for_wake_porcupine()

        # Fallback: STT-based wake phrase detection.
        return await self._wait_for_wake_stt()

    async def _wait_for_wake_porcupine(self) -> Optional[str]:
        """Listen continuously and return as soon as Porcupine fires."""
        logger.info(f"[{self.session_id}] IDLE: Porcupine wake-word listener active")
        self.wake_word_detector.reset()
        detected_keyword = None
        wake_audio = bytearray()

        while not detected_keyword:
            await asyncio.sleep(0.05)

            # A manual wake command (e.g. push-to-talk button) can move us out of IDLE.
            if self.state != VoiceState.IDLE:
                logger.info(f"[{self.session_id}] IDLE: wake listener aborted by state change")
                return None

            # Feed raw audio to Porcupine. Also keep a copy so we can hand any
            # trailing audio (the command) straight to the listening phase.
            chunk = self.input_buffer.get_and_clear()
            if chunk:
                wake_audio.extend(chunk)
                detected_keyword = self.wake_word_detector.process(chunk)

        logger.info(f"[{self.session_id}] IDLE: Porcupine detected '{detected_keyword}'")
        await self._broadcast(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))

        # The audio already captured after the wake word is likely the start of
        # the command. Keep it for the listening phase.
        if len(wake_audio) > 0:
            self._pending_audio = bytes(wake_audio)
            logger.info(f"[{self.session_id}] IDLE: carrying over {len(self._pending_audio)} bytes of audio")

        return detected_keyword

    async def _wait_for_wake_stt(self) -> Optional[str]:
        """Legacy STT-based wake phrase detection."""
        logger.info(f"[{self.session_id}] IDLE: STT-based wake listener active")
        while True:
            await asyncio.sleep(0.05)

            # A manual wake command (e.g. push-to-talk button) can move us out of IDLE.
            if self.state != VoiceState.IDLE:
                logger.info(f"[{self.session_id}] IDLE: STT wake listener aborted by state change")
                return None

            # Don't discard audio until we have enough for VAD.
            if len(self.vad_buffer) < 3200:
                continue

            audio = self.vad_buffer.get_and_clear()
            arr = np.frombuffer(audio, dtype=np.int16)
            mean_abs = float(np.mean(np.abs(arr))) / 32768.0 if arr.size else 0.0
            peak = float(np.max(np.abs(arr))) / 32768.0 if arr.size else 0.0
            logger.info(
                f"[{self.session_id}] IDLE: checking {len(audio)} bytes "
                f"mean={mean_abs:.5f} peak={peak:.5f}"
            )
            try:
                speech = await self.providers.vad.detect_speech(audio)
            except Exception as e:
                logger.error(f"[{self.session_id}] IDLE: VAD error: {e}", exc_info=True)
                continue
            if not speech:
                continue

            logger.info(f"[{self.session_id}] IDLE: speech detected, collecting utterance for wake phrase")
            short_audio = await self._collect_short_utterance()
            if not short_audio:
                logger.debug(f"[{self.session_id}] IDLE: no utterance collected")
                continue

            logger.info(f"[{self.session_id}] IDLE: transcribing {len(short_audio)} bytes")
            t0 = time.perf_counter()
            transcript = await self.providers.stt.transcribe(short_audio)
            logger.info(f"[{self.session_id}] IDLE: STT took {(time.perf_counter() - t0):.2f}s -> '{transcript}'")
            if not transcript:
                continue

            cmd_result = self.providers.commands.classifier.classify(transcript)
            if cmd_result.is_command and cmd_result.command == CommandType.WAKE:
                logger.info(f"Wake phrase: '{cmd_result.matched_phrase}'")
                await self._broadcast(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))

                # Use the last matched wake phrase as the cut-off point so we don't
                # send the junk that came before it to the LLM.
                matched = cmd_result.matched_phrase.lower()
                idx = transcript.lower().rfind(matched)
                if idx != -1:
                    trailing = transcript[idx + len(matched) :]
                else:
                    trailing = transcript
                trailing = self.providers.commands.classifier.strip_wake_phrase(trailing)
                if trailing:
                    logger.info(f"[{self.session_id}] IDLE: carrying over '{trailing}'")
                    self._pending_utterance = trailing

                # Discard any audio that arrived while we were running STT so the
                # next listening phase doesn't re-transcribe the wake phrase.
                self.input_buffer.get_and_clear()
                return cmd_result.matched_phrase

            logger.info(f"[{self.session_id}] IDLE: ignored '{transcript}'")
            self.input_buffer.get_and_clear()

    async def _collect_short_utterance(self) -> bytes:
        audio = self.input_buffer.get_and_clear()
        silence_frames = 0
        max_frames = int(self.wake_max_seconds * 1000 / 50)
        silence_limit = max(1, self.wake_silence_ms // 50)

        for _ in range(max_frames):
            await asyncio.sleep(0.05)
            chunk = self.input_buffer.get_and_clear()
            if not chunk:
                silence_frames += 1
            else:
                audio += chunk
                silence_frames = 0

            if silence_frames >= silence_limit:
                break

        return audio

    async def _handle_command_in_transcript(self, cmd_result, transcript: str) -> bool:
        cmd = cmd_result.command

        if cmd == CommandType.INTERRUPT or cmd == CommandType.STOP:
            await self._trigger_interrupt()
            return True

        if cmd == CommandType.RESET:
            await self._trigger_reset()
            return True

        if cmd == CommandType.WAKE:
            await self._broadcast(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))
            return True

        if cmd == CommandType.LOUDER:
            await self.handle_config_change(volume=self.volume + 0.1)
            return True

        if cmd == CommandType.SOFTER:
            await self.handle_config_change(volume=self.volume - 0.1)
            return True

        if cmd == CommandType.VOLUME_UP:
            await self.handle_config_change(volume=self.volume + 0.1)
            return True

        if cmd == CommandType.VOLUME_DOWN:
            await self.handle_config_change(volume=self.volume - 0.1)
            return True

        if cmd == CommandType.STORY_MODE:
            await self.handle_config_change(character="drago", mode="story")
            return True

        if cmd == CommandType.PLAY_MODE:
            await self.handle_config_change(character="liam", mode="play")
            return True

        if cmd in (
            CommandType.CHARACTER_DRAGO,
            CommandType.CHARACTER_LIAM,
            CommandType.CHARACTER_JENNY,
            CommandType.CHARACTER_DEFAULT,
        ):
            character = cmd.value.replace("character_", "")
            await self.handle_config_change(character=character)
            return True

        return False

    async def _process_and_speak(self, text: str, skip_history: bool = False):
        async with self._lock:
            self.state = VoiceState.PROCESSING
            await self._broadcast(VoiceMessage.state_change(VoiceState.PROCESSING))

        # Trigger responses are already final text — bypass LLM entirely.
        if skip_history:
            llm_response = text
            logger.info(f"[{self.session_id}] PROCESSING: trigger response (LLM skipped)")
        else:
            streaming_enabled = os.environ.get("STREAMING_TTS_ENABLED", "1").strip().lower() not in (
                "0",
                "false",
                "no",
            )
            if (
                streaming_enabled
                and self.providers.llm is not None
                and hasattr(self.providers.llm, "chat_stream")
            ):
                return await self._process_and_speak_streaming(text)

            # Compress long transcripts to keywords to cut tokens and latency.
            llm_input = self.providers.commands.keyword_compressor.compress(text)
            logger.info(f"[{self.session_id}] PROCESSING: calling LLM for '{text}' (compressed: '{llm_input}')")
            t0 = time.perf_counter()
            llm_response = await self._call_llm(llm_input)
            t1 = time.perf_counter()
            logger.info(f"[{self.session_id}] PROCESSING: LLM took {(t1 - t0):.2f}s")
            logger.info(f"[{self.session_id}] PROCESSING: LLM response = '{llm_response[:120]}...'")

        if not llm_response:
            await self._return_to_idle()
            return

        if not skip_history:
            self._conversation_history.append({"role": "user", "content": text})
            self._conversation_history.append({"role": "assistant", "content": llm_response})

            if self.store:
                await self.store.save(
                    self.session_id,
                    self._conversation_history,
                    character=self.character,
                    mode=self.mode,
                )

        await self._speak(llm_response)

    async def _process_and_speak_streaming(self, text: str):
        """Stream LLM sentences to TTS as they arrive.

        Instead of waiting for the full LLM response, we split it into sentences
        and start TTS on the first sentence while the model is still generating
        the rest. This cuts the time-to-first-audio for fresh LLM responses.
        """
        # Compress long transcripts to keywords to cut tokens and latency.
        llm_input = self.providers.commands.keyword_compressor.compress(text)
        logger.info(f"[{self.session_id}] PROCESSING (streaming): calling LLM for '{text}' (compressed: '{llm_input}')")

        system_prompt = self._build_system_prompt()
        messages = [{"role": "system", "content": system_prompt}]
        for turn in self._conversation_history[-6:]:
            messages.append(turn)
        messages.append({"role": "user", "content": llm_input})

        full_response = ""
        sentence_queue: asyncio.Queue[Optional[str]] = asyncio.Queue()
        llm_done = asyncio.Event()
        tts_seq = 0
        first_audio = True

        async def llm_producer():
            nonlocal full_response
            buffer = ""
            try:
                async for chunk in self.providers.llm.chat_stream(
                    messages=messages,
                    temperature=0.8,
                    max_tokens=150,
                ):
                    if self._interrupted.is_set():
                        break
                    buffer += chunk
                    full_response += chunk

                    # Flush complete sentences to the TTS queue.
                    while True:
                        match = re.search(r"(?<=[.!?])\s+", buffer)
                        if not match:
                            break
                        sentence = buffer[: match.start()]
                        buffer = buffer[match.end() :]
                        if sentence.strip():
                            await sentence_queue.put(sentence.strip())

                if buffer.strip() and not self._interrupted.is_set():
                    await sentence_queue.put(buffer.strip())
            except Exception as e:
                logger.error(f"[{self.session_id}] LLM stream error: {e}", exc_info=True)
            finally:
                await sentence_queue.put(None)
                llm_done.set()

        async def tts_consumer():
            nonlocal tts_seq, first_audio
            try:
                while True:
                    sentence = await sentence_queue.get()
                    if sentence is None:
                        break
                    if self._interrupted.is_set():
                        break

                    if first_audio:
                        first_audio = False
                        async with self._lock:
                            self.state = VoiceState.SPEAKING
                            await self._broadcast(VoiceMessage.state_change(VoiceState.SPEAKING))
                            self._speaking.set()
                            self._interrupted.clear()
                            self.input_buffer.get_and_clear()
                            self.vad_buffer.get_and_clear()

                    logger.info(f"[{self.session_id}] TTS streaming sentence ({len(sentence)} chars)")
                    async for chunk in self.providers.tts.synthesize_stream(sentence, self.character, self.mode):
                        if self._interrupted.is_set():
                            break
                        await self._broadcast(VoiceMessage.tts_chunk(chunk, sequence=tts_seq))
                        tts_seq += 1

                    if self._interrupted.is_set():
                        break
            except Exception as e:
                logger.error(f"[{self.session_id}] TTS streaming error: {e}", exc_info=True)

        try:
            await asyncio.gather(llm_producer(), tts_consumer())
        except Exception as e:
            logger.error(f"[{self.session_id}] Streaming pipeline error: {e}", exc_info=True)

        self._speaking.clear()

        # Persist the complete exchange.
        if full_response.strip():
            await self._broadcast(VoiceMessage.assistant_text(full_response.strip()))
            self._conversation_history.append({"role": "user", "content": text})
            self._conversation_history.append({"role": "assistant", "content": full_response.strip()})
            if self.store:
                await self.store.save(
                    self.session_id,
                    self._conversation_history,
                    character=self.character,
                    mode=self.mode,
                )

        await self._return_to_idle()

    async def _process_native_audio(self, audio_buffer: bytes):
        """Quick Chat mode: one native audio -> audio call via OpenRouter.

        Bypasses STT, LLM, and TTS. Streams assistant text to dashboards and PCM
        audio to audio clients as chunks arrive. The model's transcript of the
        user's audio is used as the visible user transcript.
        """
        async with self._lock:
            self.state = VoiceState.PROCESSING
            await self._broadcast(VoiceMessage.state_change(VoiceState.PROCESSING))

        system_prompt = self._build_system_prompt()
        full_assistant_text = ""
        user_transcript = ""
        seq = 0
        first_text = True
        first_audio = True

        try:
            async for chunk in self.providers.native_audio.stream_turn(
                audio_pcm=audio_buffer,
                system_prompt=system_prompt,
                conversation_history=self._native_history,
            ):
                if self._interrupted.is_set():
                    logger.info("Native audio turn interrupted")
                    break

                chunk_type = chunk.get("type")

                if chunk_type == "text":
                    text_chunk = chunk.get("content", "")
                    full_assistant_text += text_chunk
                    if first_text:
                        first_text = False
                        await self._broadcast(VoiceMessage.assistant_text(full_assistant_text))

                elif chunk_type == "audio":
                    if first_audio:
                        first_audio = False
                        async with self._lock:
                            self.state = VoiceState.SPEAKING
                            await self._broadcast(VoiceMessage.state_change(VoiceState.SPEAKING))
                            self._speaking.set()
                            self._interrupted.clear()
                        if full_assistant_text:
                            await self._broadcast(VoiceMessage.assistant_text(full_assistant_text))
                    pcm = chunk.get("data", b"")
                    if pcm:
                        await self._broadcast(VoiceMessage.tts_chunk(pcm, sequence=seq))
                        seq += 1

                elif chunk_type == "user_transcript":
                    user_transcript = chunk.get("content", "")
                    await self._broadcast(VoiceMessage.transcript(user_transcript))

                elif chunk_type == "transcript":
                    # Final assistant transcript; prefer accumulated text.
                    final = chunk.get("content", "") or full_assistant_text
                    if final:
                        full_assistant_text = final

        except Exception as e:
            logger.error(f"[{self.session_id}] Native audio turn failed: {e}", exc_info=True)
            await self._broadcast(VoiceMessage.error("native_audio_failed", "Sorry, I had trouble hearing you. Try again!"))
        finally:
            self._speaking.clear()
            # Update native history for context across quick-chat turns.
            if user_transcript:
                self._native_history.append({"role": "user", "content": user_transcript})
            if full_assistant_text:
                self._native_history.append({"role": "assistant", "content": full_assistant_text})
            if len(self._native_history) > 40:
                self._native_history = self._native_history[-40:]
            await self._return_to_idle()

    async def _echo_and_learn(self, transcript: str, echo):
        """Fast echo response that also remembers what the kid cares about.

        This bypasses the LLM for speed, stores the utterance + echo in history,
        and merges extracted interests into the session profile so future LLM
        prompts can personalize responses.
        """
        # Merge newly extracted interests into the session profile.
        for category, items in echo.interests.items():
            existing = set(self._interests.get(category, []))
            existing.update(items)
            self._interests[category] = sorted(existing)

        # Remember the exchange so the LLM has context next turn.
        self._conversation_history.append({"role": "user", "content": transcript})
        self._conversation_history.append({"role": "assistant", "content": echo.echo_text})

        if self.store:
            await self.store.save(
                self.session_id,
                self._conversation_history,
                character=self.character,
                mode=self.mode,
                kid_profile={"interests": self._interests},
            )

        logger.info(f"[{self.session_id}] LEARNED interests: {self._interests}")

        # In story mode, start generating the next story segments in the background
        # so "what happens next?" can be answered instantly.
        if self.mode == "story" and self.providers.llm:
            asyncio.create_task(self._story_queue.prefill(self._interests))

        await self._speak(echo.echo_text)

    async def _run_scene(self, scene: str):
        """Trigger a scripted scene by sending a canned user prompt to the LLM."""
        prompts = {
            "bedtime": "Tell me a short, calming bedtime story.",
            "greeting": "Greet me in character and ask what I want to do today.",
            "joke": "Tell me a funny joke appropriate for a kid.",
        }
        prompt = prompts.get(scene, "Say something fun and in character.")
        logger.info(f"[{self.session_id}] Running scene: {scene}")
        await self._broadcast(VoiceMessage.transcript(f"[scene: {scene}]"))
        await self._process_and_speak(prompt)

    async def _speak(self, text: str):
        async with self._lock:
            self.state = VoiceState.SPEAKING
            await self._broadcast(VoiceMessage.state_change(VoiceState.SPEAKING))
            await self._broadcast(VoiceMessage.assistant_text(text))
            self._speaking.set()
            self._interrupted.clear()
            # Drop any leftover input audio so the VAD loop doesn't false-trigger
            # barge-in from audio that arrived before we started speaking.
            self.input_buffer.get_and_clear()
            self.vad_buffer.get_and_clear()

        logger.info(f"[{self.session_id}] SPEAKING: streaming TTS ({len(text)} chars)")
        t0 = time.perf_counter()
        seq = 0
        first_byte = True
        try:
            async for chunk in self.providers.tts.synthesize_stream(text, self.character, self.mode):
                if first_byte:
                    first_byte = False
                    tts_latency = time.perf_counter() - t0
                    total_latency = time.perf_counter() - self._utterance_start_time
                    logger.info(f"[{self.session_id}] SPEAKING: TTS first byte after {tts_latency:.2f}s (total {total_latency:.2f}s from wake)")
                if self._interrupted.is_set():
                    logger.info("TTS interrupted")
                    break
                msg = VoiceMessage.tts_chunk(chunk, sequence=seq)
                await self._broadcast(msg)
                seq += 1
            logger.info(f"[{self.session_id}] SPEAKING: streamed {seq} TTS chunks in {(time.perf_counter() - t0):.2f}s")
        except asyncio.CancelledError:
            logger.info("TTS cancelled")
        except Exception as e:
            logger.error(f"[{self.session_id}] TTS error: {e}", exc_info=True)
        finally:
            self._speaking.clear()
            if not self._interrupted.is_set():
                await self._return_to_idle()

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
            self._current_utterance = ""
            await self._broadcast(VoiceMessage.state_change(VoiceState.IDLE))
            logger.info(f"[{self.session_id}] → IDLE")

    async def _collect_utterance(self) -> bytes:
        audio = self.input_buffer.get_and_clear()
        silence_frames = 0
        max_frames = int(self.command_max_seconds * 1000 / 50)
        silence_limit = max(1, self.command_silence_ms // 50)

        for _ in range(max_frames):
            await asyncio.sleep(0.05)
            chunk = self.input_buffer.get_and_clear()
            if not chunk:
                silence_frames += 1
            else:
                audio += chunk
                silence_frames = 0

            if silence_frames >= silence_limit:
                break

        return audio

    def _build_system_prompt(self) -> str:
        parts = [
            f"You are {self.character}. Friendly companion for kids. "
            "Respond briefly (1-2 sentences). Be warm and fun."
        ]
        if self._interests:
            summary_parts = []
            for category in ("love", "like", "enjoy", "favorite", "dislike"):
                items = self._interests.get(category, [])
                if items:
                    summary_parts.append(f"{category}s: {', '.join(items)}")
            if summary_parts:
                parts.append(
                    "What you know about the kid so far: " + "; ".join(summary_parts) + "."
                )
        return " ".join(parts)

    async def _call_llm(self, transcript: str) -> str:
        system_prompt = self._build_system_prompt()

        messages = [{"role": "system", "content": system_prompt}]
        for turn in self._conversation_history[-6:]:
            messages.append(turn)
        messages.append({"role": "user", "content": transcript})

        try:
            if self.providers.llm:
                return await self.providers.llm.chat(
                    messages=messages,
                    temperature=0.8,
                    max_tokens=150,
                )

            # Fallback to OpenRouter direct call if no LLM provider is configured.
            import httpx
            from .providers import _get_openrouter_provider_routing

            llm_payload = {
                "model": os.environ.get("OPENROUTER_LLM_MODEL", DEFAULT_LLM),
                "messages": messages,
                "max_tokens": 150,
                "temperature": 0.8,
            }
            routing = _get_openrouter_provider_routing()
            if routing:
                llm_payload["provider"] = routing

            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.providers.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://casa-companion.io",
                        "X-Title": "Casa Companion Voice",
                    },
                    json=llm_payload,
                )
                if resp.status_code >= 400:
                    logger.error(f"[{self.session_id}] LLM error body: {resp.text}")
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error(f"[{self.session_id}] LLM call failed: {e}", exc_info=True)
            return "Sorry, my brain hiccuped. Can you try again?"
