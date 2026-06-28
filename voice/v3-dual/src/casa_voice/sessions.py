"""Compatibility shim for the refactored session package.

The session manager has moved to ``casa_voice.session``. This module keeps
``from casa_voice.sessions import VoiceSession`` working.
"""

from .session import AudioBuffer, ClientHandle, VoiceSession

__all__ = ["AudioBuffer", "ClientHandle", "VoiceSession"]
