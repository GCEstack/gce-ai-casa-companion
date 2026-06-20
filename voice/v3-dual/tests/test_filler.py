"""Unit tests for casa_voice.filler_generator."""

import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "src"))

import pytest

from casa_voice.filler_generator import FillerGenerator


@pytest.fixture
def filler():
    return FillerGenerator()


class TestFillerClassify:
    def test_math_intent(self, filler):
        assert filler.classify("what is 5 plus 3") == "math"
        assert filler.classify("calculate 10 times 4") == "math"

    def test_story_intent(self, filler):
        assert filler.classify("tell me a story") == "story"
        assert filler.classify("once upon a time") == "story"

    def test_joke_intent(self, filler):
        assert filler.classify("tell me a joke") == "joke"

    def test_song_intent(self, filler):
        assert filler.classify("sing me a song") == "song"

    def test_greeting_intent(self, filler):
        assert filler.classify("hello casa") == "greeting"
        assert filler.classify("good morning") == "greeting"

    def test_bedtime_intent(self, filler):
        assert filler.classify("goodnight") == "bedtime"

    def test_question_intent(self, filler):
        assert filler.classify("what is the tallest mountain?") == "question"
        assert filler.classify("how do birds fly") == "question"

    def test_default_intent(self, filler):
        assert filler.classify("tell me about dinosaurs") == "default"


class TestFillerSelect:
    def test_trigger_responses_return_none(self, filler):
        # Instant triggers should not get filler so they aren't delayed.
        for transcript in [
            "tell me a joke",
            "tell me a story",
            "sing me a song",
            "hello casa",
            "goodnight",
        ]:
            assert filler.select(transcript) is None

    def test_math_returns_filler(self, filler):
        result = filler.select("what is 12 times 12")
        assert result is not None
        assert "math" in result.lower() or "number" in result.lower() or "work" in result.lower()

    def test_question_returns_filler(self, filler):
        result = filler.select("why is the sky blue")
        assert result is not None

    def test_default_returns_filler(self, filler):
        result = filler.select("tell me about dinosaurs")
        assert result is not None

    def test_mode_override_applies_to_question(self, filler):
        result = filler.select("what is your name", mode="calm")
        assert result is not None
        assert result in filler.MODE_FILLERS["calm"]

    def test_mode_override_applies_to_default(self, filler):
        result = filler.select("tell me about space", mode="play")
        assert result is not None
        assert result in filler.MODE_FILLERS["play"]

    def test_mode_override_ignored_for_strong_intent(self, filler):
        # Math is a strong intent, so mode override should not apply.
        result = filler.select("what is 5 plus 3", mode="calm")
        assert result is not None
        assert result not in filler.MODE_FILLERS["calm"]
        assert result in filler.FILLERS["math"]

    def test_character_is_ignored(self, filler):
        # Character currently only affects prompt context, not filler selection.
        result1 = filler.select("what is your name", character="drago")
        result2 = filler.select("what is your name", character="jenny")
        assert result1 is not None
        assert result2 is not None
