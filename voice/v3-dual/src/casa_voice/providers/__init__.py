"""Casa Voice providers package.

Re-exports the public API formerly provided by ``casa_voice.providers``.
"""

from .character_router import CharacterVoiceRouter, TTSCache, VoiceProfile
from .common import (
    DEFAULT_LLM,
    DEFAULT_STT,
    DEFAULT_TTS,
    OPENROUTER_BASE,
    _get_openrouter_provider_routing,
    _load_character_prompts,
    resample_pcm,
)
from .factory import VoiceProviders
from .llm import GeminiLLM, GroqLLM
from .native_audio import NativeAudioProvider
from .stt import GroqSTT, OpenRouterSTT
from .tts import OpenAIDirectTTS, OpenRouterTTS
from .vad import SileroVAD

__all__ = [
    "OPENROUTER_BASE",
    "DEFAULT_LLM",
    "DEFAULT_STT",
    "DEFAULT_TTS",
    "_get_openrouter_provider_routing",
    "_load_character_prompts",
    "resample_pcm",
    "VoiceProfile",
    "CharacterVoiceRouter",
    "TTSCache",
    "OpenRouterSTT",
    "GroqSTT",
    "OpenRouterTTS",
    "OpenAIDirectTTS",
    "GroqLLM",
    "GeminiLLM",
    "SileroVAD",
    "NativeAudioProvider",
    "VoiceProviders",
]
