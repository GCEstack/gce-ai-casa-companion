"""
Conftest for Casa Companion tests.

Usage:
  1. Start server:  uvicorn server:app --reload --port 8000
  2. Run tests:     pytest tests/ -v
  3. Run by section: pytest tests/ -v -k "TestSmoke"
                     pytest tests/ -v -k "TestConversationFlow"
                     pytest tests/ -v -k "TestRegression"
"""
import httpx
import pytest

BASE = "http://127.0.0.1:8000"


@pytest.fixture(scope="session", autouse=True)
def check_server_running():
    """Fail fast if local server isn't running."""
    try:
        r = httpx.get(f"{BASE}/health", timeout=5)
        assert r.status_code == 200
    except (httpx.ConnectError, httpx.ConnectTimeout):
        pytest.exit(
            "Server not running. Start it first:\n"
            "  uvicorn server:app --reload --port 8000",
            returncode=1
        )
