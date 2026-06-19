"""SSE endpoint test for Casa Voice V3.

Verifies:
  - /events/{device_id} requires token when VOICE_SERVER_API_KEY is set
  - /events/{device_id} streams state_change and config_change events
  - Events mirror the WebSocket text messages

Run with the server already running on localhost:8080:
    python tests/sse_test.py
"""

import asyncio
import json
import sys

import aiohttp
import websockets

SERVER_WS = "ws://127.0.0.1:8080/ws/voice"
SERVER_HTTP = "http://127.0.0.1:8080"
SESSION_ID = "sse-test-session"
DEVICE_ID = "sse-dashboard"


def parse_sse_event(raw: bytes) -> dict:
    """Parse a simple SSE event block."""
    text = raw.decode("utf-8")
    lines = [line for line in text.strip().split("\n") if line.startswith("data:")]
    payload = "\n".join(line[5:].strip() for line in lines)
    return json.loads(payload)


async def open_dashboard(token: str = "demo-secret"):
    uri = f"{SERVER_WS}?device_type=dashboard&device_id={DEVICE_ID}&session_id={SESSION_ID}&token={token}"
    return await websockets.connect(uri)


async def read_sse_events(session: aiohttp.ClientSession, url: str, count: int, timeout: float = 5.0):
    events = []
    async with session.get(url) as resp:
        async for line in resp.content:
            if not line.strip():
                continue
            if line.startswith(b"event: message"):
                # read the following data: line(s)
                data_lines = []
                async for data_line in resp.content:
                    if data_line.startswith(b"data:"):
                        data_lines.append(data_line[5:].strip())
                    elif not data_line.strip():
                        break
                payload = b"".join(data_lines).decode("utf-8")
                events.append(json.loads(payload))
                if len(events) >= count:
                    break
            if asyncio.get_event_loop().time() > timeout:
                break
    return events


async def main():
    token = "demo-secret"

    async with aiohttp.ClientSession() as session:
        # 1. Missing token should 403 when key is set
        async with session.get(f"{SERVER_HTTP}/events/{DEVICE_ID}") as resp:
            if resp.status != 403:
                print(f"FAIL: expected 403 without token, got {resp.status}")
                sys.exit(1)
            print("PASS: missing token rejected")

        # 2. Unknown device should 404
        async with session.get(f"{SERVER_HTTP}/events/unknown-device?token={token}") as resp:
            if resp.status != 404:
                print(f"FAIL: expected 404 for unknown device, got {resp.status}")
                sys.exit(1)
            print("PASS: unknown device returns 404")

    # 3. Connect dashboard via WebSocket, then open SSE stream
    ws = await open_dashboard()
    try:
        # Wait for initial state_change on WebSocket
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=2.0))
        assert msg["type"] == "state_change" and msg["state"] == "idle"
        print(f"WebSocket initial: {msg}")

        sse_url = f"{SERVER_HTTP}/events/{DEVICE_ID}?token={token}"

        async with aiohttp.ClientSession() as session:
            # Read first SSE event (connected ack + possibly queued messages)
            events = []
            async with session.get(sse_url) as resp:
                assert resp.status == 200, resp.status
                print("SSE stream connected")

                # Read initial connected event
                async for line in resp.content:
                    if line.startswith(b"event: connected"):
                        # consume data lines
                        async for data_line in resp.content:
                            if data_line.startswith(b"data:"):
                                events.append(json.loads(data_line[5:].strip()))
                            elif not data_line.strip():
                                break
                        break

                # Send a config change via WebSocket; it should appear on SSE
                await ws.send(json.dumps({
                    "type": "config_change",
                    "character": "drago",
                    "mode": "story"
                }))

                # Collect events until we see config_change or timeout
                deadline = asyncio.get_event_loop().time() + 5.0
                while asyncio.get_event_loop().time() < deadline:
                    line = await resp.content.readline()
                    if not line:
                        break
                    if line.startswith(b"event: message"):
                        data_lines = []
                        async for data_line in resp.content:
                            if data_line.startswith(b"data:"):
                                data_lines.append(data_line[5:].strip())
                            elif not data_line.strip():
                                break
                        payload = b"".join(data_lines).decode("utf-8")
                        events.append(json.loads(payload))
                        if any(e.get("type") == "config_change" for e in events):
                            break

            if not any(e.get("type") == "config_change" for e in events):
                print("FAIL: did not receive config_change over SSE")
                print("Events received:", events)
                sys.exit(1)

            print("PASS: received config_change over SSE")
            print("Events:", events)
    finally:
        await ws.close()

    print("\nAll SSE checks passed!")


if __name__ == "__main__":
    asyncio.run(main())
