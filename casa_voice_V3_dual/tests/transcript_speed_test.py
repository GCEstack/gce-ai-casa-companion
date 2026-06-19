"""Casa Voice V3 — Text-in, audio-out speed test.

Bypasses the microphone and feeds transcripts directly into a VoiceSession,
then measures how long until the assistant text appears and the first TTS
audio chunk is ready. This tests the real STT→LLM/TTS→speak pipeline without
needing a phone or wake-word.

Run:
    python tests/transcript_speed_test.py
"""

import os
import sys
import time
import asyncio
import logging
from pathlib import Path

# Force UTF-8 output on Windows
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

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# Prompts covering stories, learning/echo, triggers, and chat.
TEST_PROMPTS = [
    ("story", "Tell me a short story about a brave little dragon."),
    ("follow-up", "What happens next in the story?"),
    ("echo", "I love dinosaurs and spaceships."),
    ("joke", "Tell me a joke."),
    ("song", "Sing me a song."),
    ("chat", "Can you teach me a fun fact about the ocean?"),
    ("long", "Um, I was wondering, can you maybe tell me a really fun story about a dragon and a knight who become friends and go on adventures together?"),
    ("echo-story", "I really like story time with my turtle."),
    ("bedtime", "Goodnight."),
]


async def main():
    print("\nLoading providers (this may take a moment)...")
    t0 = time.perf_counter()
    providers = VoiceProviders()
    print(f"Providers loaded in {(time.perf_counter() - t0):.2f}s\n")

    session = VoiceSession(
        session_id="transcript-speed-test",
        providers=providers,
        character="default",
        mode="default",
    )

    # Capture every broadcast with a timestamp.
    original_broadcast = session._broadcast
    captured = []

    async def capturing_broadcast(msg):
        captured.append({"t": time.perf_counter(), "msg": msg})
        # Don't send over the network.

    session._broadcast = capturing_broadcast

    results = []

    for category, prompt in TEST_PROMPTS:
        print(f"▶ {category}: '{prompt}'")
        captured.clear()
        start = time.perf_counter()

        # Mirror the session's main-loop routing.
        trigger = providers.commands.trigger_responder.match(prompt)
        echo = None if trigger else providers.commands.echo_responder.match(prompt)

        if trigger:
            await session._process_and_speak(trigger, skip_history=True)
        elif echo:
            await session._echo_and_learn(prompt, echo)
        else:
            await session._process_and_speak(prompt)

        elapsed = time.perf_counter() - start

        # Analyze captured messages.
        assistant_text_time = None
        first_tts_time = None
        total_tts_bytes = 0
        state_changes = []
        for item in captured:
            msg = item["msg"]
            rel = item["t"] - start
            if msg.type == MessageType.ASSISTANT_TEXT and assistant_text_time is None:
                assistant_text_time = rel
            if msg.type == MessageType.TTS_CHUNK:
                if first_tts_time is None:
                    first_tts_time = rel
                if msg.binary:
                    total_tts_bytes += len(msg.binary)
            if msg.type == MessageType.STATE_CHANGE:
                state_changes.append((rel, msg.payload.get("state")))

        # Find the assistant text content.
        assistant_text = ""
        for item in captured:
            if item["msg"].type == MessageType.ASSISTANT_TEXT:
                assistant_text = item["msg"].payload.get("text", "")[:80]
                break

        results.append({
            "category": category,
            "prompt": prompt,
            "assistant_text_time": assistant_text_time,
            "first_tts_time": first_tts_time,
            "total_tts_bytes": total_tts_bytes,
            "total_time": elapsed,
            "assistant_preview": assistant_text,
        })

        print(f"  assistant text: {assistant_text_time:.2f}s  |  first audio: {first_tts_time:.2f}s  |  total: {elapsed:.2f}s")

    # Cleanup
    await providers.stt.client.aclose()
    await providers.tts.client.aclose()
    if providers.llm:
        await providers.llm.client.aclose()

    # Summary table
    print("\n" + "═" * 95)
    print(f"{'Prompt':<25} {'Text ready':<12} {'Audio ready':<12} {'Total':<10} {'Preview'}")
    print("─" * 95)
    for r in results:
        print(
            f"{r['category']:<25} "
            f"{r['assistant_text_time']:.2f}s       "
            f"{r['first_tts_time']:.2f}s        "
            f"{r['total_time']:.2f}s     "
            f"{r['assistant_preview']}..."
        )
    print("═" * 95)


if __name__ == "__main__":
    asyncio.run(main())
