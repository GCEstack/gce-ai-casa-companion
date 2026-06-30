"""Unit tests for casa_voice.pairing.PairingManager.

Covers:
- Code generation length and character set
- TTL expiration
- Token lookup
- Session-id lookup
- Collision resistance / uniqueness
- Cleanup of expired entries
- GET /api/pairing/{code} returns the join token
"""

import asyncio
import os
import sys
from datetime import timedelta
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "src"))

import pytest

from casa_voice.pairing import PairingManager


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


@pytest.fixture
def manager():
    return PairingManager()


def _run(coro):
    """Run an async coroutine in a fresh event loop."""
    return asyncio.run(coro)


def test_code_length_and_alphabet(manager):
    async def _test():
        alphabet = set(manager._ALPHABET)
        for _ in range(20):
            pairing = await manager.create()
            assert len(pairing.code) == manager._CODE_LENGTH == 6
            assert all(ch in alphabet for ch in pairing.code)

    _run(_test())


def test_pairing_has_expected_fields(manager):
    async def _test():
        pairing = await manager.create(character="drago", mode="story")
        assert pairing.character == "drago"
        assert pairing.mode == "story"
        assert pairing.session_id.startswith("pair-")
        assert len(pairing.join_token) >= 16
        assert pairing.created_at < pairing.expires_at
        assert pairing.expires_at - pairing.created_at == timedelta(
            seconds=manager._TTL_SECONDS
        )

    _run(_test())


def test_ttl_expiration(manager):
    async def _test():
        # Force newly created pairings to be immediately expired.
        manager._TTL_SECONDS = -1
        pairing = await manager.create()

        assert await manager.get(pairing.code) is None
        assert await manager.get_by_token(pairing.join_token) is None
        assert await manager.get_by_session_id(pairing.session_id) is None

    _run(_test())


def test_token_lookup(manager):
    async def _test():
        pairing = await manager.create()
        found = await manager.get_by_token(pairing.join_token)
        assert found is pairing
        assert await manager.get_by_token("not-a-real-token") is None

    _run(_test())


def test_session_id_lookup(manager):
    async def _test():
        pairing = await manager.create()
        found = await manager.get_by_session_id(pairing.session_id)
        assert found is pairing
        assert await manager.get_by_session_id("not-a-real-session") is None

    _run(_test())


def test_collision_resistance(manager):
    async def _test():
        codes = set()
        for _ in range(100):
            pairing = await manager.create()
            assert pairing.code not in codes
            codes.add(pairing.code)
        assert len(codes) == 100

    _run(_test())


def test_cleanup_removes_expired_pairings(manager):
    async def _test():
        manager._TTL_SECONDS = -1
        expired = await manager.create()

        manager._TTL_SECONDS = 600
        valid = await manager.create()

        removed = await manager.cleanup()
        assert removed == 1

        assert await manager.get(expired.code) is None
        assert await manager.get_by_token(expired.join_token) is None
        assert await manager.get_by_session_id(expired.session_id) is None

        assert await manager.get(valid.code) is valid

    _run(_test())



@pytest.fixture(scope="module")
def client():
    """Create a TestClient for the FastAPI app."""
    from main import app

    with pytest.importorskip("fastapi.testclient").TestClient(app) as c:
        yield c


def test_get_pairing_returns_join_token(client):
    resp = client.post("/api/pairing", json={"character": "drago", "mode": "story"})
    assert resp.status_code == 200
    created = resp.json()

    resp = client.get(f"/api/pairing/{created['code']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == created["code"]
    assert data["session_id"] == created["session_id"]
    assert data["join_token"] == created["join_token"]
    assert data["character"] == "drago"
    assert data["mode"] == "story"



def test_realtime_websocket_accepts_join_token(client):
    resp = client.post("/api/pairing", json={"character": "drago", "mode": "story"})
    assert resp.status_code == 200
    created = resp.json()

    with client.websocket_connect(
        f"/ws/voice/realtime/parent-phone-1"
        f"?token={created['join_token']}"
        f"&session_id={created['session_id']}"
        f"&client_type=audio"
    ) as ws:
        # The server may send a state_change first; wait for any valid message.
        for _ in range(5):
            data = ws.receive_json()
            if data.get("type") in ("state_change", "pong"):
                return
        pytest.fail("Did not receive expected message after realtime join")
