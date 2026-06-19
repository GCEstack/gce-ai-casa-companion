# Kid Voice Agent Backend

Phase 1 voice agent backend: FastAPI + Pipecat orchestrating Deepgram STT → OpenAI LLM → ElevenLabs TTS.

## What it does

- Exposes a single WebSocket endpoint at `/ws`.
- Accepts raw 16-bit PCM audio from a client at 16 kHz mono.
- Streams transcribed speech to an LLM, then streams synthesized speech back at 24 kHz mono.
- Serves a browser test client at `/static/index.html`.

## Quick start

1. **Copy environment variables:**
   ```bash
   cp .env.example .env
   ```

2. **Add your API keys to `.env`:**
   - `DEEPGRAM_API_KEY`
   - `OPENAI_API_KEY`
   - `ELEVENLABS_API_KEY`
   - `ELEVENLABS_VOICE_ID` (optional — uses default voice if blank)

3. **Install dependencies:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install -e ".[dev]"
   ```

4. **Run the server:**
   ```bash
   cd src
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

5. **Open the test client:**
   Navigate to `http://localhost:8000/static/index.html`, allow microphone access, and talk to Zippy.

## Run with Docker Compose

From the project root:

```bash
cp backend/.env.example backend/.env
# edit backend/.env with your keys
docker-compose up --build
```

## Project structure

```
backend/
├── src/
│   ├── main.py          # FastAPI app and /ws endpoint
│   ├── pipeline.py      # Pipecat STT → LLM → TTS pipeline
│   ├── config.py        # Pydantic settings from .env
│   └── static/
│       └── index.html   # Browser test client
├── .env.example
├── Dockerfile
├── pyproject.toml
└── README.md
```

## Audio format

| Direction | Format | Sample Rate | Channels |
|-----------|--------|-------------|----------|
| Client → Server | Raw PCM 16-bit little-endian | 16 kHz | 1 (mono) |
| Server → Client | Raw PCM 16-bit little-endian | 24 kHz | 1 (mono) |

## Safety

This Phase 1 build includes a basic keyword filter only. Before production, replace it with Azure Content Safety + custom classifiers + parent review queue.

## Next steps

- Add conversation persistence (Supabase/PostgreSQL).
- Add parent dashboard.
- Swap the raw PCM serializer for a structured protocol (e.g., protobuf) for mobile clients.
- Add age-adaptive prompt selection.
