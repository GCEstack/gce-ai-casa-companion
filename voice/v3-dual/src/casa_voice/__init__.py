"""Casa Voice V3-Dual — Voice Agent Package

Modules:
    protocol    — Message types, VoiceState, CommandType, VoiceMessage
    commands    — Local keyword classifier
    providers   — STT/TTS/LLM/VAD providers + CharacterVoiceRouter
    sessions    — Session manager with barge-in + wake phrases
"""

from .protocol import (
    MessageType, VoiceState, CommandType, VoiceMessage
)
from .commands import CommandClassifier, classifier
from .providers import (
    OpenRouterSTT, OpenRouterTTS, SileroVAD, CharacterVoiceRouter,
    VoiceProviders, resample_pcm
)
from .sessions import VoiceSession, AudioBuffer

__all__ = [
    "MessageType", "VoiceState", "CommandType", "VoiceMessage",
    "CommandClassifier", "classifier",
    "OpenRouterSTT", "OpenRouterTTS", "SileroVAD", "CharacterVoiceRouter",
    "VoiceProviders", "resample_pcm",
    "VoiceSession", "AudioBuffer",
]
