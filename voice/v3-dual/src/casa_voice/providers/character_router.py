"""Character voice routing and on-disk TTS cache."""

import asyncio
import hashlib
import logging
import os
import re
from dataclasses import dataclass
from typing import AsyncIterator, Dict, List

from .common import DEFAULT_TTS, _CHARACTER_PROMPTS, logger


@dataclass
class VoiceProfile:
    name: str
    prompt_prefix: str
    tags: Dict[str, str]
    default_tag: str = "[excited]"


class CharacterVoiceRouter:
    """Maps character + mode -> Gemini audio tags.

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
        "volpe": "Aoede",
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
        "papa": "Enceladus",
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
        # Phase 3 / English-named fantasy characters
        "jack": "Puck",
        "agenda": "Callirrhoe",
        "alien": "Zephyr",
        "dragon": "Fenrir",
        "fraggl": "Laomedeia",
        "grouch": "Algenib",
        "lucha_bee": "Pulcherrima",
        "ninja_cat": "Erinome",
        "pirate_parrot": "Sadachbia",
        "transformer_bot": "Iapetus",
        "trex": "Alnilam",
    }

    MAX_TAGGED_LENGTH = 500  # chars -- beyond this, Gemini may read tags aloud

    MODE_SLUG_MAP: Dict[str, str] = {
        "story-time": "story",
        "story": "story",
        "calm-breathe": "calm",
        "calm": "calm",
        "stem-sparks": "play",
        "play": "play",
        "secret": "secret",
        "introduction": "default",
        "music-rhythm": "play",
        "geography": "play",
        "all-languages": "play",
        "homework-helper": "play",
        "coding": "play",
        "milestones": "story",
        "teaching-mode": "play",
        "default": "default",
    }

    def __init__(self, tts_model: str = DEFAULT_TTS):
        self.tts_model = tts_model
        if "gemini-3.1" not in tts_model:
            logger.warning(
                "CharacterVoiceRouter: tags only work on gemini-3.1-flash-tts-preview. "
                f"Current model: {tts_model}"
            )

    def get_profile(self, character: str) -> VoiceProfile:
        if character in self.PROFILES:
            return self.PROFILES[character]
        if character in _CHARACTER_PROMPTS:
            return VoiceProfile(
                name=character,
                prompt_prefix=_CHARACTER_PROMPTS[character],
                tags={"story": "[excited]", "play": "[laughs]", "calm": "[sighs]", "secret": "[whispers]"},
                default_tag="[excited]",
            )
        return self.PROFILES["default"]

    def get_voice(self, character: str, default_voice: str = "Kore") -> str:
        """Return the Gemini TTS voice for a character."""
        return self.GEMINI_VOICES.get(character, default_voice)

    def apply_tags(self, text: str, character: str, mode: str = "default") -> str:
        """Wrap text with appropriate Gemini audio tags."""
        profile = self.get_profile(character)
        normalized_mode = self.MODE_SLUG_MAP.get(mode, mode)
        tag = profile.tags.get(normalized_mode, profile.default_tag)

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


class TTSCache:
    """On-disk cache for raw TTS PCM output keyed by text + model + voice.

    Makes repeated phrases (greetings, trigger responses, echo replies,
    story-queue segments) play instantly on subsequent uses.
    """

    CHUNK_SIZE = 4096
    MAX_FILES = 5000
    MAX_BYTES = 1024 * 1024 * 1024  # 1 GB

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

    def _evict_if_needed(self):
        """Remove oldest cache entries if over file or byte limits."""
        entries = [
            (os.path.getmtime(os.path.join(self.cache_dir, f)), f)
            for f in os.listdir(self.cache_dir)
            if f.endswith(".pcm")
        ]
        entries.sort()
        total_bytes = sum(
            os.path.getsize(os.path.join(self.cache_dir, f)) for _, f in entries
        )
        while entries and (
            len(entries) > self.MAX_FILES or total_bytes > self.MAX_BYTES
        ):
            _, oldest = entries.pop(0)
            oldest_path = os.path.join(self.cache_dir, oldest)
            try:
                total_bytes -= os.path.getsize(oldest_path)
                os.remove(oldest_path)
            except OSError:
                pass

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
            self._evict_if_needed()

        await asyncio.to_thread(_write)
