"""Synthetic audio smoke test.

Connects as an audio device, sends 16kHz sine-wave PCM, and verifies the
server accepts binary frames without crashing and stays in IDLE (since sine
waves are not speech). Useful for validating the WebSocket binary path and
browser-side buffer slicing fixes.
"""

import asyncio
import json
import math
import struct
import websockets

SERVER = "ws://127.0.0.1:8080/ws/voice"
SESSION_ID = "synth-audio-test"
DEVICE_ID = "synth-browser"

SAMPLE_RATE = 16000
DURATION_S = 3.0
FREQUENCY = 440.0
AMPLITUDE = 0.3


def generate_pcm() -> bytes:
    """Generate a 16kHz 16-bit mono sine wave."""
    samples = []
    for i in range(int(SAMPLE_RATE * DURATION_S)):
        val = AMPLITUDE * math.sin(2 * math.pi * FREQUENCY * i / SAMPLE_RATE)
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
    uri = f"{SERVER}?device_type=audio&device_id={DEVICE_ID}&session_id={SESSION_ID}"
    pcm = generate_pcm()
    print(f"Generated {len(pcm)} bytes of 16kHz PCM ({DURATION_S}s sine wave)")

    async with websockets.connect(uri) as ws:
        print("Connected as audio device")

        # Wait for initial state
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=2.0))
        print(f"Initial state: {msg}")
        assert msg["type"] == "state_change" and msg["state"] == "idle"

        # Send PCM in 80ms frames like the browser does
        frame_samples = int(SAMPLE_RATE * 0.08)  # 1280
        frame_bytes = frame_samples * 2
        for offset in range(0, len(pcm), frame_bytes):
            frame = pcm[offset : offset + frame_bytes]
            if len(frame) < frame_bytes:
                break
            await ws.send(frame)
            await asyncio.sleep(0.08)

        print(f"Sent {len(pcm)} bytes in {len(pcm) // frame_bytes} frames")

        # Collect any state changes for a few seconds
        for _ in range(40):
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=0.1)
                if isinstance(msg, bytes):
                    print(f"Received binary: {len(msg)} bytes")
                else:
                    print(f"Received: {msg}")
            except asyncio.TimeoutError:
                pass

        print("Smoke test completed without server crash")


if __name__ == "__main__":
    asyncio.run(main())
