"""Native audio (Quick Chat) smoke test.

Sends tests/hello_tts.wav to OpenRouter gpt-audio-mini and measures:
  - time to first text chunk
  - time to first audio chunk
  - total audio bytes received
  - full assistant text
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
        framerate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())
    if nchannels == 2:
        import numpy as np
        arr = np.frombuffer(frames, dtype=np.int16).reshape(-1, 2).mean(axis=1).astype(np.int16)
        frames = arr.tobytes()
    if framerate != 16000:
        # Very simple downsample only for even ratios
        import numpy as np
        arr = np.frombuffer(frames, dtype=np.int16)
        ratio = framerate // 16000
        if ratio > 1:
            arr = arr[::ratio]
        frames = arr.astype(np.int16).tobytes()
    return frames


async def main():
    if not os.environ.get("OPENROUTER_API_KEY"):
        print("Need OPENROUTER_API_KEY in environment.")
        sys.exit(1)

    providers = VoiceProviders()
    if providers.native_audio is None:
        print("Native audio provider not created. Set OPENROUTER_API_KEY and NATIVE_AUDIO_ENABLED=1.")
        sys.exit(1)

    wav_path = _project_root / "tests" / "hello_tts.wav"
    if not wav_path.exists():
        print("tests/hello_tts.wav not found")
        sys.exit(1)

    pcm = read_wav_pcm(wav_path)
    print(f"Sending {len(pcm)} bytes PCM to {providers.native_audio.model}...\n")

    t0 = time.perf_counter()
    first_text_time = None
    first_audio_time = None
    total_audio_bytes = 0
    full_text = ""
    user_transcript = ""

    try:
        async for chunk in providers.native_audio.stream_turn(
            audio_pcm=pcm,
            system_prompt="You are a friendly companion for kids. Respond briefly and warmly.",
            conversation_history=[],
        ):
            now = time.perf_counter() - t0
            ctype = chunk.get("type")
            if ctype == "text":
                if first_text_time is None:
                    first_text_time = now
                full_text += chunk.get("content", "")
            elif ctype == "audio":
                if first_audio_time is None:
                    first_audio_time = now
                total_audio_bytes += len(chunk.get("data", b""))
            elif ctype == "user_transcript":
                user_transcript = chunk.get("content", "")
            elif ctype == "transcript":
                full_text = chunk.get("content", "") or full_text
    except Exception as e:
        print(f"Native audio failed: {e}")
        raise
    finally:
        await providers.native_audio.close()
        await providers.stt.client.aclose()
        await providers.tts.client.aclose()
        if providers.llm:
            await providers.llm.client.aclose()

    print(f"User transcript (model): {user_transcript!r}")
    print(f"First text chunk:      {first_text_time:.2f}s" if first_text_time else "First text chunk:      n/a")
    print(f"First audio chunk:     {first_audio_time:.2f}s" if first_audio_time else "First audio chunk:     n/a")
    print(f"Total audio bytes:     {total_audio_bytes}")
    print(f"Total elapsed:         {time.perf_counter() - t0:.2f}s")
    print(f"Assistant text:        {full_text[:200]!r}")


if __name__ == "__main__":
    asyncio.run(main())
