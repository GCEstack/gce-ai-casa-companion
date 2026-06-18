"""COPPA helpers: consent checks, ephemeral session bookkeeping, and parent deletion."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from postgrest.exceptions import APIError


class ConsentError(Exception):
    """Raised when a device may not be used because parental consent is missing."""

    def __init__(self, message: str = "Parental consent required"):
        self.message = message
        super().__init__(self.message)


class DeviceNotFoundError(Exception):
    pass


async def get_device_with_parent(supabase: Any, device_id: str) -> dict[str, Any]:
    """Fetch a device joined to its parent row."""
    result = (
        await supabase.table("devices")
        .select("*, parents(*)")
        .eq("id", device_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise DeviceNotFoundError(f"Device {device_id} not found")
    return result.data


async def require_consent(supabase: Any, device_id: str) -> dict[str, Any]:
    """Return the parent row only if consent_verified is true."""
    row = await get_device_with_parent(supabase, device_id)
    parent = row.get("parents", {})
    if not parent.get("consent_verified"):
        raise ConsentError("Parental consent has not been verified for this device")
    return parent


async def record_session_start(supabase: Any, device_id: str, fly_machine_id: str) -> UUID:
    """Create an ephemeral session row. No audio or transcript is stored."""
    from uuid import uuid4

    session_id = uuid4()
    payload = {
        "id": str(session_id),
        "device_id": device_id,
        "fly_machine_id": fly_machine_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
        "metadata": {"status": "starting"},
    }
    try:
        await supabase.table("sessions").insert(payload).execute()
    except APIError as e:
        # Non-fatal: sessions are telemetry-only. Log and continue.
        print(f"[COPPA] session insert warning: {e}")
    return session_id


async def touch_session(supabase: Any, session_id: UUID | None, metadata: dict[str, Any] | None = None):
    if not session_id:
        return
    payload: dict[str, Any] = {"last_seen_at": datetime.now(timezone.utc).isoformat()}
    if metadata:
        payload["metadata"] = metadata
    try:
        await supabase.table("sessions").update(payload).eq("id", str(session_id)).execute()
    except APIError:
        pass


async def end_session(supabase: Any, session_id: UUID | None):
    if not session_id:
        return
    try:
        await (
            supabase.table("sessions")
            .update({"ended_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", str(session_id))
            .execute()
        )
    except APIError:
        pass


async def delete_parent_data(supabase: Any, parent_id: str) -> dict[str, int]:
    """COPPA deletion: remove parent, devices, sessions, medallions."""
    counts: dict[str, int] = {}
    for table in ("sessions", "devices", "medallions"):
        try:
            result = await supabase.table(table).delete().eq("parent_id", parent_id).execute()
            counts[table] = len(result.data) if hasattr(result, "data") else 0
        except APIError as e:
            counts[table] = -1
            print(f"[COPPA] delete error on {table}: {e}")
    try:
        result = await supabase.table("parents").delete().eq("id", parent_id).execute()
        counts["parents"] = len(result.data) if hasattr(result, "data") else 0
    except APIError as e:
        counts["parents"] = -1
        print(f"[COPPA] delete error on parents: {e}")
    return counts


async def revoke_consent(supabase: Any, parent_id: str):
    """Revoke consent and deactivate all associated devices."""
    await (
        supabase.table("parents")
        .update({
            "consent_verified": False,
            "consent_method": "revoked",
            "consent_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", parent_id)
        .execute()
    )
    await (
        supabase.table("devices")
        .update({"is_active": False})
        .eq("parent_id", parent_id)
        .execute()
    )
