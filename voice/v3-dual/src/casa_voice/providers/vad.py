"""Voice Activity Detection providers."""

import asyncio
import logging
import os
from typing import Dict, List, Optional

import numpy as np

from .common import logger


class SileroVAD:
    """Neural VAD for backend noise robustness, lazy-loaded with energy fallback.

    Requires: pip install torch onnxruntime
    Model: silero-vad v4.0 (~2.3MB)

    Loading torch.hub.load() is slow and blocks the async event loop, so we:
      1. Use a fast energy gate immediately.
      2. Kick off Silero loading in a background thread on first use.
      3. Switch to Silero once it is ready.
    """

    def __init__(
        self,
        threshold: float = 0.5,
        sample_rate: int = 16000,
        energy_threshold: float = None,
        peak_threshold: float = None,
    ):
        self.threshold = threshold
        self.sample_rate = sample_rate
        # Defaults tuned for typical room noise captured by a phone/browser mic.
        # Values are normalised to the [-1, 1] float range (16-bit PCM / 32768).
        self.energy_threshold = energy_threshold if energy_threshold is not None else float(
            os.environ.get("VAD_ENERGY_THRESHOLD", "0.003")
        )
        self.peak_threshold = peak_threshold if peak_threshold is not None else float(
            os.environ.get("VAD_PEAK_THRESHOLD", "0.015")
        )
        # Disable the neural Silero backend entirely on low-memory machines.
        self._disabled = os.environ.get("SILERO_VAD_DISABLED", "").lower() in ("1", "true", "yes")
        self._model = None
        self._get_speech_timestamps = None
        self._load_error: Optional[Exception] = None
        self._loading = False
        self._ready = False

    async def _load_model(self):
        """Load Silero model in a background thread."""
        if self._loading or self._ready:
            return
        self._loading = True
        logger.info("Silero VAD: starting background load...")
        try:
            import torch
            torch_hub_dir = os.environ.get("TORCH_HOME")
            if torch_hub_dir:
                torch.hub.set_dir(torch_hub_dir)
                logger.info(f"Silero VAD: using torch hub dir {torch_hub_dir}")
            model, utils = await asyncio.to_thread(
                torch.hub.load,
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
            )
            self._model = model
            (self._get_speech_timestamps, _, _, _, _) = utils
            self._ready = True
            logger.info("Silero VAD loaded successfully")
        except Exception as e:
            self._load_error = e
            logger.error(
                f"Failed to load Silero VAD; energy gate will remain primary. Error: {e}"
            )
        finally:
            self._loading = False

    def _energy_detect_speech(self, pcm_bytes: bytes) -> bool:
        """Fast energy/peak-based speech detection used as primary gate."""
        if not pcm_bytes:
            return False
        arr = np.frombuffer(pcm_bytes, dtype=np.int16)
        if arr.size == 0:
            return False
        mean_abs = float(np.mean(np.abs(arr))) / 32768.0
        peak = float(np.max(np.abs(arr))) / 32768.0
        logger.debug(
            f"VAD energy: mean={mean_abs:.5f} peak={peak:.5f} "
            f"(thresholds mean={self.energy_threshold} peak={self.peak_threshold})"
        )
        if mean_abs > self.energy_threshold:
            logger.debug(f"VAD energy gate fired (mean {mean_abs:.5f})")
            return True
        if peak > self.peak_threshold:
            logger.debug(f"VAD peak gate fired (peak {peak:.5f})")
            return True
        return False

    async def detect_speech(self, pcm_bytes: bytes) -> bool:
        """Return True if speech detected in PCM chunk."""
        energy_result = self._energy_detect_speech(pcm_bytes)

        if self._disabled:
            return energy_result

        # Start background Silero load on first use, but do not wait for it.
        if not self._loading and not self._ready and self._load_error is None:
            asyncio.create_task(self._load_model())

        if not self._ready:
            # Silero not ready yet -- energy gate is the primary VAD.
            if energy_result:
                logger.info("VAD: speech detected by energy gate")
            return energy_result

        # Hybrid: if energy is very low, skip Silero to save CPU.
        if not energy_result:
            return False

        try:
            import torch

            # Silero model requires fixed-size windows: 512 samples @ 16kHz, 256 @ 8kHz.
            window_samples = 512 if self.sample_rate == 16000 else 256
            arr = np.frombuffer(pcm_bytes, dtype=np.int16).copy()
            if len(arr) < window_samples:
                return energy_result

            step = window_samples // 2
            for start in range(0, len(arr) - window_samples + 1, step):
                chunk = arr[start : start + window_samples]
                tensor = torch.from_numpy(chunk).float() / 32768.0
                speech_prob = self._model(tensor, self.sample_rate).item()
                if speech_prob > self.threshold:
                    return True
            return False
        except Exception as e:
            logger.error(f"Silero VAD error: {e}; using energy fallback")
            return energy_result

    async def get_timestamps(self, pcm_bytes: bytes) -> List[Dict[str, float]]:
        """Return speech timestamps [{start, end}, ...] in seconds."""
        if not self._ready:
            return []
        try:
            import torch

            arr = np.frombuffer(pcm_bytes, dtype=np.int16).copy()
            tensor = torch.from_numpy(arr).float() / 32768.0
            if self.sample_rate != 16000:
                tensor = tensor[:: self.sample_rate // 16000]
            return self._get_speech_timestamps(
                tensor, self._model, sampling_rate=16000, threshold=self.threshold
            )
        except Exception as e:
            logger.error(f"VAD timestamp error: {e}")
            return []
