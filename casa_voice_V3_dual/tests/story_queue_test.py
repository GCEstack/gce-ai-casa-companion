"""Casa Voice V3 — Story queue speed test.

Simulates a story-mode session:
  1. Kid shares interests (triggers echo + background story pre-generation).
  2. Kid asks "what happens next?" — should be answered instantly from the queue.
  3. Kid asks again — should still be instant if the queue was topped up.
"""

import os
import sys
import time
import asyncio
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
        print(f"Loaded env from {candidate}")
        break

sys.path.insert(0, str(_project_root / "src"))
from casa_voice.providers import VoiceProviders
from casa_voice.sessions import VoiceSession
from casa_voice.protocol import MessageType


async def wait_for_queue(session, min_size: int = 1, timeout: float = 15.0):
    """Poll until the story queue has at least min_size segments."""
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        if session._story_queue.size() >= min_size:
            return True
        await asyncio.sleep(0.2)
    return False


async def speak_and_time(session, transcript: str):
    """Feed a transcript into the session and measure time to first audio."""
    captured = []
    original_broadcast = session._broadcast

    async def capturing_broadcast(msg):
        captured.append({"t": time.perf_counter(), "msg": msg})

    session._broadcast = capturing_broadcast

    start = time.perf_counter()

    # Directly call the routing helpers the main loop would use.
    trigger = session.providers.commands.trigger_responder.match(transcript)
    echo = None if trigger else session.providers.commands.echo_responder.match(transcript)

    if echo and session.mode == "story":
        await session._echo_and_learn(transcript, echo)
    elif session.mode == "story" and session._story_queue.is_continuation(transcript):
        segment = session._story_queue.next()
        if segment:
            session._conversation_history.append({"role": "user", "content": transcript})
            session._conversation_history.append({"role": "assistant", "content": segment})
            if session.providers.llm:
                asyncio.create_task(session._story_queue.prefill(session._interests))
            await session._speak(segment)
    else:
        await session._process_and_speak(transcript)

    elapsed = time.perf_counter() - start

    first_audio = None
    assistant_text_time = None
    assistant_text = ""
    for item in captured:
        msg = item["msg"]
        rel = item["t"] - start
        if msg.type == MessageType.ASSISTANT_TEXT and assistant_text_time is None:
            assistant_text_time = rel
            assistant_text = msg.payload.get("text", "")[:80]
        if msg.type == MessageType.TTS_CHUNK and first_audio is None:
            first_audio = rel

    session._broadcast = original_broadcast
    return {
        "transcript": transcript,
        "text_ready": assistant_text_time,
        "audio_ready": first_audio,
        "total": elapsed,
        "preview": assistant_text,
    }


async def main():
    print("\nLoading providers...")
    t0 = time.perf_counter()
    providers = VoiceProviders()
    print(f"Providers loaded in {(time.perf_counter() - t0):.2f}s\n")

    session = VoiceSession(
        session_id="story-queue-test",
        providers=providers,
        character="default",
        mode="story",
    )

    print("1. Kid shares interests...")
    r1 = await speak_and_time(session, "I love dinosaurs and spaceships.")
    print(f"   echo audio: {r1['audio_ready']:.2f}s  |  queue size: {session._story_queue.size()}")

    print("\n2. Waiting for story queue to prefill...")
    ready = await wait_for_queue(session, min_size=1, timeout=20.0)
    print(f"   queue ready: {ready}  |  queue size: {session._story_queue.size()}")

    if not ready:
        print("Queue did not prefill in time. Aborting.")
        return

    print("\n3. Kid asks 'what happens next?' (should be instant from queue)...")
    r2 = await speak_and_time(session, "What happens next?")
    print(f"   text ready: {r2['text_ready']:.2f}s  |  audio ready: {r2['audio_ready']:.2f}s  |  total: {r2['total']:.2f}s")
    print(f"   preview: {r2['preview']}...")

    # Give the background top-up a moment, then ask again.
    await asyncio.sleep(2.0)
    print("\n4. Kid asks again (queue should be topped up)...")
    r3 = await speak_and_time(session, "And then?")
    print(f"   text ready: {r3['text_ready']:.2f}s  |  audio ready: {r3['audio_ready']:.2f}s  |  total: {r3['total']:.2f}s")
    print(f"   preview: {r3['preview']}...")

    # Cleanup
    await providers.stt.client.aclose()
    await providers.tts.client.aclose()
    if providers.llm:
        await providers.llm.client.aclose()

    print("\n" + "═" * 80)
    print("Story queue test complete.")
    print("═" * 80)


if __name__ == "__main__":
    asyncio.run(main())
