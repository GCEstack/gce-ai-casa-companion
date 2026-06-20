"""OpenAI Realtime API speech-to-speech bridge.

Low-level wrapper around `wss://api.openai.com/v1/realtime?model=gpt-realtime-2`.
It resamples audio, forwards events, and exposes a small async API for the
session layer.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from typing import Awaitable, Callable, Optional

import websockets

from .characters import get_character_profile
from .providers import resample_pcm

logger = logging.getLogger(__name__)

REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime-2"

# ~4096 bytes of base64 == 3072 raw bytes. At 24 kHz PCM16 mono ~= 64 ms/chunk.
_OUTGOING_RAW_CHUNK = 3072


class RealtimeBridge:
    """Manages a single WebSocket connection to the OpenAI Realtime API."""

    def __init__(
        self,
        character_slug: str,
        client_send_callback: Callable[[dict], Awaitable[None]],
        on_user_transcript: Optional[Callable[[str], Awaitable[None]]] = None,
    ):
        self.character_slug = character_slug
        self.client_send_callback = client_send_callback
        self.on_user_transcript = on_user_transcript
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._receive_task: Optional[asyncio.Task] = None
        self._closed = True
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")

        profile = get_character_profile(self.character_slug)
        logger.info(
            f"Realtime: connecting character={self.character_slug} voice={profile.voice_id}"
        )

        headers = {"Authorization": f"Bearer {api_key}"}
        self._ws = await websockets.connect(REALTIME_URL, additional_headers=headers)
        self._closed = False
        self._receive_task = asyncio.create_task(self._receive_loop())
        await self._send_session_update(profile)
        logger.info("Realtime: connected")

    async def _send_session_update(self, profile) -> None:
        payload = {
            "type": "session.update",
            "session": {
                "type": "voice",
                "modalities": ["text", "audio"],
                "instructions": profile.prompt,
                "voice": profile.voice_id,
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500,
                },
            },
        }
        await self._ws.send(json.dumps(payload))

    async def _receive_loop(self) -> None:
        try:
            async for message in self._ws:
                if isinstance(message, str):
                    await self._handle_event(json.loads(message))
                else:
                    logger.warning(f"Realtime: unexpected binary frame ({len(message)} bytes)")
        except websockets.exceptions.ConnectionClosed:
            logger.info("Realtime: connection closed")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Realtime: receive loop error: {e}", exc_info=True)

    async def _handle_event(self, event: dict) -> None:
        event_type = event.get("type")
        logger.debug(f"Realtime event: {event_type}")

        if event_type == "response.audio_transcript.delta":
            delta = event.get("delta", "")
            if delta:
                await self.client_send_callback(
                    {"type": "assistant_text", "text": delta}
                )

        elif event_type == "response.audio.delta":
            audio_b64 = event.get("delta", "")
            if audio_b64:
                pcm_24k = base64.b64decode(audio_b64)
                pcm_16k = resample_pcm(pcm_24k, 24000, 16000)
                await self.client_send_callback({"binary": pcm_16k})

        elif event_type in ("response.audio.done", "response.done"):
            await self.client_send_callback({"type": "state_change", "state": "idle"})

        elif event_type == "input_audio_buffer.speech_started":
            await self.client_send_callback({"type": "state_change", "state": "listening"})

        elif event_type == "input_audio_buffer.speech_stopped":
            await self.client_send_callback({"type": "state_change", "state": "processing"})

        elif event_type == "conversation.item.input_audio_transcription.completed":
            transcript = event.get("transcript", "")
            if transcript and self.on_user_transcript:
                try:
                    await self.on_user_transcript(transcript)
                except Exception as e:
                    logger.warning(f"Realtime: user transcript callback error: {e}")
            await self.client_send_callback({"type": "transcript", "text": transcript})

        elif event_type == "error":
            error = event.get("error", {})
            await self.client_send_callback(
                {
                    "type": "error",
                    "code": error.get("code", "realtime_error"),
                    "message": error.get("message", "Unknown realtime error"),
                }
            )

        elif event_type == "session.created":
            logger.info("Realtime: session created")

        elif event_type == "session.updated":
            logger.info("Realtime: session updated")

    async def send_audio(self, pcm16_16khz: bytes) -> None:
        if not pcm16_16khz or self._closed or self._ws is None:
            return

        pcm24 = resample_pcm(pcm16_16khz, 16000, 24000)
        for i in range(0, len(pcm24), _OUTGOING_RAW_CHUNK):
            chunk = pcm24[i : i + _OUTGOING_RAW_CHUNK]
            b64 = base64.b64encode(chunk).decode("ascii")
            async with self._lock:
                if self._closed or self._ws is None:
                    return
                await self._ws.send(
                    json.dumps({"type": "input_audio_buffer.append", "audio": b64})
                )

    async def commit_and_respond(self) -> None:
        if self._closed or self._ws is None:
            return
        async with self._lock:
            await self._ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
            await self._ws.send(json.dumps({"type": "response.create"}))

    async def cancel_response(self) -> None:
        if self._closed or self._ws is None:
            return
        async with self._lock:
            await self._ws.send(json.dumps({"type": "response.cancel"}))

    async def send_text(self, text: str) -> None:
        """Send a typed user message and request a response."""
        if self._closed or self._ws is None:
            return
        async with self._lock:
            await self._ws.send(
                json.dumps(
                    {
                        "type": "conversation.item.create",
                        "item": {
                            "type": "message",
                            "role": "user",
                            "content": [{"type": "input_text", "text": text}],
                        },
                    }
                )
            )
            await self._ws.send(json.dumps({"type": "response.create"}))

    async def update_session(self, character_slug: Optional[str] = None) -> None:
        if self._closed or self._ws is None:
            return
        profile = get_character_profile(character_slug or self.character_slug)
        async with self._lock:
            await self._send_session_update(profile)

    async def stop(self) -> None:
        self._closed = True
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None
        if self._ws:
            try:
                await self._ws.close()
            except Exception as e:
                logger.warning(f"Realtime: close error: {e}")
            self._ws = None
