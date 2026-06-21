"""In-memory pairing manager for phone-as-mic sessions."""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class Pairing:
    code: str
    session_id: str
    character: str
    mode: str
    join_token: str
    expires_at: float
    created_at: float = field(default_factory=time.time)


class PairingManager:
    """Short-lived pairing codes that map to a shared V3 voice session."""

    # Exclude visually confusing characters
    CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    TTL_SECONDS = 600

    def __init__(self):
        self._pairings: Dict[str, Pairing] = {}

    def create(self, character: str = "default", mode: str = "default") -> Pairing:
        for _ in range(10):
            code = "".join(secrets.choice(self.CODE_ALPHABET) for _ in range(6))
            if code not in self._pairings:
                break
        else:
            raise RuntimeError("Could not generate a unique pairing code")

        pairing = Pairing(
            code=code,
            session_id=secrets.token_urlsafe(16),
            character=character,
            mode=mode,
            join_token=secrets.token_urlsafe(24),
            expires_at=time.time() + self.TTL_SECONDS,
        )
        self._pairings[code] = pairing
        return pairing

    def _get_fresh(self, code: str) -> Optional[Pairing]:
        """Return a pairing by code, pruning it if expired."""
        pairing = self._pairings.get(code)
        if pairing is None:
            return None
        if time.time() > pairing.expires_at:
            self._pairings.pop(code, None)
            return None
        return pairing

    def get(self, code: str) -> Optional[Pairing]:
        normalized = code.upper().strip()
        return self._get_fresh(normalized)

    def get_by_token(self, token: str) -> Optional[Pairing]:
        for pairing in self._pairings.values():
            if pairing.join_token == token:
                return self._get_fresh(pairing.code)
        return None

    def get_by_session_id(self, session_id: str) -> Optional[Pairing]:
        for pairing in self._pairings.values():
            if pairing.session_id == session_id:
                return self._get_fresh(pairing.code)
        return None

    def cleanup(self):
        now = time.time()
        expired = [code for code, pairing in self._pairings.items() if now > pairing.expires_at]
        for code in expired:
            self._pairings.pop(code, None)
