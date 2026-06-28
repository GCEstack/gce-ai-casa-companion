# Casa Companion

> **Active voice stack:** `voice/v3-dual` + `apps/mobile`.  
> Legacy folders (`voice/v1`, `voice/v2`, `voice/v3`, `voice/agent`, `voice-agent`, `kimi_agent_mic`, `apps/desktop`) have been moved to `ARCHIVE/`.

> **Your AI companion. Real voice. Real personality.**

Casa Companion is a voice-first AI companion platform. Users pick a character with a distinct personality and have real-time voice conversations. This repo contains the consolidated monorepo: landing site, active voice PWA, voice backend, firmware skeleton, content pipelines, and a shared character definitions package.

---

## Repo Structure

```
casa-companion/
├── apps/
│   ├── mobile/               # Active kids' voice PWA (Vite + React + TypeScript + PWA)
│   └── landing/              # Next.js marketing / landing site
├── web-revamp/               # Vite + React marketing frontend (evaluation)
├── voice/
│   └── v3-dual/              # FastAPI voice backend — Groq/OpenRouter STT + TTS, WebSocket sessions
├── packages/
│   └── characters/           # Shared character configs & browser TTS voice settings
├── pipelines/
│   ├── hero-video/           # Image-to-video batch pipeline for hero animations
│   └── 3d-character-gen/     # 3D character / video generation scripts
├── ARCHIVE/                  # Historical code and experiments
└── README.legacy.md          # Detailed pre-merge documentation
```

---

## Quick Start

### Voice backend

```bash
cd voice/v3-dual
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -e .
copy .env.example .env        # fill in placeholders, never commit .env
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

Backend unit tests:

```bash
cd voice/v3-dual
python -m pytest tests/test_commands.py tests/test_filler.py -v
```

### Mobile voice PWA

```bash
cd apps/mobile
copy .env.example .env        # fill in placeholders
npm install
npm run build                 # or npm run dev
```

The mobile PWA connects to `voice/v3-dual` via the hooks in `src/hooks/useV3VoiceChat.ts`. See `apps/mobile/README.md` for the full mobile app docs.

### Parent dashboard / marketing frontends

```bash
cd web-revamp
npm install
npm run dev
```

```bash
cd apps/landing
npm install
npm run dev
```

### Hero video pipeline

```bash
cd pipelines/hero-video
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python batch_processor.py --input-dir ../../web-revamp/public/characters --output-dir ./videos --backend pika_fal
```

---

## Shared character package

Character prompt configs and browser speech-synthesis voice settings live in `packages/characters` and are consumed by `apps/mobile` and `web-revamp`. Import them with:

```ts
import { characterConfigs, characterVoices } from '@casa/characters';
```

Add new characters in one place; the aliases are configured in each app's `vite.config.ts` and `tsconfig.app.json`.

---

## Canonical Production URLs

| Service | URL |
|---------|-----|
| Voice backend | `https://casa-voice-agent.fly.dev` |
| Voice WebSocket | `wss://casa-voice-agent.fly.dev/ws/voice` |
| Mobile main | `https://casa-mobile-main.vercel.app` |
| Mobile — Peter | `https://casa-mobile-peter.vercel.app` |
| Mobile — Liam | `https://casa-mobile-liam.vercel.app` |
| Mobile — Jimmy | `https://casa-mobile-jimmy.vercel.app` |
| Mobile — Jenny | `https://casa-mobile-jenny.vercel.app` |
| Landing | `https://casa-landing.vercel.app` |
| Web-revamp | `https://casa-companion-app.fly.dev` |

The canonical GitHub remote is `https://github.com/GCEstack/gce-ai-casa-companion.git`.

---

## Security

- **Never commit `.env`, `.env.local`, `.env.*.backup`, or API keys.**
- All `.env.example` files use placeholders. Replace them locally.
- Keep `node_modules/`, `.venv/`, `__pycache__/`, `.next/`, `.vercel/`, `dist/`, `build/`, and `tts_cache/` out of Git.
- `voice/v3-dual/.env` and frontend `.env.local` / `.env.production` files are untracked and must stay untracked.
- Set `VOICE_SERVER_API_KEY` in production to authenticate the WebSocket endpoint.
- **Active leaked-key cleanup:** backup/archive env files were deleted. Rotate any keys that were previously exposed and recreate local `.env` files from `.env.example`.

---

## Vercel Hygiene

- **Do NOT set `NODE_ENV=production` as a Vercel project env var.** It makes `npm install` skip `devDependencies` and breaks Next.js builds. `NODE_ENV` is set by the build command itself.
- `apps/landing` should not have `VITE_*` env vars; those belong to `apps/mobile` and `web-revamp`.
- `apps/landing` keeps build-time tooling in `devDependencies`; this is safe as long as `NODE_ENV=production` is not set as a project env var.

---

## CI / CD

`.github/workflows/backend-deploy.yml` runs the backend test suite on every push to `voice/v3-dual/**` and deploys to Fly.io (requires `FLY_API_TOKEN` repository secret).

---

## Consolidation Notes

This repo was consolidated from multiple scattered Casa Companion folders. See `README.legacy.md` for the original detailed documentation and the `casa_companion_full_audit.md` report for the full audit and remediation checklist.

For agent/development conventions, see `AGENTS.md`.
