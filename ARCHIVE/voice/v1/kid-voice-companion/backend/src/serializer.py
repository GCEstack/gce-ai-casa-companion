"""Raw PCM16 audio serializer for simple WebSocket clients."""

import json

from pipecat.frames.frames import (
    Frame,
    InputAudioRawFrame,
    LLMMessagesAppendFrame,
    OutputAudioRawFrame,
)
from pipecat.serializers.base_serializer import FrameSerializer


class RawAudioFrameSerializer(FrameSerializer):
    """Serialize/deserialize raw audio bytes and simple JSON text messages."""

    def __init__(self, sample_rate: int = 16000, num_channels: int = 1):
        super().__init__()
        self.sample_rate = sample_rate
        self.num_channels = num_channels

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if isinstance(frame, OutputAudioRawFrame):
            return frame.audio
        return None

    async def deserialize(self, data: str | bytes) -> Frame | None:
        if isinstance(data, bytes):
            return InputAudioRawFrame(
                audio=data,
                sample_rate=self.sample_rate,
                num_channels=self.num_channels,
            )

        if isinstance(data, str):
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                return None

            msg_type = payload.get("type")
            if msg_type == "text":
                return LLMMessagesAppendFrame(
                    messages=[{"role": "user", "content": payload.get("text", "")}],
                    run_llm=True,
                )

        return None
