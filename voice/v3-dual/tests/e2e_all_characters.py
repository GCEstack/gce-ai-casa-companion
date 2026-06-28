"""Character registry validation + end-to-end text-input test loop.

Validates that every frontend character has:
  - a backend TTS voice mapping
  - a portrait image and video file in the deployed worktree
  - a frontend characterConfig entry

Then sends a typed message to the Fly backend for each character and verifies
assistant text + TTS audio come back through the WebSocket.

Run:
    cd voice/v3-dual
    python tests/e2e_all_characters.py

Environment:
    VOICE_SERVER_URL defaults to wss://casa-voice-agent.fly.dev
"""
import asyncio
import json
import os
import re
import secrets
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from dotenv import load_dotenv

_project_root = Path(__file__).resolve().parent.parent
_possible_env_files = [_project_root / ".env"]
for candidate in _possible_env_files:
    if candidate.exists():
        load_dotenv(dotenv_path=candidate, override=False)
        break

import websockets

URL = os.environ.get("VOICE_SERVER_URL", "wss://casa-voice-agent.fly.dev/ws/voice")
if not URL.startswith(("ws://", "wss://")):
    URL = "wss://casa-voice-agent.fly.dev/ws/voice"

TOKEN = os.environ.get("VOICE_SERVER_API_KEY")
PROMPT = "Say hi and tell me your name in one short sentence."

# Directories
BACKEND_ROOT = Path(__file__).resolve().parent.parent
WORKTREE_ROOT = Path.home() / ".config" / "superpowers" / "worktrees" / "casa-companion" / "phone-mic-pairing"
FRONTEND_SRC = WORKTREE_ROOT / "web-revamp" / "src" / "lib"
FRONTEND_PUBLIC = WORKTREE_ROOT / "web-revamp" / "public"


def parse_frontend_characters():
    """Extract character records from characters.ts."""
    text = (FRONTEND_SRC / "characters.ts").read_text(encoding="utf-8")
    # Match each object in the array: { slug: '...', name: '...', portrait: '...', videoSrc: '...', ... }
    records = []
    for m in re.finditer(r"slug:\s*'([^']+)'", text):
        start = m.start()
        # grab a generous chunk after the slug to find related fields
        chunk = text[start:start + 800]
        rec = {"slug": m.group(1)}
        for field in ("name", "portrait", "videoSrc"):
            fm = re.search(rf"{field}:\s*'([^']+)'", chunk)
            rec[field] = fm.group(1) if fm else None
        records.append(rec)
    return records


def parse_frontend_configs():
    """Extract frontend characterConfig entries keyed by slug."""
    text = (FRONTEND_SRC / "characterConfig.ts").read_text(encoding="utf-8")
    slugs = re.findall(r"^\s+([a-z_][a-z0-9_]*):\s*\{", text, flags=re.MULTILINE)
    voices = {}
    for slug in slugs:
        # find voice field inside that block
        block_match = re.search(rf"{re.escape(slug)}:\s*\{{.*?voice:\s*'([^']+)'", text, re.DOTALL)
        voices[slug] = block_match.group(1) if block_match else None
    return set(slugs), voices


def parse_backend_voices():
    """Extract GEMINI_VOICES mapping from the backend character router."""
    path = BACKEND_ROOT / "src" / "casa_voice" / "providers" / "character_router.py"
    text = path.read_text(encoding="utf-8")
    match = re.search(r"GEMINI_VOICES:\s*Dict\[str,\s*str\]\s*=\s*\{(.*?)\}", text, re.DOTALL)
    if not match:
        raise RuntimeError("Could not find GEMINI_VOICES in character_router.py")
    body = match.group(1)
    mapping = {}
    for line in body.splitlines():
        m = re.search(r'"([^"]+)":\s*"([^"]+)"', line)
        if m:
            mapping[m.group(1)] = m.group(2)
    return mapping


def validate_registry(characters, backend_voices, frontend_slugs, frontend_voices):
    """Cross-check frontend characters against backend voices and local assets."""
    errors = []
    for rec in characters:
        slug = rec["slug"]
        name = rec.get("name") or slug

        if slug not in backend_voices:
            errors.append(f"{slug}: missing backend GEMINI_VOICES mapping")
        if slug not in frontend_slugs:
            errors.append(f"{slug}: missing frontend characterConfig entry")
        if not frontend_voices.get(slug):
            errors.append(f"{slug}: missing frontend voice in characterConfig")

        portrait = rec.get("portrait")
        if not portrait:
            errors.append(f"{slug}: missing portrait path")
        else:
            portrait_path = FRONTEND_PUBLIC / portrait.lstrip("/")
            if not portrait_path.exists():
                errors.append(f"{slug}: portrait not found at {portrait_path}")

        video = rec.get("videoSrc")
        if not video:
            errors.append(f"{slug}: missing videoSrc path")
        else:
            video_path = FRONTEND_PUBLIC / video.lstrip("/")
            if not video_path.exists():
                errors.append(f"{slug}: video not found at {video_path}")

    return errors


async def test_character(character: str):
    """Connect, send text_input, wait for assistant_text + audio, then disconnect."""
    session_id = f"e2e-{secrets.token_hex(4)}"
    device_id = f"test-{character}-{secrets.token_hex(3)}"
    params = {
        "device_type": "audio",
        "device_id": device_id,
        "session_id": session_id,
    }
    if TOKEN:
        params["token"] = TOKEN

    uri = f"{URL}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
    start = time.perf_counter()
    states = []
    assistant_texts = []
    audio_bytes = 0
    audio_chunks = 0
    first_audio_time = None
    error = None

    try:
        async with websockets.connect(
            uri,
            open_timeout=30,
            close_timeout=5,
            ping_interval=None,  # don't trip on a busy event loop
        ) as ws:
            await ws.send(json.dumps({"type": "config_change", "character": character, "mode": "default"}))
            await asyncio.sleep(0.2)
            await ws.send(json.dumps({"type": "text_input", "text": PROMPT}))

            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=120.0)
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
                    states.append(data.get("state"))
                elif mtype == "assistant_text":
                    assistant_texts.append(data.get("text", ""))
                elif mtype == "error":
                    error = f"{data.get('code')}: {data.get('message')}"
                    break

                if states and states[-1] == "idle" and audio_chunks > 0:
                    break
    except asyncio.TimeoutError:
        error = "timeout"
    except Exception as e:
        error = f"{type(e).__name__}: {e}"

    total = time.perf_counter() - start
    return {
        "character": character,
        "ok": error is None and audio_chunks > 0 and assistant_texts,
        "error": error,
        "states": states,
        "assistant": " ".join(assistant_texts).strip(),
        "audio_chunks": audio_chunks,
        "audio_bytes": audio_bytes,
        "first_audio_s": first_audio_time,
        "total_s": total,
    }


async def main():
    characters = parse_frontend_characters()
    frontend_slugs, frontend_voices = parse_frontend_configs()
    backend_voices = parse_backend_voices()

    print(f"Found {len(characters)} frontend characters")
    print(f"Backend GEMINI_VOICES mappings: {len(backend_voices)}")
    print(f"Frontend characterConfig entries: {len(frontend_slugs)}\n")

    registry_errors = validate_registry(characters, backend_voices, frontend_slugs, frontend_voices)
    if registry_errors:
        print("=== Registry validation failures ===")
        for err in registry_errors:
            print(f"  ❌ {err}")
    else:
        print("✅ Registry validation passed (images, videos, backend voice, frontend config)")

    print(f"\nRunning text-input loop against {URL}\n")
    results = []
    for i, rec in enumerate(characters, 1):
        character = rec["slug"]
        print(f"[{i}/{len(characters)}] {character} ...", end=" ", flush=True)
        result = await test_character(character)
        results.append(result)
        status = "✅" if result["ok"] else "❌"
        print(
            f"{status} {result['total_s']:.1f}s "
            f"audio={result['audio_chunks']}ch/{result['audio_bytes']}B "
            f"text={result['assistant'][:55]!r}{'...' if len(result['assistant']) > 55 else ''}"
        )
        if result["error"]:
            print(f"     error: {result['error']}")
        # small breather between characters so the single-machine backend can GC
        await asyncio.sleep(0.5)

    ok_count = sum(1 for r in results if r["ok"])
    fail_count = len(results) - ok_count
    print(f"\n=== Summary ===")
    print(f"Registry errors: {len(registry_errors)}")
    print(f"Passed e2e: {ok_count}/{len(results)}")
    print(f"Failed e2e: {fail_count}/{len(results)}")

    failures = [r for r in results if not r["ok"]]
    if failures:
        print("\nFailed characters:")
        for r in failures:
            print(f"  - {r['character']}: {r['error']} states={r['states']}")

    if registry_errors or failures:
        sys.exit(1)

    print("\n✅ All characters validated end-to-end through the Fly backend.")


if __name__ == "__main__":
    asyncio.run(main())
