"""Casa Voice V2 — Voice Command Intent Classifier (Wake Phrase Edition)

Three action categories:
1. WAKE: Start listening ("Hello", "Hey", "Wake up", "Wake")
2. INTERRUPT: Cut off speaking ("Yo", "WTF", "One sec", "Hold on")
3. END_TURN: Force utterance end ("Send", "End", "Capische")
4. RESET: Clear session ("Reset")

Plus legacy commands (stop, louder, softer, modes, characters).

Runs entirely local, zero API cost, <10ms latency.
"""

import re
from typing import Optional, Tuple, Dict
from dataclasses import dataclass

from .protocol import CommandType


@dataclass
class CommandResult:
    is_command: bool
    command: Optional[CommandType] = None
    confidence: float = 1.0
    matched_phrase: Optional[str] = None


class CommandClassifier:
    """Fast regex-based command classifier with wake phrase support."""

    # Order matters: more specific / higher priority first
    PATTERNS = [
        # --- INTERRUPT (highest priority — can cut off TTS) ---
        (r"\b(yo\b|wtf|what the fuck|hold on|one sec|one second|wait up|cut it|shut it)\b", CommandType.INTERRUPT),

        # --- END TURN (force process current utterance) ---
        (r"\b(send it|send|end turn|end it|that\'s it|capische|capisce|done|over and out)\b", CommandType.END_TURN),

        # --- RESET (clear everything) ---
        (r"\b(reset|start over|clear session|forget everything)\b", CommandType.RESET),

        # --- WAKE (start listening from dormant) ---
        (r"\b(hello casa|hey casa|wake up|wake up casa|wake|i\'m here|i\'m back)\b", CommandType.WAKE),

        # --- STOP / Interrupt aliases ---
        (r"\b(stop talking|shut up|be quiet|halt|cease|enough)\b", CommandType.STOP),
        (r"\b(stop|quit|pause)\b", CommandType.STOP),

        # --- Volume ---
        (r"\b(louder|volume up|speak up|turn it up)\b", CommandType.LOUDER),
        (r"\b(softer|quieter|volume down|turn it down)\b", CommandType.SOFTER),

        # --- Modes ---
        (r"\b(tell me a story|story time|read me a story)\b", CommandType.STORY_MODE),
        (r"\b(let\'s play|play with me|game time|i wanna play)\b", CommandType.PLAY_MODE),
        (r"\b(bedtime|goodnight|sleep time|night night)\b", CommandType.BEDTIME_MODE),
        (r"\b(sing a song|let\'s sing|sing me something|music time)\b", CommandType.SING_MODE),

        # --- Characters ---
        (r"\b(i want the dragon|drago|dragon mode)\b", CommandType.CHARACTER_DRAGO),
        (r"\b(liam|peter|jimmy)\b", CommandType.CHARACTER_LIAM),
        (r"\b(jenny|jennifer)\b", CommandType.CHARACTER_JENNY),
        (r"\b(i want the bear|orsetto|bear mode)\b", CommandType.CHARACTER_ORSETTO),
        (r"\b(i want the rabbit|coniglio|rabbit mode)\b", CommandType.CHARACTER_CONIGLIO),
        (r"\b(i want the dragon|drago|dragon mode)\b", CommandType.CHARACTER_DRAGO),
    ]

    def __init__(self):
        self._compiled = [(re.compile(p, re.IGNORECASE), cmd) for p, cmd in self.PATTERNS]

    def classify(self, transcript: str) -> CommandResult:
        """Return CommandResult. If no match, is_command=False."""
        for pattern, cmd in self._compiled:
            match = pattern.search(transcript)
            if match:
                return CommandResult(
                    is_command=True,
                    command=cmd,
                    confidence=1.0,
                    matched_phrase=match.group(0)
                )
        return CommandResult(is_command=False)

    def classify_with_score(self, transcript: str) -> Tuple[Optional[CommandType], float, Optional[str]]:
        result = self.classify(transcript)
        if result.is_command:
            return result.command, result.confidence, result.matched_phrase
        return None, 0.0, None

    def is_wake_phrase(self, transcript: str) -> bool:
        """Quick check: is this a wake phrase?"""
        result = self.classify(transcript)
        return result.is_command and result.command == CommandType.WAKE

    def is_interrupt_phrase(self, transcript: str) -> bool:
        """Quick check: is this an interrupt phrase?"""
        result = self.classify(transcript)
        return result.is_command and result.command == CommandType.INTERRUPT

    def is_end_turn_phrase(self, transcript: str) -> bool:
        """Quick check: is this an end-turn phrase?"""
        result = self.classify(transcript)
        return result.is_command and result.command == CommandType.END_TURN


# Singleton
classifier = CommandClassifier()
