"""Realtime API session wrapper that mimics VoiceSession for v3_manager.

This replaces the chained STT -> LLM -> TTS pipeline with a single OpenAI
Realtime speech-to-speech connection. It reuses the same client protocol so
existing frontends and dashboards work unchanged.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from .protocol import CommandType, VoiceMessage, VoiceState
from .realtime_bridge import RealtimeBridge
from .sessions import ClientHandle

logger = logging.getLogger(__name__)


class RealtimeSession:
    """Drop-in replacement for VoiceSession backed by OpenAI Realtime API."""

    def __init__(
        self,
        session_id: str,
        providers: Any,
        character: str = "default",
        mode: str = "default",
        store: Optional[Any] = None,
    ):
        self.session_id = session_id
        self.providers = providers  # unused, kept for API parity
        self.character = character
        self.mode = mode
        self.volume = 1.0
        self.store = store
        self.state = VoiceState.IDLE

        self.clients: Dict[str, ClientHandle] = {}
        self._bridge: Optional[RealtimeBridge] = None
        self._lock = asyncio.Lock()
        self._audio_sequence = 0

    # ── Client management ───────────────────────────────────────────────────────

    def add_client(self, client: ClientHandle):
        self.clients[client.device_id] = client
        logger.info(f"[{self.session_id}] Client added: {client.device_id} ({client.device_type})")

        async def _notify_new_client():
            try:
                await self._notify_client(client, VoiceMessage.state_change(self.state))
                for existing in self.clients.values():
                    if existing.device_id != client.device_id:
                        await self._notify_client(
                            client,
                            VoiceMessage.device_connected(existing.device_id, existing.device_type),
                        )
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
        if msg.binary:
            targets = [c for c in self.clients.values() if c.is_audio]
        else:
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

        if not msg.binary:
            try:
                client.events.put_nowait(msg.to_json())
            except asyncio.QueueFull:
                logger.warning(f"[{self.session_id}] SSE event queue full for {client.device_id}")

    # ── Lifecycle ───────────────────────────────────────────────────────────────

    async def start(self):
        self.state = VoiceState.IDLE
        self._bridge = RealtimeBridge(
            character_slug=self.character,
            client_send_callback=self._on_bridge_message,
            on_user_transcript=self._on_user_transcript,
        )
        await self._bridge.start()
        logger.info(f"RealtimeSession {self.session_id} started")

    async def stop(self):
        if self._bridge:
            await self._bridge.stop()
            self._bridge = None
        logger.info(f"RealtimeSession {self.session_id} stopped")

    # ── Message handlers ────────────────────────────────────────────────────────

    async def handle_audio(self, pcm: bytes):
        if not pcm or self._bridge is None:
            return
        await self._bridge.send_audio(pcm)

        # Barge-in: if the user starts talking while the model is speaking,
        # cancel the current response and move back to listening.
        if self.state == VoiceState.SPEAKING:
            await self._bridge.cancel_response()
            async with self._lock:
                self.state = VoiceState.LISTENING
                await self._broadcast(VoiceMessage.state_change(VoiceState.LISTENING))

    async def handle_text_input(self, text: str):
        if not text.strip():
            return
        text = text.strip()
        logger.info(f"[{self.session_id}] TEXT INPUT: '{text}'")

        if self._bridge is None:
            return

        if self.state == VoiceState.SPEAKING:
            await self._bridge.cancel_response()

        await self._bridge.send_text(text)

        async with self._lock:
            self.state = VoiceState.PROCESSING
            await self._broadcast(VoiceMessage.state_change(VoiceState.PROCESSING))
            await self._broadcast(VoiceMessage.transcript(text))

    async def handle_config_change(
        self,
        character: Optional[str] = None,
        mode: Optional[str] = None,
        volume: Optional[float] = None,
    ):
        old_mode = self.mode
        if character:
            self.character = character
        if mode:
            self.mode = mode
        if volume is not None:
            self.volume = max(0.0, min(1.0, volume))

        if old_mode == "story" and self.mode != "story":
            pass  # no story queue to clear in realtime mode

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
        if self._bridge:
            await self._bridge.update_session(self.character)

    async def handle_command(self, cmd: CommandType):
        if cmd in (CommandType.INTERRUPT, CommandType.STOP):
            if self._bridge:
                await self._bridge.cancel_response()
            async with self._lock:
                if self.state == VoiceState.SPEAKING:
                    self.state = VoiceState.IDLE
                    await self._broadcast(VoiceMessage.state_change(VoiceState.IDLE))

        elif cmd == CommandType.RESET:
            if self._bridge:
                await self._bridge.cancel_response()
            async with self._lock:
                self.state = VoiceState.IDLE
                await self._broadcast(VoiceMessage.state_change(VoiceState.IDLE))

        elif cmd in (CommandType.LOUDER, CommandType.VOLUME_UP):
            await self.handle_config_change(volume=self.volume + 0.1)
        elif cmd in (CommandType.SOFTER, CommandType.VOLUME_DOWN):
            await self.handle_config_change(volume=self.volume - 0.1)
        elif cmd in (
            CommandType.CHARACTER_DRAGO,
            CommandType.CHARACTER_LIAM,
            CommandType.CHARACTER_JENNY,
            CommandType.CHARACTER_DEFAULT,
        ):
            character = cmd.value.replace("character_", "")
            await self.handle_config_change(character=character)

    # ── Bridge callbacks ────────────────────────────────────────────────────────

    async def _on_user_transcript(self, transcript: str):
        # Dashboard/transcript events are emitted by _on_bridge_message; this hook
        # is available for persistence or logging if needed.
        logger.info(f"[{self.session_id}] User transcript: '{transcript}'")

    async def _on_bridge_message(self, msg: dict):
        if "binary" in msg:
            pcm = msg["binary"]
            async with self._lock:
                if self.state != VoiceState.SPEAKING:
                    self.state = VoiceState.SPEAKING
                    await self._broadcast(VoiceMessage.state_change(VoiceState.SPEAKING))
                    self._audio_sequence = 0
            seq = self._audio_sequence
            self._audio_sequence += 1
            await self._broadcast(VoiceMessage.tts_chunk(pcm, sequence=seq))
            return

        msg_type = msg.get("type")
        if msg_type == "state_change":
            state_value = msg.get("state", "idle")
            try:
                new_state = VoiceState(state_value)
            except ValueError:
                new_state = VoiceState.IDLE
            async with self._lock:
                self.state = new_state
                await self._broadcast(VoiceMessage.state_change(new_state))

        elif msg_type == "transcript":
            await self._broadcast(VoiceMessage.transcript(msg.get("text", "")))

        elif msg_type == "assistant_text":
            await self._broadcast(VoiceMessage.assistant_text(msg.get("text", "")))

        elif msg_type == "error":
            await self._broadcast(
                VoiceMessage.error(
                    msg.get("code", "realtime_error"),
                    msg.get("message", ""),
                )
            )
