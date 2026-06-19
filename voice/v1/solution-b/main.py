"""Solution B: Groq Compound-First Voice Server (FastAPI)

Uses OpenRouter's Groq Compound for LLM. The model auto-selects tools:
web_search, code_execution, visit_website, wolfram_alpha.

This means the companion can answer real-time questions, do math,
look up facts, and visit websites without custom tool-calling code.

STT and TTS are the same as Solution A. Only the LLM model changes.

Env vars:
    OPENROUTER_API_KEY=sk-or-v1-...
    SUPABASE_URL=...
    SUPABASE_SERVICE_KEY=...
    VOICE_SERVER_API_KEY=...
    PORT=8080
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Header, HTTPException, Query, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from supabase import create_async_client
from supabase._async.client import AsyncClient as SupabaseClient

from casa_voice.sessions import SessionManager
from casa_voice.providers import OpenRouterLLM

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
VOICE_SERVER_API_KEY = os.getenv("VOICE_SERVER_API_KEY", "")
PORT = int(os.getenv("PORT", "8080"))
CORS_ORIGINS = [x.strip() for x in os.getenv("CORS_ORIGINS", "*").split(",") if x.strip()]

if not OPENROUTER_API_KEY:
    raise RuntimeError("OPENROUTER_API_KEY is required")

supabase: SupabaseClient | None = None
session_manager: SessionManager | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global supabase, session_manager
    supabase = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    session_manager = SessionManager(supabase, OPENROUTER_API_KEY)
    # Override LLM with Compound model
    session_manager.llm = OpenRouterLLM(OPENROUTER_API_KEY, model="groq/compound")
    yield
    if session_manager:
        for device_id in list(session_manager.sessions.keys()):
            await session_manager.kill_session(device_id)
    await supabase.auth.close() if supabase else None


app = FastAPI(
    title="Casa Voice — Solution B (Groq Compound-First)",
    version="2.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(os.path.dirname(__file__), "..", "client")
if os.path.isdir(static_dir):
    app.mount("/client", StaticFiles(directory=static_dir), name="client")


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({
        "status": "ok",
        "solution": "B",
        "name": "Groq Compound-First",
        "provider": "openrouter",
        "stt": "openai/whisper-large-v3-turbo",
        "llm": "groq/compound",
        "tts": "google/gemini-3.1-flash-tts-preview",
        "features": ["barge-in", "voice-commands", "pwa", "esp32", "tool-use"],
        "tools": ["web_search", "code_execution", "visit_website", "wolfram_alpha"],
    })


@app.websocket("/ws/voice/{device_id}")
async def voice_websocket(
    websocket: WebSocket,
    device_id: str,
    token: str = Query(...),
):
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
    if not session_manager:
        raise HTTPException(status_code=503, detail="Server not ready")

    jwt = token
    if authorization and authorization.startswith("Bearer "):
        jwt = authorization.replace("Bearer ", "")
    if jwt != VOICE_SERVER_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

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

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )


@app.post("/api/kill/{device_id}")
async def kill_device(
    device_id: str,
    authorization: str | None = Header(None),
    token: str | None = Query(None),
) -> JSONResponse:
    if not session_manager:
        raise HTTPException(status_code=503, detail="Server not ready")

    jwt = token
    if authorization and authorization.startswith("Bearer "):
        jwt = authorization.replace("Bearer ", "")
    if jwt != VOICE_SERVER_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    killed = await session_manager.kill_session(device_id)
    return JSONResponse({"killed": killed})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main_b:app", host="0.0.0.0", port=PORT, log_level="info")
