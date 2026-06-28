"""Unit tests for casa_voice.pairing.PairingManager.

Covers:
- Code generation length and character set
- TTL expiration
- Token lookup
- Session-id lookup
- Collision resistance / uniqueness
- Cleanup of expired entries
"""

import asyncio
import sys
from datetime import timedelta
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "src"))

import pytest

from casa_voice.pairing import PairingManager


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
