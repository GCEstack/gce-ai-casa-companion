"""Casa Voice V2 — Voice Agent Package

Modules:
    protocol    — Message types, state machine, VoiceMessage
    commands    — Local keyword classifier
    providers   — OpenRouter STT/TTS + Silero VAD + CharacterVoiceRouter
    sessions    — Session manager with barge-in + wake phrases
"""

from .protocol import (
    MessageType, VoiceState, CommandType, VoiceMessage, StateMachine
)
from .commands import CommandClassifier, classifier
from .providers import (
    OpenRouterSTT, OpenRouterTTS, SileroVAD, CharacterVoiceRouter,
    VoiceProviders, resample_pcm
)
from .sessions import VoiceSession, AudioBuffer

__all__ = [
    "MessageType", "VoiceState", "CommandType", "VoiceMessage", "StateMachine",
    "CommandClassifier", "classifier",
    "OpenRouterSTT", "OpenRouterTTS", "SileroVAD", "CharacterVoiceRouter",
    "VoiceProviders", "resample_pcm",
    "VoiceSession", "AudioBuffer",
]
