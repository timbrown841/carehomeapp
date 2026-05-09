"""Safelyn Systems · Chronology / Timeline service.

Aggregates events from across a resident's record into a single chronological
operational memory. Used as the flagship safeguarding chronology for inspections,
strategy meetings, serious incident reviews and shift handovers.

Sources aggregated:
  - incidents
  - missing_episodes
  - return_interviews
  - body_maps
  - medication_admins (refused / withheld only)
  - statutory_visits (LAC, IRO, social-worker, Reg 44/45, Ofsted)
  - key_work_sessions
  - health_appointments
  - notes (daily care notes, kept lower-priority)

Pattern detection is RULES-BASED only — no AI/LLM safeguarding decisions.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any


# Event categories drive icon + colour on the frontend.
CATEGORY_META = {
    "safeguarding":    {"colour": "#A8273A", "icon": "ShieldAlert",   "label": "Safeguarding"},
    "missing":         {"colour": "#D27D2D", "icon": "AlertTriangle", "label": "Missing"},
    "police":          {"colour": "#1C1C1A", "icon": "Siren",         "label": "Police"},
    "incident":        {"colour": "#D4A015", "icon": "AlertOctagon",  "label": "Incident"},
    "restraint":       {"colour": "#7A1C24", "icon": "HandStop",      "label": "Restraint"},
    "self_harm":       {"colour": "#A8273A", "icon": "HeartCrack",    "label": "Self-harm"},
    "exploitation":    {"colour": "#A8273A", "icon": "ShieldAlert",   "label": "Exploitation"},
    "body_map":        {"colour": "#7A4F8C", "icon": "User",          "label": "Body map"},
    "health":          {"colour": "#7A4F8C", "icon": "HeartPulse",    "label": "Health"},
    "medication":      {"colour": "#7A4F8C", "icon": "Pill",          "label": "Medication"},
    "education":       {"colour": "#1C5C8C", "icon": "GraduationCap", "label": "Education"},
    "professional":    {"colour": "#1C5C8C", "icon": "Briefcase",     "label": "Professional visit"},
    "key_work":        {"colour": "#0E3B4A", "icon": "MessageSquare", "label": "Key work"},
    "therapeutic":     {"colour": "#0E3B4A", "icon": "Sparkles",      "label": "Therapeutic"},
    "achievement":     {"colour": "#2F6A3A", "icon": "Trophy",        "label": "Achievement"},
    "review":          {"colour": "#1C5C8C", "icon": "ClipboardCheck","label": "Review"},
    "note":            {"colour": "#5d6068", "icon": "NotebookPen",   "label": "Daily note"},
    "return_interview":{"colour": "#D27D2D", "icon": "MessageCircle", "label": "Return interview"},
    "placement":       {"colour": "#1C1C1A", "icon": "Home",          "label": "Placement"},
}


def _meta(category: str) -> Dict[str, str]:
    return CATEGORY_META.get(category, CATEGORY_META["note"])


def _shorten(text: Optional[str], n: int = 240) -> str:
    if not text:
        return ""
    text = str(text).strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def _safe_lower(s: Any) -> str:
    return str(s or "").lower()


# ---------------------------------------------------------------------------
# Event normalisers — each returns a list[Event]
# ---------------------------------------------------------------------------

def _from_incidents(docs: List[dict]) -> List[dict]:
    out = []
    for d in docs:
        body = d.get("structured_report") or d.get("body") or d.get("description") or ""
        is_safe = bool(d.get("safeguarding"))
        sev = (d.get("severity") or "low").lower()
        # Pick category by tags / content
        text = _safe_lower(body) + " " + " ".join(d.get("tags") or []).lower()
        category = "incident"
        tags = ["incident"]
        if is_safe:
            category = "safeguarding"
            tags.append("safeguarding")
        if "police" in text or d.get("police_reference"):
            tags.append("police")
        if "self-harm" in text or "self harm" in text or "ligature" in text:
            category = "self_harm"
            tags.append("self_harm")
        if "restraint" in text or "physical intervention" in text or "hold" in text:
            category = "restraint"
            tags.append("restraint")
        if "csae" in text or "exploitation" in text or "cse" in text:
            category = "exploitation"
            tags.append("exploitation")
        if "aggression" in text or "violence" in text or "assault" in text or "behaviour" in text:
            tags.append("aggression")
        out.append({
            "id": f"incident:{d['id']}",
            "source_collection": "incidents",
            "source_id": d["id"],
            "at": d.get("created_at"),
            "category": category,
            "severity": sev,
            "title": (d.get("incident_type") or d.get("category") or "Incident").title(),
            "summary": _shorten(body),
            "actor_name": d.get("author_name"),
            "tags": tags,
            "metadata": {
                "police_reference": d.get("police_reference"),
                "status": d.get("status"),
            },
        })
    return out


def _from_missing(docs: List[dict]) -> List[dict]:
    out = []
    for d in docs:
        location = d.get("last_seen_location") or ""
        associates = d.get("associates") or []
        out.append({
            "id": f"missing:{d['id']}",
            "source_collection": "missing_episodes",
            "source_id": d["id"],
            "at": d.get("reported_at"),
            "category": "missing",
            "severity": "high" if not d.get("returned_at") else "medium",
            "title": "Missing from care" + (" · open" if not d.get("returned_at") else " · returned"),
            "summary": _shorten(f"Last seen: {location}" + (f" · Associates: {', '.join(associates)}" if associates else "")),
            "actor_name": d.get("reported_by_name"),
            "tags": ["missing"] + (["police"] if d.get("police_reference") else []),
            "metadata": {
                "location": location,
                "associates": associates,
                "police_reference": d.get("police_reference"),
                "returned_at": d.get("returned_at"),
            },
        })
    return out


def _from_return_interviews(docs: List[dict]) -> List[dict]:
    out = []
    for d in docs:
        out.append({
            "id": f"ri:{d['id']}",
            "source_collection": "return_interviews",
            "source_id": d["id"],
            "at": d.get("conducted_at") or d.get("created_at"),
            "category": "return_interview",
            "severity": "high" if d.get("safeguarding_concerns") else "medium",
            "title": "Return interview",
            "summary": _shorten(d.get("account_of_events") or ""),
            "actor_name": d.get("conducted_by_name"),
            "tags": ["missing", "return_interview"]
                + (["safeguarding"] if d.get("safeguarding_concerns") else [])
                + (["exploitation"] if d.get("exploitation_indicators") else []),
            "metadata": {
                "exploitation_indicators": d.get("exploitation_indicators") or [],
                "locations_visited": d.get("locations_visited"),
                "who_with": d.get("who_with"),
                "missing_episode_id": d.get("missing_episode_id"),
                "signed_off_by": d.get("signed_off_by"),
            },
        })
    return out


def _from_body_maps(docs: List[dict]) -> List[dict]:
    out = []
    for d in docs:
        marks = d.get("marks") or []
        types = sorted({m.get("type") for m in marks if m.get("type")})
        sev_set = {(m.get("severity") or "").lower() for m in marks}
        sev = "high" if "severe" in sev_set or "high" in sev_set else "medium" if marks else "low"
        out.append({
            "id": f"bm:{d['id']}",
            "source_collection": "body_maps",
            "source_id": d["id"],
            "at": d.get("recorded_at") or d.get("created_at"),
            "category": "body_map",
            "severity": sev,
            "title": f"Body map · {len(marks)} mark{'s' if len(marks) != 1 else ''}",
            "summary": _shorten(", ".join(types) + (" · " + (d.get("notes") or "") if d.get("notes") else "")),
            "actor_name": d.get("recorded_by_name"),
            "tags": ["body_map"] + (["self_harm"] if any("self" in (t or "").lower() for t in types) else []),
            "metadata": {"types": list(types), "marks_count": len(marks)},
        })
    return out


def _from_med_admins(docs: List[dict]) -> List[dict]:
    """Only refused / withheld — not the routine 'given' rows (too noisy)."""
    out = []
    for d in docs:
        status = (d.get("status") or "").lower()
        if status not in ("refused", "withheld"):
            continue
        out.append({
            "id": f"med:{d['id']}",
            "source_collection": "medication_admins",
            "source_id": d["id"],
            "at": d.get("scheduled_at") or d.get("administered_at") or d.get("created_at"),
            "category": "medication",
            "severity": "medium" if status == "refused" else "low",
            "title": f"Medication {status}",
            "summary": _shorten(d.get("notes") or ""),
            "actor_name": d.get("administered_by_name"),
            "tags": ["medication", status],
            "metadata": {"status": status, "medication_id": d.get("medication_id")},
        })
    return out


def _from_visits(docs: List[dict]) -> List[dict]:
    out = []
    KIND_CAT = {
        "lac_review": ("review", "LAC review"),
        "iro": ("review", "IRO visit"),
        "social_worker": ("professional", "Social worker visit"),
        "regulation_44": ("review", "Regulation 44 visit"),
        "regulation_45": ("review", "Regulation 45 visit"),
        "ofsted": ("review", "Ofsted visit"),
        "other": ("professional", "Professional visit"),
    }
    for d in docs:
        kind = d.get("kind") or "other"
        cat, label = KIND_CAT.get(kind, ("professional", kind.replace("_", " ").title()))
        when = d.get("completed_on") or d.get("scheduled_for")
        out.append({
            "id": f"visit:{d['id']}",
            "source_collection": "statutory_visits",
            "source_id": d["id"],
            "at": when,
            "category": cat,
            "severity": "low",
            "title": label,
            "summary": _shorten(d.get("notes") or d.get("follow_up") or ""),
            "actor_name": d.get("attended_by") or d.get("created_by_name"),
            "tags": ["professional", kind],
            "metadata": {"status": d.get("status"), "kind": kind},
        })
    return out


def _from_key_work(docs: List[dict]) -> List[dict]:
    out = []
    for d in docs:
        sf = bool(d.get("safeguarding_flag"))
        out.append({
            "id": f"kw:{d['id']}",
            "source_collection": "key_work_sessions",
            "source_id": d["id"],
            "at": d.get("session_at") or d.get("planned_for") or d.get("created_at"),
            "category": "therapeutic" if d.get("frameworks_applied") else "key_work",
            "severity": "medium" if sf else "low",
            "title": d.get("topic_label") or "Key work session",
            "summary": _shorten((d.get("staff_reflection") or d.get("plan") or "")),
            "actor_name": d.get("facilitator_name"),
            "tags": ["key_work"] + (["safeguarding"] if sf else [])
                + (["therapeutic"] if d.get("frameworks_applied") else []),
            "metadata": {
                "frameworks": d.get("frameworks_applied") or [],
                "signed_off_at": d.get("signed_off_at"),
            },
        })
    return out


def _from_appointments(docs: List[dict]) -> List[dict]:
    out = []
    for d in docs:
        text = _safe_lower(d.get("kind")) + " " + _safe_lower(d.get("notes"))
        cat = "health"
        if "hospital" in text or "a&e" in text or "a & e" in text or "emergency" in text:
            cat = "health"
        out.append({
            "id": f"appt:{d['id']}",
            "source_collection": "health_appointments",
            "source_id": d["id"],
            "at": d.get("date") or d.get("scheduled_for") or d.get("created_at"),
            "category": cat,
            "severity": "medium" if "hospital" in text or "a&e" in text else "low",
            "title": (d.get("kind") or "Health appointment").title(),
            "summary": _shorten(d.get("notes") or ""),
            "actor_name": d.get("created_by_name"),
            "tags": ["health"],
            "metadata": {"clinician": d.get("clinician")},
        })
    return out


def _from_notes(docs: List[dict]) -> List[dict]:
    out = []
    for d in docs:
        out.append({
            "id": f"note:{d['id']}",
            "source_collection": "notes",
            "source_id": d["id"],
            "at": d.get("created_at"),
            "category": "achievement" if (d.get("category") == "achievement") else "note",
            "severity": "low",
            "title": (d.get("category") or "Daily note").replace("_", " ").title(),
            "summary": _shorten(d.get("body") or ""),
            "actor_name": d.get("author_name"),
            "tags": [d.get("category") or "note"],
            "metadata": {},
        })
    return out


# ---------------------------------------------------------------------------
# Aggregator
# ---------------------------------------------------------------------------

async def build_chronology(
    db,
    rid: str,
    *,
    categories: Optional[List[str]] = None,
    from_at: Optional[str] = None,
    to_at: Optional[str] = None,
    q: Optional[str] = None,
    safeguarding_only: bool = False,
    limit: int = 500,
) -> List[dict]:
    """Build a flat, sorted list of chronology events for a resident."""
    incidents = await db.incidents.find({"resident_id": rid}, {"_id": 0}).to_list(500)
    notes = await db.notes.find({"resident_id": rid}, {"_id": 0}).to_list(500)
    missing = await db.missing_episodes.find({"resident_id": rid}, {"_id": 0}).to_list(200)
    ris = await db.return_interviews.find({"resident_id": rid}, {"_id": 0}).to_list(200)
    body_maps = await db.body_maps.find({"resident_id": rid}, {"_id": 0}).to_list(200)
    med_admins = await db.medication_admins.find(
        {"resident_id": rid, "status": {"$in": ["refused", "withheld"]}},
        {"_id": 0},
    ).to_list(500)
    visits = await db.statutory_visits.find({"resident_id": rid}, {"_id": 0}).to_list(200)
    key_work = await db.key_work_sessions.find({"resident_id": rid}, {"_id": 0}).to_list(200)
    appts = await db.health_appointments.find({"resident_id": rid}, {"_id": 0}).to_list(200)

    events: List[dict] = []
    events.extend(_from_incidents(incidents))
    events.extend(_from_notes(notes))
    events.extend(_from_missing(missing))
    events.extend(_from_return_interviews(ris))
    events.extend(_from_body_maps(body_maps))
    events.extend(_from_med_admins(med_admins))
    events.extend(_from_visits(visits))
    events.extend(_from_key_work(key_work))
    events.extend(_from_appointments(appts))

    # Drop events without a date so sorting is reliable
    events = [e for e in events if e.get("at")]

    # Filtering
    if categories:
        cat_set = set(categories)
        events = [e for e in events if e.get("category") in cat_set]
    if safeguarding_only:
        events = [e for e in events if e.get("category") == "safeguarding" or "safeguarding" in (e.get("tags") or [])]
    if from_at:
        events = [e for e in events if (e.get("at") or "") >= from_at]
    if to_at:
        events = [e for e in events if (e.get("at") or "") <= to_at]
    if q:
        ql = q.lower().strip()
        if ql:
            def _match(e):
                blob = " ".join([
                    str(e.get("title") or ""),
                    str(e.get("summary") or ""),
                    str(e.get("actor_name") or ""),
                    " ".join(e.get("tags") or []),
                    str((e.get("metadata") or {}).get("location") or ""),
                    str((e.get("metadata") or {}).get("police_reference") or ""),
                    " ".join((e.get("metadata") or {}).get("associates") or []),
                ]).lower()
                return ql in blob
            events = [e for e in events if _match(e)]

    events.sort(key=lambda e: e.get("at") or "", reverse=True)

    # Decorate with category meta for the frontend
    for e in events:
        m = _meta(e["category"])
        e["category_label"] = m["label"]
        e["category_colour"] = m["colour"]
        e["category_icon"] = m["icon"]

    return events[:limit]


# ---------------------------------------------------------------------------
# Pattern detection — rules-based, deterministic. NO AI.
# ---------------------------------------------------------------------------

def detect_patterns(events: List[dict]) -> List[dict]:
    """Surface operational patterns from a chronology slice.

    Returns a list of {id, severity, title, message, count, since, tags}.
    """
    patterns: List[dict] = []
    now = datetime.now(timezone.utc)

    def _within(days: int) -> List[dict]:
        cutoff = (now - timedelta(days=days)).isoformat()
        return [e for e in events if (e.get("at") or "") >= cutoff]

    # 1. Repeat missing — 3+ in 30d
    miss_30 = [e for e in _within(30) if e["category"] == "missing"]
    if len(miss_30) >= 3:
        patterns.append({
            "id": "repeat_missing",
            "severity": "high",
            "title": "Repeat missing-from-care",
            "message": f"{len(miss_30)} missing episodes in the last 30 days. Consider contextual safeguarding review.",
            "count": len(miss_30),
            "since_days": 30,
            "tags": ["missing", "safeguarding"],
        })

    # 2. Same location across missing episodes
    miss_all = [e for e in events if e["category"] == "missing"]
    loc_counts: Dict[str, int] = {}
    for e in miss_all:
        loc = (e.get("metadata") or {}).get("location") or ""
        if loc:
            loc_counts[loc] = loc_counts.get(loc, 0) + 1
    repeat_locs = [(loc, n) for loc, n in loc_counts.items() if n >= 2]
    if repeat_locs:
        top = sorted(repeat_locs, key=lambda x: -x[1])[0]
        patterns.append({
            "id": "missing_location_pattern",
            "severity": "high",
            "title": "Recurring missing location",
            "message": f"Last seen at \"{top[0]}\" on {top[1]} occasions.",
            "count": top[1],
            "tags": ["missing", "location"],
        })

    # 3. Repeat associates across missing
    assoc_counts: Dict[str, int] = {}
    for e in miss_all:
        for a in (e.get("metadata") or {}).get("associates") or []:
            key = (a or "").strip().lower()
            if key:
                assoc_counts[key] = assoc_counts.get(key, 0) + 1
    repeat_assoc = [(a, n) for a, n in assoc_counts.items() if n >= 2]
    if repeat_assoc:
        top = sorted(repeat_assoc, key=lambda x: -x[1])[0]
        patterns.append({
            "id": "missing_associate_pattern",
            "severity": "high",
            "title": "Recurring associate during missing episodes",
            "message": f"\"{top[0].title()}\" recorded in {top[1]} missing episodes — possible exploitation indicator.",
            "count": top[1],
            "tags": ["missing", "exploitation"],
        })

    # 4. Police involvement clustering — 3+ events tagged police in 60d
    police_60 = [e for e in _within(60) if "police" in (e.get("tags") or [])]
    if len(police_60) >= 3:
        patterns.append({
            "id": "police_cluster",
            "severity": "high",
            "title": "Repeat police involvement",
            "message": f"{len(police_60)} police-tagged events in the last 60 days.",
            "count": len(police_60),
            "since_days": 60,
            "tags": ["police"],
        })

    # 5. Self-harm cluster — 2+ in 30d
    sh_30 = [e for e in _within(30) if e["category"] == "self_harm" or "self_harm" in (e.get("tags") or [])]
    if len(sh_30) >= 2:
        patterns.append({
            "id": "self_harm_cluster",
            "severity": "high",
            "title": "Self-harm cluster",
            "message": f"{len(sh_30)} self-harm events in the last 30 days. Consider mental-health escalation.",
            "count": len(sh_30),
            "since_days": 30,
            "tags": ["self_harm", "safeguarding"],
        })

    # 6. Medication refusal spike — 3+ in 14d
    med_14 = [e for e in _within(14) if e["category"] == "medication"]
    if len(med_14) >= 3:
        patterns.append({
            "id": "med_refusal_spike",
            "severity": "medium",
            "title": "Medication refusals increasing",
            "message": f"{len(med_14)} refusals/withholds in the last 14 days.",
            "count": len(med_14),
            "since_days": 14,
            "tags": ["medication"],
        })

    # 7. Aggression escalation — 3+ aggression-tagged incidents in 30d
    agg_30 = [e for e in _within(30) if "aggression" in (e.get("tags") or [])]
    if len(agg_30) >= 3:
        patterns.append({
            "id": "aggression_escalation",
            "severity": "medium",
            "title": "Behaviour escalation",
            "message": f"{len(agg_30)} aggression/behaviour incidents in the last 30 days.",
            "count": len(agg_30),
            "since_days": 30,
            "tags": ["aggression", "behaviour"],
        })

    # 8. Night incidents — 3+ between 22:00 and 06:00 in 30d
    night = []
    for e in _within(30):
        if e["category"] not in ("incident", "safeguarding", "self_harm", "missing", "restraint"):
            continue
        try:
            d = datetime.fromisoformat(e["at"].replace("Z", "+00:00"))
            h = d.hour
            if h >= 22 or h < 6:
                night.append(e)
        except Exception:
            continue
    if len(night) >= 3:
        patterns.append({
            "id": "night_incident_cluster",
            "severity": "medium",
            "title": "Night-time incident cluster",
            "message": f"{len(night)} incidents between 22:00 and 06:00 in the last 30 days.",
            "count": len(night),
            "since_days": 30,
            "tags": ["night", "incident"],
        })

    # 9. Open safeguarding — any safeguarding event in last 14d still recent
    safe_14 = [e for e in _within(14) if e["category"] == "safeguarding" or "safeguarding" in (e.get("tags") or [])]
    if len(safe_14) >= 2:
        patterns.append({
            "id": "active_safeguarding",
            "severity": "high",
            "title": "Active safeguarding period",
            "message": f"{len(safe_14)} safeguarding events in the last 14 days.",
            "count": len(safe_14),
            "since_days": 14,
            "tags": ["safeguarding"],
        })

    return patterns
