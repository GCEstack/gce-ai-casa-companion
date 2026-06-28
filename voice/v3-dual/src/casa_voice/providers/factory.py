"""Provider factory / convenience container."""

import logging
import os
from typing import Optional

from .character_router import CharacterVoiceRouter
from .common import DEFAULT_LLM, logger
from .llm import GeminiLLM, GroqLLM
from .native_audio import NativeAudioProvider
from .stt import GroqSTT, OpenRouterSTT
from .tts import OpenAIDirectTTS, OpenRouterTTS
from .vad import SileroVAD


class VoiceProviders:
    """Convenience container for all providers.

    Priority:
      1. Groq/OpenAI direct stack if GROQ_API_KEY + OPENAI_API_KEY are set.
      2. OpenRouter fallback if OPENROUTER_API_KEY is set.
    """

    def __init__(self, api_key: Optional[str] = None):
        openrouter_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        groq_key = os.environ.get("GROQ_API_KEY", "")
        openai_key = os.environ.get("OPENAI_API_KEY", "")
        gemini_key = os.environ.get("GEMINI_API_KEY", "")

        # Keep the OpenRouter key explicit so fallback paths don't accidentally
        # use an empty string when only Groq is configured.
        self.openrouter_api_key = openrouter_key
        if groq_key:
            logger.info("Using Groq STT/LLM")
            self.stt = GroqSTT(api_key=groq_key)
            self.llm = GroqLLM(
                api_key=groq_key,
                model=os.environ.get("GROQ_LLM_MODEL", "llama-3.3-70b-versatile"),
            )
        elif gemini_key:
            logger.info("Using Gemini LLM")
            # Prefer Groq STT when available; otherwise fall back to OpenRouter STT.
            if groq_key:
                self.stt = GroqSTT(api_key=groq_key)
            elif openrouter_key:
                self.stt = OpenRouterSTT(api_key=openrouter_key)
            else:
                self.stt = None
            self.llm = GeminiLLM(
                api_key=gemini_key,
                model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-preview-05-20"),
            )
        elif openrouter_key:
            logger.info("Using OpenRouter STT stack")
            self.stt = OpenRouterSTT(api_key=openrouter_key)
            self.llm = None
        else:
            logging.warning("No STT/LLM API key found. Set GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY.")
            self.stt = None
            self.llm = None

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

        self.vad = SileroVAD()
        self.commands = __import__("casa_voice.commands", fromlist=["classifier", "trigger_responder", "echo_responder", "keyword_compressor"])

        # Optional native audio provider for Quick Chat mode (audio -> audio in one call).
        # Only created when an OpenRouter key is available; model can be overridden via env.
        if openrouter_key and os.environ.get("NATIVE_AUDIO_ENABLED", "1") != "0":
            self.native_audio = NativeAudioProvider(
                api_key=openrouter_key,
                model=os.environ.get("OPENROUTER_NATIVE_AUDIO_MODEL", "openai/gpt-audio-mini"),
                voice=os.environ.get("NATIVE_AUDIO_VOICE", "alloy"),
                sample_rate=16000,
            )
        else:
            self.native_audio = None
