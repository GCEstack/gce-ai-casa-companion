"""Voice command intent classifier for Casa Voice V2.

Checks transcripts for known commands before sending to the LLM.
Commands are handled in <10ms with no API call. Only non-commands go to LLM.

Supported commands:
  stop       → stop talking immediately
  story      → switch to story mode
  play       → switch to play mode
  bedtime    → switch to bedtime mode
  sing       → switch to sing mode
  switch     → change character (extracts name from transcript)
  louder     → volume up
  softer     → volume down
"""

from __future__ import annotations

import re
from typing import Callable


class CommandClassifier:
    """Keyword-based voice command classifier with confidence scoring.

    High-confidence commands (≥0.7) are handled immediately.
    Low-confidence or ambiguous commands fall through to the LLM.
    """

    COMMANDS = {
        "stop": {
            "keywords": ["stop", "stop talking", "quiet", "shush", "shut up", "hush"],
            "action": "stop",
            "priority": 10,  # Highest priority
        },
        "story": {
            "keywords": [
                "story",
                "tell me a story",
                "bedtime story",
                "story time",
                "tell a story",
            ],
            "action": "set_mode_story",
            "priority": 5,
        },
        "play": {
            "keywords": [
                "play",
                "let's play",
                "game time",
                "play mode",
                "wanna play",
                "want to play",
            ],
            "action": "set_mode_play",
            "priority": 5,
        },
        "bedtime": {
            "keywords": [
                "bedtime",
                "sleep",
                "goodnight",
                "sleepy time",
                "time for bed",
                "go to sleep",
            ],
            "action": "set_mode_bedtime",
            "priority": 5,
        },
        "sing": {
            "keywords": [
                "sing",
                "sing a song",
                "song time",
                "let's sing",
                "sing me",
            ],
            "action": "set_mode_sing",
            "priority": 5,
        },
        "louder": {
            "keywords": ["louder", "speak up", "i can't hear", "volume up", "more volume"],
            "action": "volume_up",
            "priority": 3,
        },
        "softer": {
            "keywords": ["softer", "quieter", "too loud", "shh", "volume down", "less volume"],
            "action": "volume_down",
            "priority": 3,
        },
    }

    # Character name extraction patterns
    CHARACTERS = ["orsetto", "coniglio", "drago", "bear", "rabbit", "dragon"]
    CHARACTER_ALIASES = {
        "bear": "orsetto",
        "rabbit": "coniglio",
        "bunny": "coniglio",
        "dragon": "drago",
    }

    # Switch character patterns
    SWITCH_PATTERNS = [
        r"i want(?: the)?\s+(\w+)",
        r"switch to(?: the)?\s+(\w+)",
        r"change to(?: the)?\s+(\w+)",
        r"talk to(?: the)?\s+(\w+)",
        r"let's talk to(?: the)?\s+(\w+)",
        r"be(?: the)?\s+(\w+)",
        r"become(?: the)?\s+(\w+)",
    ]

    def __init__(self, on_command: Callable | None = None):
        self.on_command = on_command

    def classify(self, text: str) -> tuple[str, dict] | None:
        """Classify a transcript. Returns (command_id, config) or None."""
        if not text:
            return None

        text_lower = text.lower().strip()

        # 1. Check for direct keyword matches
        best_match = None
        best_confidence = 0.0

        for command_id, config in self.COMMANDS.items():
            for keyword in config["keywords"]:
                if keyword in text_lower:
                    # Calculate confidence based on exact match vs. partial match
                    if text_lower == keyword or text_lower.startswith(keyword + " "):
                        confidence = 1.0
                    else:
                        confidence = 0.85

                    if confidence > best_confidence:
                        best_confidence = confidence
                        best_match = (command_id, config)

        # High-confidence direct match → return immediately
        if best_match and best_confidence >= 0.7:
            return best_match

        # 2. Check for character switch commands
        character_switch = self._extract_character_switch(text_lower)
        if character_switch:
            return ("switch_character", {
                "action": "switch_character",
                "character": character_switch,
                "priority": 8,
            })

        # 3. Ambiguous or no match → fall through to LLM
        return None

    def _extract_character_switch(self, text: str) -> str | None:
        """Extract character name from switch commands."""
        for pattern in self.SWITCH_PATTERNS:
            match = re.search(pattern, text)
            if match:
                name = match.group(1).lower()
                # Check aliases
                if name in self.CHARACTER_ALIASES:
                    return self.CHARACTER_ALIASES[name]
                if name in self.CHARACTERS:
                    return name
        return None

    def extract_character(self, text: str) -> str | None:
        """Extract any character mention from text."""
        text_lower = text.lower()
        for char in self.CHARACTERS:
            if char in text_lower:
                return self.CHARACTER_ALIASES.get(char, char)
        for alias, char in self.CHARACTER_ALIASES.items():
            if alias in text_lower:
                return char
        return None
