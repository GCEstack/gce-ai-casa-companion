"""Speech-to-text providers."""

import io
import logging
import os
from typing import Optional

import httpx

from .common import DEFAULT_STT, OPENROUTER_BASE, _get_openrouter_provider_routing, logger


class OpenRouterSTT:
    def __init__(self, api_key: Optional[str] = None, model: str = DEFAULT_STT):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self.model = model
        self.client = httpx.AsyncClient(timeout=30.0)

    async def transcribe(self, pcm_bytes: bytes, sample_rate: int = 16000) -> str:
        """Transcribe 16kHz PCM to text via OpenRouter STT.

        Uses OpenAI-compatible multipart/form-data upload, which OpenRouter proxies.
        """
        if not pcm_bytes:
            return ""
        logger.info(f"STT: transcribing {len(pcm_bytes)} bytes")
        wav_bytes = self._pcm_to_wav(pcm_bytes, sample_rate)

        data = {
            "model": self.model,
            "language": "en",
        }
        routing = _get_openrouter_provider_routing()
        if routing:
            data["provider"] = routing
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://casa-companion.io",
            "X-Title": "Casa Companion Voice",
        }
        try:
            resp = await self.client.post(
                f"{OPENROUTER_BASE}/audio/transcriptions",
                headers=headers,
                data=data,
                files={"file": ("audio.wav", io.BytesIO(wav_bytes), "audio/wav")},
            )
            resp.raise_for_status()
            result = resp.json()
            text = result.get("text", "").strip()
            logger.info(f"STT: result = '{text}'")
            return text
        except Exception as e:
            logger.error(f"STT failed: {e}", exc_info=True)
            return ""

    @staticmethod
    def _pcm_to_wav(pcm: bytes, rate: int, channels: int = 1, bits: int = 16) -> bytes:
        """Minimal WAV header wrapper for PCM."""
        import struct
        data_size = len(pcm)
        header = struct.pack(
            "<4sI4s4sIHHIIHH4sI",
            b"RIFF",
            36 + data_size,
            b"WAVE",
            b"fmt ",
            16,
            1,  # PCM
            channels,
            rate,
            rate * channels * bits // 8,
            channels * bits // 8,
            bits,
            b"data",
            data_size,
        )
        return header + pcm


class GroqSTT:
    """Fast STT via Groq Whisper using httpx (no extra SDK dependency)."""

    def __init__(self, api_key: Optional[str] = None, model: str = "whisper-large-v3-turbo"):
        self.api_key = api_key or os.environ.get("GROQ_API_KEY", "")
        self.model = model
        self.client = httpx.AsyncClient(timeout=30.0)
        self.base_url = "https://api.groq.com/openai/v1"

        # Env toggles for future tuning. verbose_json gives word-level timestamps
        # and confidence if we ever want to use them; we still return plain text.
        self.temperature = float(os.environ.get("GROQ_STT_TEMPERATURE", "0"))
        self.response_format = os.environ.get("GROQ_STT_RESPONSE_FORMAT", "verbose_json")

    async def transcribe(self, pcm_bytes: bytes, sample_rate: int = 16000) -> str:
        if not pcm_bytes:
            return ""
        logger.info(f"Groq STT: transcribing {len(pcm_bytes)} bytes")
        wav_bytes = OpenRouterSTT._pcm_to_wav(pcm_bytes, sample_rate)

        try:
            resp = await self.client.post(
                f"{self.base_url}/audio/transcriptions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                files={
                    "file": ("audio.wav", io.BytesIO(wav_bytes), "audio/wav"),
                },
                data={
                    "model": self.model,
                    "language": "en",
                    "temperature": self.temperature,
                    "response_format": self.response_format,
                },
            )
            resp.raise_for_status()
            result = resp.json()
            text = result.get("text", "").strip()
            logger.info(f"Groq STT: result = '{text}'")
            return text
        except Exception as e:
            logger.error(f"Groq STT failed: {e}", exc_info=True)
            return ""
