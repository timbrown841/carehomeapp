"""Safelyn Systems — Audit logging service.

Centralised, write-only audit trail for inspector-grade accountability.

Use `record_audit(...)` from inside any FastAPI route to emit a single,
immutable event. The collection is `audit_events` and is intentionally
INSERT-ONLY (no edits, no deletes via the API).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _diff(before: Optional[Dict[str, Any]], after: Optional[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Field-level diff between two dicts. Returns {field: {before, after}}."""
    if not before and not after:
        return {}
    if before is None:
        before = {}
    if after is None:
        after = {}
    keys = set(before.keys()) | set(after.keys())
    out: Dict[str, Dict[str, Any]] = {}
    for k in keys:
        if k.startswith("_"):
            continue
        b, a = before.get(k), after.get(k)
        if b != a:
            out[k] = {"before": b, "after": a}
    return out


async def record_audit(
    db,
    *,
    actor: dict,
    action: str,
    object_type: str,
    object_id: Optional[str],
    summary: str,
    resident_id: Optional[str] = None,
    changes: Optional[Dict[str, Dict[str, Any]]] = None,
    before: Optional[Dict[str, Any]] = None,
    after: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> dict:
    """Record a single audit event.

    `changes` may be passed directly, or computed via before/after dicts.
    Internal Mongo `_id` and other private fields are stripped automatically.
    """
    if changes is None and (before is not None or after is not None):
        changes = _diff(before, after)

    event = {
        "id": str(uuid.uuid4()),
        "at": _now_iso(),
        "actor_id": (actor or {}).get("id"),
        "actor_name": (actor or {}).get("name"),
        "actor_role": (actor or {}).get("role"),
        "action": action,
        "object_type": object_type,
        "object_id": object_id,
        "resident_id": resident_id,
        "summary": summary,
        "changes": changes or {},
        "metadata": metadata or {},
    }
    try:
        await db.audit_events.insert_one(event)
    except Exception:
        # Audit must never break the originating request flow; log and continue.
        import logging
        logging.warning("Audit insert failed", exc_info=True)
    event.pop("_id", None)
    return event
