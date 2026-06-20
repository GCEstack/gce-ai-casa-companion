"""Unit tests for casa_voice.commands.

Covers:
- CommandClassifier intent detection (wake, interrupt, end-turn, reset,
  volume, character, mode)
- Wake-phrase stripping
- TriggerResponder instant replies
- EchoResponder interest extraction
- KeywordCompressor content-word extraction
"""

import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "src"))

import pytest

from casa_voice.commands import (
    CommandClassifier,
    TriggerResponder,
    EchoResponder,
    KeywordCompressor,
)
from casa_voice.protocol import CommandType


@pytest.fixture
def classifier():
    return CommandClassifier()


@pytest.fixture
def trigger():
    return TriggerResponder()


@pytest.fixture
def echo():
    return EchoResponder()


@pytest.fixture
def compressor():
    return KeywordCompressor()


class TestCommandClassifier:
    def test_no_match_returns_false(self, classifier):
        result = classifier.classify("tell me about dinosaurs")
        assert not result.is_command
        assert result.command is None

    def test_wake_phrases(self, classifier):
        for phrase in ["hello", "hey casa", "wake up", "casa", "porcupine"]:
            result = classifier.classify(phrase)
            assert result.is_command, phrase
            assert result.command == CommandType.WAKE, phrase

    def test_interrupt_phrases(self, classifier):
        for phrase in ["yo", "hold on", "one sec", "stop talking", "quiet"]:
            result = classifier.classify(phrase)
            assert result.is_command, phrase
            assert result.command == CommandType.INTERRUPT, phrase

    def test_end_turn_phrases(self, classifier):
        for phrase in ["send", "send it", "end turn", "done", "over and out"]:
            result = classifier.classify(phrase)
            assert result.is_command, phrase
            assert result.command == CommandType.END_TURN, phrase

    def test_reset_phrases(self, classifier):
        for phrase in ["reset", "start over", "forget everything"]:
            result = classifier.classify(phrase)
            assert result.is_command, phrase
            assert result.command == CommandType.RESET, phrase

    def test_volume_phrases(self, classifier):
        louder = classifier.classify("speak up")
        assert louder.is_command
        assert louder.command == CommandType.LOUDER

        softer = classifier.classify("turn it down")
        assert softer.is_command
        assert softer.command == CommandType.SOFTER

        # "volume up" matches the LOUDER pattern before the UI-button VOLUME_UP pattern.
        up = classifier.classify("volume up")
        assert up.is_command
        assert up.command == CommandType.LOUDER

        down = classifier.classify("volume_down")
        assert down.is_command
        assert down.command == CommandType.VOLUME_DOWN

    def test_character_phrases(self, classifier):
        drago = classifier.classify("i want the dragon")
        assert drago.is_command
        assert drago.command == CommandType.CHARACTER_DRAGO

        liam = classifier.classify("liam")
        assert liam.is_command
        assert liam.command == CommandType.CHARACTER_LIAM

        jenny = classifier.classify("jennifer")
        assert jenny.is_command
        assert jenny.command == CommandType.CHARACTER_JENNY

    def test_story_mode_phrase(self, classifier):
        result = classifier.classify("story mode")
        assert result.is_command
        assert result.command == CommandType.STORY_MODE

    def test_is_wake_phrase_helpers(self, classifier):
        assert classifier.is_wake_phrase("hello")
        assert not classifier.is_wake_phrase("tell me a joke")

    def test_is_interrupt_phrase_helper(self, classifier):
        assert classifier.is_interrupt_phrase("yo")
        assert not classifier.is_interrupt_phrase("hello")

    def test_is_end_turn_phrase_helper(self, classifier):
        assert classifier.is_end_turn_phrase("done")
        assert not classifier.is_end_turn_phrase("reset")


class TestWakePhraseStripping:
    def test_strip_simple_wake(self, classifier):
        assert classifier.strip_wake_phrase("Hello, tell me a joke") == "tell me a joke"

    def test_strip_repeated_wake(self, classifier):
        assert classifier.strip_wake_phrase("Hey casa, hey casa, what's the weather") == "what's the weather"

    def test_strip_with_punctuation(self, classifier):
        assert classifier.strip_wake_phrase("Wake up! I need help") == "I need help"

    def test_no_wake_phrase_unchanged(self, classifier):
        text = "tell me a joke"
        assert classifier.strip_wake_phrase(text) == text


class TestTriggerResponder:
    def test_joke_trigger(self, trigger):
        reply = trigger.match("tell me a joke")
        assert reply in trigger.RESPONSES["joke"]

    def test_story_trigger(self, trigger):
        reply = trigger.match("read me a story")
        assert reply in trigger.RESPONSES["story"]

    def test_greeting_trigger(self, trigger):
        reply = trigger.match("good morning")
        assert reply in trigger.RESPONSES["greeting"]

    def test_bedtime_trigger(self, trigger):
        reply = trigger.match("time for bed")
        assert reply in trigger.RESPONSES["bedtime"]

    def test_song_trigger(self, trigger):
        reply = trigger.match("sing me a song")
        assert reply in trigger.RESPONSES["song"]

    def test_time_trigger(self, trigger):
        reply = trigger.match("what time is it")
        assert reply and "M" in reply  # AM/PM marker

    def test_no_trigger(self, trigger):
        assert trigger.match("what is the capital of france") is None


class TestEchoResponder:
    def test_love_interests(self, echo):
        match = echo.match("I love math and story time with my turtle")
        assert match is not None
        assert "love" in match.interests
        assert "math" in match.interests["love"]
        assert "story time with your turtle" in match.interests["love"]
        assert "sounds awesome" in match.echo_text

    def test_dislike_interests(self, echo):
        match = echo.match("I don't like broccoli")
        assert match is not None
        assert "dislike" in match.interests
        assert "broccoli" in match.interests["dislike"]
        assert "That's okay" in match.echo_text

    def test_favorite_maps_to_love(self, echo):
        match = echo.match("My favorite color is blue")
        assert match is not None
        # Interests keep the "favorite" category, but the echo text says "love".
        assert "favorite" in match.interests
        assert "color is blue" in match.interests["favorite"]
        assert "love" in match.echo_text

    def test_no_match_without_verb(self, echo):
        assert echo.match("tell me about dinosaurs") is None


class TestKeywordCompressor:
    def test_compress_removes_fillers(self, compressor):
        text = "Um, I was wondering, can you maybe tell me a really fun story about a dragon?"
        compressed = compressor.compress(text)
        assert "wondering" in compressed
        assert "dragon" in compressed
        assert "i" not in compressed.split()
        assert "the" not in compressed.split()

    def test_compress_preserves_negation(self, compressor):
        text = "I don't like spiders"
        compressed = compressor.compress(text)
        assert "not" in compressed
        assert "spiders" in compressed

    def test_compress_empty_result_returns_original(self, compressor):
        text = "a an the"
        assert compressor.compress(text) == text
