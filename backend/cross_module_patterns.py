"""Cross-Module Pattern Intelligence.

Aggregates patterns across every operational collection to surface:
  - recurring themes (incident categories trending)
  - repeat-concern children (3+ unique pattern types)
  - escalation trends (this week vs last week deltas)
  - unresolved risks (open >X days by domain)
  - safeguarding hotspots (locations, times-of-day, repeat residents)
  - leadership blind spots (modules where actions never get assigned/signed off)

NOT AI — deterministic SQL-style aggregation over MongoDB.
Children's-services scope only (consistent with /ofsted and Regulation 44).
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta


ADULT_TYPES = {"adult_supported_living", "elderly_residential", "dementia",
               "mental_health", "veteran"}


def _is_child(r: dict) -> bool:
    st = r.get("service_type")
    return not st or st not in ADULT_TYPES


async def build_pattern_intelligence(db) -> dict:
    now = datetime.now(timezone.utc)
    cutoff_7 = (now - timedelta(days=7)).isoformat()
    cutoff_14 = (now - timedelta(days=14)).isoformat()
    cutoff_30 = (now - timedelta(days=30)).isoformat()
    week_before = (now - timedelta(days=14)).isoformat()  # last week start
    last_week_end = cutoff_7  # last week ends as this week starts

    residents = await db.residents.find({}, {"_id": 0}).to_list(500)
    children = [r for r in residents if _is_child(r)]
    child_ids = [r["id"] for r in children]
    name = {r["id"]: r.get("preferred_name") or r.get("name") or "—" for r in children}

    # ============================================================
    # 1. Recurring themes — incident categories trending in 30d
    # ============================================================
    themes: list[dict] = []
    cur = db.incidents.aggregate([
        {"$match": {"resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30}}},
        {"$group": {"_id": {"category": "$category"}, "c": {"$sum": 1}}},
        {"$sort": {"c": -1}}, {"$limit": 8},
    ])
    async for row in cur:
        cat = (row["_id"]["category"] or "uncategorised").replace("_", " ")
        themes.append({
            "title": cat.capitalize(),
            "count_30d": row["c"],
            "domain": "incidents",
        })

    # ============================================================
    # 2. Repeat-concern children — 2+ distinct concern types in 30d
    # ============================================================
    concern_by_resident: dict[str, set] = {rid: set() for rid in child_ids}
    # Incidents per child
    async for r in db.incidents.find(
        {"resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30}},
        {"_id": 0, "resident_id": 1},
    ):
        concern_by_resident[r["resident_id"]].add("incidents")
    # Safeguarding
    async for r in db.incidents.find(
        {"resident_id": {"$in": child_ids}, "safeguarding": True, "created_at": {"$gte": cutoff_30}},
        {"_id": 0, "resident_id": 1},
    ):
        concern_by_resident[r["resident_id"]].add("safeguarding")
    # Missing
    async for r in db.missing_episodes.find(
        {"resident_id": {"$in": child_ids}, "reported_at": {"$gte": cutoff_30}},
        {"_id": 0, "resident_id": 1},
    ):
        concern_by_resident[r["resident_id"]].add("missing")
    # Med refusals
    async for r in db.medication_admins.find(
        {"resident_id": {"$in": child_ids}, "status": "refused", "scheduled_at": {"$gte": cutoff_30}},
        {"_id": 0, "resident_id": 1},
    ):
        concern_by_resident[r["resident_id"]].add("medication_refusal")
    # Education concerns (PEP overdue / attendance <85)
    today_date = now.date().isoformat()
    async for r in db.education_records.find(
        {"resident_id": {"$in": child_ids},
         "$or": [{"pep_next_review": {"$lt": today_date}},
                  {"attendance_pct": {"$lt": 85}}]},
        {"_id": 0, "resident_id": 1},
    ):
        concern_by_resident[r["resident_id"]].add("education")

    repeat_concerns = []
    for rid, tags in concern_by_resident.items():
        if len(tags) >= 2:
            repeat_concerns.append({
                "resident_id": rid,
                "name": name.get(rid, "—"),
                "concern_types": sorted(tags),
                "count": len(tags),
            })
    repeat_concerns.sort(key=lambda x: -x["count"])

    # ============================================================
    # 3. Escalation trends — this week vs last week
    # ============================================================
    def_trend = {"this_week": 0, "last_week": 0, "delta": 0}
    trends = {}

    async def _delta(coll, base_q, ts_field):
        q_this = {**base_q, ts_field: {"$gte": cutoff_7}}
        q_last = {**base_q, ts_field: {"$gte": week_before, "$lt": last_week_end}}
        a = await db[coll].count_documents(q_this)
        b = await db[coll].count_documents(q_last)
        return {"this_week": a, "last_week": b, "delta": a - b}

    trends["incidents"] = await _delta("incidents", {"resident_id": {"$in": child_ids}}, "created_at")
    trends["safeguarding"] = await _delta("incidents", {
        "resident_id": {"$in": child_ids}, "safeguarding": True,
    }, "created_at")
    trends["missing_episodes"] = await _delta("missing_episodes", {
        "resident_id": {"$in": child_ids},
    }, "reported_at")
    trends["med_refusals"] = await _delta("medication_admins", {
        "resident_id": {"$in": child_ids}, "status": "refused",
    }, "scheduled_at")
    trends["restraints"] = await _delta("incidents", {
        "resident_id": {"$in": child_ids}, "category": "restraint",
    }, "created_at")

    # ============================================================
    # 4. Unresolved risks — items open >X days
    # ============================================================
    unresolved = []
    sg_old = await db.incidents.count_documents({
        "resident_id": {"$in": child_ids}, "safeguarding": True, "status": "open",
        "created_at": {"$lt": (now - timedelta(hours=48)).isoformat()},
    })
    if sg_old:
        unresolved.append({
            "domain": "safeguarding", "label": "Safeguarding incidents open >48h",
            "count": sg_old, "severity": "high",
            "link": "/incidents",
        })
    actions_open_old = await db.inspection_actions.count_documents({
        "status": {"$ne": "resolved"},
        "priority": "high",
        "due_date": {"$lt": today_date},
    })
    if actions_open_old:
        unresolved.append({
            "domain": "leadership", "label": "High-priority actions overdue",
            "count": actions_open_old, "severity": "high",
            "link": "/ofsted",
        })
    rr_overdue = sum(1 for r in children
                      if not r.get("risk_next_review") or (r.get("risk_next_review") or "") < today_date)
    if rr_overdue:
        unresolved.append({
            "domain": "documentation", "label": "Risk reviews overdue",
            "count": rr_overdue, "severity": "high" if rr_overdue >= 3 else "medium",
            "link": "/residents",
        })
    docs_expired = await db.documents.count_documents({
        "resident_id": {"$in": child_ids},
        "expiry_date": {"$ne": None, "$lt": today_date},
    })
    if docs_expired:
        unresolved.append({
            "domain": "documentation", "label": "Documents expired",
            "count": docs_expired, "severity": "medium",
            "link": "/residents",
        })

    # ============================================================
    # 5. Safeguarding hotspots — locations / times / repeat residents
    # ============================================================
    hotspots = {"locations": [], "times_of_day": [], "repeat_residents": []}
    # Locations from missing episodes (last_seen_at)
    cur = db.missing_episodes.aggregate([
        {"$match": {"resident_id": {"$in": child_ids}, "reported_at": {"$gte": cutoff_30}}},
        {"$group": {"_id": "$last_seen_at", "c": {"$sum": 1}}},
        {"$match": {"c": {"$gte": 2}, "_id": {"$ne": None, "$nin": ["", None]}}},
        {"$sort": {"c": -1}}, {"$limit": 5},
    ])
    async for row in cur:
        hotspots["locations"].append({"location": row["_id"], "count": row["c"]})

    # Incident time-of-day buckets
    bucket = {"00-06": 0, "06-12": 0, "12-18": 0, "18-24": 0}
    async for inc in db.incidents.find(
        {"resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30}},
        {"_id": 0, "created_at": 1},
    ):
        try:
            h = int(inc["created_at"][11:13])
            if h < 6: bucket["00-06"] += 1
            elif h < 12: bucket["06-12"] += 1
            elif h < 18: bucket["12-18"] += 1
            else: bucket["18-24"] += 1
        except Exception:
            continue
    total_bucket = sum(bucket.values()) or 1
    hotspots["times_of_day"] = [
        {"window": k, "count": v, "pct": round(v * 100 / total_bucket)}
        for k, v in bucket.items()
    ]

    # Repeat residents (≥3 incidents in 30d)
    cur = db.incidents.aggregate([
        {"$match": {"resident_id": {"$in": child_ids}, "created_at": {"$gte": cutoff_30}}},
        {"$group": {"_id": "$resident_id", "c": {"$sum": 1}}},
        {"$match": {"c": {"$gte": 3}}},
        {"$sort": {"c": -1}}, {"$limit": 6},
    ])
    async for row in cur:
        hotspots["repeat_residents"].append({
            "resident_id": row["_id"], "name": name.get(row["_id"], "—"),
            "count": row["c"],
        })

    # ============================================================
    # 6. Leadership blind spots — domains where actions go unowned or unresolved
    # ============================================================
    blind_spots = []
    unowned = await db.inspection_actions.count_documents({
        "status": {"$ne": "resolved"},
        "$or": [{"assigned_to_id": None}, {"assigned_to_id": ""}],
    })
    if unowned:
        blind_spots.append({
            "title": "Unowned active actions",
            "detail": f"{unowned} action(s) without an assigned owner.",
            "severity": "medium",
            "link": "/ofsted",
        })
    unsigned = await db.inspection_actions.count_documents({
        "status": "resolved", "signed_off_at": None,
    })
    if unsigned:
        blind_spots.append({
            "title": "Resolved actions awaiting manager sign-off",
            "detail": f"{unsigned} action(s) marked resolved but not signed off.",
            "severity": "low",
            "link": "/ofsted",
        })
    no_visits = await db.regulation_44_visits.count_documents({
        "visit_date": {"$gte": (now - timedelta(days=60)).date().isoformat()},
    })
    if not no_visits:
        blind_spots.append({
            "title": "No Regulation 44 visit logged (60d)",
            "detail": "Independent visitor reports are part of leadership oversight evidence.",
            "severity": "medium",
            "link": "/ofsted",
        })

    return {
        "generated_at": now.isoformat(),
        "scope": "children",
        "recurring_themes": themes,
        "repeat_concern_children": repeat_concerns[:8],
        "escalation_trends": trends,
        "unresolved_risks": unresolved,
        "safeguarding_hotspots": hotspots,
        "leadership_blind_spots": blind_spots,
    }
