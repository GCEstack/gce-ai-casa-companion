# Casa Companion — Full Project Blueprint

Built Feb 21-23, 2026 across Sessions #93-107.

---

## REPO 1: `casa-companion` (Interactive AI Demo)

**Remote:** `https://github.com/simplebalance89-ai/casa-companion`
**Live URL:** `casa-companion-demo.onrender.com`
**Local:** `C:\Users\GCTII\.claude\Work\casa-companion`

### Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, Uvicorn |
| HTTP client | httpx (async) |
| AI - Chat | Azure OpenAI GPT-4o |
| AI - TTS | Azure OpenAI GPT-4o-mini-TTS |
| AI - STT | Azure Whisper |
| AI - Realtime Voice | Azure OpenAI Realtime API (WebRTC) |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Hosting | Render (Docker, Starter, Oregon) |
| Env vars | `AZURE_API_KEY` |

### API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/characters` | List all characters |
| `GET` | `/api/modes` | List all learning modes |
| `POST` | `/api/chat` | Text chat with character + mode |
| `POST` | `/api/tts` | Text-to-speech (streams audio/mpeg) |
| `POST` | `/api/stt` | Speech-to-text via Whisper |
| `POST` | `/api/chat-and-speak` | Combined chat + TTS (binary multipart) |
| `POST` | `/api/voice/token` | Ephemeral WebRTC token for Realtime API |
| `POST` | `/api/survey` | Email/survey capture |

### Characters (11)

| Key | Name | Animal | Voice | Hidden |
|---|---|---|---|---|
| corvo | Corvo | Crow | ash | No |
| gufo | Gufo | Owl | sage | No |
| orsetto | Orsetto | Bear | coral | No |
| coniglio | Coniglio | Bunny | shimmer | No |
| tartaruga | Tartaruga | Turtle | alloy | No |
| elefante | Elefante | Elephant | echo | No |
| leone | Leone | Lion | fable | No |
| delfino | Delfino | Dolphin | ballad | No |
| drago | Drago | Dragon | onyx | No |
| xolo | Xolo | Xoloitzcuintli | verse | No |
| polpo | Polpo | Octopus | ballad | Yes (demo host) |

### Learning Modes (13)

introduction, story_time, calm_breathe, stem_sparks, music_rhythm, geography, languages, homework, coding, milestones, teaching, travel_games, lullaby

### Global Prompt Rules (appended to every character)

1. Copyright guard (no Disney, Marvel, etc.)
2. Factual accuracy first, roleplay second
3. Brevity: 1-2 sentences MAX
4. Numbered options when offering choices

### Key Architecture Decisions

- Single-file frontend (index.html) — no build system
- WebRTC Realtime API with semantic VAD (medium eagerness)
- Mic stays live during AI speech for interrupt capability
- Hidden characters via `hidden: true` flag
- Scripted showcase demo with speaker: user/companion for back-and-forth
- Mode prompts layered ON TOP of character personality
- Custom child naming (`childName`) separate from companion naming (`customName`)

### Config

```
# requirements.txt
fastapi, uvicorn[standard], httpx, python-dotenv, python-multipart

# Dockerfile
FROM python:3.11-slim → uvicorn server:app --host 0.0.0.0 --port 10000

# Azure endpoints
AZURE_BASE = "https://pwgcerp-9302-resource.openai.azure.com"
CHAT_DEPLOYMENT = "gpt-4o"
REALTIME_DEPLOYMENT = "gpt-4o-realtime"
TTS_DEPLOYMENT = "gpt-4o-mini-tts"
WHISPER_DEPLOYMENT = "whisper"
```

---

## REPO 2: `casa-companion-site` (Vision/Marketing Site)

**Remote:** `https://github.com/simplebalance89-ai/casa-companion-site`
**Live URL:** `simplebalance89-ai.github.io/casa-companion-site/`
**Local:** `C:\Users\GCTII\.claude\Work\casa-companion-site`

### Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI (static serving only) |
| Frontend | Vanilla HTML/CSS/JS |
| Hosting | GitHub Pages (primary) + Render (Docker) |
| No AI dependencies, no env vars required |

### Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/` | Serve index-v5.html or index.html |
| `POST` | `/api/waitlist` | Email capture → waitlist.csv |

### Site Sections

1. Home (hero + founder promo slideshow)
2. Product (companion grid, hardware specs)
3. Features (mode descriptions)
4. How It Works (pod/shell system, voice cloning)
5. Pricing ($79/$119/$159 hardware + $0-$14.99/mo subscriptions)
6. Market (TAM/SAM/SOM, competitors)
7. Kickstarter ($79-$299 backer tiers)
8. Grandparents (heritage language, distance bridge)
9. Future Tech (roadmap)
10. Our Story (Peter's founding story)

### Image Assets (100+)

- `images/hero-*.png` — 14 character hero shots
- `images/life-*.png` — 6 lifestyle photos
- `images/scene*.png` — 6 scene illustrations
- `images/batch2/` — 30 per-character lifestyle scenes
- `images/batch3/` — 22+ premium marketing shots (DALL-E generated)
- `images/generated/` — 16 AI marketing shots

### Promo Slideshow

18-slide narrated founder story (`promo.html`) with audio sync (narration-1.mp3 through narration-18.mp3).

---

## Cross-Repo Summary

| Attribute | Demo | Vision Site |
|---|---|---|
| Purpose | Live interactive AI demo | Marketing/Kickstarter |
| AI | GPT-4o, Whisper, TTS, Realtime | None |
| Data capture | survey_responses.csv | waitlist.csv |
| Characters | 11 (10 + Polpo demo host) | Referenced only |
| Modes | 13 learning modes | Described in content |
| Tests | pytest (3 classes, 57 tests) | None |
| Build system | None | None |
