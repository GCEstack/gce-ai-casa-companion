# Casa Companion

> **Your AI companion. Real voice. Real personality.**

Casa Companion is a voice-first AI companion platform. Users pick a character with a distinct personality and have real-time voice conversations. This repo contains the consolidated monorepo: landing sites, parent dashboard, voice backend, firmware skeleton, and content pipelines.

---

## Repo Structure

```
casa-companion-master/
├── web-mobile/               # Active kids' voice PWA (Vite + React + PWA)
├── web-next/                 # Original Next.js 14 landing + demo site
├── web-revamp/               # Newer Vite + React marketing frontend (evaluation)
├── voice-agent/              # FastAPI voice backend, Next.js dashboard, firmware, Supabase migrations
├── tv-companion/             # Original TV demo: FastAPI server + vanilla JS TV rigs + 3D assets
├── pipelines/
│   ├── hero-video/           # Image-to-video batch pipeline for hero animations
│   └── 3d-character-gen/     # 3D character / video generation scripts
├── casa-companion/           # Static character assets (legacy site)
├── casa-companion-site/      # Legacy static site assets
├── casa-cuervo-site/         # Legacy Cuervo site assets
├── sb-casa-suite/            # Legacy Casa suite assets
└── README.legacy.md          # Detailed pre-merge documentation
```

---

## Quick Start

### Voice backend

```bash
cd voice-agent/backend
python -m venv .venv
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

### Parent dashboard

```bash
cd voice-agent/dashboard
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

### TV companion demo

```bash
cd tv-companion
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

Open `http://localhost:8000` for the main demo or `http://localhost:8000/tv.html` for the TV rig.

### Mobile voice PWA

```bash
cd web-mobile
npm install
npm run dev
```

Live deployments:

- Main: https://web-mobile-omega-sable.vercel.app
- Peter: https://web-mobile-peter.vercel.app
- Liam: https://web-mobile-liam.vercel.app
- Jimmy: https://web-mobile-jimmy.vercel.app
- Jenny: https://web-mobile-jenny.vercel.app

See `web-mobile/README.md` for the full mobile app docs.

---

## Assets

Extracted and organized assets live outside this repo at:

```
C:\Users\Dekan AI Brother\_ASSETS\casa-companion\
├── characters/
├── heroes/
├── banners/
├── backgrounds/
├── motion/
├── scenes/
└── misc/
```

Copy needed assets into each project's `public/` or `static/` folder as required.

---

## Security

- Never commit `.env`, `.env.local`, or API keys.
- Keep `node_modules/`, `.venv/`, `__pycache__/`, `.next/`, `.vercel/`, `dist/`, and `build/` out of Git.
- Rotate any keys that were previously exposed in old folders.

---

## Consolidation Notes

This repo was consolidated from multiple scattered Casa Companion folders. See `README.legacy.md` for the original detailed documentation and the `Casa-Companion-Audit` folder on the Desktop for the full audit report and merge checklist.
