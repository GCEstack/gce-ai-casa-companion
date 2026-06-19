# Casa-Pipecat Voice Agent

Advanced low-latency voice agent that combines **Pipecat** streaming orchestration with **Casa Companion's** auth, sessions, parent dashboard, and multi-character routing.

## What makes this different from the basic `kid-voice-companion`

| Feature | Basic | This advanced build |
|---|---|---|
| Pipeline | Pipecat | Pipecat |
| Device auth | ❌ | ✅ In-memory fallback + Supabase ready |
| Parent dashboard | ❌ | ✅ SSE events + kill switch |
| Multi-character | ❌ | ✅ Zippy, Breezy, Spark |
| Age-adaptive prompts | ❌ | ✅ Adjusts vocabulary by child age |
| Session management | ❌ | ✅ Tracks state + activity |
| COPPA/consent | ❌ | ✅ Stubbed, Supabase-ready |
| Port | 8000 | 8001 |

## Quick start

This project reuses the Python virtual environment from `kid-voice-companion`.

```powershell
cd "C:\Users\Dekan AI Brother\casa-pipecat-voice-agent\backend\src"
..\..\..\kid-voice-companion\backend\.venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8001 --reload
```

Or use the provided batch file:

```powershell
.\run.ps1
```

Open the test client:

```
http://localhost:8001/static/index.html
```

## Test client features

- Device ID + token fields
- Character selector
- Child age selector
- Real-time status updates
- Audio streaming at 16 kHz in / 24 kHz out

## API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Server health |
| `GET /characters` | List available characters |
| `WS /ws/voice/{device_id}?token=...&character_id=...&child_age=...` | Voice session |
| `GET /events/{device_id}` | Parent dashboard SSE stream |
| `POST /api/kill/{device_id}` | Parent kill switch |

## Supabase integration

To enable real device auth, dashboard, and COPPA compliance, set these in `backend/.env`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
VOICE_SERVER_API_KEY=change-me
```

Then implement the Supabase lookups in `src/session_manager.py`.

## Architecture

```
Browser test client
  ↓ WebSocket
FastAPI
  → SessionManager (auth, device, session)
  → Pipecat pipeline
      → Deepgram STT
      → Keyword safety filter
      → OpenAI LLM (GPT-4o-mini)
      → ElevenLabs TTS
  ← Raw PCM audio
  ← Status events → dashboard SSE
```

## Next steps

- Wire Supabase device/consent tables.
- Add conversation persistence.
- Build a proper parent dashboard.
- Add SSML/TTS chunking for more control.
- Deploy to Fly.io or Cloud Run.
