# AGENTS.md — Casa Companion

## What This Repo Is
Casa Companion is an AI-powered companion app with animated characters (alebrijes), voice interaction, and PWA support. Features mode-aware visual engine with animated particles.

## Tech Stack
- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Frontend**: Vanilla JS, PWA
- **Audio**: WebRTC
- **Visuals**: Canvas-based particle engine
- **Deployment**: Render (Docker)

## Directory Structure
```
├── agent.py            # Character AI logic
├── server.py           # FastAPI server
├── static/             # Frontend
│   ├── index.html
│   ├── css/
│   └── js/
├── audio/              # Character audio files
├── images/             # Character images/banners
├── docs/               # Documentation
├── tests/              # Test files
├── Dockerfile
├── render.yaml
└── requirements.txt
```

## How to Work Here

### Running Locally
```bash
pip install -r requirements.txt
python server.py
```

### Key Conventions
- Character switching: Clean WebRTC teardown (kill all audio)
- PWA: Service worker for offline support
- Visual engine: Mode-aware animated particles
- Error logging system for debugging

### Characters
- Animated alebrijes and animals
- Voice-enabled interactions
- Banner images for each character

### Environment Variables
```bash
AZURE_OPENAI_KEY=
AZURE_OPENAI_ENDPOINT=
```

## Current Priorities
- Visual engine improvements
- Character audio management
- PWA enhancements

## Note
Part of the Casa Suite. Consider merging with casa-cuervo and casa-gianelli-work into unified `sb-casa-suite`.
