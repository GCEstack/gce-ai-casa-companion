"""Large language model providers."""

import json
import logging
import os
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx

from .common import logger


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
