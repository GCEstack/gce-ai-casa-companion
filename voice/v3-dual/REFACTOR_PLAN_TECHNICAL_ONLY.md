# Technical-Only Refactor Plan — Casa Voice V3-Dual

**Date:** 2026-06-28
**Target:** Make the current `v3-dual` voice agent technically stable for 2 months of continuous use on Azure. No compliance or child-safety work included.
**Audience:** Internal/hobby use (you + nephew).

---

## 1. Goals

1. Run for 2 months without crashes, memory leaks, or resource exhaustion.
2. Deploy cleanly to Azure over HTTPS with working WebSocket audio.
3. Survive redeploys and transient API failures.
4. Fix the actual bugs that will bite you during real use.

### Exit Criteria

- [ ] All 67 existing tests pass + new tests for fixed bugs.
- [ ] 7-day soak test with synthetic audio: stable memory/CPU, no leaks.
- [ ] Azure smoke test: HTTPS PWA → WSS → STT → LLM → TTS → audio playback works.
- [ ] Reconnect/ disconnect stress test passes.

---

## 2. Non-Goals

- No COPPA, consent, content moderation, or audit logging.
- No new product features.
- No rewrite into Pipecat/Daily.co.
- No Whisper fine-tuning.

---

## 3. Phases

| Phase | Theme | Duration |
|-------|-------|----------|
| Phase 1 | Critical Azure/Client Fixes | Week 1 |
| Phase 2 | Concurrency & Lifecycle | Week 2 |
| Phase 3 | Provider Resilience | Week 3 |
| Phase 4 | State & Scaling | Week 4 |
| Phase 5 | Soak & Hardening | Week 5–6 |

---

## 4. Phase 1 — Critical Azure/Client Fixes (Week 1)

These will break you immediately on Azure if not fixed.

### 4.1 Fix `ws://` → `wss://`

- **Files:** `client/app.js:23`, `client/audio-device.js:9`
- **Problem:** Browsers block mixed-content `ws://` when the page is served over HTTPS.
- **Fix:** Use `wss://` when `location.protocol === 'https:'`.
- **Validation:** Deploy to Azure, confirm audio flows.

### 4.2 WebSocket Keepalive

- **Files:** `client/app.js`, `client/audio-device.js`, `main.py`
- **Problem:** Azure proxies idle-out WebSockets after ~230 seconds.
- **Fix:** Send ping/pong every 15–20 seconds from client or server.
- **Validation:** Leave a session idle for 10 minutes; it stays connected.

### 4.3 Dockerfile Dependencies

- **Files:** `Dockerfile`
- **Problem:** Missing `libgomp1` may cause `onnxruntime`/`torch` to fail at runtime.
- **Fix:** Add `libgomp1` to apt install.
- **Validation:** Container starts and loads VAD without errors.

### 4.4 Azure Port / Health Check

- **Files:** `Dockerfile`, `main.py`
- **Problem:** Azure App Service needs `WEBSITES_PORT=8080`; basic `/health` doesn't catch provider failures.
- **Fix:**
  - Document `WEBSITES_PORT=8080`.
  - Make `/health` verify STT/LLM/TTS reachability (lightweight smoke check).
- **Validation:** Azure container starts and `/health` returns 200.

### 4.5 Pre-Bake Silero VAD Model

- **Files:** `src/casa_voice/providers/vad.py`, `Dockerfile`
- **Problem:** Downloads model from GitHub at runtime; blocked or slow in Azure.
- **Fix:** Download/bake the Silero model into the Docker image; load from local path.
- **Validation:** Container starts with no outbound GitHub access and VAD still loads.

---

## 5. Phase 2 — Concurrency & Lifecycle (Week 2)

These cause ghost sessions, leaked tasks, and weird race bugs.

### 5.1 Fix SessionManager Race Conditions

- **Files:** `main.py:189-247`
- **Problems:**
  - `_get_or_create` is non-atomic; two concurrent connections for same `session_id` create duplicate sessions.
  - `remove_client` can delete a session while another coroutine is adding a client.
- **Fix:** Add `asyncio.Lock` around `_get_or_create` and the check-remove sequence.
- **Validation:** Concurrent connection tests pass.

### 5.2 Track and Cancel Background Tasks

- **Files:** `src/casa_voice/session/session.py`
- **Problem:** `asyncio.create_task(...)` is fire-and-forget. Tasks keep running after session stop and can touch closed sockets/clients.
- **Fix:** Keep a `self._background_tasks: set[asyncio.Task]`, cancel and await them in `stop()`.
- **Validation:** No orphan tasks after session teardown; no errors on closed WebSockets.

### 5.3 Fix Global Exception Handler for WebSocket

- **Files:** `main.py:167-178`
- **Problem:** Catch-all handler intercepts `WebSocketDisconnect` and returns `JSONResponse`, which is wrong for WebSocket paths.
- **Fix:** Add explicit handlers for `WebSocketDisconnect` and `HTTPException` before the generic fallback.
- **Validation:** Disconnect logs are clean.

### 5.4 Audio Buffer Lock & Alignment

- **Files:** `src/casa_voice/session/audio_buffer.py`, `src/casa_voice/session/session.py`
- **Problems:**
  - `handle_audio` mutates buffers while loops read/clear them.
  - `max_bytes` can be odd, breaking 16-bit sample alignment.
- **Fix:** Add lock around buffer ops; force `max_bytes` even.
- **Validation:** Stress-test audio streaming; no corruption.

### 5.5 State Machine Cleanup

- **Files:** `src/casa_voice/session/session.py`
- **Fixes:**
  - Gate `_trigger_interrupt` to only act when `state == SPEAKING`.
  - Clear `input_buffer`/`vad_buffer` after text-input interrupt.
  - Reset `_pending_utterance` and `_pending_audio` in `_return_to_idle`.
  - Replace 50 ms sleep polling with proper `asyncio.Event` waits.
- **Validation:** Interrupt/reset behavior tests pass.

---

## 6. Phase 3 — Provider Resilience (Week 3)

APIs fail. Make it not ruin a session.

### 6.1 Add Retries to Providers

- **Files:** `src/casa_voice/providers/stt.py`, `src/casa_voice/providers/llm.py`, `src/casa_voice/providers/tts.py`
- **Problem:** No retries; one transient error = silent failed turn.
- **Fix:** Add a shared retry wrapper: 3 attempts, backoff 0.5s, 1s, 2s.
- **Validation:** Simulated provider failures recover.

### 6.2 Fix Factory Misconfigurations

- **Files:** `src/casa_voice/providers/factory.py`
- **Problems:**
  - Only `GEMINI_API_KEY` set → `stt=None` → `AttributeError` on voice input.
  - LLM fallback uses OpenRouter key without checking it exists.
- **Fix:** Fall back through available keys; fail loudly at startup if no STT/LLM is configured.
- **Validation:** Startup rejects impossible config; valid configs work.

### 6.3 TTS Cache Improvements

- **Files:** `src/casa_voice/providers/tts.py`, `src/casa_voice/providers/character_router.py`
- **Problems:**
  - `OpenAIDirectTTS` bypasses cache.
  - Truncated streams can be cached.
  - Cache grows unbounded.
- **Fix:**
  - Route `OpenAIDirectTTS` through `TTSCache`.
  - Verify response completeness before caching.
  - Add LRU eviction (5 000 files or 1 GB).
- **Validation:** Repeated phrases hit cache; disk doesn't grow forever.

### 6.4 Native Audio Delta Parsing

- **Files:** `src/casa_voice/providers/native_audio.py`
- **Problem:** Heuristic `isinstance` parsing of streaming deltas; brittle to API changes.
- **Fix:** Use Pydantic models for delta validation.
- **Validation:** Native audio quick-chat still works.

### 6.5 Streaming Error Feedback

- **Files:** `src/casa_voice/session/streaming.py`
- **Problem:** Streaming pipeline swallows errors; child says something, then silence.
- **Fix:** Broadcast `VoiceMessage.error(...)` and play a cached apology TTS if available.
- **Validation:** Simulated LLM failure produces audible feedback.

---

## 7. Phase 4 — State & Scaling (Week 4)

For 2 months of testing you can probably survive on one Azure instance, but state externalization makes redeploys safe.

### 7.1 Move Session State to Redis

- **Files:** `main.py`, `src/casa_voice/session/session.py`
- **Problem:** All state in memory; redeploy loses active sessions.
- **Fix:**
  - Store session metadata, conversation history, and client list in Redis.
  - Keep ephemeral audio buffers and WebSocket handles in-process.
  - Reconstruct session from Redis on reconnect.
- **Validation:** Redeploy Azure container while a session is active; client reconnects and resumes.

### 7.2 Move Pairing State to Redis

- **Files:** `src/casa_voice/pairing.py`
- **Problem:** Pairing codes in memory; lost on redeploy.
- **Fix:** Store codes in Redis with TTL; use `SETNX` to avoid collisions.
- **Validation:** Pairing works after redeploy.

### 7.3 Bounded Client Event Queue

- **Files:** `src/casa_voice/session/client.py`
- **Problem:** `asyncio.Queue(maxsize=0)` grows forever if SSE consumer is slow.
- **Fix:** Set `maxsize=100`; drop old events when full.
- **Validation:** Slow dashboard doesn't OOM the server.

### 7.4 Close All Providers on Shutdown

- **Files:** `main.py`, `src/casa_voice/providers/*.py`, `src/casa_voice/persistence.py`
- **Problem:** Lifespan doesn't close Gemini LLM, Groq LLM, VAD resources, or Supabase client.
- **Fix:** Close every client/resource in lifespan shutdown; cancel background tasks first.
- **Validation:** Clean shutdown with no `ResourceWarning`.

---

## 8. Phase 5 — Soak & Hardening (Weeks 5–6)

### 8.1 Observability

- Add structured JSON logging with per-turn correlation IDs.
- Export per-step latency metrics: wake→STT, STT→LLM, LLM→TTS audio.
- Add `/metrics` or Azure Application Insights.

### 8.2 Soak Test

- 7-day synthetic session sending audio loops.
- Monitor memory, CPU, file descriptors, Redis memory.
- Verify no task leaks or unclosed HTTP clients.

### 8.3 Chaos Test

- Kill Redis briefly; sessions reconnect.
- Drop one provider; retry/fallback works.
- Reboot Azure container; clients reconnect and resume.

### 8.4 Documentation

- Update `README.md` with Azure deployment steps.
- Add `OPERATIONS.md` for health checks, metrics, and rollback.

---

## 9. Top 10 Fixes (Must-Do)

If you only do some of these, do these:

1. **`wss://` in clients** — required for HTTPS/Azure.
2. **WebSocket keepalive** — prevents Azure idle timeout drops.
3. **SessionManager race locks** — duplicate sessions / ghost clients.
4. **Track and cancel background tasks** — prevents resource leaks.
5. **Externalize session/pairing state to Redis** — survives redeploys.
6. **Provider retries** — transient API failures won't kill turns.
7. **Pre-bake Silero VAD model in Docker** — Azure networks may block runtime download.
8. **Fix STT factory fallback** — `GEMINI_API_KEY`-only config currently crashes on voice input.
9. **TTS cache eviction + OpenAI TTS cache integration** — disk/memory growth.
10. **Bounded client event queue** — slow dashboards won't OOM server.

---

## 10. Azure Quick Reference

| Concern | Fix |
|---------|-----|
| WebSocket protocol | `wss://` when HTTPS |
| Proxy idle timeout | Ping every 15–20 s |
| Container port | `WEBSITES_PORT=8080` |
| Persistent cache | Azure Files mount or Redis/Blob |
| Runtime model download | Pre-bake in Docker image |
| Sticky sessions | Use Redis-backed state |
| Health checks | Verify providers + Redis + Supabase |
| Outbound API access | Allow provider endpoints in NSG |

---

## 11. Estimated Effort

| Phase | Person-Weeks |
|-------|--------------|
| Phase 1 | 0.5–1 |
| Phase 2 | 1 |
| Phase 3 | 1 |
| Phase 4 | 1–1.5 |
| Phase 5 | 1 |
| **Total** | **4.5–5.5 weeks** |

---

## 12. Conclusion

This is a no-BS technical hardening plan. Fix the Azure WebSocket issues, close the race conditions, externalize state, and make providers retry. That gets you from "works on my machine" to "works for 2 months on Azure."
