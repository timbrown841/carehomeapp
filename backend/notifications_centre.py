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


# ---- Quiet Hours ---------------------------------------------------------

QUIET_HOURS_DEFAULT = {
    "enabled": False,
    "start": "22:00",
    "end": "06:00",
    "days": [0, 1, 2, 3, 4, 5, 6],   # 0=Mon..6=Sun
    "apply_to_email": True,
    "apply_to_sms": True,
    "apply_to_in_app": True,
}


def _parse_hhmm(s: str) -> int:
    """Return minutes-since-midnight from a 'HH:MM' string. Returns -1 on parse failure."""
    try:
        h, m = s.split(":")
        return int(h) * 60 + int(m)
    except (ValueError, AttributeError):
        return -1


def is_in_quiet_hours(quiet: Optional[dict], now: Optional[datetime] = None) -> bool:
    """Deterministic check — is `now` inside the user's quiet-hours window?

    Handles windows that cross midnight (e.g. 22:00 → 06:00). When the window
    crosses midnight, the morning-side (00:00 → end) belongs to the PREVIOUS
    day in the user's `days` list — so a Monday-night quiet period flows into
    Tuesday morning naturally.
    """
    if not quiet or not quiet.get("enabled"):
        return False
    now = now or _now()
    start_min = _parse_hhmm(quiet.get("start", "22:00"))
    end_min = _parse_hhmm(quiet.get("end", "06:00"))
    if start_min < 0 or end_min < 0 or start_min == end_min:
        return False
    days = quiet.get("days") or [0, 1, 2, 3, 4, 5, 6]
    cur_min = now.hour * 60 + now.minute
    weekday = now.weekday()
    if start_min < end_min:
        # Same-day window
        return (start_min <= cur_min < end_min) and (weekday in days)
    # Window crosses midnight
    if cur_min >= start_min:
        return weekday in days
    if cur_min < end_min:
        prev_day = (weekday - 1) % 7
        return prev_day in days
    return False


async def get_quiet_hours(db, user_id: str) -> dict:
    doc = await db.notification_quiet_hours.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        return {"user_id": user_id, **QUIET_HOURS_DEFAULT}
    # Fill in any missing keys from default (defensive)
    return {**QUIET_HOURS_DEFAULT, **doc}


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

    breakthroughs: list[dict] = []  # per-user audit context for critical breakthrough
    bundled_users: list[str] = []   # per-user audit context for non-critical bundling

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

        # Quiet hours evaluation
        quiet = await get_quiet_hours(db, uid)
        in_quiet = is_in_quiet_hours(quiet, now)
        bundled_into_digest = False
        quiet_breakthrough = False

        if in_quiet and is_critical:
            # Critical events break through, but we tag for audit
            quiet_breakthrough = True
            breakthroughs.append({"user_id": uid})
        elif in_quiet and not is_critical:
            # Non-critical → bundle into next digest
            bundled_into_digest = True
            if quiet.get("apply_to_email", True):
                pending = [c for c in pending if c != "email"]
            if quiet.get("apply_to_sms", True):
                pending = [c for c in pending if c != "sms"]
            if quiet.get("apply_to_in_app", True):
                # Move in_app out of "delivered" so the bell doesn't pulse;
                # the notification doc still exists and is visible when user opens
                # the centre.
                delivered = [d for d in delivered if d != "in_app"]
                if "digest" not in delivered:
                    delivered.append("digest")
            bundled_users.append({"user_id": uid})

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
            "bundled_into_digest": bundled_into_digest,
            "quiet_hours_breakthrough": quiet_breakthrough,
        }
        await db.notifications.insert_one(doc.copy())
        if not inserted:
            inserted = {k: v for k, v in doc.items() if k != "_id"}

    # Audit-log quiet-hours interactions (best-effort; non-blocking)
    if breakthroughs or bundled_users:
        try:
            from server import record_audit  # local import to avoid circular
            audit_actor = actor or {"id": "system", "name": "Safelyn"}
            for entry in breakthroughs:
                await record_audit(
                    db, actor=audit_actor, action="quiet_hours_breakthrough",
                    object_type="notification", object_id=inserted.get("id") if inserted else None,
                    metadata={
                        "category": category, "event_type": event_type,
                        "severity": severity, "recipient_id": entry["user_id"],
                    },
                    summary=f"Critical {category} alert delivered during quiet hours",
                )
            for entry in bundled_users:
                await record_audit(
                    db, actor=audit_actor, action="quiet_hours_bundled",
                    object_type="notification", object_id=inserted.get("id") if inserted else None,
                    metadata={
                        "category": category, "event_type": event_type,
                        "recipient_id": entry["user_id"],
                    },
                    summary=f"Non-critical {category} notification bundled into morning digest",
                )
        except Exception:
            # Audit failure must never break notification creation
            pass

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
        title="Child reported missing",
        body="A child has been reported missing from care.",
        link=f"/residents/{rid}?tab=timeline" if rid else "/missing",
        object_type="missing_episode",
        object_id=episode.get("id"),
        metadata={"resident_id": rid},
        actor=actor,
    )
