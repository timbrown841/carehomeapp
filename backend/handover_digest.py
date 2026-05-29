"""Manager Handover Digest — Phase F.4.

Executive summary for managers returning to the home after time away
(shift / week / month). Aggregates across modules into a single
"what do I need to know right now?" view.

DESIGN PRINCIPLE: This is an executive summary, not a data dump. Counts are
deterministic. Items are surfaced only when they need management attention.
Supportive tone — surfaces stabilising trends as clearly as concerns.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional


PERIOD_DEFS = {
    "shift": {"hours": 24,        "label": "Since last shift"},
    "week":  {"hours": 24 * 7,    "label": "Last 7 days"},
    "month": {"hours": 24 * 30,   "label": "Last 30 days"},
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(s) -> Optional[datetime]:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        return None


def _iso(d: Optional[datetime]) -> Optional[str]:
    return d.isoformat() if d else None


async def _resident_name_map(db) -> dict[str, str]:
    """id -> preferred_name/name."""
    out: dict[str, str] = {}
    async for r in db.residents.find(
        {}, {"_id": 0, "id": 1, "name": 1, "preferred_name": 1},
    ):
        out[r["id"]] = r.get("preferred_name") or r.get("name") or "(child)"
    return out


# --- Section builders ------------------------------------------------------


async def _safeguarding(db, start: datetime, end: datetime) -> dict:
    s, e = _iso(start), _iso(end)
    base = {"created_at": {"$gte": s, "$lt": e}}

    new_count = await db.incidents.count_documents({
        **base,
        "$or": [
            {"safeguarding": True},
            {"incident_type": "safeguarding"},
            {"category": "safeguarding"},
        ],
    })
    open_count = await db.incidents.count_documents({
        "$or": [
            {"safeguarding": True},
            {"incident_type": "safeguarding"},
            {"category": "safeguarding"},
        ],
        "$and": [{"$or": [
            {"status": {"$in": ["open", "investigating", "active"]}},
            {"closed_at": None},
            {"closed_at": {"$exists": False}},
        ]}],
    })
    closed_count = await db.incidents.count_documents({
        **base,
        "$or": [
            {"safeguarding": True},
            {"incident_type": "safeguarding"},
            {"category": "safeguarding"},
        ],
        "$and": [{"$or": [
            {"status": {"$in": ["closed", "resolved"]}},
            {"closed_at": {"$ne": None, "$exists": True, "$gte": s, "$lt": e}},
        ]}],
    })
    escalated_count = await db.incidents.count_documents({
        **base,
        "$or": [
            {"escalated": True},
            {"tags": {"$in": ["escalated", "police_involved", "police"]}},
        ],
    })
    reg40_count = 0
    for col in ("regulation_44_notifications", "regulation_40_notifications",
                "reg40_notifications", "notifications"):
        try:
            reg40_count = await db[col].count_documents({
                "$or": [
                    {"type": {"$regex": "regulation.*40", "$options": "i"}},
                    {"category": {"$regex": "reg.*40", "$options": "i"}},
                ],
                "created_at": {"$gte": s, "$lt": e},
            })
            if reg40_count:
                break
        except Exception:
            continue

    return {
        "new_count": new_count,
        "open_count": open_count,
        "closed_count": closed_count,
        "escalated_count": escalated_count,
        "reg40_count": reg40_count,
    }


async def _missing(db, start: datetime, end: datetime, names: dict[str, str]) -> dict:
    s, e = _iso(start), _iso(end)
    eps = await db.missing_episodes.find(
        {"$or": [
            {"reported_at": {"$gte": s, "$lt": e}},
            {"created_at": {"$gte": s, "$lt": e}},
        ]},
        {"_id": 0, "resident_id": 1, "reported_at": 1},
    ).to_list(500)

    # Outstanding return interviews: any return interview overdue OR missing for
    # closed episodes in the past 30 days.
    cutoff = (_now() - timedelta(days=30)).isoformat()
    closed_eps = await db.missing_episodes.find(
        {"returned_at": {"$ne": None, "$gte": cutoff}},
        {"_id": 0, "id": 1, "resident_id": 1, "returned_at": 1,
         "return_interview_completed_at": 1, "return_interview_due_at": 1},
    ).to_list(500)
    interview_outstanding = 0
    for ep in closed_eps:
        if not ep.get("return_interview_completed_at"):
            interview_outstanding += 1

    # Repeat patterns — residents with >= 2 episodes in the period
    counts: dict[str, int] = {}
    for ep in eps:
        rid = ep.get("resident_id")
        if rid:
            counts[rid] = counts.get(rid, 0) + 1
    repeat_count = sum(1 for n in counts.values() if n >= 2)
    top_affected = sorted(
        [{"resident_name": names.get(rid, "(child)"), "count": n}
         for rid, n in counts.items() if n >= 1],
        key=lambda x: -x["count"],
    )[:3]

    return {
        "episodes_count": len(eps),
        "outstanding_interviews": interview_outstanding,
        "repeat_count": repeat_count,
        "top_affected": top_affected,
    }


async def _incidents(db, start: datetime, end: datetime) -> dict:
    s, e = _iso(start), _iso(end)
    base = {"created_at": {"$gte": s, "$lt": e}}
    physical_count = await db.incidents.count_documents({
        **base,
        "$or": [
            {"category": {"$in": ["physical", "physical_intervention", "restraint"]}},
            {"incident_type": "physical"},
            {"tags": {"$in": ["restraint", "physical_intervention"]}},
        ],
    })
    high_risk_count = await db.incidents.count_documents({
        **base,
        "$or": [
            {"severity": {"$in": ["high", "critical"]}},
            {"risk_level": {"$in": ["high", "critical"]}},
        ],
    })
    police_count = await db.incidents.count_documents({
        **base,
        "$or": [
            {"police_involved": True},
            {"tags": {"$in": ["police", "police_involved"]}},
        ],
    })
    damage_count = await db.incidents.count_documents({
        **base,
        "$or": [
            {"category": {"$in": ["damage", "property_damage"]}},
            {"tags": {"$in": ["damage", "property_damage"]}},
        ],
    })

    # Pattern detection — categories trending above prior period
    prior_start = start - (end - start)
    prior_s, prior_e = _iso(prior_start), _iso(start)
    patterns: list[dict] = []
    for cat in ("physical", "self-harm", "peer_conflict"):
        cur = await db.incidents.count_documents({**base, "category": cat})
        prev = await db.incidents.count_documents({
            "created_at": {"$gte": prior_s, "$lt": prior_e},
            "category": cat,
        })
        if cur >= 3 and cur > prev:
            patterns.append({
                "category": cat.replace("_", " ").replace("-", " ").title(),
                "this_period": cur,
                "previous_period": prev,
                "direction": "rising",
            })

    return {
        "physical_count": physical_count,
        "high_risk_count": high_risk_count,
        "police_count": police_count,
        "damage_count": damage_count,
        "patterns": patterns,
    }


async def _placement(db) -> dict:
    """Reuse the org-wide emerging concerns engine (with trajectory layer)."""
    try:
        from placement_stability import build_emerging_placement_concerns
        ep = await build_emerging_placement_concerns(
            db, with_trajectory=True, trajectory_weeks=8,
        )
    except Exception:
        return {"improving": [], "deteriorating": [], "new_concerns": [],
                "improving_count": 0, "deteriorating_count": 0}

    improving, deteriorating = [], []
    for row in (ep.get("all_residents") or
                (ep.get("emerging_concerns") or []) + (ep.get("stabilising_trends") or [])):
        traj = row.get("trajectory") or {}
        label = traj.get("trajectory_label", "")
        if label in ("stabilising", "improving"):
            improving.append({
                "resident_name": row.get("name"),
                "status_label": row.get("status_label"),
                "summary": traj.get("trajectory_summary"),
            })
        elif label == "deteriorating":
            deteriorating.append({
                "resident_name": row.get("name"),
                "status_label": row.get("status_label"),
                "summary": traj.get("trajectory_summary"),
            })

    new_concerns = [
        {"resident_name": r.get("name"), "status_label": r.get("status_label"),
         "top_risk": r.get("top_risk")}
        for r in (ep.get("emerging_concerns") or []) if r.get("days_in_placement", 999) <= 60
    ][:5]

    return {
        "improving": improving[:5],
        "improving_count": len(improving),
        "deteriorating": deteriorating[:5],
        "deteriorating_count": len(deteriorating),
        "new_concerns": new_concerns,
        "overall_label": ep.get("overall_label"),
    }


async def _staffing(db, start: datetime, end: datetime) -> dict:
    s, e = _iso(start), _iso(end)
    # Sickness / absence — count staff_files entries in 'absence_sickness' folder in window
    sickness_count = await db.staff_files.count_documents({
        "folder_id": "absence_sickness",
        "uploaded_at": {"$gte": s, "$lt": e},
    })
    # Agency staff active
    agency_count = await db.staff_profiles.count_documents({"is_agency": True})
    # Shift count this period
    shifts_count = await db.shifts.count_documents({
        "start_time": {"$gte": s, "$lt": e},
    })

    # Burnout alerts (deterministic) — reuse engine
    burnout_alerts: list[dict] = []
    try:
        from intelligence_engine import build_burnout_forecast
        bf = await build_burnout_forecast(db)
        for s_row in (bf.get("staff") or []):
            if s_row.get("risk_level") in ("high", "critical"):
                burnout_alerts.append({
                    "name": s_row.get("name"),
                    "risk_level": s_row.get("risk_level"),
                    "top_factor": (s_row.get("factors") or [{}])[0].get("label"),
                })
    except Exception:
        pass

    return {
        "sickness_count": sickness_count,
        "agency_count": agency_count,
        "shifts_count": shifts_count,
        "burnout_alerts": burnout_alerts[:5],
        "burnout_alert_count": len(burnout_alerts),
    }


async def _compliance(db) -> dict:
    """Org-wide HR/SCR rollup."""
    try:
        from staff_personnel import build_hr_dashboard, build_scr
        hr = await build_hr_dashboard(db)
        scr = await build_scr(db)
    except Exception:
        return {"overdue_supervisions": 0, "expiring_dbs": 0,
                "expired_training": 0, "scr_red_count": 0, "open_actions": 0}

    inspection_open = 0
    try:
        inspection_open = await db.inspection_actions.count_documents({
            "$or": [{"status": "open"}, {"status": "in_progress"},
                    {"completed_at": None}, {"completed_at": {"$exists": False}}],
        })
    except Exception:
        pass

    return {
        "overdue_supervisions": scr["kpis"]["overdue_supervisions"],
        "expiring_dbs": scr["kpis"]["expiring_dbs_60d"],
        "expired_training": scr["kpis"]["expired_training"],
        "scr_red_count": scr["summary"]["red"],
        "scr_amber_count": scr["summary"]["amber"],
        "scr_green_count": scr["summary"]["green"],
        "total_expiring_60d": hr["total_expiring_60d"],
        "open_actions": inspection_open,
    }


async def _child_spotlight(db, start: datetime, end: datetime,
                            placement: dict) -> dict:
    """Identify most-improved, highest-concern, review-required children."""
    most_improved = None
    highest_concern = None

    if placement["improving"]:
        c = placement["improving"][0]
        most_improved = {
            "resident_name": c["resident_name"],
            "why": "Stability trajectory improving over the last 8 weeks.",
            "evidence": c.get("summary"),
            "recommended_action": (
                "Acknowledge the team's work and continue current support plan. "
                "Note in next supervision."
            ),
        }
    if placement["deteriorating"]:
        c = placement["deteriorating"][0]
        highest_concern = {
            "resident_name": c["resident_name"],
            "why": "Stability trajectory rising — support recommended.",
            "evidence": c.get("summary"),
            "recommended_action": (
                "Hold a placement-stability discussion with key worker. "
                "Consider strategy meeting if pattern continues."
            ),
        }

    # Review required — child with most safeguarding/missing/incident activity
    s, e = _iso(start), _iso(end)
    pipeline = [
        {"$match": {"created_at": {"$gte": s, "$lt": e},
                    "resident_id": {"$ne": None, "$exists": True}}},
        {"$group": {"_id": "$resident_id", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}}, {"$limit": 1},
    ]
    review_required = None
    cur = db.incidents.aggregate(pipeline)
    async for row in cur:
        if row.get("n", 0) >= 3:
            rid = row["_id"]
            res = await db.residents.find_one(
                {"id": rid}, {"_id": 0, "name": 1, "preferred_name": 1},
            )
            if res:
                review_required = {
                    "resident_name": res.get("preferred_name") or res.get("name"),
                    "why": f"{row['n']} incidents recorded in this period — review pattern.",
                    "evidence": f"{row['n']} incident records in chronology.",
                    "recommended_action": (
                        "Open the chronology with this filter applied and discuss in "
                        "the next daily team brief."
                    ),
                }
        break

    return {
        "most_improved": most_improved,
        "highest_concern": highest_concern,
        "review_required": review_required,
    }


async def _manager_actions(db, start: datetime, end: datetime) -> dict:
    """Pull urgent / due-today / overdue / awaiting-signoff / safeguarding actions
    from inspection_actions, care_tasks, supervisions, etc."""
    now = _now()
    today_end = (now + timedelta(days=1)).date().isoformat()
    today_start = now.date().isoformat()

    urgent: list[dict] = []
    due_today: list[dict] = []
    overdue: list[dict] = []
    awaiting_signoff: list[dict] = []
    safeguarding_actions: list[dict] = []

    # Inspection actions
    try:
        async for a in db.inspection_actions.find(
            {"$or": [
                {"status": {"$in": ["open", "in_progress"]}},
                {"completed_at": None},
                {"completed_at": {"$exists": False}},
            ]},
            {"_id": 0, "id": 1, "title": 1, "description": 1, "due_at": 1,
             "priority": 1, "category": 1, "status": 1},
        ).limit(200):
            due = _parse_iso(a.get("due_at"))
            item = {
                "title": a.get("title") or a.get("description", "Inspection action"),
                "due_at": _iso(due),
                "category": "Inspection action",
                "priority": a.get("priority") or "normal",
            }
            if due and due < now:
                overdue.append(item)
            elif due and due.date().isoformat() == today_start:
                due_today.append(item)
            if (a.get("priority") or "").lower() in ("urgent", "high"):
                urgent.append(item)
            if (a.get("category") or "").lower() == "safeguarding":
                safeguarding_actions.append(item)
    except Exception:
        pass

    # Care tasks
    try:
        async for ct in db.care_tasks.find(
            {"$or": [
                {"status": {"$in": ["open", "pending"]}},
                {"completed_at": None},
                {"completed_at": {"$exists": False}},
            ]},
            {"_id": 0, "title": 1, "due_at": 1, "priority": 1, "category": 1},
        ).limit(200):
            due = _parse_iso(ct.get("due_at"))
            item = {
                "title": ct.get("title", "Care task"),
                "due_at": _iso(due),
                "category": ct.get("category") or "Care task",
                "priority": ct.get("priority") or "normal",
            }
            if due and due < now:
                overdue.append(item)
            elif due and due.date().isoformat() == today_start:
                due_today.append(item)
            if (ct.get("priority") or "").lower() in ("urgent", "high"):
                urgent.append(item)
    except Exception:
        pass

    # Overdue supervisions (proxy from SCR)
    try:
        from staff_personnel import build_scr
        scr = await build_scr(db)
        for r in scr["rows"]:
            if r["last_supervision"]["status"] == "red":
                overdue.append({
                    "title": f"Supervision overdue — {r['name']}",
                    "due_at": None,
                    "category": "Supervision",
                    "priority": "high",
                })
    except Exception:
        pass

    return {
        "urgent": urgent[:8],
        "due_today": due_today[:8],
        "overdue": overdue[:10],
        "awaiting_signoff": awaiting_signoff[:8],
        "safeguarding_actions": safeguarding_actions[:8],
        "total": len(urgent) + len(due_today) + len(overdue)
                  + len(awaiting_signoff) + len(safeguarding_actions),
    }


async def _home_intelligence(safeguarding: dict, missing: dict, incidents: dict,
                              placement: dict, staffing: dict, compliance: dict) -> dict:
    """Deterministic cross-module pattern alerts and recommendations."""
    alerts: list[str] = []
    recs: list[str] = []

    if safeguarding["escalated_count"] >= 1:
        alerts.append(
            f"{safeguarding['escalated_count']} safeguarding escalation"
            f"{'s' if safeguarding['escalated_count'] != 1 else ''} this period — "
            "ensure all are reflected in management oversight."
        )
    if missing["repeat_count"] >= 1:
        alerts.append(
            f"{missing['repeat_count']} child"
            f"{'ren' if missing['repeat_count'] != 1 else ''} with repeat missing-from-care episodes."
        )
        recs.append("Review missing-from-care strategy meetings for repeat patterns.")
    if incidents["patterns"]:
        for p in incidents["patterns"]:
            alerts.append(
                f"{p['category']} incidents rising "
                f"({p['previous_period']} → {p['this_period']}) — review home dynamics."
            )
    if placement["deteriorating_count"] >= 1:
        alerts.append(
            f"{placement['deteriorating_count']} child"
            f"{'ren' if placement['deteriorating_count'] != 1 else ''} with deteriorating placement stability."
        )
        recs.append("Open Emerging Concerns panel and review evidence with the team.")
    if compliance["overdue_supervisions"] >= 1:
        alerts.append(
            f"{compliance['overdue_supervisions']} staff have overdue supervisions — "
            "Ofsted-critical."
        )
        recs.append("Schedule overdue supervisions this week.")
    if compliance["expiring_dbs"] >= 1 or compliance["expired_training"] >= 1:
        recs.append(
            "Open the Single Central Record to view all expiring DBS / training and "
            "plan renewals."
        )
    if staffing["burnout_alert_count"] >= 1:
        alerts.append(
            f"{staffing['burnout_alert_count']} staff in elevated burnout risk band."
        )
        recs.append("Discuss reflective supervision and rota adjustments where flagged.")

    # Positive call-outs — surface stabilisation as clearly as concerns
    positives: list[str] = []
    if placement["improving_count"] >= 1:
        positives.append(
            f"{placement['improving_count']} child"
            f"{'ren' if placement['improving_count'] != 1 else ''} on a stabilising trajectory — recognise the team's work."
        )
    if safeguarding["closed_count"] >= 1:
        positives.append(
            f"{safeguarding['closed_count']} safeguarding concern"
            f"{'s' if safeguarding['closed_count'] != 1 else ''} closed in this period."
        )

    return {
        "alerts": alerts[:8],
        "recommendations": recs[:6],
        "positives": positives[:4],
    }


# --- Main entrypoint -------------------------------------------------------


async def build_handover_digest(
    db, period: str = "shift", sector: str = "children",
    user: Optional[dict] = None,
) -> dict:
    """Manager handover digest. period ∈ shift / week / month."""
    if period not in PERIOD_DEFS:
        period = "shift"
    pdef = PERIOD_DEFS[period]
    end = _now()
    start = end - timedelta(hours=pdef["hours"])

    names = await _resident_name_map(db)
    sg = await _safeguarding(db, start, end)
    miss = await _missing(db, start, end, names)
    inc = await _incidents(db, start, end)
    placement = await _placement(db)
    staffing = await _staffing(db, start, end)
    compliance = await _compliance(db)
    spotlight = await _child_spotlight(db, start, end, placement)
    actions = await _manager_actions(db, start, end)
    home_int = await _home_intelligence(sg, miss, inc, placement, staffing, compliance)

    return {
        "generated_at": _iso(end),
        "generated_by": (user or {}).get("name") or (user or {}).get("email") or "System",
        "generated_by_id": (user or {}).get("id"),
        "period": period,
        "period_label": pdef["label"],
        "period_start": _iso(start),
        "period_end": _iso(end),
        "sector": sector,
        "safeguarding": sg,
        "missing": miss,
        "incidents": inc,
        "placement_stability": placement,
        "home_intelligence": home_int,
        "staffing": staffing,
        "compliance": compliance,
        "child_spotlight": spotlight,
        "manager_actions": actions,
        "explainable_note": (
            "Deterministic operational digest. Same data in → same digest out. "
            "Counts and pattern alerts are computed from real DB events across the "
            "selected period. Designed for leadership oversight, not data export."
        ),
    }
