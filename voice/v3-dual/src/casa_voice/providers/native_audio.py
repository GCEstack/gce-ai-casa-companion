"""Native audio I/O provider (gpt-audio-mini)."""

import base64
import io
import json
import wave
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

from .common import _get_openrouter_provider_routing, logger


class AudioDelta(BaseModel):
    id: Optional[str] = None
    transcript: Optional[str] = None
    data: Optional[str] = None


class Delta(BaseModel):
    content: Optional[str] = None
    audio: Optional[AudioDelta] = None


class Choice(BaseModel):
    delta: Delta = Field(default_factory=Delta)


class StreamChunk(BaseModel):
    choices: List[Choice] = Field(default_factory=list)


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

                    try:
                        parsed = StreamChunk.model_validate(chunk)
                    except Exception as parse_err:
                        logger.warning(f"Native audio: failed to parse chunk: {parse_err}; chunk={chunk}")
                        continue

                    if not parsed.choices:
                        continue

                    delta = parsed.choices[0].delta

                    # Native audio models put assistant text inside audio.transcript,
                    # and the user's transcript in the first audio delta that has an id.
                    if delta.audio:
                        audio_id = delta.audio.id
                        transcript = delta.audio.transcript
                        data = delta.audio.data

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

                    if delta.content:
                        full_text += delta.content
                        yield {"type": "text", "content": delta.content}

        except httpx.HTTPStatusError as e:
            logger.error(f"Native audio HTTP error: {e.response.status_code} -- {e.response.text[:500]}")
            raise
        except Exception as e:
            logger.error(f"Native audio stream error: {e}")
            raise

        yield {"type": "transcript", "content": full_text}

    async def close(self):
        await self.http_client.aclose()
