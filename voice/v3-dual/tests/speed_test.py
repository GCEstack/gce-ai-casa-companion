"""Casa Voice V3 — Provider latency speed test.

Measures the real-world STT → LLM → TTS pipeline using live providers.
No server or phone needed. Costs a few API cents.
"""

import os
import sys
import time
import asyncio
import logging
from pathlib import Path

# Force UTF-8 output on Windows so emojis and LLM responses don't crash the test.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Load .env before importing providers
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

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# Test phrase — mimics a real wake + command said in one breath.
TEST_PHRASE = "wake up tell me a short joke"


async def main():
    has_groq = bool(os.environ.get("GROQ_API_KEY"))
    has_openai = bool(os.environ.get("OPENAI_API_KEY"))
    has_openrouter = bool(os.environ.get("OPENROUTER_API_KEY"))

    if has_groq and has_openai:
        print("Using Groq STT/LLM + OpenAI TTS stack.")
    elif has_openrouter:
        print("Using OpenRouter fallback stack.")
    else:
        print("No API keys found. Set GROQ_API_KEY + OPENAI_API_KEY, or OPENROUTER_API_KEY.")
        return

    print("\nLoading providers (torch, etc.)...")
    t0 = time.perf_counter()
    providers = VoiceProviders()
    print(f"Providers loaded in {(time.perf_counter() - t0):.2f}s\n")

    # ── 1. TTS: generate fake user speech so we can feed it to STT ───────────────
    print("Generating synthetic user speech via TTS...")
    t0 = time.perf_counter()
    speech_chunks = []
    async for chunk in providers.tts.synthesize_stream(TEST_PHRASE, character="default", mode="default"):
        speech_chunks.append(chunk)
    speech_audio = b"".join(speech_chunks)
    tts_gen_time = time.perf_counter() - t0
    print(f"TTS generated {len(speech_audio)} bytes of 'user speech' in {tts_gen_time:.2f}s\n")

    # ── 2. STT: transcribe the synthetic speech ──────────────────────────────────
    print("Running STT on synthetic speech...")
    t0 = time.perf_counter()
    transcript = await providers.stt.transcribe(speech_audio)
    stt_time = time.perf_counter() - t0
    print(f"STT took {stt_time:.2f}s -> '{transcript}'\n")

    if not transcript:
        print("STT returned empty. Cannot continue speed test.")
        return

    # Strip wake phrase to match what the session manager would send to LLM
    transcript_clean = providers.commands.classifier.strip_wake_phrase(transcript)
    print(f"After wake-phrase strip: '{transcript_clean}'\n")

    # ── 3. LLM: generate a response ──────────────────────────────────────────────
    print("Running LLM...")
    t0 = time.perf_counter()
    from casa_voice.sessions import VoiceSession

    # Build a minimal session just to call its LLM helper
    session = VoiceSession("speed-test", providers)
    response = await session._call_llm(transcript_clean or transcript)
    llm_time = time.perf_counter() - t0
    print(f"LLM took {llm_time:.2f}s")
    safe_response = response[:120].encode("ascii", "ignore").decode("ascii")
    print(f"Response preview: {safe_response}...\n")

    if not response:
        print("LLM returned empty. Cannot continue speed test.")
        return

    # ── 4. TTS: stream the response and time first byte + total ──────────────────
    print("Streaming TTS response...")
    t0 = time.perf_counter()
    first_byte_time = None
    total_bytes = 0
    async for chunk in providers.tts.synthesize_stream(response, character="default", mode="default"):
        if first_byte_time is None:
            first_byte_time = time.perf_counter() - t0
        total_bytes += len(chunk)
    tts_total_time = time.perf_counter() - t0
    print(f"TTS first byte after {first_byte_time:.2f}s")
    print(f"TTS total {total_bytes} bytes in {tts_total_time:.2f}s\n")

    # ── Summary ──────────────────────────────────────────────────────────────────
    pipeline_time = stt_time + llm_time + (first_byte_time or 0)
    stt_name = type(providers.stt).__name__
    llm_name = type(providers.llm).__name__ if providers.llm else "OpenRouterChat"
    tts_name = type(providers.tts).__name__
    stack = f"{stt_name} + {llm_name} + {tts_name}"
    print("══════════════════════════════════════════════════════════")
    print(f" SPEED TEST SUMMARY ({stack})")
    print("══════════════════════════════════════════════════════════")
    print(f"  STT:            {stt_time:.2f}s")
    print(f"  LLM:            {llm_time:.2f}s")
    print(f"  TTS first byte: {first_byte_time:.2f}s")
    print(f"  TTS full:       {tts_total_time:.2f}s")
    print(f"  ────────────────────────────────────────")
    print(f"  Wake → speech:  ~{pipeline_time:.2f}s")
    print("══════════════════════════════════════════════════════════")

    # Cleanup httpx clients
    await providers.stt.client.aclose()
    await providers.tts.client.aclose()
    if providers.llm:
        await providers.llm.client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
