"""Casa Voice V3 — Story queue.

Pre-generates short story segments in the background based on what the session
has learned about the kid (interests). In story mode, "what happens next?"
can then be answered instantly from the queue instead of waiting for the LLM.
"""

import re
import logging
import asyncio
from typing import Dict, List, Optional, Deque
from collections import deque

logger = logging.getLogger(__name__)

CONTINUATION_RE = re.compile(
    r"\b(what happens next|continue|go on|and then|then what|tell me more|next part|keep going)\b",
    re.IGNORECASE,
)


class StoryQueue:
    """Background generator for short, personalized story segments."""

    def __init__(self, llm, character: str = "default"):
        self.llm = llm
        self.character = character
        self._queue: Deque[str] = deque()
        self._generating = False

    def set_character(self, character: str):
        self.character = character

    @staticmethod
    def is_continuation(transcript: str) -> bool:
        return bool(CONTINUATION_RE.search(transcript))

    def next(self) -> Optional[str]:
        """Return the next ready segment, or None if the queue is empty."""
        return self._queue.popleft() if self._queue else None

    def peek(self) -> Optional[str]:
        return self._queue[0] if self._queue else None

    def size(self) -> int:
        return len(self._queue)

    def clear(self):
        self._queue.clear()

    def _interests_summary(self, interests: Dict[str, List[str]]) -> str:
        parts = []
        for category in ("love", "like", "enjoy", "favorite", "dislike"):
            items = interests.get(category, [])
            if items:
                parts.append(f"{category}s: {', '.join(items)}")
        return "; ".join(parts) or "fun adventure"

    async def prefill(self, interests: Dict[str, List[str]], min_size: int = 3):
        """Top up the queue with fresh segments based on the kid's interests."""
        if not self.llm or self._generating or self.size() >= min_size:
            return
        self._generating = True
        try:
            segments = await self._generate_segments(interests)
            for segment in segments:
                if segment:
                    self._queue.append(segment)
            logger.info(f"StoryQueue prefilled to {self.size()} segments for character={self.character}")
        except Exception as e:
            logger.error(f"StoryQueue prefill failed: {e}", exc_info=True)
        finally:
            self._generating = False

    async def _generate_segments(
        self, interests: Dict[str, List[str]]
    ) -> List[str]:
        summary = self._interests_summary(interests)
        system = (
            f"You are {self.character}. Tell a continuing kids' story in very short segments. "
            "Each segment must be exactly 1-2 sentences and end with a gentle cliffhanger. "
            "Do not number the segments. Keep the tone warm, fun, and appropriate for a child."
        )
        prompt = (
            f"Write 3 back-to-back story segments for a kid who {summary}. "
            "Each segment is 1-2 sentences. Separate segments with a newline."
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        response = await self.llm.chat(
            messages=messages, temperature=0.8, max_tokens=400
        )
        if not response:
            return []

        # Split by newlines first; if the model ignored that, fall back to sentences.
        raw_segments = [s.strip() for s in response.split("\n") if s.strip()]
        if len(raw_segments) < 2:
            sentences = re.split(r"(?<=[.!?])\s+", response.strip())
            raw_segments = []
            current = ""
            for sentence in sentences:
                if not sentence:
                    continue
                if current:
                    current += " " + sentence
                    raw_segments.append(current)
                    current = ""
                else:
                    current = sentence
            if current:
                raw_segments.append(current)

        return raw_segments[:3]
