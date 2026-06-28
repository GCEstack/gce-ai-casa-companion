# 2-Month Stability Refactor Plan — Casa Voice V3-Dual

**Date:** 2026-06-28
**Target:** Make the current `v3-dual` voice agent stable, secure, and production-ready for 2 months of continuous user testing on Azure.
**Scope:** Code changes only. No new product features unless required for stability. Compliance/safety controls are included because they are blockers for child-user testing.

---

## 1. Goals & Success Criteria

After this refactor, the system should:

1. Run for 2 months without memory leaks, resource exhaustion, or unexplained crashes.
2. Deploy cleanly to Azure over HTTPS with working WebSocket audio.
3. Survive daily redeploys and transient API failures gracefully.
4. Protect child users with input/output filtering, parental consent, and data retention controls.
5. Support at least one replica; ideally scale horizontally without session affinity.

### Exit Criteria

- [ ] All 67 existing tests pass + 15+ new tests covering the refactored areas.
- [ ] 7-day soak test with synthetic audio shows stable memory/CPU.
- [ ] Azure deployment smoke test passes: HTTPS PWA → WSS → STT → LLM → TTS → audio playback.
- [ ] Security review checklist complete (see §8).
- [ ] Parent consent flow and content safety filter demonstrably active.

---

## 2. Non-Goals

- Do **not** rewrite into Pipecat/Daily.co.
- Do **not** add new characters, games, or learning content.
- Do **not** fine-tune Whisper (validate with Deepgram first).
- Do **not** build native iOS/Android apps.

---

## 3. Phase Overview

| Phase | Theme | Duration | Deliverable |
|-------|-------|----------|-------------|
| Phase 0 | Foundation & Safety | Week 1 | Stable main branch, CI, content safety, consent skeleton |
| Phase 1 | Critical Runtime Fixes | Weeks 2–3 | Race conditions, WebSocket lifecycle, task leaks, Azure WSS |
| Phase 2 | Provider Resilience | Week 4 | Retries, fallback, cache integrity, VAD pre-baking |
| Phase 3 | State Externalization | Weeks 5–6 | Redis-backed sessions & pairing, horizontal scaling |
| Phase 4 | Hardening & Soak | Week 7–8 | Load/soak testing, observability, final Azure tuning |

---

## 4. Phase 0 — Foundation & Safety (Week 1)

### 4.1 Repository Hygiene

- [ ] Purge committed build artifacts from Git history and working tree:
  - `tts_cache/*.pcm`
  - `__pycache__/`
  - `.pytest_cache/`
  - `.env` if present
- [ ] Verify `.gitignore` covers the above.
- [ ] Standardize version strings to `3.0.0-dual` in `pyproject.toml`, headers, and docs.
- [ ] Add CI pipeline (GitHub Actions or Azure DevOps):
  - `ruff check .`
  - `black --check .`
  - `pytest`
  - Docker build smoke test

### 4.2 Safety & Compliance Skeleton

- [ ] Add an async safety gate module `src/casa_voice/safety.py` with:
  - Input filter: PII regex + Azure Content Safety (or local lightweight alternative).
  - Output filter: scan LLM text before TTS.
  - Socratic validator for math mode (refuse direct answers).
- [ ] Integrate the safety gate into `handle_text_input` and the voice transcript path.
- [ ] Add parent consent data model and API stubs:
  - `POST /api/consent` — create consent record.
  - `GET /api/consent/{session_id}` — verify consent before allowing voice sessions.
- [ ] Enforce data retention:
  - Delete audio immediately after STT.
  - Cap `conversation_history` to last 50 turns in memory and DB.
  - Add `retention_days` column (default 30) and nightly cleanup job.
- [ ] Add immutable audit log table in Supabase: `audit_logs(parent_action, timestamp, ip_hash, details)`.

### 4.3 Dockerfile & Dependencies

- [ ] Add `libgomp1` to Dockerfile for `onnxruntime`/`torch`.
- [ ] Pin all dependency versions in `pyproject.toml`.
- [ ] Pre-download Silero VAD model during Docker build and copy into image.

**Exit:** CI green, safety module exists, consent API stubs callable.

---

## 5. Phase 1 — Critical Runtime Fixes (Weeks 2–3)

### 5.1 WebSocket Security & Protocol

- [ ] Validate `character` query parameter against an allow-list before creating `VoiceSession`. Reject with 4400.
- [ ] Move `token` from URL query to WebSocket subprotocol header or first handshake message.
- [ ] Add `MAX_TEXT_FRAME_BYTES` guard in `main.py`; close with 1009 if exceeded.
- [ ] Reject wildcard `CORS_ALLOWED_ORIGINS` when `allow_credentials=True`.

### 5.2 Client-Side Production Fixes

- [ ] Fix `client/app.js:23` and `client/audio-device.js:9` to use `wss://` when page is HTTPS.
- [ ] Add exponential backoff reconnect (2 s → 30 s cap) and offline UI state.
- [ ] Add WebSocket ping/pong every 15–20 s to keep Azure proxies alive.

### 5.3 Session Lifecycle & Race Conditions

- [ ] Add `asyncio.Lock` to `SessionManager._get_or_create` to prevent duplicate sessions.
- [ ] Add manager-level lock around `remove_client` → `session.stop()` → `del self.sessions[...]` sequence.
- [ ] Replace fire-and-forget tasks with a tracked task set in `VoiceSession`:
  ```python
  self._background_tasks: set[asyncio.Task] = set()
  ```
  Cancel and await all tasks in `VoiceSession.stop()`.
- [ ] Fix global exception handler to explicitly handle `WebSocketDisconnect` and `HTTPException` before generic fallback.

### 5.4 Audio Buffer & State Machine

- [ ] Add `asyncio.Lock` around `AudioBuffer` mutation/clearing.
- [ ] Force `max_bytes` to even number to preserve 16-bit alignment.
- [ ] Clear `input_buffer` and `vad_buffer` in `handle_text_input` after triggering interrupt.
- [ ] Reset `_pending_utterance` and `_pending_audio` in `_return_to_idle` and `_trigger_reset`.
- [ ] Gate `_trigger_interrupt` to only act when `state == SPEAKING`.
- [ ] Replace 50 ms sleep loops in `_input_loop` with proper `asyncio.Event` waits.

### 5.5 Pairing Hardening

- [ ] Add per-IP rate limiting on `/api/pairing` creation and validation.
- [ ] Reduce pairing code TTL from 10 min to 5 min.
- [ ] Schedule periodic expired-pairing cleanup in lifespan.

**Exit:** Unit tests for race conditions pass, WSS smoke test on Azure passes, no `ws://` in production client.

---

## 6. Phase 2 — Provider Resilience (Week 4)

### 6.1 STT/LLM/TTS Retry & Fallback

- [ ] Wrap all provider calls with a shared retry decorator:
  - 3 attempts
  - Exponential backoff: 0.5 s, 1 s, 2 s
  - Total timeout per operation ≤ 10 s
- [ ] Fix factory so `GEMINI_API_KEY`-only config falls back to `OpenRouterSTT` if available, or fails loudly at startup.
- [ ] Add friendly spoken error message when no LLM/STT/TTS is available.
- [ ] Streaming pipeline: broadcast `VoiceMessage.error(...)` on failure and, when possible, play a cached apology TTS.

### 6.2 TTS Cache Integrity

- [ ] Integrate `TTSCache` into `OpenAIDirectTTS` so repeated phrases hit cache.
- [ ] Verify response completeness before caching; do not cache truncated streams.
- [ ] Add LRU eviction to `TTSCache`:
  - Max 5 000 files **or** 1 GB
  - Atomic temp-file writes already present; keep them
- [ ] Move cache storage target to Azure Files or Redis for multi-replica consistency (if using multiple replicas before Phase 3, mount shared volume as interim).

### 6.3 VAD & Wake Word

- [ ] Ship Silero model inside Docker image; remove runtime `torch.hub.load` dependency.
- [ ] Add explicit `close()` to `PorcupineWakeWord` and call from `VoiceSession.stop()`.
- [ ] Make VAD energy thresholds configurable per device and optionally auto-calibrate on first 3 seconds of idle audio.
- [ ] Guard `_wait_for_wake_stt` to skip STT fallback when `providers.stt` is `None` and broadcast a config error.

### 6.4 Native Audio Provider

- [ ] Replace heuristic delta parsing with Pydantic models in `native_audio.py`.

**Exit:** Provider tests with simulated failures pass; TTS cache eviction tested; VAD model loads offline.

---

## 7. Phase 3 — State Externalization (Weeks 5–6)

### 7.1 Session State in Redis

- [ ] Introduce `RedisSessionStore` implementing the same interface as the in-memory `SessionManager`.
- [ ] Store per-session state in Redis hashes:
  - `session:{session_id}:metadata` (character, mode, kid_profile, updated_at)
  - `session:{session_id}:history` (conversation turns, capped)
  - `session:{session_id}:clients` (device_id set)
- [ ] Keep ephemeral audio buffers and WebSocket handles in-process; reconstruct session object on reconnect from Redis.
- [ ] Add Redis-backed presence/locks to prevent duplicate session creation across replicas.

### 7.2 Pairing State in Redis

- [ ] Move pairing codes from in-memory dict to Redis with `EX` TTL.
- [ ] Use Redis `SETNX` for code creation to avoid collisions.

### 7.3 Supabase Cleanup

- [ ] Replace sync Supabase calls in `SessionStore` with async client or off-load to a small worker queue.
- [ ] Close Supabase client cleanly on shutdown.

### 7.4 Azure Deployment Config

- [ ] Create `azure/` directory with:
  - `container-apps.bicep` or Terraform for Azure Container Apps
  - `WEBSITES_PORT=8080` for App Service
  - WebSocket enabled
  - Azure Files persistent volume mounted at `/app/tts_cache`
- [ ] Add Azure-specific `.env.azure.example`.

**Exit:** Two local server instances can share a session via Redis; pairing works across instances; Azure infra deploys.

---

## 8. Phase 4 — Hardening & Soak (Weeks 7–8)

### 8.1 Health Checks & Observability

- [ ] Enhance `/health` to verify STT, LLM, TTS, VAD, Redis, and Supabase reachability.
- [ ] Add structured JSON logging with correlation IDs per turn.
- [ ] Export per-step latency metrics (wake→STT, STT→LLM first token, LLM→TTS first audio).
- [ ] Add Prometheus `/metrics` endpoint or Azure Application Insights integration.

### 8.2 Soak & Load Testing

- [ ] 7-day synthetic soak test:
  - 1 concurrent session sending audio loops
  - Measure memory, CPU, file descriptors, Redis memory
  - Verify no task leaks or unclosed HTTP clients
- [ ] Load test:
  - 10 concurrent sessions for 30 min
  - Verify latency < 1 s median, no crashes
- [ ] Chaos test:
  - Kill Redis briefly; sessions reconnect gracefully.
  - Drop STT/LLM/TTS provider; fallback or retry succeeds.

### 8.3 Security Review Checklist

- [ ] Content safety filter blocks a test set of harmful/age-inappropriate inputs.
- [ ] Prompt injection via `character` parameter is rejected.
- [ ] Pairing code brute-force is rate-limited.
- [ ] Token is not present in URL or server logs.
- [ ] Parent consent required before session allows LLM/TTS responses.
- [ ] Audio deleted after STT; transcripts capped and retention-enforced.
- [ ] Hardcoded ESP32 credentials removed from firmware; provisioning path documented.

### 8.4 Documentation

- [ ] Update `README.md` with Azure deployment steps.
- [ ] Add `OPERATIONS.md` covering health checks, metrics, incident response, and rollback.
- [ ] Add `SECURITY.md` summarizing safety layers and consent flow.

**Exit:** Soak test report shows stable memory/CPU; security checklist signed off; Azure deployment documented.

---

## 9. Top 10 Critical Fixes (Do These First)

If scope must be reduced, do not skip these:

1. **Content safety filter + parental consent** — cannot test with children without this.
2. **`wss://` in clients** — current `ws://` breaks HTTPS/Azure production.
3. **SessionManager race locks** — duplicate sessions and ghost clients.
4. **Track and cancel background tasks** — prevents resource leaks.
5. **Externalize session/pairing state to Redis** — required for stable redeploys and scaling.
6. **Provider retries + friendly failure** — transient API errors are inevitable.
7. **Pre-bake Silero VAD model in Docker** — runtime download fails in restricted Azure networks.
8. **Fix `character` prompt injection** — direct LLM manipulation risk.
9. **Rate-limit pairing codes** — brute-force protection.
10. **Bounded client event queue + TTS cache eviction** — prevents memory exhaustion.

---

## 10. Azure-Specific Quick Reference

| Concern | Current State | Required Change |
|---------|---------------|-----------------|
| WebSocket protocol | `ws://` hardcoded | Use `wss://` when served over HTTPS |
| Proxy idle timeout | Default 230 s | Keepalive pings every 15–20 s |
| Container port | 8080 in Dockerfile | Set `WEBSITES_PORT=8080` for App Service |
| Persistent cache | Local disk ephemeral | Mount Azure Files or use Redis/Blob |
| Model downloads | Silero downloads at runtime | Pre-bake into Docker image |
| Sticky sessions | In-memory state | Externalize to Redis or enable ARR affinity temporarily |
| Health checks | Basic 200 | Verify all providers + Redis + Supabase |
| Outbound network | Required for APIs | Ensure NSGs allow provider endpoints |

---

## 11. Estimated Effort

| Phase | Person-Weeks | Notes |
|-------|--------------|-------|
| Phase 0 | 1 | Includes legal review kickoff |
| Phase 1 | 2 | Highest concentration of bug fixes |
| Phase 2 | 1 | Provider resilience + cache |
| Phase 3 | 2 | Redis integration + Azure infra |
| Phase 4 | 1–2 | Soak tests + docs |
| **Total** | **7–8 person-weeks** | One senior backend engineer + Azure DevOps support |

---

## 12. Conclusion

The current `v3-dual` codebase is close to being testable for 2 months, but it needs focused hardening rather than feature expansion. The highest-leverage work is **safety/compliance controls**, **WebSocket/HTTPS fixes for Azure**, **race-condition fixes**, **background task lifecycle**, and **state externalization to Redis**.

Following this plan will convert a working prototype into a stable, auditable, child-safe voice agent suitable for extended real-world testing.
