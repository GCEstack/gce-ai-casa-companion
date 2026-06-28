# Selectable TTS Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `TTS_PROVIDER` environment variable to the `voice/v3-dual` backend so we can switch between OpenAI direct TTS and OpenRouter/Gemini Flash TTS for tag testing.

**Architecture:** A single env var drives provider selection in `VoiceProviders.__init__`. Default stays OpenAI for backward compatibility. OpenRouter/Gemini Flash is used when `TTS_PROVIDER=openrouter`. If the requested provider is unavailable, the factory falls back to whichever provider is configured.

**Tech Stack:** Python 3.12, FastAPI, Fly.io, pytest.

## Global Constraints
- Default TTS provider must remain OpenAI direct when `TTS_PROVIDER` is unset.
- No frontend changes.
- OpenRouter/Gemini Flash requires `OPENROUTER_API_KEY` in Fly secrets.
- OpenAI direct fallback requires `OPENAI_API_KEY` in Fly secrets.

---

### Task 1: Update provider factory to respect `TTS_PROVIDER`

**Files:**
- Modify: `Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual/src/casa_voice/providers/factory.py`
- Test: `Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual/tests/test_factory.py`

**Interfaces:**
- Consumes: env vars `TTS_PROVIDER`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`.
- Produces: `VoiceProviders.tts` is either `OpenAIDirectTTS`, `OpenRouterTTS`, or `None`.

- [ ] **Step 1: Write the failing test**

Create `Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual/tests/test_factory.py`:

```python
import os
from unittest.mock import patch

import pytest

from casa_voice.providers.factory import VoiceProviders
from casa_voice.providers.tts import OpenAIDirectTTS, OpenRouterTTS


def test_default_tts_provider_is_openai_when_keys_present():
    env = {
        "OPENAI_API_KEY": "sk-openai",
        "OPENROUTER_API_KEY": "sk-or",
        "TTS_PROVIDER": "",
    }
    with patch.dict(os.environ, env, clear=True):
        providers = VoiceProviders()
        assert isinstance(providers.tts, OpenAIDirectTTS)


def test_openrouter_tts_provider_when_requested():
    env = {
        "OPENAI_API_KEY": "sk-openai",
        "OPENROUTER_API_KEY": "sk-or",
        "TTS_PROVIDER": "openrouter",
    }
    with patch.dict(os.environ, env, clear=True):
        providers = VoiceProviders()
        assert isinstance(providers.tts, OpenRouterTTS)


def test_openai_fallback_when_openrouter_requested_but_no_key():
    env = {
        "OPENAI_API_KEY": "sk-openai",
        "OPENROUTER_API_KEY": "",
        "TTS_PROVIDER": "openrouter",
    }
    with patch.dict(os.environ, env, clear=True):
        providers = VoiceProviders()
        assert isinstance(providers.tts, OpenAIDirectTTS)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual
python -m pytest tests/test_factory.py -v
```

Expected: FAIL — `test_factory.py` may fail because `TTS_PROVIDER` logic does not exist yet.

- [ ] **Step 3: Implement `TTS_PROVIDER` selection in factory.py**

Modify `Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual/src/casa_voice/providers/factory.py`. Replace the TTS selection block with:

```python
        tts_provider = os.environ.get("TTS_PROVIDER", "openai").strip().lower()

        if tts_provider == "openrouter" and openrouter_key:
            logger.info("Using OpenRouter TTS (Gemini Flash) as configured by TTS_PROVIDER")
            self.tts = OpenRouterTTS(api_key=openrouter_key)
        elif openai_key:
            logger.info("Using OpenAI direct TTS")
            self.tts = OpenAIDirectTTS(
                api_key=openai_key,
                model=os.environ.get("OPENAI_TTS_MODEL", "tts-1"),
                voice=os.environ.get("OPENAI_TTS_VOICE", "nova"),
            )
        elif openrouter_key:
            logger.info("Using OpenRouter TTS fallback")
            self.tts = OpenRouterTTS(api_key=openrouter_key)
        else:
            logging.warning("No TTS API key found. Set OPENAI_API_KEY or OPENROUTER_API_KEY.")
            self.tts = None
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual
python -m pytest tests/test_factory.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd Projects/ACTIVE/apps-platforms/casa-companion
 git add voice/v3-dual/src/casa_voice/providers/factory.py voice/v3-dual/tests/test_factory.py
 git commit -m "feat(voice): add TTS_PROVIDER env var for OpenRouter/Gemini Flash switching"
```

---

### Task 2: Add `TTS_PROVIDER` to Fly deployment config

**Files:**
- Modify: `Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual/fly.toml`

**Interfaces:**
- Consumes: nothing.
- Produces: `TTS_PROVIDER` env var default in deployed image.

- [ ] **Step 1: Add `TTS_PROVIDER = "openai"` to `[env]`**

Modify `Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual/fly.toml`. Insert after `NATIVE_AUDIO_ENABLED = "0"`:

```toml
  # TTS provider: "openai" (default, tts-1/nova) or "openrouter" (Gemini Flash with tags).
  TTS_PROVIDER = "openai"
```

- [ ] **Step 2: Validate toml syntax**

```bash
cd Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual
python -c "import tomllib; tomllib.load(open('fly.toml', 'rb'))" && echo "fly.toml OK"
```

Expected: `fly.toml OK`.

- [ ] **Step 3: Commit**

```bash
cd Projects/ACTIVE/apps-platforms/casa-companion
 git add voice/v3-dual/fly.toml
 git commit -m "deploy(voice): default TTS_PROVIDER to openai in fly.toml"
```

---

### Task 3: Deploy and verify Gemini Flash tag behavior

**Files:**
- Uses: `voice/v3-dual/fly.toml`, Fly CLI.

**Interfaces:**
- Consumes: Fly app `casa-voice-agent` and secrets `OPENROUTER_API_KEY`, `OPENAI_API_KEY`.
- Produces: deployed backend with `TTS_PROVIDER=openrouter`.

- [ ] **Step 1: Deploy with default `TTS_PROVIDER=openai`**

```bash
cd Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual
fly deploy
```

Expected: deploy succeeds; backend still uses OpenAI `nova`.

- [ ] **Step 2: Verify OpenAI default via logs**

```bash
fly logs --app casa-voice-agent | grep -i "Using OpenAI direct TTS"
```

Expected: log line appears after a TTS request.

- [ ] **Step 3: Switch to OpenRouter/Gemini Flash**

```bash
fly deploy --env TTS_PROVIDER=openrouter
```

Or set via secret/env:

```bash
fly deploy --env TTS_PROVIDER=openrouter
```

Expected: deploy succeeds.

- [ ] **Step 4: Verify Gemini Flash is active via logs**

```bash
fly logs --app casa-voice-agent | grep -i "OpenRouter TTS (Gemini Flash)"
```

Expected: log line appears after a TTS request.

- [ ] **Step 5: Test expressive tags from the frontend**

Open `https://casa-redesign-temp.vercel.app`, select a character, enter a playful or story mode, and speak. Listen for tags like `[laughs]` and `[excited]` being rendered as expressive audio rather than read aloud.

- [ ] **Step 6: Revert to OpenAI if desired**

```bash
fly deploy --env TTS_PROVIDER=openai
```

---

## Self-Review

**Spec coverage:**
- Env var `TTS_PROVIDER`: Task 1.
- Default OpenAI behavior: Task 1, Task 2.
- OpenRouter/Gemini Flash path: Task 1, Task 3.
- No frontend changes: no task needed.
- Deployment verification: Task 3.

**Placeholder scan:**
- No TBD/TODO placeholders.
- Code blocks contain concrete implementation.
- Exact file paths provided.

**Type consistency:**
- `VoiceProviders.tts` type remains `OpenAIDirectTTS | OpenRouterTTS | None`.
- Env var names match between code and fly.toml.
