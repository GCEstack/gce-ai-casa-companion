"""Advanced Casa-Pipecat voice server."""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from pipecat.pipeline.task import PipelineParams
from pipecat.pipeline.worker import PipelineWorker
from pipecat.workers.runner import WorkerRunner

from config import settings
from pipeline import create_pipeline
from session_manager import SessionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

session_manager = SessionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Casa-Pipecat voice agent starting on port %s", settings.port)
    yield
    logger.info("Casa-Pipecat voice agent shutting down")


app = FastAPI(
    title="Casa-Pipecat Voice Agent",
    description="Advanced low-latency voice agent with Pipecat",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Casa-Pipecat Voice Agent</title>
        <meta http-equiv="refresh" content="0; url=/static/index.html">
    </head>
    <body>
        <p>Redirecting to <a href="/static/index.html">test client</a>...</p>
    </body>
    </html>
    """


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({
        "status": "ok",
        "service": "casa-pipecat-voice-agent",
        "port": settings.port,
        "supabase_enabled": settings.supabase_enabled,
    })


@app.get("/characters")
async def list_characters() -> JSONResponse:
    from characters import CHARACTERS
    return JSONResponse({
        "characters": [
            {"id": c.id, "name": c.name} for c in CHARACTERS.values()
        ]
    })


@app.websocket("/ws/voice/{device_id}")
async def voice_websocket(
    websocket: WebSocket,
    device_id: str,
    token: str = Query(...),
    character_id: str | None = Query(None),
    child_age: int | None = Query(None),
):
    try:
        ctx = await session_manager.handle_connection(
            websocket, device_id, token, character_id, child_age
        )
    except Exception:
        return

    try:
        pipeline, transport = create_pipeline(
            websocket,
            ctx.character,
            input_sample_rate=16000,
            output_sample_rate=24000,
        )

        worker = PipelineWorker(
            pipeline,
            params=PipelineParams(
                audio_in_sample_rate=16000,
                audio_out_sample_rate=24000,
            ),
        )

        runner = WorkerRunner(handle_sigint=False, handle_sigterm=False)
        await runner.run(worker)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", device_id)
    except Exception as e:
        logger.error("Voice session error for %s: %s", device_id, e)
    finally:
        await session_manager.remove_session(device_id)
        try:
            await websocket.close()
        except Exception:
            pass


@app.get("/events/{device_id}")
async def events_stream(
    device_id: str,
    authorization: str | None = Header(None),
    token: str | None = Query(None),
) -> StreamingResponse:
    """Server-Sent Events for the parent dashboard."""
    # For local testing, skip dashboard token verification.
    if settings.supabase_enabled and settings.voice_server_api_key:
        jwt = token
        if not jwt and authorization and authorization.startswith("Bearer "):
            jwt = authorization.replace("Bearer ", "")
        if jwt != settings.voice_server_api_key:
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

    return StreamingResponse(generator(), media_type="text/event-stream")


@app.post("/api/kill/{device_id}")
async def kill_device(
    device_id: str,
    authorization: str | None = Header(None),
    token: str | None = Query(None),
) -> JSONResponse:
    """Parent kill switch. Immediately terminates the active device session."""
    if settings.supabase_enabled and settings.voice_server_api_key:
        jwt = token
        if not jwt and authorization and authorization.startswith("Bearer "):
            jwt = authorization.replace("Bearer ", "")
        if jwt != settings.voice_server_api_key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    killed = await session_manager.kill_session(device_id)
    return JSONResponse({"killed": killed})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        reload=False,
    )
