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

    PROFILES = {
        "drago": VoiceProfile(
            name="Drago the Dragon",
            prompt_prefix="You are Drago, a friendly dragon. Speak with enthusiasm and warmth.",
            tags={"story": "[excited]", "play": "[laughs]", "calm": "[sighs]", "secret": "[whispers]"},
            default_tag="[excited]",
        ),
        "liam": VoiceProfile(
            name="Liam",
            prompt_prefix="You are Liam, a cool teen DJ. Use casual language, be energetic.",
            tags={"story": "[singing]", "play": "[excited]", "calm": "[sighs]", "secret": "[whispers]"},
            default_tag="[excited]",
        ),
        "jenny": VoiceProfile(
            name="Jenny",
            prompt_prefix="You are Jenny, a creative artist. Be expressive and imaginative.",
            tags={"story": "[excited]", "play": "[laughs]", "calm": "[sighs]", "secret": "[whispers]"},
            default_tag="[excited]",
        ),
        "default": VoiceProfile(
            name="Casa Companion",
            prompt_prefix="You are a friendly companion for kids. Be warm, encouraging, and fun.",
            tags={"story": "[excited]", "play": "[laughs]", "calm": "[sighs]", "secret": "[whispers]"},
            default_tag="[excited]",
        ),
    }

    # Per-character Gemini TTS voices. 30 voices available; a few similar characters
    # intentionally share a voice so every character still sounds distinct.
    GEMINI_VOICES: Dict[str, str] = {
        # Founder
        "pietro": "Orus",
        # Animals
        "coniglio": "Puck",
        "corvo": "Charon",
        "gufo": "Enceladus",
        "orsetto": "Algieba",
        "tartaruga": "Schedar",
        "elefante": "Iapetus",
        "leone": "Alnilam",
        "delfino": "Sadachbia",
        "drago": "Fenrir",
        # Musicians
        "rocco": "Zubenelgenubi",
        "vinile": "Achird",
        "battito": "Sadaltager",
        "onda": "Umbriel",
        # Teachers
        "maestra": "Leda",
        "costruttore": "Rasalgethi",
        "dottore": "Charon",
        # Family
        "mamma": "Sulafat",
        "nonna": "Gacrux",
        # Creatures
        "cucita": "Despina",
        "polpo": "Iapetus",
        "xolo": "Fenrir",
        "scheletro": "Algenib",
        "ragno": "Erinome",
        # Additional
        "sacco": "Zubenelgenubi",
        "spugna": "Autonoe",
        "borsa": "Achernar",
        "forza": "Pulcherrima",
        "bella": "Vindemiatrix",
        "cuoco": "Sadaltager",
        "veloce": "Laomedeia",
        "stellino": "Zephyr",
        "verita": "Kore",
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
        return self.PROFILES.get(character, self.PROFILES["default"])

    def get_voice(self, character: str, default_voice: str = "Kore") -> str:
        """Return the Gemini TTS voice for a character."""
        return self.GEMINI_VOICES.get(character, default_voice)

    def apply_tags(self, text: str, character: str, mode: str = "default") -> str:
        """Wrap text with appropriate Gemini audio tags."""
        profile = self.get_profile(character)
        tag = profile.tags.get(mode, profile.default_tag)

        # Chunk if too long
        if len(text) > self.MAX_TAGGED_LENGTH:
            chunks = self._chunk_text(text)
            # Only tag the first chunk so the model doesn't read a tag before
            # every sentence segment.
            tagged = f"{tag} {chunks[0]}"
            if len(chunks) > 1:
                tagged += " " + " ".join(chunks[1:])
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
        # Disable the neural Silero backend entirely on low-memory machines.
        self._disabled = os.environ.get("SILERO_VAD_DISABLED", "").lower() in ("1", "true", "yes")
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
        energy_result = self._energy_detect_speech(pcm_bytes)

        if self._disabled:
            return energy_result

        # Start background Silero load on first use, but do not wait for it.
        if not self._loading and not self._ready and self._load_error is None:
            asyncio.create_task(self._load_model())

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
# Gemini LLM
# ────────────────────────────────

class GeminiLLM:
    """LLM via Google Gemini (generativelanguage API)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gemini-2.5-flash-preview-05-20",
    ):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self.model = model
        self.client = httpx.AsyncClient(timeout=60.0)

    def _to_gemini_contents(
        self, messages: List[Dict[str, str]]
    ) -> tuple[Optional[str], List[Dict[str, Any]]]:
        """Split OpenAI-style messages into Gemini systemInstruction + contents."""
        system_instruction = None
        contents: List[Dict[str, Any]] = []
        for m in messages:
            role = m.get("role")
            text = m.get("content", "")
            if role == "system":
                system_instruction = text
                continue
            gemini_role = "user" if role == "user" else "model"
            contents.append({
                "role": gemini_role,
                "parts": [{"text": text}],
            })
        return system_instruction, contents

    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 512,
    ) -> str:
        system_instruction, contents = self._to_gemini_contents(messages)
        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        try:
            resp = await self.client.post(url, json=payload, timeout=60.0)
            resp.raise_for_status()
            data = resp.json()
            candidate = data.get("candidates", [{}])[0]
            text = candidate.get("content", {}).get("parts", [{}])[0].get("text", "")
            return text.strip()
        except Exception as e:
            logger.error(f"Gemini LLM failed: {e}", exc_info=True)
            return ""

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 512,
    ) -> AsyncIterator[str]:
        system_instruction, contents = self._to_gemini_contents(messages)
        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent?key={self.api_key}"
        try:
            async with self.client.stream("POST", url, json=payload, timeout=60.0) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or line.startswith("[") or line.startswith("]"):
                        continue
                    line = line.rstrip(",")
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    candidate = chunk.get("candidates", [{}])[0]
                    text = candidate.get("content", {}).get("parts", [{}])[0].get("text", "")
                    if text:
                        yield text
        except Exception as e:
            logger.error(f"Gemini LLM stream failed: {e}", exc_info=True)
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
        gemini_key = os.environ.get("GEMINI_API_KEY", "")

        # Keep the OpenRouter key explicit so fallback paths don't accidentally
        # use an empty string when only Groq is configured.
        self.openrouter_api_key = openrouter_key
        if groq_key:
            logger.info("Using Groq STT/LLM")
            self.stt = GroqSTT(api_key=groq_key)
            self.llm = GroqLLM(
                api_key=groq_key,
                model=os.environ.get("GROQ_LLM_MODEL", "llama-3.3-70b-versatile"),
            )
        elif gemini_key:
            logger.info("Using Groq STT + Gemini LLM")
            self.stt = GroqSTT(api_key=groq_key) if groq_key else None
            self.llm = GeminiLLM(
                api_key=gemini_key,
                model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-preview-05-20"),
            )
        elif openrouter_key:
            logger.info("Using OpenRouter STT stack")
            self.stt = OpenRouterSTT(api_key=openrouter_key)
            self.llm = None
        else:
            logging.warning("No STT/LLM API key found. Set GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY.")
            self.stt = None
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
        else:
            logging.warning("No TTS API key found. Set OPENAI_API_KEY or OPENROUTER_API_KEY.")
            self.tts = None

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
