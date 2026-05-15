"""Regulation 44 — Operational Intelligence Registry.

40 audit modules organised into 8 categories. Each module declares:
  - title, category, description
  - regulation_refs: Children's Homes Regulations 2015 references
  - quality_standards: which of the 9 QS this maps to
  - evidence_sources: collections this module reads from (drives "Open evidence" links)
  - mode: "live" (computed from real data) or "manual" (needs manager evidence note)

Live modules are aggregated in build_regulation_44(); manual modules surface a
"manual evidence required" state with deep-links to the relevant area.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta


# 9 Children's Home Quality Standards (CHQS) shortcodes
QS = {
    "QS1": "Quality and purpose of care",
    "QS2": "Children's wishes and feelings",
    "QS3": "Education",
    "QS4": "Enjoyment and achievement",
    "QS5": "Health and well-being",
    "QS6": "Positive relationships",
    "QS7": "Protection of children",
    "QS8": "Leadership and management",
    "QS9": "Care planning",
}

CATEGORIES = [
    {"id": "environment", "title": "Home & Environment", "icon": "Building2"},
    {"id": "safeguarding", "title": "Safeguarding & Risk", "icon": "ShieldAlert"},
    {"id": "health", "title": "Health & Wellbeing", "icon": "Heart"},
    {"id": "records", "title": "Young Person Records", "icon": "FileText"},
    {"id": "practice", "title": "Practice & Culture", "icon": "Sparkles"},
    {"id": "education", "title": "Education & Engagement", "icon": "GraduationCap"},
    {"id": "workforce", "title": "Workforce", "icon": "Users"},
    {"id": "governance", "title": "Governance & Compliance", "icon": "ShieldCheck"},
]

MODULES = [
    # ---- Home & Environment ----
    {"id": "home_environment", "n": 1, "title": "Home Environment Audit", "category": "environment", "mode": "live",
     "regulation_refs": ["Reg 6 — Quality and purpose of care", "Reg 10 — Premises"],
     "quality_standards": ["QS1"], "evidence_sources": ["compliance_logs", "maintenance_issues"],
     "fix_link": "/operations"},
    {"id": "health_safety", "n": 3, "title": "Health & Safety Audit", "category": "environment", "mode": "live",
     "regulation_refs": ["Reg 23 — Risk assessment"],
     "quality_standards": ["QS1", "QS7"], "evidence_sources": ["compliance_logs"],
     "fix_link": "/operations"},
    {"id": "fire_safety", "n": 4, "title": "Fire Safety Audit", "category": "environment", "mode": "live",
     "regulation_refs": ["Reg 25 — Fire precautions"],
     "quality_standards": ["QS7"], "evidence_sources": ["compliance_logs"],
     "fix_link": "/operations"},
    {"id": "maintenance", "n": 38, "title": "Maintenance & Repairs Audit", "category": "environment", "mode": "live",
     "regulation_refs": ["Reg 10 — Premises"],
     "quality_standards": ["QS1"], "evidence_sources": ["maintenance_issues"],
     "fix_link": "/operations"},

    # ---- Safeguarding & Risk ----
    {"id": "safeguarding_audit", "n": 2, "title": "Safeguarding Audit", "category": "safeguarding", "mode": "live",
     "regulation_refs": ["Reg 12 — Protection of children", "Reg 34 — Notifications"],
     "quality_standards": ["QS7"], "evidence_sources": ["incidents", "missing_episodes", "body_maps"],
     "fix_link": "/incidents"},
    {"id": "risk_assessment", "n": 8, "title": "Risk Assessment Audit", "category": "safeguarding", "mode": "live",
     "regulation_refs": ["Reg 23 — Risk assessment"],
     "quality_standards": ["QS9"], "evidence_sources": ["residents"],
     "fix_link": "/residents"},
    {"id": "behaviour_management", "n": 9, "title": "Behaviour Management Audit", "category": "safeguarding", "mode": "live",
     "regulation_refs": ["Reg 19 — Behaviour management policies"],
     "quality_standards": ["QS6"], "evidence_sources": ["incidents"],
     "fix_link": "/incidents"},
    {"id": "restraint", "n": 10, "title": "Physical Intervention / Restraint Audit", "category": "safeguarding", "mode": "live",
     "regulation_refs": ["Reg 20 — Restraint"],
     "quality_standards": ["QS6", "QS7"], "evidence_sources": ["incidents"],
     "fix_link": "/incidents"},
    {"id": "missing_from_care", "n": 11, "title": "Missing From Care Audit", "category": "safeguarding", "mode": "live",
     "regulation_refs": ["Reg 34 — Notifications", "Statutory missing-from-care guidance"],
     "quality_standards": ["QS7"], "evidence_sources": ["missing_episodes", "return_interviews"],
     "fix_link": "/residents"},
    {"id": "location_risk", "n": 27, "title": "Location Risk Assessment Audit", "category": "safeguarding", "mode": "manual",
     "regulation_refs": ["Reg 23"],
     "quality_standards": ["QS7"], "evidence_sources": [],
     "fix_link": "/operations"},
    {"id": "incidents_accidents", "n": 34, "title": "Incident & Accident Audit", "category": "safeguarding", "mode": "live",
     "regulation_refs": ["Reg 34 — Notifications"],
     "quality_standards": ["QS7"], "evidence_sources": ["incidents"],
     "fix_link": "/incidents"},

    # ---- Health & Wellbeing ----
    {"id": "medication", "n": 5, "title": "Medication Audit", "category": "health", "mode": "live",
     "regulation_refs": ["Reg 23 — Medication", "Children's Homes Regs 2015 Sch 1"],
     "quality_standards": ["QS5"], "evidence_sources": ["medications", "medication_admins"],
     "fix_link": "/medications"},
    {"id": "health_wellbeing", "n": 16, "title": "Health & Emotional Wellbeing Audit", "category": "health", "mode": "live",
     "regulation_refs": ["Reg 10 — Health and well-being"],
     "quality_standards": ["QS5"], "evidence_sources": ["health_appointments", "wellbeing_observations"],
     "fix_link": "/residents"},
    {"id": "food_nutrition", "n": 37, "title": "Food & Nutrition Audit", "category": "health", "mode": "manual",
     "regulation_refs": ["Reg 13 — Meals and meal times"],
     "quality_standards": ["QS5"], "evidence_sources": [],
     "fix_link": "/residents"},

    # ---- Young Person Records ----
    {"id": "yp_file", "n": 6, "title": "Young Person File Audit", "category": "records", "mode": "live",
     "regulation_refs": ["Reg 36 — Children's case records"],
     "quality_standards": ["QS9"], "evidence_sources": ["residents", "documents"],
     "fix_link": "/residents"},
    {"id": "care_planning", "n": 7, "title": "Care Planning Audit", "category": "records", "mode": "live",
     "regulation_refs": ["Reg 14 — Care planning"],
     "quality_standards": ["QS9"], "evidence_sources": ["residents", "statutory_visits"],
     "fix_link": "/visits"},
    {"id": "admissions_matching", "n": 28, "title": "Admissions & Matching Audit", "category": "records", "mode": "manual",
     "regulation_refs": ["Reg 14 — Care planning", "Reg 11 — Suitability"],
     "quality_standards": ["QS9"], "evidence_sources": [],
     "fix_link": "/residents"},
    {"id": "missing_documentation", "n": 29, "title": "Missing Documentation Audit", "category": "records", "mode": "live",
     "regulation_refs": ["Reg 36 — Records", "Reg 37 — Other records"],
     "quality_standards": ["QS9"], "evidence_sources": ["documents"],
     "fix_link": "/residents"},
    {"id": "independence_skills", "n": 36, "title": "Independence Skills Audit", "category": "records", "mode": "manual",
     "regulation_refs": ["Reg 6 — Quality and purpose of care"],
     "quality_standards": ["QS4"], "evidence_sources": [],
     "fix_link": "/residents"},

    # ---- Practice & Culture ----
    {"id": "keywork", "n": 14, "title": "Keywork Session Audit", "category": "practice", "mode": "live",
     "regulation_refs": ["Reg 6", "Reg 7"],
     "quality_standards": ["QS6"], "evidence_sources": ["key_work_sessions"],
     "fix_link": "/key-work"},
    {"id": "childrens_voice", "n": 17, "title": "Children's Voice & Participation Audit", "category": "practice", "mode": "live",
     "regulation_refs": ["Reg 7 — Children's wishes and feelings"],
     "quality_standards": ["QS2"], "evidence_sources": ["notes", "key_work_sessions"],
     "fix_link": "/notes"},
    {"id": "therapeutic_practice", "n": 30, "title": "Therapeutic Practice Audit", "category": "practice", "mode": "live",
     "regulation_refs": ["Reg 6", "Reg 8"],
     "quality_standards": ["QS5", "QS6"], "evidence_sources": ["key_work_sessions"],
     "fix_link": "/key-work"},
    {"id": "equality_diversity", "n": 31, "title": "Equality & Diversity Audit", "category": "practice", "mode": "manual",
     "regulation_refs": ["Reg 6 — Quality and purpose of care", "Equality Act 2010"],
     "quality_standards": ["QS1"], "evidence_sources": [],
     "fix_link": "/residents"},
    {"id": "online_safety", "n": 32, "title": "Online Safety Audit", "category": "practice", "mode": "manual",
     "regulation_refs": ["Reg 12 — Protection of children"],
     "quality_standards": ["QS7"], "evidence_sources": [],
     "fix_link": "/residents"},
    {"id": "cctv_privacy", "n": 33, "title": "CCTV & Privacy Audit", "category": "practice", "mode": "manual",
     "regulation_refs": ["Reg 21 — Privacy and access"],
     "quality_standards": ["QS2"], "evidence_sources": [],
     "fix_link": "/operations"},

    # ---- Education & Engagement ----
    {"id": "education", "n": 15, "title": "Education Audit", "category": "education", "mode": "live",
     "regulation_refs": ["Reg 8 — Education"],
     "quality_standards": ["QS3"], "evidence_sources": ["education_records"],
     "fix_link": "/residents"},
    {"id": "visitors_contact", "n": 35, "title": "Visitors & Contact Audit", "category": "education", "mode": "manual",
     "regulation_refs": ["Reg 22 — Contact"],
     "quality_standards": ["QS6"], "evidence_sources": [],
     "fix_link": "/residents"},

    # ---- Workforce ----
    {"id": "staff_personnel", "n": 18, "title": "Staff Personnel File Audit", "category": "workforce", "mode": "manual",
     "regulation_refs": ["Reg 32 — Staff fitness"],
     "quality_standards": ["QS8"], "evidence_sources": ["users"],
     "fix_link": "/hr"},
    {"id": "safer_recruitment", "n": 19, "title": "Safer Recruitment Audit", "category": "workforce", "mode": "manual",
     "regulation_refs": ["Reg 32 — Staff fitness", "Schedule 2"],
     "quality_standards": ["QS8"], "evidence_sources": [],
     "fix_link": "/hr"},
    {"id": "training_development", "n": 20, "title": "Training & Development Audit", "category": "workforce", "mode": "live",
     "regulation_refs": ["Reg 33 — Staff training and development"],
     "quality_standards": ["QS8"], "evidence_sources": ["trainings"],
     "fix_link": "/training"},
    {"id": "supervision", "n": 21, "title": "Supervision Audit", "category": "workforce", "mode": "live",
     "regulation_refs": ["Reg 33 — Staff support"],
     "quality_standards": ["QS8"], "evidence_sources": ["supervisions", "wellbeing_checkins"],
     "fix_link": "/supervisions"},
    {"id": "staffing_rotas", "n": 22, "title": "Staffing & Rotas Audit", "category": "workforce", "mode": "live",
     "regulation_refs": ["Reg 31 — Staffing"],
     "quality_standards": ["QS8"], "evidence_sources": ["shifts"],
     "fix_link": "/staff"},
    {"id": "agency_staff", "n": 23, "title": "Agency Staff Audit", "category": "workforce", "mode": "manual",
     "regulation_refs": ["Reg 31, 32"],
     "quality_standards": ["QS8"], "evidence_sources": [],
     "fix_link": "/staff"},

    # ---- Governance & Compliance ----
    {"id": "complaints", "n": 12, "title": "Complaints Audit", "category": "governance", "mode": "manual",
     "regulation_refs": ["Reg 39 — Complaints"],
     "quality_standards": ["QS2", "QS8"], "evidence_sources": [],
     "fix_link": "/admin"},
    {"id": "consequences", "n": 13, "title": "Consequences / Sanctions Audit", "category": "governance", "mode": "manual",
     "regulation_refs": ["Reg 19 — Behaviour management"],
     "quality_standards": ["QS6"], "evidence_sources": ["incidents"],
     "fix_link": "/incidents"},
    {"id": "leadership_oversight", "n": 24, "title": "Leadership & Management Oversight", "category": "governance", "mode": "live",
     "regulation_refs": ["Reg 13 — The registered person", "Reg 45"],
     "quality_standards": ["QS8"], "evidence_sources": ["audit_events", "inspection_actions"],
     "fix_link": "/audit"},
    {"id": "reg_40_notifications", "n": 25, "title": "Regulation 40 Notifications Audit", "category": "governance", "mode": "manual",
     "regulation_refs": ["Reg 40 — Notifiable events"],
     "quality_standards": ["QS7", "QS8"], "evidence_sources": ["incidents"],
     "fix_link": "/incidents"},
    {"id": "statement_of_purpose", "n": 26, "title": "Statement of Purpose Audit", "category": "governance", "mode": "manual",
     "regulation_refs": ["Reg 16 — Statement of purpose"],
     "quality_standards": ["QS1"], "evidence_sources": [],
     "fix_link": "/admin"},
    {"id": "manager_monitoring", "n": 39, "title": "Manager Monitoring & QA Audit", "category": "governance", "mode": "live",
     "regulation_refs": ["Reg 45 — Independent person visits", "Reg 46 — Quarterly review"],
     "quality_standards": ["QS8"], "evidence_sources": ["inspection_actions", "audit_events"],
     "fix_link": "/ofsted"},
    {"id": "action_plan", "n": 40, "title": "Action Plan & Recommendations", "category": "governance", "mode": "live",
     "regulation_refs": ["Reg 45 — Visit recommendations"],
     "quality_standards": ["QS8"], "evidence_sources": ["inspection_actions"],
     "fix_link": "/ofsted"},
]

ADULT_TYPES = {"adult_supported_living", "elderly_residential", "dementia", "mental_health", "veteran"}


def _is_child(r: dict) -> bool:
    st = r.get("service_type")
    return not st or st not in ADULT_TYPES


def _rag(score: int) -> str:
    if score >= 80:
        return "green"
    if score >= 60:
        return "amber"
    return "red"


def _rating(score: int) -> dict:
    if score >= 90:
        return {"label": "Outstanding", "tone": "green"}
    if score >= 75:
        return {"label": "Good", "tone": "green"}
    if score >= 60:
        return {"label": "Requires improvement", "tone": "amber"}
    return {"label": "Inadequate", "tone": "red"}


async def _build_live_module(db, mod: dict, ctx: dict) -> dict:
    """Compute live indicators for a single module from cached context."""
    mid = mod["id"]
    indicators: list[dict] = []
    overdue_actions: list[dict] = []
    pattern_alerts: list[dict] = []
    score = 100

    today_date = ctx["today_date"]
    cutoff_30 = ctx["cutoff_30"]
    cutoff_60 = ctx["cutoff_60"]
    cutoff_14 = ctx["cutoff_14"]
    cutoff_48h = ctx["cutoff_48h"]
    yday_iso = ctx["yday_iso"]
    now = ctx["now"]
    children = ctx["children"]
    child_ids = ctx["child_ids"]
    cn = ctx["child_name"]

    # ---- Home & Environment ----
    if mid in ("home_environment", "health_safety", "fire_safety"):
        check_types = ctx["check_types"]
        # Filter by group
        group_map = {
            "home_environment": ["temperature_and_food", "general"],
            "health_safety": ["health_and_safety", "audits"],
            "fire_safety": ["fire_safety"],
        }
        wanted_groups = group_map[mid]
        overdue = 0
        for ct in check_types:
            grp = ct.get("group") or "general"
            if mid != "home_environment" and grp not in wanted_groups:
                continue
            if mid == "home_environment" and grp not in wanted_groups and grp != "temperature_and_food":
                # home_environment is a catch-all for the rest
                pass
            last = await db.compliance_logs.find_one(
                {"check_type_id": ct["id"]}, sort=[("performed_at", -1)]
            )
            freq_days = ct.get("frequency_days", 30)
            cutoff_iso = (now - timedelta(days=freq_days)).isoformat()
            if not last or (last.get("performed_at") or "") < cutoff_iso:
                overdue += 1
                overdue_actions.append({
                    "title": f"{ct.get('title', ct['id'])} overdue",
                    "subtitle": f"Last: {(last or {}).get('performed_at', 'never')[:10]}",
                    "link": "/operations",
                })
        indicators.append({"label": "Overdue checks", "value": overdue, "tone": _rag(100 - overdue * 12)})
        score = max(0, 100 - overdue * 12)

    elif mid == "maintenance":
        urgent = await db.maintenance_issues.count_documents({"severity": "urgent", "status": {"$ne": "resolved"}})
        open_total = await db.maintenance_issues.count_documents({"status": {"$ne": "resolved"}})
        resolved_30 = await db.maintenance_issues.count_documents(
            {"status": "resolved", "resolved_at": {"$gte": cutoff_30}}
        )
        indicators = [
            {"label": "Urgent", "value": urgent, "tone": "red" if urgent else "green"},
            {"label": "Open total", "value": open_total, "tone": _rag(100 - open_total * 8)},
            {"label": "Resolved (30d)", "value": resolved_30, "tone": "green"},
        ]
        if urgent:
            overdue_actions.append({"title": f"{urgent} urgent maintenance open", "link": "/operations"})
        score = max(0, 100 - urgent * 30 - open_total * 5)

    # ---- Safeguarding & Risk ----
    elif mid == "safeguarding_audit":
        sg_open = await db.incidents.count_documents(
            {"resident_id": {"$in": child_ids}, "safeguarding": True, "status": "open"}
        )
        sg_old = await db.incidents.count_documents(
            {"resident_id": {"$in": child_ids}, "safeguarding": True, "status": "open",
             "created_at": {"$lt": cutoff_48h}}
        )
        sg_30 = await db.incidents.count_documents(
            {"resident_id": {"$in": child_ids}, "safeguarding": True, "created_at": {"$gte": cutoff_30}}
        )
        indicators = [
            {"label": "Open SG", "value": sg_open, "tone": _rag(100 - sg_open * 15)},
            {"label": "Open >48h", "value": sg_old, "tone": "red" if sg_old else "green"},
            {"label": "Raised (30d)", "value": sg_30, "tone": _rag(100 - sg_30 * 6)},
        ]
        if sg_old:
            overdue_actions.append({"title": f"{sg_old} safeguarding incident(s) open >48h",
                                     "link": "/incidents"})
        score = max(0, 100 - sg_old * 25 - sg_open * 5)

    elif mid == "risk_assessment":
        overdue = []
        for r in children:
            nxt = r.get("risk_next_review") or ""
            if not nxt or nxt < today_date:
                overdue.append(r)
                overdue_actions.append({
                    "title": f"Risk review overdue: {cn.get(r['id'], '—')}",
                    "subtitle": f"Due {nxt or 'not set'}",
                    "link": f"/residents/{r['id']}?tab=safeguarding",
                })
        indicators = [
            {"label": "Overdue reviews", "value": len(overdue), "tone": "red" if overdue else "green"},
            {"label": "Total children", "value": len(children), "tone": "green"},
        ]
        score = 100 if not children else round((len(children) - len(overdue)) * 100 / len(children))

    elif mid == "behaviour_management":
        beh_30 = await db.incidents.count_documents({
            "resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30},
            "$or": [
                {"category": {"$in": ["behaviour", "aggression"]}},
                {"summary": {"$regex": "aggressi|violen|threat|swear", "$options": "i"}},
            ],
        })
        # Children with 3+ behaviour incidents
        cluster_kids = []
        cur = db.incidents.aggregate([
            {"$match": {"resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30},
                        "$or": [{"category": {"$in": ["behaviour", "aggression"]}},
                                 {"summary": {"$regex": "aggressi|violen|threat", "$options": "i"}}]}},
            {"$group": {"_id": "$resident_id", "c": {"$sum": 1}}},
            {"$match": {"c": {"$gte": 3}}},
        ])
        async for row in cur:
            cluster_kids.append(row["_id"])
            overdue_actions.append({
                "title": f"Behaviour pattern: {cn.get(row['_id'], '—')} ({row['c']} in 30d)",
                "link": f"/residents/{row['_id']}",
            })
        if cluster_kids:
            pattern_alerts.append({
                "severity": "high",
                "title": "Behaviour pattern",
                "message": f"{len(cluster_kids)} child(ren) with 3+ behaviour incidents in 30 days.",
            })
        indicators = [
            {"label": "Behaviour incidents (30d)", "value": beh_30, "tone": _rag(100 - beh_30 * 4)},
            {"label": "Children with pattern", "value": len(cluster_kids), "tone": "red" if cluster_kids else "green"},
        ]
        score = max(0, 100 - beh_30 * 3 - len(cluster_kids) * 15)

    elif mid == "restraint":
        rest_30 = await db.incidents.count_documents({
            "resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30},
            "$or": [{"category": "restraint"},
                     {"summary": {"$regex": "restrain|restraint|hold-", "$options": "i"}}],
        })
        indicators = [
            {"label": "Restraints (30d)", "value": rest_30, "tone": _rag(100 - rest_30 * 20)},
        ]
        if rest_30 >= 3:
            pattern_alerts.append({
                "severity": "high",
                "title": "Restraint cluster",
                "message": f"{rest_30} physical interventions in 30 days. De-escalation review recommended.",
            })
        score = max(0, 100 - rest_30 * 18)

    elif mid == "missing_from_care":
        open_missing = await db.missing_episodes.count_documents(
            {"resident_id": {"$in": child_ids}, "returned_at": None}
        )
        returned_eps = await db.missing_episodes.find(
            {"resident_id": {"$in": child_ids},
             "returned_at": {"$ne": None, "$gte": cutoff_30}},
            {"_id": 0, "id": 1, "resident_id": 1},
        ).to_list(200)
        ri_done_ids = set(await db.return_interviews.distinct(
            "missing_episode_id", {"missing_episode_id": {"$in": [e["id"] for e in returned_eps]}}
        ))
        ri_outstanding = sum(1 for e in returned_eps if e["id"] not in ri_done_ids)
        # Repeat-missing children (3+ in 60d)
        miss_by_res: dict[str, int] = {}
        async for m in db.missing_episodes.find(
            {"resident_id": {"$in": child_ids}, "reported_at": {"$gte": cutoff_60}},
            {"_id": 0, "resident_id": 1},
        ):
            miss_by_res[m["resident_id"]] = miss_by_res.get(m["resident_id"], 0) + 1
        repeat_kids = [rid for rid, c in miss_by_res.items() if c >= 3]
        for rid in repeat_kids:
            pattern_alerts.append({
                "severity": "high",
                "title": f"Repeat missing: {cn.get(rid, '—')}",
                "message": f"{miss_by_res[rid]} missing episodes in 60 days. Contextual safeguarding review.",
            })
        # Police involvement
        police_30 = await db.incidents.count_documents({
            "resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30},
            "$or": [{"category": "police"},
                     {"summary": {"$regex": "police|arrested|999", "$options": "i"}}],
        })
        indicators = [
            {"label": "Currently missing", "value": open_missing, "tone": "red" if open_missing else "green"},
            {"label": "RIs outstanding", "value": ri_outstanding, "tone": _rag(100 - ri_outstanding * 20)},
            {"label": "Repeat-missing children", "value": len(repeat_kids), "tone": "red" if repeat_kids else "green"},
            {"label": "Police-involved (30d)", "value": police_30, "tone": _rag(100 - police_30 * 12)},
        ]
        if open_missing:
            overdue_actions.append({"title": f"{open_missing} child(ren) currently missing", "link": "/residents"})
        if ri_outstanding:
            overdue_actions.append({"title": f"{ri_outstanding} return interview(s) outstanding", "link": "/residents"})
        score = max(0, 100 - open_missing * 40 - ri_outstanding * 12 - len(repeat_kids) * 10)

    elif mid == "incidents_accidents":
        inc_30 = await db.incidents.count_documents(
            {"resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30}}
        )
        high_30 = await db.incidents.count_documents({
            "resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30},
            "severity": {"$in": ["high", "critical"]},
        })
        unreviewed = await db.incidents.count_documents(
            {"resident_id": {"$in": child_ids}, "status": "open",
             "created_at": {"$lt": cutoff_48h}}
        )
        indicators = [
            {"label": "Incidents (30d)", "value": inc_30, "tone": _rag(100 - inc_30 * 2)},
            {"label": "High/critical (30d)", "value": high_30, "tone": _rag(100 - high_30 * 10)},
            {"label": "Open >48h", "value": unreviewed, "tone": "red" if unreviewed else "green"},
        ]
        if unreviewed:
            overdue_actions.append({"title": f"{unreviewed} incident(s) open >48h", "link": "/incidents"})
        score = max(0, 100 - unreviewed * 18 - high_30 * 4)

    # ---- Health ----
    elif mid == "medication":
        # Reuse MAR calc against children only
        med_active = await db.medications.find(
            {"resident_id": {"$in": child_ids}, "active": True, "is_prn": False},
            {"_id": 0},
        ).to_list(500)
        expected = signed = 0
        today = ctx["today"]
        for m in med_active:
            for t in m.get("schedule_times", []) or []:
                try:
                    hh, mm = t.split(":")
                    sched_dt = today.replace(hour=int(hh), minute=int(mm))
                    if sched_dt > now:
                        continue
                    expected += 1
                    rec = await db.medication_admins.find_one(
                        {"medication_id": m["id"], "scheduled_at": sched_dt.isoformat()},
                        {"_id": 0, "status": 1},
                    )
                    if rec and rec.get("status") in ("given", "refused", "self-administered", "withheld"):
                        signed += 1
                except Exception:
                    continue
        mar_pct = 100 if expected == 0 else round(signed * 100 / expected)
        refusals_14 = await db.medication_admins.count_documents(
            {"resident_id": {"$in": child_ids}, "status": "refused",
             "scheduled_at": {"$gte": cutoff_14}}
        )
        witness_meds = await db.medications.count_documents(
            {"resident_id": {"$in": child_ids}, "requires_witness": True, "active": True}
        )
        indicators = [
            {"label": "MAR signed today", "value": f"{signed}/{expected}", "tone": _rag(mar_pct)},
            {"label": "Refusals (14d)", "value": refusals_14, "tone": _rag(100 - refusals_14 * 8)},
            {"label": "Witness-required meds", "value": witness_meds, "tone": "amber" if witness_meds else "green"},
        ]
        if refusals_14 >= 3:
            pattern_alerts.append({
                "severity": "medium",
                "title": "Medication refusal pattern",
                "message": f"{refusals_14} refusals in 14 days. Review reasons and capacity.",
            })
        if expected and signed < expected:
            overdue_actions.append({
                "title": f"{expected - signed} dose(s) unsigned today",
                "link": "/medications",
            })
        score = mar_pct - refusals_14 * 3

    elif mid == "health_wellbeing":
        appt_30 = await db.health_appointments.count_documents(
            {"resident_id": {"$in": child_ids}, "status": "attended",
             "date": {"$gte": cutoff_30[:10]}}
        )
        missed = await db.health_appointments.count_documents(
            {"resident_id": {"$in": child_ids}, "status": "missed",
             "date": {"$gte": cutoff_30[:10]}}
        )
        upcoming = await db.health_appointments.count_documents(
            {"resident_id": {"$in": child_ids}, "status": "scheduled",
             "date": {"$gte": today_date, "$lte": (now + timedelta(days=14)).date().isoformat()}}
        )
        indicators = [
            {"label": "Attended (30d)", "value": appt_30, "tone": "green"},
            {"label": "Missed (30d)", "value": missed, "tone": _rag(100 - missed * 15)},
            {"label": "Upcoming (14d)", "value": upcoming, "tone": "green" if upcoming else "amber"},
        ]
        if missed:
            overdue_actions.append({"title": f"{missed} missed appointment(s) — follow up", "link": "/residents"})
        score = max(0, 100 - missed * 12)

    # ---- Records ----
    elif mid == "yp_file":
        incomplete = []
        for r in children:
            missing_fields = []
            for k in ("legal_status", "social_worker_name", "local_authority", "key_worker", "referral_reason"):
                if not r.get(k):
                    missing_fields.append(k)
            if missing_fields:
                incomplete.append({"name": cn.get(r["id"]), "missing": missing_fields})
                overdue_actions.append({
                    "title": f"YP file incomplete: {cn.get(r['id'])}",
                    "subtitle": f"Missing: {', '.join(missing_fields[:3])}",
                    "link": f"/residents/{r['id']}",
                })
        indicators = [
            {"label": "Incomplete files", "value": len(incomplete), "tone": "red" if incomplete else "green"},
            {"label": "Total children", "value": len(children), "tone": "green"},
        ]
        score = 100 if not children else round((len(children) - len(incomplete)) * 100 / len(children))

    elif mid == "care_planning":
        visits_overdue = await db.statutory_visits.count_documents(
            {"resident_id": {"$in": child_ids}, "status": "scheduled",
             "due_date": {"$lt": today_date}}
        )
        visits_14 = await db.statutory_visits.count_documents(
            {"resident_id": {"$in": child_ids}, "status": "scheduled",
             "due_date": {"$gte": today_date,
                          "$lte": (now + timedelta(days=14)).date().isoformat()}}
        )
        indicators = [
            {"label": "Visits overdue", "value": visits_overdue, "tone": "red" if visits_overdue else "green"},
            {"label": "Due (14d)", "value": visits_14, "tone": "amber" if visits_14 else "green"},
        ]
        if visits_overdue:
            overdue_actions.append({"title": f"{visits_overdue} statutory visit(s) overdue", "link": "/visits"})
        score = max(0, 100 - visits_overdue * 18)

    elif mid == "missing_documentation":
        expired = await db.documents.count_documents(
            {"resident_id": {"$in": child_ids},
             "expiry_date": {"$ne": None, "$lt": today_date}}
        )
        review_overdue = await db.documents.count_documents(
            {"resident_id": {"$in": child_ids},
             "review_date": {"$ne": None, "$lt": today_date}}
        )
        indicators = [
            {"label": "Expired docs", "value": expired, "tone": _rag(100 - expired * 8)},
            {"label": "Review overdue", "value": review_overdue, "tone": _rag(100 - review_overdue * 6)},
        ]
        if expired:
            overdue_actions.append({"title": f"{expired} expired document(s)", "link": "/residents"})
        score = max(0, 100 - expired * 8 - review_overdue * 4)

    # ---- Practice & Culture ----
    elif mid == "keywork":
        concerns = []
        for r in children:
            last_kw = await db.key_work_sessions.find_one(
                {"resident_id": r["id"]}, sort=[("planned_for", -1)],
            )
            if not last_kw:
                concerns.append({"rid": r["id"], "reason": "no key work on file"})
            else:
                last_at = last_kw.get("completed_at") or last_kw.get("planned_for") or ""
                if last_at and last_at < cutoff_30:
                    concerns.append({"rid": r["id"], "reason": "no session in 30d"})
        for c in concerns:
            overdue_actions.append({
                "title": f"Key work attention: {cn.get(c['rid'])} — {c['reason']}",
                "link": f"/residents/{c['rid']}?tab=daily-care",
            })
        signed_off = await db.key_work_sessions.count_documents(
            {"signed_off_at": {"$ne": None}, "completed_at": {"$gte": cutoff_30}}
        )
        indicators = [
            {"label": "Children without recent KW", "value": len(concerns), "tone": _rag(100 - len(concerns) * 15)},
            {"label": "Signed off (30d)", "value": signed_off, "tone": "green"},
        ]
        score = max(0, 100 - len(concerns) * 14)

    elif mid == "childrens_voice":
        notes_24h = await db.notes.count_documents(
            {"resident_id": {"$in": child_ids}, "created_at": {"$gte": yday_iso}}
        )
        yp_voice_kw = await db.key_work_sessions.count_documents({
            "completed_at": {"$gte": cutoff_30},
            "young_person_voice": {"$nin": [None, ""]},
        })
        indicators = [
            {"label": "Notes today", "value": notes_24h, "tone": "green" if notes_24h else "amber"},
            {"label": "YP voice (KW 30d)", "value": yp_voice_kw, "tone": _rag(yp_voice_kw * 25)},
        ]
        score = min(100, 60 + notes_24h * 5 + yp_voice_kw * 8)

    elif mid == "therapeutic_practice":
        with_frameworks = await db.key_work_sessions.count_documents({
            "completed_at": {"$gte": cutoff_30},
            "frameworks_applied": {"$exists": True, "$ne": []},
        })
        total_kw_30 = await db.key_work_sessions.count_documents(
            {"completed_at": {"$gte": cutoff_30}}
        )
        pct = round(with_frameworks * 100 / total_kw_30) if total_kw_30 else 0
        indicators = [
            {"label": "Sessions w/ frameworks", "value": f"{with_frameworks}/{total_kw_30}", "tone": _rag(pct or 70)},
            {"label": "Coverage %", "value": f"{pct}%", "tone": _rag(pct or 70)},
        ]
        score = max(50, pct or 70)

    # ---- Education ----
    elif mid == "education":
        concerns = 0
        for r in children:
            edu = await db.education_records.find_one({"resident_id": r["id"]}, {"_id": 0})
            if not edu:
                concerns += 1
                overdue_actions.append({"title": f"Education record missing: {cn.get(r['id'])}",
                                         "link": f"/residents/{r['id']}?tab=education"})
                continue
            pep_next = edu.get("pep_next_review") or ""
            if pep_next and pep_next < today_date:
                concerns += 1
                overdue_actions.append({"title": f"PEP overdue: {cn.get(r['id'])}",
                                         "link": f"/residents/{r['id']}?tab=education"})
            att = edu.get("attendance_pct")
            if isinstance(att, (int, float)) and att < 85:
                concerns += 1
                overdue_actions.append({"title": f"Attendance {att}%: {cn.get(r['id'])}",
                                         "link": f"/residents/{r['id']}?tab=education"})
        indicators = [{"label": "Education concerns", "value": concerns, "tone": _rag(100 - concerns * 12)}]
        score = max(0, 100 - concerns * 12)

    # ---- Workforce ----
    elif mid == "training_development":
        expired = await db.trainings.count_documents(
            {"expiry_date": {"$ne": None, "$lt": today_date}}
        )
        expiring_30 = await db.trainings.count_documents({
            "expiry_date": {"$gte": today_date,
                            "$lte": (now + timedelta(days=30)).date().isoformat()}
        })
        indicators = [
            {"label": "Expired", "value": expired, "tone": "red" if expired else "green"},
            {"label": "Expiring (30d)", "value": expiring_30, "tone": "amber" if expiring_30 else "green"},
        ]
        if expired:
            overdue_actions.append({"title": f"{expired} expired training record(s)", "link": "/training"})
        score = max(0, 100 - expired * 12 - expiring_30 * 3)

    elif mid == "supervision":
        staff_users = await db.users.find(
            {"role": {"$in": ["staff", "senior", "manager"]}},
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(500)
        sup_cutoff = (now - timedelta(days=30)).date().isoformat()
        overdue = []
        for u in staff_users:
            last = await db.supervisions.find_one(
                {"staff_id": u["id"], "kind": "supervision"}, sort=[("completed_at", -1)]
            )
            if not last or (last.get("completed_at") or "") < sup_cutoff:
                overdue.append(u)
                overdue_actions.append({
                    "title": f"Supervision overdue: {u['name']}",
                    "link": "/supervisions",
                })
        # Wellbeing signal (manager visibility into amber-zone count)
        wb_stressed = 0
        async for row in db.wellbeing_checkins.aggregate([
            {"$match": {"created_at": {"$gte": (now - timedelta(days=14)).isoformat()},
                         "mood": {"$in": ["overwhelmed", "stressed"]}}},
            {"$group": {"_id": "$user_id", "c": {"$sum": 1}}},
            {"$match": {"c": {"$gte": 3}}},
        ]):
            wb_stressed += 1
        indicators = [
            {"label": "Supervisions overdue", "value": len(overdue), "tone": _rag(100 - len(overdue) * 15)},
            {"label": "Staff in amber wellbeing", "value": wb_stressed, "tone": "amber" if wb_stressed else "green"},
        ]
        score = 100 if not staff_users else round(
            (len(staff_users) - len(overdue)) * 100 / len(staff_users)
        )

    elif mid == "staffing_rotas":
        # Shifts in next 7 days
        wk_iso = (now + timedelta(days=7)).isoformat()
        shifts_7 = await db.shifts.count_documents({
            "starts_at": {"$gte": now.isoformat(), "$lte": wk_iso},
        })
        unfilled = await db.shifts.count_documents({
            "starts_at": {"$gte": now.isoformat(), "$lte": wk_iso},
            "$or": [{"assigned_to_id": None}, {"assigned_to_id": ""}],
        })
        indicators = [
            {"label": "Shifts (next 7d)", "value": shifts_7, "tone": "green"},
            {"label": "Unassigned shifts", "value": unfilled, "tone": "red" if unfilled else "green"},
        ]
        if unfilled:
            overdue_actions.append({"title": f"{unfilled} unassigned shift(s) this week", "link": "/staff"})
        score = max(0, 100 - unfilled * 18)

    # ---- Governance ----
    elif mid == "leadership_oversight":
        audit_events_30 = await db.audit_events.count_documents({"at": {"$gte": cutoff_30}})
        actions_resolved_30 = await db.inspection_actions.count_documents(
            {"resolved_at": {"$gte": cutoff_30}}
        )
        actions_open = await db.inspection_actions.count_documents({"status": {"$ne": "resolved"}})
        indicators = [
            {"label": "Audit events (30d)", "value": audit_events_30, "tone": "green"},
            {"label": "Actions resolved (30d)", "value": actions_resolved_30, "tone": "green"},
            {"label": "Actions open", "value": actions_open, "tone": _rag(100 - actions_open * 6)},
        ]
        score = max(50, 100 - actions_open * 5)

    elif mid == "manager_monitoring":
        # Reg 45 / Reg 46 stand-in: rely on inspection_actions activity
        recent_visits = await db.regulation_44_visits.count_documents(
            {"visit_date": {"$gte": (now - timedelta(days=90)).date().isoformat()}}
        )
        indicators = [
            {"label": "Reg 44 visits (90d)", "value": recent_visits, "tone": "green" if recent_visits else "amber"},
        ]
        score = 100 if recent_visits >= 3 else 75 if recent_visits else 60

    elif mid == "action_plan":
        active = await db.inspection_actions.count_documents({"status": {"$ne": "resolved"}})
        high = await db.inspection_actions.count_documents(
            {"status": {"$ne": "resolved"}, "priority": "high"}
        )
        resolved_7 = await db.inspection_actions.count_documents(
            {"resolved_at": {"$gte": (now - timedelta(days=7)).isoformat()}}
        )
        indicators = [
            {"label": "Active actions", "value": active, "tone": _rag(100 - active * 5)},
            {"label": "High priority open", "value": high, "tone": "red" if high else "green"},
            {"label": "Resolved (7d)", "value": resolved_7, "tone": "green"},
        ]
        score = max(40, 100 - high * 12 - active * 3)

    # Compose result
    return {
        **mod,
        "indicators": indicators,
        "overdue_actions": overdue_actions[:8],
        "pattern_alerts": pattern_alerts,
        "score": max(0, min(100, score)),
        "rag": _rag(score),
        "rating": _rating(score),
    }


async def build_regulation_44(db) -> dict:
    """Build the full Regulation 44 payload (children's services only)."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_date = now.date().isoformat()

    all_residents = await db.residents.find({}, {"_id": 0}).to_list(500)
    children = [r for r in all_residents if _is_child(r)]
    child_ids = [r["id"] for r in children]
    child_name = {r["id"]: r.get("preferred_name") or r.get("name") or "—" for r in children}
    check_types = await db.compliance_check_types.find({}, {"_id": 0}).to_list(100)

    ctx = {
        "now": now,
        "today": today,
        "today_date": today_date,
        "yday_iso": (now - timedelta(days=1)).isoformat(),
        "cutoff_14": (now - timedelta(days=14)).isoformat(),
        "cutoff_30": (now - timedelta(days=30)).isoformat(),
        "cutoff_60": (now - timedelta(days=60)).isoformat(),
        "cutoff_48h": (now - timedelta(hours=48)).isoformat(),
        "children": children,
        "child_ids": child_ids,
        "child_name": child_name,
        "check_types": check_types,
    }

    modules_out: list[dict] = []
    for mod in MODULES:
        if mod["mode"] == "live":
            try:
                m = await _build_live_module(db, mod, ctx)
            except Exception as e:
                m = {**mod, "indicators": [], "overdue_actions": [],
                     "pattern_alerts": [], "score": 70, "rag": "amber",
                     "rating": _rating(70), "error": str(e)[:200]}
        else:
            # Manual module — placeholder until evidence added
            note = await db.regulation_44_notes.find_one(
                {"module_id": mod["id"]}, sort=[("updated_at", -1)],
            )
            has_note = bool(note)
            m = {
                **mod,
                "indicators": [{"label": "Manual evidence", "value": "Logged" if has_note else "Needed",
                                 "tone": "green" if has_note else "amber"}],
                "overdue_actions": [] if has_note else [{
                    "title": "Manual evidence note required",
                    "link": "/ofsted",
                }],
                "pattern_alerts": [],
                "score": 85 if has_note else 65,
                "rag": "green" if has_note else "amber",
                "rating": _rating(85 if has_note else 65),
                "manual_note": note.get("note") if note else None,
                "manual_note_at": note.get("updated_at") if note else None,
                "manual_note_by": note.get("updated_by_name") if note else None,
            }
        modules_out.append(m)

    # Aggregate by category
    by_category: dict[str, list] = {c["id"]: [] for c in CATEGORIES}
    for m in modules_out:
        by_category.setdefault(m["category"], []).append(m)

    categories_out = []
    for c in CATEGORIES:
        mods = by_category.get(c["id"], [])
        if not mods:
            continue
        avg = round(sum(x["score"] for x in mods) / len(mods))
        red = sum(1 for x in mods if x["rag"] == "red")
        amber = sum(1 for x in mods if x["rag"] == "amber")
        categories_out.append({
            **c,
            "modules": mods,
            "module_count": len(mods),
            "avg_score": avg,
            "rag": _rag(avg),
            "rating": _rating(avg),
            "red_count": red,
            "amber_count": amber,
        })

    overall = round(sum(m["score"] for m in modules_out) / max(1, len(modules_out)))
    rating = _rating(overall)

    # Latest Reg 44 visit summary
    latest_visit = await db.regulation_44_visits.find_one({}, {"_id": 0}, sort=[("visit_date", -1)])

    return {
        "scope": "children",
        "children_count": len(children),
        "generated_at": now.isoformat(),
        "overall_score": overall,
        "rating": rating,
        "module_count": len(modules_out),
        "live_count": sum(1 for m in modules_out if m["mode"] == "live"),
        "manual_count": sum(1 for m in modules_out if m["mode"] == "manual"),
        "categories": categories_out,
        "quality_standards_legend": QS,
        "latest_visit": latest_visit,
    }
