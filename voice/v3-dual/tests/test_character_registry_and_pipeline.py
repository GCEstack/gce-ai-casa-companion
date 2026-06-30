"""Validate every frontend character has backend voice mapping + assets, then
run a mocked WebSocket text-input pipeline for each character locally.

This test does NOT hit real STT/LLM/TTS providers; it proves the wiring from
frontend registry → backend voice router → WebSocket response is correct for
all characters.
"""
import os
import re
import sys
from pathlib import Path

import pytest

# Prevent main.py from loading the project's .env file during tests.
os.environ["CASA_ENV_FILE"] = "/nonexistent/casa-env-file"
os.environ.setdefault("GROQ_API_KEY", "dummy-groq-key")
os.environ.setdefault("OPENAI_API_KEY", "dummy-openai-key")
os.environ.setdefault("VOICE_SERVER_API_KEY", "test-admin-token")
os.environ.pop("SUPABASE_URL", None)
os.environ.pop("SUPABASE_SERVICE_KEY", None)
os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)

WORKTREE_ROOT = Path.home() / ".config" / "superpowers" / "worktrees" / "casa-companion" / "phone-mic-pairing"
FRONTEND_SRC = WORKTREE_ROOT / "web-revamp" / "src" / "lib"
FRONTEND_PUBLIC = WORKTREE_ROOT / "web-revamp" / "public"
BACKEND_ROOT = Path(__file__).resolve().parent.parent


def parse_frontend_characters():
    text = (FRONTEND_SRC / "characters.ts").read_text(encoding="utf-8")
    records = []
    for m in re.finditer(r"slug:\s*'([^']+)'", text):
        start = m.start()
        chunk = text[start:start + 900]
        rec = {"slug": m.group(1)}
        for field in ("name", "portrait", "videoSrc", "voiceIntro"):
            fm = re.search(rf"{field}:\s*'([^']+)'", chunk)
            rec[field] = fm.group(1) if fm else None
        records.append(rec)
    return records


def parse_frontend_configs():
    text = (FRONTEND_SRC / "characterConfig.ts").read_text(encoding="utf-8")
    slugs = re.findall(r"^\s+([a-z_][a-z0-9_]*):\s*\{", text, flags=re.MULTILINE)
    voices = {}
    for slug in slugs:
        block_match = re.search(
            rf"{re.escape(slug)}:\s*{{.*?voice:\s*[\"']([^\"']+)[\"']",
            text,
            re.DOTALL,
        )
        voices[slug] = block_match.group(1) if block_match else None
    return set(slugs), voices


def parse_backend_voices():
    path = BACKEND_ROOT / "src" / "casa_voice" / "providers" / "character_router.py"
    text = path.read_text(encoding="utf-8")
    match = re.search(r"GEMINI_VOICES:\s*Dict\[str,\s*str\]\s*=\s*\{(.*?)\}", text, re.DOTALL)
    assert match, "GEMINI_VOICES not found in character_router.py"
    mapping = {}
    for line in match.group(1).splitlines():
        m = re.search(r'"([^"]+)":\s*"([^"]+)"', line)
        if m:
            mapping[m.group(1)] = m.group(2)
    return mapping


@pytest.fixture
def characters():
    return parse_frontend_characters()


@pytest.fixture
def backend_voices():
    return parse_backend_voices()


@pytest.fixture
def frontend_slugs_and_voices():
    return parse_frontend_configs()


def test_all_characters_have_backend_voice(characters, backend_voices):
    missing = [c["slug"] for c in characters if c["slug"] not in backend_voices]
    assert not missing, f"Missing backend GEMINI_VOICES for: {missing}"


def test_all_characters_have_frontend_config(characters, frontend_slugs_and_voices):
    slugs, voices = frontend_slugs_and_voices
    missing_config = [c["slug"] for c in characters if c["slug"] not in slugs]
    missing_voice = [c["slug"] for c in characters if not voices.get(c["slug"])]
    assert not missing_config, f"Missing frontend characterConfig for: {missing_config}"
    assert not missing_voice, f"Missing frontend voice for: {missing_voice}"


def test_all_character_assets_exist(characters):
    errors = []
    for rec in characters:
        slug = rec["slug"]
        for field, subpath in (
            ("portrait", rec.get("portrait")),
            ("videoSrc", rec.get("videoSrc")),
            ("voiceIntro", rec.get("voiceIntro")),
        ):
            if not subpath:
                errors.append(f"{slug}: missing {field}")
                continue
            full = FRONTEND_PUBLIC / subpath.lstrip("/")
            if not full.exists():
                errors.append(f"{slug}: {field} asset not found at {full}")
    assert not errors, "Missing character assets:\n" + "\n".join(errors)


@pytest.fixture
def client():
    from main import app

    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c


async def _fake_llm_chat(*args, **kwargs):
    return "Hi, this is a mocked response."


async def _fake_llm_chat_stream(*args, **kwargs):
    yield "Hi, this is a mocked response."


async def _fake_tts_stream(text, character="default", mode="default"):
    # 0.1s of silence-ish 16-bit PCM at 16kHz mono
    yield b"\x00\x00" * 1600


@pytest.mark.skip(reason="WebSocket pipeline deprecated in favor of HTTP text-in/audio-out flow")
@pytest.mark.anyio
async def test_text_pipeline_for_every_character(client, characters):
    providers = client.app.state.providers
    providers.llm.chat = _fake_llm_chat
    providers.llm.chat_stream = _fake_llm_chat_stream
    providers.tts.synthesize_stream = _fake_tts_stream

    failures = []
    for rec in characters:
        character = rec["slug"]
        import json
        import secrets

        session_id = f"regtest-{secrets.token_hex(4)}"
        device_id = f"regtest-{character}-{secrets.token_hex(3)}"
        uri = f"/ws/voice?device_type=audio&device_id={device_id}&session_id={session_id}"

        got_states = []
        got_text = []
        got_audio = 0

        try:
            with client.websocket_connect(uri) as ws:
                ws.send_json({"type": "config_change", "character": character, "mode": "default"})
                ws.send_json({"type": "text_input", "text": "Say hi."})

                for _ in range(200):
                    msg = ws.receive()
                    # starlette TestClient returns ASGI event dicts.
                    if isinstance(msg, dict):
                        if msg.get("type") == "websocket.disconnect":
                            break
                        if "bytes" in msg and msg["bytes"]:
                            got_audio += len(msg["bytes"])
                            continue
                        if "text" not in msg:
                            continue
                        data = json.loads(msg["text"])
                    elif isinstance(msg, bytes):
                        got_audio += len(msg)
                        continue
                    elif isinstance(msg, str):
                        data = json.loads(msg)
                    else:
                        continue

                    mtype = data.get("type")
                    if mtype == "state_change":
                        got_states.append(data.get("state"))
                    elif mtype == "assistant_text":
                        got_text.append(data.get("text", ""))
                    elif mtype == "error":
                        raise RuntimeError(f"server error: {data}")

                    if got_states and got_states[-1] == "idle" and got_audio > 0:
                        break
                else:
                    failures.append((character, f"loop exhausted; states={got_states} audio={got_audio}"))
                    continue
        except Exception as e:
            failures.append((character, f"{type(e).__name__}: {e}"))
            continue

        if not got_text or got_audio == 0:
            failures.append((character, f"no text/audio; states={got_states} audio={got_audio}"))

    assert not failures, "Pipeline failures:\n" + "\n".join(f"  {c}: {e}" for c, e in failures)
