"""Casa Companion Voice Server - FastAPI WebSocket + SSE endpoint."""
from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, Header, HTTPException, Query, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from supabase import create_async_client
from supabase._async.client import AsyncClient as SupabaseClient

from config import get_settings
from prompt_router import PromptRouter
from session_manager import SessionManager


settings = get_settings()
supabase: SupabaseClient | None = None
session_manager: SessionManager | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global supabase, session_manager
    supabase = await create_async_client(settings.supabase_url, settings.supabase_service_key)
    prompt_router = PromptRouter(supabase)
    await prompt_router.load()
    session_manager = SessionManager(supabase, prompt_router)
    yield
    # Shutdown: close active sessions gracefully.
    if session_manager:
        for device_id in list(session_manager.sessions.keys()):
            await session_manager.kill_session(device_id)


app = FastAPI(title="Casa Companion Voice Server", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://casa-companion.vercel.app",
        "https://dashboard-ohmjw3x4q-simplebalance89-ais-projects.vercel.app",
        "https://dashboard-pied-nine-11.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _verify_dashboard_token(authorization: str | None = None, token: str | None = None) -> dict[str, Any]:
    """Validate a Supabase JWT from header or query param and return the user."""
    jwt = token
    if not jwt and authorization and authorization.startswith("Bearer "):
        jwt = authorization.replace("Bearer ", "")
    if not jwt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    if not supabase:
        raise HTTPException(status_code=503, detail="Server not ready")
    user_resp = await supabase.auth.get_user(jwt)
    user = user_resp.user
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user


async def _parent_owns_device(user: dict[str, Any], device_id: str):
    result = (
        await supabase.table("devices")
        .select("id")
        .eq("id", device_id)
        .eq("parent_id", user.id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device not linked to parent")


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "env": settings.env})


@app.websocket("/ws/voice/{device_id}")
async def voice_websocket(websocket: WebSocket, device_id: str, token: str = Query(...)):
    if not session_manager:
        await websocket.close(code=1011)
        return
    await session_manager.handle_connection(websocket, device_id, token)


@app.get("/events/{device_id}")
async def events_stream(
    device_id: str,
    authorization: str | None = Header(None),
    token: str | None = Query(None),
) -> StreamingResponse:
    """Server-Sent Events for the parent dashboard. No audio or transcripts are sent."""
    user = await _verify_dashboard_token(authorization, token)
    await _parent_owns_device(user, device_id)

    if not session_manager:
        raise HTTPException(status_code=503, detail="Server not ready")

    q = session_manager.subscribe_events(device_id)
    if not q:
        raise HTTPException(status_code=404, detail="Device not connected")

    async def generator() -> AsyncGenerator[str, None]:
        try:
            yield "data: " + json.dumps({"type": "connected"}) + "\n\n"
            while True:
                event = await q.get()
                yield "data: " + json.dumps(event) + "\n\n"
        except asyncio.CancelledError:
            raise
        finally:
            session_manager.unsubscribe_events(device_id, q)

    return StreamingResponse(generator(), media_type="text/event-stream")


@app.post("/api/kill/{device_id}")
async def kill_device(
    device_id: str,
    authorization: str | None = Header(None),
    token: str | None = Query(None),
) -> JSONResponse:
    """Parent kill switch. Immediately terminates the active device session."""
    user = await _verify_dashboard_token(authorization, token)
    await _parent_owns_device(user, device_id)

    if not session_manager:
        raise HTTPException(status_code=503, detail="Server not ready")

    killed = await session_manager.kill_session(device_id)
    return JSONResponse({"killed": killed})
