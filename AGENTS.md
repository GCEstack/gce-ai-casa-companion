# Casa Companion — Agent Guide

This is the consolidated Casa Companion monorepo. Use this file when working on code, deployments, or infrastructure.

## Active Stack

- **Voice backend:** `voice/v3-dual` (FastAPI + Groq/OpenRouter STT/TTS + WebSocket sessions)
- **Kids' voice PWA:** `apps/mobile` (Vite + React + TypeScript + PWA)
- **Landing/marketing site:** `apps/landing` (Next.js)
- **Evaluation frontend:** `web-revamp` (Vite + React)
- **Shared character definitions:** `packages/characters` (`@casa/characters`)

Legacy code lives in `ARCHIVE/` and should not be edited except to move things out.

---

## Canonical URLs

| Service | URL |
|---------|-----|
| Voice backend | `https://casa-voice-agent.fly.dev` |
| Voice WebSocket | `wss://casa-voice-agent.fly.dev/ws/voice` |
| New design (web-revamp) | `https://casa-redesign-temp.vercel.app` |
| Mobile — Liam | `https://casa-web-mobile-liam.fly.dev` |
| Mobile — Peter | `https://casa-web-mobile-peter.fly.dev` |
| Mobile — Jimmy | `https://casa-web-mobile-jimmy.fly.dev` |
| Mobile — Jenny | `https://casa-web-mobile-jenny.fly.dev` |
| Landing | `https://casa-landing.vercel.app` |
| Legacy web-revamp | `https://casa-companion-app.fly.dev` |

## Git Remotes

- **Canonical upstream / push target:** `https://github.com/GCEstack/gce-ai-casa-companion.git` (remote `origin` and `gcestack`)
- **Legacy mirror:** `https://github.com/simplebalance89-ai/casa-companion.git` (remote `simplebalance`)

`origin` now pushes to the canonical `GCEstack/gce-ai-casa-companion` repo. The old `simplebalance89-ai` remote is kept as a read-only reference.

---

## Infrastructure References

| Service | Provider | App / Project | URL |
|---------|----------|---------------|-----|
| Voice backend | Fly.io | `casa-voice-agent` | `https://casa-voice-agent.fly.dev` |
| New design (web-revamp) | Vercel | `casa-redesign-temp` | `https://casa-redesign-temp.vercel.app` |
| Legacy web-revamp | Fly.io | `casa-companion-app` | `https://casa-companion-app.fly.dev` |
| Mobile PWA (Liam) | Fly.io | `casa-web-mobile-liam` | `https://casa-web-mobile-liam.fly.dev` |
| Mobile PWA (Peter) | Fly.io | `casa-web-mobile-peter` | `https://casa-web-mobile-peter.fly.dev` |
| Mobile PWA (Jimmy) | Fly.io | `casa-web-mobile-jimmy` | `https://casa-web-mobile-jimmy.fly.dev` |
| Mobile PWA (Jenny) | Fly.io | `casa-web-mobile-jenny` | `https://casa-web-mobile-jenny.fly.dev` |
| Landing | Vercel | `casa-landing` | `https://casa-landing.vercel.app` |
| Supabase project | Supabase | `udbgzgntfiytnuajnbvy` | `https://udbgzgntfiytnuajnbvy.supabase.co` |

---

## Build & Test Commands

### Voice backend

```bash
cd voice/v3-dual
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -e .
copy .env.example .env        # fill in placeholders, never commit .env
python -m pytest tests/test_commands.py tests/test_characters.py tests/test_filler.py tests/test_voice_router.py tests/test_main_validation.py -v
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

### Mobile PWA

```bash
cd apps/mobile
copy .env.example .env.local  # fill in placeholders
npm install
npm run typecheck
npm run build
```

### Landing

```bash
cd apps/landing
npm install
npx tsc --noEmit
npm run build
```

### Web-revamp

```bash
cd web-revamp
npm install
npx tsc --noEmit
npm run build
```

---

## Secrets & Environment Hygiene

- **Never commit real secrets.** `.gitignore` already blocks `.env`, `.env.local`, `.env.production`, `.env.*.backup`, etc.
- Only `.env.example` files belong in the repo.
- Required production secrets:
  - `VOICE_SERVER_API_KEY` — shared between the Fly.io backend and any Vercel project that talks to the voice backend.
  - `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` — backend LLM/STT/TTS providers.
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — backend persistence.
  - `VITE_VOICE_SERVER_API_KEY` — mobile Vercel env var (mirrors `VOICE_SERVER_API_KEY`).
- If a key has ever been in an old folder, backup file, or pasted into chat, rotate it in the provider dashboard immediately.

---

## Vercel Hygiene

- **Do NOT set `NODE_ENV=production` as a Vercel project environment variable.** It causes `npm install` to skip `devDependencies` and breaks Next.js builds. `NODE_ENV` is managed by the build command itself.
- Landing should not have `VITE_*` env vars; those belong to `apps/mobile` and `web-revamp`.
- `apps/landing` keeps build-time tooling (`tailwindcss`, `postcss`, `typescript`, `eslint`) in `devDependencies`. This is fine as long as `NODE_ENV=production` is not set as a project env var.
- Audit stale Vercel projects periodically (`casa-companion-mobile`, `casa-redesign-temp`, `casa-redesign`, `casa-companion`, `ec4`, etc.) and delete unused ones to avoid quota confusion.

---

## Shared Character Package

Character configs, prompts, modes, safety guard text, and browser TTS settings live in `packages/characters` and are consumed by `apps/mobile`, `apps/landing`, and `web-revamp`.

Import pattern:

```ts
import { characterConfigs, characterVoices, allModes, COPYRIGHT_GUARD } from '@casa/characters';
```

Each app resolves `@casa/characters` through a `tsconfig` path alias. Do not add a new local character registry; extend the shared package instead.

---

## Deployment

- Backend: GitHub Action `.github/workflows/backend-deploy.yml` runs tests and deploys to Fly.io on pushes touching `voice/v3-dual/**`.
- Frontend: Vercel Git integration deploys `apps/mobile`, `apps/landing`, and `web-revamp` from their respective project links.

---

## Legacy & Archive

- `README.legacy.md` has the pre-consolidation detailed docs.
- `casa_companion_full_audit.md` has the full security/code audit and remediation checklist.
- Treat `ARCHIVE/` as read-only history.
