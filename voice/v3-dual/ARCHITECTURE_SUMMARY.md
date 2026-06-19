# Casa Voice V3 Dual — Architecture Summary & Build Plan
## Date: 2026-06-19
## Project: casa-companion/casa_voice_V3_dual

---

## 1. THE PRODUCT

A voice companion for kids. Parents control it from a browser (computer, tablet, TV). The kid talks to a physical speaker device (ESP32 with mic + speaker, or Bluetooth speaker) and the companion responds with stories, games, and conversation.

**Two modes, one codebase:**
- **Mode A (Browser Audio):** Browser handles mic input + speaker output. For testing, laptops, tablets with built-in audio.
- **Mode B (External Audio):** Browser is a dashboard only. External device (ESP32 or phone via `audio-device.html`) handles all audio. Browser shows status, transcripts, character picker, volume.

---

## 2. KEY DECISIONS FROM THIS SESSION

### Audio Architecture
| Decision | Rationale |
|----------|-----------|
| **Dual-mode (Browser + External)** | Browser for testing/parent control. External device for kid experience. One server, two client types. |
| **Browser = dashboard in Mode B** | No `getUserMedia()`, no `AudioContext`, no mic permissions. Pure UI. |
| **ESP32 = primary audio device** | Dual I2S (I2S0 TX speaker, I2S1 RX mic). Core 0 = WiFi/WebSocket, Core 1 = Audio. |
| **WebSocket protocol unified** | Binary PCM from audio devices. JSON commands from browsers. Server discriminates by message type. |

### Voice Pipeline
| Decision | Rationale |
|----------|-----------|
| **Wake phrase model** | "Hello", "Hey", "Wake up" triggers LISTENING from IDLE. No accidental LLM calls. |
| **Push-to-Talk (toggle mic)** | Click mic ON, click mic OFF. No hold-to-talk (was cutting off on tab/release). |
| **Auto silence detection** | 800ms silence after speech -> auto-process. No "send" button needed. |
| **Barge-in** | "Yo", "WTF", "Hold on", or avatar click/Space bar -> interrupt TTS, return to LISTENING. |
| **Local commands** | "Stop", "Louder", "Softer", "Story mode", "Play mode" -> no LLM call, <10ms. |
| **Character voice routing** | `CharacterVoiceRouter` maps character + mode -> Gemini audio tags (`[excited]`, `[whispers]`, etc.). |
| **Model lock** | Gemini tags ONLY work on `gemini-3.1-flash-tts-preview`. Enforced in code. |
| **Chunking** | Tag text chunked to <500 chars to prevent Gemini from reading tags aloud. |

### VAD (Voice Activity Detection)
| Decision | Rationale |
|----------|-----------|
| **Hybrid VAD** | ESP32: energy gate (threshold=0.025, hysteresis 3-on/10-off). Backend: Silero VAD (lazy-loaded). |
| **Silero fallback** | If Silero fails to load, energy-based fallback on backend. Server never dies. |
| **ESP32 pre-gate** | Filters obvious silence before Wi-Fi transmission. Saves bandwidth. |

### TTS Streaming
| Decision | Rationale |
|----------|-----------|
| **PCM streaming** | `response_format: "pcm"` + `httpx.stream()`. No WAV header parsing. |
| **Download streaming, not generation streaming** | OpenRouter `/audio/speech` streams the response body but buffers full generation. ~400-800ms latency acceptable. |
| **Future: true incremental** | `/chat/completions` with `stream: true` + audio modalities for sub-300ms. Not needed now. |

### Server Architecture
| Decision | Rationale |
|----------|-----------|
| **FastAPI + WebSocket** | Endpoints `/ws/voice` and `/ws/voice/{device_id}`. Handles binary PCM + JSON on same socket. |
| **Solution A (OpenRouter-Native)** | One API key. STT=Whisper Turbo, LLM=Llama 3.3 70B, TTS=Gemini Flash. |
| **Multi-client sessions** | A session groups `audio` devices + `dashboard` clients by `session_id`. Shared history and character. |
| **Device-type routing** | `/ws/voice?device_type=audio|dashboard`. TTS PCM → audio clients only. Transcripts + state changes → all clients. |
| **Device presence events** | `device_connected` / `device_disconnected` broadcast so dashboards know when an audio device joins/leaves. |
| **Config change messages** | `config_change` carries `character` and `mode`; broadcast to all clients so UI stays in sync. |
| **Lifespan management** | FastAPI lifespan creates providers on startup and closes HTTP clients + sessions on shutdown. |
| **WebSocket / SSE auth** | `?token=<VOICE_SERVER_API_KEY>` for basic auth; skipped if env var unset. |
| **SSE events** | `/events/{device_id}` streams state changes, transcripts, config changes for external monitoring. |
| **Supabase persistence** | `voice_sessions` table stores `conversation_history`, `character`, `mode`. Loaded on session start, saved after each turn. |
| **Physical actions (NFC / BT buttons)** | `/api/tap?session_id=...&action=...` triggers commands. Phone audio-device page handles Web NFC + Media Session API. Dashboard has action panel. |

---

## 3. FILE INVENTORY

### Backend (Python)
```
src/casa_voice/
├── __init__.py              <- Package init
├── protocol.py              <- Message types, VoiceState, CommandType, StateMachine
├── commands.py              <- Local keyword classifier (wake, interrupt, commands)
├── providers.py             <- OpenRouter STT/TTS, Silero VAD, CharacterVoiceRouter, resample
├── sessions.py              <- VoiceSession with wake phrase, barge-in, auto-silence
├── persistence.py           <- Supabase session store (history + config)
└── pipeline/
    └── __init__.py          <- Legacy placeholder

main.py                      <- FastAPI entry point (uvicorn main:app)
pyproject.toml               <- Package config (pip install -e .)
tests/
├── integration_test.py      <- Multi-client WebSocket routing test
├── synthetic_audio_test.py  <- Sine-wave PCM smoke test for binary path
├── sse_test.py              <- SSE endpoint auth + event streaming test
├── persistence_test.py      <- Mock Supabase session store unit test
└── tap_test.py              <- /api/tap endpoint tests
scripts/
└── create_supabase_table.py <- Create the voice_sessions table in Supabase
```

### Frontend (PWA)
```
client/
├── index.html               <- PWA shell with mode toggle, avatar, status, character picker, volume, dashboard action panel
├── app.js                   <- Dual-mode Web Audio API + WebSocket (Mode A + Mode B dashboard)
├── audio-device.html        <- Minimal phone audio-device page (streams mic, plays TTS)
├── audio-device.js          <- Phone audio-device logic (connects as device_type=audio); NFC + Media Session + keyboard handlers
├── tap.html                 <- NFC tag confirmation page; calls /api/tap and shows result
├── manifest.json            <- PWA manifest (SVG icon)
├── service-worker.js        <- Offline cache
└── icon.svg                 <- PWA icon
```

### ESP32 Firmware (C)
```
esp32/
├── CMakeLists.txt           <- ESP-IDF project config
└── main/
    ├── CMakeLists.txt       <- Component config (esp_websocket_client, json, driver, ...)
    ├── main.c               <- Entry point, FreeRTOS tasks, button interrupt
    ├── i2s_dual.h / i2s_dual.c <- I2S0 (TX speaker) + I2S1 (RX mic), separate clocks
    ├── vad.h / vad.c        <- Energy gate with hysteresis (0.025 threshold)
    ├── websocket.h / websocket.c <- esp_websocket_client implementation
    ├── wifi.h / wifi.c      <- Wi-Fi station mode
```

---

## 4. BUILD STEPS

### Backend
```powershell
cd "C:\Users\Dekan AI Brother\Projects\ACTIVE\apps-platforms\casa-companion\casa_voice_V3_dual"
pip install -e .
$env:OPENROUTER_API_KEY="sk-or-v1-..."
uvicorn main:app --host 0.0.0.0 --port 8080
```

### Integration Test
```powershell
# Terminal 1: start server
uvicorn main:app --host 127.0.0.1 --port 8080

# Terminal 2
python tests/integration_test.py
```

### Frontend — Mode A (Browser Audio)
Open `http://localhost:8080/client/index.html` in Chrome.

### Frontend — Mode B (Phone as Audio Device)
1. On the phone, open:
   ```
   http://<server-ip>:8080/client/audio-device.html?session_id=kitchen
   ```
2. Allow microphone access.
3. On the parent computer/tablet, open:
   ```
   http://<server-ip>:8080/client/index.html?mode=dashboard&session_id=kitchen
   ```
4. Talk into the phone; dashboard shows transcripts and controls.

### NFC Tags
Program each tag with a URL. When a phone scans the tag, it opens the page and triggers the action.

Direct API call (no confirmation page):
```
http://<server-ip>:8080/api/tap?session_id=kitchen&action=character&character=drago
```

With confirmation page:
```
http://<server-ip>:8080/client/tap.html?session_id=kitchen&action=character&character=drago
```

Available actions:
- `action=character&character=drago|liam|jenny|default`
- `action=mode&mode=story|play|default`
- `action=interrupt`
- `action=reset`
- `action=volume_up` / `action=volume_down`
- `action=scene&scene=bedtime|greeting|joke`
- `action=wake`

### Bluetooth Media Buttons
Pair a Bluetooth media button to the phone running `audio-device.html`. Default mappings:
- Play → wake
- Pause → interrupt
- Next track → next character
- Previous track → previous character
- Seek forward → volume up
- Seek backward → volume down

### ESP32
```bash
cd esp32
idf.py set-target esp32s3
idf.py build
idf.py flash
idf.py monitor
```

---

## 5. TESTING CHECKLIST

### Browser Mode (A)
- [x] Open PWA, mic auto-starts, say "Hello" -> status changes to "Listening"
- [ ] Say "Tell me a story" -> wait 800ms -> companion speaks
- [ ] While speaking, click avatar -> companion stops (barge-in)
- [ ] While speaking, press Space -> companion stops
- [ ] Say "Louder" / "Softer" -> volume changes
- [ ] Say "Reset" -> conversation clears, returns to IDLE
- [x] Switch character to Drago -> config_change broadcast to all clients
- [x] Switch mode to Story -> config_change broadcast to all clients

### External Device Mode (B)
- [x] Browser shows dashboard UI with "Waiting for device..." status area
- [x] Phone audio device page (`audio-device.html`) connects as `?device_type=audio`
- [x] ESP32 (or simulated audio client) connects -> server accepts `?device_type=audio`
- [x] Dashboard connects to same `session_id` -> receives shared state/config
- [x] Dashboard receives `device_connected` event when audio device joins
- [x] Commands from dashboard forwarded to audio client and session
- [x] Server broadcasts transcripts to all clients (audio + dashboards)
- [x] Parent changes character in browser -> config_change broadcast
- [x] Parent clicks interrupt in browser -> audio client receives interrupt command

### Physical Actions (NFC / Bluetooth buttons)
- [x] `/api/tap` endpoint accepts action requests for character, mode, interrupt, reset, volume, scene, wake
- [x] Dashboard action panel sends actions to session
- [x] Phone audio-device page registers Media Session handlers for Bluetooth buttons
- [x] Phone audio-device page registers Web NFC reader for NFC tags
- [x] `tap.html` NFC confirmation page calls `/api/tap` and shows result

---

## 6. KNOWN ISSUES & NEXT STEPS

| Issue | Status | Next Action |
|-------|--------|-------------|
| AudioWorklet browser compatibility | Implemented | ScriptProcessorNode fallback added. Test end-to-end wake phrase in Chrome/Edge. |
| Silero VAD lazy load | Implemented | Loads on first speech detection; energy fallback active if torch fails. |
| ESP32 websocket client | Implemented | Uses `esp_websocket_client`. Build with ESP-IDF to verify component deps. |
| Provider lifecycle / lifespan | Implemented | FastAPI lifespan creates providers + store on startup and closes clients/sessions on shutdown. |
| Device presence events | Implemented | `device_connected` / `device_disconnected` messages broadcast to all clients. |
| SSE events | Implemented | `/events/{device_id}` endpoint streams JSON events for external monitoring. |
| Supabase integration | Implemented | `voice_sessions` table support; run `scripts/create_supabase_table.py` to create table. |
| Auth / device tokens | Implemented | `?token=` query param checked against `VOICE_SERVER_API_KEY`; `/ws/voice` and `/ws/voice/{device_id}` both protected. |
| Device ID routing | Implemented | `/ws/voice/{device_id}` path parameter supported in addition to `?device_id=` query param. |
| Physical actions (NFC / BT) | Implemented | `/api/tap` + `tap.html` + phone Media Session / Web NFC + dashboard action panel. Test with real tags/buttons. |
| Bluetooth audio bridge | Not implemented | Regular Bluetooth speakers use BT Classic A2DP, which browsers cannot access. Use phone audio-device page or ESP32 for now. |
| True incremental TTS | Future | `/chat/completions` with `stream: true` + audio modalities for sub-300ms. |
| Wi-Fi provisioning | Not implemented | Currently hardcoded placeholder SSID/PASS. Add ESP-IDF provisioning for production. |

---

## 7. MERGE STRATEGY WITH EXISTING SOLUTION A

**KEEP from your existing Solution A:**
- `solution-a/main.py` -- auth, Supabase, SSE, device routing, kill endpoint, CORS, lifespan
- `client/` folder structure (if you have existing PWA files)

**REPLACE with this build:**
- `src/casa_voice/protocol.py` -- typed messages, state machine
- `src/casa_voice/commands.py` -- local classifier (new file)
- `src/casa_voice/providers.py` -- PCM streaming, Silero VAD, CharacterVoiceRouter
- `src/casa_voice/sessions.py` -- VoiceSession engine (replace SessionManager internals)
- `esp32/` -- complete firmware (new folder)

**ADAPT:**
- Your `SessionManager` class should wrap `VoiceSession` as the internal engine
- Keep your `handle_connection()` interface, delegate to `VoiceSession`

---

## 8. ENVIRONMENT VARIABLES

```powershell
$env:OPENROUTER_API_KEY="sk-or-v1-REDACTED"
$env:SUPABASE_URL="https://udbgzgntfiytnuajnbvy.supabase.co"
$env:SUPABASE_SERVICE_KEY="REDACTED"
$env:VOICE_SERVER_API_KEY="demo-secret"
$env:PORT="8080"
```

---

## 9. ARCHITECTURE DIAGRAM

```
+-----------------------------------------------------------------------------+
|                              PARENT BROWSER                                  |
|  +--------------+  +--------------+  +--------------+  +--------------+   |
|  |   Avatar     |  |   Status     |  | Character    |  |   Volume     |   |
|  |   (CSS)      |  |   Text       |  |   Picker     |  |   Slider     |   |
|  +--------------+  +--------------+  +--------------+  +--------------+   |
|                                                                             |
|  Mode A: Mic + Speaker (Web Audio API)                                     |
|  Mode B: Dashboard Only (no audio APIs)                                    |
+-----------------------------------------------------------------------------+
                                    |
                                    | WebSocket (JSON control + binary PCM)
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                           FASTAPI SERVER                                     |
|  +------------------------------------------------------------------------+ |
|  |  Session Manager (VoiceSession)                                        | |
|  |  +-- State Machine (IDLE -> LISTENING -> PROCESSING -> SPEAKING)       | |
|  |  +-- Barge-in Detection (VAD loop + command check)                      | |
|  |  +-- Audio Buffer (ring buffer, 10s max)                               | |
|  +------------------------------------------------------------------------+ |
|  +------------------------------------------------------------------------+ |
|  |  Pipeline                                                              | |
|  |  1. Silero VAD (backend) -- speech boundaries                         | |
|  |  2. OpenRouter STT -- Whisper Turbo                                    | |
|  |  3. Command Classifier -- local keywords (<10ms)                        | |
|  |  4. OpenRouter LLM -- Groq Llama 3.3 70B                               | |
|  |  5. CharacterVoiceRouter -- Gemini tags + chunking                    | |
|  |  6. OpenRouter TTS -- Gemini Flash PCM streaming                        | |
|  +------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------+
                                    |
                                    | WebSocket (binary PCM)
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                              KID'S DEVICE                                    |
|  +------------------------------------------------------------------------+ |
|  |  ESP32-S3                                                              | |
|  |  +-- I2S1 RX -> INMP441 (microphone)                                   | |
|  |  +-- I2S0 TX -> MAX98357A (speaker)                                    | |
|  |  +-- VAD: Energy gate (0.025 + hysteresis)                            | |
|  |  +-- Wi-Fi -> WebSocket to server                                     | |
|  |  +-- Mic Button: GPIO 18 (short=interrupt, long=reset)                | |
|  +------------------------------------------------------------------------+ |
|                                                                             |
|  Future: Bluetooth speaker with mic (via ESP32 BT Classic bridge)          |
+-----------------------------------------------------------------------------+
```

---

## 10. CONTACT

Built for: Casa Companion (casa-companion.io)
Local path: C:\Users\Dekan AI Brother\Projects\ACTIVE\apps-platforms\casa-companion\casa_voice_V3_dual
GitHub: https://github.com/GCEstack/gce-ai-casa-companion
