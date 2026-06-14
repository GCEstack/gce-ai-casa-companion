# Casa Companion (Next.js)

A Next.js 14 rewrite of Casa Companion.

## Stack
- Next.js 14 App Router + TypeScript + Tailwind CSS
- Supabase PostgreSQL
- Cloudflare Workers AI (chat, TTS, STT)
- OpenAI Realtime API over WebRTC

## Local Development

1. Copy `.env.example` to `.env.local` and fill in values.
2. Run `npm install`
3. Run `npm run dev`
4. Open http://localhost:3000

## Supabase Schema

```sql
create table survey_responses (
  id uuid default gen_random_uuid() primary key,
  email text,
  child_age text,
  interests text,
  priorities text,
  feedback text,
  created_at timestamp with time zone default now()
);
```

## API Routes
- `POST /api/chat` — chat with a companion
- `POST /api/tts` — text-to-speech
- `POST /api/stt` — speech-to-text
- `POST /api/voice/calls?character=...` — OpenAI Realtime WebRTC SDP exchange
- `POST /api/voice/token` — OpenAI Realtime ephemeral token
- `POST /api/survey` — save survey response
- `GET /api/characters` — list companions
- `GET /api/modes` — list modes
- `GET /api/health` — health check

## Deploy

```bash
npx vercel --prod
```
