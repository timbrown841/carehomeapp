"""Safelyn Operational Intelligence engine — Iteration 40.

DETERMINISTIC.  EXPLAINABLE.  EVIDENCE-LINKED.

Same data in → same intelligence out. No AI hallucinations. Every flag is
backed by a traceable evidence chain so managers can click "Why was this
flagged?" and see exactly which incidents, episodes, or operational events
crossed which threshold.

Two entrypoints:
  - build_forecast(db, mode)              → organisational forecast (Dashboard)
  - build_resident_stability(db, mode)    → per-resident stability scores
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _pct_change(curr: int, prev: int) -> int:
    """Signed percentage change. prev=0 → +100 if curr>0 else 0."""
    if prev == 0:
        return 100 if curr > 0 else 0
    return int(round(((curr - prev) / prev) * 100))


def _severity_for(score: int) -> str:
    if score >= 80: return "critical"
    if score >= 60: return "high"
    if score >= 30: return "medium"
    return "low"


def _trend(delta_pct: int) -> str:
    if delta_pct >= 25: return "rising"
    if delta_pct <= -25: return "falling"
    return "stable"


def _confidence(window_days: int, sample_size: int) -> int:
    """Bigger window + more samples = higher confidence (0-100)."""
    if sample_size <= 1: return 25
    base = min(60 + sample_size * 4, 90)
    if window_days >= 30: base = min(base + 8, 95)
    return base


# ---------------------------------------------------------------------------
# Forecast — organisational emerging risks
# ---------------------------------------------------------------------------

CHILDREN_SECTORS = ["children", "semi_independent"]
ADULT_SECTORS = ["adult_supported_living", "elderly_residential", "dementia",
                  "mental_health", "veteran"]


async def _count(db, coll, q):
    return await db[coll].count_documents(q)


async def _children_risks(db) -> list[dict]:
    risks: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()

    # 1. Missing episodes velocity (14d vs prev 14d)
    last_14, prev_14_start = _iso_days_ago(14), _iso_days_ago(28)
    curr = await _count(db, "missing_episodes", {"reported_at": {"$gte": last_14}})
    prev = await _count(db, "missing_episodes",
                        {"reported_at": {"$gte": prev_14_start, "$lt": last_14}})
    if curr >= 2 and (curr > prev or prev == 0):
        delta = _pct_change(curr, prev)
        if delta >= 30 or (curr >= 3 and prev <= 1):
            score = 50 + min(40, delta // 3)
            risks.append({
                "id": "missing_velocity_14d",
                "domain": "safeguarding",
                "title": f"Missing episodes increasing — {curr} in last 14 days",
                "summary": f"Up from {prev} in the prior 14-day window ({'+' if delta >= 0 else ''}{delta}%).",
                "severity": _severity_for(score),
                "trend": _trend(delta),
                "timeframe": "14 days",
                "confidence": _confidence(14, curr),
                "affected_subjects": [],   # populated below
                "evidence": [
                    {"label": f"{curr} missing episodes in last 14d", "type": "count", "value": curr},
                    {"label": f"{prev} missing episodes in prior 14d", "type": "count", "value": prev},
                    {"label": "Escalation threshold", "type": "threshold", "value": "+30% or 3 in 14d after ≤1"},
                ],
                "deep_link": "/missing",
                "recommended_action": "Review missing-from-care strategy. Check for shared associates, locations or trigger times.",
                "linked_regulation": "Children's Homes Regs 2015 · Reg 34 · Behaviour management",
            })
            # Affected subjects
            async for e in db.missing_episodes.find(
                {"reported_at": {"$gte": last_14}},
                {"_id": 0, "resident_id": 1, "resident_name": 1},
            ):
                if e.get("resident_id") and not any(s["id"] == e["resident_id"] for s in risks[-1]["affected_subjects"]):
                    risks[-1]["affected_subjects"].append({"id": e["resident_id"], "name": e.get("resident_name") or "—", "kind": "resident"})

    # 2. Safeguarding incident cluster
    last_30 = _iso_days_ago(30)
    safeguarding = await _count(db, "incidents",
        {"$or": [{"category": "safeguarding"}, {"is_safeguarding": True}],
         "occurred_at": {"$gte": last_30}})
    prev_30 = await _count(db, "incidents",
        {"$or": [{"category": "safeguarding"}, {"is_safeguarding": True}],
         "occurred_at": {"$gte": _iso_days_ago(60), "$lt": last_30}})
    if safeguarding >= 3 and safeguarding > prev_30:
        delta = _pct_change(safeguarding, prev_30)
        score = 55 + min(35, delta // 3)
        risks.append({
            "id": "safeguarding_cluster_30d",
            "domain": "safeguarding",
            "title": f"Safeguarding cluster forming — {safeguarding} incidents in 30 days",
            "summary": f"Up from {prev_30} in the prior 30-day window ({'+' if delta >= 0 else ''}{delta}%).",
            "severity": _severity_for(score),
            "trend": _trend(delta),
            "timeframe": "30 days",
            "confidence": _confidence(30, safeguarding),
            "affected_subjects": [],
            "evidence": [
                {"label": f"{safeguarding} safeguarding incidents in 30d", "type": "count", "value": safeguarding},
                {"label": f"{prev_30} in prior 30d", "type": "count", "value": prev_30},
                {"label": "Cluster threshold", "type": "threshold", "value": "≥3 with rising trend"},
            ],
            "deep_link": "/incidents?category=safeguarding",
            "recommended_action": "Lead the next reflective practice session on these incidents. Verify ownership of all open safeguarding actions.",
            "linked_regulation": "Children's Homes Regs 2015 · Reg 12 · Protection of children",
        })

    # 3. Restraint / physical intervention escalation
    restraint_14 = await _count(db, "incidents",
        {"$or": [{"category": "restraint"}, {"physical_intervention": True}],
         "occurred_at": {"$gte": last_14}})
    restraint_prev = await _count(db, "incidents",
        {"$or": [{"category": "restraint"}, {"physical_intervention": True}],
         "occurred_at": {"$gte": _iso_days_ago(28), "$lt": last_14}})
    if restraint_14 >= 2 and restraint_14 > restraint_prev:
        delta = _pct_change(restraint_14, restraint_prev)
        risks.append({
            "id": "restraint_escalation_14d",
            "domain": "behaviour",
            "title": f"Physical intervention rising — {restraint_14} in 14 days",
            "summary": f"Up from {restraint_prev} in the prior 14-day window.",
            "severity": _severity_for(45 + min(30, delta // 3)),
            "trend": _trend(delta),
            "timeframe": "14 days",
            "confidence": _confidence(14, restraint_14),
            "affected_subjects": [],
            "evidence": [
                {"label": f"{restraint_14} restraint incidents in 14d", "type": "count", "value": restraint_14},
                {"label": f"{restraint_prev} in prior 14d", "type": "count", "value": restraint_prev},
            ],
            "deep_link": "/incidents",
            "recommended_action": "Schedule positive-behaviour-support review. Check de-escalation training currency for the team.",
            "linked_regulation": "Children's Homes Regs 2015 · Reg 20 · Restraint",
        })

    # 4. Risk reviews drift
    today = datetime.now(timezone.utc).date().isoformat()
    overdue = await _count(db, "residents",
        {"$and": [
            {"$or": [{"discharged_at": None}, {"discharged_at": {"$exists": False}}]},
            {"service_type": {"$in": CHILDREN_SECTORS + [None]}},
            {"$or": [{"risk_assessment_next_review": {"$lt": today, "$ne": None}}]},
        ]}
    )
    if overdue >= 2:
        risks.append({
            "id": "risk_reviews_overdue",
            "domain": "compliance",
            "title": f"{overdue} risk assessment{'s' if overdue != 1 else ''} overdue",
            "summary": "Risk assessments past their review date — Ofsted will challenge this.",
            "severity": _severity_for(40 + min(35, overdue * 8)),
            "trend": "stable",
            "timeframe": "today",
            "confidence": 95,
            "affected_subjects": [],
            "evidence": [
                {"label": f"{overdue} resident risk assessments overdue", "type": "count", "value": overdue},
                {"label": "Inspection expectation", "type": "threshold", "value": "Reviewed at the frequency set in the risk plan"},
            ],
            "deep_link": "/residents",
            "recommended_action": "Schedule risk-assessment review session this week. Update LAC review dates.",
            "linked_regulation": "Children's Homes Regs 2015 · Reg 13 · Independent advocate / Reg 31 · Records",
        })

    return risks


async def _adult_risks(db) -> list[dict]:
    risks: list[dict] = []
    last_14 = _iso_days_ago(14)
    last_30 = _iso_days_ago(30)
    last_90 = _iso_days_ago(90)

    # 1. Falls trend (30d vs prior 30d)
    falls_curr = await _count(db, "incidents",
        {"$or": [{"category": "fall"}, {"category": "Fall"}, {"category": "falls"}],
         "occurred_at": {"$gte": last_30}})
    falls_prev = await _count(db, "incidents",
        {"$or": [{"category": "fall"}, {"category": "Fall"}, {"category": "falls"}],
         "occurred_at": {"$gte": _iso_days_ago(60), "$lt": last_30}})
    if falls_curr >= 2 and falls_curr > falls_prev:
        delta = _pct_change(falls_curr, falls_prev)
        if delta >= 30 or (falls_curr >= 3 and falls_prev <= 1):
            score = 50 + min(40, delta // 3)
            risks.append({
                "id": "falls_velocity_30d",
                "domain": "wellbeing",
                "title": f"Falls increasing — {falls_curr} in last 30 days",
                "summary": f"Up from {falls_prev} in the prior 30-day window ({'+' if delta >= 0 else ''}{delta}%).",
                "severity": _severity_for(score),
                "trend": _trend(delta),
                "timeframe": "30 days",
                "confidence": _confidence(30, falls_curr),
                "affected_subjects": [],
                "evidence": [
                    {"label": f"{falls_curr} falls in 30d", "type": "count", "value": falls_curr},
                    {"label": f"{falls_prev} in prior 30d", "type": "count", "value": falls_prev},
                    {"label": "Escalation threshold", "type": "threshold", "value": "+30% or 3 in 30d after ≤1"},
                ],
                "deep_link": "/falls",
                "recommended_action": "Review mobility plans, footwear, environment and night-time supervision pattern.",
                "linked_regulation": "Health & Social Care Act 2008 (Reg Activities) Regs 2014 · Reg 12 · Safe care",
            })

    # 2. Medication refusals pattern
    refusals = await _count(db, "medication_admins",
        {"status": "refused", "given_at": {"$gte": last_14}})
    refusals_prev = await _count(db, "medication_admins",
        {"status": "refused", "given_at": {"$gte": _iso_days_ago(28), "$lt": last_14}})
    if refusals >= 3 and refusals > refusals_prev:
        delta = _pct_change(refusals, refusals_prev)
        risks.append({
            "id": "medication_refusals_14d",
            "domain": "medication",
            "title": f"Medication refusals rising — {refusals} in 14 days",
            "summary": f"Up from {refusals_prev} in the prior 14-day window.",
            "severity": _severity_for(45 + min(35, delta // 3)),
            "trend": _trend(delta),
            "timeframe": "14 days",
            "confidence": _confidence(14, refusals),
            "affected_subjects": [],
            "evidence": [
                {"label": f"{refusals} refusals in 14d", "type": "count", "value": refusals},
                {"label": f"{refusals_prev} in prior 14d", "type": "count", "value": refusals_prev},
                {"label": "Cluster threshold", "type": "threshold", "value": "≥3 with rising trend"},
            ],
            "deep_link": "/medications",
            "recommended_action": "Best-interest review · check capacity, advocacy involvement, and GP review of regime.",
            "linked_regulation": "Reg 12 · Safe care · CQC Medicines optimisation",
        })

    # 3. Care-task completion drop (overdue rising)
    if "care_tasks" in await db.list_collection_names():
        overdue_tasks = await db.care_tasks.count_documents(
            {"status": {"$in": ["scheduled", "open"]},
             "due_at": {"$lt": datetime.now(timezone.utc).isoformat()}}
        )
        if overdue_tasks >= 5:
            risks.append({
                "id": "care_tasks_overdue",
                "domain": "care_quality",
                "title": f"{overdue_tasks} care tasks overdue",
                "summary": "Care-task coverage is slipping. CQC's 'Effective' KQ will be challenged.",
                "severity": _severity_for(40 + min(40, overdue_tasks * 3)),
                "trend": "stable",
                "timeframe": "today",
                "confidence": 90,
                "affected_subjects": [],
                "evidence": [
                    {"label": f"{overdue_tasks} care tasks overdue right now", "type": "count", "value": overdue_tasks},
                    {"label": "Watch threshold", "type": "threshold", "value": "≥5"},
                ],
                "deep_link": "/care-tasks",
                "recommended_action": "Spot-check staffing coverage during shifts where most tasks slipped. Adjust rota if needed.",
                "linked_regulation": "Reg 9 · Person-centred care",
            })

    # 4. Wellbeing reviews overdue
    today = datetime.now(timezone.utc).date().isoformat()
    wb_overdue = await _count(db, "residents",
        {"wellbeing_next_review": {"$lt": today, "$ne": None}})
    if wb_overdue >= 2:
        risks.append({
            "id": "wellbeing_reviews_overdue",
            "domain": "wellbeing",
            "title": f"{wb_overdue} wellbeing reviews overdue",
            "summary": "Wellbeing plans past their review date — service-user voice and outcomes will be challenged.",
            "severity": _severity_for(35 + min(40, wb_overdue * 8)),
            "trend": "stable",
            "timeframe": "today",
            "confidence": 90,
            "affected_subjects": [],
            "evidence": [
                {"label": f"{wb_overdue} wellbeing reviews overdue", "type": "count", "value": wb_overdue},
            ],
            "deep_link": "/residents",
            "recommended_action": "Schedule wellbeing reviews this fortnight. Involve service users in their own plan refresh.",
            "linked_regulation": "Reg 9 · Person-centred · Reg 10 · Dignity & respect",
        })

    return risks


async def build_forecast(db, mode: Optional[str] = None) -> dict:
    """Top-level forecast endpoint payload."""
    mode = mode or "children"
    risks = await (_children_risks(db) if mode == "children" else _adult_risks(db))

    # Severity ordering
    sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    risks.sort(key=lambda r: (sev_rank.get(r["severity"], 9), -r["confidence"]))

    counts_by_severity = {
        "critical": sum(1 for r in risks if r["severity"] == "critical"),
        "high":     sum(1 for r in risks if r["severity"] == "high"),
        "medium":   sum(1 for r in risks if r["severity"] == "medium"),
        "low":      sum(1 for r in risks if r["severity"] == "low"),
    }

    if counts_by_severity["critical"] > 0:
        overall = "critical"
    elif counts_by_severity["high"] > 0:
        overall = "high"
    elif counts_by_severity["medium"] > 0:
        overall = "medium"
    else:
        overall = "stable"

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "overall_status": overall,
        "counts_by_severity": counts_by_severity,
        "emerging_risks": risks,
        "windows": ["7d", "14d", "30d", "90d"],
    }


# ---------------------------------------------------------------------------
# Resident stability scoring
# ---------------------------------------------------------------------------

async def _score_child(db, resident: dict) -> dict:
    rid = resident["id"]
    last_30 = _iso_days_ago(30)
    last_90 = _iso_days_ago(90)
    today = datetime.now(timezone.utc).date().isoformat()

    points = 0
    factors: list[dict] = []

    # Missing episodes (30d)
    missing = await _count(db, "missing_episodes", {"resident_id": rid, "reported_at": {"$gte": last_30}})
    if missing > 0:
        pts = min(missing * 12, 36)
        points += pts
        factors.append({"label": f"{missing} missing episode{'s' if missing != 1 else ''} (30d)", "weight": pts, "domain": "safeguarding"})

    # Incidents — safeguarding (90d)
    sg = await _count(db, "incidents",
        {"resident_id": rid, "occurred_at": {"$gte": last_90},
         "$or": [{"category": "safeguarding"}, {"is_safeguarding": True}]})
    if sg > 0:
        pts = min(sg * 8, 24)
        points += pts
        factors.append({"label": f"{sg} safeguarding incident{'s' if sg != 1 else ''} (90d)", "weight": pts, "domain": "safeguarding"})

    # Restraints (30d)
    rs = await _count(db, "incidents",
        {"resident_id": rid, "occurred_at": {"$gte": last_30},
         "$or": [{"category": "restraint"}, {"physical_intervention": True}]})
    if rs > 0:
        pts = min(rs * 10, 25)
        points += pts
        factors.append({"label": f"{rs} restraint event{'s' if rs != 1 else ''} (30d)", "weight": pts, "domain": "behaviour"})

    # Risk review overdue
    rr = resident.get("risk_assessment_next_review")
    if rr and rr < today:
        points += 10
        factors.append({"label": "Risk assessment overdue", "weight": 10, "domain": "compliance"})

    return _stability_from(points, factors, "children")


async def _score_adult(db, resident: dict) -> dict:
    rid = resident["id"]
    last_30 = _iso_days_ago(30)
    last_14 = _iso_days_ago(14)
    today = datetime.now(timezone.utc).date().isoformat()

    points = 0
    factors: list[dict] = []

    # Falls (30d)
    falls = await _count(db, "incidents",
        {"resident_id": rid, "occurred_at": {"$gte": last_30},
         "$or": [{"category": "fall"}, {"category": "Fall"}, {"category": "falls"}]})
    if falls > 0:
        pts = min(falls * 14, 36)
        points += pts
        factors.append({"label": f"{falls} fall{'s' if falls != 1 else ''} (30d)", "weight": pts, "domain": "mobility"})

    # MAR refusals (14d)
    ref = await _count(db, "medication_admins",
        {"resident_id": rid, "status": "refused", "given_at": {"$gte": last_14}})
    if ref > 0:
        pts = min(ref * 8, 24)
        points += pts
        factors.append({"label": f"{ref} medication refusal{'s' if ref != 1 else ''} (14d)", "weight": pts, "domain": "medication"})

    # Wellbeing review overdue
    wb = resident.get("wellbeing_next_review")
    if wb and wb < today:
        points += 10
        factors.append({"label": "Wellbeing review overdue", "weight": 10, "domain": "wellbeing"})

    # Open safeguarding
    sg_open = await _count(db, "incidents",
        {"resident_id": rid, "status": {"$ne": "closed"},
         "$or": [{"category": "safeguarding"}, {"is_safeguarding": True}]})
    if sg_open > 0:
        pts = min(sg_open * 12, 25)
        points += pts
        factors.append({"label": f"{sg_open} open adult safeguarding", "weight": pts, "domain": "safeguarding"})

    return _stability_from(points, factors, "adult")


def _stability_from(points: int, factors: list[dict], mode: str) -> dict:
    if points >= 50:
        status, label = "critical", "Critical oversight needed"
    elif points >= 30:
        status, label = "escalating", "Escalating"
    elif points >= 12:
        status, label = "emerging", "Emerging concern"
    else:
        status, label = "stable", "Stable"
    return {
        "status": status,
        "label": label,
        "score": points,
        "factors": factors,
        "mode": mode,
    }


async def build_resident_stability(db, mode: str, resident_id: Optional[str] = None) -> dict:
    sectors = CHILDREN_SECTORS if mode == "children" else ADULT_SECTORS
    q: dict = {"$or": [{"discharged_at": None}, {"discharged_at": {"$exists": False}}]}
    if mode == "children":
        q["$and"] = [{"$or": [{"service_type": {"$in": sectors}}, {"service_type": None}, {"service_type": {"$exists": False}}]}]
    else:
        q["service_type"] = {"$in": sectors}
    if resident_id:
        q["id"] = resident_id

    scoring = _score_child if mode == "children" else _score_adult
    out: list[dict] = []
    async for r in db.residents.find(q, {"_id": 0}):
        s = await scoring(db, r)
        out.append({
            "resident_id": r["id"],
            "name": r.get("preferred_name") or r.get("name"),
            "service_type": r.get("service_type") or "children",
            **s,
        })
    rank = {"critical": 0, "escalating": 1, "emerging": 2, "stable": 3}
    out.sort(key=lambda x: (rank.get(x["status"], 9), -x["score"]))
    if resident_id:
        return out[0] if out else {"resident_id": resident_id, "status": "stable", "label": "Stable", "score": 0, "factors": []}
    summary = {
        "critical":    sum(1 for x in out if x["status"] == "critical"),
        "escalating":  sum(1 for x in out if x["status"] == "escalating"),
        "emerging":    sum(1 for x in out if x["status"] == "emerging"),
        "stable":      sum(1 for x in out if x["status"] == "stable"),
    }
    return {"generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": mode, "summary": summary, "residents": out}


# ---------------------------------------------------------------------------
# Burnout forecasting — Iteration 40b
# DETERMINISTIC. AGGREGATE-METADATA-ONLY. NEVER reads private reflection text.
#
# Same data in → same risk out. Every flag links to evidence the manager can
# verify. Tone: supportive, operational, non-punitive ("support recommended",
# "pressure increasing"). Surface signals; offer 1:1 — never label someone.
# ---------------------------------------------------------------------------

# Tunables — overridable later via /api/staffing/config without code changes.
BURNOUT_CONFIG = {
    "overtime_minutes_14d_warn":     180,   # >3h overtime in 14d → factor
    "overtime_minutes_14d_high":     360,   # >6h overtime in 14d → +weight
    "weekly_planned_minutes_warn":   2880,  # 48h/wk planned
    "weekly_planned_minutes_high":   3300,  # 55h/wk planned
    "sickness_days_30d_warn":        2,
    "sickness_days_30d_high":        4,
    "sleep_ins_30d_warn":            4,
    "sleep_ins_30d_high":            6,
    "disturbance_minutes_30d_warn":  60,
    "disturbance_minutes_30d_high":  150,
    "swaps_initiated_30d_warn":      2,
    "swaps_initiated_30d_high":      4,
    "consecutive_days_warn":         6,
    "consecutive_days_high":         8,
    "late_clockins_14d_warn":        3,
    "late_clockins_14d_high":        5,
    "late_variance_minute_threshold": 10,
    "stressed_moods_14d_warn":       3,
    "stressed_moods_14d_high":       5,
    # Mitigators (lower risk):
    "checkins_14d_mitigator":        3,   # ≥3 self-care check-ins → -3 points
    # Risk thresholds (sum of weights):
    "high_threshold":                35,
    "medium_threshold":              18,
}


_OVERTIME_THRESHOLD_MIN = 60 * 8  # any single shift over 8h counts toward fatigue

STRESSED_MOODS = {"overwhelmed", "stressed"}


def _safe_iso(dt: datetime) -> str:
    return dt.isoformat()


async def _staff_signals(db, staff: dict, now: datetime, cfg: dict) -> dict:
    """Compute aggregate, metadata-only signals for a single staff member."""
    sid = staff["id"]
    last_14_dt = now - timedelta(days=14)
    last_30_dt = now - timedelta(days=30)
    last_60_dt = now - timedelta(days=60)
    last_14 = _safe_iso(last_14_dt)
    last_30 = _safe_iso(last_30_dt)
    last_60 = _safe_iso(last_60_dt)

    # --- Shifts in window
    shifts_30 = await db.shifts.find(
        {"staff_id": sid, "start_at": {"$gte": last_30}},
        {"_id": 0},
    ).to_list(500)

    # Overtime (14d)
    overtime_min_14 = 0
    long_shift_count_14 = 0
    for s in shifts_30:
        if s.get("start_at", "") < last_14:
            continue
        overtime_min_14 += int(s.get("overtime_minutes") or 0)
        if int(s.get("actual_minutes_worked") or 0) >= _OVERTIME_THRESHOLD_MIN:
            long_shift_count_14 += 1

    # Planned weekly minutes (last 7d rolling)
    last_7_dt = now - timedelta(days=7)
    last_7 = _safe_iso(last_7_dt)
    weekly_planned_min = 0
    weekly_actual_min = 0
    for s in shifts_30:
        if s.get("start_at", "") < last_7:
            continue
        if s.get("actual_minutes_worked"):
            weekly_actual_min += int(s["actual_minutes_worked"])
        try:
            start_dt = datetime.fromisoformat(s["start_at"].replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(s["end_at"].replace("Z", "+00:00"))
            weekly_planned_min += int((end_dt - start_dt).total_seconds() / 60)
        except Exception:
            pass

    # Sleep-ins (30d)
    sleep_in_count_30 = sum(1 for s in shifts_30 if s.get("is_sleep_in"))
    disturbance_min_30 = 0
    for s in shifts_30:
        for d in (s.get("sleep_in_disturbances") or []):
            disturbance_min_30 += int(d.get("minutes") or 0)

    # Late clock-ins (14d)
    late_clockins_14 = 0
    for s in shifts_30:
        if s.get("start_at", "") < last_14:
            continue
        variance = s.get("clock_in_variance_minutes")
        if variance is not None and int(variance) > cfg["late_variance_minute_threshold"]:
            late_clockins_14 += 1

    # Consecutive working days (14d window) — max run of consecutive calendar dates
    work_dates: set[str] = set()
    for s in shifts_30:
        if s.get("start_at", "") < last_14:
            continue
        try:
            d = datetime.fromisoformat(s["start_at"].replace("Z", "+00:00")).date()
            work_dates.add(d.isoformat())
        except Exception:
            pass
    consecutive_days = _longest_run(sorted(work_dates))

    # --- Sickness (30d) — approved sickness leave overlapping window
    sickness_days_30 = 0
    sickness_episodes_30 = 0
    leave_cursor = db.leave_requests.find(
        {"staff_id": sid, "kind": "sickness",
         "status": {"$in": ["approved", "pending"]}},
        {"_id": 0},
    )
    async for lv in leave_cursor:
        try:
            ls = datetime.fromisoformat(lv["start_date"]).date()
            le = datetime.fromisoformat(lv["end_date"]).date()
        except Exception:
            continue
        cutoff = last_30_dt.date()
        today = now.date()
        if le < cutoff or ls > today:
            continue
        s_eff = max(ls, cutoff)
        e_eff = min(le, today)
        days = (e_eff - s_eff).days + 1
        if days > 0:
            sickness_days_30 += days
            sickness_episodes_30 += 1

    # --- Shift swaps initiated (30d)
    swaps_initiated_30 = await db.shift_swap_requests.count_documents(
        {"requested_by_id": sid, "created_at": {"$gte": last_30}}
    )

    # --- Wellbeing check-ins (14d) — METADATA ONLY (mood enum + count)
    checkins_14 = 0
    stressed_moods_14 = 0
    try:
        async for c in db.wellbeing_checkins.find(
            {"user_id": sid, "created_at": {"$gte": last_14}},
            {"_id": 0, "mood": 1},
        ):
            checkins_14 += 1
            if c.get("mood") in STRESSED_MOODS:
                stressed_moods_14 += 1
    except Exception:
        pass

    # --- Did they work any shift in last 60d? If not, skip them entirely.
    shifts_60 = await db.shifts.count_documents(
        {"staff_id": sid, "start_at": {"$gte": last_60}}
    )
    active = shifts_60 > 0

    return {
        "overtime_min_14": overtime_min_14,
        "long_shift_count_14": long_shift_count_14,
        "weekly_planned_min": weekly_planned_min,
        "weekly_actual_min": weekly_actual_min,
        "sleep_in_count_30": sleep_in_count_30,
        "disturbance_min_30": disturbance_min_30,
        "late_clockins_14": late_clockins_14,
        "consecutive_days": consecutive_days,
        "sickness_days_30": sickness_days_30,
        "sickness_episodes_30": sickness_episodes_30,
        "swaps_initiated_30": swaps_initiated_30,
        "checkins_14": checkins_14,
        "stressed_moods_14": stressed_moods_14,
        "shifts_in_window_60": shifts_60,
        "active": active,
    }


def _longest_run(dates_iso_sorted: list[str]) -> int:
    if not dates_iso_sorted:
        return 0
    best = run = 1
    prev = datetime.fromisoformat(dates_iso_sorted[0]).date()
    for d_iso in dates_iso_sorted[1:]:
        d = datetime.fromisoformat(d_iso).date()
        run = run + 1 if (d - prev).days == 1 else 1
        best = max(best, run)
        prev = d
    return best


def _burnout_factors(sig: dict, cfg: dict) -> tuple[int, list[dict]]:
    """Return (total points, factor list). All deterministic."""
    points = 0
    factors: list[dict] = []

    # 1. Overtime hours
    if sig["overtime_min_14"] >= cfg["overtime_minutes_14d_high"]:
        h = round(sig["overtime_min_14"] / 60, 1)
        factors.append({
            "label": f"{h}h overtime in last 14 days",
            "weight": 12, "domain": "hours",
            "evidence": f"{sig['overtime_min_14']} overtime minutes",
            "threshold": f"≥{cfg['overtime_minutes_14d_high']//60}h triggers high weighting",
        })
        points += 12
    elif sig["overtime_min_14"] >= cfg["overtime_minutes_14d_warn"]:
        h = round(sig["overtime_min_14"] / 60, 1)
        factors.append({
            "label": f"{h}h overtime in last 14 days",
            "weight": 7, "domain": "hours",
            "evidence": f"{sig['overtime_min_14']} overtime minutes",
            "threshold": f"≥{cfg['overtime_minutes_14d_warn']//60}h triggers watch weighting",
        })
        points += 7

    # 2. Heavy weekly load
    if sig["weekly_planned_min"] >= cfg["weekly_planned_minutes_high"]:
        h = round(sig["weekly_planned_min"] / 60, 1)
        factors.append({
            "label": f"Heavy week — {h}h scheduled in last 7 days",
            "weight": 9, "domain": "hours",
            "evidence": f"{sig['weekly_planned_min']} planned minutes",
            "threshold": f"≥{cfg['weekly_planned_minutes_high']//60}h/week",
        })
        points += 9
    elif sig["weekly_planned_min"] >= cfg["weekly_planned_minutes_warn"]:
        h = round(sig["weekly_planned_min"] / 60, 1)
        factors.append({
            "label": f"Long week — {h}h scheduled in last 7 days",
            "weight": 5, "domain": "hours",
            "evidence": f"{sig['weekly_planned_min']} planned minutes",
            "threshold": f"≥{cfg['weekly_planned_minutes_warn']//60}h/week",
        })
        points += 5

    # 3. Sleep-in load
    if sig["sleep_in_count_30"] >= cfg["sleep_ins_30d_high"]:
        factors.append({
            "label": f"{sig['sleep_in_count_30']} sleep-ins in last 30 days",
            "weight": 10, "domain": "rest",
            "evidence": f"{sig['sleep_in_count_30']} sleep-in shifts",
            "threshold": f"≥{cfg['sleep_ins_30d_high']} in 30d",
        })
        points += 10
    elif sig["sleep_in_count_30"] >= cfg["sleep_ins_30d_warn"]:
        factors.append({
            "label": f"{sig['sleep_in_count_30']} sleep-ins in last 30 days",
            "weight": 6, "domain": "rest",
            "evidence": f"{sig['sleep_in_count_30']} sleep-in shifts",
            "threshold": f"≥{cfg['sleep_ins_30d_warn']} in 30d",
        })
        points += 6

    # 3b. Disturbance load (separate from count)
    if sig["disturbance_min_30"] >= cfg["disturbance_minutes_30d_high"]:
        m = sig["disturbance_min_30"]
        factors.append({
            "label": f"{m} min sleep-in disturbance (30d)",
            "weight": 6, "domain": "rest",
            "evidence": f"{m} disturbed minutes",
            "threshold": f"≥{cfg['disturbance_minutes_30d_high']}min",
        })
        points += 6
    elif sig["disturbance_min_30"] >= cfg["disturbance_minutes_30d_warn"]:
        m = sig["disturbance_min_30"]
        factors.append({
            "label": f"{m} min sleep-in disturbance (30d)",
            "weight": 3, "domain": "rest",
            "evidence": f"{m} disturbed minutes",
            "threshold": f"≥{cfg['disturbance_minutes_30d_warn']}min",
        })
        points += 3

    # 4. Sickness signal
    if sig["sickness_days_30"] >= cfg["sickness_days_30d_high"]:
        factors.append({
            "label": f"{sig['sickness_days_30']} sickness days in last 30 days",
            "weight": 10, "domain": "absence",
            "evidence": f"{sig['sickness_episodes_30']} episode(s), {sig['sickness_days_30']} days",
            "threshold": f"≥{cfg['sickness_days_30d_high']} days",
        })
        points += 10
    elif sig["sickness_days_30"] >= cfg["sickness_days_30d_warn"]:
        factors.append({
            "label": f"{sig['sickness_days_30']} sickness days in last 30 days",
            "weight": 5, "domain": "absence",
            "evidence": f"{sig['sickness_episodes_30']} episode(s), {sig['sickness_days_30']} days",
            "threshold": f"≥{cfg['sickness_days_30d_warn']} days",
        })
        points += 5

    # 5. Shift swaps initiated
    if sig["swaps_initiated_30"] >= cfg["swaps_initiated_30d_high"]:
        factors.append({
            "label": f"{sig['swaps_initiated_30']} shift swaps initiated (30d)",
            "weight": 7, "domain": "scheduling",
            "evidence": f"{sig['swaps_initiated_30']} swap requests created",
            "threshold": f"≥{cfg['swaps_initiated_30d_high']} in 30d",
        })
        points += 7
    elif sig["swaps_initiated_30"] >= cfg["swaps_initiated_30d_warn"]:
        factors.append({
            "label": f"{sig['swaps_initiated_30']} shift swaps initiated (30d)",
            "weight": 4, "domain": "scheduling",
            "evidence": f"{sig['swaps_initiated_30']} swap requests created",
            "threshold": f"≥{cfg['swaps_initiated_30d_warn']} in 30d",
        })
        points += 4

    # 6. Consecutive days without rest
    if sig["consecutive_days"] >= cfg["consecutive_days_high"]:
        factors.append({
            "label": f"{sig['consecutive_days']} consecutive working days",
            "weight": 9, "domain": "rest",
            "evidence": f"longest run = {sig['consecutive_days']} days in 14d window",
            "threshold": f"≥{cfg['consecutive_days_high']} days",
        })
        points += 9
    elif sig["consecutive_days"] >= cfg["consecutive_days_warn"]:
        factors.append({
            "label": f"{sig['consecutive_days']} consecutive working days",
            "weight": 5, "domain": "rest",
            "evidence": f"longest run = {sig['consecutive_days']} days in 14d window",
            "threshold": f"≥{cfg['consecutive_days_warn']} days",
        })
        points += 5

    # 7. Late clock-ins (proxy for fatigue / scheduling friction)
    if sig["late_clockins_14"] >= cfg["late_clockins_14d_high"]:
        factors.append({
            "label": f"{sig['late_clockins_14']} late clock-ins in last 14 days",
            "weight": 5, "domain": "scheduling",
            "evidence": f"variance >{cfg['late_variance_minute_threshold']}min on {sig['late_clockins_14']} shifts",
            "threshold": f"≥{cfg['late_clockins_14d_high']}",
        })
        points += 5
    elif sig["late_clockins_14"] >= cfg["late_clockins_14d_warn"]:
        factors.append({
            "label": f"{sig['late_clockins_14']} late clock-ins in last 14 days",
            "weight": 3, "domain": "scheduling",
            "evidence": f"variance >{cfg['late_variance_minute_threshold']}min on {sig['late_clockins_14']} shifts",
            "threshold": f"≥{cfg['late_clockins_14d_warn']}",
        })
        points += 3

    # 8. Stressed-mood signal (METADATA-ONLY count of self-flagged moods)
    if sig["stressed_moods_14"] >= cfg["stressed_moods_14d_high"]:
        factors.append({
            "label": f"Self-flagged 'overwhelmed/stressed' {sig['stressed_moods_14']}× in 14d",
            "weight": 10, "domain": "wellbeing",
            "evidence": f"{sig['stressed_moods_14']} stressed check-ins (mood metadata only)",
            "threshold": f"≥{cfg['stressed_moods_14d_high']}",
            "privacy_note": "Mood label only — no diary text is read.",
        })
        points += 10
    elif sig["stressed_moods_14"] >= cfg["stressed_moods_14d_warn"]:
        factors.append({
            "label": f"Self-flagged 'overwhelmed/stressed' {sig['stressed_moods_14']}× in 14d",
            "weight": 6, "domain": "wellbeing",
            "evidence": f"{sig['stressed_moods_14']} stressed check-ins (mood metadata only)",
            "threshold": f"≥{cfg['stressed_moods_14d_warn']}",
            "privacy_note": "Mood label only — no diary text is read.",
        })
        points += 6

    # 9. Self-care mitigator
    if sig["checkins_14"] >= cfg["checkins_14d_mitigator"] and sig["stressed_moods_14"] < cfg["stressed_moods_14d_warn"]:
        factors.append({
            "label": f"Self-care: {sig['checkins_14']} wellbeing check-ins in 14d",
            "weight": -3, "domain": "mitigator",
            "evidence": f"{sig['checkins_14']} self-care check-ins (mood metadata only)",
            "threshold": "Lowers risk because individual is actively self-monitoring.",
            "privacy_note": "Mood label only — no diary text is read.",
        })
        points -= 3

    return max(0, points), factors


def _burnout_actions(risk: str, factors: list[dict]) -> list[str]:
    """Supportive, non-punitive recommended actions."""
    domains = {f.get("domain") for f in factors if f.get("weight", 0) > 0}
    actions: list[str] = []

    if risk == "high":
        actions.append("Schedule a supportive 1:1 this week — wellbeing first, workload second.")
    elif risk == "medium":
        actions.append("Plan a short check-in within the next 2 weeks.")

    if "hours" in domains:
        actions.append("Review next rota: aim to reduce overtime and protect rest days.")
    if "rest" in domains:
        actions.append("Rebalance sleep-in share across the team; verify rest periods between shifts.")
    if "absence" in domains:
        actions.append("Welfare follow-up after recent sickness — confirm any adjustments needed on return.")
    if "scheduling" in domains:
        actions.append("Discuss commuting/childcare or other scheduling friction; offer rota flexibility.")
    if "wellbeing" in domains:
        actions.append("Acknowledge self-flagged stress with empathy; signpost EAP and reflective practice.")

    if not actions:
        actions.append("No action required — pattern is healthy. Acknowledge consistency at the next 1:1.")
    return actions


def _risk_from_points(points: int, cfg: dict) -> tuple[str, str]:
    if points >= cfg["high_threshold"]:
        return "high", "Support recommended"
    if points >= cfg["medium_threshold"]:
        return "medium", "Pressure increasing"
    return "low", "Steady"


async def build_burnout_forecast(db, cfg_override: Optional[dict] = None) -> dict:
    """Org-wide burnout forecast — manager+ only.

    Aggregate-metadata only. NEVER reads private reflection text or
    wellbeing check-in notes.
    """
    cfg = {**BURNOUT_CONFIG, **(cfg_override or {})}
    now = datetime.now(timezone.utc)

    staff_rows: list[dict] = []
    async for u in db.users.find(
        {"$or": [{"is_active": True}, {"is_active": {"$exists": False}}]},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "email": 1},
    ):
        sig = await _staff_signals(db, u, now, cfg)
        if not sig["active"]:
            continue
        points, factors = _burnout_factors(sig, cfg)
        risk, label = _risk_from_points(points, cfg)
        # Sort factors by absolute weight descending for "top factors"
        factors_sorted = sorted(factors, key=lambda f: -abs(f["weight"]))
        staff_rows.append({
            "staff_id": u["id"],
            "name": u.get("name") or u.get("email"),
            "role": u.get("role"),
            "risk": risk,
            "label": label,
            "score": points,
            "top_factors": factors_sorted[:2],
            "factors": factors_sorted,
            "recommended_actions": _burnout_actions(risk, factors),
            "signals_summary": {
                "shifts_in_window_60": sig["shifts_in_window_60"],
                "overtime_min_14": sig["overtime_min_14"],
                "sleep_in_count_30": sig["sleep_in_count_30"],
                "sickness_days_30": sig["sickness_days_30"],
                "consecutive_days_14": sig["consecutive_days"],
                "stressed_moods_14": sig["stressed_moods_14"],
                "checkins_14": sig["checkins_14"],
            },
        })

    # Sort: high first, then by score desc
    rank = {"high": 0, "medium": 1, "low": 2}
    staff_rows.sort(key=lambda r: (rank[r["risk"]], -r["score"]))

    summary = {
        "high":   sum(1 for r in staff_rows if r["risk"] == "high"),
        "medium": sum(1 for r in staff_rows if r["risk"] == "medium"),
        "low":    sum(1 for r in staff_rows if r["risk"] == "low"),
        "total_staff": len(staff_rows),
    }
    if summary["high"] > 0:
        overall = "high_pressure"
    elif summary["medium"] >= 2:
        overall = "support_recommended"
    elif summary["medium"] >= 1:
        overall = "watch"
    else:
        overall = "stable"

    return {
        "generated_at": now.isoformat(),
        "overall_status": overall,
        "summary": summary,
        "config": cfg,
        "staff": staff_rows,
        "privacy_notice": (
            "Burnout forecasting uses aggregate signals and metadata only "
            "(shift counts, hours, sickness days, mood labels). "
            "Private reflection content is never read."
        ),
    }
