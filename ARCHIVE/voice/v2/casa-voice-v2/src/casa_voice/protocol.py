"""Casa Voice V2 — Unified Protocol (Wake Phrase Edition)

Wake Phrase Architecture:
- IDLE: Companion dormant, mic audio flows but NOT sent to STT/LLM
- WAKE phrase ("Hello", "Hey", "Wake up", "Wake") → LISTENING
- INTERRUPT ("Yo", "WTF", "One sec", "Hold on") → barge-in while SPEAKING
- END_TURN ("Send", "End", "Capische") → force utterance end, process immediately
- RESET ("Reset") → clear session, return to IDLE
- BUTTON press (ESP32 mic button) → hardware interrupt
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
import json


class MessageType(Enum):
    AUDIO_CHUNK = "audio_chunk"
    COMMAND = "command"
    STATE_CHANGE = "state_change"
    TRANSCRIPT = "transcript"
    TTS_CHUNK = "tts_chunk"
    ERROR = "error"
    PING = "ping"
    PONG = "pong"
    WAKE_DETECTED = "wake_detected"
    INTERRUPT_ACK = "interrupt_ack"
    END_TURN_ACK = "end_turn_ack"


class VoiceState(Enum):
    """Server-side state machine with wake phrase support."""
    IDLE = "idle"
    WAKE_DETECTED = "wake_detected"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    INTERRUPTED = "interrupted"
    RESETTING = "resetting"


class CommandType(Enum):
    """Voice commands including wake phrases, interrupt, end-turn, reset."""
    WAKE = "wake"
    INTERRUPT = "interrupt"
    END_TURN = "end_turn"
    RESET = "reset"
    STOP = "stop"
    LOUDER = "louder"
    SOFTER = "softer"
    STORY_MODE = "story_mode"
    PLAY_MODE = "play_mode"
    BEDTIME_MODE = "bedtime_mode"
    SING_MODE = "sing_mode"
    CHARACTER_DRAGO = "character_drago"
    CHARACTER_LIAM = "character_liam"
    CHARACTER_JENNY = "character_jenny"
    CHARACTER_ORSETTO = "character_orsetto"
    CHARACTER_CONIGLIO = "character_coniglio"
    BUTTON_PRESS = "button_press"


@dataclass
class VoiceMessage:
    type: MessageType
    payload: Dict[str, Any] = field(default_factory=dict)
    binary: Optional[bytes] = None

    def to_json(self) -> str:
        return json.dumps({"type": self.type.value, **self.payload})

    @classmethod
    def from_json(cls, raw: str) -> "VoiceMessage":
        data = json.loads(raw)
        msg_type = MessageType(data.pop("type"))
        return cls(type=msg_type, payload=data)

    @classmethod
    def audio_chunk(cls, pcm_data: bytes) -> "VoiceMessage":
        return cls(type=MessageType.AUDIO_CHUNK, binary=pcm_data)

    @classmethod
    def command(cls, cmd: CommandType) -> "VoiceMessage":
        return cls(type=MessageType.COMMAND, payload={"command": cmd.value})

    @classmethod
    def state_change(cls, state: VoiceState) -> "VoiceMessage":
        return cls(type=MessageType.STATE_CHANGE, payload={"state": state.value})

    @classmethod
    def transcript(cls, text: str, is_final: bool = True) -> "VoiceMessage":
        return cls(type=MessageType.TRANSCRIPT, payload={"text": text, "final": is_final})

    @classmethod
    def tts_chunk(cls, pcm_data: bytes, sequence: int) -> "VoiceMessage":
        return cls(
            type=MessageType.TTS_CHUNK,
            payload={"sequence": sequence, "format": "pcm_s16le_16000"},
            binary=pcm_data
        )

    @classmethod
    def error(cls, code: str, message: str) -> "VoiceMessage":
        return cls(type=MessageType.ERROR, payload={"code": code, "message": message})

    @classmethod
    def wake_detected(cls, phrase: str) -> "VoiceMessage":
        return cls(type=MessageType.WAKE_DETECTED, payload={"phrase": phrase})

    @classmethod
    def interrupt_ack(cls) -> "VoiceMessage":
        return cls(type=MessageType.INTERRUPT_ACK)

    @classmethod
    def end_turn_ack(cls) -> "VoiceMessage":
        return cls(type=MessageType.END_TURN_ACK)


class StateMachine:
    """Wake-phrase-aware state machine."""

    def __init__(self):
        self._state = VoiceState.IDLE
        self._history: List[VoiceState] = []

    @property
    def state(self) -> VoiceState:
        return self._state

    def transition(self, new_state: VoiceState) -> bool:
        valid = {
            VoiceState.IDLE: [VoiceState.WAKE_DETECTED, VoiceState.RESETTING],
            VoiceState.WAKE_DETECTED: [VoiceState.LISTENING, VoiceState.IDLE],
            VoiceState.LISTENING: [VoiceState.PROCESSING, VoiceState.INTERRUPTED, VoiceState.RESETTING],
            VoiceState.PROCESSING: [VoiceState.SPEAKING, VoiceState.LISTENING, VoiceState.INTERRUPTED, VoiceState.RESETTING],
            VoiceState.SPEAKING: [VoiceState.LISTENING, VoiceState.INTERRUPTED, VoiceState.RESETTING],
            VoiceState.INTERRUPTED: [VoiceState.LISTENING, VoiceState.RESETTING],
            VoiceState.RESETTING: [VoiceState.IDLE],
        }
        if new_state in valid.get(self._state, []):
            self._history.append(self._state)
            self._state = new_state
            return True
        return False

    def interrupt(self) -> bool:
        if self._state in (VoiceState.SPEAKING, VoiceState.PROCESSING, VoiceState.LISTENING):
            self._history.append(self._state)
            self._state = VoiceState.INTERRUPTED
            return True
        return False

    def reset(self) -> bool:
        self._history.append(self._state)
        self._state = VoiceState.RESETTING
        return True

    def can_listen(self) -> bool:
        return self._state in (VoiceState.IDLE, VoiceState.LISTENING, VoiceState.INTERRUPTED, VoiceState.WAKE_DETECTED)

    def can_speak(self) -> bool:
        return self._state == VoiceState.PROCESSING

    def is_dormant(self) -> bool:
        return self._state == VoiceState.IDLE
