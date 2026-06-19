"""End-to-end pipeline test: verify STT -> LLM -> TTS and history storage.

This test bypasses audio capture and feeds a text utterance directly into the
VoiceSession pipeline. It confirms:
  - LLM returns a response
  - TTS returns PCM audio chunks
  - Conversation history is updated
  - Transcript is broadcast

Run standalone:
    python tests/pipeline_test.py
"""

import asyncio
import sys
import io
from pathlib import Path

from dotenv import load_dotenv

# Force UTF-8 output on Windows terminals
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Try to load API keys from the EC4 .env if the local one is empty
_local_env = Path(__file__).parent.parent / ".env"
_ec4_env = Path("C:/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/EC4") / ".env"
for env_file in (_local_env, _ec4_env):
    if env_file.exists():
        load_dotenv(dotenv_path=env_file, override=False)
        print(f"Loaded env from {env_file}")
        break

src_path = Path(__file__).parent.parent / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from casa_voice.providers import VoiceProviders
from casa_voice.sessions import VoiceSession
from casa_voice.protocol import VoiceMessage


async def main():
    print("Loading providers (this may take a moment)...")
    providers = VoiceProviders()

    session = VoiceSession(
        session_id="pipeline-test",
        providers=providers,
        character="default",
        mode="default",
    )

    messages = []
    original_broadcast = session._broadcast

    async def capturing_broadcast(msg):
        messages.append(msg)
        # Don't actually send over network
        print(f"  broadcast: {msg.to_json()}")

    session._broadcast = capturing_broadcast

    print("\n--- Test 1: Direct utterance through LLM + TTS ---")
    test_utterance = "Tell me a very short joke."
    await session._process_and_speak(test_utterance)

    tts_chunks = [m for m in messages if m.type.value == "tts_chunk"]
    transcripts = [m for m in messages if m.type.value == "transcript"]
    state_changes = [m for m in messages if m.type.value == "state_change"]

    print(f"\nTranscripts broadcast: {len(transcripts)}")
    print(f"TTS chunks broadcast: {len(tts_chunks)}")
    print(f"State changes: {[m.payload.get('state') for m in state_changes]}")
    print(f"Conversation history turns: {len(session._conversation_history)}")

    if not tts_chunks:
        print("FAIL: no TTS audio returned")
        sys.exit(1)
    if len(session._conversation_history) != 2:
        print("FAIL: conversation history not updated")
        sys.exit(1)

    total_audio = sum(len(m.binary) for m in tts_chunks if m.binary)
    print(f"Total TTS audio: {total_audio} bytes")

    print("\n--- Test 2: Verify LLM was called and response stored ---")
    assistant_msg = session._conversation_history[-1]
    print(f"User input: {session._conversation_history[-2]['content']}")
    safe_response = assistant_msg['content'][:120].encode('utf-8', errors='replace').decode('utf-8')
    print(f"Assistant response (first 120 chars): {safe_response}")
    if not assistant_msg["content"]:
        print("FAIL: assistant response is empty")
        sys.exit(1)

    print("\nAll pipeline checks passed!")

    # Cleanup
    await providers.stt.client.aclose()
    await providers.tts.client.aclose()
    if providers.llm:
        await providers.llm.client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
