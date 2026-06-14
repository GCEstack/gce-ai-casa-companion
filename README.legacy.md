# Casa Companion

> **Your AI companion. Real voice. Real personality.**

**Live demo:** [https://app-wheat-seven-35.vercel.app/](https://app-wheat-seven-35.vercel.app/)

Casa Companion is a voice-first AI companion platform. Users pick a character with a distinct personality and have real-time voice conversations. The project spans a public Next.js landing/demo site, a COPPA-aware parent dashboard, a Fly.io-hosted FastAPI voice server, an ESP32-S3 firmware skeleton, and an image-to-video hero pipeline that turns static character art into animated landing-page assets.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Key Features](#key-features)
- [File Structure](#file-structure)
- [Development Workflow](#development-workflow)
- [Voice Pipeline](#voice-pipeline)
- [Character System](#character-system)
- [Deployment](#deployment)
- [Next Steps / Roadmap](#next-steps--roadmap)

---

## Project Overview

Casa Companion is an AI voice companion app centered on character selection and real-time conversation. The experience is designed around Italian/heritage-themed plush personas, each with a name, personality prompt, voice profile, and specialty.

- **Product:** Real-time voice companion with character selection
- **Live site:** [https://app-wheat-seven-35.vercel.app/](https://app-wheat-seven-35.vercel.app/)
- **Tagline:** *Your AI companion. Real voice. Real personality.*
- **Target audience:** Families, teens, and adults looking for personality-driven voice AI

The codebase is organized as a monorepo-style ecosystem split across three physical locations on disk:

| Location | Role |
|----------|------|
| `casa-companion-repo/web-next/` | Public Next.js landing page + interactive demo |
| `casa-companion-voice-agent/` | FastAPI voice backend, parent dashboard, firmware skeleton |
| `casa-companion-hero-pipeline/` | Image-to-video batch pipeline for hero animations |

---

## Frontend Architecture

### Public landing / demo (`casa-companion-repo/web-next/`)

- **Framework:** Next.js 14 App Router, React 18, TypeScript 5
- **Styling:** Tailwind CSS 3.4, custom CSS variables, beachfront/ocean Casa Companion brand theme
- **Icons:** Lucide React
- **Auth / data:** Supabase SSR (`@supabase/ssr`)
- **Deployment target:** Vercel

### Key pages

| Page | Purpose |
|------|---------|
| `app/page.tsx` | Marketing landing page |
| `app/demo/page.tsx` | 3-step demo wizard: pick companion → pick mode → chat |
| `app/api/*` | Serverless API routes for chat, STT, TTS, OpenAI Realtime, survey |

### Key components

- `components/landing/Hero.tsx`
- `components/landing/Companions.tsx`
- `components/landing/Comparison.tsx`
- `components/landing/Pricing.tsx`
- `components/landing/FAQ.tsx`
- `components/demo/CharacterGrid.tsx`
- `components/demo/ModeSelector.tsx`
- `components/demo/ChatPanel.tsx`
- `components/demo/useRealtimeVoice.ts`

### API routes (Next.js)

| Route | Provider / purpose |
|-------|-------------------|
| `/api/characters` | Returns sanitized character metadata |
| `/api/modes` | Returns available character modes |
| `/api/chat` | Cloudflare Workers AI LLM |
| `/api/stt` | Cloudflare Whisper transcription |
| `/api/tts` | Cloudflare MeloTTS speech |
| `/api/voice/token` | OpenAI Realtime ephemeral token |
| `/api/voice/calls` | OpenAI Realtime WebRTC session |
| `/api/survey` | Stores survey responses in Supabase |

### Static assets

- `public/heroes/*.webp` — 34 circular character portraits
- `public/videos/*_final.mp4` — generated hero loop videos (currently not wired into the landing page)

### Parent dashboard (`casa-companion-voice-agent/dashboard/`)

- **Stack:** Next.js 14, Tailwind CSS, Supabase SSR auth, Stripe
- **Purpose:** Parent sign-in, device registration, live status panel, kill switch, medallion management
- **Key components:** `DashboardClient.tsx`, `ConsentForm.tsx`, `LoginClient.tsx`
- **Middleware:** protects `/dashboard/*` and `/api/*`

---

## Backend Architecture

### Voice server (`casa-companion-voice-agent/backend/`)

- **Framework:** FastAPI (Python)
- **Hosting:** Fly.io (`Dockerfile`, `fly.toml`)
- **Database:** Supabase (Postgres)
- **AI stack:**
  - **STT:** Deepgram Nova-3
  - **LLM:** Groq `llama-3.3-70b-versatile`
  - **TTS:** Cartesia Sonic 3

### Key files

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app, CORS, health, WebSocket `/ws/voice/{device_id}`, SSE `/events/{device_id}`, kill switch `/api/kill/{device_id}` |
| `backend/app/config.py` | Pydantic settings, API keys, model/voice params |
| `backend/app/session_manager.py` | WebSocket lifecycle, transcript→LLM→TTS orchestration, timeouts, kill switch |
| `backend/app/audio_pipeline.py` | Deepgram STT client, Groq LLM client, Cartesia TTS client |
| `backend/app/prompt_router.py` | Loads character modes from Supabase, formats system prompts, resolves voice IDs |
| `backend/app/coppa_layer.py` | Parent consent helpers, ephemeral session bookkeeping |

### Supabase schema (`casa-companion-voice-agent/supabase/migrations/`)

> ⚠️ **DO NOT MODIFY** — these files contain the canonical database schema.

| File | Contents |
|------|----------|
| `001_schema.sql` | `parents`, `devices`, `character_modes`, `sessions`, `medallions` tables + RLS policies |
| `002_seed.sql` | 130 seeded character-mode rows (13 characters × 10 modes) |

Schema notes:

- `sessions` table stores only ephemeral metadata.
- A `no_transcript` CHECK constraint ensures transcripts/audio are never persisted.
- RLS policies restrict rows to their owning parent.

### WebSocket relay (`casa-companion-voice-agent/ws-relay.js`)

A small Node broadcast relay that lets the ESP32 firmware and a browser frontend exchange JSON audio/status messages without exposing the device WebSocket directly.

---

## Key Features

- **Character selection** — 33+ distinct personalities in the demo, 13 core characters in the voice backend database
- **Real-time voice conversation** — streaming STT → LLM → TTS with sub-second latency
- **Image-to-video hero pipeline** — turns `public/heroes/*.webp` into looping animated MP4s
- **OpenAI Realtime WebRTC** — one-click live voice call in the demo
- **Parent dashboard** — device registration, live battery/status SSE, kill switch, consent management
- **COPPA-aware design** — parent consent, no persistent transcripts, data-deletion helpers
- **Medallion / NFC character switching** — swap character/mode at runtime via device message
- **Kill switch** — parent can immediately terminate an active child session

---

## File Structure

### Top-level ecosystem layout

```
casa-companion-master/                 ← this README
├── README.md

casa-companion-repo/
└── web-next/                          ← public Next.js site
    ├── app/
    │   ├── page.tsx                   ← landing page
    │   ├── layout.tsx
    │   ├── globals.css
    │   ├── demo/page.tsx              ← interactive demo
    │   └── api/                       ← serverless API routes
    ├── components/
    │   ├── landing/                   ← marketing sections
    │   └── demo/                      ← demo wizard components
    ├── lib/
    │   ├── characters.ts              ← demo character definitions  ⚠️ DO NOT MODIFY without design review
    │   ├── modes.ts                   ← demo mode definitions
    │   ├── config.ts                  ← site config
    │   └── supabase/server.ts
    ├── services/
    │   ├── ai/chat.ts
    │   ├── ai/stt.ts
    │   ├── ai/tts.ts
    │   ├── ai/realtime.ts
    │   └── storage/supabase.ts
    ├── public/
    │   ├── heroes/*.webp              ← character portraits
    │   └── videos/*                   ← generated hero videos
    ├── package.json
    ├── next.config.mjs
    ├── tailwind.config.ts
    └── .env.example                   ⚠️ DO NOT COMMIT secrets

casa-companion-voice-agent/
├── backend/                           ← FastAPI voice server
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py                  ⚠️ DO NOT MODIFY — holds API key settings
│   │   ├── session_manager.py
│   │   ├── audio_pipeline.py
│   │   ├── prompt_router.py
│   │   └── coppa_layer.py
│   ├── Dockerfile
│   ├── fly.toml                       ⚠️ DO NOT MODIFY production deploy config
│   ├── requirements.txt
│   └── .env.example                   ⚠️ DO NOT COMMIT secrets
├── dashboard/                         ← Next.js parent dashboard
│   ├── app/
│   │   ├── page.tsx
│   │   ├── login/page.tsx
│   │   ├── dashboard/page.tsx
│   │   └── api/                       ← dashboard API routes
│   ├── components/
│   │   ├── DashboardClient.tsx
│   │   ├── ConsentForm.tsx
│   │   └── LoginClient.tsx
│   ├── lib/
│   │   ├── supabase/client.ts
│   │   ├── supabase/server.ts
│   │   ├── casaProtocol.ts
│   │   └── useCasaWebSocket.ts
│   ├── middleware.ts
│   ├── package.json
│   └── .env.example                   ⚠️ DO NOT COMMIT secrets
├── firmware/                          ← ESP-IDF ESP32-S3 skeleton
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql             ⚠️ DO NOT MODIFY — sacred schema
│   │   └── 002_seed.sql               ⚠️ DO NOT MODIFY — sacred seed data
│   └── generate_seed.py
├── scripts/                           ← test / utility scripts
├── ws-relay.js                        ← Node firmware↔frontend relay
├── package.json
├── README.md
└── FIRMWARE_INTEGRATION.md

casa-companion-hero-pipeline/          ← image-to-video batch pipeline
├── batch_processor.py
├── backends.py
├── video_stitcher.py
├── hero_prompts.json                  ← per-character motion prompts
├── config.example.json
├── requirements.txt
├── ffmpeg/
├── videos/                            ← generated output
└── venv/
```

### Sacred files — DO NOT MODIFY

> These files contain production schema, deploy configs, credential settings, or seed data. Edit only with explicit approval and backups.

- `casa-companion-voice-agent/supabase/migrations/001_schema.sql`
- `casa-companion-voice-agent/supabase/migrations/002_seed.sql`
- `casa-companion-voice-agent/backend/app/config.py`
- `casa-companion-voice-agent/backend/fly.toml`
- `casa-companion-voice-agent/dashboard/middleware.ts`
- Any `.env` or `.env.local` file
- Any file containing API keys, Supabase service keys, or Stripe secrets

---

## Development Workflow

### Public site (`web-next`)

```bash
cd casa-companion-repo/web-next
npm install
npm run dev          # http://localhost:3000
npm run build        # Vercel-optimized production build
```

### Parent dashboard (`casa-companion-voice-agent/dashboard`)

```bash
cd casa-companion-voice-agent/dashboard
npm install
npm run dev
```

### Voice backend (`casa-companion-voice-agent/backend`)

```bash
cd casa-companion-voice-agent/backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

### Hero pipeline (`casa-companion-hero-pipeline`)

```bash
cd casa-companion-hero-pipeline
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python batch_processor.py --input-dir ../casa-companion-repo/web-next/public/heroes --output-dir ./videos
```

### Environment variables

#### `web-next/.env.example`

```ini
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime-2
NEXT_PUBLIC_SITE_URL=https://casa-companion.vercel.app
```

#### `casa-companion-voice-agent/backend/.env.example`

```ini
ENV=production
PORT=8080
LOG_LEVEL=INFO
DEEPGRAM_API_KEY=
GROQ_API_KEY=
CARTESIA_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
# CARTESIA_VOICE_MAP={"orsetto":"uuid","drago":"uuid"}
VOICE_SERVER_API_KEY=
```

#### `casa-companion-voice-agent/dashboard/.env.example`

```ini
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
VOICE_SERVER_URL=https://casa-voice-agent.fly.dev
NEXT_PUBLIC_VOICE_SERVER_URL=https://casa-voice-agent.fly.dev
```

### How to add a new character

1. **Add the portrait** to `web-next/public/heroes/{key}.webp`.
2. **Define the character** in `web-next/lib/characters.ts`:
   - `key`, `name`, `meaning`, `voice`, `realtimeVoice`, `prompt`, `image`
3. **Add a motion prompt** to `casa-companion-hero-pipeline/hero_prompts.json`:
   - `name`, `category`, `motion_prompt`, `negative_prompt`, `duration`, `motion_strength`
4. **Generate hero video** with the pipeline:
   ```bash
   python batch_processor.py --input-dir ../casa-companion-repo/web-next/public/heroes --hero {key}
   ```
5. **Copy the final video** to `web-next/public/videos/{key}_final.mp4`.
6. **For the voice backend**, insert rows into Supabase `character_modes` for each mode the character supports:
   - `character_key`, `mode_key`, `name`, `prompt`, `voice_id`, `ssml_template`, `sort_order`, `is_active`
7. **Restart the voice server** so `prompt_router.py` reloads active modes.

---

## Voice Pipeline

### Demo pipeline (`web-next`)

```
Microphone input (5 sec clip)
         ↓
  /api/stt  → Cloudflare Whisper
         ↓
  /api/chat → Cloudflare Workers AI LLM
         ↓
  /api/tts  → Cloudflare MeloTTS
         ↓
Speaker output
```

### Real-time pipeline (`casa-companion-voice-agent/backend`)

```
Device (ESP32 / browser)
         ↓  WebSocket /ws/voice/{device_id}
Deepgram STT (Nova-3, 16 kHz, interim results)
         ↓  finalized transcript
Groq LLM (llama-3.3-70b-versatile, 180 tokens, temp 0.85)
         ↓  response text
Cartesia TTS (Sonic 3, raw PCM s16le, 24 kHz)
         ↓  streamed audio bytes
Device speaker
```

### State machine

```
idle → listening → thinking → speaking → idle
```

States and events are broadcast to the parent dashboard via SSE.

### Active providers

| Layer | Provider | Model / Service |
|-------|----------|-----------------|
| STT | Deepgram | Nova-3 |
| LLM | Groq | llama-3.3-70b-versatile |
| TTS | Cartesia | Sonic 3 |
| Demo STT | Cloudflare | Whisper |
| Demo LLM | Cloudflare | Workers AI |
| Demo TTS | Cloudflare | MeloTTS |
| Demo real-time | OpenAI | Realtime API (WebRTC) |

### Known issues

- **Mic transcript glitch:** occasional “torque/back-write” issue where the transcript buffer rewrites or stutters during live capture. Mitigated by finalizing on end-of-speech rather than streaming partials directly into the LLM.

---

## Character System

Each character has:

- **Image** — static portrait (`public/heroes/{key}.webp`)
- **Video** — optional animated loop (`public/videos/{key}_final.mp4`)
- **Voice profile** — Cartesia `voice_id` or OpenAI Realtime voice name
- **Personality prompt** — system prompt that defines tone, mannerisms, and boundaries
- **Specialty / meaning** — one-line role (e.g., “The Leader”, “The Truth-teller”, “DJ help”)
- **Modes** — context variants such as `bedtime`, `story`, `play`, `calm`, `brave`, `travel`, `meal`, `bath`, `goodnight`, `question`

### Core voice-backend characters (13)

| Key | Name | Archetype |
|-----|------|-----------|
| orsetto | Orsetto | Bear |
| drago | Drago | Dragon |
| lupo | Lupo | Wolf |
| volpe | Volpe | Fox |
| coniglio | Coniglio | Rabbit |
| gatto | Gatto | Cat |
| gufo | Gufo | Owl |
| riccio | Riccio | Hedgehog |
| cerbiatto | Cerbiatto | Fawn |
| aquila | Aquila | Eagle |
| tartaruga | Tartaruga | Turtle |
| stella | Stella | Star |
| folletto | Folletto | Elf / Sprite |

### Demo characters (33, selected)

| Key | Name | Meaning / Specialty |
|-----|------|---------------------|
| pietro | Pietro | **The Leader** — founder archetype |
| corvo | Corvo | The Crow |
| orsetto | Orsetto | The Bear |
| coniglio | Coniglio | The Rabbit |
| tartaruga | Tartaruga | The Turtle |
| elefante | Elefante | The Elephant |
| leone | Leone | The Lion |
| delfino | Delfino | The Dolphin |
| drago | Drago | The Dragon |
| scheletro | Scheletro | The Skeleton |
| ragno | Ragno | The Spider |
| veloce | Veloce | Speed / energy |
| stellino | Stellino | Little star |
| rocco | Rocco | Solid / steady |
| onda | Onda | The Wave |
| maestra | Maestra | Teacher |
| costruttore | Costruttore | Builder |
| dottore | Dottore | Doctor / caregiver |
| cuoco | Cuoco | **Recipes / cooking help** |
| mamma | Mamma | Comfort / home |
| nonna | Nonna | Wisdom / stories |
| bella | Bella | Beauty / kindness |
| verita | Verità | **Truth-teller** |
| forza | Forza | Strength / courage |
| battito | Battito | Heartbeat / rhythm |
| borsa | Borsa | The Bag |
| sacco | Sacco | The Sack |
| spugna | Spugna | The Sponge |
| vinile | Vinile | **DJ / music help** |
| cucita | Cucita | Sewing / crafts |
| polpo | Polpo | The Octopus |
| xolo | Xolo | Xoloitzcuintle / guide |

> The full list is in `casa-companion-repo/web-next/lib/characters.ts`.

---

## Deployment

| Component | Platform | Current URL / artifact |
|-----------|----------|------------------------|
| Public landing + demo | Vercel | https://app-wheat-seven-35.vercel.app/ |
| Parent dashboard | Vercel | Deployed from `casa-companion-voice-agent/dashboard/` |
| Voice backend | Fly.io | `casa-voice-agent.fly.dev` |
| Database + auth | Supabase | Postgres + Row Level Security |
| Firmware relay | Node server (`ws-relay.js`) | Render / Railway / fly candidate |
| Hero pipeline | Local Python batch | Generates assets for the frontend |

### Production notes

- The Fly.io backend keeps `min_machines_running = 1` to avoid cold-start latency on voice connections.
- Supabase RLS policies ensure parents see only their own devices, sessions, and medallions.
- No transcripts or audio are persisted in the database (`sessions.metadata` has a `no_transcript` CHECK).

---

## Next Steps / Roadmap

- **ESP32-S3 firmware integration** — browser-only for now; hardware wake-word + Opus streaming in progress
- **Multi-agent orchestration** — let characters hand off to one another during a conversation
- **Character video generation pipeline** — finish wiring `public/videos/*_final.mp4` into the landing and demo UI
- **Voice command expansion** — play/pause, jump-in characters, volume, sleep mode
- **Mode-aware memory** — per-mode conversational context without violating transcript restrictions
- **Medallion / NFC flows** — physical character swap tokens paired to a device
- **Parent dashboard polish** — live transcription-free status, usage caps, analytics

---

## License / Attribution

This README documents the existing Casa Companion codebase. All third-party providers (Deepgram, Groq, Cartesia, Cloudflare, OpenAI, Supabase, Fly.io, Vercel) are used under their respective terms of service.
