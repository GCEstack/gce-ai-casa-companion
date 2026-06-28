"""Casa Voice V3-Dual — FastAPI Server

Supports:
- Mode A (browser audio): client connects with ?device_type=audio
- Mode B (dashboard): client connects with ?device_type=dashboard
- Mode B (ESP32 audio): client connects with ?device_type=audio

Multiple clients can share a session via ?session_id=<id>.
Audio-capable clients in a session receive TTS PCM.
Dashboard clients receive transcripts and state changes.

Run:
    uvicorn main:app --host 0.0.0.0 --port 8080
"""

import sys
from pathlib import Path

src_path = Path(__file__).parent / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

import os
import re
import asyncio
import json
import logging
import secrets
from contextlib import asynccontextmanager
from typing import Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Request, HTTPException, Body, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, field_validator

# Load environment variables from an optional .env file.
# CASA_ENV_FILE can point to a custom path; otherwise the project root .env is used.
_project_root = Path(__file__).parent
_env_file_override = os.environ.get("CASA_ENV_FILE")
_possible_env_files = [
    Path(_env_file_override) if _env_file_override else None,
    _project_root / ".env",
]
_env_file = None
for candidate in _possible_env_files:
    if not candidate:
        continue
    if candidate.exists():
        _env_file = candidate
        # Do not override env vars already set in the process (e.g. CI/test overrides)
        load_dotenv(dotenv_path=_env_file, override=False)
        logging.info(f"Loaded environment from {_env_file}")
        break
if not _env_file:
    logging.warning("No .env file found. Set CASA_ENV_FILE or create a project root .env")
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

from casa_voice.protocol import VoiceMessage, MessageType, CommandType
from casa_voice.providers import VoiceProviders
from casa_voice.sessions import VoiceSession, ClientHandle
from casa_voice.persistence import SessionStore, RedisSessionStore
from casa_voice.pairing import PairingManager, RedisPairingManager

# Simple in-memory metrics exposed on /metrics.
class Metrics:
    def __init__(self):
        self.sessions_created = 0
        self.messages_received = 0
        self.errors = 0
        self.provider_failures = {"stt": 0, "llm": 0, "tts": 0}

    def inc_sessions(self):
        self.sessions_created += 1

    def inc_messages(self):
        self.messages_received += 1

    def inc_error(self):
        self.errors += 1

    def inc_provider_failure(self, provider: str):
        if provider in self.provider_failures:
            self.provider_failures[provider] += 1


metrics = Metrics()


# Logging — one unified DEBUG stream; no duplicates, casa_voice always visible
def _setup_logging():
    formatter = logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
    root = logging.getLogger()

    # Replace any existing handlers (including uvicorn's default) with our formatter.
    for h in list(root.handlers):
        root.removeHandler(h)
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    handler.setLevel(logging.DEBUG)
    root.addHandler(handler)
    root.setLevel(logging.DEBUG)

    # casa_voice children should use the root handler only; avoid duplicates.
    cv = logging.getLogger("casa_voice")
    cv.setLevel(logging.DEBUG)
    for h in list(cv.handlers):
        cv.removeHandler(h)
    cv.propagate = True
    # Ensure every already-created casa_voice child is DEBUG.
    for name in list(logging.Logger.manager.loggerDict.keys()):
        if name.startswith("casa_voice."):
            logging.getLogger(name).setLevel(logging.DEBUG)
            logging.getLogger(name).propagate = True
            for h in list(logging.getLogger(name).handlers):
                logging.getLogger(name).removeHandler(h)

    logging.getLogger("main").setLevel(logging.DEBUG)
    logging.getLogger("__main__").setLevel(logging.DEBUG)

_setup_logging()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: create providers, clean up on shutdown."""
    logger.info("[lifespan] Starting Casa Voice V3 Dual")
    providers = VoiceProviders()
    store = None
    if os.environ.get("REDIS_URL"):
        try:
            store = RedisSessionStore()
            logger.info("[lifespan] Redis session store enabled")
        except Exception as e:
            logger.error(f"[lifespan] Failed to initialize Redis store: {e}")
    elif os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"):
        try:
            store = SessionStore()
            logger.info("[lifespan] Supabase session store enabled")
        except Exception as e:
            logger.error(f"[lifespan] Failed to initialize Supabase store: {e}")
    if not os.environ.get("VOICE_SERVER_API_KEY"):
        logger.warning(
            "WARNING: VOICE_SERVER_API_KEY not set — WebSocket endpoint is unauthenticated"
        )
    session_manager = SessionManager(providers, store=store)
    if os.environ.get("REDIS_URL"):
        try:
            pairing_manager = RedisPairingManager()
            logger.info("[lifespan] Redis pairing manager enabled")
        except Exception as e:
            logger.error(f"[lifespan] Failed to initialize Redis pairing manager: {e}")
            pairing_manager = PairingManager()
    else:
        pairing_manager = PairingManager()
    app.state.providers = providers
    app.state.session_manager = session_manager
    app.state.pairing_manager = pairing_manager
    yield
    logger.info("[lifespan] Shutting down")
    for session in list(session_manager.sessions.values()):
        await session.stop()
    if providers.stt is not None:
        await providers.stt.client.aclose()
    if providers.tts is not None:
        await providers.tts.client.aclose()
    if providers.llm is not None and hasattr(providers.llm, "client"):
        await providers.llm.client.aclose()
    if providers.native_audio is not None:
        await providers.native_audio.close()
    if store is not None:
        await store.close()
    if hasattr(pairing_manager, "close"):
        await pairing_manager.close()


app = FastAPI(
    title="Casa Voice V3 Dual",
    version="3.0.0-dual",
    lifespan=lifespan,
)

# CORS: allow-list from environment, with sensible local-development defaults.
# In production set CORS_ALLOWED_ORIGINS to a comma-separated list of trusted origins.
_cors_env = os.environ.get("CORS_ALLOWED_ORIGINS", "")
if _cors_env.strip():
    ALLOWED_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    ALLOWED_ORIGINS = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:4173",
    ]
    logger.warning(
        "CORS_ALLOWED_ORIGINS not set; using local-development allow-list. "
        "Set CORS_ALLOWED_ORIGINS in production."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(WebSocketDisconnect)
async def websocket_disconnect_handler(request: Request, exc: WebSocketDisconnect):
    """Let WebSocket disconnects propagate cleanly; do not return an HTTP response."""
    raise exc


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Preserve FastAPI HTTP exception semantics with the same safe JSON shape."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler: log the full traceback and return a safe JSON error."""
    error_id = secrets.token_urlsafe(8)
    logger.exception(f"Unhandled error [{error_id}] on {request.method} {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error_id": error_id,
        },
    )


class SessionManager:
    """Groups WebSocket clients into shared voice sessions."""

    def __init__(self, providers: VoiceProviders, store: Optional[SessionStore] = None):
        self.providers = providers
        self.store = store
        self.sessions: Dict[str, VoiceSession] = {}
        self._lock = asyncio.Lock()

    def _get_or_create_locked(
        self,
        session_id: str,
        character: str = "default",
        mode: str = "default",
    ) -> VoiceSession:
        """Create or return a session. Caller must hold self._lock."""
        if session_id not in self.sessions:
            session = VoiceSession(
                session_id=session_id,
                providers=self.providers,
                character=character,
                mode=mode,
                store=self.store,
            )
            self.sessions[session_id] = session
            # Start the pipeline once; clients join later
            asyncio.create_task(session.start())
            metrics.inc_sessions()
            logger.info(
                f"[SessionManager] Created session {session_id} "
                f"(character={character}, mode={mode})"
            )
        return self.sessions[session_id]

    async def add_client(
        self,
        session_id: str,
        device_id: str,
        device_type: str,
        send: callable,
        character: str = "default",
        mode: str = "default",
    ) -> VoiceSession:
        async with self._lock:
            session = self._get_or_create_locked(session_id, character=character, mode=mode)
            client = ClientHandle(
                device_id=device_id,
                device_type=device_type,
                send=send,
            )
            session.add_client(client)
            return session

    async def remove_client(self, session_id: str, device_id: str):
        async with self._lock:
            session = self.sessions.get(session_id)
            if not session:
                return
            session.remove_client(device_id)
            if session.is_empty:
                await session.stop()
                del self.sessions[session_id]
                logger.info(f"[SessionManager] Removed empty session {session_id}")

    def find_client(self, device_id: str):
        """Return (session, client) for a given device_id, or (None, None)."""
        for session in self.sessions.values():
            client = session.clients.get(device_id)
            if client:
                return session, client
        return None, None


# ── Input validation helpers ──────────────────────────────────────────────────

_MAX_ID_LEN = 64
_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")
_MAX_AUDIO_CHUNK_BYTES = 256 * 1024  # 256 KiB per WebSocket binary frame


def _sanitize_id(value: Optional[str], name: str = "id") -> str:
    """Return a validated id, or raise HTTPException 400 if invalid."""
    if not value:
        raise HTTPException(status_code=400, detail=f"Missing {name}")
    if len(value) > _MAX_ID_LEN:
        raise HTTPException(status_code=400, detail=f"{name} too long (max {_MAX_ID_LEN})")
    if not _ID_PATTERN.match(value):
        raise HTTPException(status_code=400, detail=f"{name} contains invalid characters")
    return value


def _sanitize_ws_id(value: Optional[str], name: str = "id") -> str:
    """Return a validated id for WebSocket contexts (raises ValueError)."""
    if not value:
        raise ValueError(f"Missing {name}")
    if len(value) > _MAX_ID_LEN:
        raise ValueError(f"{name} too long (max {_MAX_ID_LEN})")
    if not _ID_PATTERN.match(value):
        raise ValueError(f"{name} contains invalid characters")
    return value


# ── Admin auth helper ─────────────────────────────────────────────────────────

def _require_admin_token(token: Optional[str] = Query(None)):
    """Require the configured VOICE_SERVER_API_KEY for admin endpoints."""
    expected_token = os.environ.get("VOICE_SERVER_API_KEY")
    if expected_token and token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid or missing token")
    return token


# ── API Routes ────────────────────────────────────────────────────────────────

@app.get("/metrics")
async def get_metrics():
    """Basic operational metrics (JSON)."""
    return {
        "sessions_created": metrics.sessions_created,
        "messages_received": metrics.messages_received,
        "errors": metrics.errors,
        "provider_failures": metrics.provider_failures,
        "active_sessions": len(app.state.session_manager.sessions),
    }


@app.get("/health")
async def health():
    """Lightweight health check for load balancers and Azure container probes."""
    providers = app.state.providers
    provider_status = {
        "stt": providers.stt is not None and not getattr(providers.stt, "client", None).is_closed
        if providers.stt and hasattr(providers.stt, "client")
        else providers.stt is not None,
        "llm": providers.llm is not None,
        "tts": providers.tts is not None and not getattr(providers.tts, "client", None).is_closed
        if providers.tts and hasattr(providers.tts, "client")
        else providers.tts is not None,
        "vad": providers.vad is not None,
        "native_audio": providers.native_audio is not None,
    }
    store = app.state.session_manager.store
    return {
        "status": "ok",
        "version": "3.0.0-dual",
        "sessions": len(app.state.session_manager.sessions),
        "providers": provider_status,
        "persistence": store is not None,
        "websocket_auth": bool(os.environ.get("VOICE_SERVER_API_KEY")),
    }


@app.get("/api/sessions")
async def list_sessions(token: str = Depends(_require_admin_token)):
    """Admin-style list of active sessions. Requires VOICE_SERVER_API_KEY."""
    return {
        "sessions": [
            {
                "session_id": sid,
                "clients": [
                    {"device_id": c.device_id, "device_type": c.device_type}
                    for c in s.clients.values()
                ],
                "state": s.state.value,
                "character": s.character,
            }
            for sid, s in app.state.session_manager.sessions.items()
        ]
    }


@app.get("/api/kill/{device_id}")
async def kill_device(device_id: str, token: str = Depends(_require_admin_token)):
    """Admin endpoint: kick a device from its session. Requires VOICE_SERVER_API_KEY."""
    _sanitize_id(device_id, "device_id")
    for sid, session in list(app.state.session_manager.sessions.items()):
        if device_id in session.clients:
            await session.handle_command(CommandType.RESET)
            session.remove_client(device_id)
            if session.is_empty:
                await session.stop()
                del app.state.session_manager.sessions[sid]
            return {"status": "killed", "device_id": device_id}
    return {"status": "not_found", "device_id": device_id}


# ── Phone-as-parent-mic pairing ───────────────────────────────────────────────

class CreatePairingRequest(BaseModel):
    character: Optional[str] = "default"
    mode: Optional[str] = "default"

    @field_validator("character", "mode")
    @classmethod
    def _validate_optional_id_fields(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if len(value) > _MAX_ID_LEN:
            raise ValueError(f"Field too long (max {_MAX_ID_LEN})")
        if not _ID_PATTERN.match(value):
            raise ValueError("Field contains invalid characters")
        return value


@app.post("/api/pairing")
async def create_pairing(req: CreatePairingRequest):
    """Create a short-lived pairing code for a parent phone microphone."""
    pairing = await app.state.pairing_manager.create(
        character=req.character or "default",
        mode=req.mode or "default",
    )
    return {
        "code": pairing.code,
        "session_id": pairing.session_id,
        "join_token": pairing.join_token,
        "character": pairing.character,
        "mode": pairing.mode,
        "expires_at": pairing.expires_at.isoformat(),
    }


@app.get("/api/pairing/{code}")
async def get_pairing(code: str):
    """Look up pairing metadata by code."""
    _sanitize_id(code, "code")
    pairing = await app.state.pairing_manager.get(code)
    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")
    return {
        "code": pairing.code,
        "session_id": pairing.session_id,
        "character": pairing.character,
        "mode": pairing.mode,
        "expires_at": pairing.expires_at.isoformat(),
    }


# ── NFC / Physical Actions ────────────────────────────────────────────────────

class TapRequest(BaseModel):
    session_id: str
    action: str
    character: Optional[str] = None
    mode: Optional[str] = None
    scene: Optional[str] = None

    @field_validator("session_id", "character", "mode", "scene")
    @classmethod
    def _validate_optional_id_fields(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if len(value) > _MAX_ID_LEN:
            raise ValueError(f"Field too long (max {_MAX_ID_LEN})")
        if not _ID_PATTERN.match(value):
            raise ValueError("Field contains invalid characters")
        return value


ALLOWED_TAP_ACTIONS = {
    "character",
    "mode",
    "interrupt",
    "reset",
    "volume_up",
    "volume_down",
    "scene",
    "wake",
}


async def _execute_tap(session: VoiceSession, action: str, payload: dict):
    """Translate a tap action into the right session command/config change."""
    if action == "character":
        character = payload.get("character", "default")
        await session.handle_config_change(character=character)
    elif action == "mode":
        mode = payload.get("mode", "default")
        await session.handle_config_change(mode=mode)
    elif action == "interrupt":
        await session.handle_command(CommandType.INTERRUPT)
    elif action == "reset":
        await session.handle_command(CommandType.RESET)
    elif action == "volume_up":
        await session.handle_command(CommandType.VOLUME_UP)
    elif action == "volume_down":
        await session.handle_command(CommandType.VOLUME_DOWN)
    elif action == "scene":
        scene = payload.get("scene", "greeting")
        mapping = {
            "bedtime": CommandType.SCENE_BEDTIME,
            "greeting": CommandType.SCENE_GREETING,
            "joke": CommandType.SCENE_JOKE,
        }
        await session.handle_command(mapping.get(scene, CommandType.SCENE_GREETING))
    elif action == "wake":
        await session.handle_command(CommandType.WAKE)


@app.post("/api/tap")
async def tap_post(req: TapRequest):
    """Trigger an action in a voice session (NFC tag / physical button target)."""
    if req.action not in ALLOWED_TAP_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown action: {req.action}")

    session = app.state.session_manager.sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    payload = req.model_dump(exclude={"session_id", "action"})
    await _execute_tap(session, req.action, payload)
    return {"status": "ok", "session_id": req.session_id, "action": req.action}


@app.get("/api/tap")
async def tap_get(
    session_id: str,
    action: str,
    character: Optional[str] = Query(None),
    mode: Optional[str] = Query(None),
    scene: Optional[str] = Query(None),
):
    """NFC-friendly GET endpoint for the same actions."""
    _sanitize_id(session_id, "session_id")
    if action not in ALLOWED_TAP_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    session = app.state.session_manager.sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    for value, name in ((character, "character"), (mode, "mode"), (scene, "scene")):
        if value is not None:
            _sanitize_id(value, name)

    payload = {"character": character, "mode": mode, "scene": scene}
    await _execute_tap(session, action, payload)
    return {"status": "ok", "session_id": session_id, "action": action}


# ── SSE Events ────────────────────────────────────────────────────────────────

@app.get("/events/{device_id}")
async def events(
    request: Request,
    device_id: str,
    token: Optional[str] = Query(None),
):
    """Server-Sent Events stream for a given device.

    Mirrors the WebSocket text messages (state changes, transcripts,
    config changes, device presence) for external monitoring/dashboards.
    """
    _sanitize_id(device_id, "device_id")
    expected_token = os.environ.get("VOICE_SERVER_API_KEY")
    if expected_token and token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid token")

    session, client = app.state.session_manager.find_client(device_id)
    if not client:
        # Only reveal device existence after auth succeeds
        raise HTTPException(status_code=404, detail="Device not found")

    async def event_stream():
        # Send an initial connection ack
        yield f"event: connected\ndata: {json.dumps({'device_id': device_id, 'session_id': session.session_id})}\n\n"
        while True:
            if await request.is_disconnected():
                break
            data = await client.get_event(timeout=1.0)
            if data:
                yield f"event: message\ndata: {data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── WebSocket ─────────────────────────────────────────────────────────────────

async def _handle_voice_websocket(
    websocket: WebSocket,
    device_type: str,
    device_id: Optional[str],
    session_id: Optional[str],
    token: Optional[str],
    character: str = "default",
    mode: str = "default",
):
    """Shared WebSocket handler for /ws/voice and /ws/voice/{device_id}."""
    expected_token = os.environ.get("VOICE_SERVER_API_KEY")
    if expected_token and token != expected_token:
        logger.warning(f"WebSocket connection rejected: invalid or missing token from {device_id}")
        await websocket.close(code=4401, reason="Unauthorized")
        return

    try:
        assigned_device_id = _sanitize_ws_id(device_id, "device_id") if device_id else f"{device_type}-{secrets.token_hex(4)}"
        assigned_session_id = _sanitize_ws_id(session_id, "session_id") if session_id else f"session-{secrets.token_hex(4)}"
    except ValueError as e:
        logger.warning(f"WebSocket connection rejected: {e}")
        await websocket.close(code=4400, reason=f"Invalid id: {e}")
        return

    await websocket.accept()

    logger.info(
        f"=== WebSocket connected: device={assigned_device_id} "
        f"type={device_type} session={assigned_session_id} ==="
    )

    async def send_message(msg: VoiceMessage):
        try:
            if msg.binary:
                logger.debug(
                    f"[{assigned_session_id}/{assigned_device_id}] → binary {len(msg.binary)} bytes"
                )
                await websocket.send_bytes(msg.binary)
            else:
                logger.debug(
                    f"[{assigned_session_id}/{assigned_device_id}] → {msg.to_json()}"
                )
                await websocket.send_text(msg.to_json())
        except Exception as e:
            logger.warning(f"Send failed for {assigned_device_id}: {e}")

    session = await app.state.session_manager.add_client(
        session_id=assigned_session_id,
        device_id=assigned_device_id,
        device_type=device_type,
        send=send_message,
        character=character,
        mode=mode,
    )

    # Throttle audio log per connection
    _last_audio_log = 0

    try:
        while True:
            message = await websocket.receive()
            metrics.inc_messages()
            logger.debug(
                f"[{assigned_session_id}/{assigned_device_id}] Raw message keys: {list(message.keys())}"
            )

            msg_type = message.get("type", "")
            if msg_type == "websocket.disconnect":
                logger.info(f"[{assigned_device_id}] Disconnect message received")
                break

            if "bytes" in message and message["bytes"]:
                if device_type != "audio":
                    logger.warning(
                        f"[{assigned_device_id}] Dashboard sent binary audio; ignoring"
                    )
                    continue
                pcm = message["bytes"]
                if len(pcm) > _MAX_AUDIO_CHUNK_BYTES:
                    logger.warning(
                        f"[{assigned_device_id}] Audio chunk too large: {len(pcm)} bytes; ignoring"
                    )
                    continue
                # Throttle log to avoid flooding: log first chunk and every ~2 seconds thereafter
                now = asyncio.get_event_loop().time()
                if now - _last_audio_log >= 2.0:
                    logger.info(
                        f"[{assigned_session_id}/{assigned_device_id}] ← binary audio: {len(pcm)} bytes"
                    )
                    _last_audio_log = now
                await session.handle_audio(pcm)

            elif "text" in message:
                text = message["text"]
                logger.info(f"[{assigned_session_id}/{assigned_device_id}] ← text: {text}")
                try:
                    msg = VoiceMessage.from_json(text)
                    if msg.type == MessageType.COMMAND:
                        cmd = CommandType(msg.payload.get("command"))
                        logger.info(
                            f"[{assigned_session_id}/{assigned_device_id}] Command received: {cmd.value}"
                        )
                        await session.handle_command(cmd)
                    elif msg.type == MessageType.CONFIG_CHANGE:
                        character = msg.payload.get("character")
                        mode = msg.payload.get("mode")
                        logger.info(
                            f"[{assigned_session_id}/{assigned_device_id}] Config change: character={character}, mode={mode}"
                        )
                        await session.handle_config_change(character=character, mode=mode)
                    elif msg.type == MessageType.TEXT_INPUT:
                        text = msg.payload.get("text", "")
                        logger.info(
                            f"[{assigned_session_id}/{assigned_device_id}] Text input: {text[:80]}"
                        )
                        await session.handle_text_input(text)
                    elif msg.type == MessageType.PING:
                        await send_message(VoiceMessage(type=MessageType.PONG))
                    else:
                        logger.debug(f"Unhandled message type: {msg.type.value}")
                except Exception as e:
                    logger.error(
                        f"[{assigned_session_id}/{assigned_device_id}] Message parse error: {e}"
                    )

            else:
                logger.warning(
                    f"[{assigned_session_id}/{assigned_device_id}] Unknown message type: {message}"
                )

    except WebSocketDisconnect:
        logger.info(f"[{assigned_device_id}] Client disconnected")
    except Exception as e:
        metrics.inc_error()
        logger.error(f"[{assigned_device_id}] WebSocket error: {e}", exc_info=True)
    finally:
        logger.info(f"[{assigned_device_id}] Cleaning up")
        await app.state.session_manager.remove_client(assigned_session_id, assigned_device_id)


@app.websocket("/ws/voice")
async def voice_websocket(
    websocket: WebSocket,
    device_type: str = Query("audio", enum=["audio", "dashboard"]),
    device_id: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
):
    await _handle_voice_websocket(websocket, device_type, device_id, session_id, token)


@app.websocket("/ws/voice/{device_id}")
async def voice_websocket_by_id(
    websocket: WebSocket,
    device_id: str,
    device_type: str = Query("audio", enum=["audio", "dashboard"]),
    session_id: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
):
    await _handle_voice_websocket(websocket, device_type, device_id, session_id, token)


@app.websocket("/ws/voice/realtime/{device_id}")
async def realtime_voice_websocket(
    websocket: WebSocket,
    device_id: str,
    token: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    client_type: Optional[str] = Query(None),
):
    """Parent-phone microphone client joined via a pairing code.

    The ``token`` query parameter must be the pairing's ``join_token``.
    ``client_type`` is accepted for forward compatibility but treated as audio.
    """
    pairing = await app.state.pairing_manager.get_by_token(token) if token else None
    if not pairing:
        logger.warning(
            f"Realtime WebSocket rejected: invalid or missing join token for {device_id}"
        )
        await websocket.close(code=4401, reason="Unauthorized")
        return

    if session_id and session_id != pairing.session_id:
        logger.warning(
            f"Realtime WebSocket rejected: session_id mismatch for {device_id}"
        )
        await websocket.close(code=4401, reason="Session mismatch")
        return

    # Reuse the shared handler. The admin-token check inside it is bypassed by
    # passing the configured admin token (if any) since we already validated
    # the pairing-specific join token above.
    expected_admin_token = os.environ.get("VOICE_SERVER_API_KEY")
    await _handle_voice_websocket(
        websocket,
        device_type="audio",
        device_id=device_id,
        session_id=pairing.session_id,
        token=expected_admin_token if expected_admin_token else None,
        character=pairing.character,
        mode=pairing.mode,
    )


# ── Static files / root ───────────────────────────────────────────────────────

client_dir = Path(__file__).parent / "client"
if client_dir.exists():
    app.mount("/client", StaticFiles(directory=str(client_dir)), name="client")


@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html><head><title>Casa Voice V3 Dual</title></head>
    <body>
        <h1>Casa Voice V3 Dual</h1>
        <p><a href="/client/index.html">Open PWA Client</a></p>
        <p><a href="/health">Health Check</a></p>
        <p><a href="/api/sessions?token=VOICE_SERVER_API_KEY">Active Sessions</a></p>
    </body></html>
    """


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
