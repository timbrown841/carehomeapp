"""Ofsted Inspection Command Centre — aggregator for children's-services readiness.

Strictly scoped to CHILDREN'S residents (sector=children).
Adult sector data is intentionally excluded — see /api/cqc/readiness for adults.

Returns a single rich payload powering the war-room UI:
  - 10 domain scores (safeguarding, health_medication, education, documentation,
    staffing, home_environment, key_work, compliance, resident_voice, missing)
  - critical_actions: prioritised flat list with severity + deep-link + scope
  - safeguarding_overview: open SG, currently-missing, pattern alerts, recent escalations
  - residents_attention: high-risk children with one-glance reasons
  - quality_standards: lightweight P1 stub for phase B (placeholders only)
  - generated_at, recently_resolved (last 7 days of inspection_actions)
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional


ADULT_TYPES = {"adult_supported_living", "elderly_residential", "dementia",
               "mental_health", "veteran"}


def is_child(resident: dict) -> bool:
    st = resident.get("service_type")
    if not st:
        return True  # legacy residents default to children
    return st not in ADULT_TYPES


def _score_to_rating(score: int) -> dict:
    if score >= 90:
        return {"label": "Outstanding", "tone": "green"}
    if score >= 75:
        return {"label": "Good", "tone": "green"}
    if score >= 60:
        return {"label": "Requires improvement", "tone": "amber"}
    return {"label": "Inadequate", "tone": "red"}


def _severity_for_score(score: int) -> str:
    if score >= 90:
        return "low"
    if score >= 75:
        return "low"
    if score >= 60:
        return "medium"
    return "high"


async def build_command_centre(db) -> dict:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_date = now.date().isoformat()
    yday_iso = (now - timedelta(days=1)).isoformat()
    week_iso = (now - timedelta(days=7)).isoformat()
    cutoff_30 = (now - timedelta(days=30)).isoformat()
    cutoff_60 = (now - timedelta(days=60)).isoformat()
    cutoff_48h = (now - timedelta(hours=48)).isoformat()
    cutoff_14 = (now - timedelta(days=14)).isoformat()

    # ---- Load children's residents only ----
    all_residents = await db.residents.find({}, {"_id": 0}).to_list(500)
    children = [r for r in all_residents if is_child(r)]
    child_ids = [r["id"] for r in children]
    child_name = {r["id"]: r.get("preferred_name") or r.get("name") or "—" for r in children}

    critical_actions: list[dict] = []
    residents_attention: dict[str, dict] = {}

    def _add_resident_reason(rid: str, reason: str, severity: str = "medium"):
        a = residents_attention.setdefault(rid, {
            "resident_id": rid,
            "name": child_name.get(rid, "—"),
            "reasons": [],
            "max_severity": "low",
        })
        a["reasons"].append({"text": reason, "severity": severity})
        order = {"low": 0, "medium": 1, "high": 2}
        if order[severity] > order[a["max_severity"]]:
            a["max_severity"] = severity

    # ============================================================
    # DOMAIN 1 — Safeguarding (open >48h, restraints, repeat incidents)
    # ============================================================
    sg_open = await db.incidents.find(
        {"resident_id": {"$in": child_ids}, "safeguarding": True, "status": "open"},
        {"_id": 0, "id": 1, "resident_id": 1, "created_at": 1, "summary": 1, "category": 1, "severity": 1},
    ).to_list(200)
    sg_old = [i for i in sg_open if (i.get("created_at") or "") < cutoff_48h]

    restraint_30 = await db.incidents.count_documents({
        "resident_id": {"$in": child_ids},
        "$or": [{"category": "restraint"}, {"summary": {"$regex": "restrain|restraint|hold", "$options": "i"}}],
        "created_at": {"$gte": cutoff_30},
    })

    # Incidents per child in 30d (repeat-pattern detection)
    inc_30 = await db.incidents.find(
        {"resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30}},
        {"_id": 0, "resident_id": 1, "category": 1, "summary": 1, "severity": 1, "created_at": 1, "id": 1},
    ).to_list(500)
    by_resident_inc: dict[str, list] = {}
    for i in inc_30:
        by_resident_inc.setdefault(i["resident_id"], []).append(i)
    for rid, items in by_resident_inc.items():
        if len(items) >= 3:
            _add_resident_reason(rid, f"{len(items)} incidents in 30 days", "high")

    sg_score = 100
    if sg_old:
        sg_score = max(0, 100 - len(sg_old) * 25)
    if restraint_30 >= 3:
        sg_score = min(sg_score, 60)
    for i in sg_old:
        critical_actions.append({
            "id": f"sg_old:{i['id']}",
            "domain": "safeguarding",
            "severity": "high",
            "title": "Open safeguarding >48h",
            "subtitle": f"{child_name.get(i['resident_id'], '—')} · {i.get('category') or 'incident'}",
            "fix_link": f"/incidents/{i['id']}",
            "icon": "ShieldAlert",
            "raised_at": i.get("created_at"),
        })

    # ============================================================
    # DOMAIN 2 — Missing-from-care (open episodes + outstanding return interviews)
    # ============================================================
    open_missing = await db.missing_episodes.find(
        {"resident_id": {"$in": child_ids}, "returned_at": None},
        {"_id": 0, "id": 1, "resident_id": 1, "reported_at": 1},
    ).to_list(50)
    # Outstanding RIs — episodes returned but no return_interviews entry
    returned_episodes = await db.missing_episodes.find(
        {"resident_id": {"$in": child_ids},
         "returned_at": {"$ne": None, "$gte": cutoff_30}},
        {"_id": 0, "id": 1, "resident_id": 1, "returned_at": 1},
    ).to_list(200)
    ri_done_ep_ids = set(await db.return_interviews.distinct(
        "missing_episode_id", {"missing_episode_id": {"$in": [e["id"] for e in returned_episodes]}}
    ))
    ri_outstanding = [e for e in returned_episodes if e["id"] not in ri_done_ep_ids]

    # Repeat missing pattern (3+ in 60d)
    missing_60 = await db.missing_episodes.find(
        {"resident_id": {"$in": child_ids}, "reported_at": {"$gte": cutoff_60}},
        {"_id": 0, "resident_id": 1},
    ).to_list(500)
    miss_by_res: dict[str, int] = {}
    for m in missing_60:
        miss_by_res[m["resident_id"]] = miss_by_res.get(m["resident_id"], 0) + 1
    for rid, c in miss_by_res.items():
        if c >= 3:
            _add_resident_reason(rid, f"{c} missing episodes in 60 days", "high")

    missing_score = 100
    if open_missing:
        missing_score = max(0, 100 - len(open_missing) * 50)
    if ri_outstanding:
        missing_score = min(missing_score, max(60, 100 - len(ri_outstanding) * 15))
    for e in open_missing:
        critical_actions.append({
            "id": f"missing_open:{e['id']}",
            "domain": "missing",
            "severity": "high",
            "title": "Child currently missing",
            "subtitle": child_name.get(e["resident_id"], "—"),
            "fix_link": f"/residents/{e['resident_id']}?tab=safeguarding",
            "icon": "Siren",
            "raised_at": e.get("reported_at"),
        })
    for e in ri_outstanding[:10]:
        critical_actions.append({
            "id": f"ri_outstanding:{e['id']}",
            "domain": "missing",
            "severity": "medium",
            "title": "Return interview outstanding",
            "subtitle": f"{child_name.get(e['resident_id'], '—')} · returned {(e.get('returned_at') or '')[:10]}",
            "fix_link": f"/residents/{e['resident_id']}?tab=safeguarding",
            "icon": "ClipboardCheck",
            "raised_at": e.get("returned_at"),
        })

    # ============================================================
    # DOMAIN 3 — Health & Medication
    # ============================================================
    med_active = await db.medications.find(
        {"resident_id": {"$in": child_ids}, "active": True, "is_prn": False}, {"_id": 0}
    ).to_list(500)
    expected = signed = 0
    med_items: list = []
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
                else:
                    med_items.append({
                        "med_id": m["id"], "resident_id": m["resident_id"],
                        "label": f"{m['name']} {m['dose']} · {t}",
                    })
            except Exception:
                continue
    med_score = 100 if expected == 0 else round(signed * 100.0 / expected)

    # Refusals last 14d not yet escalated
    refusals = await db.medication_admins.find(
        {"resident_id": {"$in": child_ids}, "status": "refused", "scheduled_at": {"$gte": cutoff_14}},
        {"_id": 0, "id": 1, "resident_id": 1, "scheduled_at": 1, "notes": 1, "medication_id": 1},
    ).to_list(200)
    for r in refusals:
        _add_resident_reason(r["resident_id"], "Medication refused (14d)", "medium")
    health_score = min(med_score, 100 if len(refusals) < 3 else 75)
    for it in med_items[:8]:
        critical_actions.append({
            "id": f"med_unsigned:{it['med_id']}",
            "domain": "health_medication",
            "severity": "medium",
            "title": "Medication unsigned",
            "subtitle": f"{child_name.get(it['resident_id'], '—')} · {it['label']}",
            "fix_link": "/medications",
            "icon": "Pill",
            "raised_at": now.isoformat(),
        })
    if len(refusals) >= 3:
        critical_actions.append({
            "id": "med_refusal_cluster",
            "domain": "health_medication",
            "severity": "medium",
            "title": "Medication refusals — review needed",
            "subtitle": f"{len(refusals)} refusals in last 14 days",
            "fix_link": "/medications",
            "icon": "Pill",
            "raised_at": now.isoformat(),
        })

    # ============================================================
    # DOMAIN 4 — Risk reviews + Documentation (incl. document expiry)
    # ============================================================
    rr_overdue = []
    for r in children:
        nxt = r.get("risk_next_review") or ""
        if not nxt or nxt < today_date:
            rr_overdue.append(r)
            _add_resident_reason(r["id"], "Risk review overdue", "high")
    rr_score = 100 if not children else round((len(children) - len(rr_overdue)) * 100.0 / len(children))
    for r in rr_overdue[:8]:
        critical_actions.append({
            "id": f"rr_overdue:{r['id']}",
            "domain": "documentation",
            "severity": "high",
            "title": "Risk review overdue",
            "subtitle": child_name.get(r["id"], "—"),
            "fix_link": f"/residents/{r['id']}?tab=safeguarding",
            "icon": "AlertTriangle",
            "raised_at": r.get("risk_next_review"),
        })

    # Documents — expired or review overdue
    expired_docs = await db.documents.find(
        {"resident_id": {"$in": child_ids},
         "expiry_date": {"$ne": None, "$lt": today_date}},
        {"_id": 0, "id": 1, "resident_id": 1, "category": 1, "title": 1, "expiry_date": 1},
    ).to_list(100)
    docs_score = 100 if not children else max(0, 100 - len(expired_docs) * 10)
    for d in expired_docs[:8]:
        critical_actions.append({
            "id": f"doc_expired:{d['id']}",
            "domain": "documentation",
            "severity": "medium",
            "title": "Document expired",
            "subtitle": f"{child_name.get(d['resident_id'], '—')} · {d.get('title') or d.get('category')}",
            "fix_link": f"/residents/{d['resident_id']}?tab=documents",
            "icon": "FileText",
            "raised_at": d.get("expiry_date"),
        })

    # Statutory visits overdue
    visits_overdue = await db.statutory_visits.find(
        {"resident_id": {"$in": child_ids}, "status": "scheduled",
         "due_date": {"$lt": today_date}},
        {"_id": 0, "id": 1, "resident_id": 1, "kind": 1, "due_date": 1},
    ).to_list(100)
    for v in visits_overdue[:8]:
        critical_actions.append({
            "id": f"visit_overdue:{v['id']}",
            "domain": "documentation",
            "severity": "medium",
            "title": "Statutory visit overdue",
            "subtitle": f"{child_name.get(v['resident_id'], '—')} · {(v.get('kind') or '').replace('_', ' ')}",
            "fix_link": "/visits",
            "icon": "CalendarClock",
            "raised_at": v.get("due_date"),
        })

    # ============================================================
    # DOMAIN 5 — Education (PEP / school engagement)
    # ============================================================
    edu_concerns = []
    for r in children:
        edu = await db.education_records.find_one({"resident_id": r["id"]}, {"_id": 0})
        if not edu:
            edu_concerns.append({"rid": r["id"], "reason": "No education record on file"})
            _add_resident_reason(r["id"], "Education record missing", "medium")
            continue
        pep_next = edu.get("pep_next_review") or ""
        if pep_next and pep_next < today_date:
            edu_concerns.append({"rid": r["id"], "reason": f"PEP overdue ({pep_next})"})
            _add_resident_reason(r["id"], "PEP overdue", "medium")
        att = edu.get("attendance_pct")
        if isinstance(att, (int, float)) and att < 85:
            edu_concerns.append({"rid": r["id"], "reason": f"Attendance {att}%"})
            _add_resident_reason(r["id"], f"School attendance {att}%", "medium")
    edu_score = 100 if not children else max(0, 100 - len(edu_concerns) * 12)
    for e in edu_concerns[:6]:
        critical_actions.append({
            "id": f"edu:{e['rid']}:{e['reason'][:20]}",
            "domain": "education",
            "severity": "medium",
            "title": "Education concern",
            "subtitle": f"{child_name.get(e['rid'], '—')} · {e['reason']}",
            "fix_link": f"/residents/{e['rid']}?tab=education",
            "icon": "GraduationCap",
            "raised_at": now.isoformat(),
        })

    # ============================================================
    # DOMAIN 6 — Key Work / Therapeutic Practice
    # ============================================================
    kw_concerns = []
    for r in children:
        last_kw = await db.key_work_sessions.find_one(
            {"resident_id": r["id"]}, sort=[("planned_for", -1)],
        )
        if not last_kw:
            kw_concerns.append({"rid": r["id"], "reason": "No key work recorded"})
            _add_resident_reason(r["id"], "No key work on file", "medium")
        else:
            last_at = last_kw.get("completed_at") or last_kw.get("planned_for") or ""
            if last_at and last_at < cutoff_30:
                kw_concerns.append({"rid": r["id"], "reason": "No key work in 30+ days"})
                _add_resident_reason(r["id"], "No key work in 30+ days", "medium")
    kw_score = 100 if not children else max(0, 100 - len(kw_concerns) * 15)
    for k in kw_concerns[:6]:
        critical_actions.append({
            "id": f"kw:{k['rid']}:{k['reason'][:20]}",
            "domain": "key_work",
            "severity": "medium",
            "title": "Key work attention",
            "subtitle": f"{child_name.get(k['rid'], '—')} · {k['reason']}",
            "fix_link": f"/residents/{k['rid']}?tab=daily-care",
            "icon": "HeartHandshake",
            "raised_at": now.isoformat(),
        })

    # ============================================================
    # DOMAIN 7 — Staffing (supervisions, training expiry)
    # ============================================================
    staff_users = await db.users.find(
        {"role": {"$in": ["staff", "senior", "manager"]}},
        {"_id": 0, "id": 1, "name": 1, "role": 1},
    ).to_list(500)
    sup_cutoff = (now - timedelta(days=30)).date().isoformat()
    sup_overdue = []
    for u in staff_users:
        last = await db.supervisions.find_one(
            {"staff_id": u["id"], "kind": "supervision"}, sort=[("completed_at", -1)]
        )
        if not last or (last.get("completed_at") or "") < sup_cutoff:
            sup_overdue.append(u)
    sup_score = 100 if not staff_users else round(
        (len(staff_users) - len(sup_overdue)) * 100.0 / len(staff_users)
    )

    # Training expiry
    train_expired = await db.trainings.count_documents({
        "expiry_date": {"$ne": None, "$lt": today_date},
    })

    staffing_score = min(sup_score, 100 if train_expired == 0 else max(60, 100 - train_expired * 10))
    for u in sup_overdue[:6]:
        critical_actions.append({
            "id": f"sup:{u['id']}",
            "domain": "staffing",
            "severity": "medium",
            "title": "Supervision overdue (30d)",
            "subtitle": u["name"],
            "fix_link": "/supervisions",
            "icon": "ClipboardCheck",
            "raised_at": now.isoformat(),
        })
    if train_expired:
        critical_actions.append({
            "id": "train_expired_summary",
            "domain": "staffing",
            "severity": "medium",
            "title": "Training expired",
            "subtitle": f"{train_expired} expired training record(s)",
            "fix_link": "/training",
            "icon": "GraduationCap",
            "raised_at": now.isoformat(),
        })

    # ============================================================
    # DOMAIN 8 — Home Environment (compliance checks)
    # ============================================================
    # Pull check types — frequency-driven overdue detection
    check_types = await db.compliance_check_types.find({}, {"_id": 0}).to_list(100)
    env_overdue: list[dict] = []
    for ct in check_types:
        last = await db.compliance_logs.find_one(
            {"check_type_id": ct["id"]}, sort=[("performed_at", -1)]
        )
        freq_days = ct.get("frequency_days", 30)
        cutoff_iso = (now - timedelta(days=freq_days)).isoformat()
        if not last or (last.get("performed_at") or "") < cutoff_iso:
            env_overdue.append({
                "check_type_id": ct["id"],
                "title": ct.get("title") or ct["id"],
                "group": ct.get("group"),
                "last_at": (last or {}).get("performed_at"),
            })
    open_maint = await db.maintenance_issues.count_documents({"status": {"$ne": "resolved"}})
    env_score = 100 if not check_types else max(0, 100 - len(env_overdue) * 8)
    if open_maint > 5:
        env_score = min(env_score, 70)
    for ov in env_overdue[:8]:
        critical_actions.append({
            "id": f"env:{ov['check_type_id']}",
            "domain": "home_environment",
            "severity": "medium" if "fire" in ov["check_type_id"] or "water" in ov["check_type_id"] else "low",
            "title": f"{ov['title']} overdue",
            "subtitle": "Home Operations · safety check",
            "fix_link": "/operations",
            "icon": "Building2",
            "raised_at": ov.get("last_at") or now.isoformat(),
        })

    # ============================================================
    # DOMAIN 9 — Compliance (rolled-up of compliance_logs status)
    # ============================================================
    failed_recent = await db.compliance_logs.count_documents(
        {"status": "fail", "performed_at": {"$gte": cutoff_30}}
    )
    action_needed = await db.compliance_logs.count_documents(
        {"status": "action_needed", "performed_at": {"$gte": cutoff_30}}
    )
    compliance_score = max(0, 100 - failed_recent * 20 - action_needed * 5)

    # ============================================================
    # DOMAIN 10 — Resident Voice (daily notes + 24h coverage)
    # ============================================================
    notes_missing = []
    for r in children:
        rec = await db.notes.find_one({"resident_id": r["id"], "created_at": {"$gte": yday_iso}})
        if not rec:
            notes_missing.append(r)
    voice_score = 100 if not children else round((len(children) - len(notes_missing)) * 100.0 / len(children))

    # ============================================================
    # PATTERN ALERTS (cross-resident)
    # ============================================================
    pattern_alerts = []
    if restraint_30 >= 3:
        pattern_alerts.append({
            "id": "restraint_cluster",
            "severity": "high",
            "title": "Restraint pattern",
            "message": f"{restraint_30} restraints recorded across the home in 30 days. Review behaviour management approach.",
        })
    repeat_missing_children = [rid for rid, c in miss_by_res.items() if c >= 3]
    if repeat_missing_children:
        pattern_alerts.append({
            "id": "repeat_missing",
            "severity": "high",
            "title": f"{len(repeat_missing_children)} repeat-missing child(ren)",
            "message": "3+ missing episodes in 60 days. Contextual safeguarding review recommended.",
        })
    self_harm_30 = await db.incidents.count_documents({
        "resident_id": {"$in": child_ids},
        "$or": [
            {"category": {"$in": ["self_harm", "self-harm"]}},
            {"summary": {"$regex": "self.harm|self harm|cutting|overdose", "$options": "i"}},
        ],
        "created_at": {"$gte": cutoff_30},
    })
    if self_harm_30 >= 2:
        pattern_alerts.append({
            "id": "self_harm_cluster",
            "severity": "high",
            "title": "Self-harm cluster",
            "message": f"{self_harm_30} self-harm incidents in 30 days. Trauma-informed review &amp; CAMHS check.",
        })
    police_30 = await db.incidents.count_documents({
        "resident_id": {"$in": child_ids},
        "$or": [{"category": "police"}, {"summary": {"$regex": "police|arrested|999", "$options": "i"}}],
        "created_at": {"$gte": cutoff_30},
    })
    if police_30 >= 3:
        pattern_alerts.append({
            "id": "police_cluster",
            "severity": "medium",
            "title": "Police involvement pattern",
            "message": f"{police_30} police-related incidents in 30 days.",
        })

    # ============================================================
    # RECENT ESCALATIONS (last 7 days of high-severity incidents)
    # ============================================================
    recent_esc = await db.incidents.find(
        {"resident_id": {"$in": child_ids}, "created_at": {"$gte": week_iso},
         "$or": [{"safeguarding": True}, {"severity": {"$in": ["high", "critical"]}}]},
        {"_id": 0, "id": 1, "resident_id": 1, "summary": 1, "category": 1, "severity": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(20)
    for e in recent_esc:
        e["resident_name"] = child_name.get(e.get("resident_id"), "—")

    # ============================================================
    # COMPOSE DOMAIN SCORES
    # ============================================================
    domains = [
        {"id": "safeguarding", "title": "Safeguarding", "score": sg_score,
         "summary": f"{len(sg_old)} open >48h · {restraint_30} restraints (30d)",
         "icon": "ShieldAlert", "fix_link": "/incidents"},
        {"id": "missing", "title": "Missing-from-care", "score": missing_score,
         "summary": f"{len(open_missing)} currently missing · {len(ri_outstanding)} RI outstanding",
         "icon": "Siren", "fix_link": "/residents"},
        {"id": "health_medication", "title": "Health & Medication", "score": health_score,
         "summary": f"{signed}/{expected} MAR signed · {len(refusals)} refusals (14d)",
         "icon": "Pill", "fix_link": "/medications"},
        {"id": "education", "title": "Education", "score": edu_score,
         "summary": f"{len(edu_concerns)} education concern(s)",
         "icon": "GraduationCap", "fix_link": "/residents"},
        {"id": "documentation", "title": "Documentation", "score": min(rr_score, docs_score),
         "summary": f"{len(rr_overdue)} risk reviews · {len(expired_docs)} expired docs · {len(visits_overdue)} visits overdue",
         "icon": "FileText", "fix_link": "/visits"},
        {"id": "staffing", "title": "Staffing", "score": staffing_score,
         "summary": f"{len(sup_overdue)} supervisions overdue · {train_expired} expired training",
         "icon": "Users", "fix_link": "/staff-operations"},
        {"id": "home_environment", "title": "Home Environment", "score": env_score,
         "summary": f"{len(env_overdue)} safety check(s) overdue · {open_maint} open maintenance",
         "icon": "Building2", "fix_link": "/operations"},
        {"id": "key_work", "title": "Key Work / Therapeutic", "score": kw_score,
         "summary": f"{len(kw_concerns)} child(ren) without recent key work",
         "icon": "HeartHandshake", "fix_link": "/key-work"},
        {"id": "compliance", "title": "Compliance", "score": compliance_score,
         "summary": f"{failed_recent} failed · {action_needed} action-needed (30d)",
         "icon": "ShieldCheck", "fix_link": "/operations"},
        {"id": "resident_voice", "title": "Resident Voice", "score": voice_score,
         "summary": f"{len(notes_missing)}/{len(children)} no daily note (24h)",
         "icon": "MessageSquare", "fix_link": "/notes"},
    ]
    for d in domains:
        d["rating"] = _score_to_rating(d["score"])
        d["severity"] = _severity_for_score(d["score"])

    overall = round(sum(d["score"] for d in domains) / len(domains))
    rating = _score_to_rating(overall)

    # Prioritise critical_actions: high first, then medium, then low; latest first within ties
    sev_order = {"high": 0, "medium": 1, "low": 2}
    critical_actions.sort(
        key=lambda x: (sev_order.get(x["severity"], 9), -(x.get("raised_at") or "").__hash__())
    )

    # Attention list — sort by max severity descending, then by reason count
    attention_list = sorted(
        residents_attention.values(),
        key=lambda x: (-sev_order.get(x["max_severity"], 9), -len(x["reasons"])),
    )

    # Recently resolved actions (last 7d, from inspection_actions collection)
    resolved = await db.inspection_actions.find(
        {"status": "resolved", "resolved_at": {"$gte": week_iso}},
        {"_id": 0},
    ).sort("resolved_at", -1).to_list(50)

    return {
        "overall": overall,
        "rating": rating,
        "generated_at": now.isoformat(),
        "scope": "children",
        "children_count": len(children),
        "domains": domains,
        "critical_actions": critical_actions,
        "critical_actions_count": len(critical_actions),
        "safeguarding_overview": {
            "open_safeguarding": len(sg_open),
            "open_over_48h": len(sg_old),
            "currently_missing": len(open_missing),
            "ri_outstanding": len(ri_outstanding),
            "restraint_30d": restraint_30,
            "self_harm_30d": self_harm_30,
            "police_30d": police_30,
            "pattern_alerts": pattern_alerts,
            "recent_escalations": recent_esc,
        },
        "residents_attention": attention_list,
        "recently_resolved": resolved,
    }
