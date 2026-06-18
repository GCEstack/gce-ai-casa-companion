# Casa Companion Voice Agent

A COPPA-compliant, toddler-grade-latency voice companion for kids.

- **Voice server:** Fly.io (FastAPI, always-on WebSocket)
- **Dashboard:** Vercel (Next.js 14, SSE only)
- **Database/Auth:** Supabase
- **AI/audio:** Deepgram (STT) → Groq (Llama 3.3 70B) → Cartesia (Sonic 3 TTS)
- **Device:** ESP32-S3 firmware skeleton (WakeNet wake word, Opus, I2S, BLE, NFC)

## Architecture

```
┌─────────────┐      Opus audio      ┌─────────────────────┐
│  ESP32-S3   │ ◄──────────────────► │  Fly.io Voice Server │
│  companion  │      PCM audio       │  FastAPI /ws/voice   │
└─────────────┘                      └──────────┬──────────┘
       │                                        │
       │ BLE / NFC                              │
       ▼                                        ▼
┌─────────────┐                      ┌─────────────────────┐
│  Tap Board  │                      │  Deepgram Nova-3    │
│  Medallions │                      │  Groq Llama 3.3 70B │
└─────────────┘                      │  Cartesia Sonic 3   │
                                     └─────────────────────┘
                                              │
                                              │ SSE
                                              ▼
                                     ┌─────────────────────┐
                                     │  Vercel Dashboard   │
                                     │  /dashboard + APIs  │
                                     └──────────┬──────────┘
                                                │
                                                ▼
                                     ┌─────────────────────┐
                                     │  Supabase           │
                                     │  parents/devices/   │
                                     │  sessions/medallions│
                                     └─────────────────────┘
```

## COPPA Notes

- Verifiable parental consent via Stripe `$1` hold before a device can connect.
- No audio files or transcripts are stored. `sessions.metadata` may only hold ephemeral status (e.g. `listening`, `speaking`, `battery`).
- 24-hour log retention on Fly.io (configure via `fly logs retain 168h` if needed; default is short-lived).
- Parent delete cascades through `parents`, `devices`, `sessions`, and `medallions`.

## Project Layout

```
casa-companion-voice-agent/
├── backend/              # FastAPI voice server
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── session_manager.py
│   │   ├── audio_pipeline.py
│   │   ├── prompt_router.py
│   │   └── coppa_layer.py
│   ├── Dockerfile
│   ├── fly.toml
│   └── requirements.txt
├── dashboard/            # Next.js 14 parent dashboard
├── firmware/             # ESP-IDF ESP32-S3 skeleton
└── supabase/
    ├── migrations/
    │   ├── 001_schema.sql
    │   └── 002_seed.sql
    └── generate_seed.py
```

## Backend Setup

### 1. Environment Variables

Create `backend/.env` (do not commit):

```bash
ENV=production
PORT=8080

DEEPGRAM_API_KEY=
GROQ_API_KEY=
CARTESIA_API_KEY=

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

VOICE_SERVER_API_KEY=change-me-to-a-long-random-secret
```

### 2. Local Run

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

### 3. Fly.io Deploy

```bash
cd backend
fly launch --name casa-voice-agent --region iad --no-deploy
fly secrets set DEEPGRAM_API_KEY=xxx GROQ_API_KEY=xxx CARTESIA_API_KEY=xxx \
                SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx \
                VOICE_SERVER_API_KEY=xxx
fly deploy
```

`fly.toml` already has `auto_stop_machines = "off"` and `min_machines_running = 1` for toddler-grade latency.

## WebSocket Relay

The standalone relay (`voice-agent/ws-relay.js`) forwards messages between the ESP32-S3 firmware and the React frontend.

```bash
node ws-relay.js
```

For production, set a long random `RELAY_TOKEN` and require every client to authenticate immediately after connecting:

```bash
RELAY_TOKEN=change-me-to-a-long-random-secret node ws-relay.js
```

Clients must send `{ "type": "auth", "token": "..." }` within 5 seconds. Unauthenticated clients are disconnected and cannot send or receive broadcasts. If `RELAY_TOKEN` is not set, the relay logs a warning and runs unauthenticated (local-dev behavior).

## Supabase Setup

1. Create a new Supabase project.
2. Enable **Email** provider in Auth settings.
3. In the SQL Editor, run:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_seed.sql`
4. (Optional) Regenerate the 130 character+mode seeds:
   ```bash
   cd supabase
   python generate_seed.py
   ```

### Voice IDs

`002_seed.sql` uses deterministic UUIDs per character. To use real Cartesia Sonic 3 voice IDs, either:
- Update the `voice_id` column in `character_modes`, or
- Set the `CARTESIA_VOICE_MAP` env var on Fly.io:
  ```bash
  fly secrets set CARTESIA_VOICE_MAP='{"orsetto":"uuid-1","drago":"uuid-2"}'
  ```

## Dashboard Setup

```bash
cd dashboard
npm install
# fill in .env.local
npm run dev
```

### Dashboard Env Vars

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
VOICE_SERVER_URL=https://casa-voice-agent.fly.dev
NEXT_PUBLIC_VOICE_SERVER_URL=https://casa-voice-agent.fly.dev
```

`VOICE_SERVER_URL` is used server-side by API routes (e.g. kill switch). `NEXT_PUBLIC_VOICE_SERVER_URL` is used client-side for the SSE live feed.

Deploy to Vercel:

```bash
vercel --prod
```

Set the same env vars in the Vercel dashboard and update `allow_origins` in `backend/app/main.py` to match your production domain.

## Firmware Build

```bash
cd firmware
idf.py set-target esp32s3
idf.py menuconfig   # set WiFi, device ID, API key, server URL
idf.py build
idf.py flash monitor
```

The firmware skeleton is a complete FreeRTOS/ESP-IDF project. Real wake-word, Opus, and NFC drivers should be wired to the stubs for your specific hardware.

## API Endpoints

### Voice Server (Fly.io)

| Method | Path | Description |
|--------|------|-------------|
| WS | `/ws/voice/{device_id}?token={api_key}` | Device audio + control stream |
| GET | `/events/{device_id}` | Parent dashboard SSE (Authorization: Bearer token) |
| POST | `/api/kill/{device_id}` | Parent kill switch |
| GET | `/health` | Health check |

### Dashboard (Vercel)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/consent/intent` | Create Stripe `$1` hold PaymentIntent |
| POST | `/api/consent/verify` | Mark parental consent verified |
| GET/POST | `/api/devices` | List / register devices |
| GET/POST | `/api/medallions` | List / register NFC medallions |
| POST | `/api/kill/[deviceId]` | Proxy kill switch to voice server |

## Error Handling

- **Deepgram timeout >500ms:** retried once internally by the Deepgram SDK keepalive; on failure the device receives `{"type":"error","code":"stt"}`.
- **Groq 429:** not yet retried in this version. Add `tenacity` retries in `audio_pipeline.py` if needed.
- **Cartesia >500 chars:** text is chunked at sentence boundaries before TTS.
- **ESP32 disconnect:** session times out after 30s of inactivity.
- **Parent kill:** `POST /api/kill/{device_id}` closes the WebSocket immediately.
- **Battery <10%:** server sends `{"type":"command","command":"sleep"}`.

## License

Private / proprietary — Casa Companion.
