"""Placement Intelligence & Matching Engine — Iteration 41.

DETERMINISTIC. LIVE OPERATIONAL. EXPLAINABLE.

This is NOT a referral form. It is Safelyn's differentiator: live operational
matching against real home data — current incidents, restraints, missing
episodes, group dynamics, staffing pressure, burnout pressure.

Answers the question:
  "Can this home safely and realistically support this young person WITHOUT
   destabilising the current environment?"

Two entrypoints:
  - build_home_readiness(db)               → live home state, independent of referral
  - build_match_analysis(db, referral)     → home_readiness + group dynamics + matching confidence
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional, Iterable

from .intelligence_engine import build_burnout_forecast, CHILDREN_SECTORS


# ---------------------------------------------------------------------------
# Tunable thresholds — explicit so managers / inspectors can see the math.
# ---------------------------------------------------------------------------
HOME_READINESS_CONFIG = {
    "incident_rise_pct_warn":       30,
    "incident_rise_pct_high":       60,
    "restraint_cluster_14d_warn":   2,
    "restraint_cluster_14d_high":   4,
    "missing_30d_warn":             2,
    "missing_30d_high":             4,
    "safeguarding_30d_warn":        2,
    "safeguarding_30d_high":        4,
    "police_30d_warn":              2,
    "police_30d_high":              4,
    # Total weighted score thresholds → overall_readiness:
    "high_risk_threshold":          40,
    "elevated_threshold":           22,
    "watch_threshold":              10,
}

MATCH_CONFIG = {
    "age_gap_warn":                 4,    # years
    "age_gap_high":                 6,
    # Score → matching_confidence:
    "not_recommended_threshold":    55,
    "elevated_threshold":           35,
    "manageable_threshold":         15,
}


# Needs labels surfaced both backend & frontend.
NEED_OPTIONS = [
    "ebd", "trauma", "attachment", "self_harm", "missing", "cse", "ce",
    "aggression", "substance", "mental_health", "learning", "education",
    "health", "offending", "gang", "online_safety",
]
NEED_LABELS = {
    "ebd": "Emotional & behavioural difficulties",
    "trauma": "Trauma history",
    "attachment": "Attachment difficulties",
    "self_harm": "Self-harm",
    "missing": "Missing from care",
    "cse": "Child sexual exploitation risk",
    "ce": "Criminal exploitation risk",
    "aggression": "Aggression / violence",
    "substance": "Substance misuse",
    "mental_health": "Mental health",
    "learning": "Learning needs",
    "education": "Education needs",
    "health": "Health needs",
    "offending": "Offending behaviour",
    "gang": "Gang association",
    "online_safety": "Online safety risks",
}

CONDITION_OPTIONS = [
    "staffing_actions", "risk_assessment", "transition_plan", "missing_protocol",
    "education_plan", "safeguarding_meeting", "professional_consultation",
    "location_risk_assessment", "matching_impact_assessment", "separate_bedrooms",
    "waking_night_increase", "camhs_input", "phased_admission",
]
CONDITION_LABELS = {
    "staffing_actions": "Staffing actions",
    "risk_assessment": "Updated risk assessment",
    "transition_plan": "Transition / induction plan",
    "missing_protocol": "Missing protocol refresh",
    "education_plan": "Education plan",
    "safeguarding_meeting": "Safeguarding strategy meeting",
    "professional_consultation": "Professional consultation",
    "location_risk_assessment": "Location risk assessment",
    "matching_impact_assessment": "Matching impact assessment",
    "separate_bedrooms": "Separate bedrooms / sleeping arrangements",
    "waking_night_increase": "Increase waking-night support",
    "camhs_input": "Additional CAMHS input",
    "phased_admission": "Phased admission / temporary cap",
}


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _pct_change(curr: int, prev: int) -> int:
    if prev == 0:
        return 100 if curr > 0 else 0
    return int(round(((curr - prev) / prev) * 100))


def _intersect_lower(a: Optional[Iterable[str]], b: Optional[Iterable[str]]) -> list[str]:
    if not a or not b:
        return []
    al = {str(x).strip().lower(): str(x).strip() for x in a if x}
    bl = {str(x).strip().lower() for x in b if x}
    return sorted({al[k] for k in al if k in bl})


def _readiness_label(score: int, cfg: dict) -> tuple[str, str]:
    if score >= cfg["high_risk_threshold"]:
        return "high_risk", "High operational risk for a new placement"
    if score >= cfg["elevated_threshold"]:
        return "elevated", "Elevated pressure — consider before accepting"
    if score >= cfg["watch_threshold"]:
        return "watch", "Watching — manageable with safeguards"
    return "good", "Home is operationally stable"


# ---------------------------------------------------------------------------
# Home readiness
# ---------------------------------------------------------------------------

async def build_home_readiness(db, cfg_override: Optional[dict] = None) -> dict:
    """Live home readiness for a new placement — uses real operational data."""
    cfg = {**HOME_READINESS_CONFIG, **(cfg_override or {})}
    now = datetime.now(timezone.utc)
    last_14, last_28, last_30, last_60 = (_iso_days_ago(d) for d in (14, 28, 30, 60))

    children_filter = {"$or": [
        {"service_type": {"$in": CHILDREN_SECTORS}},
        {"service_type": None},
        {"service_type": {"$exists": False}},
    ]}

    # All currently placed children's residents (not discharged)
    residents = await db.residents.find(
        {**children_filter, "$and": [
            {"$or": [{"discharged_at": None}, {"discharged_at": {"$exists": False}}]},
        ]},
        {"_id": 0},
    ).to_list(500)
    resident_ids = [r["id"] for r in residents]

    def _q(extra): return {"resident_id": {"$in": resident_ids}, **extra} if resident_ids else {"_id": "__none__"}

    # --- Signals --------------------------------------------------------
    incidents_14 = await db.incidents.count_documents(_q({"occurred_at": {"$gte": last_14}}))
    incidents_prev_14 = await db.incidents.count_documents(_q({"occurred_at": {"$gte": last_28, "$lt": last_14}}))
    incident_delta = _pct_change(incidents_14, incidents_prev_14)

    restraint_14 = await db.incidents.count_documents(_q({
        "occurred_at": {"$gte": last_14},
        "$or": [{"category": "restraint"}, {"physical_intervention": True}],
    }))

    missing_30 = await db.missing_episodes.count_documents(
        {"resident_id": {"$in": resident_ids}, "reported_at": {"$gte": last_30}}
    ) if resident_ids else 0

    safeguarding_30 = await db.incidents.count_documents(_q({
        "occurred_at": {"$gte": last_30},
        "$or": [{"category": "safeguarding"}, {"is_safeguarding": True}],
    }))

    police_30 = await db.incidents.count_documents(_q({
        "occurred_at": {"$gte": last_30},
        "$or": [{"police_involved": True}, {"category": "police"}],
    }))

    # Burnout (manager+-only data — used internally; surface as summary signal)
    burnout = await build_burnout_forecast(db)
    burnout_summary = burnout.get("summary", {})
    burnout_high = burnout_summary.get("high", 0)
    burnout_medium = burnout_summary.get("medium", 0)

    # --- Score & factors -----------------------------------------------
    score = 0
    factors: list[dict] = []

    if incident_delta >= cfg["incident_rise_pct_high"] and incidents_14 >= 3:
        score += 14
        factors.append({
            "domain": "emotional_climate",
            "label": f"Incidents up {incident_delta}% in 14 days ({incidents_14} vs {incidents_prev_14})",
            "weight": 14,
            "evidence": {"incidents_14": incidents_14, "incidents_prev_14": incidents_prev_14, "delta_pct": incident_delta},
        })
    elif incident_delta >= cfg["incident_rise_pct_warn"] and incidents_14 >= 2:
        score += 8
        factors.append({
            "domain": "emotional_climate",
            "label": f"Incidents up {incident_delta}% in 14 days ({incidents_14} vs {incidents_prev_14})",
            "weight": 8,
            "evidence": {"incidents_14": incidents_14, "incidents_prev_14": incidents_prev_14, "delta_pct": incident_delta},
        })

    if restraint_14 >= cfg["restraint_cluster_14d_high"]:
        score += 12
        factors.append({
            "domain": "behaviour_pressure",
            "label": f"Restraint cluster — {restraint_14} in last 14 days",
            "weight": 12, "evidence": {"restraints_14": restraint_14},
        })
    elif restraint_14 >= cfg["restraint_cluster_14d_warn"]:
        score += 6
        factors.append({
            "domain": "behaviour_pressure",
            "label": f"{restraint_14} restraint events in last 14 days",
            "weight": 6, "evidence": {"restraints_14": restraint_14},
        })

    if missing_30 >= cfg["missing_30d_high"]:
        score += 12
        factors.append({
            "domain": "missing_trend",
            "label": f"Missing-from-care cluster — {missing_30} episodes in 30 days",
            "weight": 12, "evidence": {"missing_30": missing_30},
        })
    elif missing_30 >= cfg["missing_30d_warn"]:
        score += 6
        factors.append({
            "domain": "missing_trend",
            "label": f"{missing_30} missing-from-care episodes in 30 days",
            "weight": 6, "evidence": {"missing_30": missing_30},
        })

    if safeguarding_30 >= cfg["safeguarding_30d_high"]:
        score += 14
        factors.append({
            "domain": "safeguarding_pressure",
            "label": f"Active safeguarding cluster — {safeguarding_30} in 30 days",
            "weight": 14, "evidence": {"safeguarding_30": safeguarding_30},
        })
    elif safeguarding_30 >= cfg["safeguarding_30d_warn"]:
        score += 7
        factors.append({
            "domain": "safeguarding_pressure",
            "label": f"{safeguarding_30} safeguarding incidents in 30 days",
            "weight": 7, "evidence": {"safeguarding_30": safeguarding_30},
        })

    if police_30 >= cfg["police_30d_high"]:
        score += 10
        factors.append({
            "domain": "safeguarding_pressure",
            "label": f"Police involvement cluster — {police_30} events in 30 days",
            "weight": 10, "evidence": {"police_30": police_30},
        })
    elif police_30 >= cfg["police_30d_warn"]:
        score += 5
        factors.append({
            "domain": "safeguarding_pressure",
            "label": f"{police_30} police-involved events in 30 days",
            "weight": 5, "evidence": {"police_30": police_30},
        })

    if burnout_high >= 1:
        score += 9
        factors.append({
            "domain": "staffing_readiness",
            "label": f"Staff burnout signal — {burnout_high} colleague(s) need support",
            "weight": 9, "evidence": {"burnout_high": burnout_high},
        })
    elif burnout_medium >= 2:
        score += 5
        factors.append({
            "domain": "staffing_readiness",
            "label": f"Staff pressure rising — {burnout_medium} colleagues on watch",
            "weight": 5, "evidence": {"burnout_medium": burnout_medium},
        })

    readiness, readiness_label = _readiness_label(score, cfg)

    # --- Sub-scores per domain (for the dashboard tiles) ----------------
    def _domain_score(domain): return sum(f["weight"] for f in factors if f["domain"] == domain)
    sub = {
        "emotional_climate":      _domain_score("emotional_climate"),
        "behaviour_pressure":     _domain_score("behaviour_pressure"),
        "missing_trend":          _domain_score("missing_trend"),
        "safeguarding_pressure":  _domain_score("safeguarding_pressure"),
        "staffing_readiness":     _domain_score("staffing_readiness"),
    }

    def _tile_status(v): return "good" if v == 0 else "watch" if v <= 6 else "elevated" if v <= 12 else "high_risk"

    # Recent destabilising events list (last 14d, top severity)
    recent_events: list[dict] = []
    if resident_ids:
        async for ev in db.incidents.find(
            _q({"occurred_at": {"$gte": last_14}}),
            {"_id": 0, "id": 1, "category": 1, "severity": 1, "summary": 1,
             "title": 1, "occurred_at": 1, "resident_id": 1, "resident_name": 1},
        ).sort("occurred_at", -1).limit(8):
            recent_events.append(ev)

    return {
        "generated_at": now.isoformat(),
        "score": score,
        "overall_readiness": readiness,
        "overall_label": readiness_label,
        "tiles": [
            {"key": "emotional_climate",     "label": "Emotional climate",      "score": sub["emotional_climate"],     "status": _tile_status(sub["emotional_climate"])},
            {"key": "behaviour_pressure",    "label": "Behaviour pressure",     "score": sub["behaviour_pressure"],    "status": _tile_status(sub["behaviour_pressure"])},
            {"key": "missing_trend",         "label": "Missing-from-care",      "score": sub["missing_trend"],         "status": _tile_status(sub["missing_trend"])},
            {"key": "safeguarding_pressure", "label": "Safeguarding pressure",  "score": sub["safeguarding_pressure"], "status": _tile_status(sub["safeguarding_pressure"])},
            {"key": "staffing_readiness",    "label": "Staffing readiness",     "score": sub["staffing_readiness"],    "status": _tile_status(sub["staffing_readiness"])},
        ],
        "factors": factors,
        "recent_events": recent_events,
        "current_residents": [
            {"id": r["id"], "name": r.get("preferred_name") or r.get("name"),
             "age": r.get("age"), "gender": r.get("gender"), "room": r.get("room"),
             "risk_level": r.get("risk_level")}
            for r in residents
        ],
        "signals_summary": {
            "incidents_14": incidents_14,
            "incidents_prev_14": incidents_prev_14,
            "restraint_14": restraint_14,
            "missing_30": missing_30,
            "safeguarding_30": safeguarding_30,
            "police_30": police_30,
            "burnout_high": burnout_high,
            "burnout_medium": burnout_medium,
            "resident_count": len(residents),
        },
        "config": cfg,
        "explainable_note": (
            "All numbers come from live operational data. No AI inference. "
            "Manager judgement remains the final authority."
        ),
    }


# ---------------------------------------------------------------------------
# Group dynamics & match analysis
# ---------------------------------------------------------------------------

def _age_from_dob(dob: Optional[str]) -> Optional[int]:
    if not dob:
        return None
    try:
        d = datetime.fromisoformat(str(dob).replace("Z", "+00:00")).date()
        today = datetime.now(timezone.utc).date()
        return today.year - d.year - ((today.month, today.day) < (d.month, d.day))
    except Exception:
        return None


async def _resident_risk_profile(db, resident: dict) -> dict:
    """Pull live risk signals for ONE current resident (not the referral)."""
    rid = resident["id"]
    last_30 = _iso_days_ago(30)
    last_90 = _iso_days_ago(90)
    sg_open = await db.incidents.count_documents({
        "resident_id": rid, "status": {"$ne": "closed"},
        "$or": [{"category": "safeguarding"}, {"is_safeguarding": True}],
    })
    missing_90 = await db.missing_episodes.count_documents(
        {"resident_id": rid, "reported_at": {"$gte": last_90}}
    )
    aggression_30 = await db.incidents.count_documents({
        "resident_id": rid, "occurred_at": {"$gte": last_30},
        "$or": [{"category": "aggression"}, {"category": "behaviour"}, {"physical_intervention": True}],
    })
    return {
        "id": rid,
        "name": resident.get("preferred_name") or resident.get("name"),
        "age": resident.get("age") or _age_from_dob(resident.get("dob")),
        "gender": resident.get("gender"),
        "room": resident.get("room"),
        "risk_level": resident.get("risk_level"),
        "known_associates": resident.get("known_associates") or [],
        "missing_triggers": resident.get("missing_triggers") or [],
        "risk_themes": resident.get("risk_themes") or [],
        "sg_open": sg_open,
        "missing_90": missing_90,
        "aggression_30": aggression_30,
    }


def _need_set(referral: dict) -> set[str]:
    return {n for n in (referral.get("needs") or []) if n}


def _has_any(needs: set[str], keys: Iterable[str]) -> bool:
    return any(k in needs for k in keys)


def _flag(domain, label, weight, evidence=None, residents=None):
    return {
        "domain": domain,
        "label": label,
        "weight": int(weight),
        "evidence": evidence or {},
        "residents": residents or [],
    }


async def build_match_analysis(db, referral: dict, cfg_override: Optional[dict] = None) -> dict:
    """Match the referral against the current home — live operational data."""
    cfg = {**MATCH_CONFIG, **(cfg_override or {})}
    home = await build_home_readiness(db)
    needs = _need_set(referral)
    ref_age = referral.get("age")
    ref_assoc = referral.get("known_associates") or []

    # Pull per-resident profiles
    profiles: list[dict] = []
    for r in (home.get("current_residents") or []):
        full = await db.residents.find_one({"id": r["id"]}, {"_id": 0})
        if full:
            profiles.append(await _resident_risk_profile(db, full))

    group_warnings: list[dict] = []
    score = 0

    # --- 1. Age compatibility / vulnerability mismatch ---
    if ref_age is not None:
        ages = [p["age"] for p in profiles if isinstance(p["age"], int)]
        if ages:
            youngest, oldest = min(ages), max(ages)
            gap_low = abs(ref_age - youngest)
            gap_high = abs(ref_age - oldest)
            worst_gap = max(gap_low, gap_high)
            if worst_gap >= cfg["age_gap_high"]:
                affected = [p for p in profiles if isinstance(p["age"], int)
                            and abs(ref_age - p["age"]) >= cfg["age_gap_high"]]
                score += 12
                group_warnings.append(_flag(
                    "group_dynamics",
                    f"Significant age gap ({worst_gap} years) with current group — vulnerability mismatch risk",
                    12,
                    {"referral_age": ref_age, "youngest_in_group": youngest, "oldest_in_group": oldest},
                    [{"id": a["id"], "name": a["name"], "reason": f"age {a['age']}"} for a in affected],
                ))
            elif worst_gap >= cfg["age_gap_warn"]:
                score += 5
                group_warnings.append(_flag(
                    "group_dynamics",
                    f"Age gap ({worst_gap} years) with current group — review peer dynamics",
                    5,
                    {"referral_age": ref_age, "youngest_in_group": youngest, "oldest_in_group": oldest},
                ))

    # --- 2. CSE / exploitation overlap ---
    if _has_any(needs, ("cse", "ce")):
        # Residents currently flagged with same exploitation risk → reciprocal exposure risk
        exposed = [p for p in profiles if "cse" in (p["risk_themes"] or []) or "ce" in (p["risk_themes"] or [])
                   or (p.get("aggression_30", 0) > 0 and "ce" in needs)]
        weight = 14 if exposed else 8
        score += weight
        group_warnings.append(_flag(
            "exploitation",
            "Exploitation risk overlap — referral presents CSE/CE risk; "
            + ("current residents also flagged" if exposed else "no current overlap but watch peer influence"),
            weight,
            {"needs": [n for n in needs if n in ("cse", "ce")]},
            [{"id": p["id"], "name": p["name"], "reason": "risk theme overlap"} for p in exposed],
        ))

    # --- 3. Known associates / gang overlap ---
    if _has_any(needs, ("gang",)) or ref_assoc:
        overlap_per_resident = []
        for p in profiles:
            shared = _intersect_lower(ref_assoc, p["known_associates"])
            if shared:
                overlap_per_resident.append({"id": p["id"], "name": p["name"], "reason": f"shared: {', '.join(shared)}"})
        if overlap_per_resident:
            score += 16
            group_warnings.append(_flag(
                "associates_overlap",
                f"Known associates overlap with {len(overlap_per_resident)} current resident(s) — placement-stability and safeguarding concern",
                16,
                {"shared_count": len(overlap_per_resident)},
                overlap_per_resident,
            ))
        elif "gang" in needs:
            score += 6
            group_warnings.append(_flag(
                "associates_overlap",
                "Referral flags gang association — verify against current group's known associates",
                6,
            ))

    # --- 4. Missing-from-care influence risk ---
    if "missing" in needs:
        chronic = [p for p in profiles if (p.get("missing_90") or 0) >= 2]
        if chronic:
            score += 10
            group_warnings.append(_flag(
                "missing_influence",
                f"{len(chronic)} current resident(s) with repeat missing — peer influence risk",
                10, {}, [{"id": p["id"], "name": p["name"], "reason": f"{p['missing_90']} missing episodes (90d)"} for p in chronic],
            ))

    # --- 5. Aggression / behaviour trigger risk ---
    if _has_any(needs, ("aggression",)):
        targets = [p for p in profiles if p.get("aggression_30", 0) > 0 or (p.get("risk_level") == "high")]
        weight = 10 if targets else 4
        score += weight
        group_warnings.append(_flag(
            "behaviour_trigger",
            f"Aggression/violence in referral — assess trigger risk on {len(targets)} current resident(s)" if targets
            else "Aggression/violence flagged in referral — monitor de-escalation capacity",
            weight, {}, [{"id": p["id"], "name": p["name"], "reason": f"aggression events (30d): {p.get('aggression_30')}"} for p in targets],
        ))

    # --- 6. Self-harm / mental health emotional contagion ---
    if _has_any(needs, ("self_harm", "mental_health")):
        sensitive = [p for p in profiles if "self_harm" in (p["risk_themes"] or [])]
        weight = 8 if sensitive else 4
        score += weight
        group_warnings.append(_flag(
            "emotional_contagion",
            "Self-harm / mental-health needs — consider emotional contagion risk and CAMHS capacity",
            weight, {}, [{"id": p["id"], "name": p["name"], "reason": "self-harm theme on record"} for p in sensitive],
        ))

    # --- 7. Bed / room availability ---
    bed_available = referral.get("bed_available")
    if bed_available is False:
        score += 30
        group_warnings.append(_flag(
            "capacity",
            "No bed currently available — placement cannot proceed without capacity resolution",
            30, {"bed_available": False},
        ))

    # --- 8. Home state amplifiers (live data) ---
    home_score = home.get("score", 0)
    amplifier = 0
    if home.get("overall_readiness") == "high_risk":
        amplifier = 18
        score += amplifier
    elif home.get("overall_readiness") == "elevated":
        amplifier = 10
        score += amplifier
    if amplifier > 0:
        group_warnings.append(_flag(
            "home_state",
            f"Home is currently '{home.get('overall_label')}' — placement may destabilise the environment",
            amplifier,
            {"home_score": home_score, "home_readiness": home.get("overall_readiness")},
        ))

    # --- Matching confidence ---
    if score >= cfg["not_recommended_threshold"]:
        confidence_key, confidence_label = "not_recommended", "Not recommended currently"
    elif score >= cfg["elevated_threshold"]:
        confidence_key, confidence_label = "elevated", "Elevated placement risk"
    elif score >= cfg["manageable_threshold"]:
        confidence_key, confidence_label = "manageable", "Manageable with safeguards"
    else:
        confidence_key, confidence_label = "strong", "Strong match"

    # --- What would need to change? ---
    recommendations: list[str] = []
    domains = {w["domain"] for w in group_warnings}
    if "capacity" in domains:
        recommendations.append("Resolve bed availability before progressing this referral.")
    if "associates_overlap" in domains:
        recommendations.append("Convene a safeguarding strategy meeting on associate overlap; consider separate placement.")
    if "exploitation" in domains:
        recommendations.append("Update CSE/CE risk assessments; involve contextual safeguarding lead.")
    if "missing_influence" in domains:
        recommendations.append("Refresh missing-from-care protocols; agree shared response plan with police single point of contact.")
    if "behaviour_trigger" in domains:
        recommendations.append("Confirm de-escalation / restraint training currency; plan staffing pairings.")
    if "emotional_contagion" in domains:
        recommendations.append("Confirm CAMHS / therapeutic input availability and key-work focus before admission.")
    if "group_dynamics" in domains:
        recommendations.append("Review sleeping arrangements and peer pairings; consider matching impact assessment.")
    if "home_state" in domains:
        recommendations.append("Stabilise current home first — incident, missing or safeguarding cluster needs management response.")
    if confidence_key in ("manageable", "elevated") and not recommendations:
        recommendations.append("Document conditions in the decision record and review at 2-week placement check.")
    if confidence_key == "strong" and not recommendations:
        recommendations.append("Standard induction plan; routine review at 2 weeks.")

    # --- Audit-friendly explanation chain ---
    factor_chain = home.get("factors", []) + group_warnings

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "matching_confidence": confidence_key,
        "matching_confidence_label": confidence_label,
        "score": score,
        "home_readiness": home,
        "group_warnings": group_warnings,
        "what_would_need_to_change": recommendations,
        "factor_chain": factor_chain,
        "config": cfg,
        "explainable_note": (
            "Matching confidence is computed deterministically from live operational data and "
            "the referral profile. The system supports — it never replaces — manager judgement."
        ),
    }
