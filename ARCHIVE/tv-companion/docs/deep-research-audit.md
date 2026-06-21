# Casa Companion — Deep Research Audit

**Repo:** `https://github.com/simplebalance89-ai/casa-companion`  
**Commit:** `491239a` (latest as of audit)  
**Audit Date:** June 14, 2026  
**Auditor:** Automated Deep Research Agent  

---

## Executive Summary

Casa Companion is a voice-enabled AI companion demo for children, built around animated animal characters ("alebrijes"), 13 learning modes, and dual voice pathways: traditional request/response (chat + TTS + STT) and real-time WebRTC conversation via Azure OpenAI's Realtime API. The project is architecturally simple — a single FastAPI backend (`server.py`, ~1,280 lines) and a single-file vanilla HTML/CSS/JS frontend (`static/index.html`, ~4,117 lines) — making it easy to understand but revealing significant production-readiness gaps across security, scalability, observability, and developer experience.

**Key Finding:** The codebase is a functional **MVP demo** that successfully showcases the product concept to Kickstarter backers. However, it lacks nearly all production-grade safeguards: CORS is fully open (`allow_origins=["*"]`), no authentication exists, API keys are injected via environment variables with no rotation strategy, tests require a manually running server and a live Azure key, and there is zero monitoring, logging infrastructure, or error alerting beyond a 100-entry in-memory deque.

---

## Phase 1: Full Architecture Review

### 1.1 Frontend Architecture

| Attribute | Finding |
|---|---|
| **Framework** | None — vanilla HTML/CSS/JS in a single 4,117-line file (`static/index.html`) |
| **Build System** | None — no bundler, no transpilation, no build step |
| **Routing** | Client-side step wizard (5 steps: Welcome → Pick Companion → Talk → Explore Modes → CTA) |
| **State Management** | Global mutable variables (`currentCharacter`, `conversationHistory`, `currentMode`, etc.) |
| **Styling** | Embedded `<style>` block (~1,400 lines), no CSS framework, responsive via media queries |
| **PWA** | Service worker (`sw.js`, 62 lines) with basic cache strategies; manifest.json present |
| **Fonts** | Google Fonts (Playfair Display, Nunito) loaded externally |

**File Structure:**
```
static/
├── index.html          # Main app (4,117 lines) — ALL frontend logic
├── sw.js               # Service worker (62 lines)
├── manifest.json       # PWA manifest
├── tv.html             # TV-mode 2D layered Corvo rig
├── tv3d.html           # Three.js 3D scene (deprecated)
├── tvv.html            # Video-based TV mode
├── tv-live2d.html      # Live2D TV experiment
├── corvo3d.html        # 3D Corvo viewer
├── video-test.html     # Video pipeline test
├── icons/              # PWA icons (192px, 512px)
├── images/heroes/      # 33 character portraits (webp/png)
├── images/tv/corvo/    # Layered PNG assets for TV rig
├── models/corvo/       # Hunyuan 3D GLB meshes
└── videos/corvo/       # Generated idle MP4s
```

**What's Good:** The single-file approach makes the demo trivial to deploy — no build pipeline, no dependency management, no CI complexity. The PWA implementation is functionally correct with proper cache segregation (API calls bypass cache, statics use stale-while-revalidate, HTML uses network-first). The responsive design uses `clamp()` for fluid typography and CSS Grid/Flexbox for layouts.

**What's Concerning:** The 4,117-line `index.html` is unmaintainable at scale. It mixes presentation markup, CSS, application state, WebRTC signaling, audio handling, particle animation (Canvas API), survey logic, demo scripting, and error logging all in one file. There is no module system, no type safety, and no component reuse.

---

### 1.2 Backend Architecture

| Attribute | Finding |
|---|---|
| **Framework** | FastAPI (Python 3.11) |
| **Server** | Uvicorn via Docker (`Dockerfile` — 7 lines) |
| **HTTP Client** | `httpx` (async) for all Azure API calls |
| **File Size** | `server.py` — 1,280 lines, single-file monolith |
| **Rate Limiting** | `slowapi` with per-endpoint decorators (30/min chat/TTS/STT, 5/min survey) |
| **Data Storage** | Supabase (optional, wrapped in try/except) + local CSV fallback |
| **CORS** | `allow_origins=["*"]` — fully open |

**API Endpoints (9 total):**

| Method | Route | Purpose | Rate Limit |
|---|---|---|---|
| GET | `/health` | Health check | None |
| GET | `/api/characters` | List all 33 characters | None |
| GET | `/api/modes` | List all 13 learning modes | None |
| POST | `/api/chat` | Text chat with Azure GPT-4o | 30/min |
| POST | `/api/tts` | Text-to-speech streaming | 30/min |
| POST | `/api/stt` | Speech-to-text via Whisper | 30/min |
| POST | `/api/chat-and-speak` | Combined chat + TTS (binary) | 30/min |
| POST | `/api/voice/token` | Ephemeral WebRTC token | None |
| POST | `/api/voice/sdp` | SDP exchange proxy | None |
| POST | `/api/survey` | Email/survey capture | 5/min |
| GET | `/api/errors` | Retrieve error log | None |
| POST | `/api/errors` | Log frontend error | None |

**Request/Response Models:** Pydantic `BaseModel` subclasses (`ChatRequest`, `TTSRequest`, `VoiceTokenRequest`, `SurveyRequest`, `SDPRequest`) with basic validation. The `ChatRequest` model accepts `message` (required), `history` (optional list), `character` (defaults to "corvo"), `mode` (optional), and `customName` (optional).

**Static File Serving:** FastAPI `StaticFiles` mounted at `/static`, plus custom routes for `sw.js`, `manifest.json`, and several TV-mode HTML pages served with `HTMLResponse` and cache-control headers.

**What's Good:** FastAPI is an excellent choice for this use case — async-native, automatic OpenAPI docs, Pydantic validation, and streaming response support. The rate limiting with `slowapi` is properly configured per endpoint. The binary multipart format for `chat-and-speak` (4-byte length header + JSON + audio bytes) is efficient for mobile. The voice token endpoint includes a fallback mechanism (retries with "ash" voice if the primary voice returns 500).

**What's Concerning:** The backend is a single 1,280-line file with no separation of concerns. Character definitions (~450 lines), mode prompts (~250 lines), API endpoints, error handling, and Supabase integration are all intertwined. There is no router modularization, no dependency injection beyond FastAPI's built-in request/response handling, and no middleware beyond CORS and a custom header-adding middleware.

---

### 1.3 Voice Architecture

Casa Companion implements **two distinct voice pathways** with different latency characteristics and use cases:

#### Pathway A: Request/Response (Chat → TTS/STT)
```
User speaks → Browser MediaRecorder → /api/stt (Whisper) → /api/chat (GPT-4o) → /api/tts (GPT-4o-mini-TTS) → Browser plays audio
```

| Component | Details |
|---|---|
| **STT** | Azure Whisper (`whisper` deployment) |
| **Chat** | Azure GPT-4o (`gpt-4o` deployment, max_tokens=250, temperature=0.85) |
| **TTS** | Azure GPT-4o-mini-TTS (`gpt-4o-mini-tts` deployment) |
| **Latency** | ~2-4 seconds end-to-end (STT + chat + TTS round trips) |
| **Streaming** | TTS streams audio chunks via `StreamingResponse`; chat is non-streaming |

#### Pathway B: Real-Time WebRTC (Azure Realtime API)
```
User speaks → WebRTC data channel → Azure Realtime API (semantic VAD) → AI speaks back via WebRTC audio track
```

| Component | Details |
|---|---|
| **Signaling** | Ephemeral token via `/api/voice/token` + SDP exchange via `/api/voice/sdp` |
| **Voice** | Azure Realtime API with semantic VAD (`type="semantic_vad"`, eagerness="medium") |
| **Interruption** | Configurable (`interrupt_response: true` in freeflow mode, `false` in turn-based) |
| **Latency** | ~300-800ms response time (WebRTC-native) |
| **Audio Config** | noiseSuppression, echoCancellation, autoGainControl enabled |

**Voice Token Endpoint (`/api/voice/token`):**
- Fetches ephemeral client secret from Azure Realtime API
- Includes character-specific system prompt and voice selection
- Falls back to "ash" voice on 500 errors (line 1188-1203)
- No rate limiting applied

**SDP Proxy Endpoint (`/api/voice/sdp`):**
- Proxies SDP offer/answer exchange to Azure
- Keeps Azure endpoint URL server-side (good for security)
- Bearer token from ephemeral token used for auth

**What's Good:** The dual-pathway architecture is smart — WebRTC for natural conversation, request/response for reliability fallback. The semantic VAD configuration with configurable eagerness is well-tuned for child speech patterns. The voice fallback mechanism (retry with "ash") shows production awareness.

**What's Concerning:** There is no voice concurrency limit — each WebRTC session holds open a connection to Azure. At scale, this could exhaust Azure quota or Render resources. There is no session timeout, no heartbeat mechanism, and no cleanup of orphaned peer connections. The mic stream is acquired via `getUserMedia` but there is no explicit release on page unload.

---

### 1.4 Assets & Media Pipeline

#### Character Images
- **33 characters** with hero portraits in `static/images/heroes/` (webp/png format)
- **Character categories:** Original 10 animals + 13 new "Phase 2" characters + special characters (Pietro, Polpo, etc.)
- **TV-mode assets:** 8 SAM-extracted semantic layers for Corvo (body, head, beak, eye, left wing, right wing, tail, legs) as transparent PNGs at 1024×1024

#### Video Generation Pipeline
- **Tooling:** Custom Python scripts (`video_gen_corvo.py`, `video_gen_provider.py`, `video_gen_stellino.py`)
- **Providers:** HuggingFace Inference Providers (fal-ai, Replicate) with Wan 2.1/2.2 I2V models
- **Output:** `static/videos/corvo/idle.mp4`, `static/videos/stellino/idle.mp4`
- **Approach:** Image-to-video with reference image conditioning for character consistency

#### 3D Assets
- **Hunyuan 3D:** Generated GLB meshes (`corvo.glb`, `corvo_hunyuan.glb`)
- **Status:** Evaluated as "horrible" per `ask_azure_gpt4o.py` — not used in production UI

**What's Good:** The layered 2D rig approach (TV mode) is pragmatic — transparent PNGs can be animated via CSS transforms with good performance. The video generation pipeline uses modern open-source models (Wan 2.1) via HuggingFace, keeping costs low.

**What's Concerning:** All 33 character hero images are loaded eagerly in the companion grid, even though only ~10 are visible at once. No lazy loading is implemented. The video pipeline requires manual execution (HF_TOKEN env var) — it's not integrated into the build or deployment process. There is no CDN for assets; everything is served from Render's single origin.

---

### 1.5 DevOps & Deployment

| Attribute | Finding |
|---|---|
| **Platform** | Render (Docker runtime, Starter plan, Oregon region) |
| **Container** | `python:3.11-slim` base, 7-line Dockerfile |
| **Process** | `uvicorn server:app --host 0.0.0.0 --port 10000` |
| **Health Check** | `GET /health` |
| **CI/CD** | None — manual git push triggers Render deploy |
| **Environment** | `AZURE_API_KEY` via Render env vars; `SUPABASE_URL`/`SUPABASE_KEY` optional |
| **Render Config** | `render.yaml` — basic web service definition |

**Dockerfile Analysis:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "10000"]
```

**What's Good:** The Docker setup is minimal and correct. Using `python:3.11-slim` keeps the image small. The `--no-cache-dir` flag prevents pip cache bloat.

**What's Concerning:** The Dockerfile runs as root (no `USER` directive). There is no multi-stage build. Uvicorn runs with a single worker (no `--workers` flag) which limits concurrency. No Gunicorn is used as a process manager. There is no health check in the Dockerfile itself. The `COPY . .` copies everything including `.git`, tests, and local development files.

---

## Phase 2: Gap Analysis

### 2.1 Error Handling & Logging

| Gap | Severity | Location | Details |
|---|---|---|---|
| In-memory error log limited to 100 entries | **Medium** | `server.py:23` | `_error_log = deque(maxlen=100)` — errors are lost after 100 occurrences |
| No structured logging | **Medium** | All endpoints | Uses ad-hoc `log_error()` function; no JSON logging, no log levels |
| Silent Supabase failures | **Medium** | `server.py:45-53`, `754-755` | Supabase connection failures are caught and silently ignored with `pass` |
| Frontend errors not correlated | **Medium** | `index.html:4102-4113` | Frontend posts errors to `/api/errors` but no request ID ties them to backend errors |
| No log aggregation | **High** | Infrastructure | Logs exist only on Render's ephemeral storage; no forwarding to Datadog, Splunk, etc. |
| No alerting | **Critical** | Infrastructure | No PagerDuty, Slack, or email alerts for errors or downtime |

### 2.2 Security Holes

| Gap | Severity | Location | Details |
|---|---|---|---|
| CORS `allow_origins=["*"]` | **Critical** | `server.py:55-61` | Fully open CORS allows any origin to call the API; enables cross-site request forgery |
| No authentication/authorization | **Critical** | All endpoints | Anyone can access all endpoints; no API keys, no JWT, no session management |
| Azure API key exposed in headers | **High** | `server.py:940-943` | `api-key` header sent with every Azure request; if intercepted, full Azure access |
| No input sanitization beyond Pydantic | **Medium** | Chat endpoints | User messages are passed directly to Azure; potential prompt injection vectors |
| No HTTPS redirect | **Medium** | Infrastructure | Render provides HTTPS but no HSTS header or HTTP→HTTPS redirect |
| No Content Security Policy | **Medium** | Headers | No CSP header to prevent XSS; Google Fonts loaded without SRI |
| API keys in client-side code | **Critical** | `ask_azure_gpt4o.py:13` | Hardcoded Azure API key in source file (though this appears to be a dev script) |
| No rate limiting on voice token | **High** | `/api/voice/token` | No `@limiter.limit()` decorator; vulnerable to token exhaustion attacks |
| Survey endpoint accepts any email | **Low** | `/api/survey` | Basic regex validation only; no confirmation, no deduplication |

### 2.3 Scalability Limits

| Gap | Severity | Details |
|---|---|---|
| Single Uvicorn worker | **High** | No `--workers` flag; one process handles all requests |
| No connection pooling for httpx | **Medium** | New `AsyncClient` created per request (lines 946, 996, 1039, 1076) |
| No Redis/caching layer | **High** | Every chat request hits Azure GPT-4o; no response caching |
| In-memory state only | **Critical** | Character data, error logs, session state all in RAM; lost on restart |
| No database for conversations | **High** | `conversationHistory` exists only in browser memory |
| WebRTC sessions unbounded | **High** | No limit on concurrent voice sessions |
| Render Starter plan limits | **Medium** | 512MB RAM, limited CPU; will throttle under load |
| No load balancing | **Medium** | Single instance; no horizontal scaling configured |

### 2.4 Test Coverage

| Gap | Severity | Details |
|---|---|---|
| Tests require running server + live Azure key | **High** | `conftest.py:17-28` exits if server not running on localhost:8000 |
| No unit tests for server logic | **High** | All 57 tests are integration tests against live API |
| No mocking of Azure APIs | **High** | Every test makes real HTTP calls to Azure; costs money and is slow |
| No frontend tests | **High** | Zero coverage for 4,117 lines of JavaScript |
| No e2e tests | **Medium** | No Playwright, Cypress, or Selenium tests |
| Test file count | **Low** | Only `tests/test_demo.py` and `tests/conftest.py` |
| CI/CD doesn't run tests | **High** | No GitHub Actions, no pre-commit hooks |
| No test coverage reporting | **Medium** | No pytest-cov, no Codecov integration |

### 2.5 Documentation Gaps

| Gap | Severity | Details |
|---|---|---|
| No API documentation | **Medium** | FastAPI auto-generates OpenAPI at `/docs`, but no human-written API guide |
| No deployment runbook | **High** | No documented procedure for production deployments |
| No environment variable reference | **Medium** | `AZURE_API_KEY`, `AZURE_BASE`, `SUPABASE_URL`, etc. not documented |
| No character onboarding guide | **Medium** | Adding a new character requires editing `server.py` CHARACTER_PROMPTS dict |
| No architecture decision records (ADRs) | **Low** | `BLUEPRINT.md` exists but is high-level; no decision rationale |
| No troubleshooting guide | **Medium** | No documented steps for common failures |
| No security policy | **High** | No `SECURITY.md`, no vulnerability reporting process |

### 2.6 Performance Issues

| Gap | Severity | Location | Details |
|---|---|---|---|
| 4.1MB+ frontend bundle | **Medium** | `index.html` | Single file with embedded CSS, all JS, no code splitting |
| No lazy loading for images | **Medium** | Companion grid | All 33 character images loaded on page load |
| No CDN for static assets | **Medium** | Infrastructure | Assets served from Render origin |
| No image optimization | **Low** | `static/images/` | WebP used but no responsive images, no srcset |
| Chat requests non-streaming | **Medium** | `/api/chat` | Full response buffered before sending to client |
| No bundle analysis | **Low** | No webpack/vite bundle analyzer |
| No Core Web Vitals monitoring | **Medium** | No real user performance data |

### 2.7 Accessibility (a11y)

| Gap | Severity | Details |
|---|---|---|
| No ARIA labels | **High** | Interactive elements lack `aria-label`, `role`, `aria-live` |
| No focus management | **High** | No visible focus indicators; keyboard navigation untested |
| No screen reader support | **High** | Dynamic content (chat messages, mode changes) not announced |
| `user-scalable=no` | **Medium** | `meta viewport` disables zoom (WCAG violation) |
| No reduced-motion support | **Medium** | Canvas particle animation cannot be disabled |
| No color contrast audit | **Medium** | Dark theme with gold accents; some text may fail WCAG AA |
| No accessibility statement | **Low** | No a11y documentation or VPAT |

### 2.8 Mobile Responsiveness

| Gap | Severity | Details |
|---|---|---|
| Touch targets too small | **Medium** | Some mode icons and survey chips may be < 44×44px |
| No viewport adaptation for tablets | **Low** | Grid layouts use fixed columns (5 for companions, 4 for modes) |
| No PWA install prompt | **Low** | No `beforeinstallprompt` handler |
| No offline page | **Medium** | Service worker caches shell but no dedicated offline.html |
| Canvas animation drains battery | **Medium** | Particle animation runs continuously even when idle |

### 2.9 Monitoring & Observability

| Gap | Severity | Details |
|---|---|---|
| No application metrics | **Critical** | No Prometheus, no custom metrics |
| No distributed tracing | **High** | No request ID propagation; can't trace requests across services |
| No health check depth | **Medium** | `/health` only returns `{"status":"ok"}`; doesn't check Azure connectivity |
| No uptime monitoring | **High** | No Pingdom, UptimeRobot, or synthetic monitoring |
| No error tracking service | **High** | No Sentry, Rollbar, or Bugsnag integration |
| No performance monitoring | **Medium** | No RUM (Real User Monitoring) |
| No log aggregation | **High** | Logs only on Render; no forwarding to centralized system |

### 2.10 Backup & Disaster Recovery

| Gap | Severity | Details |
|---|---|---|
| No database backups | **Critical** | Supabase optional; CSV file not backed up |
| No character data export | **Medium** | Character prompts embedded in code; no external config |
| No deployment rollback | **Medium** | Render supports rollback but no documented procedure |
| No data retention policy | **High** | Survey responses stored indefinitely in CSV |
| No incident response plan | **High** | No documented procedure for outages or data breaches |

---

## Phase 5: Comparative Analysis

### 5.1 vs. AI Voice App Best Practices (ElevenLabs, Bland, Retell)

| Practice | Casa Companion | Industry Standard | Gap |
|---|---|---|---|
| Voice latency | 300-800ms (WebRTC), 2-4s (HTTP) | <500ms target | Acceptable for WebRTC |
| Voice fallback | "ash" voice retry | Multiple provider fallback | Limited — only Azure |
| Interrupt handling | Configurable semantic VAD | Standard in real-time APIs | Good |
| Voice cloning | Mentioned in roadmap | Core feature (ElevenLabs) | Not implemented |
| Multi-tenant isolation | None | Session-scoped voices | Critical gap |
| Connection pooling | None | Persistent connections | Performance issue |

### 5.2 vs. Character-Based UI Patterns (Character.AI, Replika, Nomi)

| Practice | Casa Companion | Industry Standard | Gap |
|---|---|---|---|
| Character count | 33 | 10-1000+ | Good variety |
| Personality consistency | System prompt + mode overlay | Fine-tuned models + RAG | Prompt-only approach |
| Memory persistence | Session-only (browser RAM) | Vector DB + long-term memory | Critical gap |
| Mode system | 13 structured modes | Open-ended + guided | Well-designed modes |
| Content safety | Copyright guard prompt | Multi-layer moderation (Prompt + output + human) | Insufficient for children |
| Parental controls | Basic parent dashboard | Granular controls, usage reports | Minimal |

### 5.3 vs. Vercel/Next.js Production Patterns

| Practice | Casa Companion | Next.js Standard | Gap |
|---|---|---|---|
| Framework | Vanilla JS | Next.js 14+ with App Router | No SSR, no SSG |
| Build output | Raw HTML | Optimized bundles, code splitting | No optimization |
| API routes | FastAPI (separate) | Next.js API routes | Two separate deployments |
| Image optimization | None | `next/image` with automatic optimization | Manual only |
| Font optimization | Google Fonts link | `next/font` with self-hosting | External dependency |
| Edge deployment | None (Render Docker) | Vercel Edge Functions | Higher latency globally |

### 5.4 vs. FastAPI Production Patterns

| Practice | Casa Companion | Production Standard | Gap |
|---|---|---|---|
| File organization | Single 1,280-line file | Routers, services, models separated | Maintainability issue |
| Dependency injection | Basic FastAPI | Custom dependencies, lifespan events | Limited |
| Database | Supabase (optional) + CSV | PostgreSQL with migrations, connection pooling | No proper DB |
| Testing | Integration only (live APIs) | Unit + integration + e2e with mocking | Coverage issue |
| Configuration | `os.getenv` scattered | Pydantic Settings, environment-specific configs | Organization issue |
| Logging | Ad-hoc function | Structured JSON logging (structlog) | Observability gap |
| Exception handling | Try/except per endpoint | Global exception handlers, custom error responses | Inconsistent |
