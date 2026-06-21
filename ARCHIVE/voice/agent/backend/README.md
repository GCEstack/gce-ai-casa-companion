# Casa Companion Voice Backend

FastAPI voice server for Casa Companion. Handles real-time WebSocket audio streams from ESP32-S3 devices, proxies parent dashboard commands, and exposes Server-Sent Events (SSE) for live device status.

---

## Stack

- **Framework:** FastAPI + Uvicorn
- **AI/audio:** Deepgram (STT) → Groq (Llama 3.3 70B) → Cartesia (Sonic 3 TTS)
- **Database/Auth:** Supabase (PostgreSQL + Auth)
- **Deploy target:** Fly.io

---

## Project Layout

```
backend/
├── app/
│   ├── main.py              # FastAPI app, WebSocket + SSE + HTTP endpoints
│   ├── config.py            # Pydantic settings from env vars
│   ├── session_manager.py   # Device session lifecycle
│   ├── audio_pipeline.py    # Deepgram → Groq → Cartesia pipeline
│   ├── prompt_router.py     # Character/mode prompt loader from Supabase
│   └── coppa_layer.py       # COPPA compliance helpers
├── Dockerfile
├── fly.toml
├── requirements.txt
└── .env.example
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
ENV=production
PORT=8080
LOG_LEVEL=INFO

DEEPGRAM_API_KEY=
GROQ_API_KEY=
CARTESIA_API_KEY=

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Optional: map character keys to real Cartesia voice UUIDs
# CARTESIA_VOICE_MAP={"orsetto":"uuid","drago":"uuid"}

VOICE_SERVER_API_KEY=generate-a-long-random-secret-for-dashboard-kill-proxy
```

---

## Local Development

```bash
cd voice-agent/backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

Server runs at `http://localhost:8080`.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| WS | `/ws/voice/{device_id}?token={api_key}` | Device audio + control stream |
| GET | `/events/{device_id}` | Parent dashboard SSE (Authorization: Bearer token) |
| POST | `/api/kill/{device_id}` | Parent kill switch |
| GET | `/health` | Health check |

---

## Deploy to Fly.io

```bash
cd voice-agent/backend
fly launch --name casa-voice-agent --region iad --no-deploy
fly secrets set DEEPGRAM_API_KEY=xxx GROQ_API_KEY=xxx CARTESIA_API_KEY=xxx \
                SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx \
                VOICE_SERVER_API_KEY=xxx
fly deploy
```

`fly.toml` already has `auto_stop_machines = "off"` and `min_machines_running = 1` for toddler-grade latency.

---

## Security Notes

- Never commit `.env` or real API keys.
- `VOICE_SERVER_API_KEY` is used by the dashboard to proxy the kill switch.
- CORS is restricted to known Vercel dashboard domains; update `allow_origins` in `app/main.py` if you add a new frontend domain.
