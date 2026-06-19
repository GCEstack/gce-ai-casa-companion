"""Keyword-based safety filter."""

from pipecat.frames.frames import (
    Frame,
    LLMTextFrame,
    TextFrame,
    TranscriptionFrame,
    TTSTextFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from loguru import logger


class SafetyFilter(FrameProcessor):
    """Pass-through frame processor that drops unsafe text."""

    def __init__(self, blocked_words: list[str], **kwargs):
        super().__init__(**kwargs)
        self.blocked_words = {w.lower().strip() for w in blocked_words if w.strip()}

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, (TranscriptionFrame, LLMTextFrame, TTSTextFrame, TextFrame)):
            text = getattr(frame, "text", "")
            if self._contains_blocked(text):
                logger.warning(f"SafetyFilter dropped unsafe frame: {type(frame).__name__}")
                return

        await self.push_frame(frame, direction)

    def _contains_blocked(self, text: str) -> bool:
        if not self.blocked_words:
            return False
        lower = text.lower()
        return any(word in lower for word in self.blocked_words)
