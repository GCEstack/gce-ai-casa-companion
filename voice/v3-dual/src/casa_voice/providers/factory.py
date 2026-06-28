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

    STT and LLM are chosen independently so the best provider for each job can
    be used. Current defaults on Fly:
      - STT: Groq when GROQ_API_KEY is set, otherwise OpenRouter.
      - LLM: Gemini when GEMINI_API_KEY is set, otherwise Groq, otherwise
        OpenRouter direct fallback in speech.py.
    """

    def __init__(self, api_key: Optional[str] = None):
        openrouter_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        groq_key = os.environ.get("GROQ_API_KEY", "")
        openai_key = os.environ.get("OPENAI_API_KEY", "")
        gemini_key = os.environ.get("GEMINI_API_KEY", "")

        # Keep the OpenRouter key explicit so fallback paths don't accidentally
        # use an empty string when only Groq is configured.
        self.openrouter_api_key = openrouter_key

        # STT provider
        if groq_key:
            logger.info("Using Groq STT")
            self.stt = GroqSTT(api_key=groq_key)
        elif openrouter_key:
            logger.info("Using OpenRouter STT")
            self.stt = OpenRouterSTT(api_key=openrouter_key)
        else:
            logger.warning("No STT API key found. Set GROQ_API_KEY or OPENROUTER_API_KEY.")
            self.stt = None

        # LLM provider
        if gemini_key:
            logger.info("Using Gemini LLM")
            self.llm = GeminiLLM(
                api_key=gemini_key,
                model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
            )
        elif groq_key:
            logger.info("Using Groq LLM")
            self.llm = GroqLLM(
                api_key=groq_key,
                model=os.environ.get("GROQ_LLM_MODEL", "llama-3.3-70b-versatile"),
            )
        elif openrouter_key:
            logger.info("Using OpenRouter LLM fallback")
            self.llm = None
        else:
            logger.warning("No LLM API key found. Set GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY.")
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
