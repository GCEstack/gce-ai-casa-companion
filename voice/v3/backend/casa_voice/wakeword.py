"""Casa Voice V3 — Local wake-word detection.

Uses Porcupine v1.x (no access-key required) for fast, offline wake-word spotting.
Custom wake words can be created at https://console.picovoice.ai/ and placed in
`wakewords/<name>.ppn`.
"""

import os
import logging
import struct
from pathlib import Path
from typing import Optional, List

import numpy as np

logger = logging.getLogger(__name__)


class PorcupineWakeWord:
    """Lightweight local wake-word detector.

    Porcupine v1.x is used because it does not require an access key.
    Custom `.ppn` models can be trained on the Picovoice Console.
    """

    def __init__(
        self,
        keywords: Optional[List[str]] = None,
        keyword_paths: Optional[List[str]] = None,
        sensitivities: Optional[List[float]] = None,
    ):
        try:
            import pvporcupine
        except ImportError as e:
            raise RuntimeError(
                "pvporcupine is not installed. Run: pip install 'pvporcupine<2.0'"
            ) from e

        if keyword_paths:
            resolved_paths = [str(Path(p).expanduser().resolve()) for p in keyword_paths]
            for p in resolved_paths:
                if not os.path.exists(p):
                    raise FileNotFoundError(f"Wake-word model not found: {p}")
        else:
            keywords = keywords or ["porcupine"]
            resolved_paths = None

        sensitivities = sensitivities or [0.5] * max(len(keywords or []), len(keyword_paths or []))

        try:
            self._porcupine = pvporcupine.create(
                keyword_paths=resolved_paths,
                keywords=keywords,
                sensitivities=sensitivities,
            )
        except Exception as e:
            logger.error(f"Failed to initialize Porcupine wake-word detector: {e}")
            raise

        self.sample_rate = self._porcupine.sample_rate
        self.frame_length = self._porcupine.frame_length
        self.keywords = keyword_paths or keywords or ["unknown"]
        self._remainder = np.array([], dtype=np.int16)
        logger.info(
            f"Porcupine wake-word detector ready: sr={self.sample_rate}, "
            f"frame={self.frame_length}, keywords={self.keywords}"
        )

    def process(self, pcm_bytes: bytes) -> Optional[str]:
        """Feed PCM audio and return the detected keyword name, or None."""
        if not pcm_bytes:
            return None

        arr = np.frombuffer(pcm_bytes, dtype=np.int16)
        samples = np.concatenate([self._remainder, arr])

        detected = None
        frame_len = self.frame_length
        pos = 0
        while pos + frame_len <= len(samples):
            frame = samples[pos : pos + frame_len]
            pos += frame_len
            # Porcupine v1.x expects a sequence of frame_length int16 samples.
            result = self._porcupine.process(frame)
            if result >= 0:
                detected = self.keywords[result]
                logger.info(f"Wake-word detected: '{detected}'")

        self._remainder = samples[pos:]
        return detected

    def reset(self):
        """Clear any pending audio."""
        self._remainder = np.array([], dtype=np.int16)

    def delete(self):
        if self._porcupine:
            self._porcupine.delete()
            self._porcupine = None

    def __del__(self):
        self.delete()


def create_wake_word_detector() -> Optional[PorcupineWakeWord]:
    """Factory that respects env vars.

    Env vars:
        WAKE_WORD_KEYWORDS      comma-separated built-in names (default: porcupine)
        WAKE_WORD_PATHS         comma-separated paths to .ppn files
        WAKE_WORD_SENSITIVITIES comma-separated floats
        WAKE_WORD_DISABLED      set to "1" to disable and fall back to STT wake detection
    """
    if os.environ.get("WAKE_WORD_DISABLED", "").lower() in ("1", "true", "yes"):
        return None

    keyword_paths = None
    keywords = None
    sensitivities = None

    if os.environ.get("WAKE_WORD_PATHS"):
        keyword_paths = [p.strip() for p in os.environ["WAKE_WORD_PATHS"].split(",") if p.strip()]
    elif os.environ.get("WAKE_WORD_KEYWORDS"):
        keywords = [k.strip() for k in os.environ["WAKE_WORD_KEYWORDS"].split(",") if k.strip()]

    if os.environ.get("WAKE_WORD_SENSITIVITIES"):
        sensitivities = [float(s.strip()) for s in os.environ["WAKE_WORD_SENSITIVITIES"].split(",") if s.strip()]

    return PorcupineWakeWord(keywords=keywords, keyword_paths=keyword_paths, sensitivities=sensitivities)
