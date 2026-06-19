# Casa Companion WebSocket Protocols

This document describes the two WebSocket protocols used in the Casa Companion project, their message types, and known integration issues.

---

## 1. Relay Protocol (`ws-relay.js`)

**Used for:** ESP32 ↔ Frontend (dashboard) local development and tap-board mode.

### Transport
- JSON text frames over a single WebSocket connection.
- **No authentication required.**
- **No rate limiting applied.**
- A simple broadcast server: every message received from one client is forwarded to all other connected clients.

### Message Types

#### Firmware → Frontend
```json
{"type": "voice_stream", "data": "<base64_16kHz_16bit_mono_pcm>", "character": "coniglio"}
{"type": "status", "state": "online|offline|listening|speaking", "battery": 85, "character": "coniglio", "mode": "story-time"}
{"type": "mode_change", "mode": "story-time", "character": "coniglio"}
```

#### Frontend → Firmware
```json
{"type": "voice_input", "data": "<base64_16kHz_16bit_mono_pcm>"}
{"type": "mode_select", "mode": "story-time", "character": "coniglio"}
{"type": "connect", "character": "coniglio"}
```

### Relay Security & Reliability Findings

| Finding | Severity | Details |
|---------|----------|---------|
| **No authentication** | **High** | Any client can connect to the relay. In a shared or public deployment, this allows unauthorized devices or frontends to inject audio or control messages. Consider adding token validation or origin checks. |
| **No rate limiting** | **Medium** | A malicious client can send huge base64 payloads or flood the relay with messages, consuming memory and bandwidth. Consider adding a maximum payload size (e.g., 64 KB) and per-IP message-rate limits. |
| **Single-client message loss** | **Medium** | If only one client is connected (e.g., only the firmware, no frontend), the `broadcast` function sends to zero peers. The relay logs `no other clients connected to receive message`, but the message is **silently dropped** with no queuing or retry. This is a risk of message loss during transient disconnections or when the frontend reconnects. |
| **Ping/pong keepalive** | **OK** | The relay sends `ws.ping()` every 30 s and expects `ws.on('pong')`. Dead connections are terminated correctly. |
| **Log truncation** | **OK** | `logMessage` truncates `voice_stream` base64 data to 80 characters for readability. This is safe and does not affect the actual relayed payload. |

---

## 2. Voice Server Protocol (`backend/app/main.py`)

**Used for:** ESP32 ↔ Fly.io Voice Server (FastAPI).

### Transport
- **Binary frames:** Raw PCM audio chunks (16 kHz, 16-bit mono little-endian) from the device to the server.
- **Text frames:** JSON control messages in both directions.
- **Authentication:** Required via `?token={api_key}` query parameter on the WebSocket URL (`/ws/voice/{device_id}`).

### Device → Server Message Types

| Type | Example | Description |
|------|---------|-------------|
| `ping` | `{"type": "ping", "ts": 1718000000}` | Keepalive / latency check from device. |
| `pong` | `{"type": "pong", "ts": 1718000000}` | Response to server ping. |
| `battery` | `{"type": "battery", "level": 42}` | Battery percentage update. |
| `medallion` | `{"type": "medallion", "character_key": "orsetto", "mode_key": "play"}` | NFC medallion tap to switch character/mode. |

### Server → Device Message Types

| Type | Example | Description |
|------|---------|-------------|
| `pong` | `{"type": "pong", "ts": 1718000000}` | Response to device ping. |
| `status` | `{"type": "status", "state": "listening"}` | State transition: `idle`, `listening`, `thinking`, `speaking`. |
| `command` | `{"type": "command", "command": "sleep"}` | Server-issued power command (`sleep`, `kill`, `timeout`). Sent when battery < 10% or on parent kill / timeout. |
| `mode_changed` | `{"type": "mode_changed", "mode": "story-time"}` | Acknowledges a character/mode switch initiated by a medallion tap. |
| `error` | `{"type": "error", "code": "auth", "message": "..."}` | Fatal or recoverable error (auth failure, TTS failure, etc.). |

### Server → Dashboard (SSE)

Endpoint: `GET /events/{device_id}` (requires `Authorization: Bearer <jwt>` or `?token=<jwt>`).

| Type | Example | Description |
|------|---------|-------------|
| `connected` | `{"type": "connected"}` | SSE stream started. |
| `status` | `{"type": "status", "device_id": "abc", "state": "speaking", "battery": 85, "timestamp": 1718000000}` | Mirrored device state. |
| `battery` | `{"type": "battery", "device_id": "abc", "battery": 85, "timestamp": 1718000000}` | Battery update. |
| `disconnected` | `{"type": "disconnected", "device_id": "abc", "timestamp": 1718000000}` | Device session ended. |

### Voice Server Implementation Notes
- The `/events/{device_id}` SSE endpoint uses `asyncio.Queue.get()` which correctly blocks when the queue is empty; it does not busy-wait.
- However, the SSE endpoint **does not set `X-Accel-Buffering: no`** in the response headers. When served behind Nginx or similar reverse proxies, this can cause response buffering, delaying or batching events to the dashboard. **Severity: Medium.**
- **Suggested fix:** Add `headers={"X-Accel-Buffering": "no"}` to the `StreamingResponse` in `backend/app/main.py`.

---

## Protocol Comparison

| Aspect | Relay Protocol | Voice Server Protocol |
|--------|---------------|----------------------|
| **Audio encoding** | Base64 inside JSON text frames | Binary PCM frames (no base64 overhead) |
| **Authentication** | None | `?token={api_key}` required |
| **Control messages (device → server)** | `voice_stream`, `status`, `mode_change` | `ping`, `battery`, `medallion`, `pong` |
| **Control messages (server → device)** | `voice_input`, `mode_select`, `connect` (relayed) | `pong`, `status`, `command`, `mode_changed`, `error` |
| **Keepalive** | `ws.ping()` / `ws.on('pong')` every 30 s | `ping`/`pong` JSON messages + TCP keepalive (`keep_alive_enable = true`) |
| **Sample rate (device → server)** | 16 kHz | 16 kHz |
| **Sample rate (server → device)** | 16 kHz (via relay) | 24 kHz (Cartesia TTS) |

---

## Known Integration Issues

### 1. Sample Rate Mismatch — **Critical**
- **Files:** `backend/app/session_manager.py`, `backend/app/audio_pipeline.py`, `firmware/main/common.h`
- **Description:** The voice server receives 16 kHz audio from Deepgram (STT). However, Cartesia TTS outputs **24 kHz** PCM. The firmware expects **16 kHz** for both directions. If the 24 kHz TTS audio is played at 16 kHz, it will sound faster and higher-pitched (chipmunk effect).
- **Proposed fixes (pick one):**
  1. Configure Cartesia TTS to output 16 kHz (if the API supports it).
  2. Resample TTS audio from 24 kHz to 16 kHz in the backend (`audio_pipeline.py`) before sending binary chunks.
  3. Resample audio in the firmware (`audio_task.c` or `websocket_task.c`) from 24 kHz to 16 kHz before playback.

### 2. Firmware Auth Gap — **High**
- **Files:** `firmware/main/websocket_task.c`, `backend/app/main.py`, `firmware/main/Kconfig.projbuild`
- **Description:** The firmware connects to `CONFIG_CASA_WEBSOCKET_URI` with **no query parameters**. The voice server requires `?token={api_key}` for authentication. This means the firmware cannot connect to the voice server without code changes to append the token to the URI.
- **Proposed fix:** Add a `CONFIG_CASA_API_KEY` Kconfig option and construct the URI as `wss://.../ws/voice/{device_id}?token={api_key}` in `websocket_task.c`.

### 3. Missing `command` Type in Frontend Protocol — **Medium**
- **Files:** `dashboard/lib/casaProtocol.ts`, `dashboard/lib/useCasaWebSocket.ts`
- **Description:** The voice server sends `{"type": "command", "command": "sleep"}` when battery < 10%. The frontend TypeScript types (`CasaMessage`) did not include `CommandMessage`, so the hook silently ignored it. The type has been added to `casaProtocol.ts`.
- **Fix applied:** Added `CommandMessage` interface to `casaProtocol.ts` and included it in the `CasaMessage` union.

### 4. SSE Proxy Buffering — **Medium**
- **Files:** `backend/app/main.py`
- **Description:** The `/events/{device_id}` SSE endpoint does not set `X-Accel-Buffering: no`. When served behind Nginx or similar proxies, this can cause response buffering, delaying or batching events to the dashboard.
- **Proposed fix:** Add `headers={"X-Accel-Buffering": "no"}` to the `StreamingResponse` in `backend/app/main.py`.

### 5. Relay Single-Client Message Loss — **Medium**
- **Files:** `ws-relay.js`
- **Description:** The `broadcast` function drops messages when only one client is connected. This can lead to lost `voice_stream` or `status` messages if the frontend is temporarily offline.
- **Proposed fix:** If message durability is required, replace the simple broadcast relay with a small-message broker that queues messages for offline clients (e.g., Redis Pub/Sub, or an in-memory queue per peer with TTL). For the current dev-only use case, this is acceptable but should be documented.

### 6. Relay Security (No Auth / No Rate Limit) — **High**
- **Files:** `ws-relay.js`
- **Description:** The relay accepts any connection and any payload size. This is fine for local development but poses risks if exposed to the internet.
- **Proposed fix:** Add `ws.on('message')` payload size limits (e.g., reject > 64 KB) and optionally validate an `Origin` header or a shared secret token before accepting connections.

---

*Last updated: 2026-06-15 by integration testing swarm.*
