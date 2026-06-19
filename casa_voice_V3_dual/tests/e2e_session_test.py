"""End-to-end session test — push-to-talk style trigger response.

This bypasses the browser and WebSocket layer. It uses a real VoiceSession,
feeds it PCM audio of "Tell me a joke", triggers the wake command manually,
and verifies the full state/transcript/audio flow.
"""
import asyncio
import logging
import os
import sys
import time
import wave
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)

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
from casa_voice.protocol import MessageType, CommandType, VoiceState


def pcm_to_wav(pcm: bytes, sample_rate: int = 16000) -> bytes:
    import io, struct
    out = io.BytesIO()
    out.write(b"RIFF")
    out.write(struct.pack("<I", 36 + len(pcm)))
    out.write(b"WAVE")
    out.write(b"fmt ")
    out.write(struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16))
    out.write(b"data")
    out.write(struct.pack("<I", len(pcm)))
    out.write(pcm)
    return out.getvalue()


async def synthesize_test_utterance(providers, text: str) -> bytes:
    """Use TTS to make a WAV we can feed back into STT. Circular but controlled."""
    pcm = b""
    async for chunk in providers.tts.synthesize_stream(text, character="default", mode="default"):
        pcm += chunk
    return pcm


async def main():
    if not os.environ.get("GROQ_API_KEY") or not os.environ.get("OPENROUTER_API_KEY"):
        print("Need GROQ_API_KEY and OPENROUTER_API_KEY")
        sys.exit(1)

    providers = VoiceProviders()
    session = VoiceSession(
        session_id="e2e-test",
        providers=providers,
        character="default",
        mode="default",
    )

    captured = []
    original_broadcast = session._broadcast

    async def capturing_broadcast(msg, exclude_device_id=None):
        captured.append({"t": time.perf_counter(), "msg": msg})

    session._broadcast = capturing_broadcast
    await session.start()

    # Generate a test utterance PCM using TTS (it will be cached after first run).
    print("Synthesizing test utterance PCM...")
    utterance_pcm = await synthesize_test_utterance(providers, "Tell me a joke.")
    print(f"Test utterance PCM: {len(utterance_pcm)} bytes")

    # Wait until the session is IDLE.
    for _ in range(50):
        if session.state == VoiceState.IDLE:
            break
        await asyncio.sleep(0.05)
    assert session.state == VoiceState.IDLE, f"Expected IDLE, got {session.state}"

    # Simulate push-to-talk: send WAKE command, feed audio, wait for silence.
    print("Sending WAKE command and feeding audio...")
    t0 = time.perf_counter()
    await session.handle_command(CommandType.WAKE)

    # Stream the PCM in chunks so the VAD/silence detector sees live audio.
    chunk_size = 1600  # 50ms chunks
    for i in range(0, len(utterance_pcm), chunk_size):
        await session.handle_audio(utterance_pcm[i : i + chunk_size])
        await asyncio.sleep(0.05)

    # Wait for silence-based processing to complete.
    silence_wait = session.command_silence_ms / 1000 + 0.5
    print(f"Waiting {silence_wait:.2f}s for silence detection...")
    await asyncio.sleep(silence_wait)

    # Wait for the pipeline to finish (timeout if something is broken).
    try:
        await asyncio.wait_for(
            asyncio.create_task(_wait_for_idle(session)),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        print("TIMEOUT: session did not return to IDLE")
        print("Last state:", session.state.value)
        await session.stop()
        sys.exit(1)

    total = time.perf_counter() - t0

    # Analyze captured messages.
    states = []
    transcripts = []
    assistant_texts = []
    audio_bytes = 0
    audio_chunks = 0
    first_audio_time = None

    for item in captured:
        msg = item["msg"]
        rel = item["t"] - t0
        if msg.type == MessageType.STATE_CHANGE:
            states.append((rel, msg.payload.get("state")))
        elif msg.type == MessageType.TRANSCRIPT:
            transcripts.append((rel, msg.payload.get("text", "")))
        elif msg.type == MessageType.ASSISTANT_TEXT:
            assistant_texts.append((rel, msg.payload.get("text", "")))
        elif msg.type == MessageType.TTS_CHUNK:
            audio_bytes += len(msg.binary or b"")
            audio_chunks += 1
            if first_audio_time is None:
                first_audio_time = rel

    print("\n=== Results ===")
    print(f"State transitions: {states}")
    print(f"Transcripts: {transcripts}")
    print(f"Assistant texts: {assistant_texts}")
    print(f"TTS chunks: {audio_chunks} ({audio_bytes} bytes)")
    print(f"First audio chunk: {first_audio_time:.2f}s" if first_audio_time else "First audio chunk: n/a")
    print(f"Total time: {total:.2f}s")

    # Assertions
    state_names = [s[1] for s in states]
    assert "listening" in state_names, "Expected listening state"
    assert "processing" in state_names, "Expected processing state"
    assert "speaking" in state_names, "Expected speaking state"
    assert audio_chunks > 0, "Expected audio chunks"
    assert assistant_texts, "Expected assistant text"

    print("\n✅ End-to-end session test passed.")

    await session.stop()
    await providers.stt.client.aclose()
    await providers.tts.client.aclose()
    await providers.llm.client.aclose()
    if providers.native_audio:
        await providers.native_audio.close()


async def _wait_for_idle(session):
    while session.state != VoiceState.IDLE:
        await asyncio.sleep(0.05)


if __name__ == "__main__":
    asyncio.run(main())
