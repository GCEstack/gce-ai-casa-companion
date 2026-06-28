"""Shared constants and helpers for Casa Voice providers."""

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
DEFAULT_LLM = "openai/gpt-4o-mini"
DEFAULT_STT = "openai/whisper-1"
DEFAULT_TTS = "google/gemini-3.1-flash-tts-preview"  # ONLY model that supports tags


def _get_openrouter_provider_routing() -> Optional[Dict[str, Any]]:
    """Return provider routing preferences if OPENROUTER_PROVIDER_SORT is set.

    Valid sorts: price, throughput, latency.
    See: https://openrouter.ai/docs/provider-routing
    """
    sort = os.environ.get("OPENROUTER_PROVIDER_SORT", "").strip().lower()
    if sort in ("price", "throughput", "latency"):
        return {"sort": sort}
    return None


def _load_character_prompts() -> Dict[str, str]:
    """Load shared character prompts from packages/characters/characters.json.

    Falls back to an empty dict if the file is missing so the backend can still
    start when the shared package is not checked out.
    """
    try:
        parents = Path(__file__).resolve().parents
        if len(parents) <= 5:
            logger.warning(
                "Shared character prompts not available: source tree is too shallow (%d parents)",
                len(parents),
            )
            return {}
        candidate = parents[5] / "packages" / "characters" / "characters.json"
        if not candidate.exists():
            logger.warning("Shared character prompts not found at %s", candidate)
            return {}
        with candidate.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return {k: str(v) for k, v in data.items() if isinstance(v, str)}
        logger.warning("Shared character prompts has unexpected shape: %s", type(data))
    except Exception as e:
        logger.warning("Failed to load shared character prompts: %s", e)
    return {}


_CHARACTER_PROMPTS = _load_character_prompts()


def resample_pcm(
    pcm_bytes: bytes,
    src_rate: int,
    dst_rate: int,
    channels: int = 1,
    dtype: np.dtype = np.int16,
) -> bytes:
    """Fast linear resample using numpy."""
    if src_rate == dst_rate:
        return pcm_bytes
    arr = np.frombuffer(pcm_bytes, dtype=dtype)
    if channels > 1:
        arr = arr.reshape(-1, channels).mean(axis=1).astype(dtype)
    ratio = dst_rate / src_rate
    new_len = int(len(arr) * ratio)
    indices = np.linspace(0, len(arr) - 1, new_len)
    resampled = np.interp(indices, np.arange(len(arr)), arr).astype(dtype)
    return resampled.tobytes()
