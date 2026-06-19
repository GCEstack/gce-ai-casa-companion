# Casa Voice V2 — Build Plan (Post-Audit)

## Decisions from the 4 Open Questions

| Question | Answer | Implementation |
|----------|--------|----------------|
| OpenRouter TTS streaming? | Download streams, generation does NOT. Use `response_format: "pcm"` and pipe body directly. True incremental audio needs `/chat/completions` with `stream: true` + audio modalities. | `providers.py` — `stream_pcm()` method. Future: `stream_chat_audio()` for v2.1. |
| Gemini audio tags? | `[whispers]`, `[excited]`, `[laughs]` work on `gemini-3.1-flash-tts-preview` ONLY. Chunk to <500 chars/segment. Keep tags in English. | `CharacterVoiceRouter` enforces model lock + chunking. |
| ESP32 dual I2S? | Yes. I2S0 = TX (speaker), I2S1 = RX (mic). Separate BCLK/WS per controller. Core 0 = WiFi/WebSocket, Core 1 = Audio. | `esp32_firmware.c` — dual controller config. |
| Energy VAD accuracy? | 0.015 false-triggers in noise. Hybrid: ESP32 energy gate (0.025 + hysteresis) + backend `silero-vad` for real boundaries. | `esp32/vad.c` — hysteresis gate. `providers.py` — `SileroVAD` class. |

## Solution Choice: Hybrid A+C

- **Default**: Solution A (OpenRouter-native, fast, one key)
- **Resilience**: Solution C's fallback logic baked in — if OpenRouter TTS fails >2x in 60s, switch to Kokoro local (if deployed) or retry with backoff.
- **No Solution B**: Groq Compound is overkill for a kids' companion. Keep it simple.

## Architecture

```
┌─────────────┐     WebSocket (PCM 16kHz)     ┌─────────────────────────────┐
│   ESP32     │ ◄──────────────────────────► │  FastAPI + WebSocket Server │
│  (I2S0/I2S1)│                               │  ┌─────────────────────────┐  │
└─────────────┘                               │  │  Session Manager      │  │
                                              │  │  - State machine        │  │
┌─────────────┐     WebSocket (PCM 16kHz)     │  │  - Barge-in (cancel)    │  │
│  Browser    │ ◄──────────────────────────► │  │  - Concurrent I/O       │  │
│  (PWA)      │                               │  └─────────────────────────┘  │
└─────────────┘                               │  ┌─────────────────────────┐  │
                                              │  │  Pipeline               │  │
                                              │  │  1. Silero VAD (bound)  │  │
                                              │  │  2. STT (Whisper Turbo) │  │
                                              │  │  3. Commands (local)    │  │
                                              │  │  4. LLM (Llama 3.3 70B) │  │
                                              │  │  5. TTS (Gemini PCM)    │  │
                                              │  └─────────────────────────┘  │
                                              └─────────────────────────────┘
```

## File Structure

```
casa-voice-v2/
├── src/casa_voice/
│   ├── __init__.py
│   ├── providers.py          ← OpenRouter STT/TTS + Silero VAD + resample
│   ├── commands.py           ← <10ms keyword classifier
│   ├── protocol.py           ← Message types + state machine
│   ├── sessions.py           ← Concurrent I/O + barge-in
│   └── pipeline/
│       ├── __init__.py
│       └── processors.py
├── main.py                   ← FastAPI server (Solution A optimized)
├── client/
│   ├── index.html
│   ├── app.js                ← Web Audio API + WebSocket
│   ├── manifest.json
│   └── service-worker.js
├── esp32/
│   ├── main.c                ← Entry point + task creation
│   ├── wifi.c / wifi.h       ← Wi-Fi connection
│   ├── websocket.c / .h      ← WebSocket client
│   ├── i2s_dual.c / .h       ← I2S0 (TX) + I2S1 (RX) config
│   ├── vad.c / .h            ← Energy gate with hysteresis
│   └── CMakeLists.txt
├── pyproject.toml
├── Dockerfile
└── README.md
```

## Build Steps

1. **Backend**: `pip install -e ".[all]"` → `uvicorn main:app --host 0.0.0.0 --port 8080`
2. **ESP32**: `idf.py build` → `idf.py flash` → `idf.py monitor`
3. **Client**: Open `http://localhost:8080/client/index.html` in Chrome, install PWA.

## Key Latency Targets

- Barge-in: ~80ms (VAD detect → interrupt sent)
- STT: ~200-400ms (Whisper Turbo)
- LLM: ~300-600ms (Llama 3.3 70B on Groq)
- TTS: ~400-800ms (Gemini Flash TTS, PCM streamed)
- End-to-end: ~1.2-2.0s (kid speaks → companion speaks)
