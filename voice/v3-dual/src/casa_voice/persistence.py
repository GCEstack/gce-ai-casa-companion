"""Casa Voice V3 — Session persistence via Supabase or Redis.

Stores conversation history and session configuration per session_id.
Uses the Supabase REST API through supabase-py. Sync client calls are
offloaded to a background thread so they do not block the async event loop.

Expected table schema (create in Supabase SQL editor):

    create table if not exists voice_sessions (
        session_id text primary key,
        character text default 'default',
        mode text default 'default',
        conversation_history jsonb default '[]'::jsonb,
        kid_profile jsonb default '{}'::jsonb,
        updated_at timestamptz default now()
    );

    -- Optional: enable RLS if you add per-user sessions later.

Run scripts/create_supabase_table.py (or the SQL it prints) to create the table.
"""

import json
import os
import asyncio
import logging
from typing import Any, Dict, List, Optional

from supabase import create_client

logger = logging.getLogger(__name__)


def _get_sync_client(url: Optional[str] = None, key: Optional[str] = None):
    supabase_url = url or os.environ.get("SUPABASE_URL", "")
    supabase_key = key or os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not supabase_url or not supabase_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return create_client(supabase_url, supabase_key)


class SessionStore:
    """Persistent store for voice session history and config."""

    def __init__(
        self,
        url: Optional[str] = None,
        key: Optional[str] = None,
        table: str = "voice_sessions",
    ):
        self._client = _get_sync_client(url, key)
        self._table = table

    async def load(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load a session record. Returns None if not found."""
        try:
            result = await asyncio.to_thread(
                lambda: self._client.table(self._table)
                .select("*")
                .eq("session_id", session_id)
                .limit(1)
                .execute()
            )
            data = result.data
            if data:
                return data[0]
            return None
        except Exception as e:
            logger.error(f"Failed to load session {session_id}: {e}", exc_info=True)
            return None

    async def save(
        self,
        session_id: str,
        conversation_history: List[Dict[str, str]],
        character: str = "default",
        mode: str = "default",
        kid_profile: Optional[Dict[str, Any]] = None,
    ):
        """Upsert session record with latest history, config, and learned profile."""
        try:
            payload = {
                "session_id": session_id,
                "character": character,
                "mode": mode,
                "conversation_history": conversation_history,
                "updated_at": "now()",
            }
            if kid_profile is not None:
                payload["kid_profile"] = kid_profile
            await asyncio.to_thread(
                lambda: self._client.table(self._table)
                .upsert(payload, on_conflict="session_id")
                .execute()
            )
            logger.info(f"Saved session {session_id} ({len(conversation_history)} turns)")
        except Exception as e:
            logger.error(f"Failed to save session {session_id}: {e}", exc_info=True)

    async def delete(self, session_id: str):
        """Delete a session record."""
        try:
            await asyncio.to_thread(
                lambda: self._client.table(self._table)
                .delete()
                .eq("session_id", session_id)
                .execute()
            )
            logger.info(f"Deleted session {session_id}")
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}", exc_info=True)


class RedisSessionStore:
    """Redis-backed session store for fast persistence and horizontal scaling.

    Stores conversation history, character, mode, and kid_profile as JSON.
    Does NOT store ephemeral audio buffers or WebSocket handles.
    """

    def __init__(self, redis_url: Optional[str] = None, ttl_seconds: int = 7 * 24 * 60 * 60):
        import redis.asyncio as redis
        self._redis_url = redis_url or os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        self._client = redis.from_url(self._redis_url)
        self._ttl = ttl_seconds

    def _key(self, session_id: str) -> str:
        return f"casa:session:{session_id}"

    async def load(self, session_id: str) -> Optional[Dict[str, Any]]:
        try:
            data = await self._client.get(self._key(session_id))
            if data is None:
                return None
            record = json.loads(data)
            logger.info(f"Loaded session {session_id} from Redis ({len(record.get('conversation_history', []))} turns)")
            return record
        except Exception as e:
            logger.error(f"Failed to load session {session_id} from Redis: {e}", exc_info=True)
            return None

    async def save(
        self,
        session_id: str,
        conversation_history: List[Dict[str, str]],
        character: str = "default",
        mode: str = "default",
        kid_profile: Optional[Dict[str, Any]] = None,
    ):
        try:
            payload = {
                "session_id": session_id,
                "character": character,
                "mode": mode,
                "conversation_history": conversation_history,
            }
            if kid_profile is not None:
                payload["kid_profile"] = kid_profile
            await self._client.setex(self._key(session_id), self._ttl, json.dumps(payload))
            logger.info(f"Saved session {session_id} to Redis ({len(conversation_history)} turns)")
        except Exception as e:
            logger.error(f"Failed to save session {session_id} to Redis: {e}", exc_info=True)

    async def delete(self, session_id: str):
        try:
            await self._client.delete(self._key(session_id))
            logger.info(f"Deleted session {session_id} from Redis")
        except Exception as e:
            logger.error(f"Failed to delete session {session_id} from Redis: {e}", exc_info=True)

    async def close(self):
        try:
            await self._client.close()
        except Exception as e:
            logger.warning(f"Redis client close error: {e}")
