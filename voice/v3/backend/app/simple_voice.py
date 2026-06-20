"""Simple HTTP voice mode — upload audio, get an SSE stream back.

This is an alternative to the WebSocket V3 engine. The frontend records audio,
POSTs it, and receives:
    data: {"type": "stt",  "text": "..."}
    data: {"type": "text", "text": "..."}
    data: {"type": "audio","chunk": "base64..."}
    data: {"type": "done"}

Cancellation is per-session via POST /api/simple/interrupt?session_id=...
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import os
from typing import Any

import httpx
from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import StreamingResponse

from .config import get_settings

router = APIRouter(prefix="/api/simple")
settings = get_settings()

GROQ_URL = "https://api.groq.com/openai/v1"
OR_URL = "https://openrouter.ai/api/v1"

# ── Character / mode prompts (paste more in as needed) ───────────────────────
CHARACTER_PROMPTS: dict[str, dict[str, str]] = {
    "corvo": {
        "name": "Corvo",
        "voice": "ash",
        "prompt": "You are Corvo, a wise playful crow companion for kids. Keep answers short, warm, and age-appropriate.",
    },
    "drago": {
        "name": "Drago",
        "voice": "ballad",
        "prompt": "You are Drago, a gentle dragon friend for kids. Keep answers short, warm, and age-appropriate.",
    },
}

MODE_PROMPTS: dict[str, str] = {
    "story": "You are in Story Time mode. Tell interactive, age-appropriate stories and end with a gentle question.",
    "math": "You are in Math Helper mode. Use the Socratic method. NEVER give the final answer immediately.",
    "calm": "You are in Calm mode. Speak slowly and softly. Guide breathing or grounding exercises.",
}

LOCAL_COMMANDS: dict[str, str] = {
    "stop": "OK, stopping.",
    "louder": "Turning it up!",
    "softer": "Turning it down.",
    "reset": "Starting fresh!",
}

# session_id -> cancel event
_cancel_events: dict[str, asyncio.Event] = {}


def _get_cancel_event(session_id: str) -> asyncio.Event:
    if session_id not in _cancel_events or _cancel_events[session_id].is_set():
        _cancel_events[session_id] = asyncio.Event()
    return _cancel_events[session_id]


def _check_cancel(session_id: str) -> None:
    event = _cancel_events.get(session_id)
    if event and event.is_set():
        raise asyncio.CancelledError()


def _sse(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data)}\n\n"


def classify_command(text: str) -> str | None:
    t = text.lower().strip()
    for cmd, response in LOCAL_COMMANDS.items():
        if cmd in t:
            return response
    return None


def build_prompt(character: str, mode: str | None, custom_name: str | None) -> str:
    char = CHARACTER_PROMPTS.get(character, CHARACTER_PROMPTS["corvo"])
    prompt = char["prompt"]
    if mode and mode in MODE_PROMPTS:
        prompt += "\n\n" + MODE_PROMPTS[mode]
    if custom_name:
        prompt += f"\n\nThe child named you '{custom_name}'. Use that name."
    return prompt


async def groq_stt(audio_bytes: bytes) -> str:
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY not set")
    async with httpx.AsyncClient(timeout=30) as client:
        files = {"file": ("audio.webm", io.BytesIO(audio_bytes), "audio/webm")}
        data = {
            "model": os.getenv("STT_MODEL", "whisper-large-v3"),
            "language": "en",
            "temperature": 0,
        }
        resp = await client.post(
            f"{GROQ_URL}/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            files=files,
            data=data,
        )
        resp.raise_for_status()
        return resp.json().get("text", "").strip()


async def groq_llm(user_text: str, system_prompt: str) -> str:
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY not set")
    model = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
    async with httpx.AsyncClient(timeout=30) as client:
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text},
            ],
            "max_tokens": 250,
            "temperature": 0.85,
        }
        resp = await client.post(
            f"{GROQ_URL}/chat/completions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json=body,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


async def openrouter_tts(text: str, character: str) -> bytes:
    or_key = os.getenv("OPENROUTER_API_KEY", "")
    if not or_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    model = os.getenv("TTS_MODEL", "google/gemini-3.1-flash-tts-preview")
    voice = CHARACTER_PROMPTS.get(character, CHARACTER_PROMPTS["corvo"]).get("voice", "ash")

    async with httpx.AsyncClient(timeout=60) as client:
        body = {
            "model": model,
            "input": text,
            "voice": voice,
            "response_format": "mp3",
        }
        resp = await client.post(
            f"{OR_URL}/audio/speech",
            headers={"Authorization": f"Bearer {or_key}"},
            json=body,
        )
        resp.raise_for_status()
        return await resp.aread()


@router.post("/voice")
async def voice(
    file: UploadFile = File(...),
    character: str = Query("corvo"),
    mode: str = Query(""),
    customName: str = Query(""),
    session_id: str = Query("default"),
):
    audio_bytes = await file.read()
    if not audio_bytes:
        return {"error": "empty audio"}

    cancel_event = _get_cancel_event(session_id)
    cancel_event.clear()

    async def event_stream():
        try:
            _check_cancel(session_id)
            stt_text = await groq_stt(audio_bytes)
            yield _sse({"type": "stt", "text": stt_text})

            _check_cancel(session_id)
            cmd_response = classify_command(stt_text)
            if cmd_response:
                yield _sse({"type": "text", "text": cmd_response})
                audio = await openrouter_tts(cmd_response, character)
                _check_cancel(session_id)
                yield _sse({"type": "audio", "chunk": base64.b64encode(audio).decode()})
                yield _sse({"type": "done"})
                return

            _check_cancel(session_id)
            system = build_prompt(character, mode or None, customName or None)
            response_text = await groq_llm(stt_text, system)
            yield _sse({"type": "text", "text": response_text})

            _check_cancel(session_id)
            audio = await openrouter_tts(response_text, character)
            _check_cancel(session_id)
            yield _sse({"type": "audio", "chunk": base64.b64encode(audio).decode()})
            yield _sse({"type": "done"})
        except asyncio.CancelledError:
            yield _sse({"type": "cancelled"})
        except Exception as exc:
            yield _sse({"type": "error", "message": str(exc)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/interrupt")
async def interrupt(session_id: str = Query("default")):
    event = _cancel_events.get(session_id)
    if event:
        event.set()
    return {"ok": True}
