"""Phone-as-parent-microphone pairing manager.

A kid-side session creates a short-lived pairing code. A parent phone joins by
opening the realtime WebSocket with the pairing's join token and session id.

Two implementations are provided:
  - PairingManager: in-memory (suitable for single-instance deployments).
  - RedisPairingManager: Redis-backed (survives redeploys, works across replicas).
"""

import asyncio
import json
import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class Pairing:
    """Represents a single phone-mic pairing."""

    code: str
    session_id: str
    join_token: str
    character: str
    mode: str
    created_at: datetime
    expires_at: datetime


class PairingManager:
    """Creates and validates 6-character pairing codes with a fixed TTL.

    State is kept in memory, which is sufficient for the current Fly.io
    deployment (`min_machines_running = 1`). Pairings expire automatically
    and are removed on the next access or explicit cleanup.
    """

    _ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    _CODE_LENGTH = 6
    _TTL_SECONDS = 600  # 10 minutes

    def __init__(self) -> None:
        self._pairings: Dict[str, Pairing] = {}
        self._code_by_token: Dict[str, str] = {}
        self._code_by_session_id: Dict[str, str] = {}
        self._lock = asyncio.Lock()

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _generate_code(self) -> str:
        return "".join(secrets.choice(self._ALPHABET) for _ in range(self._CODE_LENGTH))

    def _generate_session_id(self) -> str:
        return f"pair-{secrets.token_urlsafe(12)}"

    def _generate_token(self) -> str:
        return secrets.token_urlsafe(24)

    def _is_expired(self, pairing: Pairing) -> bool:
        return self._now() >= pairing.expires_at

    def _get_unlocked(self, code: str) -> Optional[Pairing]:
        """Return a pairing by code, removing it if expired.

        Must be called while holding ``self._lock``.
        """
        pairing = self._pairings.get(code)
        if not pairing:
            return None
        if self._is_expired(pairing):
            self._pairings.pop(code, None)
            self._code_by_token.pop(pairing.join_token, None)
            self._code_by_session_id.pop(pairing.session_id, None)
            return None
        return pairing

    async def cleanup(self) -> int:
        """Remove all expired pairings and return the number removed."""
        async with self._lock:
            expired_codes = [
                code for code, pairing in self._pairings.items() if self._is_expired(pairing)
            ]
            for code in expired_codes:
                pairing = self._pairings.pop(code, None)
                if pairing:
                    self._code_by_token.pop(pairing.join_token, None)
                    self._code_by_session_id.pop(pairing.session_id, None)
                    logger.info(f"[PairingManager] Expired pairing {code} cleaned up")
            return len(expired_codes)

    async def create(
        self,
        character: str = "default",
        mode: str = "default",
    ) -> Pairing:
        """Create a new pairing and return it."""
        async with self._lock:
            # Avoid collisions; with 6 chars from a 32-char alphabet the
            # probability is negligible, but we still guard against it.
            for _ in range(10):
                code = self._generate_code()
                if code not in self._pairings:
                    break
            else:
                raise RuntimeError("Could not generate a unique pairing code")

            session_id = self._generate_session_id()
            token = self._generate_token()
            created_at = self._now()
            expires_at = created_at + timedelta(seconds=self._TTL_SECONDS)

            pairing = Pairing(
                code=code,
                session_id=session_id,
                join_token=token,
                character=character,
                mode=mode,
                created_at=created_at,
                expires_at=expires_at,
            )
            self._pairings[code] = pairing
            self._code_by_token[token] = code
            self._code_by_session_id[session_id] = code
            logger.info(
                f"[PairingManager] Created pairing {code} for session {session_id} "
                f"(character={character}, mode={mode})"
            )
            return pairing

    async def get(self, code: str) -> Optional[Pairing]:
        """Look up a pairing by code, cleaning up expired entries."""
        async with self._lock:
            return self._get_unlocked(code)

    async def get_by_token(self, token: str) -> Optional[Pairing]:
        """Look up a pairing by join token."""
        async with self._lock:
            code = self._code_by_token.get(token)
            if not code:
                return None
            return self._get_unlocked(code)

    async def get_by_session_id(self, session_id: str) -> Optional[Pairing]:
        """Look up a pairing by session id."""
        async with self._lock:
            code = self._code_by_session_id.get(session_id)
            if not code:
                return None
            return self._get_unlocked(code)


class RedisPairingManager:
    """Redis-backed pairing manager with TTL-based expiration.

    Works across replicas and survives server redeploys.
    """

    _ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    _CODE_LENGTH = 6
    _TTL_SECONDS = 600  # 10 minutes

    def __init__(self, redis_url: Optional[str] = None):
        import redis.asyncio as redis
        self._redis_url = redis_url or os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        self._client = redis.from_url(self._redis_url)
        self._lock = asyncio.Lock()

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _generate_code(self) -> str:
        return "".join(secrets.choice(self._ALPHABET) for _ in range(self._CODE_LENGTH))

    def _generate_session_id(self) -> str:
        return f"pair-{secrets.token_urlsafe(12)}"

    def _generate_token(self) -> str:
        return secrets.token_urlsafe(24)

    def _key_code(self, code: str) -> str:
        return f"casa:pairing:code:{code}"

    def _key_token(self, token: str) -> str:
        return f"casa:pairing:token:{token}"

    def _key_session(self, session_id: str) -> str:
        return f"casa:pairing:session:{session_id}"

    def _pairing_to_json(self, pairing: Pairing) -> str:
        return json.dumps({
            "code": pairing.code,
            "session_id": pairing.session_id,
            "join_token": pairing.join_token,
            "character": pairing.character,
            "mode": pairing.mode,
            "created_at": pairing.created_at.isoformat(),
            "expires_at": pairing.expires_at.isoformat(),
        })

    def _pairing_from_json(self, data: str) -> Pairing:
        obj = json.loads(data)
        return Pairing(
            code=obj["code"],
            session_id=obj["session_id"],
            join_token=obj["join_token"],
            character=obj["character"],
            mode=obj["mode"],
            created_at=datetime.fromisoformat(obj["created_at"]),
            expires_at=datetime.fromisoformat(obj["expires_at"]),
        )

    async def _get_unlocked(self, code: str) -> Optional[Pairing]:
        data = await self._client.get(self._key_code(code))
        if data is None:
            return None
        try:
            pairing = self._pairing_from_json(data)
        except Exception:
            await self._client.delete(self._key_code(code))
            return None
        if self._now() >= pairing.expires_at:
            await self._client.delete(self._key_code(code))
            await self._client.delete(self._key_token(pairing.join_token))
            await self._client.delete(self._key_session(pairing.session_id))
            return None
        return pairing

    async def cleanup(self) -> int:
        """Redis TTL handles expiration; this method scans for stale entries.

        For large deployments use a dedicated Redis key with expiration or a
        scheduled job. Here we just return 0 to keep the interface compatible.
        """
        return 0

    async def create(
        self,
        character: str = "default",
        mode: str = "default",
    ) -> Pairing:
        async with self._lock:
            for _ in range(10):
                code = self._generate_code()
                existing = await self._client.get(self._key_code(code))
                if existing is None:
                    break
            else:
                raise RuntimeError("Could not generate a unique pairing code")

            session_id = self._generate_session_id()
            token = self._generate_token()
            created_at = self._now()
            expires_at = created_at + timedelta(seconds=self._TTL_SECONDS)
            pairing = Pairing(
                code=code,
                session_id=session_id,
                join_token=token,
                character=character,
                mode=mode,
                created_at=created_at,
                expires_at=expires_at,
            )
            data = self._pairing_to_json(pairing)
            pipe = self._client.pipeline()
            pipe.setex(self._key_code(code), self._TTL_SECONDS, data)
            pipe.setex(self._key_token(token), self._TTL_SECONDS, code)
            pipe.setex(self._key_session(session_id), self._TTL_SECONDS, code)
            await pipe.execute()
            logger.info(
                f"[RedisPairingManager] Created pairing {code} for session {session_id} "
                f"(character={character}, mode={mode})"
            )
            return pairing

    async def get(self, code: str) -> Optional[Pairing]:
        return await self._get_unlocked(code)

    async def get_by_token(self, token: str) -> Optional[Pairing]:
        code = await self._client.get(self._key_token(token))
        if code is None:
            return None
        return await self._get_unlocked(code.decode("utf-8") if isinstance(code, bytes) else code)

    async def get_by_session_id(self, session_id: str) -> Optional[Pairing]:
        code = await self._client.get(self._key_session(session_id))
        if code is None:
            return None
        return await self._get_unlocked(code.decode("utf-8") if isinstance(code, bytes) else code)

    async def close(self):
        try:
            await self._client.close()
        except Exception as e:
            logger.warning(f"Redis pairing client close error: {e}")
