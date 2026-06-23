"""End-to-end WebSocket test using text_input (no mic needed).

Connects to a running v3-dual backend, sends a typed message as an audio
client, and verifies the full state/transcript/response/audio flow.
"""
import asyncio
import json
import os
import sys
import time
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

import websockets

URL = os.environ.get("VOICE_SERVER_URL", "ws://localhost:8080/ws/voice")
if not URL.startswith(("ws://", "wss://")) or "your_value" in URL:
    URL = "ws://localhost:8080/ws/voice"

TOKEN = os.environ.get("VOICE_SERVER_API_KEY")
SESSION_ID = "e2e-websocket-text"
DEVICE_ID = "test-client"


async def main():
    if not URL:
        print("Need VOICE_SERVER_URL")
        sys.exit(1)

    params = {
        "device_type": "audio",
        "device_id": DEVICE_ID,
        "session_id": SESSION_ID,
    }
    if TOKEN:
        params["token"] = TOKEN

    uri = f"{URL}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
    print(f"Connecting to {URL} ...")

    states = []
    transcripts = []
    assistant_texts = []
    audio_bytes = 0
    audio_chunks = 0
    first_audio_time = None
    start = time.perf_counter()

    async with websockets.connect(uri) as ws:
        print("Connected.")
        await ws.send(json.dumps({"type": "config_change", "character": "default", "mode": "default"}))
        await asyncio.sleep(0.2)
        await ws.send(json.dumps({"type": "text_input", "text": "Tell me a short joke."}))

        try:
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=45.0)
                elapsed = time.perf_counter() - start

                if isinstance(msg, bytes):
                    audio_bytes += len(msg)
                    audio_chunks += 1
                    if first_audio_time is None:
                        first_audio_time = elapsed
                    continue

                data = json.loads(msg)
                mtype = data.get("type")

                if mtype == "state_change":
                    state = data.get("state")
                    states.append((elapsed, state))
                    print(f"[{elapsed:6.2f}s] state -> {state}")
                elif mtype == "transcript":
                    transcripts.append((elapsed, data.get("text", "")))
                    print(f"[{elapsed:6.2f}s] transcript: {data.get('text', '')!r}")
                elif mtype == "assistant_text":
                    assistant_texts.append((elapsed, data.get("text", "")))
                    print(f"[{elapsed:6.2f}s] assistant: {data.get('text', '')!r}")
                elif mtype == "error":
                    print(f"[{elapsed:6.2f}s] SERVER ERROR {data.get('code')}: {data.get('message')}")
                    break

                if states and states[-1][1] == "idle" and audio_chunks > 0:
                    break

        except asyncio.TimeoutError:
            print("\nTimeout waiting for response.")

    total = time.perf_counter() - start
    print("\n=== Results ===")
    print(f"State transitions: {states}")
    print(f"Transcripts: {transcripts}")
    print(f"Assistant texts: {assistant_texts}")
    print(f"TTS chunks: {audio_chunks} ({audio_bytes} bytes)")
    if first_audio_time:
        print(f"First audio chunk: {first_audio_time:.2f}s")
    print(f"Total time: {total:.2f}s")

    state_names = [s[1] for s in states]
    assert "processing" in state_names, "Expected processing state"
    assert "speaking" in state_names, "Expected speaking state"
    assert audio_chunks > 0, "Expected audio chunks"
    assert assistant_texts, "Expected assistant text"

    print("\n✅ WebSocket text-input end-to-end test passed.")


if __name__ == "__main__":
    asyncio.run(main())
