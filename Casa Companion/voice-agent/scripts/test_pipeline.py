"""Stream test PCM audio to the voice WebSocket and collect TTS response."""
import asyncio
import json
import sys
import time

import websockets

WS_URL = "wss://casa-voice-agent.fly.dev/ws/voice/{device_id}?token={api_key}"
AUDIO_PATH = r"C:\Users\Dekan AI Brother\Desktop\casa-companion-voice-agent\scripts\test_16k_pcm.raw"

DEVICE_ID = sys.argv[1]
API_KEY = sys.argv[2]


async def main():
    url = WS_URL.format(device_id=DEVICE_ID, api_key=API_KEY)
    print(f"[WS] connecting {url}")
    async with websockets.connect(url) as ws:
        print("[WS] connected")
        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        print(f"[WS] {msg}")

        # Stream audio
        with open(AUDIO_PATH, "rb") as f:
            audio = f.read()
        chunk_size = 4096
        print(f"[WS] sending {len(audio)} bytes in {chunk_size}-byte chunks")
        for i in range(0, len(audio), chunk_size):
            await ws.send(audio[i : i + chunk_size])
            await asyncio.sleep(0.1)

        # Wait a bit, then send a little silence to trigger endpointing
        await asyncio.sleep(1.0)
        # Send 0.5s of silence (16kHz 16bit mono)
        silence = b"\x00\x00" * 8000
        for i in range(0, len(silence), chunk_size):
            await ws.send(silence[i : i + chunk_size])
            await asyncio.sleep(0.1)

        print("[WS] waiting for response audio...")
        tts_bytes = bytearray()
        text_msgs = []
        deadline = time.time() + 20.0
        while time.time() < deadline:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
            except asyncio.TimeoutError:
                break
            if isinstance(msg, bytes):
                tts_bytes.extend(msg)
            else:
                text_msgs.append(msg)
                print(f"[WS] {msg}")
                if json.loads(msg).get("state") == "idle":
                    break

        print(f"[WS] received {len(tts_bytes)} TTS bytes")
        out_path = r"C:\Users\Dekan AI Brother\Desktop\casa-companion-voice-agent\scripts\response_16k_pcm.raw"
        with open(out_path, "wb") as f:
            f.write(tts_bytes)
        print(f"[WS] saved response to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
