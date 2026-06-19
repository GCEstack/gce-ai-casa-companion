"""Casa Voice V2/V3 — Wake-Phrase + Dual-Mode Protocol

Interaction Model: Wake-Phrase (always-listening audio devices)
- IDLE: Audio device streams mic audio continuously.
- Server detects wake phrase ("Hello", "Hey", "Wake up", "Wake") → LISTENING.
- User speaks → server collects audio until 800 ms silence → PROCESSING.
- STT → command/LLM → TTS → SPEAKING.
- Barge-in: INTERRUPT command (Space/avatar/button) stops playback.
- RESET command clears conversation history and returns to IDLE.

Device Modes:
- Mode A (browser audio): browser sends/receives PCM and JSON.
- Mode B (dashboard only): browser sends/receives JSON only; ESP32 handles PCM.
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
import json


class MessageType(Enum):
    AUDIO_CHUNK = "audio_chunk"
    COMMAND = "command"
    CONFIG_CHANGE = "config_change"  # character / mode update
    STATE_CHANGE = "state_change"
    TRANSCRIPT = "transcript"
    ASSISTANT_TEXT = "assistant_text"
    TTS_CHUNK = "tts_chunk"
    ERROR = "error"
    PING = "ping"
    PONG = "pong"
    INTERRUPT_ACK = "interrupt_ack"
    END_TURN_ACK = "end_turn_ack"
    DEVICE_CONNECTED = "device_connected"
    DEVICE_DISCONNECTED = "device_disconnected"


class VoiceState(Enum):
    IDLE = "idle"
    WAKE_DETECTED = "wake_detected"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    INTERRUPTED = "interrupted"


class CommandType(Enum):
    """Voice and UI commands."""
    WAKE = "wake"                           # Wake phrase detected (server-internal)
    END_TURN = "end_turn"                   # Spoken "Send"/"End"/"Capische"
    INTERRUPT = "interrupt"                 # Cut off speaking
    STOP = "stop"
    RESET = "reset"
    LOUDER = "louder"
    SOFTER = "softer"
    VOLUME_UP = "volume_up"                 # UI volume +10%
    VOLUME_DOWN = "volume_down"             # UI volume -10%
    STORY_MODE = "story_mode"
    PLAY_MODE = "play_mode"
    CHARACTER_DRAGO = "character_drago"
    CHARACTER_LIAM = "character_liam"
    CHARACTER_JENNY = "character_jenny"
    CHARACTER_DEFAULT = "character_default"
    BUTTON_PRESS = "button_press"
    SCENE_BEDTIME = "scene_bedtime"
    SCENE_GREETING = "scene_greeting"
    SCENE_JOKE = "scene_joke"


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
    def config_change(
        cls,
        character: Optional[str] = None,
        mode: Optional[str] = None,
        volume: Optional[float] = None,
    ) -> "VoiceMessage":
        payload = {}
        if character is not None:
            payload["character"] = character
        if mode is not None:
            payload["mode"] = mode
        if volume is not None:
            payload["volume"] = volume
        return cls(type=MessageType.CONFIG_CHANGE, payload=payload)

    @classmethod
    def state_change(cls, state: VoiceState) -> "VoiceMessage":
        return cls(type=MessageType.STATE_CHANGE, payload={"state": state.value})

    @classmethod
    def transcript(cls, text: str, is_final: bool = True) -> "VoiceMessage":
        return cls(type=MessageType.TRANSCRIPT, payload={"text": text, "final": is_final})

    @classmethod
    def assistant_text(cls, text: str) -> "VoiceMessage":
        return cls(type=MessageType.ASSISTANT_TEXT, payload={"text": text})

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
    def interrupt_ack(cls) -> "VoiceMessage":
        return cls(type=MessageType.INTERRUPT_ACK)

    @classmethod
    def end_turn_ack(cls) -> "VoiceMessage":
        return cls(type=MessageType.END_TURN_ACK)

    @classmethod
    def device_connected(cls, device_id: str, device_type: str) -> "VoiceMessage":
        return cls(
            type=MessageType.DEVICE_CONNECTED,
            payload={"device_id": device_id, "device_type": device_type},
        )

    @classmethod
    def device_disconnected(cls, device_id: str, device_type: str) -> "VoiceMessage":
        return cls(
            type=MessageType.DEVICE_DISCONNECTED,
            payload={"device_id": device_id, "device_type": device_type},
        )


class StateMachine:
    """Wake-phrase state machine."""

    def __init__(self):
        self._state = VoiceState.IDLE
        self._history: List[VoiceState] = []

    @property
    def state(self) -> VoiceState:
        return self._state

    def transition(self, new_state: VoiceState) -> bool:
        valid = {
            VoiceState.IDLE: [VoiceState.WAKE_DETECTED, VoiceState.LISTENING],
            VoiceState.WAKE_DETECTED: [VoiceState.LISTENING],
            VoiceState.LISTENING: [VoiceState.PROCESSING, VoiceState.INTERRUPTED],
            VoiceState.PROCESSING: [VoiceState.SPEAKING, VoiceState.LISTENING, VoiceState.INTERRUPTED],
            VoiceState.SPEAKING: [VoiceState.LISTENING, VoiceState.INTERRUPTED],
            VoiceState.INTERRUPTED: [VoiceState.IDLE, VoiceState.LISTENING],
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
        self._state = VoiceState.IDLE
        return True

    def can_listen(self) -> bool:
        return self._state in (VoiceState.IDLE, VoiceState.LISTENING, VoiceState.INTERRUPTED)

    def can_speak(self) -> bool:
        return self._state == VoiceState.PROCESSING

    def is_dormant(self) -> bool:
        return self._state == VoiceState.IDLE
