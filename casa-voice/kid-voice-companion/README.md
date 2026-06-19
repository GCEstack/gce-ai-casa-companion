# Kid Voice Companion

A voice-first AI companion for children ages 9 months to 12 years. Built as a cross-platform mobile app first, with a roadmap toward NFC/USB/BLE toy hardware.

## Current Status

✅ **Voice agent backend built** (Phase 1)
- FastAPI + Pipecat voice pipeline
- Deepgram STT → OpenAI LLM → ElevenLabs TTS
- Browser test client at `/static/index.html`

⏳ Mobile app, parent dashboard, database, and hardware integration not started yet.

## Project Goal

Deliver a safe, low-latency, character-driven voice AI companion that kids actually want to talk to and parents trust. The first milestone is a **Phase 1 MVP**: one character, one screen, tap-to-talk, with managed AI APIs handling the voice pipeline.

## Core Requirements

- **Latency**: <700 ms end-to-end first turn, <300 ms subsequent turns.
- **Safety**: COPPA/GDPR-K compliant by design; multi-layer content filtering; parent review queue for children under 5.
- **Quality**: Age-adaptive responses from pre-verbal (sensory/audio) through pre-teen (homework help, abstract reasoning).
- **Hardware roadmap**: App/tablet first → NFC tag → USB toy → BLE toy → standalone toy.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Mobile app | React Native + Expo (dev builds) — future |
| Parent dashboard | Vite + React SPA — future |
| Voice backend | FastAPI + Pipecat ✅ |
| Database / Auth | Supabase (PostgreSQL + pgvector + Supabase Auth) — future |
| STT | Deepgram Nova-3 ✅ |
| LLM | GPT-4o-mini (MVP) → GPT-4o ✅ |
| TTS | ElevenLabs Turbo v2.5 ✅ |
| Content safety | Azure Content Safety + custom filters — Phase 2+ |
| Hosting | Google Cloud Run (`min-instances=1`) or Railway always-on |
| Caching / sessions | Redis — future |
| Transport | WebSocket (MVP) → WebRTC (production) |

## Repository Structure

```
kid-voice-companion/
├── backend/                 # Voice agent backend (built)
│   ├── src/
│   │   ├── main.py          # FastAPI app + /ws endpoint
│   │   ├── pipeline.py      # Pipecat STT → LLM → TTS pipeline
│   │   ├── config.py        # Pydantic settings from .env
│   │   └── static/
│   │       └── index.html   # Browser test client
│   ├── .env.example
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── README.md
├── docker-compose.yml       # Docker stack for backend
├── Makefile
├── README.md
└── .gitignore
```

## Quick Start (Backend)

1. **Copy environment variables:**
   ```bash
   cp backend/.env.example backend/.env
   ```

2. **Add your API keys to `backend/.env`:**
   - `DEEPGRAM_API_KEY`
   - `OPENAI_API_KEY`
   - `ELEVENLABS_API_KEY`
   - `ELEVENLABS_VOICE_ID` (optional)

3. **Run locally:**
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install -e ".[dev]"
   cd src
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. **Open the test client:**
   Navigate to `http://localhost:8000/static/index.html`, allow microphone access, and talk to Zippy.

## Phase 1 MVP Scope (4 weeks)

**Goal**: Prove children will engage with a voice AI companion and that the latency feels natural.

### Build

- [x] FastAPI backend with a single WebSocket voice endpoint.
- [x] Pipecat orchestrating: Deepgram STT → GPT-4o-mini → ElevenLabs TTS.
- [x] One hardcoded character with a friendly voice (Zippy).
- [x] Basic keyword-based content safety filter.
- [ ] React Native + Expo app with one screen (tap-to-talk).
- [ ] Simple conversation logging to Supabase.

### Validate

- [ ] Children aged 3–12 hold a 5+ turn conversation.
- [ ] End-to-end latency feels natural (<1 s target, <700 ms ideal).
- [ ] Parent NPS >40.
- [ ] Zero safety incidents during testing.

### Do Not Build Yet

- Parent dashboard
- Multi-character roster
- Vector memory / episodic personality
- Hardware integration
- Advanced content moderation / human review queue
- Offline mode

## Key Design Principles

1. **Latency first**: Every design choice must protect the 700 ms first-turn budget.
2. **Safety by default**: Multi-layer filtering, never a single point of failure.
3. **Abstract AI providers**: Swap STT/LLM/TTS without rewriting business logic.
4. **Parents own the data**: Full visibility, export, and delete capabilities from day one.
5. **Age-adaptive prompts**: One character adapts vocabulary and tone across 9 months–12 years.

## Next Steps

1. Test the voice loop end-to-end with real API keys.
2. Build the React Native + Expo mobile app screen.
3. Add Supabase for conversation logging and auth.
4. Run child/parent test sessions and measure latency.

## References

- Full discovery document: `kid_ai_companion_discovery.md` (from `kid_ai_companion_discovery.zip`)
- Architecture decisions should be recorded in `docs/architecture/ADR-XXX.md`.
