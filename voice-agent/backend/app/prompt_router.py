"""Character + mode routing, prompt assembly, and TTS text chunking with SSML."""
from __future__ import annotations

import re
from dataclasses import dataclass
from html import escape
from typing import Any

from config import get_settings


@dataclass(frozen=True)
class CharacterMode:
    id: str
    character_key: str
    mode_key: str
    name: str
    prompt: str
    voice_id: str
    ssml_template: str


class PromptRouter:
    """Loads character/mode configs from Supabase and formats prompts + SSML."""

    def __init__(self, supabase: Any):
        self.supabase = supabase
        self._modes: dict[str, CharacterMode] = {}
        self._default: CharacterMode | None = None

    async def load(self):
        """Fetch active character_modes from Supabase. Call once at startup."""
        result = (
            await self.supabase.table("character_modes")
            .select("*")
            .eq("is_active", True)
            .order("sort_order", desc=False)
            .execute()
        )
        rows = result.data or []
        self._modes = {}
        for row in rows:
            mode = CharacterMode(
                id=row["id"],
                character_key=row["character_key"],
                mode_key=row["mode_key"],
                name=row.get("name", f"{row['character_key']} {row['mode_key']}"),
                prompt=row["prompt"],
                voice_id=row["voice_id"],
                ssml_template=row["ssml_template"],
            )
            self._modes[mode.id] = mode
            if mode.character_key == "orsetto" and mode.mode_key == "default":
                self._default = mode
        if not self._default and self._modes:
            self._default = next(iter(self._modes.values()))

    def get_by_id(self, mode_id: str | None) -> CharacterMode:
        if mode_id and mode_id in self._modes:
            return self._modes[mode_id]
        if self._default:
            return self._default
        raise RuntimeError("No character modes loaded")

    def get_by_keys(self, character_key: str, mode_key: str) -> CharacterMode:
        for mode in self._modes.values():
            if mode.character_key == character_key and mode.mode_key == mode_key:
                return mode
        return self.get_by_id(None)

    def resolve_voice_id(self, mode: CharacterMode) -> str:
        """Allow env-level override of seed voice IDs without editing SQL."""
        settings = get_settings()
        return settings.cartesia_voice_map.get(mode.character_key, mode.voice_id)

    def format_system_prompt(self, mode: CharacterMode, device: dict[str, Any] | None = None) -> str:
        """Append tiny device context without storing anything."""
        base = mode.prompt.strip()
        extras: list[str] = []
        if device:
            if device.get("battery") is not None:
                extras.append(f"Device battery is {device['battery']}%.")
        if extras:
            return base + "\n\n" + " ".join(extras)
        return base

    def chunk_for_tts(self, text: str, max_chars: int | None = None) -> list[str]:
        """Split text at sentence boundaries, keeping every chunk under max_chars."""
        if max_chars is None:
            max_chars = get_settings().max_tts_chars

        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return []

        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        chunks: list[str] = []
        current = ""

        def _flush():
            nonlocal current
            if current:
                chunks.append(current.strip())
                current = ""

        def _split_long(text_piece: str) -> list[str]:
            """Split a long string at word boundaries, respecting max_chars."""
            words = text_piece.split(" ")
            out: list[str] = []
            piece = ""
            for word in words:
                if len(piece) + len(word) + 1 > max_chars and piece:
                    out.append(piece.strip())
                    piece = word
                else:
                    piece = f"{piece} {word}".strip()
            if piece:
                out.append(piece.strip())
            return out

        for sentence in sentences:
            if len(sentence) > max_chars:
                _flush()
                chunks.extend(_split_long(sentence))
            elif len(current) + len(sentence) + 1 > max_chars:
                _flush()
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        _flush()
        return chunks

    def wrap_ssml(self, text: str, mode: CharacterMode) -> str:
        """Escape text and inject it into the mode's SSML template."""
        safe = escape(text)
        template = mode.ssml_template.strip()
        if "{{text}}" in template:
            return template.replace("{{text}}", safe)
        # Fallback: wrap the whole text if the template has no placeholder.
        if template.startswith("<speak>") and template.endswith("</speak>"):
            return f"{template[:-8]}<prosody>{safe}</prosody></speak>"
        return f"<speak><prosody>{safe}</prosody></speak>"
