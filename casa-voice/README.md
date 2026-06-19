# Casa Voice V2 — Unified Voice Agent

**OpenRouter-only.** One key. One bill. One provider. Barge-in. Voice commands. PWA + ESP32.

## What Changed from V1

| V1 (Old) | V2 (This) |
|---|---|
| 3 providers (Deepgram + Groq + Cartesia) | **1 provider** (OpenRouter) |
| No barge-in | **Barge-in** — kid interrupts companion mid-sentence |
| No voice commands | **Commands** — "stop", "story", "play" handled instantly |
| ESP32 only | **ESP32 + Browser + PWA** — all clients, same protocol |
| Base64 JSON audio | **Binary PCM** — zero overhead |
| 24kHz chipmunk bug | **Resampled to 16kHz** — fixed |
| Pipecat linear pipeline | **Custom concurrent I/O** — input always running, output per turn |
| 3 codebases | **1 shared package** — all solutions import `casa_voice` |

## Three Solutions

### Solution A: OpenRouter-Native (Fast, Simple)

```bash
cd solution-a
uvicorn main_a:app --host 0.0.0.0 --port 8080
```

| Layer | Model | Price |
|-------|-------|-------|
| STT | `openai/whisper-large-v3-turbo` | $0.0015/min |
| LLM | `groq/llama-3.3-70b-versatile` | ~$0.59/M input |
| TTS | `google/gemini-3.1-flash-tts-preview` | $20/M output |

**Keys needed:** `OPENROUTER_API_KEY` (1 key)

### Solution B: Groq Compound (Smart, Tool-Using)

```bash
cd solution-b
uvicorn main_b:app --host 0.0.0.0 --port 8080
```

Same as A but with `groq/compound` LLM. Auto-selects tools: web_search, code_execution, visit_website, wolfram_alpha.

**Keys needed:** `OPENROUTER_API_KEY` (1 key)

### Solution C: Multi-Tier (Resilient, Never Down)

```bash
cd solution-c
uvicorn main_c:app --host 0.0.0.0 --port 8080
```

OpenRouter auto-fallbacks: Groq → GPT-4o-mini → Claude 3.5 Haiku for LLM. Gemini → Kokoro for TTS.

**Keys needed:** `OPENROUTER_API_KEY` (1 key)

## Quick Start

```bash
# 1. Install
cd casa-voice
pip install -e ".[all]"

# 2. Set env vars
export OPENROUTER_API_KEY=sk-or-v1-...
export SUPABASE_URL=...
export SUPABASE_SERVICE_KEY=...
export VOICE_SERVER_API_KEY=change-me

# 3. Run Solution A
cd solution-a
uvicorn main_a:app --host 0.0.0.0 --port 8080 --reload

# 4. Test health
curl http://localhost:8080/health

# 5. Open PWA client
open http://localhost:8080/client/index.html
```

## Architecture

```
Client (ESP32 or Browser)
  ↓ WebSocket binary PCM 16kHz + JSON control
Server
  ├─ Input Task (always running)
  │   ├── Receives audio
  │   ├── VAD detects speech
  │   ├── Barge-in detection during TTS
  │   ├── Buffers until silence
  │   ├── STT → OpenRouter Whisper
  │   ├── Command classifier (instant, no API)
  │   └── LLM → OpenRouter Groq (if not command)
  └─ Output Task (per TTS turn)
      ├── Streams TTS chunks to client
      └── Stops immediately if interrupted
```

## Protocol

All clients use the same protocol:

- **Binary frames:** Raw PCM s16le, 16kHz, mono
- **Text frames:** JSON control messages

**Device → Server:** `ping`, `battery`, `medallion`, `wake`, `barge_in`
**Server → Device:** `status`, `command` (`interrupt`, `stop`, `sleep`), `mode_changed`, `error`

## Barge-In

The kid can talk over the companion at any time. The server detects speech via VAD while TTS is streaming, sends an `interrupt` command, and starts a new STT→LLM→TTS turn. No button press needed.

## Voice Commands

| Say | Action | Cost |
|-----|--------|------|
| "Stop" / "Stop talking" | Stop immediately | $0.00 |
| "Tell me a story" | Switch to story mode | $0.00 |
| "Let's play" | Switch to play mode | $0.00 |
| "Goodnight" | Switch to bedtime mode | $0.00 |
| "Let's sing" | Switch to sing mode | $0.00 |
| "I want the dragon" | Switch to Drago character | $0.00 |
| "Louder" / "Softer" | Volume up/down | $0.00 |

Commands are handled by keyword matching in <10ms. No LLM call. No API cost.

## PWA Client

The browser client is a Progressive Web App that works on any device:

- **Tap and hold to talk** — works on touchscreens
- **Visual avatar** — animates based on state (idle/listening/thinking/speaking)
- **Character buttons** — tap to switch between Orsetto, Coniglio, Drago
- **Mode buttons** — Story, Play, Bedtime, Sing
- **Volume slider** — parent control
- **Installable** — add to home screen on iOS/Android
- **Offline support** — Service Worker caches the app shell

## Deploy to Fly.io

```bash
cd solution-a
cp ../Dockerfile .
cp ../fly.toml .
fly launch --name casa-voice-a --region iad --no-deploy
fly secrets set OPENROUTER_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... VOICE_SERVER_API_KEY=...
fly deploy
```

`fly.toml` has `auto_stop_machines = "off"` and `min_machines_running = 1` for toddler-grade latency.

## File Structure

```
casa-voice/
├── src/casa_voice/
│   ├── __init__.py
│   ├── providers.py          # OpenRouter STT/LLM/TTS + VAD + resample
│   ├── commands.py           # Voice command intent classifier
│   ├── protocol.py           # Message types, state machine
│   ├── sessions.py           # SessionManager (concurrent I/O, barge-in)
│   └── pipeline/
│       ├── __init__.py
│       └── processors.py     # (legacy, unused in V2)
├── solution-a/
│   └── main.py               # Solution A: OpenRouter standard
├── solution-b/
│   └── main.py               # Solution B: Groq Compound
├── solution-c/
│   └── main.py               # Solution C: Multi-tier resilient
├── client/
│   ├── index.html            # PWA shell
│   ├── app.js                # Web Audio API + WebSocket client
│   ├── manifest.json         # PWA manifest
│   └── service-worker.js     # Offline support
├── Dockerfile
├── fly.toml
├── pyproject.toml
└── README.md                  # This file
```

## Cost Comparison (per 1 hour of use)

| Solution | STT | LLM | TTS | Total |
|----------|-----|-----|-----|-------|
| A (Gemini) | ~$0.09 | ~$0.05 | ~$0.60 | **~$0.74/hr** |
| A (Kokoro dev) | ~$0.09 | ~$0.05 | ~$0.02 | **~$0.16/hr** |
| B (Compound) | ~$0.09 | ~$0.05+ | ~$0.60 | **~$0.74+/hr** |
| C (Multi-tier) | ~$0.09 | ~$0.05 | ~$0.60 | **~$0.74/hr** |

*Assumes: 10 min speech/hour, 1000 tokens LLM, 30k chars TTS.*

## Latency Budget

| Step | Time |
|------|------|
| VAD speech detection | ~50ms |
| VAD silence endpointing | ~500ms (configurable) |
| STT (Whisper batch) | ~100-300ms |
| Command classification | ~5ms |
| LLM (Groq) | ~100-200ms |
| TTS first chunk | ~100-200ms |
| **Total first response** | **~850-1250ms** |
| **Barge-in interrupt** | **~80ms** |

## Migration from Old Voice Agent

| Old | New |
|-----|-----|
| `voice-agent/` | `solution-a/` or `solution-c/` |
| `casa-pipecat-voice-agent/` | `solution-a/` |
| `kid-voice-companion/` | `solution-a/` with `dev_mode=true` |
| `ws-relay.js` | **Deleted** — server handles dev mode |
| Deepgram API key | **Not needed** — OpenRouter handles STT |
| Groq API key | **Not needed** — OpenRouter handles LLM |
| Cartesia API key | **Not needed** — OpenRouter handles TTS |

## Open Questions

1. **OpenRouter TTS streaming:** Does `/audio/speech` support chunked transfer? Currently fetches full audio then chunks server-side. If streaming is supported, latency drops by ~100-200ms.

2. **Gemini audio tags:** Do `[whispers]`, `[excited]`, `[laughs]` work in practice? Needs real API testing.

3. **Barge-in on ESP32:** Can the ESP32 send audio while playing I2S audio? The ESP32-S3 has dual I2S peripherals — one for input, one for output. Firmware needs concurrent microphone + speaker tasks.

4. **PWA microphone permissions:** iOS Safari requires user interaction to start microphone. The "Hold to Talk" button solves this.

5. **Energy-based VAD vs. Silero VAD:** Energy-based is sufficient for quiet home environments. For noisy environments, upgrade to `silero-vad` (PyTorch required).

---

*Built for Casa Companion. One provider. All clients. Seamless conversations.*
