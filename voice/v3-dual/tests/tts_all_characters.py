"""Smoke-test backend TTS for every frontend character via /api/tts.

This verifies that each character maps to a working backend TTS voice and that
the endpoint returns a valid WAV container. It does not exercise the LLM/STT
pipeline, so it is safe to run against the live Fly backend.

Run:
    cd voice/v3-dual
    python tests/tts_all_characters.py
"""
import asyncio
import os
import re
import sys
import time
from pathlib import Path

import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_URL = os.environ.get("BACKEND_URL", "https://casa-voice-agent.fly.dev")
WORKTREE_ROOT = Path.home() / ".config" / "superpowers" / "worktrees" / "casa-companion" / "phone-mic-pairing"
CHARACTERS_FILE = WORKTREE_ROOT / "web-revamp" / "src" / "lib" / "characters.ts"


def parse_slugs():
    text = CHARACTERS_FILE.read_text(encoding="utf-8")
    return re.findall(r"slug:\s*'([^']+)'", text)


async def test_one(client: httpx.AsyncClient, character: str) -> dict:
    payload = {
        "text": f"Hello, I am {character.title()}.",
        "character": character,
        "mode": "default",
    }
    start = time.perf_counter()
    try:
        resp = await client.post(
            f"{BACKEND_URL}/api/tts",
            json=payload,
            timeout=60.0,
        )
        elapsed = time.perf_counter() - start
        if resp.status_code != 200:
            return {"character": character, "ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}", "latency": elapsed}
        data = resp.content
        if not data.startswith(b"RIFF") or data[8:12] != b"WAVE":
            return {"character": character, "ok": False, "error": "invalid WAV header", "latency": elapsed}
        return {"character": character, "ok": True, "error": None, "latency": elapsed, "bytes": len(data)}
    except Exception as e:
        elapsed = time.perf_counter() - start
        return {"character": character, "ok": False, "error": f"{type(e).__name__}: {e}", "latency": elapsed}


async def main():
    characters = parse_slugs()
    print(f"Testing /api/tts for {len(characters)} characters against {BACKEND_URL}\n")

    results = []
    async with httpx.AsyncClient() as client:
        for i, character in enumerate(characters, 1):
            print(f"[{i}/{len(characters)}] {character} ...", end=" ", flush=True)
            result = await test_one(client, character)
            results.append(result)
            status = "✅" if result["ok"] else "❌"
            extra = f"{result['bytes']} bytes" if result.get("bytes") else result["error"]
            print(f"{status} {result['latency']:.2f}s {extra}")
            await asyncio.sleep(0.2)

    ok = sum(1 for r in results if r["ok"])
    failed = [r for r in results if not r["ok"]]
    print(f"\n=== Summary ===")
    print(f"Passed: {ok}/{len(results)}")
    if failed:
        print(f"Failed: {len(failed)}")
        for r in failed:
            print(f"  - {r['character']}: {r['error']}")
        sys.exit(1)
    print("\n✅ Backend TTS voice mapping works for all characters.")


if __name__ == "__main__":
    asyncio.run(main())
