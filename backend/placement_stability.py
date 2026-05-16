"""Placement Stability Intelligence — Iteration 42.

DETERMINISTIC. EVIDENCE-LINKED. SUPPORTIVE TONE.

Predicts placement stability by comparing the resident's first 14 days
post-admission ("baseline") against the latest 14 days ("current"), plus
admission-baseline vs current overall.

Surfaces BOTH:
  - risk factors (deteriorating signals — incidents up, missing up, restraints up,
    safeguarding escalation, police involvement, peer conflict, education
    deterioration, staffing instability around the child)
  - protective factors (stabilising signals — reduced incidents, more key work
    notes, education engagement, emotional stabilisation, positive trajectory).

This NEVER labels a child as "at risk of breakdown" in punitive language.
Tone is operational and reflective: "support recommended", "stabilising",
"watching for early signs". The system supports — it never replaces —
manager judgement.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional


PLACEMENT_STABILITY_CONFIG = {
    # Trend pct thresholds — comparing current 14d vs first 14d post-admission
    "incident_rise_pct_warn":          40,
    "incident_rise_pct_high":          80,
    "missing_rise_pct_warn":           50,
    "missing_rise_pct_high":           100,
    "safeguarding_rise_pct_warn":      50,
    "safeguarding_rise_pct_high":      100,
    "restraint_rise_pct_warn":         50,
    "restraint_rise_pct_high":         100,
    "police_rise_pct_warn":            50,
    "police_rise_pct_high":            100,
    # Absolute thresholds (catches scenarios where baseline was zero)
    "current_incidents_abs_warn":       3,
    "current_incidents_abs_high":       6,
    "current_missing_abs_warn":         2,
    "current_missing_abs_high":         4,
    "current_restraints_abs_warn":      2,
    "current_restraints_abs_high":      4,
    "current_safeguarding_abs_warn":    2,
    "current_safeguarding_abs_high":    4,
    "current_police_abs_warn":          2,
    "current_police_abs_high":          3,
    # Days-since thresholds (longer = more stable)
    "days_since_incident_protective": 14,
    "days_since_missing_protective":  21,
    # Key work / positive note thresholds (last 14d)
    "key_work_notes_protective_warn":  2,
    "key_work_notes_protective_high":  4,
    # Stability bands (final placement_score is risks − protectives, clamped at 0)
    "deteriorating_threshold":         40,
    "watch_threshold":                 22,
    "steady_threshold":                10,
    # Minimum days in placement before scoring is meaningful
    "min_days_for_trend":               7,
}


# Status spectrum — supportive language, never punitive.
STATUS_LABELS = {
    "stabilising":     "Stabilising",
    "steady":          "Steady",
    "watch":           "Watching for early signs",
    "deteriorating":   "Support recommended",
    "critical":        "Immediate review recommended",
    "new_placement":   "Recently admitted",
}


def _iso_days_ago(now: datetime, days: int) -> str:
    return (now - timedelta(days=days)).isoformat()


def _parse_admission(resident: dict) -> Optional[datetime]:
    raw = resident.get("placement_date") or resident.get("created_at")
    if not raw:
        return None
    try:
        s = str(raw).replace("Z", "+00:00")
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        return None


def _pct_change(curr: int, prev: int) -> int:
    if prev == 0:
        return 100 if curr > 0 else 0
    return int(round(((curr - prev) / prev) * 100))


async def _resident_signals(db, resident_id: str, baseline_start: datetime,
                            baseline_end: datetime, current_start: datetime,
                            current_end: datetime) -> dict:
    """Pull paired counts for a resident across the baseline and current windows."""
    bs = baseline_start.isoformat()
    be = baseline_end.isoformat()
    cs = current_start.isoformat()
    ce = current_end.isoformat()

    async def _ic(filt: dict, start: str, end: str) -> int:
        return await db.incidents.count_documents({
            "resident_id": resident_id,
            "created_at": {"$gte": start, "$lt": end},
            **filt,
        })

    async def _miss(start: str, end: str) -> int:
        return await db.missing_episodes.count_documents({
            "resident_id": resident_id,
            "reported_at": {"$gte": start, "$lt": end},
        })

    # Incidents (all)
    inc_base = await _ic({}, bs, be)
    inc_curr = await _ic({}, cs, ce)

    # Restraints (physical interventions) — proxy: physical category
    restr_base = await _ic({"category": "physical"}, bs, be)
    restr_curr = await _ic({"category": "physical"}, cs, ce)

    # Self-harm / behaviour escalation
    sh_base = await _ic({"category": "self-harm"}, bs, be)
    sh_curr = await _ic({"category": "self-harm"}, cs, ce)

    # Safeguarding (flagged via `safeguarding: True` OR `incident_type: safeguarding`)
    sg_base = await db.incidents.count_documents({
        "resident_id": resident_id,
        "created_at": {"$gte": bs, "$lt": be},
        "$or": [{"safeguarding": True}, {"incident_type": "safeguarding"}],
    })
    sg_curr = await db.incidents.count_documents({
        "resident_id": resident_id,
        "created_at": {"$gte": cs, "$lt": ce},
        "$or": [{"safeguarding": True}, {"incident_type": "safeguarding"}],
    })

    # Police involvement (tag-based or via incident_type absconding + police flag)
    police_base = await db.incidents.count_documents({
        "resident_id": resident_id,
        "created_at": {"$gte": bs, "$lt": be},
        "$or": [{"tags": "police"}, {"tags": "police_involved"}],
    })
    police_curr = await db.incidents.count_documents({
        "resident_id": resident_id,
        "created_at": {"$gte": cs, "$lt": ce},
        "$or": [{"tags": "police"}, {"tags": "police_involved"}],
    })

    # Peer conflict (tags-based heuristic)
    peer_base = await db.incidents.count_documents({
        "resident_id": resident_id,
        "created_at": {"$gte": bs, "$lt": be},
        "tags": {"$in": ["peer_conflict", "bullying", "peer"]},
    })
    peer_curr = await db.incidents.count_documents({
        "resident_id": resident_id,
        "created_at": {"$gte": cs, "$lt": ce},
        "tags": {"$in": ["peer_conflict", "bullying", "peer"]},
    })

    # Missing episodes
    miss_base = await _miss(bs, be)
    miss_curr = await _miss(cs, ce)

    # Key work / positive observation notes (protective)
    keywork_base = await db.notes.count_documents({
        "resident_id": resident_id,
        "category": {"$in": ["wellbeing", "education", "activity"]},
        "created_at": {"$gte": bs, "$lt": be},
    })
    keywork_curr = await db.notes.count_documents({
        "resident_id": resident_id,
        "category": {"$in": ["wellbeing", "education", "activity"]},
        "created_at": {"$gte": cs, "$lt": ce},
    })

    # Education notes specifically (protective if rising)
    edu_base = await db.notes.count_documents({
        "resident_id": resident_id,
        "category": "education",
        "created_at": {"$gte": bs, "$lt": be},
    })
    edu_curr = await db.notes.count_documents({
        "resident_id": resident_id,
        "category": "education",
        "created_at": {"$gte": cs, "$lt": ce},
    })

    # Days since last incident
    last_inc = await db.incidents.find(
        {"resident_id": resident_id}, {"_id": 0, "created_at": 1},
    ).sort("created_at", -1).to_list(1)
    days_since_incident = None
    if last_inc:
        try:
            d = datetime.fromisoformat(str(last_inc[0]["created_at"]).replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            days_since_incident = max(0, (current_end - d).days)
        except Exception:
            pass

    last_miss = await db.missing_episodes.find(
        {"resident_id": resident_id}, {"_id": 0, "reported_at": 1},
    ).sort("reported_at", -1).to_list(1)
    days_since_missing = None
    if last_miss:
        try:
            d = datetime.fromisoformat(str(last_miss[0]["reported_at"]).replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            days_since_missing = max(0, (current_end - d).days)
        except Exception:
            pass

    return {
        "incidents":      {"base": inc_base, "curr": inc_curr},
        "restraints":     {"base": restr_base, "curr": restr_curr},
        "self_harm":      {"base": sh_base, "curr": sh_curr},
        "safeguarding":   {"base": sg_base, "curr": sg_curr},
        "police":         {"base": police_base, "curr": police_curr},
        "peer_conflict":  {"base": peer_base, "curr": peer_curr},
        "missing":        {"base": miss_base, "curr": miss_curr},
        "keywork_notes":  {"base": keywork_base, "curr": keywork_curr},
        "education":      {"base": edu_base, "curr": edu_curr},
        "days_since_incident": days_since_incident,
        "days_since_missing":  days_since_missing,
    }


def _trend_factor(domain: str, label_template: str, sig: dict, key: str,
                  warn_pct: int, high_pct: int,
                  abs_warn: int, abs_high: int) -> Optional[dict]:
    """Produce a risk factor (or None) for a single signal pair."""
    base = sig[key]["base"]
    curr = sig[key]["curr"]
    pct = _pct_change(curr, base)

    weight = 0
    severity = None
    if curr >= abs_high or (pct >= high_pct and curr >= 2):
        weight = 14; severity = "high"
    elif curr >= abs_warn or (pct >= warn_pct and curr >= 1):
        weight = 8; severity = "watch"

    if weight == 0:
        return None

    direction = "rose" if curr > base else "remained elevated" if curr == base else "fell"
    pct_label = f"+{pct}%" if pct >= 0 else f"{pct}%"
    label = label_template.format(
        base=base, curr=curr, pct=pct_label, direction=direction,
    )
    return {
        "domain": domain,
        "label": label,
        "weight": weight,
        "severity": severity,
        "evidence": {
            "first_14d_count":   base,
            "latest_14d_count":  curr,
            "trend_pct":         pct,
        },
    }


def _protective_factor(domain: str, label: str, weight: int, evidence: dict) -> dict:
    return {"domain": domain, "label": label, "weight": weight, "evidence": evidence}


def _build_factors(sig: dict, cfg: dict, days_in_placement: int) -> tuple[list[dict], list[dict]]:
    """Return (risk_factors, protective_factors). Same data → same factors."""
    risks: list[dict] = []
    protectives: list[dict] = []

    # --- Risks
    pairs = [
        ("emotional_climate", "incidents",
         "Incident frequency {direction} ({base} → {curr}, {pct})",
         cfg["incident_rise_pct_warn"], cfg["incident_rise_pct_high"],
         cfg["current_incidents_abs_warn"], cfg["current_incidents_abs_high"]),
        ("missing_trend", "missing",
         "Missing episodes {direction} ({base} → {curr}, {pct})",
         cfg["missing_rise_pct_warn"], cfg["missing_rise_pct_high"],
         cfg["current_missing_abs_warn"], cfg["current_missing_abs_high"]),
        ("behaviour_pressure", "restraints",
         "Physical-intervention events {direction} ({base} → {curr}, {pct})",
         cfg["restraint_rise_pct_warn"], cfg["restraint_rise_pct_high"],
         cfg["current_restraints_abs_warn"], cfg["current_restraints_abs_high"]),
        ("safeguarding_pressure", "safeguarding",
         "Safeguarding incidents {direction} ({base} → {curr}, {pct})",
         cfg["safeguarding_rise_pct_warn"], cfg["safeguarding_rise_pct_high"],
         cfg["current_safeguarding_abs_warn"], cfg["current_safeguarding_abs_high"]),
        ("safeguarding_pressure", "police",
         "Police-involved events {direction} ({base} → {curr}, {pct})",
         cfg["police_rise_pct_warn"], cfg["police_rise_pct_high"],
         cfg["current_police_abs_warn"], cfg["current_police_abs_high"]),
        ("group_dynamics", "peer_conflict",
         "Peer-conflict events {direction} ({base} → {curr}, {pct})",
         50, 100, 2, 4),
        ("emotional_climate", "self_harm",
         "Self-harm events {direction} ({base} → {curr}, {pct})",
         0, 100, 1, 2),
    ]
    for domain, key, tmpl, w_pct, h_pct, abs_w, abs_h in pairs:
        f = _trend_factor(domain, tmpl, sig, key, w_pct, h_pct, abs_w, abs_h)
        if f:
            risks.append(f)

    # --- Protective factors
    if sig["days_since_incident"] is not None and sig["days_since_incident"] >= cfg["days_since_incident_protective"]:
        protectives.append(_protective_factor(
            "emotional_stability",
            f"{sig['days_since_incident']} days since last incident",
            8, {"days_since_incident": sig["days_since_incident"]},
        ))
    if sig["days_since_missing"] is not None and sig["days_since_missing"] >= cfg["days_since_missing_protective"]:
        protectives.append(_protective_factor(
            "missing_stability",
            f"{sig['days_since_missing']} days without a missing episode",
            8, {"days_since_missing": sig["days_since_missing"]},
        ))
    # Reduced incidents trend (current < baseline by ≥ 50%)
    if sig["incidents"]["base"] >= 2 and sig["incidents"]["curr"] <= sig["incidents"]["base"] // 2:
        protectives.append(_protective_factor(
            "emotional_stability",
            f"Incident frequency reduced ({sig['incidents']['base']} → {sig['incidents']['curr']})",
            10, {"first_14d_count": sig["incidents"]["base"], "latest_14d_count": sig["incidents"]["curr"]},
        ))
    # Reduced missing trend
    if sig["missing"]["base"] >= 2 and sig["missing"]["curr"] <= sig["missing"]["base"] // 2:
        protectives.append(_protective_factor(
            "missing_stability",
            f"Missing episodes reduced ({sig['missing']['base']} → {sig['missing']['curr']})",
            10, {"first_14d_count": sig["missing"]["base"], "latest_14d_count": sig["missing"]["curr"]},
        ))
    # Key work / positive notes engagement
    kw_curr = sig["keywork_notes"]["curr"]
    if kw_curr >= cfg["key_work_notes_protective_high"]:
        protectives.append(_protective_factor(
            "engagement",
            f"Strong key-work engagement — {kw_curr} positive notes in last 14 days",
            8, {"latest_14d_count": kw_curr},
        ))
    elif kw_curr >= cfg["key_work_notes_protective_warn"]:
        protectives.append(_protective_factor(
            "engagement",
            f"Consistent key-work engagement — {kw_curr} positive notes in last 14 days",
            4, {"latest_14d_count": kw_curr},
        ))
    # Education engagement rise
    if sig["education"]["curr"] > sig["education"]["base"] and sig["education"]["curr"] >= 2:
        protectives.append(_protective_factor(
            "education",
            f"Education engagement improving ({sig['education']['base']} → {sig['education']['curr']} entries)",
            5, {"first_14d_count": sig["education"]["base"], "latest_14d_count": sig["education"]["curr"]},
        ))

    return risks, protectives


def _status_from_score(score: int, days_in_placement: int, cfg: dict,
                       protective_count: int, risk_count: int) -> tuple[str, str]:
    if days_in_placement < cfg["min_days_for_trend"]:
        return "new_placement", STATUS_LABELS["new_placement"]
    if score >= cfg["deteriorating_threshold"]:
        return "critical" if score >= cfg["deteriorating_threshold"] + 18 else "deteriorating", \
               STATUS_LABELS["critical"] if score >= cfg["deteriorating_threshold"] + 18 else STATUS_LABELS["deteriorating"]
    if score >= cfg["watch_threshold"]:
        return "watch", STATUS_LABELS["watch"]
    if protective_count > 0 and risk_count == 0:
        return "stabilising", STATUS_LABELS["stabilising"]
    return "steady", STATUS_LABELS["steady"]


def _suggested_actions(status: str, risk_domains: set, protectives_count: int) -> list[str]:
    """Supportive, non-punitive suggested interventions."""
    actions: list[str] = []
    if status in ("deteriorating", "critical"):
        actions.append("Convene a placement stability meeting this week — keep tone supportive, focus on what's needed.")
    elif status == "watch":
        actions.append("Plan a reflective key-work conversation within the next 7 days.")

    if "missing_trend" in risk_domains:
        actions.append("Refresh missing-from-care plan with the resident; review trusted-adult contacts and triggers.")
    if "safeguarding_pressure" in risk_domains:
        actions.append("Update contextual-safeguarding map and consider strategy meeting with social worker.")
    if "behaviour_pressure" in risk_domains:
        actions.append("Review de-escalation approaches; confirm physical-intervention training currency and reflect with the team.")
    if "emotional_climate" in risk_domains:
        actions.append("Consider CAMHS / therapeutic input; protect emotional space and reduce demands.")
    if "group_dynamics" in risk_domains:
        actions.append("Review peer pairings and shared spaces; consider impact assessment for the wider group.")

    if status == "stabilising":
        actions.append("Acknowledge progress in next supervision; consider sharing positive trajectory with key worker.")
    if status == "steady" and protectives_count == 0:
        actions.append("Look for opportunities to evidence positive trajectory — key-work notes, education engagement, milestones.")
    if not actions:
        actions.append("No action required — placement profile is healthy. Note observations in next supervision.")
    return actions


async def build_resident_placement_stability(db, resident_id: str,
                                              cfg_override: Optional[dict] = None) -> dict:
    cfg = {**PLACEMENT_STABILITY_CONFIG, **(cfg_override or {})}
    resident = await db.residents.find_one({"id": resident_id}, {"_id": 0})
    if not resident:
        return {"error": "resident_not_found"}

    now = datetime.now(timezone.utc)
    admission = _parse_admission(resident)
    if not admission:
        return {
            "resident_id": resident_id,
            "name": resident.get("preferred_name") or resident.get("name"),
            "status": "new_placement",
            "status_label": "No admission date recorded — set placement date to enable stability intelligence.",
            "score": 0,
            "days_in_placement": 0,
            "risk_factors": [],
            "protective_factors": [],
            "signals": {},
            "suggested_actions": [],
            "config": cfg,
        }

    days_in_placement = max(0, (now - admission).days)
    baseline_start = admission
    baseline_end = admission + timedelta(days=14)
    current_end = now
    current_start = now - timedelta(days=14)
    # If still inside the baseline window, current = baseline (avoids overlap nonsense)
    if current_start < baseline_end:
        current_start = baseline_end

    sig = await _resident_signals(db, resident_id, baseline_start, baseline_end,
                                  current_start, current_end)
    risks, protectives = _build_factors(sig, cfg, days_in_placement)

    risk_score = sum(f["weight"] for f in risks)
    protective_score = sum(f["weight"] for f in protectives)
    score = max(0, risk_score - protective_score)

    risk_domains = {f["domain"] for f in risks}
    status, status_label = _status_from_score(score, days_in_placement, cfg,
                                              len(protectives), len(risks))
    actions = _suggested_actions(status, risk_domains, len(protectives))

    # Trend direction (overall)
    if risks and not protectives:
        direction = "deteriorating"
    elif protectives and not risks:
        direction = "improving"
    elif protective_score > risk_score:
        direction = "improving"
    elif risk_score > protective_score:
        direction = "deteriorating"
    else:
        direction = "stable"

    return {
        "resident_id": resident_id,
        "name": resident.get("preferred_name") or resident.get("name"),
        "admission_at": admission.isoformat(),
        "days_in_placement": days_in_placement,
        "baseline_window": {
            "start": baseline_start.isoformat(),
            "end":   baseline_end.isoformat(),
            "label": "first 14 days post-admission",
        },
        "current_window": {
            "start": current_start.isoformat(),
            "end":   current_end.isoformat(),
            "label": "latest 14 days",
        },
        "status": status,
        "status_label": status_label,
        "trend_direction": direction,
        "score": score,
        "risk_score": risk_score,
        "protective_score": protective_score,
        "risk_factors": sorted(risks, key=lambda f: -f["weight"]),
        "protective_factors": sorted(protectives, key=lambda f: -f["weight"]),
        "signals": sig,
        "suggested_actions": actions,
        "config": cfg,
        "explainable_note": (
            "Same data in → same status out. The score is risks minus protectives, clamped at zero. "
            "Use this as supportive intelligence — never as a label for the child."
        ),
    }


async def build_emerging_placement_concerns(db, cfg_override: Optional[dict] = None) -> dict:
    """Org-wide aggregation — Manager+ only.

    Surfaces residents whose placement stability is shifting (in either direction)
    so leadership can act early. Tone is supportive, not punitive.
    """
    cfg = {**PLACEMENT_STABILITY_CONFIG, **(cfg_override or {})}
    now = datetime.now(timezone.utc)

    # Active children's residents only
    residents = await db.residents.find(
        {
            "$and": [
                {"$or": [{"service_type": "children"}, {"service_type": None}, {"service_type": {"$exists": False}}]},
                {"$or": [{"discharged_at": None}, {"discharged_at": {"$exists": False}}]},
            ],
        },
        {"_id": 0, "id": 1, "name": 1, "preferred_name": 1, "placement_date": 1, "created_at": 1},
    ).to_list(500)

    rows: list[dict] = []
    for r in residents:
        snap = await build_resident_placement_stability(db, r["id"], cfg)
        if "error" in snap:
            continue
        rows.append(snap)

    # Buckets
    rank = {"critical": 0, "deteriorating": 1, "watch": 2, "stabilising": 3, "steady": 4, "new_placement": 5}
    concerns = [r for r in rows if r["status"] in ("critical", "deteriorating", "watch")]
    concerns.sort(key=lambda r: (rank[r["status"]], -r["score"]))

    stabilising = [r for r in rows if r["status"] == "stabilising"]
    stabilising.sort(key=lambda r: -r["protective_score"])

    summary = {
        "critical":       sum(1 for r in rows if r["status"] == "critical"),
        "deteriorating":  sum(1 for r in rows if r["status"] == "deteriorating"),
        "watch":          sum(1 for r in rows if r["status"] == "watch"),
        "stabilising":    sum(1 for r in rows if r["status"] == "stabilising"),
        "steady":         sum(1 for r in rows if r["status"] == "steady"),
        "new_placement":  sum(1 for r in rows if r["status"] == "new_placement"),
        "total":          len(rows),
    }
    if summary["critical"] or summary["deteriorating"]:
        overall = "support_recommended"
        overall_label = "Support recommended for one or more placements"
    elif summary["watch"]:
        overall_label = "Watching for early signs"
        overall = "watch"
    elif summary["stabilising"]:
        overall_label = "Positive stabilisation trends across the home"
        overall = "stabilising"
    else:
        overall_label = "Placements are settled across the home"
        overall = "steady"

    return {
        "generated_at": now.isoformat(),
        "summary": summary,
        "overall_status": overall,
        "overall_label": overall_label,
        "emerging_concerns": [_lite(r) for r in concerns],
        "stabilising_trends": [_lite(r) for r in stabilising],
        "all_residents": [_lite(r) for r in rows],
        "explainable_note": (
            "Aggregate, evidence-linked, deterministic. Click any resident for the full factor chain. "
            "This panel highlights where support is needed — and where things are quietly going well."
        ),
    }


def _lite(snap: dict) -> dict:
    """Compact row for the org panel — full detail loaded on demand."""
    return {
        "resident_id": snap["resident_id"],
        "name": snap.get("name"),
        "status": snap["status"],
        "status_label": snap["status_label"],
        "trend_direction": snap["trend_direction"],
        "days_in_placement": snap["days_in_placement"],
        "score": snap["score"],
        "risk_score": snap["risk_score"],
        "protective_score": snap["protective_score"],
        "top_risk":       snap["risk_factors"][0]["label"] if snap["risk_factors"] else None,
        "top_protective": snap["protective_factors"][0]["label"] if snap["protective_factors"] else None,
    }
