"""OpenRouter-only AI providers for Casa Voice V2.

All STT, LLM, and TTS go through OpenRouter. No Deepgram. No Groq direct. No Cartesia direct.
One API key. One bill. One error handling pattern.

Includes:
- EnergyVAD: lightweight voice activity detection (no ML deps)
- VADBufferedSTT: buffers audio via VAD, sends batch to OpenRouter Whisper
- OpenRouterLLM: chat completions with auto-fallback
- OpenRouterTTS: audio generation with resample to 16kHz
- pcm_to_wav / wav_to_pcm: audio format utilities
- resample_24to16: 24kHz → 16kHz resampling
"""

from __future__ import annotations

import asyncio
import io
import struct
import time
from typing import AsyncIterable

import httpx
import numpy as np


# ── Audio Utilities ────────────────────────────────────────────────────────

def pcm_to_wav(pcm_data: bytes, sample_rate: int = 16000, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """Wrap raw PCM s16le in a WAV header."""
    byte_rate = sample_rate * channels * bits_per_sample // 8
    block_align = channels * bits_per_sample // 8
    data_size = len(pcm_data)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,  # Subchunk1Size
        1,   # AudioFormat (PCM)
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_size,
    )
    return header + pcm_data


def wav_to_pcm(wav_data: bytes) -> bytes:
    """Extract raw PCM from a WAV file."""
    if wav_data[:4] != b"RIFF":
        raise ValueError("Invalid WAV file")
    offset = 12
    while offset < len(wav_data) - 8:
        chunk_id = wav_data[offset : offset + 4]
        chunk_size = struct.unpack("<I", wav_data[offset + 4 : offset + 8])[0]
        if chunk_id == b"data":
            return wav_data[offset + 8 : offset + 8 + chunk_size]
        offset += 8 + chunk_size
    raise ValueError("No data chunk found in WAV file")


def resample_24to16(pcm_24k: bytes) -> bytes:
    """Resample 24kHz PCM to 16kHz using scipy.signal."""
    from scipy import signal
    pcm = np.frombuffer(pcm_24k, dtype=np.int16)
    ratio = 16000 / 24000
    resampled = signal.resample(pcm, int(len(pcm) * ratio))
    return resampled.astype(np.int16).tobytes()


def resample_24to16_soxr(pcm_24k: bytes) -> bytes:
    """Faster resample using libsoxr. ~10× lower CPU."""
    import soxr
    pcm = np.frombuffer(pcm_24k, dtype=np.int16)
    resampled = soxr.resample(pcm, 24000, 16000, dtype="int16")
    return resampled.tobytes()


# ── Energy-Based VAD ────────────────────────────────────────────────────────

class EnergyVAD:
    """Lightweight voice activity detection using audio energy threshold.

    No ML dependencies. Fast. Works well in quiet environments (bedroom,
    quiet playroom). For noisy homes (TV, siblings, HVAC), raise threshold
    and add hysteresis, or upgrade to WebRTC VAD on the ESP32, or Silero
    VAD on the backend.

    Recommended settings for noisy homes:
      threshold = 0.025 to 0.03
      speech_frames_to_trigger = 3   (90ms sustained speech)
      silence_frames_to_release = 10 (300ms silence to end utterance)

    frame_duration_ms: analysis frame size (default 30ms)
    threshold: energy threshold 0-1 (default 0.015 for quiet, 0.025 for noisy)
    silence_duration_ms: silence needed to end utterance (default 500ms)
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        frame_duration_ms: int = 30,
        threshold: float = 0.015,
        silence_duration_ms: int = 500,
        speech_frames_to_trigger: int = 2,  # 2 frames = 60ms
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


class SileroVAD:
    """Neural VAD (Silero) for backend use. Requires `pip install silero-vad`.

    Much more accurate in noisy environments than energy-based VAD.
    ~2.3 MB model. Runs on the backend, not the ESP32 (512 KB SRAM).

    In mixed-SNR home environments (-5 dB to +10 dB):
      - Silero: ~63% accuracy, 58% F1
      - WebRTC VAD: ~50% of speech frames missed at 5% FPR
      - Lightweight 641 KB CNN: ~90% F1 (best, but not widely available)
    """

    def __init__(self, sample_rate: int = 16000, threshold: float = 0.5):
        self.sample_rate = sample_rate
        self.threshold = threshold
        self.model = None
        self.utils = None
        self._load()

    def _load(self):
        try:
            import torch
            model, utils = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
            )
            self.model = model
            self.utils = utils
            (self.get_speech_timestamps, _, _, _, _) = utils
        except Exception as e:
            print(f"[SileroVAD] failed to load: {e}")
            self.model = None

    def is_speech(self, pcm_bytes: bytes) -> float:
        """Return speech probability 0-1 for a 30ms+ chunk."""
        if self.model is None:
            return 0.0
        try:
            import torch
            pcm = np.frombuffer(pcm_bytes, dtype=np.int16)
            tensor = torch.from_numpy(pcm).float()
            return self.model(tensor, self.sample_rate).item()
        except Exception:
            return 0.0

# ── VAD-Buffered STT (OpenRouter Whisper) ─────────────────────────────────

class VADBufferedSTT:
    """Buffers audio based on VAD, then sends complete utterance to OpenRouter Whisper.

    Flow:
      1. Feed audio chunks continuously (even during TTS playback)
      2. VAD detects speech start → internal flag set
      3. VAD detects silence (500ms) → utterance complete
      4. Buffer is sent to Whisper as a WAV file
      5. Returns transcript
    """

    WHISPER_MODEL = "openai/whisper-1"
    # Alternative: "openai/whisper-large-v3-turbo" if available

    def __init__(self, openrouter_key: str, vad: EnergyVAD):
        self.key = openrouter_key
        self.vad = vad
        self.audio_buffer = bytearray()
        self._http = httpx.AsyncClient(timeout=30.0)

    def feed(self, pcm_bytes: bytes) -> bytes | None:
        """Feed audio. Returns complete audio bytes when utterance is finished."""
        self.audio_buffer.extend(pcm_bytes)
        speech_detected, utterance_complete = self.vad.feed(pcm_bytes)

        if utterance_complete and self.audio_buffer:
            audio = bytes(self.audio_buffer)
            self.audio_buffer = bytearray()
            self.vad.reset()
            return audio

        return None

    async def transcribe(self, audio: bytes) -> str:
        """Send buffered audio to OpenRouter Whisper. Returns transcript text."""
        wav = pcm_to_wav(audio, 16000, 1, 16)

        try:
            response = await self._http.post(
                "https://openrouter.ai/api/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {self.key}"},
                files={"file": ("audio.wav", io.BytesIO(wav), "audio/wav")},
                data={"model": self.WHISPER_MODEL, "response_format": "text"},
            )
            if response.status_code >= 400:
                raise RuntimeError(f"STT {response.status_code}: {response.text}")
            data = response.json()
            return data.get("text", "").strip()
        except Exception as e:
            print(f"[STT] error: {e}")
            return ""

    async def close(self):
        await self._http.aclose()


# ── OpenRouter LLM ────────────────────────────────────────────────────────

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
        """Send messages to LLM. Returns full text response."""
        full_messages = [{"role": "system", "content": system_prompt}]
        full_messages.extend(messages[-8:])  # Keep last 8 exchanges

        try:
            response = await self._http.post(
                self.url,
                headers={
                    "Authorization": f"Bearer {self.key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": full_messages,
                    "max_tokens": self.max_tokens,
                    "temperature": self.temperature,
                    "provider": {
                        "order": ["Groq", "OpenAI", "Parasail"],
                        "allow_fallbacks": True,
                    },
                },
            )
            if response.status_code >= 400:
                raise RuntimeError(f"LLM {response.status_code}: {response.text}")
            data = response.json()
            if "choices" in data and data["choices"]:
                return data["choices"][0]["message"]["content"].strip()
            return "I'm not sure what to say."
        except Exception as e:
            print(f"[LLM] error: {e}")
            return "I'm having trouble thinking right now. Let's try again."

    async def close(self):
        await self._http.aclose()


# ── OpenRouter TTS (httpx) ────────────────────────────────────────────────

class OpenRouterTTS:
    """TTS via OpenRouter /audio/speech using raw httpx.

    The OpenAI SDK's audio.speech.create() validates model names against
    OpenAI's own TTS model list (tts-1, tts-1-hd) and rejects OpenRouter
    model slugs like google/gemini-3.1-flash-tts-preview. We use httpx
    directly to bypass this validation.

    Supports multiple models:
    - gemini-flash-tts: google/gemini-3.1-flash-tts-preview (24kHz, expressive tags)
    - kokoro: hexgrad/kokoro-82m (16kHz, ultra-cheap, 54 voices)
    - orpheus: canopy-labs/orpheus-3b (24kHz, natural prosody)
    - grok-tts: x-ai/grok-voice-tts-1.0 (8-48kHz, inline tags)
    - csm: sesame/csm-1b (16kHz, conversational)

    NOTE: OpenRouter /audio/speech streams the *download* (HTTP chunked
    transfer) but the provider still buffers the full audio before sending
    byte 1. For true incremental audio generation (lower latency), switch
    to /chat/completions with modalities=["text","audio"] and stream=True.
    """

    MODEL_MAP = {
        "gemini-flash-tts": "google/gemini-3.1-flash-tts-preview",
        "kokoro": "hexgrad/kokoro-82m",
        "orpheus": "canopy-labs/orpheus-3b",
        "grok-tts": "x-ai/grok-voice-tts-1.0",
        "csm": "sesame/csm-1b",
    }

    # Known sample rates per model (output before resample)
    MODEL_SAMPLE_RATES = {
        "gemini-flash-tts": 24000,
        "kokoro": 16000,
        "orpheus": 24000,
        "grok-tts": 24000,
        "csm": 16000,
    }

    def __init__(self, api_key: str, default_model: str = "kokoro"):
        self.key = api_key
        self.default_model = default_model
        self._http = httpx.AsyncClient(timeout=60.0)

    async def stream(self, text: str, voice_config: dict, **kwargs) -> AsyncIterable[bytes]:
        """Stream TTS audio chunks. Returns 16kHz PCM s16le."""
        model_key = voice_config.get("model_id", self.default_model)
        model_slug = self.MODEL_MAP.get(model_key, model_key)
        sample_rate_out = self.MODEL_SAMPLE_RATES.get(model_key, 24000)

        # Apply expression tags for Gemini-style TTS (only works on gemini-3.1-flash-tts)
        tagged_text = text
        expression_tags = voice_config.get("expression_tags", {})
        mode = kwargs.get("mode", "default")
        if expression_tags and mode in expression_tags and model_key == "gemini-flash-tts":
            tag = expression_tags[mode]
            if tag:
                tagged_text = f"{tag} {text}"

        payload = {
            "model": model_slug,
            "input": tagged_text,
            "voice": voice_config["voice_id"],
            "response_format": "pcm",
            "speed": voice_config.get("speed", 1.0),
        }

        try:
            # Use httpx directly — OpenAI SDK audio.speech rejects non-OpenAI models
            resp = await self._http.post(
                "https://openrouter.ai/api/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {self.key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://casa-companion.io",
                    "X-OpenRouter-Title": "Casa Companion Voice Agent",
                },
                json=payload,
            )
            if resp.status_code >= 400:
                raise RuntimeError(
                    f"TTS {resp.status_code}: {resp.text[:500]}"
                )

            pcm_data = resp.content

            # Resample if needed (24kHz → 16kHz)
            if sample_rate_out != 16000:
                try:
                    import soxr
                    pcm_data = resample_24to16_soxr(pcm_data)
                except ImportError:
                    pcm_data = resample_24to16(pcm_data)

            # Yield in ~128ms chunks (2048 samples × 2 bytes at 16kHz)
            chunk_bytes = 2048 * 2
            for i in range(0, len(pcm_data), chunk_bytes):
                yield pcm_data[i : i + chunk_bytes]

        except Exception as e:
            print(f"[TTS] error: {e}")
            raise

    async def close(self):
        await self._http.aclose()


# ── Groq Orpheus TTS ────────────────────────────────────────────────────────

class GroqOrpheusTTS:
    """TTS via Groq Orpheus v1 English.

    Uses Groq's audio/speech endpoint. Supports vocal directions like
    [cheerful], [whisper], [excited] for expressive character performances.

    - 6 voices: autumn, diana, hannah, austin, daniel, troy
    - Max 200 characters per request (fits our TTS chunking)
    - Response format: WAV only (we parse to PCM)
    - Price: $22/M characters

    Env: GROQ_API_KEY
    """

    ORPHEUS_VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"]

    def __init__(self, api_key: str):
        self.key = api_key
        self._http = httpx.AsyncClient(timeout=60.0)

    def _apply_directions(self, text: str, voice_config: dict, mode: str) -> str:
        """Apply Orpheus vocal directions from expression tags."""
        expression_tags = voice_config.get("expression_tags", {})
        tag = expression_tags.get(mode, "")
        if tag:
            return f"{tag} {text}"
        return text

    async def stream(self, text: str, voice_config: dict, **kwargs) -> AsyncIterable[bytes]:
        """Stream TTS audio. Returns 16kHz PCM s16le."""
        # Orpheus has a 200 char limit per request
        chunks = self._chunk_text(text, max_chars=180)
        voice_id = voice_config.get("voice_id", "troy")
        mode = kwargs.get("mode", "default")

        for chunk_text in chunks:
            tagged = self._apply_directions(chunk_text, voice_config, mode)
            try:
                resp = await self._http.post(
                    "https://api.groq.com/openai/v1/audio/speech",
                    headers={
                        "Authorization": f"Bearer {self.key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "canopylabs/orpheus-v1-english",
                        "input": tagged,
                        "voice": voice_id,
                        "response_format": "wav",
                    },
                )
                if resp.status_code >= 400:
                    raise RuntimeError(f"Orpheus TTS {resp.status_code}: {resp.text[:500]}")

                wav_data = resp.content
                pcm_data = wav_to_pcm(wav_data)

                # Orpheus outputs at 24kHz, resample to 16kHz
                try:
                    import soxr
                    pcm_data = resample_24to16_soxr(pcm_data)
                except ImportError:
                    pcm_data = resample_24to16(pcm_data)

                # Yield in ~128ms chunks
                chunk_bytes = 2048 * 2
                for i in range(0, len(pcm_data), chunk_bytes):
                    yield pcm_data[i : i + chunk_bytes]

            except Exception as e:
                print(f"[Orpheus TTS] error: {e}")
                raise

    @staticmethod
    def _chunk_text(text: str, max_chars: int = 180) -> list[str]:
        """Split text into chunks under Orpheus's 200 char limit."""
        import re
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return []
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        chunks = []
        current = ""
        for sentence in sentences:
            if len(current) + len(sentence) + 1 > max_chars and current:
                chunks.append(current.strip())
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        if current:
            chunks.append(current.strip())
        return chunks if chunks else [text[:max_chars]]

    async def close(self):
        await self._http.aclose()


# ── Gemini Direct TTS (Google API) ────────────────────────────────────────────

class GeminiDirectTTS:
    """TTS via Google Gemini Flash TTS API directly (not through OpenRouter).

    Uses the Google Generative Language API with generateContent endpoint.
    30 voices available with distinct personalities.

    Best voices for Casa Companion:
    - Kore / Pulcherrima: upbeat, teen/adult energy
    - Puck / Fenrir: friendly, approachable male
    - Despina / Sulafat: warm, inviting female
    - Sadachbia: deep, distinctive

    Env: GEMINI_API_KEY
    """

    def __init__(self, api_key: str):
        self.key = api_key
        self._http = httpx.AsyncClient(timeout=60.0)
        self.url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent"

    async def stream(self, text: str, voice_config: dict, **kwargs) -> AsyncIterable[bytes]:
        """Stream TTS audio. Returns 16kHz PCM s16le."""
        voice_id = voice_config.get("voice_id", "Kore")

        payload = {
            "contents": [{
                "parts": [{"text": text}]
            }],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": voice_id
                        }
                    }
                }
            }
        }

        try:
            resp = await self._http.post(
                self.url,
                headers={"x-goog-api-key": self.key, "Content-Type": "application/json"},
                json=payload,
            )
            if resp.status_code >= 400:
                raise RuntimeError(f"Gemini TTS {resp.status_code}: {resp.text[:500]}")

            data = resp.json()
            # Extract base64 audio from response
            candidates = data.get("candidates", [])
            if not candidates:
                raise RuntimeError("Gemini TTS: no candidates in response")

            parts = candidates[0].get("content", {}).get("parts", [])
            for part in parts:
                if "inlineData" in part:
                    import base64
                    audio_b64 = part["inlineData"].get("data", "")
                    audio_bytes = base64.b64decode(audio_b64)

                    # Gemini returns WAV, extract PCM
                    pcm_data = wav_to_pcm(audio_bytes)

                    # Gemini outputs at 24kHz, resample to 16kHz
                    try:
                        import soxr
                        pcm_data = resample_24to16_soxr(pcm_data)
                    except ImportError:
                        pcm_data = resample_24to16(pcm_data)

                    # Yield in ~128ms chunks
                    chunk_bytes = 2048 * 2
                    for i in range(0, len(pcm_data), chunk_bytes):
                        yield pcm_data[i : i + chunk_bytes]

        except Exception as e:
            print(f"[Gemini TTS] error: {e}")
            raise

    async def close(self):
        await self._http.aclose()


# ── Multi-Tier TTS Fallback ─────────────────────────────────────────────────

class MultiTierTTS:
    """Cascades through TTS providers: OpenRouter → Groq Orpheus → Gemini Direct.

    Tries each provider in order until one succeeds. This is the "never go down"
    TTS layer for Solution C.
    """

    def __init__(
        self,
        openrouter_key: str | None = None,
        groq_key: str | None = None,
        gemini_key: str | None = None,
    ):
        self.providers = []
        if openrouter_key:
            self.providers.append(("openrouter", OpenRouterTTS(openrouter_key)))
        if groq_key:
            self.providers.append(("groq", GroqOrpheusTTS(groq_key)))
        if gemini_key:
            self.providers.append(("gemini", GeminiDirectTTS(gemini_key)))

        if not self.providers:
            raise RuntimeError("MultiTierTTS: at least one API key required")

    async def stream(self, text: str, voice_config: dict, **kwargs) -> AsyncIterable[bytes]:
        """Try each provider until one succeeds."""
        last_error = None
        for provider_name, provider in self.providers:
            try:
                async for chunk in provider.stream(text, voice_config, **kwargs):
                    yield chunk
                return
            except Exception as e:
                print(f"[MultiTierTTS] {provider_name} failed: {e}")
                last_error = e

        raise RuntimeError(f"All TTS providers failed. Last error: {last_error}")

    async def close(self):
        for _, provider in self.providers:
            await provider.close()


# ── Character Voice Config ─────────────────────────────────────────────────

class CharacterVoiceRouter:
    """Maps Casa character names to voice configurations.

    Supports multiple TTS providers. Each provider has its own voice mapping.

    Providers:
    - openrouter: Kokoro (cheap) or Gemini Flash TTS (expressive, via OpenRouter)
    - groq: Orpheus v1 English (vocal directions, expressive)
    - gemini: Gemini Flash TTS direct (30 voices, via Google API)
    """

    # OpenRouter voices (Kokoro + Gemini via OpenRouter)
    OPENROUTER_VOICES = {
        "orsetto": {
            "model_id": "gemini-flash-tts",
            "voice_id": "Leda",
            "expression_tags": {
                "default": "",
                "story": "[whispers]",
                "play": "[excited]",
                "bedtime": "[whispers]",
                "sing": "[sings]",
            },
        },
        "coniglio": {
            "model_id": "gemini-flash-tts",
            "voice_id": "Leda",
            "expression_tags": {
                "default": "",
                "story": "[whispers]",
                "play": "[laughs]",
                "bedtime": "[whispers]",
                "sing": "[sings]",
            },
        },
        "drago": {
            "model_id": "gemini-flash-tts",
            "voice_id": "Leda",
            "expression_tags": {
                "default": "",
                "story": "",
                "play": "[excited]",
                "bedtime": "[whispers]",
                "sing": "[sings]",
            },
        },
    }

    # Groq Orpheus voices (6 voices, vocal directions)
    GROQ_ORPHEUS_VOICES = {
        "orsetto": {
            "model_id": "canopylabs/orpheus-v1-english",
            "voice_id": "troy",  # Warm, friendly male
            "expression_tags": {
                "default": "",
                "story": "[whisper]",
                "play": "[cheerful]",
                "bedtime": "[whisper]",
                "sing": "[singsong]",
            },
        },
        "coniglio": {
            "model_id": "canopylabs/orpheus-v1-english",
            "voice_id": "hannah",  # Energetic, fun female
            "expression_tags": {
                "default": "",
                "story": "[whisper]",
                "play": "[cheerful]",
                "bedtime": "[whisper]",
                "sing": "[singsong]",
            },
        },
        "drago": {
            "model_id": "canopylabs/orpheus-v1-english",
            "voice_id": "austin",  # Confident, adventurous male
            "expression_tags": {
                "default": "",
                "story": "",
                "play": "[excited]",
                "bedtime": "[whisper]",
                "sing": "[singsong]",
            },
        },
    }

    # Gemini Direct voices (30 voices, via Google API)
    GEMINI_DIRECT_VOICES = {
        "orsetto": {
            "model_id": "gemini-3.1-flash-tts-preview",
            "voice_id": "Despina",  # Warm, inviting female
            "expression_tags": {
                "default": "",
                "story": "[whispers]",
                "play": "[excited]",
                "bedtime": "[whispers]",
                "sing": "[sings]",
            },
        },
        "coniglio": {
            "model_id": "gemini-3.1-flash-tts-preview",
            "voice_id": "Kore",  # Energetic, youthful female
            "expression_tags": {
                "default": "",
                "story": "[whispers]",
                "play": "[laughs]",
                "bedtime": "[whispers]",
                "sing": "[sings]",
            },
        },
        "drago": {
            "model_id": "gemini-3.1-flash-tts-preview",
            "voice_id": "Puck",  # Direct, "guy next door" male
            "expression_tags": {
                "default": "",
                "story": "",
                "play": "[excited]",
                "bedtime": "[whispers]",
                "sing": "[sings]",
            },
        },
    }

    # Kokoro dev voices (ultra-cheap, 8 languages, 54 voices)
    KOKORO_VOICES = {
        "orsetto": {"model_id": "kokoro", "voice_id": "af_bella"},
        "coniglio": {"model_id": "kokoro", "voice_id": "af_nicole"},
        "drago": {"model_id": "kokoro", "voice_id": "am_michael"},
    }

    PROVIDER_MAP = {
        "openrouter": OPENROUTER_VOICES,
        "groq": GROQ_ORPHEUS_VOICES,
        "gemini": GEMINI_DIRECT_VOICES,
        "kokoro": KOKORO_VOICES,
    }

    def __init__(self, tts, provider: str = "openrouter", dev_mode: bool = False):
        self.tts = tts
        self.provider = provider
        self.dev_mode = dev_mode
        self.voices = self.PROVIDER_MAP.get(provider, self.OPENROUTER_VOICES)
        if dev_mode:
            self.voices = self.KOKORO_VOICES

    def get_voice(self, character_key: str) -> dict:
        return self.voices.get(character_key, self.voices.get("orsetto"))

    async def speak(self, character_key: str, text: str, mode: str = "default") -> AsyncIterable[bytes]:
        voice = self.get_voice(character_key)
        async for chunk in self.tts.stream(text, voice, mode=mode):
            yield chunk
