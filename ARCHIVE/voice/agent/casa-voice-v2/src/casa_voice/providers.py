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
import asyncio
import logging
from typing import AsyncIterator, Optional, List, Dict, Any
from dataclasses import dataclass

import httpx
import numpy as np

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
DEFAULT_LLM = "groq/llama-3.3-70b-versatile"
DEFAULT_STT = "openai/whisper"
DEFAULT_TTS = "google/gemini-3.1-flash-tts-preview"  # ONLY model that supports tags


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
        """Transcribe 16kHz PCM to text via Whisper Turbo."""
        # Wrap PCM in a fake WAV header for Whisper compatibility
        wav_bytes = self._pcm_to_wav(pcm_bytes, sample_rate)
        files = {
            "file": ("audio.wav", io.BytesIO(wav_bytes), "audio/wav"),
            "model": (None, self.model),
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://casa-companion.io",
            "X-Title": "Casa Companion Voice",
        }
        resp = await self.client.post(
            f"{OPENROUTER_BASE}/audio/transcriptions",
            headers=headers,
            files=files,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("text", "").strip()

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

    def apply_tags(self, text: str, character: str, mode: str = "default") -> str:
        """Wrap text with appropriate Gemini audio tags."""
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
        voice: str = "coral",  # Gemini voice
        sample_rate: int = 16000,
    ):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self.model = model
        self.voice = voice
        self.sample_rate = sample_rate
        self.client = httpx.AsyncClient(timeout=60.0)
        self.voice_router = CharacterVoiceRouter(model)

    async def synthesize_stream(
        self,
        text: str,
        character: str = "default",
        mode: str = "default",
    ) -> AsyncIterator[bytes]:
        """Yield PCM chunks as they arrive from the wire."""
        tagged_text = self.voice_router.apply_tags(text, character, mode)

        payload = {
            "model": self.model,
            "input": tagged_text,
            "voice": self.voice,
            "response_format": "pcm",  # KEY: skip WAV header parsing
            "sample_rate": self.sample_rate,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://casa-companion.io",
            "X-Title": "Casa Companion Voice",
        }

        async with self.client.stream(
            "POST",
            f"{OPENROUTER_BASE}/audio/speech",
            headers=headers,
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes(chunk_size=4096):
                if chunk:
                    yield chunk

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
    """Neural VAD for backend noise robustness.

    Requires: pip install torch onnxruntime
    Model: silero-vad v4.0 (2.3MB)
    """

    def __init__(self, threshold: float = 0.5, sample_rate: int = 16000):
        self.threshold = threshold
        self.sample_rate = sample_rate
        self._model = None
        self._utils = None
        self._init_model()

    def _init_model(self):
        try:
            import torch
            model, utils = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
            )
            self._model = model
            self._utils = utils
            (self.get_speech_timestamps, _, _, _, _) = utils
            logger.info("Silero VAD loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Silero VAD: {e}")
            raise

    def detect_speech(self, pcm_bytes: bytes) -> bool:
        """Return True if speech detected in PCM chunk."""
        if self._model is None:
            return False
        try:
            import torch
            tensor = torch.frombuffer(pcm_bytes, dtype=torch.int16).float() / 32768.0
            if self.sample_rate != 16000:
                # Simple downsampling if needed
                tensor = tensor[::self.sample_rate // 16000]
            speech_prob = self._model(tensor, self.sample_rate).item()
            return speech_prob > self.threshold
        except Exception as e:
            logger.error(f"VAD error: {e}")
            return False

    def get_timestamps(self, pcm_bytes: bytes) -> List[Dict[str, float]]:
        """Return speech timestamps [{start, end}, ...] in seconds."""
        if self._model is None:
            return []
        try:
            import torch
            tensor = torch.frombuffer(pcm_bytes, dtype=torch.int16).float() / 32768.0
            if self.sample_rate != 16000:
                tensor = tensor[::self.sample_rate // 16000]
            return self.get_speech_timestamps(
                tensor, self._model, sampling_rate=16000, threshold=self.threshold
            )
        except Exception as e:
            logger.error(f"VAD timestamp error: {e}")
            return []


class MultiTierTTS:
    """Cascading TTS: OpenRouter → Groq Orpheus → Gemini Direct.

    Fallback chain for maximum resilience. All output resampled to 16kHz PCM.
    """

    def __init__(self, openrouter_key: Optional[str] = None, groq_key: Optional[str] = None, gemini_key: Optional[str] = None):
        self.openrouter = OpenRouterTTS(api_key=openrouter_key)
        self.groq_key = groq_key or os.environ.get("GROQ_API_KEY", "")
        self.gemini_key = gemini_key or os.environ.get("GEMINI_API_KEY", "")
        self._failures = 0
        self._last_failure = 0.0

    async def synthesize_stream(self, text: str, character: str = "default", mode: str = "default") -> AsyncIterator[bytes]:
        """Try OpenRouter first, then Groq, then Gemini Direct."""
        # Try OpenRouter
        try:
            async for chunk in self.openrouter.synthesize_stream(text, character, mode):
                yield chunk
            self._failures = 0
            return
        except Exception as e:
            self._failures += 1
            self._last_failure = asyncio.get_event_loop().time()
            logger.warning(f"OpenRouter TTS failed (attempt {self._failures}): {e}")

        # Try Groq Orpheus (if key available)
        if self.groq_key:
            try:
                async for chunk in self._groq_orpheus(text, character):
                    yield chunk
                self._failures = 0
                return
            except Exception as e:
                logger.warning(f"Groq Orpheus TTS failed: {e}")

        # Try Gemini Direct (if key available)
        if self.gemini_key:
            try:
                async for chunk in self._gemini_direct(text, character):
                    yield chunk
                self._failures = 0
                return
            except Exception as e:
                logger.warning(f"Gemini Direct TTS failed: {e}")

        # All failed — raise last error
        raise RuntimeError("All TTS providers failed. Check API keys and connectivity.")

    async def _groq_orpheus(self, text: str, character: str) -> AsyncIterator[bytes]:
        """Groq Orpheus v1 English TTS."""
        voice = "tara"  # Default Orpheus voice
        payload = {
            "model": "canopylabs/orpheus-tts",
            "voice": voice,
            "input": text[:200],  # Orpheus limit
        }
        headers = {"Authorization": f"Bearer {self.groq_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post("https://api.groq.com/openai/v1/audio/speech", headers=headers, json=payload)
            resp.raise_for_status()
            yield resp.content  # Return as single chunk

    async def _gemini_direct(self, text: str, character: str) -> AsyncIterator[bytes]:
        """Gemini Flash TTS via direct Google API."""
        import json
        voice = "Kore"  # Default Gemini voice
        payload = {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"]},
            "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}},
        }
        headers = {"Authorization": f"Bearer {self.gemini_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            # Extract audio from response
            for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
                if "inlineData" in part:
                    import base64
                    audio = base64.b64decode(part["inlineData"]["data"])
                    yield audio


class OpenRouterLLM:
    """OpenRouter chat completions with automatic fallback.

    Primary: groq/llama-3.3-70b-versatile (450 tps, fast, cheap)
    Fallback: openai/gpt-4o-mini (reliable, cheaper)
    """

    def __init__(
        self,
        api_key: str,
        model: str = "meta-llama/llama-3.3-70b-instruct",
        max_tokens: int = 180,
        temperature: float = 0.85,
    ):
        self.key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self._http = httpx.AsyncClient(timeout=30.0)
        self.url = "https://openrouter.ai/api/v1/chat/completions"

    async def complete(self, messages: list[dict], system_prompt: str) -> str:
        """Call LLM with system prompt + conversation history."""
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system_prompt}] + messages,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
        }
        headers = {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://casa-companion.io",
            "X-Title": "Casa Companion Voice",
        }
        resp = await self._http.post(self.url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()

    async def close(self):
        await self._http.aclose()


class EnergyVAD:
    """Lightweight voice activity detection using audio energy threshold.

    No ML dependencies. Fast. Works well in quiet environments.
    For noisy homes, raise threshold and add hysteresis, or use SileroVAD.
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        frame_duration_ms: int = 30,
        threshold: float = 0.015,
        silence_duration_ms: int = 500,
        speech_frames_to_trigger: int = 2,
    ):
        self.sample_rate = sample_rate
        self.frame_size = int(sample_rate * frame_duration_ms / 1000)
        self.threshold = threshold
        self.silence_frames_threshold = int(silence_duration_ms / frame_duration_ms)
        self.speech_frames_to_trigger = speech_frames_to_trigger
        self._buffer = bytearray()
        self._speech_frames = 0
        self._silence_frames = 0
        self._is_speaking = False

    def feed(self, pcm_bytes: bytes) -> tuple[bool, bool]:
        """Feed audio chunk. Returns (speech_detected, utterance_complete)."""
        self._buffer.extend(pcm_bytes)
        speech_detected = False
        utterance_complete = False

        frame_bytes = self.frame_size * 2
        while len(self._buffer) >= frame_bytes:
            frame = self._buffer[:frame_bytes]
            self._buffer = self._buffer[frame_bytes:]

            pcm = np.frombuffer(frame, dtype=np.int16).astype(np.float32) / 32768.0
            energy = np.sqrt(np.mean(pcm ** 2))

            if energy > self.threshold:
                self._speech_frames += 1
                self._silence_frames = 0
                if self._speech_frames >= self.speech_frames_to_trigger:
                    self._is_speaking = True
                    speech_detected = True
            else:
                self._silence_frames += 1
                self._speech_frames = 0
                if self._is_speaking and self._silence_frames >= self.silence_frames_threshold:
                    self._is_speaking = False
                    utterance_complete = True

        return speech_detected, utterance_complete

    def reset(self):
        self._buffer = bytearray()
        self._speech_frames = 0
        self._silence_frames = 0
        self._is_speaking = False


# ────────────────────────────────
# Provider Factory
# ────────────────────────────────

class VoiceProviders:
    """Convenience container for all providers."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self.stt = OpenRouterSTT(api_key=self.api_key)
        self.tts = MultiTierTTS(openrouter_key=self.api_key)
        self.llm = OpenRouterLLM(api_key=self.api_key)
        self.vad = SileroVAD()
        self.commands = __import__("casa_voice.commands", fromlist=["classifier"]).classifier
