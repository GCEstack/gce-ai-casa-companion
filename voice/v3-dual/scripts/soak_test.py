"""Soak test for Casa Voice V3-Dual.

Runs synthetic audio through the WebSocket pipeline for a configurable duration
and reports memory/CPU stats. Requires the server to be running locally.

Example:
    python scripts/soak_test.py --url ws://localhost:8080/ws/voice --duration 300
"""

import argparse
import asyncio
import json
import math
import os
import sys
import time
import tracemalloc
import websockets


# 1 second of 16-bit 16kHz silence-ish PCM (quiet noise to keep VAD calm).
def _silent_pcm(seconds: float = 1.0) -> bytes:
    import random
    samples = int(16000 * seconds)
    return bytes(
        (i & 0xFF) for i in random.choices(range(-256, 256), k=samples * 2)
    )


async def _connect(url: str):
    device_id = f"soak-{os.urandom(4).hex()}"
    full_url = f"{url}?device_type=audio&device_id={device_id}&session_id=soak-session"
    return await websockets.connect(full_url)


async def _ping(ws):
    await ws.send(json.dumps({"type": "ping"}))


async def _send_audio(ws, duration: float = 1.0):
    await ws.send(_silent_pcm(duration))


async def run(url: str, duration_seconds: int, interval: float = 1.0):
    tracemalloc.start()
    start = time.perf_counter()
    messages = 0
    errors = 0

    ws = await _connect(url)
    try:
        while time.perf_counter() - start < duration_seconds:
            try:
                await _send_audio(ws, interval)
                messages += 1
                # Drain any incoming messages so the receive buffer doesn't grow.
                try:
                    while True:
                        msg = await asyncio.wait_for(ws.recv(), timeout=0.05)
                        if isinstance(msg, str):
                            data = json.loads(msg)
                            if data.get("type") == "pong":
                                pass
                except asyncio.TimeoutError:
                    pass
            except Exception as e:
                errors += 1
                print(f"[soak] error: {e}")
                try:
                    await ws.close()
                except Exception:
                    pass
                try:
                    ws = await _connect(url)
                except Exception as conn_err:
                    print(f"[soak] reconnect failed: {conn_err}")
                    await asyncio.sleep(2.0)

            current, peak = tracemalloc.get_traced_memory()
            elapsed = time.perf_counter() - start
            print(
                f"[soak] elapsed={elapsed:.0f}s messages={messages} errors={errors} "
                f"mem_current={current / 1024 / 1024:.2f}MB mem_peak={peak / 1024 / 1024:.2f}MB"
            )
    finally:
        await ws.close()
        tracemalloc.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Casa Voice soak test")
    parser.add_argument("--url", default="ws://localhost:8080/ws/voice")
    parser.add_argument("--duration", type=int, default=300, help="Duration in seconds")
    parser.add_argument("--interval", type=float, default=1.0, help="Seconds between audio sends")
    args = parser.parse_args()

    asyncio.run(run(args.url, args.duration, args.interval))
