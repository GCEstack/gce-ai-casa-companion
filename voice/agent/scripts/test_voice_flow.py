"""End-to-end test: WebSocket device, SSE dashboard, kill switch."""
import asyncio
import json
import sys

import httpx
import websockets

BASE_URL = "https://casa-voice-agent.fly.dev"
WS_URL = BASE_URL.replace("https://", "wss://")

DEVICE_ID = sys.argv[1] if len(sys.argv) > 1 else ""
API_KEY = sys.argv[2] if len(sys.argv) > 2 else ""
ACCESS_TOKEN = sys.argv[3] if len(sys.argv) > 3 else ""

if not (DEVICE_ID and API_KEY and ACCESS_TOKEN):
    print("Usage: python test_voice_flow.py <device_id> <api_key> <access_token>")
    sys.exit(1)


async def sse_reader():
    await asyncio.sleep(1.5)
    url = f"{BASE_URL}/events/{DEVICE_ID}?token={ACCESS_TOKEN}"
    print(f"[SSE] connecting {url}")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("GET", url) as resp:
                print(f"[SSE] status {resp.status_code}")
                if resp.status_code != 200:
                    body = await resp.aread()
                    print(f"[SSE] error: {body.decode()}")
                    return
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        print(f"[SSE] {line[6:]}")
    except Exception as e:
        print(f"[SSE] exception: {e}")


async def ws_client():
    url = f"{WS_URL}/ws/voice/{DEVICE_ID}?token={API_KEY}"
    print(f"[WS] connecting {url}")
    try:
        async with websockets.connect(url) as ws:
            print("[WS] connected")
            await ws.send(json.dumps({"type": "ping", "ts": asyncio.get_event_loop().time()}))
            await ws.send(json.dumps({"type": "battery", "level": 42}))

            for _ in range(5):
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=3.0)
                    print(f"[WS] recv: {msg}")
                except asyncio.TimeoutError:
                    print("[WS] no message")
                    break

            print("[WS] waiting a bit before closing")
            await asyncio.sleep(2)
    except Exception as e:
        print(f"[WS] exception: {e}")


async def kill_switch():
    url = f"{BASE_URL}/api/kill/{DEVICE_ID}?token={ACCESS_TOKEN}"
    await asyncio.sleep(3)
    print(f"[KILL] POST {url}")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url)
            print(f"[KILL] status {resp.status_code} body {resp.text}")
    except Exception as e:
        print(f"[KILL] exception: {e}")


async def main():
    await asyncio.gather(ws_client(), sse_reader(), kill_switch())


if __name__ == "__main__":
    asyncio.run(main())
