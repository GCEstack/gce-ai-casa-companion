"""Casa Voice V3 — Wake-word detector unit tests.

These tests verify that the Porcupine detector initializes, processes audio,
and falls back gracefully. They do NOT prove detection with real speech; that
requires a recorded sample or a human voice.
"""

import os
import sys
import asyncio
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "src"))

from casa_voice.wakeword import create_wake_word_detector, PorcupineWakeWord


def test_disabled_fallback():
    old = os.environ.get("WAKE_WORD_DISABLED")
    os.environ["WAKE_WORD_DISABLED"] = "1"
    try:
        detector = create_wake_word_detector()
        assert detector is None, "Detector should be None when disabled"
        print("OK: disabled fallback")
    finally:
        if old is None:
            os.environ.pop("WAKE_WORD_DISABLED", None)
        else:
            os.environ["WAKE_WORD_DISABLED"] = old


def test_default_keyword_initializes():
    detector = create_wake_word_detector()
    assert detector is not None
    assert detector.sample_rate == 16000
    assert detector.frame_length == 512
    assert "porcupine" in detector.keywords
    print("OK: default keyword initializes")
    detector.delete()


def test_processes_silence_without_crash():
    detector = create_wake_word_detector()
    silence = b"\x00" * 2560  # 80ms of silence
    result = detector.process(silence)
    assert result is None, "Silence should not trigger wake word"
    print("OK: silence does not trigger")
    detector.delete()


def test_processes_noise_without_crash():
    import struct
    detector = create_wake_word_detector()
    # 80ms of quiet noise
    noise = struct.pack("<" + "h" * 1280, *([100] * 1280))
    result = detector.process(noise)
    assert result is None, "Quiet noise should not trigger wake word"
    print("OK: quiet noise does not trigger")
    detector.delete()


if __name__ == "__main__":
    test_disabled_fallback()
    test_default_keyword_initializes()
    test_processes_silence_without_crash()
    test_processes_noise_without_crash()
    print("\nAll wake-word unit tests passed.")
