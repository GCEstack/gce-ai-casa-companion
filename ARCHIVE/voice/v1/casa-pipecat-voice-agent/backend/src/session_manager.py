"""WebSocket session orchestration with optional Supabase backend."""

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

from characters import CharacterMode, get_character
from config import settings


@dataclass
class SessionContext:
    device_id: str
    character: CharacterMode
    websocket: WebSocket
    session_id: str
    state: str = "idle"  # idle | listening | thinking | speaking
    last_activity: float = field(default_factory=time.time)
    killed: bool = False
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
        try:
            await self.websocket.send_bytes(data)
        except Exception:
            pass

    async def broadcast_event(self, event: dict[str, Any]):
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
            "timestamp": time.time(),
        })


class SessionManager:
    def __init__(self):
        self.sessions: dict[str, SessionContext] = {}
        self.settings = settings
        # In-memory fallback for local testing without Supabase.
        self._devices: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    def _ensure_test_device(self, device_id: str) -> dict[str, Any]:
        """Create a local test device if Supabase is not configured."""
        if device_id not in self._devices:
            self._devices[device_id] = {
                "id": device_id,
                "api_key": "local-test-key",
                "is_active": True,
                "character_id": "zippy",
                "child_age": 7,
                "parent_id": "local-parent",
            }
        return self._devices[device_id]

    async def authenticate_device(self, device_id: str, token: str) -> dict[str, Any]:
        """Verify device exists and its api_key matches the supplied token."""
        # For local testing, accept any token if Supabase is disabled.
        if not settings.supabase_enabled:
            device = self._ensure_test_device(device_id)
            if device.get("api_key") != token:
                # Auto-accept test tokens for convenience.
                device["api_key"] = token
            return device

        # TODO: integrate Supabase device lookup.
        # from supabase import create_async_client
        # client = await create_async_client(settings.supabase_url, settings.supabase_service_key)
        # result = await client.table("devices").select("*").eq("id", device_id).maybe_single().execute()
        # device = result.data
        raise NotImplementedError("Supabase device auth not yet implemented")

    async def require_consent(self, device_id: str) -> bool:
        """Check that parental consent is on file."""
        if not settings.supabase_enabled:
            return True
        # TODO: integrate Supabase consent check.
        raise NotImplementedError("COPPA consent check not yet implemented")

    async def record_session_start(self, device_id: str) -> str:
        session_id = str(uuid.uuid4())
        if not settings.supabase_enabled:
            return session_id
        # TODO: write session to Supabase.
        return session_id

    async def handle_connection(
        self,
        websocket: WebSocket,
        device_id: str,
        token: str,
        character_id: str | None = None,
        child_age: int | None = None,
    ) -> SessionContext:
        await websocket.accept()

        try:
            device = await self.authenticate_device(device_id, token)
            await self.require_consent(device_id)
        except Exception as e:
            await websocket.send_json({"type": "error", "code": "auth", "message": str(e)})
            await websocket.close(code=4001)
            raise

        char_id = character_id or device.get("character_id", "zippy")
        age = child_age or device.get("child_age", 7)
        character = get_character(char_id, age)

        session_id = await self.record_session_start(device_id)

        ctx = SessionContext(
            device_id=device_id,
            character=character,
            websocket=websocket,
            session_id=session_id,
        )

        async with self._lock:
            self.sessions[device_id] = ctx

        await ctx.set_state("idle")
        return ctx

    async def remove_session(self, device_id: str):
        async with self._lock:
            self.sessions.pop(device_id, None)

    async def kill_session(self, device_id: str) -> bool:
        async with self._lock:
            ctx = self.sessions.get(device_id)
            if not ctx:
                return False
            ctx.killed = True
        try:
            await ctx.send_json({"type": "killed", "message": "Session ended by parent"})
            await ctx.websocket.close(code=4000)
        except Exception:
            pass
        await self.remove_session(device_id)
        return True

    def subscribe_events(self, device_id: str) -> asyncio.Queue[dict[str, Any]] | None:
        ctx = self.sessions.get(device_id)
        if not ctx:
            return None
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        ctx.event_queues.append(q)
        return q

    def unsubscribe_events(self, device_id: str, q: asyncio.Queue[dict[str, Any]]):
        ctx = self.sessions.get(device_id)
        if ctx and q in ctx.event_queues:
            ctx.event_queues.remove(q)
