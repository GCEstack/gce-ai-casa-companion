"""Solution C: Multi-Tier Resilient Voice Server (FastAPI)

The most fault-tolerant architecture. Every layer has a fallback:

LLM Tier 1: OpenRouter → Groq Llama 3.3 70B
LLM Tier 2: OpenRouter → OpenAI GPT-4o-mini (auto-fallback)
LLM Tier 3: OpenRouter → Anthropic Claude 3.5 Haiku (auto-fallback)

TTS Tier 1: OpenRouter → Gemini 3.1 Flash TTS
TTS Tier 2: OpenRouter → Kokoro 82M (if Gemini fails)

STT: OpenRouter → Whisper Large V3 Turbo (kept direct; no streaming alternative)

Resample: 24kHz → 16kHz (soxr if available, scipy fallback)

This is the "never go down" server. OpenRouter handles the fallback automatically.

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
from casa_voice.providers import OpenRouterLLM, OpenRouterTTS

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
    
    # Multi-tier LLM: OpenRouter auto-fallback order
    session_manager.llm = OpenRouterLLM(
        OPENROUTER_API_KEY,
        model="groq/llama-3.3-70b-versatile",
    )
    # The fallback is handled by OpenRouter's provider field automatically.
    # We just configure the order in the LLM.complete() method.
    
    # Multi-tier TTS: if primary fails, OpenRouterTTS falls back to fetch
    session_manager.tts = OpenRouterTTS(OPENROUTER_API_KEY, default_model="gemini-flash-tts")
    
    yield
    if session_manager:
        for device_id in list(session_manager.sessions.keys()):
            await session_manager.kill_session(device_id)
    await supabase.auth.close() if supabase else None


app = FastAPI(
    title="Casa Voice — Solution C (Multi-Tier Resilient)",
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
        "solution": "C",
        "name": "Multi-Tier Resilient",
        "provider": "openrouter",
        "stt": "openai/whisper-large-v3-turbo",
        "llm_tiers": [
            "groq/llama-3.3-70b-versatile",
            "openai/gpt-4o-mini",
            "anthropic/claude-3.5-haiku",
        ],
        "tts_tiers": [
            "google/gemini-3.1-flash-tts-preview",
            "hexgrad/kokoro-82m",
        ],
        "features": ["barge-in", "voice-commands", "pwa", "esp32", "auto-fallback"],
        "resample": "soxr > scipy",
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
    uvicorn.run("main_c:app", host="0.0.0.0", port=PORT, log_level="info")
