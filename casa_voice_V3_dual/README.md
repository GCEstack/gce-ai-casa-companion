# Casa Voice V3

Phone-as-microphone → Wi-Fi router → this PC → Bluetooth speaker.

## What you need

- A Windows PC on your home Wi-Fi.
- An Android phone on the same Wi-Fi.
- A Bluetooth speaker paired to the phone.
- API keys for the cloud stack (recommended):
  - [Groq](https://console.groq.com/) — for fast Whisper STT and LLM inference.
  - [OpenAI](https://platform.openai.com/) — for TTS (Groq does not offer TTS yet).
- Or a single [OpenRouter](https://openrouter.ai/) API key as a fallback.

## One-time setup

1. Copy `.env.example` to `.env` and add your keys.
   - **Fastest stack:** `GROQ_API_KEY` + `OPENAI_API_KEY`.
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
- `client/audio-device.html` — the page you open on the phone.
- `client/index.html` — dashboard (open on the PC or another device).
