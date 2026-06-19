# KIMI CODE PROMPT: Casa Voice V2 — Dual-Mode Build & Review
# Target: C:\Users\Dekan AI Brother\Projects\ACTIVE\apps-platforms\casa-companion\casa-voice
# Date: 2026-06-19
# Agent: ok-computer (infrastructure/build)

## YOUR MISSION

Review the Casa Voice V2 codebase and build out BOTH Mode A (Browser Audio) and Mode B (Bluetooth/External Audio). The software runs from a parent-controlled browser (computer, tablet, TV). The kid talks to a physical speaker device.

## CONTEXT

This project is at casa-voice/ in the Casa Companion repo. We have:
- A working FastAPI server with WebSocket
- A PWA client with AudioWorklet recording
- ESP32 firmware with dual I2S
- OpenRouter for STT/LLM/TTS
- Wake phrase detection, barge-in, local commands

## REVIEW CHECKLIST (Do This First)

Run through each file and verify against the architecture decisions below. Flag any deviation.

### Backend Review
[ ] `src/casa_voice/protocol.py` — MessageType, VoiceState, CommandType enums correct?
[ ] `src/casa_voice/commands.py` — Wake phrases: "Hello", "Hey", "Wake up", "Wake". Interrupt: "Yo", "WTF", "Hold on", "One sec". End turn: "Send", "End", "Capische". Reset: "Reset". All regex patterns present?
[ ] `src/casa_voice/providers.py` — `response_format: "pcm"` in TTS? `httpx.stream()` used? `CharacterVoiceRouter` locked to `gemini-3.1-flash-tts-preview`? `SileroVAD` lazy-loaded with energy fallback?
[ ] `src/casa_voice/sessions.py` — Wake phrase flow: IDLE -> detect wake -> LISTENING -> auto silence (800ms) -> PROCESSING -> SPEAKING -> back to IDLE. Barge-in while SPEAKING. Interrupt command works. Reset clears history.
[ ] `main.py` — FastAPI app, `/ws/voice` WebSocket, `/health`, static files mounted at `/client`.
[ ] `pyproject.toml` — dependencies: fastapi, uvicorn, httpx, numpy, torch, onnxruntime.

### Frontend Review
[ ] `client/index.html` — PWA shell with avatar, status, character picker, mode picker, volume slider, mic button, debug log.
[ ] `client/app.js` — AudioWorklet recording (not ScriptProcessorNode). Toggle mic (click ON, click OFF). No `end_turn` command sent on release. Wake phrase mode (say "Hello" to start). Space = interrupt. R = reset. Avatar click = barge-in.
[ ] `client/manifest.json` — PWA manifest with SVG icon (not missing PNG).
[ ] `client/service-worker.js` — Caches index.html, app.js, manifest.json, icon.svg.

### ESP32 Firmware Review
[ ] `esp32/main.c` — FreeRTOS tasks on dual cores. Core 0 = WiFi/WebSocket. Core 1 = Audio. Button on GPIO 18 (short press = interrupt, long press = reset).
[ ] `esp32/i2s_dual.c` — I2S0 TX (speaker) + I2S1 RX (mic). SEPARATE BCLK/WS pins. No shared clocks.
[ ] `esp32/vad.c` — Energy gate with hysteresis. Threshold = 0.025. 3 frames to trigger, 10 frames to release.
[ ] `esp32/websocket.c` — Stub. Replace with `esp_websocket_client` from ESP-IDF for production.
[ ] `esp32/wifi.c` — Station mode. SSID/PASS hardcoded. Replace with provisioning for production.

## BUILD TASKS (Do After Review)

### Task 1: Mode A — Browser Audio (Complete & Test)

The browser IS the audio device. Mic + speaker via Web Audio API.

1. Verify `app.js` uses AudioWorklet (not deprecated ScriptProcessorNode)
2. Verify mic is toggle (click ON, click OFF) — not hold-to-talk
3. Verify wake phrase flow: say "Hello" -> "Listening..." -> speak -> auto silence detect -> response
4. Verify barge-in: Space bar or avatar click interrupts TTS
5. Verify character switching changes voice/persona
6. Verify volume slider works
7. Add fallback: if AudioWorklet fails, fallback to ScriptProcessorNode with warning log
8. Test in Chrome, Edge, Firefox. Document any browser-specific issues.

### Task 2: Mode B — Bluetooth/External Audio (Build New)

The browser is a DASHBOARD ONLY. No audio APIs. External device handles all audio.

1. Add mode toggle to PWA UI: [Browser Audio] [External Device]
2. When "External Device" selected:
   - Hide mic button
   - Hide volume slider (or make it send to server -> device)
   - Show "Waiting for device..." status
   - Show "Device connected" when ESP32 or other device connects
   - Show real-time transcript from device
   - Show character/mode controls (still work)
   - Show interrupt button (sends command to server -> device)
3. Server changes:
   - Track which sessions have audio capability (send binary) vs dashboard only (JSON only)
   - When TTS generates audio, send to ALL audio-capable clients in session
   - When dashboard sends interrupt, forward to audio device
   - When device sends transcript, forward to all dashboard clients
4. ESP32 changes:
   - Connect to server WebSocket
   - Stream mic audio as binary PCM
   - Receive TTS audio as binary PCM, play on speaker
   - Send button events as JSON commands
   - Handle server commands (interrupt, reset, volume change)
5. Add device discovery:
   - Server endpoint `/ws/voice` accepts `?device_type=audio` or `?device_type=dashboard`
   - Session manager pairs audio device + dashboard(s) by session or device ID

### Task 3: Integration — Both Modes Working Together

1. Parent opens browser in Mode B (dashboard) on tablet
2. Kid has ESP32 speaker device connected
3. Parent sees "Device connected" and real-time transcript
4. Parent can change character (Drago -> Liam) and kid hears voice change
5. Parent can click interrupt and kid's speaker stops
6. Parent can switch to Mode A on their laptop for testing
7. Both modes share the same conversation history via session

### Task 4: Production Hardening

1. Add `VOICE_SERVER_API_KEY` auth to WebSocket (token query param)
2. Add device ID routing `/ws/voice/{device_id}`
3. Add Supabase session persistence
4. Add SSE events `/events/{device_id}` for external monitoring
5. Add `/api/kill/{device_id}` admin endpoint
6. Add CORS configuration
7. Add proper lifespan startup/shutdown
8. Replace ESP32 websocket stub with `esp_websocket_client`
9. Add Wi-Fi provisioning (not hardcoded SSID/PASS)
10. Add OTA firmware update capability for ESP32

## CRITICAL ARCHITECTURE DECISIONS (Do NOT Change Without Discussion)

1. **Wake phrase model** — IDLE -> "Hello" -> LISTENING. Not push-to-talk.
2. **Toggle mic** — Click ON, click OFF. Not hold-to-talk.
3. **Dual I2S** — I2S0 TX speaker, I2S1 RX mic. Separate BCLK/WS pins. NEVER share clocks.
4. **PCM streaming** — `response_format: "pcm"`. No WAV parsing.
5. **Gemini model lock** — Tags ONLY on `gemini-3.1-flash-tts-preview`.
6. **Hybrid VAD** — ESP32 energy gate (0.025) + backend Silero (lazy-loaded).
7. **One OpenRouter key** — STT + LLM + TTS all via OpenRouter. No Deepgram, no Groq direct, no Cartesia.
8. **Local commands** — Keywords processed in <10ms, no API call. Saves money on common interactions.

## FILE PATHS

Local root: C:\Users\Dekan AI Brother\Projects\ACTIVE\apps-platforms\casa-companion\casa-voice
GitHub: https://github.com/GCEstack/gce-ai-casa-companion

## ENVIRONMENT

```powershell
$env:OPENROUTER_API_KEY="sk-or-v1-REDACTED"
$env:SUPABASE_URL="https://udbgzgntfiytnuajnbvy.supabase.co"
$env:SUPABASE_SERVICE_KEY="REDACTED"
$env:VOICE_SERVER_API_KEY="demo-secret"
$env:PORT="8080"
```

## DELIVERABLES

1. Review report: list of files checked, issues found, fixes applied
2. Mode A: Working browser audio client (tested in Chrome)
3. Mode B: Working dashboard-only client + ESP32 audio device
4. Integration test: both modes running simultaneously
5. Updated ARCHITECTURE_SUMMARY.md with any changes

## CONSTRAINTS

- Do NOT modify sacred API/database code without discussion
- Do NOT add new API keys or providers without discussion
- Do NOT change the wake phrase flow without discussion
- Do NOT change the dual I2S pin configuration without discussion
- Include source URLs for any external libraries or references used
- Test before committing. No "should work" — must be verified.

## START COMMAND

```powershell
cd "C:\Users\Dekan AI Brother\Projects\ACTIVE\apps-platforms\casa-companion\casa-voice"
# Review first, then build
```
