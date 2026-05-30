"""Phase E.3.2 — Unified Compliance Dashboard.

Single endpoint that compiles all the named compliance KPIs and widgets the
Registered Manager needs before an Ofsted (children) or CQC (adult) inspection.

Every metric is computed deterministically from existing collections — no AI.
"""
from __future__ import annotations

from datetime import datetime, timezone, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query


router = APIRouter(prefix="/api", tags=["Unified Compliance"])

_db = None
_get_current_user = None
_require_tier = None


def init(*, db, get_current_user, require_tier):
    global _db, _get_current_user, _require_tier
    _db = db
    _get_current_user = get_current_user
    _require_tier = require_tier


def _today() -> str:
    return date.today().isoformat()


def _plus(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def _rag(pct: int) -> str:
    if pct >= 85:
        return "green"
    if pct >= 65:
        return "amber"
    return "red"


def build_routes():
    router.routes.clear()

    @router.get("/compliance/unified-dashboard")
    async def compliance_dashboard(
        sector: str = Query(..., pattern="^(children|adult)$"),
        _: dict = Depends(_require_tier(2)),
    ):
        today = _today()
        in_30 = _plus(30)

        # Staff active in this workspace
        staff = await _db.users.find(
            {"role": {"$in": ["staff", "senior", "manager", "admin"]}},
            {"_id": 0, "id": 1, "name": 1, "role": 1},
        ).to_list(500)
        staff_ids = [s["id"] for s in staff]
        staff_total = len(staff)

        # === 1. Policy compliance (active policies / required policies) ===
        active_policies = await _db.policies.count_documents(
            {"sector": {"$in": [sector, "both"]}, "status": "active"}
        )
        review_overdue = await _db.policies.count_documents(
            {"sector": {"$in": [sector, "both"]}, "status": "active",
             "review_date": {"$lt": today}}
        )
        review_due_30 = await _db.policies.count_documents(
            {"sector": {"$in": [sector, "both"]}, "status": "active",
             "review_date": {"$gte": today, "$lte": in_30}}
        )
        total_policies = await _db.policies.count_documents(
            {"sector": {"$in": [sector, "both"]}}
        )
        policy_pct = (
            round(((active_policies - review_overdue) / active_policies) * 100)
            if active_policies else 100
        )

        # === 2. Acknowledgements ===
        ack_total = await _db.policy_assignments.count_documents({})
        ack_done = await _db.policy_assignments.count_documents(
            {"status": "completed"}
        )
        ack_overdue_cutoff = _plus(-14)
        ack_overdue = await _db.policy_assignments.count_documents(
            {"status": {"$ne": "completed"}, "assigned_at": {"$lt": ack_overdue_cutoff}}
        )
        ack_pct = round((ack_done / ack_total) * 100) if ack_total else 100
        ack_outstanding = ack_total - ack_done

        # === 3. Training compliance (mandatory cells ok+expiring / total) ===
        courses = await _db.tc_courses.find(
            {"sector": {"$in": [sector, "both"]}, "mandatory": True}, {"_id": 0}
        ).to_list(500)
        course_codes = [c["code"] for c in courses]
        records = await _db.tc_records.find(
            {"course_code": {"$in": course_codes}}, {"_id": 0}
        ).to_list(5000)
        rec_by = {}
        for r in records:
            rec_by.setdefault((r["staff_id"], r["course_code"]), []).append(r)
        expected_cells = max(staff_total * len(course_codes), 1)
        ok = expiring = expired = missing = 0
        for sid in staff_ids:
            for code in course_codes:
                rs = rec_by.get((sid, code), [])
                if not rs:
                    missing += 1
                    continue
                latest = sorted(rs, key=lambda r: r.get("completed_on") or "")[-1]
                exp = latest.get("expires_on")
                if not exp:
                    ok += 1
                elif exp < today:
                    expired += 1
                elif exp <= _plus(60):
                    expiring += 1
                else:
                    ok += 1
        training_pct = round(((ok + expiring) / expected_cells) * 100)
        cliff_30 = await _db.tc_records.count_documents(
            {"course_code": {"$in": course_codes},
             "expires_on": {"$gte": today, "$lte": _plus(30)}}
        )

        # === 4. Supervision compliance: staff with sup in last 90d ===
        ninety_ago = _plus(-90)
        recent_sup_ids = await _db.supervisions.distinct(
            "staff_id", {"completed_at": {"$gte": ninety_ago}}
        )
        sup_pct = round((len(recent_sup_ids) / max(staff_total, 1)) * 100)

        # === 5. Induction compliance: signed-off staff / total staff ===
        signed_staff_ids = await _db.induction_assignments.distinct(
            "staff_id", {"signed_off_at": {"$ne": None}}
        )
        induction_pct = round((len(signed_staff_ids) / max(staff_total, 1)) * 100)
        in_progress_inductions = await _db.induction_assignments.count_documents(
            {"signed_off_at": None}
        )
        # At-risk inductions: target < today + 7d AND not signed off
        at_risk_docs = await _db.induction_assignments.find(
            {"signed_off_at": None,
             "target_completion": {"$ne": None, "$lte": _plus(7)}},
            {"_id": 0, "id": 1, "staff_name": 1, "target_completion": 1},
        ).to_list(200)
        induction_at_risk = len(at_risk_docs)
        overdue_inductions = sum(
            1 for d in at_risk_docs
            if (d.get("target_completion") or "")[:10] < today
        )

        # === 6. Workforce Readiness (60/15/10/15) ===
        # Qualifications coverage
        qual_active_ids = await _db.tc_qualifications.distinct(
            "staff_id", {"status": {"$in": ["in_progress", "completed"]}}
        )
        qual_pct = round((len(qual_active_ids) / max(staff_total, 1)) * 100)
        workforce_readiness = round(
            0.60 * training_pct
            + 0.15 * induction_pct
            + 0.10 * qual_pct
            + 0.15 * sup_pct
        )

        # === 7. Ofsted / CQC Readiness (deterministic 5-pillar score) ===
        # Mirrors the policy_routes inspection-readiness/score formula:
        #   30% policy compliance, 25% induction, 20% supervision,
        #   15% training, 10% acknowledgements
        readiness = round(
            0.30 * policy_pct
            + 0.25 * induction_pct
            + 0.20 * sup_pct
            + 0.15 * training_pct
            + 0.10 * ack_pct
        )
        readiness_label = "Ofsted Readiness" if sector == "children" else "CQC Readiness"

        # === Trend (last 7 days — deterministic backfill of readiness) ===
        # Cheap proxy: reuse training cliff snapshot if present, else linear.
        snaps = await _db.tc_readiness_snapshots.find(
            {"sector": sector}, {"_id": 0}
        ).sort("at", -1).to_list(14)
        trend = [{"date": s["at"][:10], "value": s.get("readiness_score", training_pct)}
                  for s in snaps][:7][::-1]
        if not trend:
            trend = [{"date": today, "value": readiness}]

        return {
            "sector": sector,
            "today": today,
            "regulator": "ofsted" if sector == "children" else "cqc",
            "readiness_label": readiness_label,
            # 7 KPI tiles
            "policy_pct": policy_pct,
            "acknowledgement_pct": ack_pct,
            "training_pct": training_pct,
            "supervision_pct": sup_pct,
            "induction_pct": induction_pct,
            "workforce_readiness_pct": workforce_readiness,
            "regulator_readiness_pct": readiness,
            # RAG for each
            "rag": {
                "policy": _rag(policy_pct),
                "acknowledgement": _rag(ack_pct),
                "training": _rag(training_pct),
                "supervision": _rag(sup_pct),
                "induction": _rag(induction_pct),
                "workforce_readiness": _rag(workforce_readiness),
                "regulator_readiness": _rag(readiness),
            },
            # 6 widgets
            "widgets": {
                "policies_due_review": {
                    "count": review_due_30,
                    "label": "Policies due review (30d)",
                    "rag": _rag(100 - min(review_due_30 * 10, 100)),
                },
                "overdue_policies": {
                    "count": review_overdue,
                    "label": "Overdue policy reviews",
                    "rag": "red" if review_overdue > 0 else "green",
                },
                "outstanding_acknowledgements": {
                    "count": ack_outstanding,
                    "overdue": ack_overdue,
                    "label": "Outstanding acknowledgements",
                    "rag": "red" if ack_overdue > 0 else "amber" if ack_outstanding > 0 else "green",
                },
                "inductions_at_risk": {
                    "count": induction_at_risk,
                    "overdue": overdue_inductions,
                    "label": "Staff inductions at risk",
                    "rag": "red" if overdue_inductions > 0 else "amber" if induction_at_risk > 0 else "green",
                },
                "training_cliff_edge": {
                    "count": cliff_30,
                    "label": "Training expiring in 30 days",
                    "rag": "red" if cliff_30 > 10 else "amber" if cliff_30 > 0 else "green",
                },
                "compliance_trend": trend,
            },
            # Quick counts
            "counts": {
                "staff_total": staff_total,
                "active_policies": active_policies,
                "total_policies": total_policies,
                "signed_off_inductions": len(signed_staff_ids),
                "in_progress_inductions": in_progress_inductions,
                "ack_total": ack_total,
                "ack_done": ack_done,
            },
            "readiness_weights": {
                "mandatory_training": 60,
                "induction": 15,
                "qualifications": 10,
                "supervision": 15,
            },
        }
