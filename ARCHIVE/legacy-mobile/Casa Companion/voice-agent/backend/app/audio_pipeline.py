"""Audio pipeline: Deepgram streaming STT, Groq LLM, Cartesia streaming TTS."""
from __future__ import annotations

import asyncio
import base64
import re
from typing import Any, AsyncIterable, Callable

import httpx
from deepgram import DeepgramClient, DeepgramClientOptions, LiveOptions, LiveTranscriptionEvents
from groq import AsyncGroq, RateLimitError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .config import get_settings


class TranscriptError(Exception):
    pass


class DeepgramSTTClient:
    """Stream audio to Deepgram Nova-3 and yield final transcripts."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.settings = get_settings()
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._dg: Any | None = None
        self._connection: Any | None = None
        self._is_connected = False

    async def start(self):
        options = LiveOptions(
            model=self.settings.deepgram_model,
            language=self.settings.deepgram_language,
            encoding=self.settings.deepgram_encoding,
            sample_rate=self.settings.stt_input_sample_rate,
            channels=1,
            interim_results=True,
            punctuate=True,
            smart_format=True,
            endpointing=300,
        )
        config = DeepgramClientOptions(options={"keepalive": "true"})
        self._dg = DeepgramClient(self.api_key, config)
        self._connection = self._dg.listen.websocket.v("1")

        self._connection.on(LiveTranscriptionEvents.Transcript, self._on_transcript)
        self._connection.on(LiveTranscriptionEvents.Error, self._on_error)
        self._connection.on(LiveTranscriptionEvents.Close, self._on_close)

        if not self._connection.start(options):
            raise TranscriptError("Deepgram live transcription failed to start")
        self._is_connected = True

    def _on_transcript(self, _self, result, **kwargs):
        sentence = result.channel.alternatives[0].transcript.strip()
        if sentence and result.is_final:
            self._queue.put_nowait(sentence)

    def _on_error(self, _self, error, **kwargs):
        print(f"[Deepgram] error: {error}")

    def _on_close(self, _self, close, **kwargs):
        self._is_connected = False

    async def feed(self, chunk: bytes):
        if self._is_connected and self._connection and chunk:
            self._connection.send(chunk)

    async def final_transcript(self, timeout: float | None = None) -> str | None:
        """Wait for the next finalized transcript. Returns None on timeout."""
        try:
            return await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    async def stop(self):
        if self._connection:
            try:
                self._connection.finish()
            except Exception:
                pass
        self._is_connected = False


class GroqLLMClient:
    """Groq Llama 3.3 70B chat completion."""

    def __init__(self, api_key: str):
        self.client = AsyncGroq(api_key=api_key)
        self.settings = get_settings()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((RateLimitError,)),
        reraise=True,
    )
    async def complete(self, messages: list[dict[str, str]], system_prompt: str) -> str:
        full_messages = [{"role": "system", "content": system_prompt}]
        # Keep the last several exchanges; system prompt is prepended fresh.
        full_messages.extend(messages[-8:])
        response = await self.client.chat.completions.create(
            model=self.settings.groq_model,
            messages=full_messages,
            max_tokens=self.settings.max_llm_tokens,
            temperature=self.settings.llm_temperature,
        )
        if not response.choices:
            return "I'm not sure what to say."
        return response.choices[0].message.content.strip()


class CartesiaTTSClient:
    """Stream TTS audio from Cartesia Sonic 3 as raw PCM s16le chunks."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.settings = get_settings()
        self.url = "https://api.cartesia.ai/tts/bytes"

    async def stream(
        self,
        text: str,
        voice_id: str,
        ssml_template: str,
    ) -> AsyncIterable[bytes]:
        safe_text = self._escape_xml(text)
        template = (ssml_template or "").strip()
        if "{{text}}" in template:
            transcript = template.replace("{{text}}", safe_text)
        elif template.startswith("<speak>") and template.endswith("</speak>"):
            transcript = f"{template[:-8]}<prosody>{safe_text}</prosody></speak>"
        elif template:
            # Non-empty fragment without <speak> wrapper or placeholder: wrap it as-is.
            transcript = f"<speak>{template}{safe_text}</speak>"
        else:
            transcript = f"<speak><prosody>{safe_text}</prosody></speak>"

        payload = {
            "model_id": self.settings.cartesia_model,
            "transcript": transcript,
            "voice": {"mode": "id", "id": voice_id},
            "output_format": {
                "container": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": self.settings.tts_output_sample_rate,
            },
            "language": self.settings.cartesia_language,
        }
        headers = {
            "X-API-Key": self.api_key,
            "Cartesia-Version": "2024-06-10",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", self.url, headers=headers, json=payload) as resp:
                if resp.status_code >= 400:
                    body = await resp.aread()
                    raise RuntimeError(
                        f"Cartesia TTS {resp.status_code}: {body.decode('utf-8', errors='ignore')}"
                    )
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    if chunk:
                        yield chunk

    @staticmethod
    def _escape_xml(text: str) -> str:
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class TTSPipeline:
    """High-level TTS helper that chunks text and streams each chunk."""

    def __init__(self, tts_client: CartesiaTTSClient, chunker: Callable[[str], list[str]], voice_resolver: Callable[[Any], str]):
        self.tts_client = tts_client
        self.chunker = chunker
        self.voice_resolver = voice_resolver

    async def speak(self, text: str, mode: Any) -> AsyncIterable[bytes]:
        voice_id = self.voice_resolver(mode)
        chunks = self.chunker(text)
        if not chunks:
            chunks = [text[: get_settings().max_tts_chars]]
        for chunk_text in chunks:
            async for audio in self.tts_client.stream(chunk_text, voice_id, mode.ssml_template):
                yield audio
