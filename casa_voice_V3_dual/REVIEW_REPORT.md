# Casa Voice V3 Dual — Code Review Report

**Date:** 2026-06-19  
**Reviewer:** Kimi Code CLI  
**Target:** `C:\Users\Dekan AI Brother\Projects\ACTIVE\apps-platforms\casa-companion\casa_voice_V3_dual`  
**Prompt:** `KIMI_CODE_PROMPT.md`

---

## 1. Backend Review

| File | Check | Status | Notes |
|------|-------|--------|-------|
| `src/casa_voice/protocol.py` | MessageType / VoiceState / CommandType enums | ⚠️ Partial | Docstring still says "Push-to-Talk". `CommandType` contains `START_LISTENING` and `END_TURN` (legacy PTT commands). Wake-phrase mode should not need `START_LISTENING` / `END_TURN`. |
| `src/casa_voice/commands.py` | Wake / interrupt / end-turn / reset regex | ✅ Present with extras | Required phrases are present. Extra aliases (`hello casa`, `hey casa`, `what the fuck`, `send it`, `start over`, etc.) are harmless but not required. |
| `src/casa_voice/providers.py` | `response_format: "pcm"` | ✅ Yes | Confirmed in `OpenRouterTTS.synthesize_stream()`. |
| `src/casa_voice/providers.py` | `httpx.stream()` used | ✅ Yes | Confirmed. |
| `src/casa_voice/providers.py` | `CharacterVoiceRouter` locked to Gemini | ⚠️ Partial | Warns if model is not `gemini-3.1`, but does not reject it. Acceptable. |
| `src/casa_voice/providers.py` | `SileroVAD` lazy-loaded with energy fallback | ❌ No | `SileroVAD` is eagerly initialized in `__init__` and will crash the server if torch/onnx is missing. No energy fallback exists. |
| `src/casa_voice/sessions.py` | Wake flow IDLE → LISTENING → PROCESSING → SPEAKING | ✅ Yes | Implementation matches target flow. Auto silence = 800 ms. Barge-in implemented. Reset clears history. |
| `src/casa_voice/sessions.py` | Barge-in while SPEAKING | ✅ Yes | `_vad_loop()` polls during SPEAKING and triggers interrupt on speech. |
| `main.py` | FastAPI + `/ws/voice` + `/health` + static `/client` | ✅ Yes | Basic server present. |
| `main.py` | Device-type discrimination | ❌ No | Does not accept `?device_type=audio` / `?device_type=dashboard` or route audio to audio-capable clients only. |
| `pyproject.toml` | Required dependencies | ✅ Yes | fastapi, uvicorn, httpx, numpy, torch, onnxruntime all present. |

### Backend Issues Found

1. **SileroVAD eager load (critical)**  
   `VoiceProviders.__init__()` instantiates `SileroVAD()`, which calls `torch.hub.load()` immediately. If the model fails to download/load, the whole server fails to start. Per the architecture decision, it must be lazy-loaded with an energy fallback.

2. **Protocol docstring / command bloat**  
   `protocol.py` still describes a "Push-to-Talk" model and exports `START_LISTENING` / `END_TURN`. The prompt requires wake-phrase mode and "no `end_turn` command sent on release". These legacy commands should be removed or clearly deprecated.

3. **No device-type routing**  
   `main.py` creates one `VoiceSession` per WebSocket and sends all audio back to that single socket. For Mode B, the server must separate audio devices from dashboards and route TTS to audio-capable clients only.

4. **Missing production endpoints**  
   Auth token, `/ws/voice/{device_id}`, SSE events, admin kill endpoint, and CORS are not implemented (expected in Task 4).

---

## 2. Frontend Review

| File | Check | Status | Notes |
|------|-------|--------|-------|
| `client/index.html` | PWA shell | ✅ Yes | Avatar, status, character picker, mode picker, volume slider, mic button, debug log all present. |
| `client/index.html` | Mode A/B toggle | ❌ Missing | No UI to switch between Browser Audio and External Device. |
| `client/app.js` | AudioWorklet recording | ✅ Yes | Inline worklet code is used. |
| `client/app.js` | Toggle mic (click ON/OFF) | ✅ Yes | `toggleRecording()` implemented correctly. |
| `client/app.js` | No `end_turn` on release | ✅ Yes | No `end_turn` sent. |
| `client/app.js` | Wake phrase mode — say "Hello" to start | ❌ Broken | Mic is OFF by default. User must click the mic button before any wake phrase can be heard. This contradicts the required flow. |
| `client/app.js` | Space = interrupt | ⚠️ Partial | Space sends interrupt when speaking, but also toggles recording otherwise. Prompt says "Space = interrupt". |
| `client/app.js` | Avatar click = barge-in | ✅ Yes | Sends `interrupt` command and stops playback. |
| `client/app.js` | Character switching | ⚠️ Partial | UI includes `orsetto` and `coniglio`, which the backend `CharacterVoiceRouter` does not support. Sends `type: "medallion"`, which is not a valid `MessageType` in `protocol.py`. |
| `client/app.js` | Volume slider | ✅ Yes | Local playback gain updated. Not sent to server. |
| `client/app.js` | AudioWorklet fallback | ❌ Missing | No ScriptProcessorNode fallback if AudioWorklet fails. |
| `client/manifest.json` | PWA manifest + SVG icon | ✅ Yes | Correct. |
| `client/service-worker.js` | Cache core files | ✅ Yes | Correct. |

### Frontend Issues Found

1. **Wake-phrase mode is not actually wake-phrase (critical)**  
   The UI instructs the user to "Say 'Hello' or 'Wake up' to start", but the microphone is not recording until the mic button is clicked. The server cannot detect a wake phrase without audio. For true wake-phrase mode, the browser must start recording automatically on page load and stream continuously.

2. **Invalid character/mode message type (critical)**  
   Character and mode buttons send `{ type: "medallion", ... }`. The server only understands `MessageType.COMMAND` and does not handle "medallion". Need to send a valid command or add a new message type and server handler.

3. **Unsupported characters**  
   `orsetto` and `coniglio` are in the UI but not in the backend voice profiles. Need to either add profiles or remove the buttons.

4. **No Mode B dashboard UI**  
   The prompt requires a Mode B "External Device" dashboard-only view. This is entirely missing.

---

## 3. ESP32 Firmware Review

| File | Check | Status | Notes |
|------|-------|--------|-------|
| `esp32/main.c` | FreeRTOS tasks on dual cores | ✅ Yes | Core 0 = WiFi/WebSocket, Core 1 = Audio. |
| `esp32/main.c` | Button GPIO 18 short/long press | ✅ Yes | Short = interrupt, long = reset. |
| `esp32/i2s_dual.c` | I2S0 TX + I2S1 RX, separate BCLK/WS | ✅ Yes | Separate pins per controller. No shared clocks. |
| `esp32/vad.c` | Energy gate 0.025, 3-on / 10-off | ✅ Yes | Matches spec. |
| `esp32/websocket.c` | Production WebSocket client | ❌ Stub | Only queues and logs; no actual `esp_websocket_client` implementation. |
| `esp32/wifi.c` | Station mode provisioning | ❌ Placeholder | Hardcoded `YOUR_WIFI_SSID` / `YOUR_WIFI_PASSWORD`. No provisioning. |

### Firmware Issues Found

1. **WebSocket stub (critical for Mode B)**  
   `websocket.c` does not actually connect or send data. Mode B requires a working ESP32 WebSocket client.

2. **Hardcoded Wi-Fi credentials**  
   Expected to be a stub per the prompt, but needs replacement with provisioning for production.

---

## 4. Overall Architecture / Integration Review

| Requirement | Status | Notes |
|-------------|--------|-------|
| Mode A browser audio | ⚠️ Partial | Core recording/playback works, but wake phrase is broken by requiring mic click first. |
| Mode B external audio | ❌ Not implemented | No dashboard UI, no device-type routing, no ESP32 WebSocket client. |
| Both modes share session history | ❌ Not implemented | Server supports only single-socket sessions. |
| Production hardening | ❌ Not implemented | Auth, device ID routing, Supabase, SSE, admin kill, CORS missing. |

---

## 5. Recommended Fix Order

1. **Backend**: Make `SileroVAD` lazy-loaded with energy fallback. Add `MessageType.CHARACTER_CHANGE` / `MODE_CHANGE` handlers (or reuse commands).
2. **Server**: Implement device-type query params and multi-client session routing (audio vs dashboard).
3. **Frontend Mode A**: Start recording automatically; remove need for initial mic click; fix character/mode messages; add AudioWorklet fallback.
4. **Frontend Mode B**: Add dashboard-only UI with device status, transcript view, interrupt button, and character/mode controls.
5. **ESP32**: Replace WebSocket stub with `esp_websocket_client`; send binary PCM and JSON commands; handle server commands.
6. **Production hardening**: auth, device IDs, Supabase, SSE, admin endpoints, CORS, lifespan.
7. **Testing & docs**: Update `ARCHITECTURE_SUMMARY.md`.
