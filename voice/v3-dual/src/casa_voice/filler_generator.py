"""Casa Voice V3 — Filler audio generator.

Generates short, character/mode-aware filler phrases that are spoken while
the LLM is thinking. This masks latency and makes the conversation feel more
natural.

Examples:
- Math question  -> "Hmm, let me work that out."
- Story request  -> "Ooh, let me think of a good one."
- Joke request   -> "Okay, here's one..."
- General question -> "That's a good question."
"""

import re
import random
from typing import Optional, List


class FillerGenerator:
    """Pick a short filler phrase based on transcript content and context."""

    MATH_RE = re.compile(
        r"\b(\d+\s*[+\-*/x×÷]\s*\d+|"
        r"\d+\s+(plus|minus|times|divided\s+by)\s+\d+|"
        r"what'?s?\s+\d+\s+plus|\d+\s+times|\d+\s+minus|"
        r"math|calculate|compute|add|subtract|multiply|divide)\b",
        re.IGNORECASE,
    )

    STORY_RE = re.compile(
        r"\b(tell me a story|story time|read me a story|once upon a time|make up a story)\b",
        re.IGNORECASE,
    )

    JOKE_RE = re.compile(
        r"\b(tell me a joke|make me laugh|say something funny|joke)\b",
        re.IGNORECASE,
    )

    SONG_RE = re.compile(
        r"\b(sing me a song|sing a song|sing something)\b",
        re.IGNORECASE,
    )

    GREETING_RE = re.compile(
        r"\b(hello|hi there|hey casa|good morning|good afternoon|good evening)\b",
        re.IGNORECASE,
    )

    BEDTIME_RE = re.compile(
        r"\b(goodnight|bedtime|time for bed|night night)\b",
        re.IGNORECASE,
    )

    QUESTION_RE = re.compile(r"\?|\b(what|why|how|who|where|when|which|can you|will you)\b", re.IGNORECASE)

    # Fillers grouped by intent. Keep them short so they finish quickly.
    FILLERS: dict[str, List[str]] = {
        "math": [
            "Hmm, let me work that out.",
            "Okay, doing the math...",
            "Let me think about the numbers.",
        ],
        "story": [
            "Ooh, let me think of a good one.",
            "Okay, here's a story coming up...",
            "Let me imagine something fun.",
        ],
        "joke": [
            "Okay, here's one...",
            "Let me think of a funny one.",
            "Hmm, I've got a good one.",
        ],
        "song": [
            "Sure, here's a song!",
            "Let me sing something for you.",
        ],
        "greeting": [
            "Hey there!",
            "Hi friend!",
            "Hello!",
        ],
        "bedtime": [
            "Okay, time to get sleepy.",
            "Let's wind down.",
        ],
        "question": [
            "Hmm, that's a good question.",
            "Let me think about that.",
            "Good one — let me figure it out.",
        ],
        "default": [
            "Hmm, let me think.",
            "Okay, one second.",
            "Let me figure that out.",
        ],
    }

    # Mode-aware overrides. These replace the default filler if no strong intent.
    MODE_FILLERS: dict[str, List[str]] = {
        "story": [
            "Ooh, let me think of what happens next.",
            "Let's see where the story goes.",
        ],
        "calm": [
            "Hmm...",
            "Take a breath with me.",
        ],
        "play": [
            "Ooh, fun!",
            "Let me think of something playful.",
        ],
        "secret": [
            "Come closer, I'll whisper it.",
            "Shh, let me think.",
        ],
    }

    def classify(self, transcript: str) -> str:
        """Return the dominant intent of the transcript."""
        lowered = transcript.lower()
        if self.MATH_RE.search(lowered):
            return "math"
        if self.JOKE_RE.search(lowered):
            return "joke"
        if self.STORY_RE.search(lowered):
            return "story"
        if self.SONG_RE.search(lowered):
            return "song"
        if self.BEDTIME_RE.search(lowered):
            return "bedtime"
        if self.GREETING_RE.search(lowered):
            return "greeting"
        if self.QUESTION_RE.search(lowered):
            return "question"
        return "default"

    def select(self, transcript: str, character: str = "default", mode: str = "default") -> Optional[str]:
        """Pick a filler phrase, or None if no filler is appropriate."""
        intent = self.classify(transcript)

        # Trigger responses (joke, story, song, greeting, bedtime) already have
        # instant canned replies. Skip filler for those so we don't delay them.
        if intent in ("joke", "story", "song", "greeting", "bedtime"):
            return None

        # Mode override only when intent is weak (default/question).
        if intent in ("default", "question") and mode in self.MODE_FILLERS:
            pool = self.MODE_FILLERS[mode]
        else:
            pool = self.FILLERS.get(intent, self.FILLERS["default"])

        return random.choice(pool)


# Singleton
filler_generator = FillerGenerator()
