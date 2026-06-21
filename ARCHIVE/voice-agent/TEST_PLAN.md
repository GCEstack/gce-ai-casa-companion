# Casa Companion Voice Agent — Swarm Testing & Debugging Plan

**Date:** 2026-06-15  
**Project path:** `C:\Users\Dekan AI Brother\Projects\01_ACTIVE\apps-platforms\casa-companion\web-mobile\Casa Companion\voice-agent`  
**Goal:** Test, debug, and identify bugs across all layers of the Casa Companion voice agent. Fix what can be fixed without external credentials; document everything else.

---

## Architecture Summary

```
┌─────────────┐      Opus audio      ┌─────────────────────┐
│  ESP32-S3   │ ◄──────────────────► │  Fly.io Voice Server │
│  companion  │      PCM audio       │  FastAPI /ws/voice   │
└─────────────┘                      └──────────┬──────────┘
       │                                        │
       │ BLE / NFC                              │
       ▼                                        ▼
┌─────────────┐                      ┌─────────────────────┐
│  Tap Board  │                      │  Deepgram Nova-3    │
│  Medallions │                      │  Groq Llama 3.3 70B │
└─────────────┘                      │  Cartesia Sonic 3   │
                                     └─────────────────────┘
                                              │
                                              │ SSE
                                              ▼
                                     ┌─────────────────────┐
                                     │  Vercel Dashboard   │
                                     │  /dashboard + APIs  │
                                     └──────────┬──────────┘
                                                │
                                                ▼
                                     ┌─────────────────────┐
                                     │  Supabase           │
                                     │  parents/devices/   │
                                     │  sessions/medallions│
                                     └─────────────────────┘
```

**Additional component:** A Node.js WebSocket relay (`ws-relay.js`) connects the ESP32 firmware to the React frontend for local dev / tap-board mode. This is **separate** from the voice server WebSocket.

---

## Known Suspected Issues (from manual review)

### Backend (`backend/`)
1. **Import inconsistency:** `main.py`, `audio_pipeline.py`, `session_manager.py`, `prompt_router.py` all do `from config import get_settings`. This works when `PYTHONPATH=/app/app` (Docker), but fails locally unless the env var is set. Should use `from app.config import get_settings` or relative imports.
2. **Deepgram SDK v3.4.0 API compatibility:** `self._connection.send(chunk)` may not be the correct API. The Deepgram SDK v3+ uses `self._connection.send(audio)` but the exact method signature and event handling should be verified.
3. **Short transcript timeout:** `final_transcript(timeout=1.0)` in `_transcript_loop` is aggressive. If the user pauses mid-sentence, the transcript may be lost.
4. **No retry for Groq 429:** The README acknowledges this. Should add `tenacity` or `asyncio` retry.
5. **SSML building duplication:** `prompt_router.wrap_ssml()` exists but is never called. `audio_pipeline.py` builds its own SSML inline. The `TTSPipeline.speak()` passes `mode.ssml_template` to `CartesiaTTSClient.stream()`, which is correct, but the `wrap_ssml` method on `PromptRouter` is dead code.
6. **Session timeout guard:** `session_timeout_seconds` defaults to 30s. If the child is listening to a long story, the session might timeout while the device is still receiving TTS audio. The guard only checks `last_activity`, which is updated on receive, not on send.
7. **CORS origins:** Hardcoded to specific Vercel domains. If the user deploys to a new domain, CORS will fail.

### Dashboard (`dashboard/`)
1. **TypeScript literal bug:** `type ServerState = "idle" | "listening" | "thinking" | "speaking" | unknown;` — `unknown` here is a type literal, not the TypeScript `unknown` type. Should be `"unknown"`.
2. **Missing `command` message type:** `casaProtocol.ts` does not include the `command` type that the backend sends (`{"type": "command", "command": "sleep|kill|timeout"}`). The frontend hook ignores these.
3. **Kill switch API:** The kill switch route sends `Authorization: Bearer ${session.access_token}` to the voice server. The voice server `_verify_dashboard_token` accepts this. Good.
4. **DashboardClient SSE:** The `es.onerror` handler doesn't log the actual error, making debugging hard.
5. **Medallion form:** The `medallionCharacterId` and `medallionModeId` fields are reset after successful registration, but the `characterModes` state is used for both device and medallion. The medallion form uses `characterModes.map((m) => m.character_key)` for the character select but `characterModes.map((mode) => mode.id)` for the mode select. This is inconsistent — the mode select should filter by the selected character.

### Relay (`ws-relay.js`)
1. **Ping/pong handling:** The relay receives `pong` from clients but does not respond to `ping` from the library. The `ws` library auto-responds to ping with pong, but the relay's own `pingInterval` sends `ws.ping()` and expects `ws.on('pong')`. This is fine for the relay's own keepalive.
2. **No auth:** The relay has no authentication. Anyone who discovers the URL can connect and broadcast.
3. **Binary message handling:** If a client sends binary, it broadcasts binary. The firmware JSON protocol should only send text, but binary is tolerated.
4. **No rate limiting:** A malicious client could flood the relay with large voice_stream messages.

### Firmware (`firmware/`)
1. **JSON parser fragility:** `json_find_str` uses `strstr` and `strchr` without bounds checking. If the JSON contains escaped quotes, the parser will break.
2. **Command detection fragility:** `handle_control_json` uses `strstr(json, "\"kill\"")` which could match inside other values (e.g., a description containing the word "kill").
3. **Missing audio TX:** The `ws_tx_task` only reads from `g_voice_tx_queue` and `g_control_tx_queue`. It does not read from `g_pcm_tx_queue` (microphone audio). The firmware never sends audio to the relay or voice server. The `audio_task.c` needs to be inspected for the missing TX path.
4. **Buffer overflow risk:** `json_find_str` needle buffer is 64 bytes. If a key is longer than ~30 chars, `snprintf` will truncate, but the search will fail silently.
5. **No WebSocket auth:** The firmware connects to `CONFIG_CASA_WEBSOCKET_URI` with no token/query param. The voice server requires `?token={api_key}`. The relay doesn't require auth. This means the firmware can't connect to the voice server directly without code changes.

### Integration / Protocol
1. **Protocol mismatch:** The voice server expects binary PCM chunks over WebSocket. The relay/firmware/frontend protocol uses base64-encoded JSON. These are incompatible. The firmware needs to know which mode it's in (relay vs voice server) and send the appropriate format.
2. **Sample rate mismatch:** The voice server uses 16kHz for STT (Deepgram) but the TTS outputs 24kHz (Cartesia). The firmware expects 16kHz for both directions. The TTS audio will play at the wrong speed if not resampled.
3. **Missing `connect` handshake on voice server:** The voice server `/ws/voice/{device_id}` accepts the connection and immediately sets state to `idle`. It does not send a `connect` message. The firmware expects a `connect` message to set state to `online`.

---

## Agent Assignments

### Agent 1: Backend Tester
- **Scope:** `backend/app/*.py`, `backend/Dockerfile`, `backend/requirements.txt`
- **Tasks:**
  1. Verify Python import paths work both in Docker and locally.
  2. Check Deepgram SDK v3.4.0 API compatibility (`send()`, `finish()`, event handlers).
  3. Review `session_manager.py` for concurrency bugs, race conditions, and timeout logic.
  4. Review `audio_pipeline.py` for error handling, retry logic, and SSML construction.
  5. Check `coppa_layer.py` for Supabase query correctness and error handling.
  6. Try running `python -m py_compile` or syntax checks on all files.
  7. Propose fixes for identified bugs.

### Agent 2: Dashboard Tester
- **Scope:** `dashboard/**/*.ts`, `dashboard/**/*.tsx`
- **Tasks:**
  1. Run TypeScript compiler checks (`npx tsc --noEmit`) if possible.
  2. Identify all TypeScript type errors, especially `unknown` literal bug.
  3. Review all API routes for error handling, input validation, and Supabase query correctness.
  4. Check `ConsentForm.tsx` for Stripe integration issues.
  5. Review `useCasaWebSocket.ts` for missing message types and reconnect edge cases.
  6. Check `DashboardClient.tsx` for state management bugs and SSE handling.
  7. Propose fixes for identified bugs.

### Agent 3: Integration & Protocol Tester
- **Scope:** `ws-relay.js`, `relay-test.html`, `backend/app/main.py` (WebSocket/SSE endpoints), `dashboard/lib/casaProtocol.ts`, `firmware/main/websocket_task.c`, `firmware/main/common.h`
- **Tasks:**
  1. Review the relay for correctness, edge cases, and security issues.
  2. Verify the JSON protocol compatibility between firmware, relay, and frontend.
  3. Check that the voice server WebSocket protocol (binary PCM) vs relay protocol (base64 JSON) is documented and handled correctly.
  4. Review the `relay-test.html` for test coverage.
  5. Identify any missing message types in the protocol definitions.
  6. Propose fixes or protocol clarifications.

### Agent 4: Firmware Reviewer
- **Scope:** `firmware/main/*.c`, `firmware/main/*.h`, `firmware/CMakeLists.txt`
- **Tasks:**
  1. Review all C files for memory safety, buffer overflows, and null pointer issues.
  2. Check `websocket_task.c` for JSON parsing correctness and command handling.
  3. Check `audio_task.c` for the missing TX path (microphone audio to WebSocket).
  4. Check `power_mgmt.c` for battery reporting accuracy.
  5. Check `main.c` for task creation order and FreeRTOS resource allocation.
  6. Check `common.c` and `common.h` for protocol constants and state management.
  7. Propose fixes for identified bugs.

---

## Validation Commands

- Backend syntax: `python -m py_compile backend/app/*.py`
- Dashboard types: `cd dashboard && npx tsc --noEmit` (requires `npm install`)
- Relay: `node --check ws-relay.js`
- Firmware: Static analysis via reading; no ESP-IDF build env available in this session.

## Deliverables

Each agent should produce:
1. A numbered list of bugs found, with severity (critical/high/medium/low).
2. For each bug: file path, line number, description, and proposed fix (or test case).
3. Any fixes applied to the copied workspace.
4. A summary of what was checked and what could not be checked (due to missing env/credentials).

---

## Shared Constraints

- **Do not modify files outside your assigned scope** without noting it in the report.
- **Do not commit API keys or secrets** to the test workspace.
- **Do not run tests that require live API keys** (Deepgram, Groq, Cartesia, Stripe, Supabase) unless the user has provided them. Static analysis and local syntax checks are preferred.
- **Report missing credentials** as a finding, not a blocker.
- **Work in the copied workspace:** `C:\Users\Dekan AI Brother\Projects\01_ACTIVE\apps-platforms\casa-companion\web-mobile\Casa Companion\voice-agent`
