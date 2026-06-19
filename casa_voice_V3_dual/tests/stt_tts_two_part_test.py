"""Two-part cloud latency test: Groq STT + OpenRouter TTS.

No Bluetooth, no phone, no wake word. Just measures the two model calls
that dominate end-to-end latency.
"""
import asyncio
import os
import sys
import time
import wave
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from dotenv import load_dotenv

_project_root = Path(__file__).resolve().parent.parent
_possible_env_files = [
    _project_root / ".env",
    Path("C:/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/EC4") / ".env",
]
for candidate in _possible_env_files:
    if candidate.exists():
        load_dotenv(dotenv_path=candidate, override=False)
        break

sys.path.insert(0, str(_project_root / "src"))
from casa_voice.providers import VoiceProviders


def read_wav_pcm(path: Path) -> bytes:
    with wave.open(str(path), "rb") as wf:
        nchannels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())
    # Convert stereo to mono if needed; our providers expect 16-bit mono PCM.
    if nchannels == 2:
        import array
        import numpy as np
        arr = np.frombuffer(frames, dtype=np.int16).reshape(-1, 2).mean(axis=1).astype(np.int16)
        frames = arr.tobytes()
    return frames


async def test_stt(providers: VoiceProviders):
    wav_path = _project_root / "tests" / "hello_tts.wav"
    if not wav_path.exists():
        print("[STT] SKIP: tests/hello_tts.wav not found")
        return

    pcm = read_wav_pcm(wav_path)
    print(f"[STT] Sending {len(pcm)} bytes PCM to Groq whisper-large-v3-turbo...")

    t0 = time.perf_counter()
    text = await providers.stt.transcribe(pcm, sample_rate=16000)
    elapsed = time.perf_counter() - t0

    print(f"[STT] Result ({elapsed:.2f}s): {text!r}")
    return elapsed, text


async def test_tts(providers: VoiceProviders):
    phrase = "Hello! I am Casa Companion, ready to play and learn with you."
    print(f"[TTS] Synthesizing {len(phrase)} chars via OpenRouter Gemini Flash TTS...")

    t0 = time.perf_counter()
    first_chunk_time = None
    total_bytes = 0
    async for chunk in providers.tts.synthesize_stream(phrase, character="default", mode="play"):
        total_bytes += len(chunk)
        if first_chunk_time is None:
            first_chunk_time = time.perf_counter() - t0
    total_time = time.perf_counter() - t0

    print(f"[TTS] First chunk: {first_chunk_time:.2f}s | Total: {total_time:.2f}s | Bytes: {total_bytes}")
    return total_time, first_chunk_time, total_bytes


async def main():
    if not os.environ.get("GROQ_API_KEY") or not os.environ.get("OPENROUTER_API_KEY"):
        print("Need GROQ_API_KEY and OPENROUTER_API_KEY in environment.")
        sys.exit(1)

    providers = VoiceProviders()
    print("Providers loaded.\n")

    await test_stt(providers)
    print()
    await test_tts(providers)
    print()

    # Clean up httpx clients
    await providers.stt.client.aclose()
    await providers.tts.client.aclose()
    if providers.llm:
        await providers.llm.client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
