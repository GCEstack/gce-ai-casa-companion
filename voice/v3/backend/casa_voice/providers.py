"""Casa Voice V2 — Audio Providers + VAD

Key decisions from audit:
- TTS: Use /audio/speech with response_format="pcm", stream body directly.
- Tags: [whispers], [excited], [laughs] work on gemini-3.1-flash-tts-preview ONLY.
  Chunk to <500 chars/segment. Keep tags in English.
- VAD: Silero on backend (2.3MB model). ESP32 uses energy gate with hysteresis.
"""

import io
import os
import re
import json
import wave
import asyncio
import base64
import logging
import hashlib
from typing import AsyncIterator, Optional, List, Dict, Any
from dataclasses import dataclass

import httpx
import numpy as np

from .characters import get_character_profile

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
DEFAULT_LLM = "openai/gpt-4o-mini"
DEFAULT_STT = "openai/whisper-1"
DEFAULT_TTS = "google/gemini-3.1-flash-tts-preview"  # ONLY model that supports tags


def _get_openrouter_provider_routing() -> Optional[Dict[str, Any]]:
    """Return provider routing preferences if OPENROUTER_PROVIDER_SORT is set.

    Valid sorts: price, throughput, latency.
    See: https://openrouter.ai/docs/provider-routing
    """
    sort = os.environ.get("OPENROUTER_PROVIDER_SORT", "").strip().lower()
    if sort in ("price", "throughput", "latency"):
        return {"sort": sort}
    return None


# ────────────────────────────────
# Resample utility
# ────────────────────────────────

def resample_pcm(
    pcm_bytes: bytes,
    src_rate: int,
    dst_rate: int,
    channels: int = 1,
    dtype: np.dtype = np.int16,
) -> bytes:
    """Fast linear resample using numpy."""
    if src_rate == dst_rate:
        return pcm_bytes
    arr = np.frombuffer(pcm_bytes, dtype=dtype)
    if channels > 1:
        arr = arr.reshape(-1, channels).mean(axis=1).astype(dtype)
    ratio = dst_rate / src_rate
    new_len = int(len(arr) * ratio)
    indices = np.linspace(0, len(arr) - 1, new_len)
    resampled = np.interp(indices, np.arange(len(arr)), arr).astype(dtype)
    return resampled.tobytes()


# ────────────────────────────────
# OpenRouter STT
# ────────────────────────────────

class OpenRouterSTT:
    def __init__(self, api_key: Optional[str] = None, model: str = DEFAULT_STT):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self.model = model
        self.client = httpx.AsyncClient(timeout=30.0)

    async def transcribe(self, pcm_bytes: bytes, sample_rate: int = 16000) -> str:
        """Transcribe 16kHz PCM to text via OpenRouter STT.

        OpenRouter's /audio/transcriptions endpoint expects a JSON body with
        base64-encoded audio under input_audio, not a multipart/form upload.
        """
        if not pcm_bytes:
            return ""
        logger.info(f"STT: transcribing {len(pcm_bytes)} bytes")
        # Wrap PCM in a WAV header and base64-encode it for OpenRouter.
        wav_bytes = self._pcm_to_wav(pcm_bytes, sample_rate)
        audio_b64 = base64.b64encode(wav_bytes).decode("ascii")

        payload = {
            "model": self.model,
            "input_audio": {
                "data": audio_b64,
                "format": "wav",
            },
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
            resp = await self.client.post(
                f"{OPENROUTER_BASE}/audio/transcriptions",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            text = data.get("text", "").strip()
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


# ────────────────────────────────
# CharacterVoiceRouter — Gemini Tags
# ────────────────────────────────

@dataclass
class VoiceProfile:
    name: str
    prompt_prefix: str
    tags: Dict[str, str]
    default_tag: str = "[excited]"


class CharacterVoiceRouter:
    """Maps character + mode → Gemini audio tags.

    CRITICAL: Only gemini-3.1-flash-tts-preview supports these tags.
    Chunk to <500 chars per segment to avoid tag-reading failures.
    """

    TAGS = {
        "whispers": "[whispers]",
        "excited": "[excited]",
        "laughs": "[laughs]",
        "shouting": "[shouting]",
        "sighs": "[sighs]",
        "singing": "[singing]",
        "angry": "[angry]",
        "sarcastic": "[sarcastic]",
        "trembling": "[trembling]",
    }

    MAX_TAGGED_LENGTH = 500  # chars — beyond this, Gemini may read tags aloud

    def __init__(self, tts_model: str = DEFAULT_TTS):
        self.tts_model = tts_model
        if "gemini-3.1" not in tts_model:
            logger.warning(
                "CharacterVoiceRouter: tags only work on gemini-3.1-flash-tts-preview. "
                f"Current model: {tts_model}"
            )

    def get_profile(self, character: str) -> VoiceProfile:
        profile = get_character_profile(character)
        return VoiceProfile(
            name=profile.name,
            prompt_prefix=profile.prompt,
            tags=profile.tags,
            default_tag=profile.default_tag,
        )

    def apply_tags(self, text: str, character: str, mode: str = "default") -> str:
        """Wrap text with appropriate Gemini audio tags.

        Only Gemini Flash TTS supports these tags; for other models (e.g. OpenAI
        voices via OpenRouter) return the text unchanged so tags aren't spoken.
        """
        if "gemini-3.1" not in self.tts_model:
            return text

        profile = self.get_profile(character)
        tag = profile.tags.get(mode, profile.default_tag)

        # Chunk if too long
        if len(text) > self.MAX_TAGGED_LENGTH:
            chunks = self._chunk_text(text)
            tagged = " ".join([f"{tag} {chunk}" for chunk in chunks])
        else:
            tagged = f"{tag} {text}"

        # Ensure tags are in English (they already are)
        return tagged

    def _chunk_text(self, text: str, max_len: int = 400) -> List[str]:
        """Split text into sentences, group into chunks under max_len."""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        chunks = []
        current = ""
        for sent in sentences:
            if len(current) + len(sent) + 1 <= max_len:
                current += " " + sent if current else sent
            else:
                if current:
                    chunks.append(current)
                current = sent
        if current:
            chunks.append(current)
        return chunks


# ────────────────────────────────
# TTS PCM cache
# ────────────────────────────────

class TTSCache:
    """On-disk cache for raw TTS PCM output keyed by text + model + voice.

    Makes repeated phrases (greetings, trigger responses, echo replies,
    story-queue segments) play instantly on subsequent uses.
    """

    CHUNK_SIZE = 4096

    def __init__(self, cache_dir: str):
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)

    def _key(self, text: str, model: str, voice: str) -> str:
        payload = f"model={model}&voice={voice}&text={text}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def _path(self, key: str) -> str:
        return os.path.join(self.cache_dir, f"{key}.pcm")

    def exists(self, text: str, model: str, voice: str) -> bool:
        return os.path.exists(self._path(self._key(text, model, voice)))

    async def read_stream(
        self, text: str, model: str, voice: str
    ) -> AsyncIterator[bytes]:
        path = self._path(self._key(text, model, voice))

        def _read() -> bytes:
            with open(path, "rb") as f:
                return f.read()

        data = await asyncio.to_thread(_read)
        for i in range(0, len(data), self.CHUNK_SIZE):
            yield data[i : i + self.CHUNK_SIZE]

    async def write(self, text: str, model: str, voice: str, data: bytes) -> None:
        key = self._key(text, model, voice)
        path = self._path(key)
        tmp_path = path + ".tmp"

        def _write():
            with open(tmp_path, "wb") as f:
                f.write(data)
            os.replace(tmp_path, path)

        await asyncio.to_thread(_write)


# ────────────────────────────────
# OpenRouter TTS — PCM Streamed
# ────────────────────────────────

class OpenRouterTTS:
    """TTS via OpenRouter /audio/speech with response_format="pcm".

    Streams the response body directly — no full-buffer + WAV parse.
    This is download streaming, NOT generation streaming.
    For true incremental generation, use /chat/completions with audio modalities.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = DEFAULT_TTS,
        voice: Optional[str] = None,
        sample_rate: int = 16000,
    ):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self.model = model
        # Gemini Flash TTS only supports a small set of voices (e.g. Kore, Fenrir, Leda).
        # Ignore per-character OpenAI voice ids and always use the configured Gemini voice.
        self.voice = voice or os.environ.get("OPENROUTER_TTS_VOICE", "Kore")
        self.sample_rate = sample_rate
        self.client = httpx.AsyncClient(timeout=60.0)
        self.voice_router = CharacterVoiceRouter(model)

        cache_enabled = os.environ.get("TTS_CACHE_ENABLED", "1").strip().lower() in ("1", "true", "yes")
        cache_dir = os.environ.get("TTS_CACHE_DIR", "tts_cache")
        self.cache = TTSCache(cache_dir) if cache_enabled else None

    def _voice_for_character(self, character: str) -> str:
        # Gemini Flash TTS only supports its own voices (e.g. Kore, Sulafat).
        # For other models we can use the per-character voice from the mobile config.
        if "gemini-3.1" in self.model:
            return self.voice
        profile = get_character_profile(character)
        return profile.voice_id or self.voice

    def _output_sample_rate(self) -> int:
        """Return the native PCM sample rate returned by the chosen TTS model."""
        if self.model.startswith("openai/tts"):
            return 24000
        # Gemini Flash TTS returns the requested sample rate.
        return self.sample_rate

    async def synthesize_stream(
        self,
        text: str,
        character: str = "default",
        mode: str = "default",
    ) -> AsyncIterator[bytes]:
        """Yield PCM chunks as they arrive from the wire or from cache."""
        tagged_text = self.voice_router.apply_tags(text, character, mode)
        voice = self._voice_for_character(character)
        logger.info(f"TTS: synthesizing {len(tagged_text)} chars for character={character}, mode={mode}, voice={voice}")

        # Cache hit: serve the pre-generated PCM instantly.
        if self.cache is not None and self.cache.exists(tagged_text, self.model, voice):
            logger.info("TTS: cache hit")
            async for chunk in self.cache.read_stream(tagged_text, self.model, voice):
                yield chunk
            return

        payload: Dict[str, Any] = {
            "model": self.model,
            "input": tagged_text,
            "voice": voice,
            "response_format": "pcm",  # KEY: skip WAV header parsing
        }
        # Only Gemini Flash TTS accepts an explicit sample_rate parameter.
        if "gemini-3.1" in self.model:
            payload["sample_rate"] = self.sample_rate
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
                logger.info(f"TTS: streamed {total} bytes")

            if not collected:
                return

            pcm = b"".join(collected)
            src_rate = self._output_sample_rate()
            if src_rate != self.sample_rate:
                pcm = resample_pcm(pcm, src_rate, self.sample_rate)
                logger.info(f"TTS: resampled {src_rate}Hz -> {self.sample_rate}Hz")

            # Cache and yield the final (resampled) PCM.
            if self.cache is not None:
                await self.cache.write(tagged_text, self.model, voice, pcm)

            for i in range(0, len(pcm), self.cache.CHUNK_SIZE if self.cache else 4096):
                yield pcm[i : i + (self.cache.CHUNK_SIZE if self.cache else 4096)]
        except Exception as e:
            logger.error(f"TTS failed: {e}", exc_info=True)
            raise

    async def synthesize(self, text: str, character: str = "default", mode: str = "default") -> bytes:
        """Full synthesis (buffered). Use synthesize_stream for real-time."""
        chunks = []
        async for chunk in self.synthesize_stream(text, character, mode):
            chunks.append(chunk)
        return b"".join(chunks)


# ────────────────────────────────
# Cartesia TTS — PCM s16le 16kHz
# ────────────────────────────────

class CartesiaTTS:
    """Stream TTS audio from Cartesia Sonic as raw PCM s16le chunks.

    Defaults to 16 kHz to match the browser playback pipeline.
    """

    CARTESIA_DEFAULT_VOICE = "f786b574-daa5-4673-aa0c-cbe3e8534c02"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        voice_id: Optional[str] = None,
        sample_rate: int = 16000,
    ):
        self.api_key = api_key or os.environ.get("CARTESIA_API_KEY", "")
        self.model = model or os.environ.get("CARTESIA_MODEL", "sonic-3")
        self.voice_id = voice_id or os.environ.get("CARTESIA_VOICE_ID", self.CARTESIA_DEFAULT_VOICE)
        self.sample_rate = sample_rate
        self.language = os.environ.get("CARTESIA_LANGUAGE", "en")
        self.client = httpx.AsyncClient(timeout=60.0)

    async def synthesize_stream(
        self,
        text: str,
        character: str = "default",
        mode: str = "default",
    ) -> AsyncIterator[bytes]:
        """Yield PCM s16le chunks as they arrive from Cartesia."""
        if not text.strip():
            return

        payload = {
            "model_id": self.model,
            "transcript": text.strip(),
            "voice": {"mode": "id", "id": self.voice_id},
            "output_format": {
                "container": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": self.sample_rate,
            },
            "language": self.language,
        }
        headers = {
            "X-API-Key": self.api_key,
            "Cartesia-Version": "2024-06-10",
            "Content-Type": "application/json",
        }

        logger.info(
            f"TTS: Cartesia synthesizing {len(text)} chars "
            f"model={self.model} voice={self.voice_id} rate={self.sample_rate}"
        )
        total = 0
        async with self.client.stream("POST", "https://api.cartesia.ai/tts/bytes", headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise RuntimeError(f"Cartesia TTS {resp.status_code}: {body.decode('utf-8', errors='ignore')}")
            async for chunk in resp.aiter_bytes(chunk_size=4096):
                if chunk:
                    total += len(chunk)
                    yield chunk
        logger.info(f"TTS: Cartesia streamed {total} bytes")

    async def synthesize(self, text: str, character: str = "default", mode: str = "default") -> bytes:
        chunks = []
        async for chunk in self.synthesize_stream(text, character, mode):
            chunks.append(chunk)
        return b"".join(chunks)


# ────────────────────────────────
# Silero VAD (Backend)
# ────────────────────────────────

class SileroVAD:
    """Neural VAD for backend noise robustness, lazy-loaded with energy fallback.

    Requires: pip install torch onnxruntime
    Model: silero-vad v4.0 (~2.3MB)

    Loading torch.hub.load() is slow and blocks the async event loop, so we:
      1. Use a fast energy gate immediately.
      2. Kick off Silero loading in a background thread on first use.
      3. Switch to Silero once it is ready.
    """

    def __init__(
        self,
        threshold: float = 0.5,
        sample_rate: int = 16000,
        energy_threshold: float = None,
        peak_threshold: float = None,
    ):
        self.threshold = threshold
        self.sample_rate = sample_rate
        # Defaults tuned for typical room noise captured by a phone/browser mic.
        # Values are normalised to the [-1, 1] float range (16-bit PCM / 32768).
        self.energy_threshold = energy_threshold if energy_threshold is not None else float(
            os.environ.get("VAD_ENERGY_THRESHOLD", "0.003")
        )
        self.peak_threshold = peak_threshold if peak_threshold is not None else float(
            os.environ.get("VAD_PEAK_THRESHOLD", "0.015")
        )
        self._model = None
        self._get_speech_timestamps = None
        self._load_error: Optional[Exception] = None
        self._loading = False
        self._ready = False

    async def _load_model(self):
        """Load Silero model in a background thread."""
        if self._loading or self._ready:
            return
        self._loading = True
        logger.info("Silero VAD: starting background load...")
        try:
            import torch
            model, utils = await asyncio.to_thread(
                torch.hub.load,
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
            )
            self._model = model
            (self._get_speech_timestamps, _, _, _, _) = utils
            self._ready = True
            logger.info("Silero VAD loaded successfully")
        except Exception as e:
            self._load_error = e
            logger.error(
                f"Failed to load Silero VAD; energy gate will remain primary. Error: {e}"
            )
        finally:
            self._loading = False

    def _energy_detect_speech(self, pcm_bytes: bytes) -> bool:
        """Fast energy/peak-based speech detection used as primary gate."""
        if not pcm_bytes:
            return False
        arr = np.frombuffer(pcm_bytes, dtype=np.int16)
        if arr.size == 0:
            return False
        mean_abs = float(np.mean(np.abs(arr))) / 32768.0
        peak = float(np.max(np.abs(arr))) / 32768.0
        logger.debug(
            f"VAD energy: mean={mean_abs:.5f} peak={peak:.5f} "
            f"(thresholds mean={self.energy_threshold} peak={self.peak_threshold})"
        )
        if mean_abs > self.energy_threshold:
            logger.debug(f"VAD energy gate fired (mean {mean_abs:.5f})")
            return True
        if peak > self.peak_threshold:
            logger.debug(f"VAD peak gate fired (peak {peak:.5f})")
            return True
        return False

    async def detect_speech(self, pcm_bytes: bytes) -> bool:
        """Return True if speech detected in PCM chunk."""
        # Start background Silero load on first use, but do not wait for it.
        if not self._loading and not self._ready and self._load_error is None:
            asyncio.create_task(self._load_model())

        energy_result = self._energy_detect_speech(pcm_bytes)

        if not self._ready:
            # Silero not ready yet — energy gate is the primary VAD.
            if energy_result:
                logger.info("VAD: speech detected by energy gate")
            return energy_result

        # Hybrid: if energy is very low, skip Silero to save CPU.
        if not energy_result:
            return False

        try:
            import torch

            # Silero model requires fixed-size windows: 512 samples @ 16kHz, 256 @ 8kHz.
            window_samples = 512 if self.sample_rate == 16000 else 256
            arr = np.frombuffer(pcm_bytes, dtype=np.int16).copy()
            if len(arr) < window_samples:
                return energy_result

            step = window_samples // 2
            for start in range(0, len(arr) - window_samples + 1, step):
                chunk = arr[start : start + window_samples]
                tensor = torch.from_numpy(chunk).float() / 32768.0
                speech_prob = self._model(tensor, self.sample_rate).item()
                if speech_prob > self.threshold:
                    return True
            return False
        except Exception as e:
            logger.error(f"Silero VAD error: {e}; using energy fallback")
            return energy_result

    async def get_timestamps(self, pcm_bytes: bytes) -> List[Dict[str, float]]:
        """Return speech timestamps [{start, end}, ...] in seconds."""
        if not self._ready:
            return []
        try:
            import torch

            arr = np.frombuffer(pcm_bytes, dtype=np.int16).copy()
            tensor = torch.from_numpy(arr).float() / 32768.0
            if self.sample_rate != 16000:
                tensor = tensor[:: self.sample_rate // 16000]
            return self._get_speech_timestamps(
                tensor, self._model, sampling_rate=16000, threshold=self.threshold
            )
        except Exception as e:
            logger.error(f"VAD timestamp error: {e}")
            return []


# ────────────────────────────────
# Groq STT (Whisper)
# ────────────────────────────────

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


# ────────────────────────────────
# Groq LLM
# ────────────────────────────────

class GroqLLM:
    """Fast LLM via Groq."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "llama-3.3-70b-versatile",
    ):
        self.api_key = api_key or os.environ.get("GROQ_API_KEY", "")
        self.model = model
        self.client = httpx.AsyncClient(timeout=60.0)

    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 512,
    ) -> str:
        try:
            resp = await self.client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error(f"Groq LLM failed: {e}", exc_info=True)
            return ""

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 512,
    ) -> AsyncIterator[str]:
        """Stream LLM text chunks as they arrive from Groq."""
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with self.client.stream(
                "POST",
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if not chunk.get("choices"):
                        continue
                    delta = chunk["choices"][0].get("delta", {})
                    content = delta.get("content")
                    if content:
                        yield content
        except Exception as e:
            logger.error(f"Groq LLM stream failed: {e}", exc_info=True)
            raise


# ────────────────────────────────
# OpenAI Direct TTS
# ────────────────────────────────

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

    def _voice_for_character(self, character: str) -> str:
        profile = get_character_profile(character)
        return profile.voice_id or self.voice

    def _output_sample_rate(self) -> int:
        # OpenAI TTS-1 outputs PCM at 24 kHz.
        return 24000

    async def synthesize_stream(
        self,
        text: str,
        character: str = "default",
        mode: str = "default",
    ) -> AsyncIterator[bytes]:
        voice = self._voice_for_character(character)
        logger.info(f"OpenAI TTS: synthesizing {len(text)} chars voice={voice}")
        try:
            collected: List[bytes] = []
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
                    "voice": voice,
                    "response_format": self.response_format,
                },
            ) as resp:
                resp.raise_for_status()
                total = 0
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    if chunk:
                        total += len(chunk)
                        collected.append(chunk)
                logger.info(f"OpenAI TTS: streamed {total} bytes")

            if not collected:
                return

            pcm = b"".join(collected)
            src_rate = self._output_sample_rate()
            if src_rate != self.sample_rate:
                pcm = resample_pcm(pcm, src_rate, self.sample_rate)
                logger.info(f"OpenAI TTS: resampled {src_rate}Hz -> {self.sample_rate}Hz")

            for i in range(0, len(pcm), 4096):
                yield pcm[i : i + 4096]
        except Exception as e:
            logger.error(f"OpenAI TTS failed: {e}", exc_info=True)
            raise

    async def synthesize(self, text: str, character: str = "default", mode: str = "default") -> bytes:
        """Full synthesis (buffered). Use synthesize_stream for real-time."""
        chunks = []
        async for chunk in self.synthesize_stream(text, character, mode):
            chunks.append(chunk)
        return b"".join(chunks)


# ────────────────────────────────
# Provider Factory
# ────────────────────────────────

class VoiceProviders:
    """Convenience container for all providers.

    Priority:
      1. Groq/OpenAI direct stack if GROQ_API_KEY + OPENAI_API_KEY are set.
      2. OpenRouter fallback if OPENROUTER_API_KEY is set.
    """

    def __init__(self, api_key: Optional[str] = None):
        openrouter_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        groq_key = os.environ.get("GROQ_API_KEY", "")
        openai_key = os.environ.get("OPENAI_API_KEY", "")
        cartesia_key = os.environ.get("CARTESIA_API_KEY", "")

        self.api_key = openrouter_key  # used by OpenRouter fallback paths
        if groq_key:
            logger.info("Using Groq STT/LLM")
            self.stt = GroqSTT(api_key=groq_key)
            self.llm = GroqLLM(
                api_key=groq_key,
                model=os.environ.get("GROQ_LLM_MODEL", "llama-3.3-70b-versatile"),
            )
        elif openrouter_key:
            logger.info("Using OpenRouter STT stack")
            self.stt = OpenRouterSTT(api_key=openrouter_key)
            self.llm = None
        else:
            logging.warning("No STT/LLM API key found. Set GROQ_API_KEY or OPENROUTER_API_KEY.")
            self.stt = OpenRouterSTT(api_key="")
            self.llm = None

        if openai_key:
            logger.info("Using OpenAI direct TTS")
            self.tts = OpenAIDirectTTS(
                api_key=openai_key,
                model=os.environ.get("OPENAI_TTS_MODEL", "tts-1"),
                voice=os.environ.get("OPENAI_TTS_VOICE", "nova"),
            )
        elif openrouter_key:
            logger.info("Using OpenRouter TTS fallback")
            self.tts = OpenRouterTTS(api_key=openrouter_key)
        elif cartesia_key:
            logger.info("Using Cartesia TTS")
            self.tts = CartesiaTTS(api_key=cartesia_key)
        else:
            logging.warning("No TTS API key found. Set OPENAI_API_KEY, OPENROUTER_API_KEY, or CARTESIA_API_KEY.")
            self.tts = OpenRouterTTS(api_key="")

        self.vad = SileroVAD()
        self.commands = __import__("casa_voice.commands", fromlist=["classifier", "trigger_responder", "echo_responder", "keyword_compressor"])

        # Optional native audio provider for Quick Chat mode (audio -> audio in one call).
        # Only created when an OpenRouter key is available; model can be overridden via env.
        if openrouter_key and os.environ.get("NATIVE_AUDIO_ENABLED", "1") != "0":
            self.native_audio = NativeAudioProvider(
                api_key=openrouter_key,
                model=os.environ.get("OPENROUTER_NATIVE_AUDIO_MODEL", "openai/gpt-audio-mini"),
                voice=os.environ.get("NATIVE_AUDIO_VOICE", "alloy"),
                sample_rate=16000,
            )
        else:
            self.native_audio = None


# ────────────────────────────────
# Native Audio I/O Provider (gpt-audio-mini)
# ────────────────────────────────

class NativeAudioProvider:
    """OpenRouter native audio model (gpt-audio-mini / gpt-audio).

    Single-call audio -> audio path that bypasses STT -> LLM -> TTS.
    Yields text chunks (for the dashboard) and PCM audio chunks (for the speaker)
    as they arrive from the streaming response.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "openai/gpt-audio-mini",
        voice: str = "alloy",
        sample_rate: int = 16000,
        http_timeout: float = 120.0,
    ):
        self.api_key = api_key
        self.model = model
        self.voice = voice
        self.sample_rate = sample_rate
        self.http_client = httpx.AsyncClient(timeout=http_timeout)
        self.base_url = "https://openrouter.ai/api/v1"

    def _pcm_to_wav_base64(self, pcm_bytes: bytes) -> str:
        """Wrap raw PCM16 in a WAV header and base64-encode for the API."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sample_rate)
            wf.writeframes(pcm_bytes)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    async def stream_turn(
        self,
        audio_pcm: bytes,
        system_prompt: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
    ) -> AsyncIterator[Dict[str, Any]]:
        """Send audio buffer to native audio model and stream text + audio back."""
        if not audio_pcm:
            yield {"type": "transcript", "content": ""}
            return

        audio_b64 = self._pcm_to_wav_base64(audio_pcm)

        messages: List[Dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        if conversation_history:
            for msg in conversation_history:
                role = msg.get("role")
                content = msg.get("content", "")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})

        messages.append({
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {"data": audio_b64, "format": "wav"},
                }
            ],
        })

        payload = {
            "model": self.model,
            "messages": messages,
            "modalities": ["text", "audio"],
            "audio": {"voice": self.voice, "format": "pcm16"},
            "stream": True,
            "max_tokens": 512,
            "temperature": 0.7,
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

        full_text = ""
        user_transcript = None

        try:
            async with self.http_client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            ) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    logger.error(f"Native audio HTTP error {response.status_code}: {body[:1000].decode('utf-8', errors='replace')}")
                    response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    data = line[6:]
                    if data == "[DONE]":
                        break

                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    if not chunk.get("choices"):
                        continue

                    delta = chunk["choices"][0].get("delta", {})

                    # Native audio models put assistant text inside audio.transcript,
                    # and the user's transcript in the first audio delta that has an id.
                    audio_delta = delta.get("audio")
                    if audio_delta:
                        if isinstance(audio_delta, dict):
                            audio_id = audio_delta.get("id")
                            transcript = audio_delta.get("transcript")
                            data = audio_delta.get("data")

                            # First audio chunk with an id + transcript is the model's
                            # transcription of the user's audio.
                            if audio_id and transcript and user_transcript is None:
                                user_transcript = transcript
                                yield {"type": "user_transcript", "content": user_transcript}
                            elif transcript:
                                full_text += transcript
                                yield {"type": "text", "content": transcript}

                            if data:
                                pcm_chunk = base64.b64decode(data)
                                yield {"type": "audio", "data": pcm_chunk}
                        elif isinstance(audio_delta, str):
                            pcm_chunk = base64.b64decode(audio_delta)
                            yield {"type": "audio", "data": pcm_chunk}

                    if delta.get("content"):
                        text_chunk = delta["content"]
                        full_text += text_chunk
                        yield {"type": "text", "content": text_chunk}

        except httpx.HTTPStatusError as e:
            logger.error(f"Native audio HTTP error: {e.response.status_code} — {e.response.text[:500]}")
            raise
        except Exception as e:
            logger.error(f"Native audio stream error: {e}")
            raise

        yield {"type": "transcript", "content": full_text}

    async def close(self):
        await self.http_client.aclose()
