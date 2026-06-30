"""Tests for the /api/tts endpoint."""

import os
import pytest
from fastapi.testclient import TestClient

# Prevent main.py from loading the project's .env file during tests.
os.environ["CASA_ENV_FILE"] = "/nonexistent/casa-env-file"

# Ensure the app can start without real API keys in tests.
os.environ.setdefault("GROQ_API_KEY", "dummy-groq-key")
os.environ.setdefault("OPENAI_API_KEY", "dummy-openai-key")
os.environ.setdefault("VOICE_SERVER_API_KEY", "test-admin-token")

# Never connect to the real Supabase during tests.
os.environ.pop("SUPABASE_URL", None)
os.environ.pop("SUPABASE_SERVICE_KEY", None)
os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)


@pytest.fixture(scope="module")
def client():
    """Create a TestClient for the FastAPI app."""
    from main import app

    with TestClient(app) as c:
        yield c


async def _fake_synthesize(fake_pcm: bytes, text: str, character: str = "default", mode: str = "default"):
    return fake_pcm


def test_tts_endpoint_returns_wav(client):
    """The endpoint should synthesize PCM and wrap it in a WAV container."""
    fake_pcm = b"\x00\x01" * 1024
    client.app.state.providers.tts.synthesize = (
        lambda text, character="default", mode="default": _fake_synthesize(fake_pcm, text, character, mode)
    )

    resp = client.post(
        "/api/tts",
        json={"text": "hello", "character": "pietro", "mode": "introduction"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert resp.content.startswith(b"RIFF")
    assert resp.content[8:12] == b"WAVE"
    # WAV header is 44 bytes; the rest should be the fake PCM payload.
    assert len(resp.content) == 44 + len(fake_pcm)


def test_tts_endpoint_returns_pcm_when_requested(client):
    """The endpoint should return raw PCM when format="pcm" is requested."""
    fake_pcm = b"\x02\x03" * 512
    client.app.state.providers.tts.synthesize = (
        lambda text, character="default", mode="default": _fake_synthesize(fake_pcm, text, character, mode)
    )

    resp = client.post(
        "/api/tts",
        json={
            "text": "hello",
            "character": "pietro",
            "mode": "introduction",
            "format": "pcm",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/L16;rate=16000;channels=1"
    assert resp.content == fake_pcm


def test_tts_endpoint_rejects_long_text(client):
    """Very long inputs should be rejected before hitting the provider."""
    resp = client.post(
        "/api/tts",
        json={"text": "x" * 4001, "character": "pietro"},
    )
    assert resp.status_code == 422
