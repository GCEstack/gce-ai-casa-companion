"""Text-to-speech providers."""

import logging
import os
from typing import AsyncIterator, List, Optional

import httpx

from .character_router import CharacterVoiceRouter, TTSCache
from .common import DEFAULT_TTS, OPENROUTER_BASE, _get_openrouter_provider_routing, logger


class OpenRouterTTS:
    """TTS via OpenRouter /audio/speech with response_format="pcm".

    Streams the response body directly -- no full-buffer + WAV parse.
    This is download streaming, NOT generation streaming.
    For true incremental generation, use /chat/completions with audio modalities.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = DEFAULT_TTS,
        voice: str = "Kore",  # Gemini voice
        sample_rate: int = 16000,
    ):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self.model = model
        self.voice = voice
        self.sample_rate = sample_rate
        self.client = httpx.AsyncClient(timeout=60.0)
        self.voice_router = CharacterVoiceRouter(model)

        cache_enabled = os.environ.get("TTS_CACHE_ENABLED", "1").strip().lower() in ("1", "true", "yes")
        cache_dir = os.environ.get("TTS_CACHE_DIR", "tts_cache")
        self.cache = TTSCache(cache_dir) if cache_enabled else None

    async def synthesize_stream(
        self,
        text: str,
        character: str = "default",
        mode: str = "default",
    ) -> AsyncIterator[bytes]:
        """Yield PCM chunks as they arrive from the wire or from cache."""
        tagged_text = self.voice_router.apply_tags(text, character, mode)
        voice = self.voice_router.get_voice(character, self.voice)
        logger.info(
            f"TTS: synthesizing {len(tagged_text)} chars for character={character}, "
            f"mode={mode}, voice={voice}"
        )

        # Cache hit: serve the pre-generated PCM instantly.
        if self.cache is not None and self.cache.exists(tagged_text, self.model, voice):
            logger.info("TTS: cache hit")
            async for chunk in self.cache.read_stream(tagged_text, self.model, voice):
                yield chunk
            return

        payload = {
            "model": self.model,
            "input": tagged_text,
            "voice": voice,
            "response_format": "pcm",  # KEY: skip WAV header parsing
            "sample_rate": self.sample_rate,
        }
        routing = _get_openrouter_provider_routing()
        if routing:
            payload["provider"] = routing
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://casa-companion.io",
            "X-Title": "Casa Companion Voice",
        }

        try:
            collected: List[bytes] = []
            async with self.client.stream(
                "POST",
                f"{OPENROUTER_BASE}/audio/speech",
                headers=headers,
                json=payload,
            ) as resp:
                resp.raise_for_status()
                total = 0
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    if chunk:
                        total += len(chunk)
                        collected.append(chunk)
                        yield chunk
                logger.info(f"TTS: streamed {total} bytes")

            # Cache the full response for instant replay next time.
            # Cache write failures must not crash the active turn.
            if self.cache is not None and collected:
                try:
                    await self.cache.write(tagged_text, self.model, voice, b"".join(collected))
                except Exception as cache_err:
                    logger.warning(
                        f"TTS cache write failed (turn continuing): {cache_err}", exc_info=True
                    )
        except Exception as e:
            logger.error(f"TTS failed: {e}", exc_info=True)
            raise

    async def synthesize(self, text: str, character: str = "default", mode: str = "default") -> bytes:
        """Full synthesis (buffered). Use synthesize_stream for real-time."""
        chunks = []
        async for chunk in self.synthesize_stream(text, character, mode):
            chunks.append(chunk)
        return b"".join(chunks)


class OpenAIDirectTTS:
    """TTS directly from OpenAI (bypassing OpenRouter)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "tts-1",
        voice: str = "nova",
        response_format: str = "pcm",
        sample_rate: int = 16000,
    ):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model = model
        self.voice = voice
        self.response_format = response_format
        self.sample_rate = sample_rate
        self.client = httpx.AsyncClient(timeout=60.0)

    async def synthesize_stream(
        self,
        text: str,
        character: str = "default",
        mode: str = "default",
    ) -> AsyncIterator[bytes]:
        logger.info(f"OpenAI TTS: synthesizing {len(text)} chars")
        try:
            async with self.client.stream(
                "POST",
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "input": text,
                    "voice": self.voice,
                    "response_format": self.response_format,
                    "sample_rate": self.sample_rate,
                },
            ) as resp:
                resp.raise_for_status()
                total = 0
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    if chunk:
                        total += len(chunk)
                        yield chunk
                logger.info(f"OpenAI TTS: streamed {total} bytes")
        except Exception as e:
            logger.error(f"OpenAI TTS failed: {e}", exc_info=True)
            raise

    async def synthesize(self, text: str, character: str = "default", mode: str = "default") -> bytes:
        """Full synthesis (buffered). Use synthesize_stream for real-time."""
        chunks = []
        async for chunk in self.synthesize_stream(text, character, mode):
            chunks.append(chunk)
        return b"".join(chunks)
