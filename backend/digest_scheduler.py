"""Digest Delivery Schedules — Phase G.

Schedules the daily/weekly/monthly Manager Handover Digest deliveries.
Email is MOCKED — each "send" writes a `digest_deliveries` audit record
so the integration with Resend/Twilio drops in cleanly later.

Background tick: a single asyncio task polls every 60 seconds for schedules
whose `next_run_at` has passed.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


DEFAULT_SCHEDULES = {
    "morning":  {"period": "shift", "hour": 7,  "minute": 0,  "weekday": None,
                  "label": "Morning digest", "description": "Daily 07:00"},
    "weekly":   {"period": "week",  "hour": 8,  "minute": 0,  "weekday": 0,
                  "label": "Weekly leadership digest", "description": "Mondays 08:00"},
    "monthly":  {"period": "month", "hour": 8,  "minute": 0,  "weekday": None, "monthday": 1,
                  "label": "Monthly oversight digest", "description": "1st of the month 08:00"},
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: Optional[datetime]) -> Optional[str]:
    return d.isoformat() if d else None


def compute_next_run(schedule: dict, *, after: Optional[datetime] = None) -> datetime:
    """Deterministic next run time for a digest schedule, after `after`
    (defaults to now). Honours hour/minute/weekday/monthday."""
    base = (after or _now())
    hour = int(schedule.get("hour", 7))
    minute = int(schedule.get("minute", 0))
    weekday = schedule.get("weekday")
    monthday = schedule.get("monthday")

    cand = base.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if cand <= base:
        cand = cand + timedelta(days=1)

    if monthday is not None:
        # Snap to the next 1st-of-month at the chosen hour
        y, m = cand.year, cand.month
        if cand.day > int(monthday):
            m += 1
            if m > 12:
                m = 1; y += 1
        cand = cand.replace(year=y, month=m, day=int(monthday))
    elif weekday is not None:
        # Snap forward to the desired weekday (Mon=0)
        diff = (int(weekday) - cand.weekday()) % 7
        if diff:
            cand = cand + timedelta(days=diff)

    return cand


async def initialise_schedules(db):
    """Seed the default schedule entries if none exist."""
    if await db.digest_schedules.count_documents({}) > 0:
        return
    now = _now()
    for key, cfg in DEFAULT_SCHEDULES.items():
        await db.digest_schedules.insert_one({
            "id": key,
            "key": key,
            "enabled": False,  # opt-in by manager
            "period": cfg["period"],
            "hour": cfg["hour"],
            "minute": cfg["minute"],
            "weekday": cfg.get("weekday"),
            "monthday": cfg.get("monthday"),
            "label": cfg["label"],
            "description": cfg["description"],
            "recipients": [],   # list of user_ids
            "last_run_at": None,
            "next_run_at": _iso(compute_next_run(cfg, after=now)),
            "created_at": _iso(now),
            "updated_at": _iso(now),
        })
    logger.info("Seeded default digest schedules")


async def trigger_digest_delivery(db, schedule: dict, *,
                                    manual: bool = False) -> dict:
    """Generate the digest for the schedule's period and write a delivery record.

    Real email/SMS is MOCKED — the delivery record carries `delivery_status:
    "queued_for_email"` so a future Resend integration sends it for real.
    """
    from handover_digest import build_handover_digest
    digest = await build_handover_digest(db, period=schedule["period"], sector="children")

    # Resolve recipient names for display
    recipients = []
    for uid in schedule.get("recipients") or []:
        u = await db.users.find_one({"id": uid}, {"_id": 0, "name": 1, "email": 1, "id": 1})
        if u:
            recipients.append({"id": u["id"], "name": u.get("name"), "email": u.get("email")})

    now = _now()
    delivery = {
        "id": _new_id(),
        "schedule_id": schedule["id"],
        "schedule_key": schedule.get("key"),
        "schedule_label": schedule.get("label"),
        "period": schedule["period"],
        "period_label": digest["period_label"],
        "period_start": digest["period_start"],
        "period_end": digest["period_end"],
        "delivered_at": _iso(now),
        "manual_trigger": manual,
        "recipients": recipients,
        "snapshot": {
            "manager_actions_total": digest["manager_actions"]["total"],
            "safeguarding_new":   digest["safeguarding"]["new_count"],
            "missing_episodes":   digest["missing"]["episodes_count"],
            "improving":          digest["placement_stability"]["improving_count"],
            "deteriorating":      digest["placement_stability"]["deteriorating_count"],
            "supervisions_overdue": digest["compliance"]["overdue_supervisions"],
            "expiring_dbs":       digest["compliance"]["expiring_dbs"],
            "alerts_count":       len(digest["home_intelligence"]["alerts"]),
        },
        "delivery_status": "in_app_only" if not recipients else "queued_for_email",
        "delivery_channels": ["in_app"] + (["email"] if recipients else []),
    }
    await db.digest_deliveries.insert_one(delivery.copy())

    # Update the schedule
    await db.digest_schedules.update_one(
        {"id": schedule["id"]},
        {"$set": {
            "last_run_at": _iso(now),
            "next_run_at": _iso(compute_next_run(schedule, after=now)),
            "updated_at": _iso(now),
        }},
    )
    delivery.pop("_id", None)
    return delivery


def _new_id() -> str:
    import uuid
    return str(uuid.uuid4())


async def digest_scheduler_tick(db):
    """Single tick of the scheduler — fires any digests whose next_run_at has passed."""
    now = _now()
    cur = db.digest_schedules.find(
        {"enabled": True, "next_run_at": {"$lte": _iso(now)}},
        {"_id": 0},
    )
    docs = await cur.to_list(20)
    for sched in docs:
        try:
            await trigger_digest_delivery(db, sched, manual=False)
            logger.info(f"Auto-triggered digest schedule: {sched.get('label')}")
        except Exception as e:
            logger.error(f"Failed to run digest {sched.get('id')}: {e}")


async def start_scheduler(db, *, interval_seconds: int = 60):
    """Background asyncio task. Returns the task handle so caller can cancel."""
    async def _loop():
        while True:
            try:
                await digest_scheduler_tick(db)
            except Exception as e:
                logger.error(f"Digest scheduler tick failed: {e}")
            await asyncio.sleep(interval_seconds)
    return asyncio.create_task(_loop())
