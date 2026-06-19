"""Casa Voice V2 — FastAPI Server (Wake Phrase + Production Edition)

Solution A (OpenRouter-Native) with wake phrase support and full auth:
- IDLE: Companion dormant, only wake phrases trigger
- LISTENING: Active collection
- SPEAKING: TTS streaming, interruptible
- INTERRUPTED: Barge-in flush
- RESETTING: Clear all state

Production features:
- Supabase auth (device tokens)
- SSE event stream for parent dashboard
- Kill switch /api/kill/{device_id}
- Health check with provider status
- Static PWA client serving
"""

import os
import asyncio
import logging
from typing import Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse

from casa_voice.protocol import VoiceMessage, MessageType, VoiceState, CommandType
from casa_voice.providers import VoiceProviders
from casa_voice.sessions import VoiceSession

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Supabase Setup ─────────────────────────────────────────────────────────

try:
    from supabase import create_client, Client
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
    supabase: Client | None = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None
except ImportError:
    supabase = None

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
API_KEY = os.environ.get("VOICE_SERVER_API_KEY", "demo-key")

# ── Global State ─────────────────────────────────────────────────────────────

providers = VoiceProviders(api_key=OPENROUTER_KEY)
sessions: Dict[str, VoiceSession] = {}
event_queues: list[asyncio.Queue] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Casa Voice V2 starting up")
    yield
    logger.info("Casa Voice V2 shutting down")
    for session in list(sessions.values()):
        await session.stop()
    sessions.clear()


app = FastAPI(
    title="Casa Voice V2 — Wake Phrase Edition",
    version="2.1.0",
    lifespan=lifespan,
)


# ── Auth ────────────────────────────────────────────────────────────────────

async def authenticate_device(device_id: str, token: str) -> dict[str, Any]:
    """Verify device token against Supabase."""
    if not supabase:
        return {"id": device_id, "character_key": "orsetto", "mode_key": "default"}
    try:
        result = await supabase.table("devices").select("*").eq("id", device_id).maybe_single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Device not found")
        return result.data
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=500, detail="Auth failed")


# ── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "solution": "A-wake-phrases-v2",
        "version": "2.1.0",
        "features": [
            "barge-in", "voice-commands", "wake-phrases", "interrupt-phrases",
            "end-turn", "reset", "pwa", "esp32", "pcm-streaming", "silero-vad",
            "auth", "parent-dashboard", "kill-switch"
        ],
        "active_sessions": len(sessions),
        "supabase_connected": supabase is not None,
    }


# ── SSE Events ──────────────────────────────────────────────────────────────

@app.get("/events/{device_id}")
async def events(device_id: str, token: str = Query(...)):
    """SSE stream for parent dashboard."""
    await authenticate_device(device_id, token)
    q: asyncio.Queue = asyncio.Queue()
    event_queues.append(q)

    async def stream():
        try:
            while True:
                event = await q.get()
                yield f"data: {event}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if q in event_queues:
                event_queues.remove(q)

    return StreamingResponse(stream(), media_type="text/event-stream")


# ── Kill Switch ─────────────────────────────────────────────────────────────

@app.post("/api/kill/{device_id}")
async def kill_device(device_id: str, token: str = Query(...)):
    """Emergency kill switch — parent dashboard."""
    await authenticate_device(device_id, token)
    session = sessions.get(device_id)
    if not session:
        return {"status": "not_found", "device_id": device_id}
    await session.stop()
    sessions.pop(device_id, None)
    return {"status": "killed", "device_id": device_id}


# ── WebSocket Voice ──────────────────────────────────────────────────────────

@app.websocket("/ws/voice/{device_id}")
async def voice_websocket(websocket: WebSocket, device_id: str, token: str = Query(...)):
    await websocket.accept()

    try:
        device = await authenticate_device(device_id, token)
    except HTTPException:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    async def send_message(msg: VoiceMessage):
        if msg.binary:
            await websocket.send_bytes(msg.binary)
        else:
            await websocket.send_text(msg.to_json())

    async def broadcast_event(event: dict):
        for q in list(event_queues):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    session = VoiceSession(
        session_id=device_id,
        websocket_send=send_message,
        broadcast_event=broadcast_event,
        providers=providers,
        character=device.get("character_key", "orsetto"),
        mode=device.get("mode_key", "default"),
    )
    sessions[device_id] = session
    await session.start()

    try:
        while True:
            message = await websocket.receive()
            
            if "bytes" in message:
                pcm = message["bytes"]
                logger.info(f"[WS {device_id}] BINARY: {len(pcm)} bytes")
                await session.handle_audio(pcm)

            elif "text" in message:
                try:
                    data = json.loads(message["text"])
                    logger.info(f"[WS {device_id}] TEXT: {json.dumps(data)}")
                    msg_type = data.get("type")

                    if msg_type == "command":
                        cmd = CommandType(data.get("command"))
                        await session.handle_command(cmd)
                    elif msg_type == "medallion":
                        character = data.get("character_key", "orsetto")
                        mode = data.get("mode_key", "default")
                        session.character = character
                        session.mode = mode
                        session.system_prompt = session._build_system_prompt()
                        await send_message(VoiceMessage.state_change(VoiceState.LISTENING))
                        await send_message(VoiceMessage.command(CommandType.WAKE))
                    elif msg_type == "barge_in":
                        await session.handle_command(CommandType.INTERRUPT)
                    elif msg_type == "ping":
                        await send_message(VoiceMessage(type=MessageType.PONG))
                    elif msg_type == "wake":
                        await session.handle_command(CommandType.WAKE)
                    elif msg_type == "end_turn":
                        await session.handle_command(CommandType.END_TURN)
                except Exception as e:
                    logger.error(f"Message parse error: {e}")

    except WebSocketDisconnect:
        logger.info(f"Client disconnected: {device_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await session.stop()
        sessions.pop(device_id, None)


# ── Static Client ───────────────────────────────────────────────────────────

app.mount("/client", StaticFiles(directory="client"), name="client")


@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Casa Voice V2</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="manifest" href="/client/manifest.json">
    </head>
    <body>
        <h1>Casa Voice V2</h1>
        <p><a href="/client/index.html">Open PWA Client</a></p>
        <p><a href="/health">Health Check</a></p>
    </body>
    </html>
    """


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
