# Casa Companion — Unified Voice Agent Architecture Proposal

## Current State Analysis

You have **three independent voice agent implementations** in your workspace. Here's what each does:

| Folder | Pipeline Engine | STT | LLM | TTS | Auth | Dashboard | COPPA |
|--------|----------------|-----|-----|-----|------|-----------|-------|
| `voice-agent/` | **Custom FastAPI** (hand-rolled) | Deepgram Nova-3 | Groq Llama 3.3 70B | Cartesia Sonic 3 | ✅ Full Supabase | ✅ SSE + kill switch | ✅ Full layer |
| `casa-pipecat-voice-agent/` | **Pipecat** | Deepgram Nova-3 | OpenAI GPT-4o | ElevenLabs | 🟡 Stubbed | 🟡 SSE + kill switch | 🟡 Stubbed |
| `kid-voice-companion/` | **Pipecat** | Deepgram Nova-3 | OpenAI GPT-4o-mini | ElevenLabs | ❌ None | ❌ None | ❌ None |

### The Friction Points

1. **Three backends, zero code reuse.** Every folder has its own `config.py`, session logic, auth, and pipeline. A bug fix in one (e.g., the SSE buffering fix) doesn't propagate to the others.

2. **Two incompatible protocols.** The `voice-agent` uses binary PCM frames + JSON control messages. The `ws-relay.js` uses JSON text frames with base64-encoded audio. The firmware has to speak different dialects depending on whether it's in dev mode or production.

3. **Sample rate mismatch is still open.** Cartesia outputs 24 kHz. The firmware expects 16 kHz. The `PROTOCOL.md` documents this as Critical but none of the three backends resample. The Pipecat versions set `output_sample_rate=24000` and hope the client deals with it.

4. **TTS audio is base64-encoded in JSON** in the main `voice-agent` (`session_manager.py` line 252-254). That's ~33% bandwidth overhead and additional latency from encode/decode on every chunk. The Pipecat versions send raw binary — that's better.

5. **Pipecat versions lack COPPA, auth, and parent controls.** The `casa-pipecat-voice-agent` has stubs but the real implementation only lives in `voice-agent/`.

6. **The custom `voice-agent` doesn't use Pipecat.** This means you're maintaining your own STT→LLM→TTS orchestration, retry logic, frame buffering, and context aggregation — all problems Pipecat already solved.

7. **Firmware can't connect to the voice server.** The firmware connects to `CONFIG_CASA_WEBSOCKET_URI` with no query params, but the server requires `?token={api_key}` (`PROTOCOL.md` §2.2).

---

## Proposal: One Unified `casa-voice` Server

The goal is a **single backend** that can run in three modes — but shares 100% of the pipeline, auth, and COPPA code.

```
casa-companion/
├── voice/                          ← NEW: unified voice package
│   ├── src/casa_voice/
│   │   ├── __init__.py
│   │   ├── config.py              ← One Settings class (was: 3 copies)
│   │   ├── auth.py                ← Device auth + parent JWT (was: coppa_layer.py)
│   │   ├── sessions.py            ← SessionManager (merge all 3)
│   │   ├── characters.py          ← CharacterMode + PromptRouter
│   │   ├── protocol.py            ← Unified WebSocket protocol
│   │   ├── resample.py            ← NEW: 24kHz→16kHz resampling
│   │   ├── coppa.py               ← COPPA helpers (consent, delete, revoke)
│   │   ├── events.py              ← SSE event queue + broadcast
│   │   ├── pipeline/
│   │   │   ├── __init__.py
│   │   │   ├── pipecat_engine.py  ← Pipecat wrapper with Casa processors
│   │   │   ├── processors.py      ← Custom Pipecat frames:
│   │   │   │   ├── auth_filter.py   # Drop frames until device auth passes
│   │   │   │   ├── coppa_filter.py  # Consent check before session starts
│   │   │   │   ├── character_router.py # Switch voice/prompt on medallion tap
│   │   │   │   ├── ssml_chunker.py    # TTS text chunking + SSML wrapping
│   │   │   │   ├── resample_24to16.py # Audio resample frame processor
│   │   │   │   └── event_broadcaster.py # SSE + dashboard state push
│   │   │   └── providers.py       ← Swappable STT/LLM/TTS backends
│   │   └── firmware/
│   │       └── protocol.md        ← Single protocol spec for ESP32
│   ├── pyproject.toml
│   └── tests/
│
├── voice-server/                   ← One deployable server
│   ├── app/
│   │   ├── main.py                ← FastAPI app (mode: full)
│   │   ├── api.py                 ← REST endpoints (health, kill, devices, etc.)
│   │   └── ws.py                  ← WebSocket endpoint + protocol handshake
│   ├── Dockerfile
│   ├── fly.toml
│   └── .env.example
│
├── voice-relay/                    ← Replaces ws-relay.js
│   ├── app/
│   │   └── main.py                ← FastAPI relay (mode: dev-bridge)
│   └── README.md
│
├── voice-server-dev/               ← Replaces kid-voice-companion test server
│   ├── app/
│   │   └── main.py                ← FastAPI (mode: no-auth, static test client)
│   └── static/
│       └── index.html             ← Browser test client
│
├── firmware/                       ← Single ESP32-S3 firmware
│   └── main/
│       ├── websocket_task.c       ← One protocol implementation
│       └── Kconfig.projbuild      ← One config (server URI, token, rate)
│
└── dashboard/                      ← Unchanged (Next.js 14 + Supabase)
```

---

## The Three Runtime Modes

| Mode | Use Case | Auth | COPPA | Dashboard | Pipecat |
|------|----------|------|-------|-----------|---------|
| **`production`** | Fly.io deployment for real devices | ✅ Full | ✅ Full | ✅ SSE | ✅ Yes |
| **`dev-bridge`** | Local ESP32 ↔ frontend relay | 🟡 Shared secret | ❌ Skip | ❌ Skip | ✅ Yes |
| **`test`** | Browser test client, no hardware | ❌ None | ❌ Skip | ❌ Skip | ✅ Yes |

All three modes import from the **same `casa_voice` package** and just toggle features via `CASA_VOICE_MODE=production|dev-bridge|test`.

---

## The Unified Protocol (One Dialect for All)

Every connection — production server, dev relay, or test client — speaks the same protocol.

### Transport
- **Binary frames:** Raw PCM s16le audio (16 kHz, mono, little-endian). No base64.
- **Text frames:** JSON control messages.

### Device → Server
```json
{"type": "ping", "ts": 1718000000}
{"type": "pong", "ts": 1718000000}
{"type": "battery", "level": 42}
{"type": "medallion", "character_key": "orsetto", "mode_key": "play"}
{"type": "wake", "source": "wakenet"}          // NEW: wake-word detected
```

### Server → Device
```json
{"type": "pong", "ts": 1718000000}
{"type": "status", "state": "idle|listening|thinking|speaking"}
{"type": "command", "command": "sleep|kill|timeout"}
{"type": "mode_changed", "mode": "story-time", "voice_id": "uuid"}
{"type": "error", "code": "auth|stt|llm|tts|consent", "message": "..."}
```

### Audio Flow
```
Device (16kHz PCM) ──► Server ──► Deepgram STT (16kHz)
                                      │
                                      ▼
                                Groq / OpenAI LLM
                                      │
                                      ▼
                                Cartesia / ElevenLabs TTS (24kHz)
                                      │
                                      ▼
                              ┌──────────────┐
                              │ Resample 24→16 │  ← NEW: fixes chipmunk bug
                              │ (scipy or soxr)│
                              └──────────────┘
                                      │
                                      ▼
Device receives 16kHz PCM ◄── Server
```

**Why this matters:** The firmware only has one `websocket_task.c`, one `audio_task.c`, and one set of message parsers. Dev mode and production use identical code paths.

---

## Key Technical Fixes

### 1. Audio Resample (fixes Critical bug #1)

```python
# casa_voice/pipeline/processors/resample_24to16.py
import numpy as np
from scipy import signal
from pipecat.frames.frames import OutputAudioRawFrame, Frame
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection

class Resample24To16(FrameProcessor):
    """Resample TTS output from 24kHz to 16kHz so the ESP32 can play it directly."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Precompute FIR filter: 24kHz → 16kHz = 2/3 decimation
        self._resample_ratio = 16000 / 24000  # 2/3
        self._ leftover = np.array([], dtype=np.int16)

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, OutputAudioRawFrame):
            pcm = np.frombuffer(frame.audio, dtype=np.int16)
            # scipy.signal.resample is cleanest; soxr is faster if available
            resampled = signal.resample(pcm, int(len(pcm) * self._resample_ratio))
            resampled = resampled.astype(np.int16)
            await self.push_frame(
                OutputAudioRawFrame(
                    audio=resampled.tobytes(),
                    sample_rate=16000,
                    num_channels=1,
                ),
                direction
            )
        else:
            await self.push_frame(frame, direction)
```

Alternative: use `soxr` (libsoxr Python bindings) for ~10× lower CPU:
```python
import soxr
resampled = soxr.resample(pcm, 24000, 16000, dtype='int16')
```

### 2. Base64 Elimination (fixes ~33% bandwidth + decode latency)

The current `voice-agent` sends:
```python
{"type": "audio", "seq": 0, "data": "<base64>"}  # 33% overhead
```

The Pipecat versions already send raw binary. We standardize on that. The firmware receives binary PCM frames directly — no JSON parsing, no base64 decode, no `mbedtls_base64_decode` call.

### 3. Pipecat Integration with Casa Custom Frames

```python
# casa_voice/pipeline/pipecat_engine.py
from pipecat.pipeline.pipeline import Pipeline
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.groq.llm import GroqLLMService  # or openai
from pipecat.services.cartesia.tts import CartesiaTTSService
from .processors import (
    AuthFilter,          # Blocks until device auth passes
    CoppaConsentFilter,  # Raises ConsentError if parent consent missing
    CharacterRouter,     # Switches voice/prompt on medallion tap
    Resample24To16,      # Fixes sample rate mismatch
    EventBroadcaster,    # Pushes SSE to dashboard
    SsmlChunker,         # TTS text chunking + SSML wrapping
)

def create_casa_pipeline(
    websocket,
    character: CharacterMode,
    device: dict,
    session_manager: SessionManager,
) -> Pipeline:

    transport = FastAPIWebsocketTransport(websocket, params=...)

    stt = DeepgramSTTService(...)
    llm = GroqLLMService(...)  # or OpenAILLMService
    tts = CartesiaTTSService(..., sample_rate=24000)

    return Pipeline([
        transport.input(),
        AuthFilter(session_manager),          # NEW: gate on auth
        CoppaConsentFilter(session_manager),    # NEW: gate on consent
        stt,
        CharacterRouter(session_manager),       # NEW: medallion tap routing
        LLMContextAggregatorPair(...),
        llm,
        SsmlChunker(character.ssml_template),   # NEW: chunk + SSML
        tts,
        Resample24To16(),                       # NEW: 24→16
        EventBroadcaster(session_manager),      # NEW: dashboard SSE
        transport.output(),
    ])
```

### 4. Firmware Auth Fix (fixes High bug #2)

```c
// firmware/main/websocket_task.c
// Build URI with device_id and token
char uri[256];
snprintf(uri, sizeof(uri),
    "%s/ws/voice/%s?token=%s",
    CONFIG_CASA_WEBSOCKET_URI,
    CONFIG_CASA_DEVICE_ID,
    CONFIG_CASA_API_KEY);
// e.g. wss://casa-voice-agent.fly.dev/ws/voice/dev-001?token=abc123...
```

Add to `Kconfig.projbuild`:
```
config CASA_API_KEY
    string "Voice server API key"
    default ""
    help "API key for device authentication on the voice server."
```

### 5. Unified `casa_voice` Package (eliminates 3× code duplication)

```
casa_voice/
├── config.py          ← Was in 3 places. One Pydantic Settings.
├── auth.py            ← Was coppa_layer.py + session_manager auth
├── sessions.py        ← Merge session_manager.py from all 3
├── characters.py      ← Merge character.py + characters.py + prompt_router.py
├── coppa.py           ← COPPA helpers (unchanged logic, moved)
├── events.py          ← SSE queue management (was in 2 session_managers)
├── protocol.py          ← Message type constants, validators
├── resample.py          ← NEW: audio resampling utilities
└── pipeline/
    ├── pipecat_engine.py
    └── processors/
        ├── auth_filter.py
        ├── coppa_filter.py
        ├── character_router.py
        ├── resample_24to16.py
        ├── event_broadcaster.py
        └── ssml_chunker.py
```

---

## Migration Path

### Phase 1: Extract Shared Package (Week 1)
1. Create `casa_voice/` package from the best parts of all three implementations.
2. Move `coppa_layer.py` → `casa_voice/coppa.py`.
3. Move `prompt_router.py` + `character.py` + `characters.py` → `casa_voice/characters.py`.
4. Write `casa_voice/resample.py` with both `scipy` and `soxr` backends.

### Phase 2: Rebuild `voice-server/` on Top of Package (Week 2)
1. Rewrite `voice-server/app/main.py` to import from `casa_voice`.
2. Wire Pipecat pipeline with Casa custom processors.
3. Add `Resample24To16` to the pipeline.
4. Deploy to Fly.io, verify end-to-end latency.

### Phase 3: Replace `ws-relay.js` with Python Dev Bridge (Week 2-3)
1. Build `voice-relay/` as a lightweight FastAPI app that uses the same `casa_voice` package but runs in `dev-bridge` mode.
2. The relay accepts the **same unified protocol** — it just skips auth and COPPA.
3. Delete `ws-relay.js`.

### Phase 4: Firmware Unification (Week 3)
1. Update `firmware/main/websocket_task.c` to append `?token=` to the URI.
2. Remove base64 JSON audio path — firmware receives binary PCM only.
3. Single `audio_task.c` handles both dev and production.

### Phase 5: Deprecate Old Folders (Week 4)
1. Move `kid-voice-companion/` and `casa-pipecat-voice-agent/` to an `archive/` folder or delete.
2. The `voice-server-dev/` mode replaces the kid-voice-companion test server.
3. Update all READMEs and docs.

---

## Why This Is Better

| Before | After |
|--------|-------|
| 3 backends with duplicated code | 1 shared package, 3 thin deployables |
| 2 protocols (binary vs base64 JSON) | 1 unified protocol everywhere |
| 24kHz TTS → 16kHz device mismatch | Resample processor in pipeline |
| Custom hand-rolled orchestration | Pipecat handles frames, retries, cleanup |
| Firmware has two code paths | One firmware build, one protocol |
| Bug fixes don't propagate | Fix once in `casa_voice`, all deployables get it |
| Base64 encode/decode on every chunk | Raw binary PCM — zero overhead |

---

## Open Questions for You

1. **Do you want to keep Groq + Cartesia** (current main) or switch to **OpenAI + ElevenLabs** (Pipecat versions)? The unified package supports both via `providers.py` — but what's your preferred default?

2. **Pipecat version:** The `kid-voice-companion` uses an older Pipecat API (`worker.run()` vs `WorkerRunner`). Are you open to standardizing on the latest Pipecat release? There are breaking changes between versions.

3. **Resample library:** `scipy.signal.resample` is simplest but adds a dependency. `soxr` is lighter and faster. `librosa` is another option. Preference?

4. **Relay mode:** Should the dev relay do full STT→LLM→TTS (so you can test the whole pipeline without Fly.io) or just passthrough audio (so frontend and ESP32 can talk directly)?
