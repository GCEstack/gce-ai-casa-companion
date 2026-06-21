"""Casa Companion Voice Server - FastAPI WebSocket + SSE endpoint."""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI, Header, HTTPException, Query, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from supabase import create_async_client
from supabase._async.client import AsyncClient as SupabaseClient

from .config import get_settings
from .prompt_router import PromptRouter
from .simple_voice import router as simple_voice_router
from .v3_manager import V3SessionManager


settings = get_settings()
supabase: SupabaseClient | None = None
session_manager: Any | None = None  # lazily imported to avoid legacy deepgram startup issues
v3_session_manager: V3SessionManager | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global supabase, session_manager, v3_session_manager

    # Allow local dev without Supabase; the V3 manager will skip auth in development.
    has_supabase = (
        settings.supabase_url
        and not settings.supabase_url.startswith("https://your-project")
        and settings.supabase_service_key
    )
    if has_supabase:
        try:
            supabase = await create_async_client(settings.supabase_url, settings.supabase_service_key)
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.warning(f"Supabase connection failed: {e}")
            if settings.env != "development":
                raise

    prompt_router = PromptRouter(supabase)
    if supabase and settings.env != "development":
        try:
            await prompt_router.load()
        except Exception as e:
            logging.getLogger(__name__).warning(
                f"Prompt router load failed, continuing without Supabase mode cache: {e}"
            )

    # Legacy endpoint is optional; skip it in development if deepgram SDK mismatches.
    if settings.env != "development":
        from .session_manager import SessionManager
        session_manager = SessionManager(supabase, prompt_router)

    v3_session_manager = V3SessionManager(supabase, prompt_router)
    yield
    # Shutdown: close active sessions gracefully.
    if v3_session_manager:
        for device_id in list(v3_session_manager.sessions.keys()):
            await v3_session_manager.kill_session(device_id)
    if session_manager:
        for device_id in list(session_manager.sessions.keys()):
            await session_manager.kill_session(device_id)


app = FastAPI(title="Casa Companion Voice Server", version="1.2.0-v3+simple", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(simple_voice_router)


async def _verify_dashboard_token(authorization: str | None = None, token: str | None = None) -> dict[str, Any]:
    """Validate a Supabase JWT from header or query param and return the user.

    The Authorization header is preferred when both are provided; the query
    param is kept for backward compatibility.
    """
    jwt: str | None = None
    if authorization and authorization.startswith("Bearer "):
        jwt = authorization.replace("Bearer ", "")
    if not jwt:
        jwt = token
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
    # Lazy import keeps legacy deepgram import optional.
    from .session_manager import SessionManager

    if not session_manager:
        await websocket.close(code=1011)
        return
    await session_manager.handle_connection(websocket, device_id, token)


@app.websocket("/ws/voice-v3/{device_id}")
async def voice_v3_websocket(
    websocket: WebSocket,
    device_id: str,
    token: str = Query(...),
    session_id: str | None = Query(None),
):
    """V3 voice engine endpoint (wake-word, push-to-talk, interruptible TTS)."""
    if not v3_session_manager:
        await websocket.close(code=1011)
        return
    await v3_session_manager.handle_connection(
        websocket, device_id, token, session_id=session_id
    )


@app.websocket("/ws/voice/realtime/{device_id}")
async def voice_realtime_websocket(
    websocket: WebSocket,
    device_id: str,
    token: str = Query(...),
    session_id: str | None = Query(None),
):
    """Mobile app realtime endpoint — forwards to the V3 voice engine."""
    if not v3_session_manager:
        await websocket.close(code=1011)
        return
    await v3_session_manager.handle_connection(
        websocket, device_id, token, session_id=session_id
    )


@app.get("/events/{device_id}")
async def events_stream(
    device_id: str,
    authorization: str | None = Header(None),
    token: str | None = Query(None),
) -> StreamingResponse:
    """Server-Sent Events for the parent dashboard. No audio or transcripts are sent."""
    user = await _verify_dashboard_token(authorization, token)
    await _parent_owns_device(user, device_id)

    if not session_manager and not v3_session_manager:
        raise HTTPException(status_code=503, detail="Server not ready")

    q = None
    manager = None
    if v3_session_manager:
        q = v3_session_manager.subscribe_events(device_id)
        manager = v3_session_manager
    if not q and session_manager:
        q = session_manager.subscribe_events(device_id)
        manager = session_manager
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
            manager.unsubscribe_events(device_id, q)

    return StreamingResponse(generator(), media_type="text/event-stream")


@app.get("/api/sessions")
async def list_sessions() -> JSONResponse:
    """Admin-style list of active V3 sessions."""
    if not v3_session_manager:
        raise HTTPException(status_code=503, detail="Server not ready")
    return JSONResponse(
        {
            "sessions": [
                {
                    "session_id": sid,
                    "clients": [
                        {"device_id": c.device_id, "device_type": c.device_type}
                        for c in s.clients.values()
                    ],
                    "state": s.state.value,
                    "character": s.character,
                    "mode": s.mode,
                }
                for sid, s in v3_session_manager.sessions.items()
            ]
        }
    )


@app.post("/api/kill/{device_id}")
async def kill_device(
    device_id: str,
    authorization: str | None = Header(None),
    token: str | None = Query(None),
) -> JSONResponse:
    """Parent kill switch. Immediately terminates the active device session."""
    user = await _verify_dashboard_token(authorization, token)
    await _parent_owns_device(user, device_id)

    killed = False
    if v3_session_manager:
        killed = await v3_session_manager.kill_session(device_id) or killed
    if session_manager:
        killed = await session_manager.kill_session(device_id) or killed
    return JSONResponse({"killed": killed})


# ── V3 browser test client ───────────────────────────────────────────────────
client_dir = Path(__file__).parent.parent / "client"
if client_dir.exists():
    app.mount("/client", StaticFiles(directory=str(client_dir)), name="client")


@app.get("/", response_class=HTMLResponse)
async def root() -> str:
    return """
    <!DOCTYPE html>
    <html><head><title>Casa Companion Voice Server</title></head>
    <body>
        <h1>Casa Companion Voice Server</h1>
        <p><a href="/client/index.html">V3 Browser Client</a></p>
        <p><a href="/health">Health Check</a></p>
    </body></html>
    """
