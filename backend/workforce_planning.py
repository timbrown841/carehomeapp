"""Phase E.4 — Workforce Planning & Capacity Intelligence.

A predictive-planning layer that turns Safelyn from a compliance-tracking
system into a workforce-forecasting platform.

Endpoints (all manager+ tier ≥3):
  GET /api/workforce-planning/dashboard?sector=children|adult
        — full strategic dashboard payload (forecast, cliff edge by role,
          renewal waves, capacity, manager actions).
  GET /api/workforce-planning/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&sector=
        — unified calendar of events (training expiries, supervisions due,
          appraisals due, induction targets, probation reviews, DBS renewals,
          qualification reviews).
  GET /api/workforce-planning/capacity?from=&to=&sector=
        — day-by-day capacity (staff total, on shift, on leave, sickness,
          in training, vacancies).

All metrics deterministic — no AI scoring. Sector-aware via training course
sector filter (children's vs adult mandatory training).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query


router = APIRouter(prefix="/api", tags=["Workforce Planning"])

_db = None
_get_current_user = None
_require_tier = None


def init(*, db, get_current_user, require_tier):
    global _db, _get_current_user, _require_tier
    _db = db
    _get_current_user = get_current_user
    _require_tier = require_tier


# ---- Helpers ---------------------------------------------------------------

def _today() -> date:
    return date.today()


def _iso(d: date) -> str:
    return d.isoformat()


def _add(d: date, days: int) -> date:
    return d + timedelta(days=days)


def _rag(pct: int) -> str:
    if pct >= 85:
        return "green"
    if pct >= 65:
        return "amber"
    return "red"


def _month_label(ym: str) -> str:
    try:
        return datetime.strptime(ym, "%Y-%m").strftime("%B %Y")
    except Exception:
        return ym


def _course_hours(c: dict) -> int:
    """Course default training hours — 6h fallback."""
    return int(c.get("duration_hours") or c.get("hours") or 6)


async def _staff_list() -> list[dict]:
    """Active staff users (excluding admins — they're not part of the
    operational rota in practice but we include them for completeness)."""
    return await _db.users.find(
        {"role": {"$in": ["staff", "senior", "manager", "admin"]}},
        {"_id": 0, "id": 1, "name": 1, "role": 1},
    ).to_list(500)


# ---- Routes ----------------------------------------------------------------

def build_routes():
    router.routes.clear()

    @router.get("/workforce-planning/dashboard")
    async def workforce_dashboard(
        sector: str = Query(..., pattern="^(children|adult)$"),
        _: dict = Depends(_require_tier(3)),
    ):
        today = _today()
        today_s = _iso(today)
        d30 = _iso(_add(today, 30))
        d60 = _iso(_add(today, 60))
        d90 = _iso(_add(today, 90))
        d180 = _iso(_add(today, 183))

        staff = await _staff_list()
        staff_by_id = {s["id"]: s for s in staff}
        staff_total = len(staff)

        # === Mandatory training records ===
        courses = await _db.tc_courses.find(
            {"sector": {"$in": [sector, "both"]}, "mandatory": True}, {"_id": 0}
        ).to_list(500)
        code_to_course = {c["code"]: c for c in courses}
        records = await _db.tc_records.find(
            {"course_code": {"$in": list(code_to_course.keys())}}, {"_id": 0}
        ).to_list(5000)

        # === Cliff edge buckets + by-role breakdown ===
        # Build latest record per (staff, course) so each cell appears once
        latest_by_cell: dict = {}
        for r in records:
            key = (r.get("staff_id"), r.get("course_code"))
            existing = latest_by_cell.get(key)
            if not existing or (r.get("completed_on") or "") > (existing.get("completed_on") or ""):
                latest_by_cell[key] = r

        # Initialise role buckets
        role_buckets = {
            "staff": {"role": "staff", "label": "Support Worker", "expired": 0, "in_30": 0, "in_60": 0, "in_90": 0, "ok": 0, "missing": 0, "total_cells": 0},
            "senior": {"role": "senior", "label": "Senior", "expired": 0, "in_30": 0, "in_60": 0, "in_90": 0, "ok": 0, "missing": 0, "total_cells": 0},
            "manager": {"role": "manager", "label": "Manager", "expired": 0, "in_30": 0, "in_60": 0, "in_90": 0, "ok": 0, "missing": 0, "total_cells": 0},
            "admin": {"role": "admin", "label": "Admin", "expired": 0, "in_30": 0, "in_60": 0, "in_90": 0, "ok": 0, "missing": 0, "total_cells": 0},
        }
        total_expired = total_30 = total_60 = total_90 = 0
        cliff_list: list[dict] = []
        wave_records: list[dict] = []  # for renewal-wave grouping

        for s in staff:
            sid = s["id"]
            role = s.get("role") or "staff"
            if role not in role_buckets:
                continue
            for code, c in code_to_course.items():
                role_buckets[role]["total_cells"] += 1
                r = latest_by_cell.get((sid, code))
                if not r:
                    role_buckets[role]["missing"] += 1
                    continue
                exp = r.get("expires_on")
                if not exp:
                    role_buckets[role]["ok"] += 1
                    continue
                if exp < today_s:
                    role_buckets[role]["expired"] += 1
                    total_expired += 1
                    cliff_list.append({"staff_id": sid, "staff_name": s["name"],
                                       "staff_role": role, "course_code": code,
                                       "course_name": c["name"], "expires_on": exp,
                                       "bucket": "overdue"})
                elif exp <= d30:
                    role_buckets[role]["in_30"] += 1
                    total_30 += 1
                    cliff_list.append({"staff_id": sid, "staff_name": s["name"],
                                       "staff_role": role, "course_code": code,
                                       "course_name": c["name"], "expires_on": exp,
                                       "bucket": "30"})
                elif exp <= d60:
                    role_buckets[role]["in_60"] += 1
                    total_60 += 1
                    cliff_list.append({"staff_id": sid, "staff_name": s["name"],
                                       "staff_role": role, "course_code": code,
                                       "course_name": c["name"], "expires_on": exp,
                                       "bucket": "60"})
                elif exp <= d90:
                    role_buckets[role]["in_90"] += 1
                    total_90 += 1
                    cliff_list.append({"staff_id": sid, "staff_name": s["name"],
                                       "staff_role": role, "course_code": code,
                                       "course_name": c["name"], "expires_on": exp,
                                       "bucket": "90"})
                else:
                    role_buckets[role]["ok"] += 1
                # Wave tracking — anything renewing in the next 6 months
                if today_s <= exp <= d180:
                    wave_records.append({"staff_id": sid, "staff_name": s["name"],
                                          "course_code": code, "course_name": c["name"],
                                          "course_hours": _course_hours(c),
                                          "expires_on": exp})

        # Compute per-role RAG and compliance %
        by_role = []
        for rb in role_buckets.values():
            cells = max(rb["total_cells"], 1)
            compliant = rb["ok"] + rb["in_60"] + rb["in_90"]  # in_30 still flagged
            pct = round((compliant / cells) * 100)
            by_role.append({**rb, "compliance_pct": pct, "rag": _rag(pct)})

        # === Renewal waves (next 6 months) ===
        wave_by_month: dict[str, dict] = {}
        for w in wave_records:
            ym = w["expires_on"][:7]
            wm = wave_by_month.setdefault(ym, {
                "month": ym, "month_label": _month_label(ym),
                "course_count": 0, "staff_count": 0,
                "estimated_hours": 0,
                "recommended_action_date": _iso(date.fromisoformat(f"{ym}-01") - timedelta(days=30)),
                "courses": set(), "staff": set(), "records": [],
            })
            wm["courses"].add(w["course_code"])
            wm["staff"].add(w["staff_id"])
            wm["estimated_hours"] += w["course_hours"]
            wm["records"].append(w)
        waves = []
        for ym in sorted(wave_by_month.keys()):
            wm = wave_by_month[ym]
            waves.append({
                "month": wm["month"], "month_label": wm["month_label"],
                "course_count": len(wm["courses"]),
                "staff_count": len(wm["staff"]),
                "estimated_hours": wm["estimated_hours"],
                "recommended_action_date": wm["recommended_action_date"],
                "courses": sorted(list(wm["courses"])),
                "renewals": sorted(wm["records"], key=lambda r: r["expires_on"])[:50],
            })

        # === Workforce capacity (today + next 7 days summary) ===
        capacity_window_end = _iso(_add(today, 7))
        # Shifts in the next 7 days
        shifts = await _db.shifts.find(
            {"start_at": {"$lte": _iso(_add(today, 8)) + "T23:59:59"}},
            {"_id": 0}
        ).to_list(2000)
        # Approved leave overlapping today
        leave = await _db.leave_requests.find(
            {"status": "approved",
             "start_date": {"$lte": _iso(_add(today, 30))},
             "end_date": {"$gte": today_s}},
            {"_id": 0}
        ).to_list(500)
        on_leave_today = sum(
            1 for l in leave
            if (l.get("start_date") or "")[:10] <= today_s <= (l.get("end_date") or "9999-99-99")[:10]
            and l.get("kind") in ("annual_leave", "parental", "compassionate", "unpaid")
        )
        on_sick_today = sum(
            1 for l in leave
            if (l.get("start_date") or "")[:10] <= today_s <= (l.get("end_date") or "9999-99-99")[:10]
            and l.get("kind") == "sickness"
        )
        on_training_today = sum(
            1 for l in leave
            if (l.get("start_date") or "")[:10] <= today_s <= (l.get("end_date") or "9999-99-99")[:10]
            and l.get("kind") == "training"
        )
        # Currently on shift = shifts whose start..end straddles now
        now_iso = datetime.now(timezone.utc).isoformat()
        on_shift_now = sum(
            1 for s in shifts
            if (s.get("start_at") or "") <= now_iso <= (s.get("end_at") or "")
        )

        # Vacancies: count staff_profiles flagged as vacancy or with employment_status != active
        vacancies = await _db.staff_profiles.count_documents(
            {"$or": [
                {"employment_status": "vacant"},
                {"is_vacant": True},
            ]}
        )

        capacity = {
            "staff_total": staff_total,
            "on_shift_now": on_shift_now,
            "on_leave_today": on_leave_today,
            "on_sickness_today": on_sick_today,
            "on_training_today": on_training_today,
            "vacancies": vacancies,
            "available_today": max(staff_total - on_leave_today - on_sick_today - on_training_today, 0),
            "release_for_training_safe": (staff_total - on_leave_today - on_sick_today - on_training_today) >= max(int(staff_total * 0.6), 1),
        }

        # === Workforce Readiness Forecast (30/60/90) ===
        # Compliance projection if NOTHING is renewed:
        total_cells = max(sum(rb["total_cells"] for rb in role_buckets.values()), 1)
        # Today's compliance baseline
        compliant_now = sum(rb["ok"] + rb["in_30"] + rb["in_60"] + rb["in_90"] for rb in role_buckets.values())
        baseline_pct = round((compliant_now / total_cells) * 100)
        # Projection at +30d: lose in_30 (those expire) unless renewed
        proj_30 = round(((compliant_now - total_30) / total_cells) * 100)
        proj_60 = round(((compliant_now - total_30 - total_60) / total_cells) * 100)
        proj_90 = round(((compliant_now - total_30 - total_60 - total_90) / total_cells) * 100)
        forecast = {
            "today": {"projected_compliance_pct": baseline_pct, "rag": _rag(baseline_pct)},
            "in_30_days": {"projected_compliance_pct": max(proj_30, 0), "rag": _rag(max(proj_30, 0)),
                           "at_risk_renewals": total_30},
            "in_60_days": {"projected_compliance_pct": max(proj_60, 0), "rag": _rag(max(proj_60, 0)),
                           "at_risk_renewals": total_30 + total_60},
            "in_90_days": {"projected_compliance_pct": max(proj_90, 0), "rag": _rag(max(proj_90, 0)),
                           "at_risk_renewals": total_30 + total_60 + total_90},
        }

        # === Manager Actions Panel ===
        # Supervisions: staff with no supervision in last 90 days
        ninety_ago = _iso(_add(today, -90))
        sup_recent = await _db.supervisions.distinct(
            "staff_id", {"completed_at": {"$gte": ninety_ago}, "kind": "supervision"}
        )
        sup_overdue_staff = [s for s in staff if s["id"] not in sup_recent]

        # DBS expiry from staff_files
        dbs_files = await _db.staff_files.find(
            {"folder_id": "dbs"}, {"_id": 0}
        ).to_list(500)
        # Per-staff most recent DBS
        dbs_by_staff = {}
        for f in dbs_files:
            sid = f.get("staff_user_id")
            if not sid:
                continue
            cur = dbs_by_staff.get(sid)
            if not cur or (f.get("uploaded_at") or "") > (cur.get("uploaded_at") or ""):
                dbs_by_staff[sid] = f
        dbs_expiring_30 = [sid for sid, f in dbs_by_staff.items()
                            if f.get("expiry_date") and (f["expiry_date"] or "")[:10] <= d30]

        # Inductions not signed off / overdue
        inductions = await _db.induction_assignments.find(
            {"signed_off_at": None}, {"_id": 0}
        ).to_list(500)
        induction_overdue = [
            i for i in inductions
            if (i.get("target_completion") or "")[:10] and (i["target_completion"] or "")[:10] < today_s
        ]

        # Probation reviews approaching (staff_files folder=probation with expiry within 30d)
        prob_files = await _db.staff_files.find(
            {"folder_id": "probation"}, {"_id": 0}
        ).to_list(500)
        prob_due = [f for f in prob_files
                     if f.get("expiry_date") and today_s <= (f["expiry_date"] or "")[:10] <= d30]

        manager_actions = []
        if total_expired > 0:
            manager_actions.append({
                "priority": 1, "severity": "red", "action_type": "training_overdue",
                "label": f"Renew {total_expired} expired mandatory training record{'' if total_expired == 1 else 's'}",
                "count": total_expired,
                "deep_link": "/training",
            })
        if len(dbs_expiring_30) > 0:
            manager_actions.append({
                "priority": 2, "severity": "red", "action_type": "dbs_renewal",
                "label": f"Renew DBS for {len(dbs_expiring_30)} staff (expiring ≤30 days)",
                "count": len(dbs_expiring_30),
                "deep_link": "/hr",
            })
        if total_30 > 0:
            manager_actions.append({
                "priority": 3, "severity": "amber", "action_type": "training_expiring_30",
                "label": f"Book {total_30} training renewal{'' if total_30 == 1 else 's'} expiring in 30 days",
                "count": total_30,
                "deep_link": "/training",
            })
        if len(sup_overdue_staff) > 0:
            manager_actions.append({
                "priority": 4, "severity": "amber", "action_type": "supervision_due",
                "label": f"Schedule supervision for {len(sup_overdue_staff)} staff (no session in 90d)",
                "count": len(sup_overdue_staff),
                "deep_link": "/supervisions",
            })
        if len(induction_overdue) > 0:
            manager_actions.append({
                "priority": 5, "severity": "amber", "action_type": "induction_overdue",
                "label": f"Complete sign-off for {len(induction_overdue)} overdue induction{'' if len(induction_overdue) == 1 else 's'}",
                "count": len(induction_overdue),
                "deep_link": "/induction",
            })
        if len(prob_due) > 0:
            manager_actions.append({
                "priority": 6, "severity": "amber", "action_type": "probation_review",
                "label": f"Complete probation review for {len(prob_due)} staff",
                "count": len(prob_due),
                "deep_link": "/hr",
            })
        if total_60 > 0:
            manager_actions.append({
                "priority": 7, "severity": "blue", "action_type": "training_expiring_60",
                "label": f"Plan renewal for {total_60} training record{'' if total_60 == 1 else 's'} expiring in 31-60 days",
                "count": total_60,
                "deep_link": "/training",
            })

        return {
            "sector": sector,
            "today": today_s,
            "forecast": forecast,
            "cliff_edge": {
                "buckets": {
                    "overdue": total_expired, "in_30": total_30,
                    "in_60": total_60, "in_90": total_90,
                },
                "by_role": by_role,
                "top_list": sorted(cliff_list, key=lambda x: x.get("expires_on") or "")[:50],
            },
            "renewal_waves": waves[:6],  # next 6 months
            "capacity": capacity,
            "manager_actions": manager_actions,
        }

    @router.get("/workforce-planning/calendar")
    async def workforce_calendar(
        sector: str = Query("children", pattern="^(children|adult)$"),
        from_date: str = Query(..., alias="from"),
        to_date: str = Query(..., alias="to"),
        _: dict = Depends(_require_tier(3)),
    ):
        """Unified calendar of forward-looking workforce events."""
        try:
            f = date.fromisoformat(from_date)
            t = date.fromisoformat(to_date)
        except ValueError:
            raise HTTPException(400, "from / to must be YYYY-MM-DD")
        if t < f:
            raise HTTPException(400, "to must be on or after from")
        f_s, t_s = _iso(f), _iso(t)

        events: list[dict] = []
        staff = await _staff_list()
        staff_by_id = {s["id"]: s for s in staff}

        # Training expiries
        courses = await _db.tc_courses.find(
            {"sector": {"$in": [sector, "both"]}, "mandatory": True}, {"_id": 0}
        ).to_list(500)
        code_to_name = {c["code"]: c["name"] for c in courses}
        recs = await _db.tc_records.find(
            {"course_code": {"$in": list(code_to_name.keys())},
             "expires_on": {"$gte": f_s, "$lte": t_s}}, {"_id": 0}
        ).to_list(2000)
        for r in recs:
            events.append({
                "id": f"train-{r.get('id', '')}",
                "kind": "training_expiry",
                "label": f"Training expires: {code_to_name.get(r['course_code'], r['course_code'])}",
                "date": (r.get("expires_on") or "")[:10],
                "staff_id": r.get("staff_id"),
                "staff_name": r.get("staff_name"),
                "deep_link": "/training",
                "severity": "red" if r.get("expires_on", "") < _iso(_today()) else "amber",
            })

        # Supervisions due (next supervision = last_completed + 28d for staff, 56d for senior+)
        sups = await _db.supervisions.find(
            {"kind": "supervision"}, {"_id": 0}
        ).to_list(2000)
        last_by_staff: dict = {}
        for s in sups:
            sid = s.get("staff_id")
            if not sid:
                continue
            cur = last_by_staff.get(sid)
            if not cur or (s.get("completed_at") or "") > (cur.get("completed_at") or ""):
                last_by_staff[sid] = s
        for staff_doc in staff:
            sid = staff_doc["id"]
            role = staff_doc.get("role") or "staff"
            freq_days = 28 if role == "staff" else 56
            last = last_by_staff.get(sid)
            if last and last.get("completed_at"):
                try:
                    next_date = date.fromisoformat((last["completed_at"] or "")[:10]) + timedelta(days=freq_days)
                except Exception:
                    continue
            else:
                next_date = _today()  # never had supervision → due immediately
            if f <= next_date <= t:
                events.append({
                    "id": f"sup-{sid}-{next_date.isoformat()}",
                    "kind": "supervision_due",
                    "label": f"Supervision due: {staff_doc['name']}",
                    "date": _iso(next_date),
                    "staff_id": sid,
                    "staff_name": staff_doc["name"],
                    "deep_link": "/supervisions",
                    "severity": "red" if next_date < _today() else "amber",
                })

        # Appraisals due (annual — last appraisal + 365d)
        appraisals = await _db.supervisions.find(
            {"kind": "appraisal"}, {"_id": 0}
        ).to_list(1000)
        last_apr_by_staff: dict = {}
        for a in appraisals:
            sid = a.get("staff_id")
            if not sid:
                continue
            cur = last_apr_by_staff.get(sid)
            if not cur or (a.get("completed_at") or "") > (cur.get("completed_at") or ""):
                last_apr_by_staff[sid] = a
        for staff_doc in staff:
            sid = staff_doc["id"]
            last = last_apr_by_staff.get(sid)
            if last and last.get("completed_at"):
                try:
                    next_date = date.fromisoformat((last["completed_at"] or "")[:10]) + timedelta(days=365)
                except Exception:
                    continue
                if f <= next_date <= t:
                    events.append({
                        "id": f"apr-{sid}-{next_date.isoformat()}",
                        "kind": "appraisal_due",
                        "label": f"Appraisal due: {staff_doc['name']}",
                        "date": _iso(next_date),
                        "staff_id": sid,
                        "staff_name": staff_doc["name"],
                        "deep_link": "/supervisions",
                        "severity": "red" if next_date < _today() else "amber",
                    })

        # Induction targets in window
        inductions = await _db.induction_assignments.find(
            {"signed_off_at": None,
             "target_completion": {"$gte": f_s, "$lte": t_s + "T23:59:59"}},
            {"_id": 0}
        ).to_list(500)
        for i in inductions:
            events.append({
                "id": f"ind-{i.get('id')}",
                "kind": "induction_target",
                "label": f"Induction target: {i.get('staff_name')}",
                "date": (i.get("target_completion") or "")[:10],
                "staff_id": i.get("staff_id"),
                "staff_name": i.get("staff_name"),
                "deep_link": f"/induction/{i.get('id')}",
                "severity": "red" if (i.get("target_completion") or "")[:10] < _iso(_today()) else "blue",
            })

        # DBS renewals (folder=dbs expiry within window)
        dbs = await _db.staff_files.find(
            {"folder_id": "dbs",
             "expiry_date": {"$gte": f_s, "$lte": t_s + "T23:59:59"}},
            {"_id": 0}
        ).to_list(500)
        for d in dbs:
            sid = d.get("staff_user_id")
            s_name = (staff_by_id.get(sid) or {}).get("name", "Unknown")
            events.append({
                "id": f"dbs-{d.get('id')}",
                "kind": "dbs_renewal",
                "label": f"DBS renewal: {s_name}",
                "date": (d.get("expiry_date") or "")[:10],
                "staff_id": sid,
                "staff_name": s_name,
                "deep_link": "/hr",
                "severity": "red" if (d.get("expiry_date") or "")[:10] < _iso(_today()) else "amber",
            })

        # Probation reviews in window
        prob = await _db.staff_files.find(
            {"folder_id": "probation",
             "expiry_date": {"$gte": f_s, "$lte": t_s + "T23:59:59"}},
            {"_id": 0}
        ).to_list(500)
        for p in prob:
            sid = p.get("staff_user_id")
            s_name = (staff_by_id.get(sid) or {}).get("name", "Unknown")
            events.append({
                "id": f"prob-{p.get('id')}",
                "kind": "probation_review",
                "label": f"Probation review: {s_name}",
                "date": (p.get("expiry_date") or "")[:10],
                "staff_id": sid,
                "staff_name": s_name,
                "deep_link": "/hr",
                "severity": "amber",
            })

        # Qualification reviews (expected_completion in window)
        quals = await _db.tc_qualifications.find(
            {"status": "in_progress",
             "expected_completion": {"$gte": f_s, "$lte": t_s}},
            {"_id": 0}
        ).to_list(500)
        for q in quals:
            events.append({
                "id": f"qual-{q.get('id')}",
                "kind": "qualification_review",
                "label": f"Qualification review: {q.get('qualification_name')}",
                "date": (q.get("expected_completion") or "")[:10],
                "staff_id": q.get("staff_id"),
                "staff_name": q.get("staff_name"),
                "deep_link": "/training",
                "severity": "blue",
            })

        events.sort(key=lambda e: (e.get("date") or "", e.get("kind") or ""))
        return {
            "from": f_s, "to": t_s, "sector": sector,
            "event_count": len(events),
            "events": events,
        }

    @router.get("/workforce-planning/capacity")
    async def workforce_capacity(
        sector: str = Query("children", pattern="^(children|adult)$"),
        from_date: str = Query(..., alias="from"),
        to_date: str = Query(..., alias="to"),
        _: dict = Depends(_require_tier(3)),
    ):
        """Day-by-day capacity heatmap for the requested window."""
        try:
            f = date.fromisoformat(from_date)
            t = date.fromisoformat(to_date)
        except ValueError:
            raise HTTPException(400, "from / to must be YYYY-MM-DD")
        if t < f:
            raise HTTPException(400, "to must be on or after from")
        if (t - f).days > 60:
            raise HTTPException(400, "Window too large (max 60 days)")

        staff = await _staff_list()
        staff_total = len(staff)
        leave = await _db.leave_requests.find(
            {"status": "approved",
             "end_date": {"$gte": _iso(f)},
             "start_date": {"$lte": _iso(t)}},
            {"_id": 0}
        ).to_list(1000)
        days = []
        cur = f
        while cur <= t:
            cs = _iso(cur)
            on_leave = sum(1 for l in leave
                            if (l.get("start_date") or "")[:10] <= cs <= (l.get("end_date") or "9999")[:10]
                            and l.get("kind") in ("annual_leave", "parental", "compassionate", "unpaid"))
            on_sick = sum(1 for l in leave
                            if (l.get("start_date") or "")[:10] <= cs <= (l.get("end_date") or "9999")[:10]
                            and l.get("kind") == "sickness")
            on_train = sum(1 for l in leave
                            if (l.get("start_date") or "")[:10] <= cs <= (l.get("end_date") or "9999")[:10]
                            and l.get("kind") == "training")
            avail = max(staff_total - on_leave - on_sick - on_train, 0)
            avail_pct = round((avail / max(staff_total, 1)) * 100)
            days.append({
                "date": cs,
                "weekday": cur.strftime("%a"),
                "staff_total": staff_total,
                "on_leave": on_leave,
                "on_sickness": on_sick,
                "on_training": on_train,
                "available": avail,
                "available_pct": avail_pct,
                "rag": _rag(avail_pct),
                "release_for_training_safe": avail_pct >= 60,
            })
            cur += timedelta(days=1)

        return {"sector": sector, "from": _iso(f), "to": _iso(t),
                "staff_total": staff_total, "days": days}
