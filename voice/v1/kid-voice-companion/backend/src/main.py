"""FastAPI application exposing a single WebSocket voice endpoint."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from loguru import logger
from pipecat.frames.frames import LLMMessagesAppendFrame
from pipecat.workers.base_worker import WorkerParams

from .character import get_default_character
from .config import settings
from .pipeline import create_pipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Kid Voice Agent backend starting")
    yield
    logger.info("Kid Voice Agent backend shutting down")


app = FastAPI(title="Kid Voice Agent", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "kid-voice-agent"}


@app.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info(f"WebSocket client connected: {websocket.client}")

    character = get_default_character(child_age=7)
    pipeline, worker, transport = create_pipeline(websocket, character)

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, ws):
        logger.info("Client connected, kicking off greeting")
        await worker.queue_frames(
            [
                LLMMessagesAppendFrame(
                    messages=[
                        {
                            "role": "user",
                            "content": "Please introduce yourself to me.",
                        }
                    ],
                    run_llm=True,
                )
            ]
        )

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, ws):
        logger.info("Client disconnected")
        await worker.cancel()

    try:
        await worker.run(WorkerParams(loop=asyncio.get_event_loop()))
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"Pipeline error: {e}")
    finally:
        await worker.cancel()
        logger.info("Pipeline finished")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        reload=False,
    )
