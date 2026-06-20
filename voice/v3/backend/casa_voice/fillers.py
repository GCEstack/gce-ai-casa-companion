"""Filler audio generator for Casa Voice V3 Dual.

Selects a short character/mode-aware filler utterance to play while the LLM
is generating its response. Fillers are streamed through the normal TTS path
so they use the same voice profile and cache as every other utterance.
"""

import re
import random
from enum import Enum
from typing import Dict, List, Optional

from .characters import get_character_profile


class FillerType(Enum):
    QUESTION = "question"
    CREATIVE = "creative"
    COMMAND = "command"
    CHAT = "chat"


class FillerGenerator:
    """Pick a short filler based on question type, character, and mode."""

    # Lightweight keyword-based classifier. Order matters:
    # 1. Creative beats command ("tell me a story").
    # 2. Question beats command ("How do birds fly?" should not match the "do" command).
    CLASSIFIER_PATTERNS: List[tuple] = [
        # Creative
        (
            re.compile(
                r"\b(tell me a story|read me a story|story time|make up a story|"
                r"tell me a joke|make me laugh|say something funny|sing me a song|"
                r"sing a song|sing something|make a poem|write a poem|imagine|"
                r"pretend that|once upon a time)\b",
                re.IGNORECASE,
            ),
            FillerType.CREATIVE,
        ),
        # Question
        (
            re.compile(
                r"^(who|what|where|when|why|how|is|are|can|could|would|will|do|does|"
                r"did|have|has|had|am|may|might|should)\b",
                re.IGNORECASE,
            ),
            FillerType.QUESTION,
        ),
        # Command
        (
            re.compile(
                r"\b(tell me|give me|show me|do|go|play|open|close|start|stop|"
                r"turn on|turn off|set a timer|remind me|call me|help me)\b",
                re.IGNORECASE,
            ),
            FillerType.COMMAND,
        ),
    ]

    # Generic fallback fillers per type. Keep them short (<60 chars) so TTS is fast.
    FILLERS: Dict[FillerType, List[str]] = {
        FillerType.QUESTION: [
            "Hmm, let me think about that.",
            "Good question! Let me see...",
            "Ooh, let me figure that out.",
            "That's a great one — thinking!",
        ],
        FillerType.CREATIVE: [
            "Ooh, I love this! Here we go...",
            "Let me make something fun!",
            "This is gonna be good!",
            "Okay, imagining now...",
        ],
        FillerType.COMMAND: [
            "Okay, on it!",
            "Sure thing!",
            "You got it!",
            "Right away!",
        ],
        FillerType.CHAT: [
            "Let me think...",
            "Hmm...",
            "Okay, thinking!",
            "One sec, let me figure this out.",
        ],
    }

    # Character-specific flavour. Slug keys, list of templates that may include
    # `{name}` and `{filler}` (the chosen generic filler).
    CHARACTER_FILLERS: Dict[str, List[str]] = {
        "drago": ["{name} is thinking... {filler}", "Dragon brain activate! {filler}"],
        "corvo": ["{name} is puzzling it out. {filler}", "Clever crow thinking! {filler}"],
        "gufo": ["{name} ponders softly. {filler}", "Wise owl thinking... {filler}"],
        "orsetto": ["{name} is on it! {filler}", "Brave bear thinking! {filler}"],
        "coniglio": ["{name} wiggles nose and thinks. {filler}", "Bunny brain working! {filler}"],
        "tartaruga": ["{name} thinks slowly and carefully. {filler}", "Ocean wisdom incoming... {filler}"],
        "leone": ["{name} is figuring it out! {filler}", "Mighty roar of thought! {filler}"],
        "trex": ["{name}'s tiny arms are thinking! {filler}", "Big dino thoughts! {filler}"],
        "liam": ["{name} is mixing that up. {filler}", "DJ {name} on it! {filler}"],
        "jenny": ["{name} is painting an answer. {filler}", "Artist brain go! {filler}"],
    }

    MIN_TRANSCRIPT_LEN = 3

    def classify(self, transcript: str) -> FillerType:
        """Classify the transcript into a filler category."""
        stripped = transcript.strip()
        for pattern, filler_type in self.CLASSIFIER_PATTERNS:
            if pattern.search(stripped):
                return filler_type
        return FillerType.CHAT

    def generate(self, transcript: str, character: str = "default", mode: str = "default") -> str:
        """Return a filler string appropriate for the transcript/character/mode.

        The caller is responsible for routing it through TTS; tags are applied by
        the TTS layer, not here, so we keep the filler plain text.
        """
        filler_type = self.classify(transcript)
        candidates = self.FILLERS[filler_type]

        # Deterministic but varied selection: hash of inputs picks the index.
        idx = self._pick_index(transcript, character, mode, len(candidates))
        base_filler = candidates[idx]

        profile = get_character_profile(character)
        character_templates = self.CHARACTER_FILLERS.get(profile.slug)
        if character_templates:
            t_idx = self._pick_index(transcript, character, mode + "_char", len(character_templates))
            template = character_templates[t_idx]
            return template.format(name=profile.name, filler=base_filler)

        return base_filler

    def should_play_filler(self, transcript: str) -> bool:
        """Return True if the transcript is long enough to warrant a filler.

        Fast-path responses (triggers, echo, story queue, commands) are assumed to
        have been handled before this is called.
        """
        return len(transcript.strip()) >= self.MIN_TRANSCRIPT_LEN

    @staticmethod
    def _pick_index(transcript: str, character: str, salt: str, count: int) -> int:
        if count <= 1:
            return 0
        h = hash((transcript.strip().lower(), character.lower(), salt.lower()))
        return abs(h) % count


# Singleton convenience
def get_filler_generator() -> FillerGenerator:
    return FillerGenerator()
