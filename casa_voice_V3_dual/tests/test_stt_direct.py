"""Direct STT smoke test."""
import asyncio
import math
import struct
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)

from casa_voice.providers import OpenRouterSTT


def generate_sine_pcm(freq=440, duration=2.0, sample_rate=16000, amp=0.3):
    samples = []
    for i in range(int(sample_rate * duration)):
        val = amp * math.sin(2 * math.pi * freq * i / sample_rate)
        samples.append(int(val * 32767))
    return struct.pack("<" + "h" * len(samples), *samples)


def add_wav_header(pcm: bytes, sample_rate: int = 16000) -> bytes:
    import io
    out = io.BytesIO()
    out.write(b"RIFF")
    out.write(struct.pack("<I", 36 + len(pcm)))
    out.write(b"WAVE")
    out.write(b"fmt ")
    out.write(struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16))
    out.write(b"data")
    out.write(struct.pack("<I", len(pcm)))
    out.write(pcm)
    return out.getvalue()


async def main():
    pcm = generate_sine_pcm()
    wav = add_wav_header(pcm)
    print(f"Testing STT with {len(pcm)} bytes PCM / {len(wav)} bytes WAV")

    stt = OpenRouterSTT(model="openai/whisper-1")
    result = await stt.transcribe(pcm)
    print(f"STT result: '{result}'")


if __name__ == "__main__":
    asyncio.run(main())
