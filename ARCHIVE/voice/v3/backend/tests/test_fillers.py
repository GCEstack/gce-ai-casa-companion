"""Tests for the filler audio generator."""

import pytest

from casa_voice.fillers import FillerGenerator, FillerType


@pytest.fixture
def generator():
    return FillerGenerator()


class TestClassify:
    def test_classify_question(self, generator):
        assert generator.classify("What is the biggest dinosaur?") == FillerType.QUESTION
        assert generator.classify("How do birds fly?") == FillerType.QUESTION
        assert generator.classify("Why is the sky blue?") == FillerType.QUESTION

    def test_classify_creative(self, generator):
        assert generator.classify("Tell me a story about a dragon") == FillerType.CREATIVE
        assert generator.classify("Sing me a song") == FillerType.CREATIVE
        assert generator.classify("Make me laugh") == FillerType.CREATIVE

    def test_classify_command(self, generator):
        assert generator.classify("Play some music") == FillerType.COMMAND
        assert generator.classify("Tell me the time") == FillerType.COMMAND
        assert generator.classify("Set a timer for five minutes") == FillerType.COMMAND

    def test_classify_chat(self, generator):
        assert generator.classify("I like turtles") == FillerType.CHAT
        assert generator.classify("Hello") == FillerType.CHAT


class TestGenerate:
    def test_returns_nonempty_string(self, generator):
        text = generator.generate("What is 2 + 2?", character="default", mode="default")
        assert isinstance(text, str)
        assert text

    def test_fillers_vary_by_character(self, generator):
        base = generator.generate("What is 2 + 2?", character="default", mode="default")
        drago = generator.generate("What is 2 + 2?", character="drago", mode="default")
        assert drago != base
        assert "Drago" in drago or "dragon" in drago.lower()

    def test_deterministic_for_same_inputs(self, generator):
        a = generator.generate("What is 2 + 2?", character="drago", mode="play")
        b = generator.generate("What is 2 + 2?", character="drago", mode="play")
        assert a == b


class TestShouldPlayFiller:
    def test_short_transcript_skipped(self, generator):
        assert generator.should_play_filler("Hi") is False
        assert generator.should_play_filler("Go") is False

    def test_normal_transcript_played(self, generator):
        assert generator.should_play_filler("What is the biggest dinosaur?") is True
        assert generator.should_play_filler("Tell me a story") is True

    def test_whitespace_ignored(self, generator):
        assert generator.should_play_filler("   Hi   ") is False
        assert generator.should_play_filler("   Hello there   ") is True
