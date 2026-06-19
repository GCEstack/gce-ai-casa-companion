"""Sentence-level LLM->TTS streaming latency test.

Measures time to first text, first audio chunk, and total time for a fresh
LLM response when STREAMING_TTS_ENABLED=1.
"""
import asyncio
import os
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

os.environ["STREAMING_TTS_ENABLED"] = "1"

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

sys.path.insert(0, str(_project_root / "src"))
from casa_voice.providers import VoiceProviders
from casa_voice.sessions import VoiceSession
from casa_voice.protocol import MessageType


async def main():
    if not os.environ.get("GROQ_API_KEY") or not os.environ.get("OPENROUTER_API_KEY"):
        print("Need GROQ_API_KEY and OPENROUTER_API_KEY in environment.")
        sys.exit(1)

    providers = VoiceProviders()
    if not hasattr(providers.llm, "chat_stream"):
        print("LLM provider does not support streaming.")
        sys.exit(1)

    session = VoiceSession(
        session_id="streaming-test",
        providers=providers,
        character="default",
        mode="default",
    )

    captured = []
    original_broadcast = session._broadcast

    async def capturing_broadcast(msg, exclude_device_id=None):
        captured.append({"t": time.perf_counter(), "msg": msg})
        # Don't actually send to avoid needing WebSocket clients.

    session._broadcast = capturing_broadcast

    prompt = "Tell me a fun fact about dinosaurs for a 6-year-old. Keep it to two sentences."
    print(f"Prompt: {prompt}\n")

    t0 = time.perf_counter()
    await session._process_and_speak(prompt)
    total = time.perf_counter() - t0

    first_text = None
    first_audio = None
    assistant_text = ""
    for item in captured:
        msg = item["msg"]
        rel = item["t"] - t0
        if msg.type == MessageType.ASSISTANT_TEXT and first_text is None:
            first_text = rel
            assistant_text = msg.payload.get("text", "")
        if msg.type == MessageType.TTS_CHUNK and first_audio is None:
            first_audio = rel

    print(f"First assistant text: {first_text:.2f}s")
    print(f"First audio chunk:    {first_audio:.2f}s")
    print(f"Total elapsed:        {total:.2f}s")
    print(f"Assistant preview:    {assistant_text[:120]!r}")

    await providers.stt.client.aclose()
    await providers.tts.client.aclose()
    await providers.llm.client.aclose()
    if providers.native_audio:
        await providers.native_audio.close()


if __name__ == "__main__":
    asyncio.run(main())
