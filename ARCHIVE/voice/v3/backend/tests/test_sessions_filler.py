"""Tests for filler playback integration in VoiceSession."""

import asyncio
from typing import AsyncIterator, List

import pytest

from casa_voice.protocol import VoiceMessage, MessageType
from casa_voice.sessions import VoiceSession, ClientHandle


class FakeLLM:
    def __init__(self, response: str = "That is a great question."):
        self.response = response
        self.chat_calls: List[List[dict]] = []

    async def chat(self, messages, temperature=0.7, max_tokens=512):
        self.chat_calls.append(messages)
        return self.response

    async def chat_stream(self, messages, temperature=0.7, max_tokens=512) -> AsyncIterator[str]:
        self.chat_calls.append(messages)
        for word in self.response.split():
            yield word + " "


class FakeTTS:
    def __init__(self):
        self.requests: List[tuple] = []

    async def synthesize_stream(
        self, text: str, character: str = "default", mode: str = "default"
    ) -> AsyncIterator[bytes]:
        self.requests.append((text, character, mode))
        # Yield a deterministic byte per request so tests can count chunks.
        for i in range(2):
            yield f"pcm:{text[:8]}:{i}".encode()


class FakeSTT:
    async def transcribe(self, pcm_bytes, sample_rate=16000):
        return ""


class FakeVAD:
    async def detect_speech(self, pcm_bytes):
        return False


class FakeCommands:
    def __init__(self):
        self.classifier = self
        self.trigger_responder = self
        self.echo_responder = self
        self.keyword_compressor = self

    def compress(self, text: str) -> str:
        return text

    def match(self, transcript: str):
        return None

    def strip_wake_phrase(self, transcript: str) -> str:
        return transcript


class FakeProviders:
    def __init__(self, llm_response: str = "That is a great question."):
        self.llm = FakeLLM(llm_response)
        self.tts = FakeTTS()
        self.stt = FakeSTT()
        self.vad = FakeVAD()
        self.commands = FakeCommands()
        self.native_audio = None


@pytest.fixture
def session():
    providers = FakeProviders()
    sess = VoiceSession("test-session", providers, character="drago", mode="play")
    return sess, providers


@pytest.fixture
def dummy_client():
    """A tiny audio client that records every message broadcast to it."""
    sent: List[VoiceMessage] = []

    async def send(msg: VoiceMessage):
        sent.append(msg)

    client = ClientHandle(device_id="audio-1", device_type="audio", send=send)
    return sent, client


@pytest.mark.asyncio
async def test_play_filler_before_llm_response(session, dummy_client):
    sess, providers = session
    sent, client = dummy_client
    sess.add_client(client)

    await sess._process_and_speak("What is the biggest dinosaur?", play_filler=True)

    tts_texts = [req[0] for req in providers.tts.requests]
    assert len(tts_texts) == 2
    # First TTS request should be a filler.
    assert "think" in tts_texts[0].lower() or "figur" in tts_texts[0].lower()
    # Second TTS request should be the real LLM response.
    assert tts_texts[1] == "That is a great question."

    audio_chunks = [m for m in sent if m.type == MessageType.TTS_CHUNK]
    assert len(audio_chunks) == 4  # 2 filler chunks + 2 response chunks
    # Filler chunks should have lower sequence numbers than response chunks.
    assert audio_chunks[0].payload["sequence"] < audio_chunks[-1].payload["sequence"]


@pytest.mark.asyncio
async def test_trigger_response_skips_filler(session, dummy_client):
    sess, providers = session
    sent, client = dummy_client
    sess.add_client(client)

    await sess._process_and_speak("It is time for bed.", skip_history=True)

    tts_texts = [req[0] for req in providers.tts.requests]
    assert len(tts_texts) == 1
    assert "It is time for bed." in tts_texts[0]

    audio_chunks = [m for m in sent if m.type == MessageType.TTS_CHUNK]
    assert len(audio_chunks) == 2  # only the trigger response, no filler


@pytest.mark.asyncio
async def test_streaming_path_plays_filler(session, dummy_client):
    sess, providers = session
    sent, client = dummy_client
    sess.add_client(client)

    await sess._process_and_speak_streaming("How do rockets fly?", play_filler=True)

    tts_texts = [req[0] for req in providers.tts.requests]
    assert len(tts_texts) >= 2
    assert any("think" in t.lower() or "figur" in t.lower() for t in tts_texts)

    audio_chunks = [m for m in sent if m.type == MessageType.TTS_CHUNK]
    assert len(audio_chunks) >= 4


@pytest.mark.asyncio
async def test_short_transcript_skips_filler(session, dummy_client):
    sess, providers = session
    sent, client = dummy_client
    sess.add_client(client)

    await sess._process_and_speak("Hi", play_filler=True)

    tts_texts = [req[0] for req in providers.tts.requests]
    assert len(tts_texts) == 1
    assert tts_texts[0] == "That is a great question."
