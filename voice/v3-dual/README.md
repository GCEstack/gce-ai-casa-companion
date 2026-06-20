# Casa Voice V3 Dual

> **Dual-mode voice companion for kids.**
> Browser as audio device **or** browser as dashboard + external audio device (phone / ESP32).

## What you need

- A Windows PC on your home Wi-Fi.
- An Android phone on the same Wi-Fi (for Mode B / phone-as-speaker).
- A Bluetooth speaker paired to the phone (Mode B).
- API keys for the cloud stack (recommended):
  - [Groq](https://console.groq.com/) — fast Whisper STT and LLM inference.
  - [OpenRouter](https://openrouter.ai/) — TTS and fallback for STT/LLM.
- Or a single [OpenRouter](https://openrouter.ai/) API key as a fallback.

## One-time setup

1. Copy `.env.example` to `.env` and add your keys.
   - **Fastest stack:** `GROQ_API_KEY` + `OPENROUTER_API_KEY`.
   - **Fallback stack:** `OPENROUTER_API_KEY` only.
2. Right-click `scripts/Install Casa Voice.bat` → **Run as administrator**.
3. The installer:
   - Installs Python dependencies.
   - Checks your `.env` keys.
   - Creates a **Casa Voice** shortcut on your desktop.

## Wake word

Casa Voice uses **Porcupine**, a fast local wake-word engine.

- Out of the box it listens for the built-in word **"Porcupine"** (say it clearly).
- To use a different built-in word, set `WAKE_WORD_KEYWORDS=jarvis` in `.env`.
- To create a custom **"Hey Casa"** model, train a `.ppn` file at [Picovoice Console](https://console.picovoice.ai/), place it in `wakewords/casa.ppn`, and set `WAKE_WORD_PATHS=wakewords/casa.ppn` in `.env`.

## Daily use

1. Double-click the **Casa Voice** shortcut on your desktop (runs as admin).
2. Wait for the window to show your phone URL and a QR code.
3. On your phone, open the URL or scan the QR code.
4. Tap **Connect as Audio Device** and allow microphone access.
5. Say the wake word, then your command (e.g. **"Porcupine, tell me a joke"**).

Audio comes out of your phone → Bluetooth speaker.

The dashboard (`client/index.html`) shows a live text conversation: what the kid said and what Casa is about to say. The phone audio page only handles microphone + speaker audio.

## Modes

- **Mode A — Browser Audio:** The browser is the audio device (mic + speaker). Good for testing on laptops/tablets.
- **Mode B — External Audio:** The browser is a dashboard only. A phone (`audio-device.html`) or ESP32 handles all audio.
- **Mode B — Bluetooth Audio (experimental):** Browser dashboard + Web Bluetooth audio receiver (Chrome/Edge only).

Multiple clients can share the same `session_id`. Audio-capable clients receive TTS PCM; dashboard clients receive transcripts and state changes.

## Trigger responses (fastest)

Common phrases bypass the LLM entirely and speak instantly:

- "Tell me a joke"
- "Tell me a story"
- "Sing me a song"
- "Goodnight"
- "What time is it?"

These responses skip the cloud LLM, so they start speaking in well under a second.

## Keyword compression

Before a transcript goes to the LLM, filler words are stripped so only content words are sent. This cuts token count and can speed up replies, especially when kids ramble.

Example:  
> "Um, I was wondering, can you maybe tell me a really fun story about a dragon and a knight who become friends and go on adventures together?"

becomes:

> `wondering maybe tell really fun story dragon knight become friends adventures together`

The original transcript is still stored in the conversation history; only the LLM call uses the compressed version.

> ⚠️ **Known issue:** The compressor strips negation words like "not" and "don't", which can invert meaning (e.g. "I don't like spiders" → "like spiders"). See `BACKLOG.md`.

## Story queue (story mode)

In **story mode**, Casa pre-generates short story segments in the background based on the kid's interests. When the kid says "what happens next?", "continue", or "and then?", the next segment is already waiting and can be spoken instantly — no LLM round-trip.

Example flow:

1. Kid: *"I love dinosaurs and spaceships."*
2. Casa echoes instantly and starts generating 3 story segments in the background.
3. Kid: *"What happens next?"*
4. Casa speaks the next queued segment in ~0.5s instead of waiting for the LLM.

Switch the dashboard to **Story** mode to try it.

## Voice Echo (learning from the kid)

When the server hears interest verbs and topics, it echoes them back immediately — no LLM wait:

- "I love to talk about math and story time with my turtle"
  → "You love math and story time with your turtle? That sounds awesome! Tell me more."

The extracted interests are stored in the session and added to future LLM system prompts, so Casa remembers what the kid cares about and personalizes replies. If Supabase persistence is configured, the profile is saved across sessions.

## Provider priority

The server automatically picks the fastest configured stack. No OpenAI key is required:

1. **Groq STT + Groq LLM + OpenRouter TTS** — recommended; needs `GROQ_API_KEY` + `OPENROUTER_API_KEY`.
2. **OpenRouter STT/TTS/LLM** — simple all-in-one fallback; needs only `OPENROUTER_API_KEY`.
3. **Groq STT + Groq LLM + OpenAI TTS** — slightly faster TTS; optional if you have `OPENAI_API_KEY`.

You can override models and voices in `.env`.

> ⚠️ **Known issue:** If only `GROQ_API_KEY` is set, the OpenRouter fallback LLM path uses an empty bearer token and fails. See `BACKLOG.md`.

### OpenRouter routing

When using the OpenRouter fallback for STT, TTS, or LLM, you can bias provider selection with `OPENROUTER_PROVIDER_SORT`:

- `latency` — pick the provider with the lowest response time (best for voice).
- `throughput` — pick the fastest token generation.
- `price` — pick the cheapest provider.

Example:

```bash
OPENROUTER_PROVIDER_SORT=latency
```

You can also set `OPENROUTER_LLM_MODEL=openrouter/auto` to let OpenRouter choose the model dynamically.

## Files

- `scripts/setup-casa.ps1` — one-time setup (dependencies, shortcut, env check).
- `scripts/start-casa.ps1` — start the server and show the phone QR code.
- `scripts/Install Casa Voice.bat` — right-click installer entry point.
- `scripts/create_supabase_table.py` — create the `voice_sessions` table in Supabase.
- `client/index.html` — the main PWA / dashboard page.
- `client/app.js` — Mode A + Mode B dashboard logic.
- `client/audio-device.html` — the page you open on the phone.
- `client/audio-device.js` — phone audio-device logic.
- `client/tap.html` — NFC tag confirmation page.
- `src/casa_voice/` — backend engine (protocol, commands, providers, sessions, persistence, wakeword, story queue).
- `esp32/` — ESP-IDF firmware skeleton (dual I2S, energy VAD, Wi-Fi, WebSocket stub).
- `tests/` — integration, synthetic audio, SSE, persistence, tap tests.

## Quick start (developer)

```powershell
cd "C:\Users\Dekan AI Brother\Projects\ACTIVE\apps-platforms\casa-companion\voice\v3-dual"
pip install -e .
$env:OPENROUTER_API_KEY="sk-or-v1-..."
uvicorn main:app --host 0.0.0.0 --port 8080
```

Open `http://localhost:8080/client/index.html` in Chrome for Mode A, or open `http://<your-pc-ip>:8080/client/audio-device.html?session_id=kitchen` on a phone for Mode B.

## Running tests

```powershell
# Terminal 1: start the server
uvicorn main:app --host 127.0.0.1 --port 8080

# Terminal 2
pytest tests/
```

## Security reminders

- **Never commit `.env`.** If you accidentally committed it, rotate the exposed keys immediately and purge the file from Git history.
- Set `VOICE_SERVER_API_KEY` in production and pass `?token=...` on WebSocket connections.
- The `/api/sessions` and `/api/kill/{device_id}` endpoints currently have no auth in the test build; protect them before any real deployment.

## Known issues (high-level)

See `BACKLOG.md` for the full list.

- Committed `.env` / cache files need to be purged from Git history.
- Provider fallback auth bug when only Groq key is set.
- Keyword compression can strip negations and change meaning.
- Interrupt regex includes adult language (`wtf`, etc.) that should be removed for a kids' product.
- `OpenRouterSTT` uses a JSON/base64 audio payload; verify it matches OpenRouter's actual endpoint.
- Wake-word audio carry-over may include pre-wake noise.
- ESP32 `websocket.c` is still a stub; real `esp_websocket_client` implementation needed.
- Wi-Fi credentials are hardcoded in ESP32 firmware.

## License

Private / proprietary — Casa Companion.
