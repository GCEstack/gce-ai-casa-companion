# Design: Selectable TTS Provider for Gemini Flash Tag Testing

## Goal
Allow the Casa voice backend to switch between OpenAI direct TTS and OpenRouter/Gemini Flash TTS via an environment variable, so we can test Gemini's expressive audio tags (`[laughs]`, `[excited]`, `[whispers]`, etc.) without changing frontend code or breaking the current default behavior.

## Background
- The current production backend (`voice/v3-dual`) defaults to `OpenAIDirectTTS` (`tts-1` / `nova`) when `OPENAI_API_KEY` is set.
- OpenAI's TTS does not support expressive tags.
- The backend already contains `OpenRouterTTS`, which uses `google/gemini-3.1-flash-tts-preview` and the `CharacterVoiceRouter` to apply tags based on character + mode.
- Gemini Flash TTS is the only provider in the codebase that supports these tags.

## Design

### 1. Add `TTS_PROVIDER` environment variable
Introduce a new env var in `voice/v3-dual`:

| Value | Behavior |
|---|---|
| `openai` (default) | Use `OpenAIDirectTTS` (`tts-1` / `nova`) — current behavior. |
| `openrouter` | Use `OpenRouterTTS` with Gemini Flash + character tags. |

If `TTS_PROVIDER` is unset or empty, default to `openai` to avoid breaking existing deployments.

### 2. Update provider factory
Modify `voice/v3-dual/src/casa_voice/providers/factory.py` so TTS selection respects `TTS_PROVIDER`:

- When `TTS_PROVIDER=openrouter` and `OPENROUTER_API_KEY` is set, instantiate `OpenRouterTTS`.
- When `TTS_PROVIDER=openai` (or unset) and `OPENAI_API_KEY` is set, instantiate `OpenAIDirectTTS`.
- If the requested provider cannot be configured, log a clear warning and fall back to whichever provider is available (`openrouter` → `openai` → `None`).

### 3. Keep existing character tag system
`CharacterVoiceRouter` already maps characters to Gemini voices and applies mode-based tags. No changes needed there for this test.

### 4. No frontend changes
The frontend continues to send `config_change { character, mode }`. The backend uses the active `tts` provider to synthesize speech.

### 5. Deployment / testing
- Add `TTS_PROVIDER=openrouter` to `voice/v3-dual/fly.toml` (or set via `fly secrets set`) when testing.
- Ensure `OPENROUTER_API_KEY` is configured in Fly secrets.
- Keep `OPENAI_API_KEY` configured so fallback works.
- To revert, change `TTS_PROVIDER=openai` and redeploy (or unset the env var).

## Cost / risk controls
- Default remains `openai`, so production users who do not set the env var see no change.
- OpenAI key remains available as fallback if OpenRouter/Gemini fails.
- Gemini Flash TTS cost is handled through existing OpenRouter credits.

## Files to change
1. `voice/v3-dual/src/casa_voice/providers/factory.py` — implement `TTS_PROVIDER` selection.
2. `voice/v3-dual/fly.toml` — add `TTS_PROVIDER` env var (default `openai`).
3. `voice/v3-dual/README.md` or env docs — document the new env var (optional).

## Verification
1. Unit test or local run: set `TTS_PROVIDER=openrouter`, verify `VoiceProviders.tts` is an `OpenRouterTTS` instance.
2. Deploy with `TTS_PROVIDER=openrouter`.
3. Connect via `casa-redesign-temp` frontend, select a character, trigger responses in different modes, and confirm expressive tags (e.g., laughter in playful mode).
4. Set `TTS_PROVIDER=openai`, redeploy, confirm responses use OpenAI `nova`.

## Out of scope
- ElevenLabs integration (deferred per user decision).
- Per-character OpenAI voice mapping.
- Frontend voice selector changes.
- Spend caps or usage budgets for OpenRouter/Gemini.
