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
