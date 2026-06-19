"""Casa Voice V2 — Wake Phrase Edition

Package structure:
- protocol:   Message types, state machine, commands
- providers:  OpenRouter STT/TTS + Silero VAD + resample
- commands:   Wake phrase + interrupt + end-turn classifier
- sessions:   VoiceSession with wake phrase pipeline
"""

__version__ = "2.1.0"
