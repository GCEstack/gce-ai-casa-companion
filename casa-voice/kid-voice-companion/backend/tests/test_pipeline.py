"""Unit tests for the voice pipeline helpers."""

import os
import sys

import pytest

from pipecat.frames.frames import (
    InputAudioRawFrame,
    OutputAudioRawFrame,
    TextFrame,
    TranscriptionFrame,
)
from pipecat.processors.frame_processor import FrameDirection

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from pipeline import KeywordSafetyFilter, PCM16RawSerializer


@pytest.mark.asyncio
async def test_pcm_serializer_deserialize():
    serializer = PCM16RawSerializer(input_sample_rate=16000)
    raw_bytes = b"\x00\x01\x02\x03"
    frame = await serializer.deserialize(raw_bytes)

    assert isinstance(frame, InputAudioRawFrame)
    assert frame.audio == raw_bytes
    assert frame.sample_rate == 16000
    assert frame.num_channels == 1


@pytest.mark.asyncio
async def test_pcm_serializer_serialize():
    serializer = PCM16RawSerializer(output_sample_rate=24000)
    raw_bytes = b"\x00\x01\x02\x03"
    frame = OutputAudioRawFrame(audio=raw_bytes, sample_rate=24000, num_channels=1)
    data = await serializer.serialize(frame)

    assert data == raw_bytes


@pytest.mark.asyncio
async def test_pcm_serializer_ignores_non_audio():
    serializer = PCM16RawSerializer()
    text_frame = TextFrame("hello")
    assert await serializer.serialize(text_frame) is None


class MockPushFrame:
    def __init__(self):
        self.frames = []

    async def __call__(self, frame, direction=None):
        self.frames.append((frame, direction))


@pytest.mark.asyncio
async def test_safety_filter_allows_safe_transcription():
    safety = KeywordSafetyFilter(blocked_words=["badword"])
    pushed = MockPushFrame()
    safety.push_frame = pushed

    frame = TranscriptionFrame(text="I like dogs", user_id="test", timestamp="")
    await safety.process_frame(frame, FrameDirection.DOWNSTREAM)

    assert len(pushed.frames) == 1
    assert pushed.frames[0][0] is frame


@pytest.mark.asyncio
async def test_safety_filter_blocks_bad_transcription():
    safety = KeywordSafetyFilter(blocked_words=["badword"])
    pushed = MockPushFrame()
    safety.push_frame = pushed

    frame = TranscriptionFrame(text="this is a badword sentence", user_id="test", timestamp="")
    await safety.process_frame(frame, FrameDirection.DOWNSTREAM)

    assert len(pushed.frames) == 1
    assert isinstance(pushed.frames[0][0], TextFrame)
    assert "something else" in pushed.frames[0][0].text
