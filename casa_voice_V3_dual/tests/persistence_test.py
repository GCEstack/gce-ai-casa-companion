"""Unit tests for Supabase session persistence.

Uses a mock Supabase client so no network access is required.
"""

import asyncio
import sys
from pathlib import Path

src_path = Path(__file__).parent.parent / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from casa_voice.persistence import SessionStore


class FakeQuery:
    def __init__(self, table_name: str, rows: list):
        self.table_name = table_name
        self.rows = rows
        self._filters = []
        self._selected = []
        self._limit = None

    def select(self, cols: str):
        self._selected = cols.split(",")
        return self

    def eq(self, column: str, value):
        self._filters.append((column, value))
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def execute(self):
        result = [r for r in self.rows if all(r.get(k) == v for k, v in self._filters)]
        if self._limit:
            result = result[: self._limit]
        return type("Result", (object,), {"data": result})()


class FakeUpsertQuery:
    def __init__(self, rows: list, payload: dict, on_conflict: str):
        self.rows = rows
        self.payload = payload
        self.on_conflict = on_conflict

    def execute(self):
        existing = next(
            (r for r in self.rows if r["session_id"] == self.payload["session_id"]),
            None,
        )
        if existing:
            existing.update(self.payload)
        else:
            self.rows.append(self.payload)
        return type("Result", (object,), {"data": [self.payload]})()


class FakeDeleteQuery:
    def __init__(self, rows: list):
        self.rows = rows
        self._filters = []

    def eq(self, column: str, value):
        self._filters.append((column, value))
        return self

    def execute(self):
        self.rows[:] = [r for r in self.rows if not all(r.get(k) == v for k, v in self._filters)]
        return type("Result", (object,), {"data": []})()


class FakeTable:
    def __init__(self, rows: list):
        self.rows = rows
        self._current_query = None
        self._filters = []

    def select(self, cols: str):
        self._current_query = FakeQuery("voice_sessions", self.rows)
        return self._current_query.select(cols)

    def upsert(self, payload: dict, on_conflict: str = "session_id"):
        return FakeUpsertQuery(self.rows, payload, on_conflict)

    def delete(self):
        return FakeDeleteQuery(self.rows)


class FakeSupabase:
    def __init__(self, rows: list):
        self.rows = rows

    def table(self, name: str):
        return FakeTable(self.rows)


def _make_fake_client(rows: list):
    def _create(url, key):
        return FakeSupabase(rows)
    return _create


async def main():
    rows = []

    # Patch create_client
    import casa_voice.persistence as persistence_module
    original_create = persistence_module.create_client
    persistence_module.create_client = _make_fake_client(rows)

    try:
        store = SessionStore(url="http://fake", key="fake-key")

        # Load non-existent session
        record = await store.load("missing")
        assert record is None, "Expected None for missing session"

        # Save a session
        history = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]
        await store.save("sess-1", history, character="drago", mode="story")

        # Load it back
        record = await store.load("sess-1")
        assert record is not None, "Expected record after save"
        assert record["session_id"] == "sess-1"
        assert record["character"] == "drago"
        assert record["mode"] == "story"
        assert len(record["conversation_history"]) == 2

        # Update history
        history.append({"role": "user", "content": "Tell a story"})
        await store.save("sess-1", history, character="drago", mode="story")
        record = await store.load("sess-1")
        assert len(record["conversation_history"]) == 3

        # Delete
        await store.delete("sess-1")
        record = await store.load("sess-1")
        assert record is None, "Expected None after delete"

        print("All persistence unit tests passed!")
    finally:
        persistence_module.create_client = original_create


if __name__ == "__main__":
    asyncio.run(main())
