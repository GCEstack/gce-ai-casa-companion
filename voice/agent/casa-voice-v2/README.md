# Casa Voice V2 — Wake Phrase Edition

Production-ready voice agent for the Casa Companion children's app. Wake phrase architecture, ESP32 firmware, PWA client, and multi-tier TTS fallback.

## Architecture

```
┌─────────────┐     WebSocket (PCM 16kHz)     ┌─────────────────────────────┐
│   ESP32     │ ◄──────────────────────────► │  FastAPI + WebSocket Server  │
│  (I2S0/I2S1)│                               │  ┌─────────────────────────┐  │
└─────────────┘                               │  │  VoiceSession           │  │
                                              │  │  - Wake phrase pipeline │  │
┌─────────────┐     WebSocket (PCM 16kHz)     │  │  - Barge-in (cancel)    │  │
│  Browser    │ ◄──────────────────────────► │  │  - Concurrent I/O       │  │
│  (PWA)      │                               │  └─────────────────────────┘  │
└─────────────┘                               │  ┌─────────────────────────┐  │
                                              │  │  Providers              │  │
                                              │  │  1. Silero VAD (backend)│  │
                                              │  │  2. STT (Whisper Turbo) │  │
                                              │  │  3. Commands (local)    │  │
                                              │  │  4. LLM (Llama 3.3 70B) │  │
                                              │  │  5. TTS (Multi-tier)    │  │
                                              │  └─────────────────────────┘  │
                                              └─────────────────────────────┘
```

## Features

| Feature | Status |
|---------|--------|
| Wake phrases ("Hello", "Hey", "Wake up") | ✅ |
| Interrupt phrases ("Yo", "WTF", "Hold on") | ✅ |
| End-turn phrases ("Send", "Capische", "Done") | ✅ |
| Reset command ("Reset") | ✅ |
| Hardware button (GPIO 18, short=interrupt, long=reset) | ✅ |
| Barge-in during TTS | ✅ |
| Multi-tier TTS fallback (OpenRouter → Groq → Gemini) | ✅ |
| Character voices + modes (story, play, bedtime, sing) | ✅ |
| Supabase auth + device management | ✅ |
| Parent dashboard (SSE events) | ✅ |
| Kill switch (`/api/kill/{device_id}`) | ✅ |
| PWA client (installable, offline cache) | ✅ |
| ESP32-S3 dual I2S firmware | ✅ |

## Quick Start

### Backend

```bash
cd casa-voice-v2
pip install -e ".[all]"
uvicorn main:app --host 0.0.0.0 --port 8080
```

### Environment Variables

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
export SUPABASE_URL="https://...supabase.co"
export SUPABASE_SERVICE_KEY="..."
export VOICE_SERVER_API_KEY="demo-key"
# Optional fallback keys
export GROQ_API_KEY="..."
export GEMINI_API_KEY="..."
```

### PWA Client

Open `http://localhost:8080/client/index.html` in Chrome, tap the microphone, and say "Hello" or "Wake up".

### ESP32

```bash
cd esp32
idf.py set-target esp32s3
idf.py build
idf.py flash
idf.py monitor
```

Update `wifi.c` with your Wi-Fi SSID/password and `main.c` with your server IP.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status, active sessions, provider health |
| `/ws/voice/{device_id}?token=...` | WS | WebSocket voice connection |
| `/events/{device_id}?token=...` | GET | SSE stream for parent dashboard |
| `/api/kill/{device_id}?token=...` | POST | Emergency kill switch |
| `/client/*` | GET | Static PWA files |

## State Machine

```
[IDLE] ──"Hello"──> [WAKE_DETECTED] ──300ms──> [LISTENING]
  │                                              │
  │"Reset"                                       │"Send" / "Capische"
  │                                              │
  └──────────────────────────────────────────────┘
                    │
                    ▼
              [PROCESSING] ──LLM──> [SPEAKING]
                    │                    │
                    │"Yo" / button       │"Yo" / button
                    │                    │
                    └────────────────────┘
                           │
                           ▼
                    [INTERRUPTED] ──> [LISTENING]
```

## Voice Commands

| Command | Phrases | When |
|---------|---------|------|
| **WAKE** | "Hello", "Hey", "Wake up", "Wake" | Only in IDLE |
| **INTERRUPT** | "Yo", "WTF", "Hold on", "One sec" | Only in SPEAKING |
| **END TURN** | "Send", "End", "Capische", "Done" | Only in LISTENING |
| **RESET** | "Reset", "Start over", "Clear session" | Any state |
| **STORY** | "Tell me a story", "Story time" | Any state |
| **PLAY** | "Let's play", "Game time" | Any state |
| **BEDTIME** | "Bedtime", "Goodnight" | Any state |
| **SING** | "Sing a song", "Let's sing" | Any state |
| **CHARACTER** | "Drago", "Liam", "Jenny", "Orsetto", "Coniglio" | Any state |

## File Structure

```
casa-voice-v2/
├── main.py                   ← FastAPI server (auth, SSE, WebSocket)
├── pyproject.toml            ← Package config
├── README.md                 ← This file
├── BUILD_PLAN.md             ← Architecture decisions
├── WAKE_PHRASES.md           ← Wake phrase documentation
├── src/casa_voice/
│   ├── __init__.py
│   ├── protocol.py           ← Message types, state machine, commands
│   ├── providers.py          ← STT, TTS, LLM, VAD, resample
│   ├── commands.py           ← Wake phrase + interrupt classifier
│   ├── sessions.py           ← VoiceSession with wake phrase pipeline
│   └── pipeline/
│       └── __init__.py
├── client/
│   ├── index.html            ← PWA entry point
│   ├── app.js                ← Web Audio API + WebSocket client
│   ├── manifest.json         ← PWA manifest
│   └── service-worker.js     ← Offline cache
└── esp32/
    ├── main.c                ← Entry point + task creation
    ├── wifi.c/h              ← Wi-Fi station
    ├── websocket.c/h         ← WebSocket client (esp_websocket_client)
    ├── i2s_dual.c/h          ← Dual I2S (I2S0 TX + I2S1 RX)
    ├── vad.c/h               ← Energy gate with hysteresis
    └── CMakeLists.txt
```

## License

MIT — Casa Companion Team
