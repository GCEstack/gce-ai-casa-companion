"""Test /api/tap endpoint for NFC tag / physical button actions.

Run with the server already running on localhost:8080:
    python tests/tap_test.py
"""

import asyncio
import json
import sys

import aiohttp
import websockets

SERVER_WS = "ws://127.0.0.1:8080/ws/voice"
SERVER_HTTP = "http://127.0.0.1:8080"
SESSION_ID = "tap-test-session"
AUDIO_DEVICE = "tap-audio-device"
DASHBOARD = "tap-dashboard"


def action_url(action: str, **params) -> str:
    qs = f"session_id={SESSION_ID}&action={action}"
    for k, v in params.items():
        if v is not None:
            qs += f"&{k}={v}"
    return f"{SERVER_HTTP}/api/tap?{qs}"


async def collect_messages(ws, seconds: float):
    msgs = []
    deadline = asyncio.get_event_loop().time() + seconds
    while asyncio.get_event_loop().time() < deadline:
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=0.2)
            if isinstance(msg, bytes):
                msgs.append(("binary", len(msg)))
            else:
                msgs.append(("text", json.loads(msg)))
        except asyncio.TimeoutError:
            pass
    return msgs


async def main():
    errors = []

    # Create a session with one audio device and one dashboard
    audio_ws = await websockets.connect(
        f"{SERVER_WS}?device_type=audio&device_id={AUDIO_DEVICE}&session_id={SESSION_ID}"
    )
    dash_ws = await websockets.connect(
        f"{SERVER_WS}?device_type=dashboard&device_id={DASHBOARD}&session_id={SESSION_ID}"
    )

    # Drain initial state + presence messages
    await asyncio.sleep(0.3)
    await collect_messages(audio_ws, 0.5)
    await collect_messages(dash_ws, 0.5)

    async with aiohttp.ClientSession() as http:
        # Test 1: character switch via GET tap
        async with http.get(action_url("character", character="drago")) as resp:
            if resp.status != 200:
                errors.append(f"character tap failed: {resp.status}")
            else:
                print("PASS: character tap returned 200")

        dash_msgs = await collect_messages(dash_ws, 0.5)
        if not any(m.get("type") == "config_change" and m.get("character") == "drago" for _, m in dash_msgs):
            errors.append("dashboard did not receive config_change(character=drago)")
        else:
            print("PASS: dashboard received config_change(drago)")

        # Test 2: mode switch via POST tap
        async with http.post(
            f"{SERVER_HTTP}/api/tap",
            json={"session_id": SESSION_ID, "action": "mode", "mode": "story"},
        ) as resp:
            if resp.status != 200:
                errors.append(f"mode tap failed: {resp.status}")
            else:
                print("PASS: mode tap returned 200")

        dash_msgs = await collect_messages(dash_ws, 0.5)
        if not any(m.get("type") == "config_change" and m.get("mode") == "story" for _, m in dash_msgs):
            errors.append("dashboard did not receive config_change(mode=story)")
        else:
            print("PASS: dashboard received config_change(story)")

        # Test 3: interrupt via GET tap
        async with http.get(action_url("interrupt")) as resp:
            if resp.status != 200:
                errors.append(f"interrupt tap failed: {resp.status}")
            else:
                print("PASS: interrupt tap returned 200")

        audio_msgs = await collect_messages(audio_ws, 0.5)
        if not any(m.get("type") == "interrupt_ack" for _, m in audio_msgs):
            errors.append("audio device did not receive interrupt_ack")
        else:
            print("PASS: audio device received interrupt_ack")

        # Test 4: unknown action returns 400
        async with http.get(action_url("not_real")) as resp:
            if resp.status != 400:
                errors.append(f"unknown action should return 400, got {resp.status}")
            else:
                print("PASS: unknown action returned 400")

        # Test 5: session not found returns 404
        async with http.get(f"{SERVER_HTTP}/api/tap?session_id=missing&action=interrupt") as resp:
            if resp.status != 404:
                errors.append(f"missing session should return 404, got {resp.status}")
            else:
                print("PASS: missing session returned 404")

    await audio_ws.close()
    await dash_ws.close()

    if errors:
        print("\nFAILURES:")
        for e in errors:
            print(f"  - {e}")
        raise SystemExit(1)

    print("\nAll /api/tap tests passed!")


if __name__ == "__main__":
    asyncio.run(main())
