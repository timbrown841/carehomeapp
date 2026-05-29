"""Intelligence & Notification Centre — Phase G.

Smart notifications + scheduled digests for proactive operational oversight.

DESIGN PRINCIPLES:
- Do NOT spam. Critical events fire immediately; low/medium bundle into digests.
- Categories are tightly defined and discoverable in the UI.
- Every notification has a deterministic dedupe key so the same event firing
  twice in quick succession only produces one notification.
- Channels (in_app / email / sms / digest_only) are preference-driven per
  category, per user. Email/SMS are MOCKED — we still write the notification
  with a `pending_channels` list so a real Resend/Twilio integration drops
  in cleanly later.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Optional


# ---- Categories & severities ---------------------------------------------

CATEGORIES = [
    "safeguarding",
    "missing",
    "compliance",
    "staffing",
    "placement_intelligence",
    "hr",
    "inspection_readiness",
]

CATEGORY_LABELS = {
    "safeguarding":           "Safeguarding",
    "missing":                "Missing from care",
    "compliance":             "Compliance",
    "staffing":               "Staffing",
    "placement_intelligence": "Placement intelligence",
    "hr":                     "HR",
    "inspection_readiness":   "Inspection readiness",
}

SEVERITIES = ("critical", "high", "medium", "low", "info")

# Events that MUST fire immediately, regardless of preferences. Categories
# / severities not on this map fall through to user-preferred channels and
# may be "digest only".
CRITICAL_EVENTS = {
    # Safeguarding
    "new_safeguarding_referral", "child_reported_missing",
    "high_risk_incident", "police_involvement", "reg40_trigger",
    # Compliance
    "dbs_expired", "rtw_expired", "staffing_ratio_breach",
    # Placement
    "placement_stability_critical", "placement_significant_deterioration",
}

DEFAULT_CHANNELS = {
    "safeguarding":           ["in_app", "email"],
    "missing":                ["in_app", "email"],
    "compliance":             ["in_app", "digest_only"],
    "staffing":               ["in_app", "digest_only"],
    "placement_intelligence": ["in_app", "digest_only"],
    "hr":                     ["in_app", "digest_only"],
    "inspection_readiness":   ["in_app", "digest_only"],
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: Optional[datetime]) -> Optional[str]:
    return d.isoformat() if d else None


def _dedupe_key(category: str, event_type: str, object_id: Optional[str],
                 window_bucket: str) -> str:
    """sha-256 of (category, event_type, object_id, window). Used to guard
    against duplicate notifications when the same event fires multiple times.
    window_bucket is e.g. an ISO date to bucket events by day."""
    src = f"{category}|{event_type}|{object_id or ''}|{window_bucket}"
    return hashlib.sha256(src.encode("utf-8")).hexdigest()[:24]


async def create_notification(
    db,
    *,
    user_id: Optional[str] = None,  # None = broadcast to all eligible managers
    category: str,
    event_type: str,
    severity: str = "medium",
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    object_type: Optional[str] = None,
    object_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    actor: Optional[dict] = None,
    dedupe_window: str = "day",
) -> Optional[dict]:
    """Smart create — handles dedupe, channel resolution, and audience fan-out.

    Returns the created notification doc (or None if duplicate was suppressed).
    """
    if category not in CATEGORIES:
        category = "safeguarding"  # safest default for unknown categories
    if severity not in SEVERITIES:
        severity = "medium"

    now = _now()
    bucket = now.date().isoformat() if dedupe_window == "day" else now.isoformat()
    dedupe = _dedupe_key(category, event_type, object_id, bucket)

    # Resolve audience — single user, or all managers/admins
    audience: list[str] = []
    if user_id:
        audience = [user_id]
    else:
        async for u in db.users.find(
            {"role": {"$in": ["manager", "admin"]}},
            {"_id": 0, "id": 1},
        ):
            audience.append(u["id"])

    is_critical = event_type in CRITICAL_EVENTS or severity == "critical"

    inserted: Optional[dict] = None
    for uid in audience:
        # Dedupe: skip if a notification with the same dedupe key already exists for this user today
        existing = await db.notifications.find_one(
            {"user_id": uid, "dedupe_key": dedupe},
            {"_id": 0, "id": 1},
        )
        if existing:
            continue

        prefs = await db.notification_preferences.find_one(
            {"user_id": uid, "category": category}, {"_id": 0},
        )
        channels = (prefs or {}).get("channels") or DEFAULT_CHANNELS.get(category) or ["in_app"]

        # Critical events always include in_app + email channels
        if is_critical:
            channels = list(dict.fromkeys([*channels, "in_app", "email"]))

        # "digest_only" cancels the in_app + email + sms unless critical
        if not is_critical and "digest_only" in channels:
            delivered = ["digest"]
            pending = []
        else:
            delivered = ["in_app"] if "in_app" in channels else []
            pending = [c for c in channels if c in ("email", "sms")]

        doc = {
            "id": _new_id(),
            "user_id": uid,
            "category": category,
            "event_type": event_type,
            "severity": severity,
            "title": title,
            "body": body,
            "link": link,
            "object_type": object_type,
            "object_id": object_id,
            "metadata": metadata or {},
            "created_at": _iso(now),
            "actor_name": (actor or {}).get("name"),
            "dedupe_key": dedupe,
            "is_critical": is_critical,
            "read_at": None,
            "dismissed_at": None,
            "delivered_channels": delivered,
            "pending_channels": pending,  # for future email/sms integration
        }
        await db.notifications.insert_one(doc.copy())
        if not inserted:
            inserted = {k: v for k, v in doc.items() if k != "_id"}

    return inserted


def _new_id() -> str:
    import uuid
    return str(uuid.uuid4())


# ---- Critical event helpers (called from existing endpoints) -------------


async def notify_safeguarding_incident(db, incident: dict, actor: Optional[dict] = None):
    """Hook called when a safeguarding incident is created."""
    sev = "critical" if (incident.get("severity") in ("critical", "high")
                          or incident.get("escalated") or incident.get("police_involved")) else "high"
    event = "high_risk_incident" if sev == "critical" else "new_safeguarding_referral"
    title = incident.get("title") or f"New safeguarding concern: {incident.get('category', 'incident')}"
    rid = incident.get("resident_id")
    return await create_notification(
        db,
        category="safeguarding",
        event_type=event,
        severity=sev,
        title=title,
        body=f"Logged{(' for ' + (incident.get('resident_name') or rid[:8] if rid else '')) if rid else ''}.",
        link=f"/residents/{rid}?tab=timeline" if rid else "/incidents",
        object_type="incident",
        object_id=incident.get("id"),
        metadata={"category": incident.get("category"), "severity": sev},
        actor=actor,
    )


async def notify_missing_episode(db, episode: dict, actor: Optional[dict] = None):
    """Hook called when a missing-from-care episode is reported."""
    rid = episode.get("resident_id")
    return await create_notification(
        db,
        category="missing",
        event_type="child_reported_missing",
        severity="critical",
        title=f"Child reported missing",
        body=f"A child has been reported missing from care.",
        link=f"/residents/{rid}?tab=timeline" if rid else "/missing",
        object_type="missing_episode",
        object_id=episode.get("id"),
        metadata={"resident_id": rid},
        actor=actor,
    )
