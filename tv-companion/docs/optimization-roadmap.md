# Casa Companion — Optimization Roadmap

**Repo:** `https://github.com/simplebalance89-ai/casa-companion`  
**Commit:** `491239a`  
**Date:** June 14, 2026  

---

## Legend

| Severity | Meaning |
|---|---|
| 🔴 Critical | Security vulnerability, data loss risk, or complete service failure |
| 🟠 High | Significant user impact, scalability blocker, or compliance issue |
| 🟡 Medium | UX degradation, maintainability issue, or missed optimization |
| 🟢 Low | Nice-to-have, technical debt, or minor improvement |

| Effort | Meaning |
|---|---|
| Hours | Can be completed in a single work session |
| Days | Requires 2-5 days of focused work |
| Weeks | Requires 1-4 weeks; may involve cross-team coordination |

---

## Section 1: What's Good (Preserve & Protect)

### 1.1 Dual Voice Pathway Architecture
**Location:** `server.py:905-1244`, `index.html:3451-3590`  
**Why it's good:** The separation between request/response (chat + TTS + STT) and real-time WebRTC pathways gives users flexibility. The WebRTC path provides natural conversation flow with ~300-800ms latency, while the HTTP path serves as a reliable fallback for browsers without WebRTC support or when Azure Realtime is unavailable. The semantic VAD with configurable eagerness is well-tuned for child speech patterns.

**How to preserve:** When adding authentication or rate limiting, ensure both pathways are equally protected. The WebRTC token endpoint (`/api/voice/token`) currently lacks rate limiting — this should be addressed without disrupting the real-time flow.

### 1.2 PWA Implementation
**Location:** `sw.js`, `manifest.json`, `index.html:4096-4113`  
**Why it's good:** The service worker correctly implements cache segregation: API calls bypass cache entirely, HTML uses network-first with cache fallback, and static assets use stale-while-revalidate. The `skipWaiting()` + `clients.claim()` pattern ensures updates apply immediately. The manifest includes all required fields for installability.

**How to preserve:** Any changes to the service worker should maintain the cache strategy per resource type. Consider adding Workbox for more sophisticated cache management without losing these fundamentals.

### 1.3 Character + Mode System
**Location:** `server.py:103-450`, `460-707`  
**Why it's good:** The layered prompt architecture (base character prompt + copyright guard + mode-specific instructions + custom name) is elegant and extensible. Each of the 33 characters has a distinct voice, personality, and educational focus. The 13 learning modes cover a comprehensive range of child development areas. The `customName` feature allows personalization without modifying base prompts.

**How to preserve:** When moving character data to a database or external config, maintain the prompt layering order: character → copyright → mode → custom name. This ordering ensures factual accuracy and copyright compliance are always enforced.

### 1.4 Rate Limiting with slowapi
**Location:** `server.py:36-40`, `@limiter.limit` decorators throughout  
**Why it's good:** Per-endpoint rate limits (30/min for chat/TTS/STT, 5/min for survey) prevent abuse while allowing normal usage. The `get_remote_address` key function provides basic client identification. Integration with FastAPI's exception handling is clean.

**How to preserve:** When adding authentication, consider switching to user-based rate limiting (per API key or user ID) rather than IP-based, as IP-based limits can unfairly block users behind NAT.

### 1.5 Voice Fallback Mechanism
**Location:** `server.py:1186-1203`  
**Why it's good:** If Azure returns a 500 for a specific voice (e.g., "verse" for Xolo), the system automatically retries with "ash" — the most reliable voice. This prevents complete voice failure and maintains user experience degradation gracefully.

**How to preserve:** This pattern should be expanded to other failure modes (e.g., network timeouts, rate limit responses from Azure).

---

## Section 2: What's Bad (Fix with Code/Config)

### 🔴 CR-001: Open CORS — `allow_origins=["*"]`

| | |
|---|---|
| **Severity** | Critical |
| **Location** | `server.py:55-61` |
| **Impact** | Any website can call your API; enables cross-origin attacks, credential theft, and API abuse |
| **Effort** | Hours |

**Current Code:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Fix:** Restrict origins to known domains. For the demo, allow the Render domain and any marketing site domains:
```python
import os

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "https://casa-companion-demo.onrender.com,"
    "https://simplebalance89-ai.github.io"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)
```

**Environment Variable:**
```bash
ALLOWED_ORIGINS=https://casa-companion-demo.onrender.com,https://simplebalance89-ai.github.io,http://localhost:3000
```

---

### 🔴 CR-002: No Authentication on Any Endpoint

| | |
|---|---|
| **Severity** | Critical |
| **Location** | All API endpoints |
| **Impact** | Anyone can consume Azure API credits, submit unlimited surveys, exhaust rate limits |
| **Effort** | Days |

**Fix:** Implement API key authentication for all non-public endpoints:

```python
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends, Security

security = HTTPBearer(auto_error=False)

API_KEYS = set(os.getenv("API_KEYS", "").split(","))  # Comma-separated valid keys

async def verify_api_key(credentials: HTTPAuthorizationCredentials = Security(security)):
    if not credentials or credentials.credentials not in API_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return credentials.credentials

# Apply to protected endpoints
@app.post("/api/chat", dependencies=[Depends(verify_api_key)])
async def chat(...)：
```

For the demo, generate a single API key and embed it in the frontend's fetch calls:
```javascript
const API_KEY = 'cc-demo-2026-xxxxxx'; // Rotate before production
fetch('/api/chat', {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
})
```

---

### 🔴 CR-003: Hardcoded API Key in Source

| | |
|---|---|
| **Severity** | Critical |
| **Location** | `ask_azure_gpt4o.py:13` |
| **Impact** | Azure API key committed to git; anyone with repo access can use it |
| **Effort** | Hours |

**Current Code:**
```python
KEY = os.getenv("AZURE_API_KEY") or "YOUR_AZURE_API_KEY_HERE"
```

**Fix:** Remove the fallback string entirely:
```python
KEY = os.getenv("AZURE_API_KEY")
if not KEY:
    raise RuntimeError("AZURE_API_KEY environment variable is required")
```

**Immediate Action:** Rotate the exposed Azure API key in the Azure portal. The key has been in git history since commit `491239a`.

---

### 🟠 HI-001: No Rate Limiting on Voice Token Endpoint

| | |
|---|---|
| **Severity** | High |
| **Location** | `server.py:1142` (missing `@limiter.limit()`) |
| **Impact** | Attackers can exhaust Azure Realtime API quota by requesting unlimited ephemeral tokens |
| **Effort** | Hours |

**Fix:** Add rate limiting decorator:
```python
@app.post("/api/voice/token")
@limiter.limit("10/minute")  # Stricter than chat — tokens are expensive
async def voice_token(request: Request, payload: VoiceTokenRequest):
```

---

### 🟠 HI-002: Single Uvicorn Worker — No Concurrency

| | |
|---|---|
| **Severity** | High |
| **Location** | `Dockerfile:6` |
| **Impact** | Only one request processed at a time per container; blocks under load |
| **Effort** | Hours |

**Current:**
```dockerfile
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "10000"]
```

**Fix:** Use Gunicorn with Uvicorn workers for production concurrency:
```dockerfile
CMD ["gunicorn", "server:app", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:10000", "--workers", "4", "--worker-connections", "1000", "--timeout", "120", "--keep-alive", "5"]
```

Add `gunicorn` to `requirements.txt`.

---

### 🟠 HI-003: No httpx Connection Pooling

| | |
|---|---|
| **Severity** | High |
| **Location** | `server.py:946`, `996`, `1039`, `1076` |
| **Impact** | New TCP connection per request adds 50-200ms latency; wastes resources |
| **Effort** | Hours |

**Current Pattern (repeated 4+ times):**
```python
async with httpx.AsyncClient(timeout=30.0) as client:
    resp = await client.post(url, json=body, headers=headers)
```

**Fix:** Create a module-level client with connection pooling:
```python
# At module level (server.py top)
http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(30.0, connect=5.0),
    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    headers={"api-key": AZURE_API_KEY, "Content-Type": "application/json"}
)

# In endpoints, reuse:
resp = await http_client.post(url, json=body)

# Cleanup on shutdown
@app.on_event("shutdown")
async def shutdown():
    await http_client.aclose()
```

---

### 🟠 HI-004: No Database for Conversations or Sessions

| | |
|---|---|
| **Severity** | High |
| **Location** | Architecture gap |
| **Impact** | All conversation history lost on page refresh; no analytics; no multi-device support |
| **Effort** | Weeks |

**Fix:** Add PostgreSQL (via Supabase or managed service) with SQLAlchemy + Alembic:

```python
from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True)
    session_id = Column(String, index=True)
    character = Column(String)
    mode = Column(String)
    messages = Column(JSON)  # [{role, content, timestamp}]
    created_at = Column(DateTime, default=datetime.utcnow)

class SurveyResponse(Base):
    __tablename__ = "survey_responses"
    id = Column(Integer, primary_key=True)
    email = Column(String, index=True)
    child_age = Column(String)
    interests = Column(JSON)
    priorities = Column(JSON)
    feedback = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
```

---

### 🟠 HI-005: No Structured Logging or Observability

| | |
|---|---|
| **Severity** | High |
| **Location** | All endpoints |
| **Impact** | Can't debug production issues; no visibility into usage patterns or errors |
| **Effort** | Days |

**Fix:** Replace ad-hoc `log_error()` with `structlog` + JSON formatting:

```python
import structlog
import logging

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.dict_tracebacks,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()

# Usage in endpoints:
logger.info("chat_request", character=char_key, mode=payload.mode, message_len=len(payload.message))
logger.error("azure_chat_failed", status_code=e.response.status_code, detail=e.response.text)
```

Add Sentry for error tracking:
```python
import sentry_sdk
sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    traces_sample_rate=0.1,
)
```

---

### 🟡 ME-001: 4,117-Line Frontend Monolith

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `static/index.html` |
| **Impact** | Unmaintainable; no code reuse; difficult to test; merge conflicts |
| **Effort** | Weeks |

**Fix:** Migrate to a modern build setup (Vite + vanilla JS or lightweight framework):

```
frontend/
├── src/
│   ├── main.js           # Entry point
│   ├── state.js          # Global state management
│   ├── api.js            # API client
│   ├── voice/
│   │   ├── webrtc.js     # WebRTC real-time voice
│   │   ├── recorder.js   # MediaRecorder STT
│   │   └── audio.js      # Audio playback
│   ├── ui/
│   │   ├── chat.js       # Chat transcript
│   │   ├── characters.js # Character grid
│   │   ├── modes.js      # Mode selector
│   │   └── survey.js     # Survey flow
│   ├── demo/
│   │   ├── guided.js     # Guided demo
│   │   └── showcase.js   # Showcase script
│   └── viz/
│       └── particles.js  # Canvas particle engine
├── index.html
├── style.css
└── vite.config.js
```

---

### 🟡 ME-002: No Lazy Loading for Character Images

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `index.html` companion grid |
| **Impact** | All 33 images load on page open; ~2-5MB initial payload |
| **Effort** | Hours |

**Fix:** Add `loading="lazy"` and use responsive images:
```html
<img src="/static/images/heroes/corvo.webp"
     loading="lazy"
     decoding="async"
     alt="Corvo the Crow"
     width="72" height="72">
```

For the character grid, implement virtual scrolling or pagination if the list grows beyond 40 characters.

---

### 🟡 ME-003: No Lazy Loading for Character Images

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `/api/chat` endpoint |
| **Impact** | Users wait for full response before seeing any text; feels slower |
| **Effort** | Days |

**Fix:** Implement Server-Sent Events (SSE) streaming for chat:
```python
from fastapi.responses import StreamingResponse

@app.post("/api/chat/stream")
async def chat_stream(request: Request, payload: ChatRequest):
    async def event_generator():
        async with http_client.stream("POST", chat_url, json=body) as resp:
            async for chunk in resp.aiter_text():
                yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

---

### 🟡 ME-004: Dockerfile Runs as Root

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `Dockerfile` |
| **Impact** | Security risk; container compromise grants root access |
| **Effort** | Hours |

**Fix:** Add non-root user:
```dockerfile
FROM python:3.11-slim
WORKDIR /app

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chown -R appuser:appuser /app
USER appuser

CMD ["gunicorn", "server:app", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:10000", "--workers", "4"]
```

---

### 🟡 ME-005: No Input Validation for Character/Mode Keys

| | |
|---|---|
| **Severity** | Medium |
| **Location** | `/api/chat`, `/api/tts`, `/api/voice/token` |
| **Impact** | Invalid character keys fall back silently to "corvo"; invalid modes are silently ignored |
| **Effort** | Hours |

**Fix:** Add Pydantic validators:
```python
from pydantic import BaseModel, validator

VALID_CHARACTERS = set(CHARACTER_PROMPTS.keys())
VALID_MODES = set(MODE_PROMPTS.keys())

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Message]] = []
    character: Optional[str] = "corvo"
    mode: Optional[str] = None
    customName: Optional[str] = None

    @validator('character')
    def validate_character(cls, v):
        v = (v or 'corvo').lower()
        if v not in VALID_CHARACTERS:
            raise ValueError(f"Invalid character: {v}")
        return v

    @validator('mode')
    def validate_mode(cls, v):
        if v is None:
            return v
        v = v.lower()
        if v not in VALID_MODES:
            raise ValueError(f"Invalid mode: {v}")
        return v
```

---

### 🟢 LO-001: No CSS Minification

| | |
|---|---|
| **Severity** | Low |
| **Location** | `index.html` `<style>` block |
| **Impact** | ~30KB of unnecessary whitespace in CSS |
| **Effort** | Hours |

**Fix:** With a build system (Vite), CSS is minified automatically. For now, minify manually or use a VS Code extension.

---

### 🟢 LO-002: No .dockerignore

| | |
|---|---|
| **Severity** | Low |
| **Location** | Repository root |
| **Impact** | Docker build includes `.git`, `__pycache__`, tests, dev files |
| **Effort** | Minutes |

**Fix:** Create `.dockerignore`:
```
.git
.gitignore
__pycache__
*.pyc
.venv
.venv-seg
.env
workspace/
tests/
docs/
*.md
Dockerfile
render.yaml
.kimi/
```

---

### 🟢 LO-003: requirements.txt Has No Version Pins

| | |
|---|---|
| **Severity** | Low |
| **Location** | `requirements.txt` |
| **Impact** | Future dependency updates may break the app |
| **Effort** | Hours |

**Fix:** Pin versions and use a lock file:
```
fastapi==0.115.0
uvicorn[standard]==0.32.0
httpx==0.27.0
python-dotenv==1.0.0
python-multipart==0.0.12
supabase==2.9.0
slowapi==0.1.9
pydantic==2.9.0
```

Generate with: `pip freeze > requirements.lock.txt`
