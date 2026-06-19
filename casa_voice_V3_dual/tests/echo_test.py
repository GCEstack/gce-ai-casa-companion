"""Casa Voice V3 — Voice Echo responder unit tests.

Runs locally, no API keys needed. Verifies keyword extraction and echo text.
"""

import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "src"))

from casa_voice.commands import echo_responder


def test_love_math_and_turtle():
    m = echo_responder.match("I love to talk about math and story time with my turtle")
    assert m, "Expected an echo match"
    assert "math" in m.echo_text
    assert "story time with your turtle" in m.echo_text
    assert "love" in m.interests
    assert "math" in m.interests["love"]
    assert "story time with your turtle" in m.interests["love"]
    print("OK: love math and turtle")


def test_dislike_broccoli():
    m = echo_responder.match("I hate broccoli")
    assert m, "Expected an echo match"
    assert "don't like broccoli" in m.echo_text
    assert "dislike" in m.interests
    assert "broccoli" in m.interests["dislike"]
    print("OK: dislike broccoli")


def test_mixed_likes():
    m = echo_responder.match("I like dinosaurs and my favorite color is blue")
    assert m, "Expected an echo match"
    assert "dinosaurs" in m.echo_text
    assert "your favorite color is blue" in m.echo_text
    print("OK: mixed likes")


def test_no_match():
    m = echo_responder.match("What time is it?")
    assert m is None
    print("OK: no match")


if __name__ == "__main__":
    test_love_math_and_turtle()
    test_dislike_broccoli()
    test_mixed_likes()
    test_no_match()
    print("\nAll echo tests passed.")
