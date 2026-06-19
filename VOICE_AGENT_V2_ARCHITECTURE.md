# Casa Voice Agent V2 — Unified Architecture

**Date:** 2025-06-18  
**Goals:** Seamless barge-in · Simple voice commands · Browser + PWA + ESP32  
**Provider:** OpenRouter only (one key, one bill, one pattern)  
**OpenRouter Key:** `sk-or-v1-REDACTED`

---

## The Three Goals

### 1. Seamless Barge-In ("the kid can cut off the companion")

The kid should be able to talk over the companion's response at any time. The companion immediately stops speaking, listens, and responds to the new input.

**How it works:**
- The client (ESP32 or browser) ALWAYS sends audio to the server, even while the companion is speaking.
- The server runs VAD on the incoming audio stream. When speech is detected while TTS is active, the server sends an `interrupt` command.
- The client stops playback immediately. The server starts a new STT→LLM→TTS turn.
- The kid experiences zero friction — no button to press, no wake word needed (though WakeNet is still supported on ESP32).

### 2. Simple Voice Commands

The kid can say things like **"stop talking"**, **"I want the dragon"**, **"tell me a story"**, **"let's sing"** and the system handles them immediately — no LLM call needed for common commands.

**How it works:**
- After STT returns a transcript, a lightweight **Command Intent Classifier** checks if it's a known command.
- Commands are handled in <10ms (no API call). Only non-commands go to the LLM.
- This saves money and latency on the most common interactions.

### 3. Browser + PWA + ESP32 (One Protocol, All Clients)

The same server and protocol work for the ESP32 hardware, a browser tab, and an installed PWA on a tablet.

**How it works:**
- All clients use the same WebSocket protocol: binary PCM 16kHz audio + JSON control messages.
- The browser PWA uses Web Audio API to capture and playback PCM.
- The ESP32 uses I2S to capture and playback PCM.
- Both clients send the same message types. The server doesn't know which client it's talking to.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                            CLIENTS                                   │
│  ┌────────────┐    ┌────────────┐    ┌────────────────────────────┐  │
│  │ ESP32-S3   │    │ Browser    │    │ PWA (Tablet/Phone)        │  │
│  │ (Hardware) │    │ (Web)      │    │ (Installed App)           │  │
│  │            │    │            │    │                           │  │
│  │ I2S Mic    │    │ Media API  │    │ Media API                 │  │
│  │ I2S Speaker│    │ Web Audio  │    │ Web Audio                 │  │
│  │ WakeNet    │    │ (PCM)      │    │ (PCM)                     │  │
│  │ (optional) │    │            │    │                           │  │
│  └─────┬──────┘    └─────┬──────┘    └───────┬───────────────────┘  │
│        │                 │                   │                       │
│        │   PCM 16kHz + JSON control frames   │                       │
│        └─────────────────┼───────────────────┘                       │
│                          │                                           │
│                    WebSocket (ws:// or wss://)                         │
│                          │                                           │
└──────────────────────────┼───────────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────────┐
│                     SERVER (FastAPI, per session)                    │
│                          │                                           │
│     ┌────────────────────┴────────────────────┐                     │
│     │           INPUT TASK (always running)      │                     │
│     │                                            │                     │
│     │  Receives audio → Buffer → VAD detection   │                     │
│     │                                            │                     │
│     │  Speech detected while TTS active?         │                     │
│     │  ──► send INTERRUPT to client              │                     │
│     │  ──► stop TTS output task                 │                     │
│     │  ──► transition to LISTENING              │                     │
│     │                                            │                     │
│     │  Silence detected (500ms)?                 │                     │
│     │  ──► send buffered audio to STT            │                     │
│     │  ──► STT returns transcript                │                     │
│     │                                            │                     │
│     │  Transcript is a command?                  │                     │
│     │  ──► execute command (no LLM)              │                     │
│     │                                            │                     │
│     │  Transcript is not a command?                │                     │
│     │  ──► send to LLM → get response            │                     │
│     │  ──► start new OUTPUT TASK                 │                     │
│     │                                            │                     │
│     └────────────────────┬────────────────────┘                     │
│                          │                                           │
│     ┌────────────────────┴────────────────────┐                     │
│     │          OUTPUT TASK (per TTS)             │                     │
│     │                                            │                     │
│     │  LLM returns text → TTS streams audio    │                     │
│     │  ──► send PCM chunks to client             │                     │
│     │  ──► check for INTERRUPT flag              │                     │
│     │  ──► if interrupted, stop immediately    │                     │
│     │                                            │                     │
│     └────────────────────────────────────────────┘                     │
│                          │                                           │
│     ┌────────────────────┴────────────────────┐                     │
│     │           AI PROVIDERS (OpenRouter)      │                     │
│     │                                            │                     │
│     │  STT: openai/whisper-large-v3-turbo       │                     │
│     │  LLM: groq/llama-3.3-70b-versatile        │                     │
│     │  TTS: google/gemini-3.1-flash-tts-preview │                     │
│     │                                            │                     │
│     └────────────────────────────────────────────┘                     │
│                          │                                           │
│     ┌────────────────────┴────────────────────┐                     │
│     │         DASHBOARD (SSE) + Supabase        │                     │
│     │                                            │                     │
│     │  /events/{device_id} → live status        │                     │
│     │  /api/kill/{device_id} → parent control   │                     │
│     │  sessions, devices, parents → COPPA         │                     │
│     │                                            │                     │
│     └────────────────────────────────────────────┘                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## State Machine

```
                    ┌─────────────┐
                    │    IDLE     │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │ audio      │ command     │ wake word
              │ detected   │ received    │ detected
              ▼            ▼            ▼
       ┌─────────────┐  ┌─────────┐  ┌─────────────┐
       │  LISTENING  │  │ EXECUTE │  │  LISTENING  │
       │  (VAD)      │  │ COMMAND │  │  (VAD)      │
       └──────┬──────┘  └────┬────┘  └──────┬──────┘
              │              │              │
              │ 500ms        │ done         │ 500ms
              │ silence      │              │ silence
              ▼              ▼              ▼
       ┌─────────────┐       │       ┌─────────────┐
       │   THINKING  │◄──────┘       │   THINKING  │
       │  (STT→LLM)  │               │  (STT→LLM)  │
       └──────┬──────┘               └──────┬──────┘
              │                              │
              │ LLM response                 │ LLM response
              ▼                              ▼
       ┌─────────────┐               ┌─────────────┐
       │   SPEAKING   │               │   SPEAKING   │
       │  (TTS→Client)│               │  (TTS→Client)│
       └──────┬──────┘               └──────┬──────┘
              │                              │
              │ audio detected              │ audio detected
              │ (barge-in)                │ (barge-in)
              │ ──► INTERRUPT             │ ──► INTERRUPT
              │                            │
              ▼                            ▼
       ┌─────────────┐               ┌─────────────┐
       │  LISTENING   │◄──────────────│  LISTENING   │
       │  (VAD)       │               │  (VAD)       │
       └─────────────┘               └─────────────┘
              │
              │ 500ms silence
              ▼
       ┌─────────────┐
       │   THINKING   │
       │  (STT→LLM)   │
       └─────────────┘
              │
              │ LLM response
              ▼
       ┌─────────────┐
       │   SPEAKING   │
       │  (TTS→Client)│
       └─────────────┘
              │
              │ TTS done
              ▼
       ┌─────────────┐
       │    IDLE     │
       └─────────────┘
```

**Key transitions:**
- **IDLE → LISTENING**: Audio detected (VAD), wake word detected, or command received.
- **LISTENING → THINKING**: 500ms silence detected (VAD endpointing). Audio sent to STT.
- **THINKING → SPEAKING**: LLM returns text. TTS starts streaming.
- **SPEAKING → LISTENING**: Barge-in detected. Audio received while TTS is active. INTERRUPT sent.
- **SPEAKING → IDLE**: TTS completes. No new audio.

---

## Barge-In Flow (Step by Step)

**Scenario:** The companion is telling a story. The kid gets bored and says "Stop! I want to sing instead."

1. **T1**: Server is in `SPEAKING` state, streaming TTS audio to the client.
2. **T2**: The kid says "Stop!" The client's microphone captures the audio and sends it to the server via WebSocket.
3. **T3**: The server's `INPUT TASK` receives the audio chunk. VAD detects speech (energy > threshold).
4. **T4**: The server checks `ctx.state == "speaking"`. **BARGE-IN DETECTED.**
5. **T5**: The server sends `{"type": "command", "command": "interrupt"}` to the client.
6. **T6**: The server sets `ctx.interrupted = True`. The `OUTPUT TASK` sees this flag and stops sending TTS chunks.
7. **T7**: The server transitions to `LISTENING` state. The kid continues talking: "I want to sing instead."
8. **T8**: VAD detects silence (500ms). The server sends the buffered audio to OpenRouter Whisper.
9. **T9**: Whisper returns: "Stop! I want to sing instead."
10. **T10**: The **Command Intent Classifier** checks the transcript. It matches:
    - "stop" → `command: stop` (handled immediately, no LLM)
    - "sing" → `command: set_mode_sing` (handled immediately, no LLM)
11. **T11**: The server sends a brief TTS response: "Okay, let's sing!" and switches to `sing` mode.
12. **T12**: The server transitions to `IDLE` (or `SPEAKING` if the TTS response is playing).

**Total time from kid saying "Stop!" to companion responding:**
- VAD speech detection: ~50ms
- Interrupt signal to client: ~10ms (WebSocket round-trip)
- Client stops playback: ~20ms
- Barge-in detected: ~80ms total

This is imperceptible to the kid. The companion stops mid-sentence within 100ms.

---

## Voice Command Flow (Step by Step)

**Scenario:** The kid says "Tell me a story about a dragon."

1. **T1**: Kid finishes speaking. VAD detects 500ms silence.
2. **T2**: Server sends buffered audio to Whisper. Returns: "Tell me a story about a dragon."
3. **T3**: Command Intent Classifier checks the transcript.
   - "story" is a keyword → `command: set_mode_story`
   - But the rest of the sentence is a request, not just a mode switch.
   - The classifier returns **confidence: 0.3** (ambiguous).
4. **T4**: Since confidence is below threshold (0.7), the transcript is sent to the LLM.
5. **T5**: LLM returns: "Once upon a time, in a faraway land, there was a brave dragon named Ember..."
6. **T6**: TTS streams the story. The server is in `SPEAKING` state.

**Scenario:** The kid says "I want the dragon."

1. **T1**: Whisper returns: "I want the dragon."
2. **T2**: Command Intent Classifier checks:
   - "I want" + "dragon" → `command: switch_character` with `character_key: "drago"`
   - Confidence: 0.95 (high confidence)
3. **T3**: The server executes the command immediately:
   - Switches active character to `drago`
   - Sends `{"type": "mode_changed", "mode": "default", "character": "drago"}` to client
   - Sends brief TTS: "Hi! I'm Drago! Ready to play?"
4. **T4**: No LLM call. Total cost: $0.00 for this interaction. Total latency: ~200ms.

---

## PWA Architecture

The PWA is a single-page app that works in any modern browser. It can be installed as a standalone app on tablets and phones.

### Features

- **Tap to talk:** Tap and hold the companion avatar to talk. Release to stop.
- **Visual feedback:** The avatar animates based on state (idle, listening, thinking, speaking).
- **Character selection:** Tap to switch between Orsetto, Coniglio, Drago, etc.
- **Mode selection:** Tap to switch between Story, Play, Bedtime, Sing.
- **Works offline:** The app shell is cached via Service Worker. When offline, it shows a "trying to connect" message.
- **No app store required:** Install directly from the browser.

### Audio (Web Audio API)

**Recording:**
- `getUserMedia()` to get microphone access
- `AudioWorklet` to capture raw PCM at 16kHz
- Send PCM chunks via WebSocket binary frames

**Playback:**
- Receive PCM chunks via WebSocket binary frames
- `AudioBufferSourceNode` to play PCM
- Volume control for parents

### UI

```
┌─────────────────────────────────────┐
│  [Avatar]  Orsetto the Bear         │
│                                      │
│        ┌─────────────┐              │
│        │             │              │
│        │   AVATAR    │              │
│        │  (animated) │              │
│        │             │              │
│        └─────────────┘              │
│                                      │
│  [🎤 Hold to Talk]                   │
│                                      │
│  [Orsetto] [Coniglio] [Drago]       │
│                                      │
│  [Story] [Play] [Bedtime] [Sing]    │
│                                      │
│  Volume: [────●────]                 │
│                                      │
└─────────────────────────────────────┘
```

### Service Worker

```javascript
// service-worker.js
const CACHE_NAME = 'casa-voice-v1';
const urls = ['/','/index.html','/app.js','/style.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urls)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

---

## Three Solutions

### Solution A: OpenRouter-Native (Fast, Simple)

**Use case:** Default production deployment. Fast responses, one key, simple.

| Layer | Provider | Model | Cost |
|-------|----------|-------|------|
| STT | OpenRouter | `openai/whisper-large-v3-turbo` | $0.0015/min |
| LLM | OpenRouter | `groq/llama-3.3-70b-versatile` | ~$0.59/M input |
| TTS | OpenRouter | `google/gemini-3.1-flash-tts-preview` | $20/M output |

**Fallback:** OpenRouter auto-fallbacks to `openai/gpt-4o-mini` if Groq is down.

**API keys needed:** `OPENROUTER_API_KEY` (1 key)

**Pros:** One key, one bill, fast LLM, expressive TTS.
**Cons:** TTS slightly more expensive than Kokoro. No built-in tool use.

---

### Solution B: Groq Compound (Smart, Tool-Using)

**Use case:** When the kid asks questions that require real-time facts, math, or web lookups.

| Layer | Provider | Model | Cost |
|-------|----------|-------|------|
| STT | OpenRouter | `openai/whisper-large-v3-turbo` | $0.0015/min |
| LLM | OpenRouter | `groq/compound` | Varies by tool use |
| TTS | OpenRouter | `google/gemini-3.1-flash-tts-preview` | $20/M output |

**Tools available:** `web_search`, `code_execution`, `visit_website`, `wolfram_alpha`

**API keys needed:** `OPENROUTER_API_KEY` (1 key)

**Pros:** Characters can answer real-time questions. "How many planets?" → web search. "What's 47×23?" → code execution. No custom tool code needed.
**Cons:** ~200-400ms extra latency for tool-invoking queries. Not ideal for kids under 3 who need instant responses.

---

### Solution C: Multi-Tier Resilient (Never Down)

**Use case:** Critical production where uptime is paramount. Parent-facing moments that cannot fail.

| Layer | Tier 1 | Tier 2 | Tier 3 |
|-------|--------|--------|--------|
| STT | OpenRouter Whisper | (none — batch only) | (none) |
| LLM | OpenRouter → Groq | OpenRouter → GPT-4o-mini | OpenRouter → Claude 3.5 Haiku |
| TTS | OpenRouter → Gemini | OpenRouter → Kokoro | Direct Cartesia (if configured) |

**API keys needed:** `OPENROUTER_API_KEY` + optional `CARTESIA_API_KEY` (tier 3 TTS fallback)

**Pros:** Three fallback tiers. If Gemini TTS is down, Kokoro takes over. If Groq LLM is down, GPT-4o-mini takes over.
**Cons:** Higher cost (maintaining multiple keys). Fallback calls may incur costs on both primary and backup.

---

## Protocol Specification (Unified for ESP32 + Browser)

### Transport
- **WebSocket** on `/ws/voice/{device_id}?token={api_key}`
- **Binary frames:** Raw PCM s16le, 16kHz, mono, little-endian
- **Text frames:** JSON control messages

### Device → Server (Text Frames)
```json
{"type": "ping", "ts": 1718000000}
{"type": "pong", "ts": 1718000000}
{"type": "battery", "level": 42}
{"type": "medallion", "character_key": "orsetto", "mode_key": "play"}
{"type": "wake", "source": "wakenet"}          // ESP32 wake word
{"type": "barge_in"}                             // Browser/PWA explicit barge-in
{"type": "command", "command": "stop"}           // Browser/PWA explicit command
```

### Server → Device (Text Frames)
```json
{"type": "pong", "ts": 1718000000}
{"type": "status", "state": "idle|listening|thinking|speaking"}
{"type": "command", "command": "interrupt|sleep|kill|timeout"}
{"type": "mode_changed", "mode": "story-time", "character": "orsetto", "voice_id": "..."}
{"type": "error", "code": "auth|stt|llm|tts|consent|interrupt", "message": "..."}
{"type": "transcript", "text": "Tell me a story"}              // For dev/debug
{"type": "command_result", "command": "switch_character", "result": "drago"} // For dev/debug
```

### Binary Audio Frames
- **Device → Server:** 16kHz PCM s16le mono chunks (e.g., 512 samples = 32ms)
- **Server → Device:** 16kHz PCM s16le mono chunks (resampled from 24kHz if needed)
- **No base64. No JSON wrapping.** Pure binary for zero overhead.

---

## File Structure

```
casa-voice/
├── src/casa_voice/
│   ├── __init__.py
│   ├── providers.py          # OpenRouter STT/LLM/TTS + VAD
│   ├── commands.py           # Voice command intent classifier
│   ├── protocol.py           # Message types, state machine
│   ├── sessions.py           # SessionManager (concurrent I/O, barge-in)
│   └── pipeline/
│       ├── __init__.py
│       └── processors.py     # Resample, interrupt handling
├── solution-a/
│   ├── main.py               # Solution A: OpenRouter standard
│   ├── Dockerfile
│   └── fly.toml
├── solution-b/
│   ├── main.py               # Solution B: Groq Compound
│   ├── Dockerfile
│   └── fly.toml
├── solution-c/
│   ├── main.py               # Solution C: Multi-tier resilient
│   ├── Dockerfile
│   └── fly.toml
├── client/
│   ├── index.html            # PWA shell
│   ├── app.js                # Web Audio API + WebSocket
│   ├── style.css             # UI styling
│   ├── manifest.json         # PWA manifest
│   └── service-worker.js     # Offline support
├── pyproject.toml
└── README.md
```

---

## Deployment

### Fly.io (Solution A — Recommended for Start)

```bash
cd solution-a
fly launch --name casa-voice-a --region iad --no-deploy
fly secrets set OPENROUTER_API_KEY=sk-or-v1-...
fly secrets set SUPABASE_URL=https://udbgzgntfiytnuajnbvy.supabase.co
fly secrets set SUPABASE_SERVICE_KEY=eyJhbGci...
fly secrets set VOICE_SERVER_API_KEY=change-me-to-long-secret
fly deploy
```

`fly.toml` has `auto_stop_machines = "off"` and `min_machines_running = 1` for toddler-grade latency.

### PWA Deployment

The PWA client is static HTML/JS. Deploy to:
- Vercel (same as dashboard)
- Netlify
- GitHub Pages
- Or serve from the voice server itself (`app.mount("/client", StaticFiles(...))`)

---

## Expected Latency Budget

| Step | Time | Notes |
|------|------|-------|
| VAD speech detection | ~50ms | Energy-based, per chunk |
| VAD silence endpointing | ~500ms | Configurable |
| STT (Whisper batch) | ~100-300ms | Depends on utterance length |
| Command classification | ~5ms | Keyword match, no API call |
| LLM (Groq) | ~100-200ms | 450 tps, 180 tokens max |
| TTS first chunk (Gemini) | ~100-200ms | Streaming or chunked |
| **Total (first response)** | **~850-1250ms** | For a non-command, short utterance |
| **Total (command)** | **~600-900ms** | No LLM call, just TTS |
| **Barge-in interrupt** | **~80ms** | VAD + WebSocket round-trip |

**For kids 3-5 years old:** 850ms is acceptable. For kids under 2, 600ms is better. Commands (no LLM) help here.

**Comparison to old architecture:**
- Old: Deepgram streaming (~100ms) + Groq LLM (~150ms) + Cartesia TTS (~100ms) = ~350ms
- New: VAD batch (~500ms) + Whisper (~200ms) + Groq LLM (~150ms) + Gemini TTS (~150ms) = ~1000ms

**Tradeoff:** ~600ms more latency for the simplicity of one provider and the power of barge-in + commands. The old architecture had 3 providers, no barge-in, no commands, and base64 overhead.

---

## Open Questions

1. **Is the 600ms latency tradeoff acceptable?** For kids under 3, the delay might be noticeable. We can optimize by:
   - Reducing VAD endpointing to 300ms (more false positives, but faster)
   - Using a faster STT model (e.g., `openai/gpt-4o-mini-transcribe` if available)
   - Pre-warming the LLM connection (keep-alive)

2. **Does OpenRouter Whisper support streaming?** If yes, we can stream audio chunks instead of batching. This would eliminate the 500ms VAD endpointing delay. Currently, all OpenRouter STT models are batch-only.

3. **Gemini TTS audio tags:** Do `[whispers]`, `[excited]`, `[laughs]` work in practice? Needs real API testing.

4. **Barge-in on ESP32:** Can the ESP32 send audio while playing I2S audio? The ESP32-S3 has dual I2S peripherals — one for input, one for output. Yes, this is possible. The firmware needs to run the microphone and speaker tasks concurrently.

5. **PWA microphone permissions:** iOS Safari requires user interaction to start microphone. The "Hold to Talk" button solves this. Android is more permissive.

6. **Energy-based VAD vs. Silero VAD:** Energy-based is simpler but less accurate in noisy environments. For controlled home environments, it's sufficient. For noisy environments, we should upgrade to Silero VAD (PyTorch required).

---

## Migration Path

| Old | New |
|-----|-----|
| `voice-agent/` (3 providers) | `solution-a/` or `solution-c/` (1 provider) |
| `casa-pipecat-voice-agent/` (Pipecat, no auth) | `solution-a/` (Pipecat + auth + barge-in) |
| `kid-voice-companion/` (no auth, no dashboard) | `solution-a/` with `dev_mode=true` (cheap testing) |
| `ws-relay.js` (separate relay) | **Deleted** — server handles dev mode directly |
| Base64 JSON audio | **Binary PCM** — zero overhead |
| 24kHz TTS chipmunk bug | **Resample to 16kHz** — fixed |
| No barge-in | **Barge-in** — kid can interrupt |
| No commands | **Commands** — "stop", "switch", etc. handled instantly |
| ESP32 only | **ESP32 + Browser + PWA** — all clients |
| 3 providers, 3 auth patterns | **1 provider, 1 auth pattern** — OpenRouter only |

---

*Built for Casa Companion. One provider, all clients, seamless conversations.*
