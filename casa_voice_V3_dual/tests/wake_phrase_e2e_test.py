"""End-to-end wake phrase test.

Generates a "Hello" audio clip via OpenRouter TTS, sends it to the server as
an audio device, and verifies the session transitions to LISTENING.
"""

import asyncio
import json
import struct
import websockets
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)

from casa_voice.providers import OpenRouterTTS

SERVER = "ws://127.0.0.1:8080/ws/voice"
SESSION_ID = "wake-phrase-e2e-test"
DEVICE_ID = "wake-test-browser"
SAMPLE_RATE = 16000


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


async def generate_hello_pcm() -> bytes:
    tts = OpenRouterTTS()
    chunks = []
    async for chunk in tts.synthesize_stream("Hello"):
        chunks.append(chunk)
    pcm = b"".join(chunks)
    print(f"Generated 'Hello' PCM: {len(pcm)} bytes")
    # Save for inspection
    Path("tests/hello_tts.wav").write_bytes(add_wav_header(pcm, sample_rate=16000))
    return pcm


async def main():
    pcm = await generate_hello_pcm()
    if not pcm:
        print("Failed to generate TTS audio")
        raise SystemExit(1)

    uri = f"{SERVER}?device_type=audio&device_id={DEVICE_ID}&session_id={SESSION_ID}"
    async with websockets.connect(uri) as ws:
        print("Connected as audio device")

        # Wait for initial idle state
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=2.0))
        print(f"Initial state: {msg}")
        assert msg["type"] == "state_change" and msg["state"] == "idle"

        # Send the "Hello" PCM in 80ms frames
        frame_bytes = int(SAMPLE_RATE * 0.08) * 2  # 2560 bytes
        for offset in range(0, len(pcm), frame_bytes):
            frame = pcm[offset : offset + frame_bytes]
            if len(frame) < frame_bytes:
                break
            await ws.send(frame)
            await asyncio.sleep(0.08)

        # Add a little silence so the VAD can finalize
        silence = b"\x00" * frame_bytes
        for _ in range(12):
            await ws.send(silence)
            await asyncio.sleep(0.08)

        print("Sent audio + silence. Waiting for state changes...")

        # Collect messages for up to 15 seconds
        states_seen = []
        for _ in range(150):
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=0.1)
                if isinstance(msg, bytes):
                    continue
                data = json.loads(msg)
                if data.get("type") == "state_change":
                    states_seen.append(data["state"])
                    print(f"State: {data['state']}")
                    if data["state"] == "listening":
                        print("SUCCESS: Wake phrase detected, session is LISTENING")
                        return
            except asyncio.TimeoutError:
                pass

        print(f"FAIL: Did not reach listening state. States seen: {states_seen}")
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
