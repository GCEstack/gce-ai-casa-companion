"""Tests for main.py input validation and admin auth."""

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


def test_health_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_admin_sessions_requires_token(client):
    resp = client.get("/api/sessions")
    assert resp.status_code == 403


def test_admin_sessions_with_valid_token(client):
    resp = client.get("/api/sessions", params={"token": "test-admin-token"})
    assert resp.status_code == 200
    assert resp.json()["sessions"] == []


def test_kill_device_rejects_invalid_id(client):
    resp = client.get(
        "/api/kill/bad id!",
        params={"token": "test-admin-token"},
    )
    assert resp.status_code == 400


def test_kill_device_not_found_valid_id(client):
    resp = client.get(
        "/api/kill/unknown-device",
        params={"token": "test-admin-token"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "not_found"


def test_tap_post_rejects_invalid_session_id(client):
    resp = client.post(
        "/api/tap",
        json={"session_id": "bad session!", "action": "wake"},
    )
    assert resp.status_code == 422


def test_tap_get_rejects_invalid_session_id(client):
    resp = client.get(
        "/api/tap",
        params={"session_id": "bad session!", "action": "wake"},
    )
    assert resp.status_code == 400


def test_events_rejects_invalid_device_id(client):
    resp = client.get(
        "/events/bad device!",
        params={"token": "test-admin-token"},
    )
    assert resp.status_code == 400


def _assert_ws_rejected(client, path: str, expected_code: int):
    """Helper: assert that a WebSocket connection is closed with the expected code."""
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(path):
            pass
    assert exc_info.value.code == expected_code


def test_websocket_rejects_invalid_token(client):
    _assert_ws_rejected(client, "/ws/voice?token=wrong", 4401)


def test_websocket_rejects_invalid_device_id(client):
    _assert_ws_rejected(
        client,
        "/ws/voice?token=test-admin-token&device_id=bad id!",
        4400,
    )


def test_websocket_rejects_invalid_session_id(client):
    _assert_ws_rejected(
        client,
        "/ws/voice?token=test-admin-token&session_id=bad session!",
        4400,
    )


def test_websocket_accepts_valid_params(client):
    with client.websocket_connect(
        "/ws/voice?token=test-admin-token&device_id=test-device-1&session_id=test-session-1"
    ) as ws:
        # Send ping and wait for pong.
        ws.send_json({"type": "ping"})
        # receive_json may return the initial state_change first; loop until pong.
        for _ in range(5):
            data = ws.receive_json()
            if data.get("type") == "pong":
                return
        pytest.fail("Did not receive pong response")
