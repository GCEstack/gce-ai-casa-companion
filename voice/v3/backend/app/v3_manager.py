"""V3 voice session manager adapter for Casa Companion voice backend.

This wires the casa_voice V3 engine (wake-word, push-to-talk, interruptible
TTS, Groq/OpenRouter providers) into the existing Casa Companion backend while
keeping the original /ws/voice endpoint unchanged. Device auth and COPPA flow
are reused from the existing coppa_layer.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import suppress
from typing import Any, Dict, Optional
from uuid import UUID

from dotenv import load_dotenv
from fastapi import WebSocket, WebSocketDisconnect

# Load .env from the backend directory so V3 providers pick up OPENROUTER_API_KEY,
# GROQ_API_KEY, etc. Existing Casa backend expects env vars to already be set,
# so we only load if a .env file is present.
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_env_path = os.path.join(_backend_dir, ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=False)

from casa_voice.providers import VoiceProviders
from casa_voice.protocol import VoiceMessage, MessageType, CommandType
from casa_voice.sessions import VoiceSession, ClientHandle

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
from .pairing import PairingManager

logger = logging.getLogger(__name__)


class V3SessionManager:
    """Wraps the casa_voice V3 engine with Casa Companion auth/event shapes."""

    def __init__(self, supabase: Any, prompt_router: Any, pairing_manager: Optional[PairingManager] = None):
        self.supabase = supabase
        self.prompt_router = prompt_router
        self.settings = get_settings()
        self.providers = VoiceProviders()
        self.pairing_manager = pairing_manager
        self.sessions: Dict[str, VoiceSession] = {}
        # device_id -> (session_id, audio_client_id)
        self.device_index: Dict[str, tuple[str, str]] = {}
        # device_id -> legacy dashboard SSE queues
        self.event_queues: Dict[str, list[asyncio.Queue]] = {}

    # ── Connection handling ────────────────────────────────────────────────────

    async def handle_connection(
        self,
        websocket: WebSocket,
        device_id: str,
        token: str,
        session_id: str | None = None,
        client_type: str = "audio",
    ):
        await websocket.accept()

        try:
            device = await self._authenticate_device(device_id, token, session_id=session_id)
        except (DeviceNotFoundError, PermissionError, ConsentError) as e:
            logger.warning(f"[v3 {device_id}] auth failed: {e}")
            try:
                await websocket.send_json({"type": "error", "code": "auth", "message": str(e)})
                await websocket.close(code=4001)
            except Exception:
                pass
            return

        session_db_id = await record_session_start(
            self.supabase, device_id, self.settings.fly_machine_id
        )

        # Use an explicit session_id query param when available so multiple clients
        # (e.g. browser + dashboard) can share the same voice session.
        voice_session_id = session_id or device_id
        pairing = (
            self.pairing_manager.get_by_session_id(voice_session_id)
            if self.pairing_manager
            else None
        )

        if voice_session_id not in self.sessions:
            character = (
                (pairing.character if pairing else None)
                or device.get("character_id")
                or "default"
            )
            mode = (
                (pairing.mode if pairing else None)
                or device.get("mode_id")
                or "default"
            )
            session = VoiceSession(
                session_id=voice_session_id,
                providers=self.providers,
                character=str(character),
                mode=str(mode),
                store=None,  # Supabase persistence can be wired via SessionStore later
            )
            self.sessions[voice_session_id] = session
            await session.start()
            logger.info(f"[v3 {device_id}] created session character={character} mode={mode}")
        else:
            session = self.sessions[voice_session_id]

        async def send_message(msg: VoiceMessage):
            try:
                if msg.binary:
                    await websocket.send_bytes(msg.binary)
                else:
                    await websocket.send_text(msg.to_json())
            except Exception as e:
                logger.warning(f"[v3 {device_id}] send failed: {e}")

        client_id = f"{device_id}-{client_type}-{time.time():.0f}"
        client = ClientHandle(device_id=client_id, device_type=client_type, send=send_message)
        session.add_client(client)
        self.device_index[device_id] = (voice_session_id, client_id)

        # Legacy dashboard compatibility: push an initial idle/status event.
        await self._broadcast_dashboard_event(
            device_id,
            {
                "type": "status",
                "device_id": device_id,
                "state": "idle",
                "battery": device.get("battery"),
                "timestamp": time.time(),
            },
        )

        dashboard_task = asyncio.create_task(
            self._dashboard_forwarder(session, device_id, session_db_id)
        )

        try:
            while True:
                message = await websocket.receive()
                msg_type = message.get("type", "")
                if msg_type == "websocket.disconnect":
                    break

                if "bytes" in message and message["bytes"]:
                    await session.handle_audio(message["bytes"])
                elif "text" in message:
                    await self._handle_text(session, device, message["text"], send_message)
                else:
                    break
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"[v3 {device_id}] websocket error: {e}", exc_info=True)
        finally:
            dashboard_task.cancel()
            with suppress(asyncio.CancelledError):
                await dashboard_task

            session.remove_client(client_id)
            if session.is_empty:
                await session.stop()
                self.sessions.pop(voice_session_id, None)

            self.device_index.pop(device_id, None)
            await end_session(self.supabase, session_db_id)
            await self._broadcast_dashboard_event(
                device_id,
                {"type": "disconnected", "device_id": device_id, "timestamp": time.time()},
            )
            try:
                await websocket.close()
            except Exception:
                pass

    async def _handle_text(
        self,
        session: VoiceSession,
        device: dict[str, Any],
        text: str,
        send_message,
    ):
        """Handle legacy Casa control messages plus V3 protocol messages."""
        try:
            raw = json.loads(text)
        except json.JSONDecodeError:
            return

        msg_type = raw.get("type")

        # Legacy Casa Companion control messages
        if msg_type == "ping":
            await send_message(VoiceMessage(type=MessageType.PONG))
            return
        if msg_type == "pong":
            return
        if msg_type == "battery":
            level = int(raw.get("level", 0))
            if level < 10:
                await send_message(VoiceMessage.command(CommandType.STOP))
            await self._broadcast_dashboard_event(
                device.get("id", session.session_id),
                {
                    "type": "battery",
                    "device_id": device.get("id", session.session_id),
                    "battery": level,
                    "timestamp": time.time(),
                },
            )
            return
        if msg_type == "medallion":
            character_key = raw.get("character_key")
            mode_key = raw.get("mode_key")
            if character_key and mode_key and self.prompt_router:
                new_mode = self.prompt_router.get_by_keys(character_key, mode_key)
                if new_mode:
                    await session.handle_config_change(
                        character=character_key,
                        mode=new_mode.name,
                    )
                    await send_message(
                        VoiceMessage(type=MessageType.CONFIG_CHANGE, payload={"mode": new_mode.name})
                    )
            return

        # Typed/text fallback (useful for browser testing and accessibility).
        if msg_type == "text_input":
            await session.handle_text_input(raw.get("text", ""))
            return

        # V3 protocol messages
        try:
            msg = VoiceMessage.from_json(text)
        except Exception as e:
            logger.warning(f"[v3 {session.session_id}] unknown text message: {text} ({e})")
            return

        if msg.type == MessageType.COMMAND:
            await session.handle_command(CommandType(msg.payload.get("command")))
        elif msg.type == MessageType.CONFIG_CHANGE:
            await session.handle_config_change(
                character=msg.payload.get("character"),
                mode=msg.payload.get("mode"),
                volume=msg.payload.get("volume"),
            )
        elif msg.type == MessageType.PING:
            await send_message(VoiceMessage(type=MessageType.PONG))

    # ── Auth helpers ───────────────────────────────────────────────────────────

    async def _authenticate_device(
        self,
        device_id: str,
        token: str,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        """Reuses existing Casa auth; falls through in local dev if Supabase is missing or fails.

        Mobile/web clients may authenticate with the shared MOBILE_API_KEY instead of a
        per-device api_key. These clients skip per-device provisioning and consent checks.
        """
        if self.settings.mobile_api_key and token == self.settings.mobile_api_key:
            logger.info(f"[v3 {device_id}] mobile auth accepted")
            return {
                "id": device_id,
                "character_id": "default",
                "mode_id": "default",
                "battery": None,
                "is_active": True,
                "mobile": True,
            }

        if self.pairing_manager:
            pairing = self.pairing_manager.get_by_token(token)
            if pairing and pairing.session_id == session_id:
                logger.info(f"[v3 {device_id}] pairing auth accepted session={session_id}")
                return {
                    "id": device_id,
                    "character_id": pairing.character,
                    "mode_id": pairing.mode,
                    "battery": None,
                    "is_active": True,
                    "mobile": True,
                }

        if self.settings.env == "development":
            try:
                if not self.supabase:
                    raise RuntimeError("Supabase not configured")
                device = await get_device_with_parent(self.supabase, device_id)
                if device.get("api_key") != token:
                    raise PermissionError("Invalid device token")
                if not device.get("is_active", True):
                    raise PermissionError("Device is deactivated")
                await require_consent(self.supabase, device_id)
                return device
            except Exception as e:
                logger.warning(f"[v3 {device_id}] dev auth bypass after: {e}")
                return {
                    "id": device_id,
                    "character_id": "default",
                    "mode_id": "default",
                    "battery": None,
                }

        device = await get_device_with_parent(self.supabase, device_id)
        if device.get("api_key") != token:
            raise PermissionError("Invalid device token")
        if not device.get("is_active", True):
            raise PermissionError("Device is deactivated")
        await require_consent(self.supabase, device_id)
        return device

    # ── Dashboard / SSE integration ────────────────────────────────────────────

    async def _dashboard_forwarder(self, session: VoiceSession, device_id: str, session_db_id: UUID):
        """Translate V3 messages into legacy dashboard events."""
        try:
            while True:
                # Any audio client queue receives the same state/transcript messages.
                client = next((c for c in session.clients.values() if c.is_audio), None)
                if not client:
                    await asyncio.sleep(0.1)
                    continue

                data = await client.get_event(timeout=1.0)
                if not data:
                    continue

                try:
                    msg = json.loads(data)
                except Exception:
                    continue

                event: Optional[dict] = None
                msg_type = msg.get("type")

                if msg_type == "state_change":
                    state = msg.get("state")
                    event = {
                        "type": "status",
                        "device_id": device_id,
                        "state": state,
                        "battery": None,
                        "timestamp": time.time(),
                    }
                    await touch_session(self.supabase, session_db_id, {"state": state})
                elif msg_type == "transcript":
                    event = {
                        "type": "transcript",
                        "device_id": device_id,
                        "text": msg.get("text"),
                        "timestamp": time.time(),
                    }
                elif msg_type == "assistant_text":
                    event = {
                        "type": "assistant_text",
                        "device_id": device_id,
                        "text": msg.get("text"),
                        "timestamp": time.time(),
                    }
                elif msg_type == "error":
                    event = {
                        "type": "error",
                        "device_id": device_id,
                        "code": msg.get("code"),
                        "message": msg.get("message"),
                        "timestamp": time.time(),
                    }

                if event:
                    await self._broadcast_dashboard_event(device_id, event)
        except asyncio.CancelledError:
            raise

    async def _broadcast_dashboard_event(self, device_id: str, event: dict):
        for q in list(self.event_queues.get(device_id, [])):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def subscribe_events(self, device_id: str) -> asyncio.Queue | None:
        if device_id not in self.device_index and device_id not in self.sessions:
            return None
        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=64)
        self.event_queues.setdefault(device_id, []).append(q)
        return q

    def unsubscribe_events(self, device_id: str, q: asyncio.Queue):
        qs = self.event_queues.get(device_id, [])
        if q in qs:
            qs.remove(q)

    # ── Kill switch / cleanup ──────────────────────────────────────────────────

    async def kill_session(self, device_id: str) -> bool:
        session = self.sessions.get(device_id)
        if not session:
            return False
        await session.handle_command(CommandType.RESET)
        for client_id in list(session.clients.keys()):
            session.remove_client(client_id)
        await session.stop()
        self.sessions.pop(device_id, None)
        self.device_index.pop(device_id, None)
        return True

    def find_client(self, device_id: str) -> Optional[tuple[VoiceSession, ClientHandle]]:
        session_id, client_id = self.device_index.get(device_id, (None, None))
        if not session_id:
            return None
        session = self.sessions.get(session_id)
        if not session:
            return None
        client = session.clients.get(client_id)
        return (session, client) if client else None
