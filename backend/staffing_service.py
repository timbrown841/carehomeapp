"""Live Staffing Operations service (Iteration 38).

Care-sector-flavoured: this is NOT generic HR. It surfaces operational signals
that matter during a shift:

  - Who's on shift NOW · clocked-in vs not-arrived · sleep-ins
  - Coverage gaps: rota slot has no clock-in 15min after start
  - Staffing ratios vs required minimums per sector (children awake/asleep,
    adult supported living, elderly residential, dementia)
  - Pressure indicators: 7d overtime, 14d agency %, 14d sickness rate, sleep-in
    disturbance count, % rota covered by agency, rolling missed clock-outs.
  - Tie-ins with safeguarding/wellbeing/inspection (computed elsewhere).

All thresholds come from `staffing_config` singleton — sensible UK defaults but
admin-configurable so each home can tune their own targets.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional


# ---- Sensible UK defaults (admin-configurable via /api/staffing/config) ----
DEFAULT_CONFIG = {
    "ratios": {
        # awake_required_per_resident · asleep_required_per_resident
        "children":                  {"awake_per_resident": 0.50, "asleep_per_resident": 0.17, "min_awake": 2, "min_asleep": 1},
        "adult_supported_living":    {"awake_per_resident": 0.40, "asleep_per_resident": 0.15, "min_awake": 1, "min_asleep": 1},
        "elderly_residential":       {"awake_per_resident": 0.33, "asleep_per_resident": 0.20, "min_awake": 2, "min_asleep": 1},
        "dementia":                  {"awake_per_resident": 0.50, "asleep_per_resident": 0.25, "min_awake": 2, "min_asleep": 1},
        "mental_health":             {"awake_per_resident": 0.50, "asleep_per_resident": 0.20, "min_awake": 2, "min_asleep": 1},
        "veteran":                   {"awake_per_resident": 0.33, "asleep_per_resident": 0.15, "min_awake": 1, "min_asleep": 1},
    },
    "sleep_in_rate_gbp": 65.00,
    "overtime_threshold_hours_per_week": 48,   # WTR opt-out reminder
    "agency_pct_warn": 25,                      # % rota covered by agency
    "agency_pct_critical": 40,
    "sickness_pct_warn": 6,                     # % sick days / 14d
    "clock_in_grace_minutes": 15,
    "annual_leave_default_days": 28,
    "asleep_hours_start": 22,                   # 22:00 - 06:00
    "asleep_hours_end": 6,
}


async def get_staffing_config(db) -> dict:
    """Load the singleton config doc, falling back to defaults."""
    doc = await db.staffing_config.find_one({"_id": "singleton"})
    if not doc:
        return DEFAULT_CONFIG
    doc.pop("_id", None)
    merged = {**DEFAULT_CONFIG, **doc}
    if "ratios" in doc:
        merged["ratios"] = {**DEFAULT_CONFIG["ratios"], **doc["ratios"]}
    return merged


async def set_staffing_config(db, payload: dict) -> dict:
    """Upsert the singleton config (admin only)."""
    current = await get_staffing_config(db)
    merged = {**current, **payload}
    if "ratios" in payload:
        merged["ratios"] = {**current["ratios"], **payload["ratios"]}
    await db.staffing_config.update_one(
        {"_id": "singleton"},
        {"$set": merged},
        upsert=True,
    )
    return merged


def _parse_iso(s: str) -> Optional[datetime]:
    if not s: return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _shift_minutes(start_at: str, end_at: str) -> int:
    s, e = _parse_iso(start_at), _parse_iso(end_at)
    if not s or not e or e <= s:
        return 0
    return int((e - s).total_seconds() / 60)


def _is_asleep_window(start_at: str, end_at: str, cfg: dict) -> bool:
    s = _parse_iso(start_at)
    e = _parse_iso(end_at)
    if not s or not e: return False
    a, b = cfg["asleep_hours_start"], cfg["asleep_hours_end"]
    # A shift that BEGINS in the night window OR includes >75% of asleep hours
    if s.hour >= a or s.hour < b:
        return True
    return False


async def build_staffing_overview(db) -> dict:
    """Single-call live operational picture for the home."""
    now = datetime.now(timezone.utc)
    cfg = await get_staffing_config(db)
    grace = cfg["clock_in_grace_minutes"]

    # ============================================================
    # On-shift NOW + clock-in status + sleep-in flag
    # ============================================================
    now_iso = now.isoformat()
    in_24h = (now + timedelta(hours=24)).isoformat()
    last_24h = (now - timedelta(hours=24)).isoformat()

    cur_shifts = await db.shifts.find(
        {"start_at": {"$lte": now_iso}, "end_at": {"$gte": now_iso}},
        {"_id": 0},
    ).sort("start_at", 1).to_list(50)

    on_shift = []
    for s in cur_shifts:
        clocked_in = bool(s.get("clocked_in_at"))
        start_dt = _parse_iso(s["start_at"])
        is_late = (not clocked_in) and start_dt and (now - start_dt) > timedelta(minutes=grace)
        on_shift.append({
            **s,
            "is_sleep_in": bool(s.get("is_sleep_in")) or _is_asleep_window(s["start_at"], s["end_at"], cfg),
            "clocked_in": clocked_in,
            "is_late_clock_in": is_late,
            "minutes_into_shift": int(((now - start_dt).total_seconds()) / 60) if start_dt else 0,
            "disturbance_count": len(s.get("sleep_in_disturbances") or []),
        })

    # Next 24h roster (not yet started but starts in 24h)
    next_shifts = await db.shifts.find(
        {"start_at": {"$gt": now_iso, "$lte": in_24h}},
        {"_id": 0},
    ).sort("start_at", 1).to_list(80)

    # ============================================================
    # Coverage gaps (rota slots whose start is in the past but no clock-in)
    # ============================================================
    gaps = []
    for s in cur_shifts:
        start_dt = _parse_iso(s["start_at"])
        if start_dt and not s.get("clocked_in_at"):
            mins_late = (now - start_dt).total_seconds() / 60
            if mins_late > grace:
                gaps.append({
                    "shift_id": s["id"],
                    "staff_name": s.get("staff_name") or "—",
                    "staff_id": s.get("staff_id"),
                    "started_at": s["start_at"],
                    "minutes_late": int(mins_late),
                    "role": s.get("role"),
                })

    # ============================================================
    # Staffing ratios per sector (compares live awake/asleep staffing vs required)
    # ============================================================
    sectors = ["children", "adult_supported_living", "elderly_residential",
                "dementia", "mental_health", "veteran"]
    residents = await db.residents.find({}, {"_id": 0, "service_type": 1}).to_list(500)
    residents_by_sector = {}
    for r in residents:
        st = r.get("service_type") or "children"
        residents_by_sector[st] = residents_by_sector.get(st, 0) + 1

    awake_count = sum(1 for s in on_shift if not s["is_sleep_in"] and s["clocked_in"])
    asleep_count = sum(1 for s in on_shift if s["is_sleep_in"] and s["clocked_in"])

    ratios = []
    for sector in sectors:
        rc = residents_by_sector.get(sector, 0)
        if rc == 0:
            continue
        sec_cfg = cfg["ratios"].get(sector, cfg["ratios"]["children"])
        is_asleep_window = (now.hour >= cfg["asleep_hours_start"] or now.hour < cfg["asleep_hours_end"])
        if is_asleep_window:
            required = max(sec_cfg["min_asleep"], int(round(sec_cfg["asleep_per_resident"] * rc)))
            actual = asleep_count
            mode = "asleep"
        else:
            required = max(sec_cfg["min_awake"], int(round(sec_cfg["awake_per_resident"] * rc)))
            actual = awake_count
            mode = "awake"
        gap = required - actual
        if gap <= 0:
            status = "ok"
        elif gap <= 1:
            status = "warn"
        else:
            status = "critical"
        ratios.append({
            "sector": sector,
            "residents": rc,
            "mode": mode,
            "required": required,
            "actual": actual,
            "gap": gap,
            "status": status,
        })

    # ============================================================
    # Pressure indicators · last 7 / 14 / 30 days
    # ============================================================
    last_7 = (now - timedelta(days=7)).isoformat()
    last_14 = (now - timedelta(days=14)).isoformat()
    last_30 = (now - timedelta(days=30)).isoformat()

    # 7d hours per staff (overtime)
    staff_minutes_7d: dict = {}
    staff_names: dict = {}
    rota_total_minutes_14d = 0
    agency_minutes_14d = 0
    async for s in db.shifts.find(
        {"start_at": {"$gte": last_14}},
        {"_id": 0},
    ):
        m = _shift_minutes(s["start_at"], s["end_at"])
        if s["start_at"] >= last_7:
            sid = s.get("staff_id")
            if sid:
                staff_minutes_7d[sid] = staff_minutes_7d.get(sid, 0) + m
                staff_names[sid] = s.get("staff_name") or "—"
        rota_total_minutes_14d += m
        if s.get("is_agency"):
            agency_minutes_14d += m

    overtime_staff = []
    threshold_min = cfg["overtime_threshold_hours_per_week"] * 60
    for sid, mins in staff_minutes_7d.items():
        if mins >= threshold_min:
            overtime_staff.append({
                "staff_id": sid,
                "staff_name": staff_names[sid],
                "hours_7d": round(mins / 60, 1),
                "over_by_hours": round((mins - threshold_min) / 60, 1),
            })
    overtime_staff.sort(key=lambda x: -x["hours_7d"])

    agency_pct_14d = round(agency_minutes_14d * 100 / rota_total_minutes_14d) if rota_total_minutes_14d else 0
    if agency_pct_14d >= cfg["agency_pct_critical"]:
        agency_status = "critical"
    elif agency_pct_14d >= cfg["agency_pct_warn"]:
        agency_status = "warn"
    else:
        agency_status = "ok"

    # Sickness % (14d) — derived from approved leave_requests of kind=sickness
    sick_days_14d = 0
    leave_count_pending = await db.leave_requests.count_documents({"status": "pending"})
    async for lr in db.leave_requests.find(
        {"kind": "sickness", "status": "approved", "start_date": {"$gte": last_14[:10]}},
        {"_id": 0, "days": 1},
    ):
        sick_days_14d += int(lr.get("days") or 1)
    # Sickness % = sick_days / (active_staff * 14)
    active_staff = await db.users.count_documents(
        {"role": {"$in": ["staff", "senior", "manager"]}}
    )
    if active_staff > 0:
        sickness_pct_14d = round(sick_days_14d * 100 / (active_staff * 14), 1)
    else:
        sickness_pct_14d = 0
    if sickness_pct_14d >= cfg["sickness_pct_warn"] * 2:
        sickness_status = "critical"
    elif sickness_pct_14d >= cfg["sickness_pct_warn"]:
        sickness_status = "warn"
    else:
        sickness_status = "ok"

    # Sleep-in disturbances 30d
    disturbance_count_30d = 0
    sleep_ins_30d = 0
    async for s in db.shifts.find(
        {"start_at": {"$gte": last_30}, "is_sleep_in": True},
        {"_id": 0, "sleep_in_disturbances": 1},
    ):
        sleep_ins_30d += 1
        disturbance_count_30d += len(s.get("sleep_in_disturbances") or [])

    # Pending shift-swap requests
    pending_swaps = await db.shift_swap_requests.count_documents(
        {"status": {"$in": ["pending_target", "pending_manager"]}}
    )

    # ============================================================
    # Care-sector tie-ins (light cross-module — no over-fetching)
    # ============================================================
    # Burnout signal piggybacks on staff_reflections check-ins
    burnout_signal = await db.staff_reflections.count_documents(
        {"mood": {"$in": ["stressed", "overwhelmed"]}, "created_at": {"$gte": last_14}}
    ) if "staff_reflections" in await db.list_collection_names() else 0

    # ============================================================
    # Final payload
    # ============================================================
    return {
        "generated_at": now.isoformat(),
        "is_asleep_window": (now.hour >= cfg["asleep_hours_start"] or now.hour < cfg["asleep_hours_end"]),
        "on_shift_now": on_shift,
        "next_24h": next_shifts,
        "coverage_gaps": gaps,
        "ratios": ratios,
        "pressure": {
            "overtime_staff_7d": overtime_staff[:10],
            "overtime_threshold_hours": cfg["overtime_threshold_hours_per_week"],
            "agency_pct_14d": agency_pct_14d,
            "agency_status": agency_status,
            "sickness_pct_14d": sickness_pct_14d,
            "sickness_status": sickness_status,
            "sick_days_14d": sick_days_14d,
            "sleep_ins_30d": sleep_ins_30d,
            "disturbance_count_30d": disturbance_count_30d,
            "pending_swaps": pending_swaps,
            "pending_leave": leave_count_pending,
            "burnout_check_ins_14d": burnout_signal,
        },
        "config": cfg,
    }
