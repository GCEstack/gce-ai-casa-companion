"""Unified WebSocket protocol for Casa Voice V2.

All clients — ESP32, browser, PWA — use the same protocol.
Binary frames: raw PCM 16kHz s16le mono
Text frames: JSON control messages

State machine with transition guards:
  IDLE → LISTENING (audio detected / wake word / command)
  LISTENING → THINKING (silence detected, STT complete)
  THINKING → SPEAKING (LLM response, TTS streaming)
  SPEAKING → LISTENING (barge-in detected, interrupt sent)
  SPEAKING → IDLE (TTS complete, no new audio)
  ANY → IDLE (command: stop)
"""

from __future__ import annotations
from enum import Enum, auto


# ── Voice State Machine ───────────────────────────────────────────────────

class VoiceState(Enum):
    """Finite state machine for the voice session."""
    IDLE = auto()
    LISTENING = auto()
    THINKING = auto()
    SPEAKING = auto()

    # Valid transitions: (from, to) -> allowed?
    _VALID_TRANSITIONS = {
        (IDLE, LISTENING),
        (IDLE, THINKING),      # For command-only turns (no STT)
        (IDLE, SPEAKING),      # For greeting on connect
        (LISTENING, THINKING),
        (LISTENING, IDLE),     # VAD timeout, no speech detected
        (THINKING, SPEAKING),
        (THINKING, IDLE),      # LLM error
        (SPEAKING, LISTENING), # Barge-in
        (SPEAKING, IDLE),      # TTS complete
    }

    @classmethod
    def can_transition(cls, from_state: "VoiceState", to_state: "VoiceState") -> bool:
        return (from_state, to_state) in cls._VALID_TRANSITIONS


# ── Device → Server Messages ───────────────────────────────────────────────

class DeviceMessage:
    """Base class for device-to-server messages."""
    pass

class Ping(DeviceMessage):
    type = "ping"
    def __init__(self, ts: int):
        self.ts = ts

class Pong(DeviceMessage):
    type = "pong"
    def __init__(self, ts: int):
        self.ts = ts

class Battery(DeviceMessage):
    type = "battery"
    def __init__(self, level: int):
        self.level = level

class MedallionTap(DeviceMessage):
    type = "medallion"
    def __init__(self, character_key: str, mode_key: str):
        self.character_key = character_key
        self.mode_key = mode_key

class WakeWord(DeviceMessage):
    type = "wake"
    def __init__(self, source: str = "wakenet"):
        self.source = source

class BargeIn(DeviceMessage):
    type = "barge_in"

class Command(DeviceMessage):
    type = "command"
    def __init__(self, command: str):
        self.command = command

# ── Server → Device Messages ───────────────────────────────────────────────

class ServerMessage:
    """Base class for server-to-device messages."""
    pass

class PongResponse(ServerMessage):
    type = "pong"
    def __init__(self, ts: int):
        self.ts = ts

class StateChange(ServerMessage):
    type = "state_change"
    def __init__(self, state: str):
        self.state = state

class ServerCommand(ServerMessage):
    type = "command"
    def __init__(self, command: str):
        self.command = command

class ModeChanged(ServerMessage):
    type = "mode_changed"
    def __init__(self, mode: str, character: str, voice_id: str | None = None):
        self.mode = mode
        self.character = character
        self.voice_id = voice_id

class Error(ServerMessage):
    type = "error"
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message

class TranscriptDebug(ServerMessage):
    type = "transcript"
    def __init__(self, text: str):
        self.text = text

class CommandResult(ServerMessage):
    type = "command_result"
    def __init__(self, command: str, result: str):
        self.command = command
        self.result = result

# ── Message Parsing ─────────────────────────────────────────────────────────

def parse_device_message(data: dict) -> DeviceMessage | None:
    """Parse a JSON message from the device."""
    msg_type = data.get("type")
    if msg_type == "ping":
        return Ping(data.get("ts", 0))
    elif msg_type == "pong":
        return Pong(data.get("ts", 0))
    elif msg_type == "battery":
        return Battery(data.get("level", 0))
    elif msg_type == "medallion":
        return MedallionTap(data.get("character_key", ""), data.get("mode_key", ""))
    elif msg_type == "wake":
        return WakeWord(data.get("source", "wakenet"))
    elif msg_type == "barge_in":
        return BargeIn()
    elif msg_type == "command":
        return Command(data.get("command", ""))
    return None


def serialize_server_message(msg: ServerMessage) -> dict:
    """Serialize a server message to JSON dict."""
    if isinstance(msg, PongResponse):
        return {"type": "pong", "ts": msg.ts}
    elif isinstance(msg, StateChange):
        return {"type": "state_change", "state": msg.state}
    elif isinstance(msg, ServerCommand):
        return {"type": "command", "command": msg.command}
    elif isinstance(msg, ModeChanged):
        return {"type": "mode_changed", "mode": msg.mode, "character": msg.character, "voice_id": msg.voice_id}
    elif isinstance(msg, Error):
        return {"type": "error", "code": msg.code, "message": msg.message}
    elif isinstance(msg, TranscriptDebug):
        return {"type": "transcript", "text": msg.text}
    elif isinstance(msg, CommandResult):
        return {"type": "command_result", "command": msg.command, "result": msg.result}
    return {}
