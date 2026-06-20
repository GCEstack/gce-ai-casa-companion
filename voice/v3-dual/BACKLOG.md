# Casa Voice V3 Dual — Backlog

Legend: `[x]` done / `[~]` partial / `[ ]` open

---

## Repository Hygiene

- [ ] **Purge committed `.env` files from Git history.**
  - `voice/v3-dual/.env` should never have been committed.
  - `voice/v3/backend/casa-voice.env` also needs review.
  - Rotate any keys that were exposed.
- [ ] **Remove committed cache/build artifacts.**
  - `tts_cache/*.pcm`
  - `__pycache__`
  - `.pytest_cache`
  - `voice/v3/node_modules/`
  - ESP-IDF installer binaries under `voice/v3/`
- [~] **Add/verify `.gitignore`.**
  - `.env`, `.env.*`, `!.env.example` ✅ added
  - `node_modules/`, `dist/`, `build/`, `.next/` ✅ present
  - `tts_cache/`, `__pycache__/`, `.pytest_cache/` ✅ present
  - `*.exe`, `*.zip`, `tools/` ✅ added
- [ ] **Unify version/naming.**
  - Folder `v3-dual`, README "V3 Dual", `pyproject.toml` currently `2.1.0`, source headers say "V2/V3".
  - Pick one version identifier and apply it everywhere.

## Backend — Reliability & Correctness

- [x] **Fix provider fallback auth bug.**
  - `VoiceProviders` now uses an explicit `openrouter_api_key`; OpenRouter clients are only created when a key is present.
- [x] **Verify `OpenRouterSTT` payload shape.**
  - Switched to OpenAI-compatible `multipart/form-data` upload.
- [~] **Harden `NativeAudioProvider` parsing.**
  - `audio_delta` is handled as both `dict` and `str` with `isinstance` checks and try/except around the stream.
  - Still no formal schema validation (e.g., Pydantic) for the delta structure.
- [x] **Make TTS cache write failures non-fatal.**
  - `OpenRouterTTS.synthesize_stream` now catches/warns on `TTSCache.write` errors without raising.
- [x] **Log or handle send failures in `_broadcast`.**
  - `_notify_client` now catches send failures, logs a warning, and removes the dead client from the session.
- [x] **Fix wake-word audio carry-over.**
  - Now carries over only audio from the detected wake frame onward.
- [x] **Review `KeywordCompressor` stop-word list.**
  - Negation contractions are expanded before stop-word removal so meaning is preserved.
- [x] **Remove adult language from interrupt regex.**
  - Adult phrases removed from `commands.py`.
- [x] **Fix `CharacterVoiceRouter` tag placement.**
  - Tags are now applied only to the first chunk.
- [x] **Fix `_input_loop` busy-wait during TTS.**
  - `await self._speaking.wait()` returned immediately because the event was already set, starving the event loop and blocking TTS network I/O on Windows.
  - Added a manual `asyncio.sleep(0.05)` yield while `_speaking.is_set()`.
- [x] **Reduce idle polling in `_input_loop`.**
  - Wake-word and utterance-collection loops now wait on a `_wake_event` (set by state changes and incoming audio) instead of unconditionally sleeping every 50 ms.
- [x] **Add request/logging IDs per turn.**
  - `VoiceSession` generates a short hex request ID at the start of each turn (wake word or text input) and includes it in key logs via `[session_id/request_id]`.
  - Cleared when the session returns to IDLE.

## Latency & Performance

- [~] **Measure and optimize end-to-end response time.**
  - First-byte TTS latency is logged; add structured per-step timing (VAD, STT, LLM, TTS).
- [ ] **Evaluate faster STT models.**
  - Whisper `turbo`, local `faster-whisper`, Groq `whisper-large-v3-turbo`.
- [ ] **Evaluate faster LLM on OpenRouter.**
  - Lower time-to-first-token for fresh responses.
- [~] **Stream TTS audio earlier.**
  - PCM chunks are already yielded as they arrive; verify client playback starts on first chunk, not after buffering.
- [x] **Silero VAD is lazy-loaded with energy fallback.**
- [ ] **Add local TTS fallback.**
  - Kokoro / Piper for offline use and OpenRouter outages.

## Phone / Bluetooth Speaker Experience

- [ ] **Full end-to-end test with phone-as-mic + Bluetooth speaker.**
- [x] **Media Session API registered** for Bluetooth headset buttons.
- [ ] **Confirm Bluetooth headset buttons map correctly** in real hardware.
- [ ] **Add phone-page battery / connection status indicator.**
- [x] **Keep phone screen awake** while acting as audio device (wake lock).
- [~] **Improve reconnect logic** when phone drops Wi-Fi or switches apps.
  - Basic reconnect exists (`setTimeout(connect, 2000)` in `audio-device.js`). Could add exponential backoff and max-retry handling.
- [ ] **Test with speaker connected directly to PC** (USB audio or Bluetooth dongle).

## Wake Word & Listening

- [x] **Replace STT-based wake detection with local wake-word engine (Porcupine v1.x).**
- [ ] **Train and ship a custom "Hey Casa" `.ppn` model.**
  - Currently defaults to built-in "porcupine".
- [ ] **Test wake-word detection with real human voice at typical speaking distance.**
- [x] **Configurable wake-word sensitivity via `WAKE_WORD_SENSITIVITIES`.**
- [x] **Push-to-talk mode available** (mic button in browser).
- [ ] **Fine-tune VAD thresholds per environment** (quiet room vs. kitchen noise).

## Packaging & Deployment

- [ ] **Add auto-update check** to the desktop shortcut.
- [ ] **Replace open PowerShell window** with system-tray icon + menu.
- [ ] **Build a true Windows installer** (.msi / Inno Setup) that includes Python if missing.
- [ ] **Create signed PWA / installable phone shortcut** for `audio-device.html`.
- [~] **Add optional cloud tunnel** (ngrok / localhost.run) for out-of-home access.
  - `start-casa-tunnel.ps1` uses `localtunnel`; fixed wrong project path.
- [ ] **Windows service mode** so it starts automatically on boot.
- [x] **Production hardening.**
  - ✅ Require `VOICE_SERVER_API_KEY` on WebSocket (`?token=`) — already implemented.
  - ✅ Protect `/api/sessions` and `/api/kill/{device_id}` with `VOICE_SERVER_API_KEY`.
  - ✅ CORS allow-list via `CORS_ALLOWED_ORIGINS` env; defaults to local dev origins and logs a warning if unset.

## Mobile PWA (`apps/mobile`)

- [x] **Create `useVoiceSocket.ts`** — WebSocket client for the v3-dual protocol.
- [x] **Create `useAudioWorklet.ts`** — 16 kHz PCM mic capture + playback.
- [x] **Create `useV3VoiceChat.ts`** — orchestrator that wires socket + audio.
- [x] **Add `text_input` support** to the v3-dual protocol/backend.
- [x] **Switch `CharacterDetail` to `useV3VoiceChat`.**
- [x] **TypeScript build passes** (`npm run build`).
- [x] **End-to-end test** with a live `voice/v3-dual` backend and real API keys.
  - Added `tests/e2e_websocket_text_test.py`.
  - Text input → LLM → TTS PCM streamed back and verified.
- [x] **Add `.env.example`** in `apps/mobile/` documenting `VITE_VOICE_SERVER_URL` and `VITE_VOICE_SERVER_API_KEY`.
- [x] **Confirm autoplay / audio context unlock on iPhone Safari.**
  - Added `unlockAudio()` to `useAudioWorklet`; called from `toggleRecording` and `sendText`.
  - Real-device verification still needed, but the code path is in place.
- [x] **Add connection-status indicator** in the mobile UI.
  - `useV3VoiceChat` exposes `isConnected`/`isConnecting`; `CharacterDetail` shows a colored status dot.

## NFC, Hardware & Integrations

- [x] **`/api/tap` endpoint** accepts character, mode, interrupt, reset, volume, scene, wake actions.
- [x] **Dashboard action panel** sends actions to session.
- [x] **Phone audio-device page** registers Media Session / Web NFC handlers.
- [x] **`tap.html` NFC confirmation page** calls `/api/tap` and shows result.
- [x] **Wire NFC tags to trigger scenes** (`scene_bedtime`, `scene_greeting`, `scene_joke`).
  - `/api/tap`, `tap.html`, dashboard action panel, and phone Web NFC reader all support `scene_*` actions.
- [ ] **Add `/api/tap` NFC tag UID → action mapping** in config.
- [~] **Build the ESP32 firmware** for a dedicated speaker/mic box.
  - ✅ `esp32/websocket.c` now uses `esp_websocket_client` (no longer a stub).
  - ❌ Wi-Fi credentials in `esp32/main/wifi.c` are still hardcoded (`YOUR_WIFI_SSID/PASS`); needs provisioning.
- [ ] **Add push-to-talk physical button support** (USB HID or Bluetooth).

## Commands, Characters & State

- [~] **Make volume/scene commands work reliably** from voice and dashboard.
- [ ] **Add more characters** and confirm persona switching in LLM prompt.
- [x] **Persist session history to Supabase** (table + `SessionStore` implemented; verify end-to-end).
- [x] **Multi-client / multi-session support** from one server.
- [~] **Improve barge-in robustness** during TTS playback.

## Testing & Quality

- [x] **Integration test** for multi-client WebSocket routing.
- [x] **Synthetic audio smoke test** for binary PCM path.
- [x] **SSE endpoint test.**
- [x] **Persistence test.**
- [x] **Tap endpoint test.**
- [x] **Add unit tests for `commands.py`.**
  - `tests/test_commands.py` covers wake-phrase stripping, command classifier, trigger responder, echo responder, and keyword compressor. 29 tests pass.
- [ ] **Add automated end-to-end test** using synthetic audio through the WebSocket.
- [ ] **Run full browser + phone + dashboard smoke test.**
- [ ] **Add linting / formatting checks** to CI (ruff / black).

## Docs

- [x] **Architecture summary.**
- [x] **Code review report.**
- [x] **Wake phrases doc.**
- [ ] **Grandmother-friendly printed quick-start card** (laminate-friendly).
- [ ] **Troubleshooting guide** (no mic, no sound, firewall, wrong IP, OpenRouter errors).
- [ ] **Video walkthrough** under 2 minutes.
- [ ] **Update root `README.md`** to point to `voice/v3-dual` as the active voice backend.

## Cross-Cutting Decisions

- [ ] **Decide canonical voice stack.**
  - `voice/v3-dual` is more complete.
  - `voice/v3` duplicates much of the same engine while also wrapping the legacy `voice-agent` backend.
  - Recommend archiving `voice/v3`, `voice/v2`, `voice/v1`, `voice/agent`, and `voice-agent` once `v3-dual` is validated.
