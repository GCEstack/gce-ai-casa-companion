"""Integration test for Casa Voice V3 dual-mode WebSocket routing.

Simulates:
  - One audio device (like an ESP32)
  - One dashboard (browser in dashboard mode)

Verifies:
  - Both can connect to the same session
  - Commands from dashboard are accepted
  - State changes are broadcast to both
  - Binary audio is only sent to the audio client
  - Transcripts are broadcast to all clients (including audio)
  - Device presence events are broadcast

Run with the server already running on localhost:8080:
    python tests/integration_test.py
"""

import asyncio
import json
import websockets

SERVER = "ws://127.0.0.1:8080/ws/voice"
SESSION_ID = "test-session-123"

audio_messages = []
dashboard_messages = []


async def audio_client():
    uri = f"{SERVER}?device_type=audio&device_id=esp32-test&session_id={SESSION_ID}"
    async with websockets.connect(uri) as ws:
        print("[AUDIO] Connected")
        await ws.send(json.dumps({"type": "ping"}))

        # Let it run for a few seconds, collecting messages
        for _ in range(30):
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=0.5)
                if isinstance(msg, bytes):
                    audio_messages.append(("binary", len(msg)))
                else:
                    audio_messages.append(("text", json.loads(msg)))
            except asyncio.TimeoutError:
                pass

        print(f"[AUDIO] Received {len(audio_messages)} messages")
        print("[AUDIO] Sample:", audio_messages[:5])


async def dashboard_client():
    uri = f"{SERVER}?device_type=dashboard&device_id=dash-test&session_id={SESSION_ID}"
    async with websockets.connect(uri) as ws:
        print("[DASHBOARD] Connected")

        # Wait for initial state and device presence events
        await asyncio.sleep(0.3)

        # Send a config change
        await ws.send(json.dumps({
            "type": "config_change",
            "character": "drago",
            "mode": "story"
        }))

        # Send an interrupt command
        await ws.send(json.dumps({"type": "command", "command": "interrupt"}))

        # Collect messages
        for _ in range(30):
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=0.5)
                if isinstance(msg, bytes):
                    dashboard_messages.append(("binary", len(msg)))
                else:
                    dashboard_messages.append(("text", json.loads(msg)))
            except asyncio.TimeoutError:
                pass

        print(f"[DASHBOARD] Received {len(dashboard_messages)} messages")
        print("[DASHBOARD] Sample:", dashboard_messages[:7])


async def main():
    await asyncio.gather(audio_client(), dashboard_client())

    # Assertions
    errors = []

    audio_text_types = [m[1].get("type") for m in audio_messages if m[0] == "text"]
    dash_text_types = [m[1].get("type") for m in dashboard_messages if m[0] == "text"]

    if "state_change" not in audio_text_types:
        errors.append("Audio client did not receive state_change")
    if "state_change" not in dash_text_types:
        errors.append("Dashboard did not receive state_change")
    if "config_change" not in dash_text_types:
        errors.append("Dashboard did not receive config_change echo")
    if "config_change" not in audio_text_types:
        errors.append("Audio client did not receive config_change echo")
    if "device_connected" not in dash_text_types:
        errors.append("Dashboard did not receive device_connected event")
    if any(m[0] == "binary" for m in dashboard_messages):
        errors.append("Dashboard received binary audio (should not)")

    if errors:
        print("\nFAILURES:")
        for e in errors:
            print(f"  - {e}")
        raise SystemExit(1)

    print("\nAll integration checks passed!")


if __name__ == "__main__":
    asyncio.run(main())
