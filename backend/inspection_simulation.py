"""Inspection Simulation Mode — deterministic, rules-based readiness analysis.

NOT AI. NOT speculation. Pure deterministic rules over real operational data:
  - Regulation 44 module RAGs + indicators
  - Command-centre safeguarding overview + pattern alerts
  - Inspection action plan (open vs resolved)
  - 9 Quality Standards aggregate

Output is the same structured JSON whether viewed in the UI or rendered to PDF:
  - likely_strengths
  - likely_weaknesses
  - likely_inspection_concerns (the questions an inspector would probe)
  - repeated_compliance_failures
  - safeguarding_exposure
  - recommendations (prioritised)
  - quality_standards_judgement (predicted rating per QS)
  - overall_predicted_rating

Each finding carries an "evidence" trail back to the source modules so managers
can drill in and verify — never a black box.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from .regulation_44_modules import QS


def _pct(n: int, total: int) -> int:
    if not total:
        return 0
    return round(n * 100 / total)


def _predicted_rating(score: int) -> dict:
    """Map an aggregate score to an Ofsted-style judgement."""
    if score >= 88:
        return {"key": "outstanding", "label": "Outstanding", "tone": "green"}
    if score >= 72:
        return {"key": "good", "label": "Good", "tone": "green"}
    if score >= 55:
        return {"key": "requires_improvement", "label": "Requires improvement", "tone": "amber"}
    return {"key": "inadequate", "label": "Inadequate", "tone": "red"}


def _qs_judgement(score: int) -> str:
    if score >= 85:
        return "Outstanding"
    if score >= 70:
        return "Good"
    if score >= 55:
        return "Requires improvement"
    return "Inadequate"


def build_inspection_simulation(reg44: dict, command_centre: dict) -> dict:
    """Build the structured simulation JSON from two already-aggregated payloads."""
    now = datetime.now(timezone.utc)

    # ---- Index modules and aggregate Quality Standards ----
    all_modules: list[dict] = []
    for c in reg44.get("categories", []):
        for m in c.get("modules", []):
            all_modules.append(m)

    by_id = {m["id"]: m for m in all_modules}
    green = [m for m in all_modules if m["rag"] == "green"]
    amber = [m for m in all_modules if m["rag"] == "amber"]
    red   = [m for m in all_modules if m["rag"] == "red"]

    # Quality Standards aggregate (avg score across modules tagged with each QS)
    qs_scores: dict[str, list[int]] = {k: [] for k in QS}
    for m in all_modules:
        for k in (m.get("quality_standards") or []):
            if k in qs_scores:
                qs_scores[k].append(m["score"])
    qs_judgement = []
    for k, label in QS.items():
        scores = qs_scores.get(k, [])
        avg = round(sum(scores) / len(scores)) if scores else 75
        qs_judgement.append({
            "key": k,
            "title": label,
            "score": avg,
            "judgement": _qs_judgement(avg),
            "module_count": len(scores),
        })

    # ---- Likely strengths ----
    likely_strengths: list[dict] = []
    # 1) Categories with strong RAG
    for c in reg44.get("categories", []):
        if c["rag"] == "green" and c["avg_score"] >= 82:
            likely_strengths.append({
                "title": c["title"],
                "evidence": f"{c['avg_score']}% across {c['module_count']} modules — no red flags.",
                "source_kind": "category",
                "source_id": c["id"],
            })
    # 2) Top 3 highest-scoring live modules
    top_live = sorted(
        [m for m in all_modules if m["mode"] == "live" and m["rag"] == "green"],
        key=lambda x: -x["score"],
    )[:3]
    for m in top_live:
        likely_strengths.append({
            "title": m["title"],
            "evidence": f"{m['score']}% · " + ", ".join(
                f"{i['label']}: {i['value']}" for i in (m.get("indicators") or [])[:3]
            ),
            "source_kind": "module",
            "source_id": m["id"],
        })
    # 3) Action plan momentum
    resolved_recent = len(command_centre.get("recently_resolved", []) or [])
    if resolved_recent >= 3:
        likely_strengths.append({
            "title": "Active leadership action plan",
            "evidence": f"{resolved_recent} inspection actions resolved in the last 7 days.",
            "source_kind": "command_centre",
            "source_id": "recently_resolved",
        })

    # ---- Likely weaknesses ----
    likely_weaknesses: list[dict] = []
    for m in red:
        likely_weaknesses.append({
            "title": m["title"],
            "evidence": f"RAG RED · {m['score']}% · " + (
                "; ".join(a.get("title", "") for a in (m.get("overdue_actions") or [])[:2])
                or "score below threshold"
            ),
            "regulation_refs": m.get("regulation_refs", []),
            "quality_standards": m.get("quality_standards", []),
            "source_kind": "module",
            "source_id": m["id"],
        })
    # Add the worst 3 amber modules as developmental, not weakness, if we have <3 red
    if len(likely_weaknesses) < 3:
        worst_amber = sorted(amber, key=lambda x: x["score"])[: 3 - len(likely_weaknesses)]
        for m in worst_amber:
            likely_weaknesses.append({
                "title": m["title"],
                "evidence": f"RAG AMBER · {m['score']}%",
                "regulation_refs": m.get("regulation_refs", []),
                "quality_standards": m.get("quality_standards", []),
                "source_kind": "module",
                "source_id": m["id"],
            })

    # ---- Likely inspection concerns (what an inspector would probe) ----
    likely_concerns: list[dict] = []
    sg = command_centre.get("safeguarding_overview", {}) or {}

    if sg.get("currently_missing", 0) > 0:
        likely_concerns.append({
            "title": "Currently missing child",
            "probe": "How are you safeguarding while they are away? What's your contact strategy? Has the LA been informed?",
            "evidence": f"{sg['currently_missing']} child(ren) currently missing.",
            "severity": "high",
        })
    if sg.get("open_over_48h", 0) > 0:
        likely_concerns.append({
            "title": "Safeguarding incidents open beyond 48 hours",
            "probe": "Why is this not closed? Has Reg 40 notification been sent? Where is the multi-agency strategy meeting record?",
            "evidence": f"{sg['open_over_48h']} safeguarding incident(s) open >48h.",
            "severity": "high",
        })
    if sg.get("ri_outstanding", 0) > 0:
        likely_concerns.append({
            "title": "Return interviews outstanding",
            "probe": "Where are the return interviews? Who has tried? Has independence advocacy been considered?",
            "evidence": f"{sg['ri_outstanding']} return interview(s) outstanding.",
            "severity": "medium",
        })
    if sg.get("restraint_30d", 0) >= 3:
        likely_concerns.append({
            "title": "Pattern of physical interventions",
            "probe": "Show me your de-escalation plan, BSP reviews, and post-incident debriefs.",
            "evidence": f"{sg['restraint_30d']} restraints in 30 days.",
            "severity": "high",
        })
    if sg.get("self_harm_30d", 0) >= 2:
        likely_concerns.append({
            "title": "Self-harm cluster",
            "probe": "What CAMHS engagement is in place? Are care plans trauma-informed and current?",
            "evidence": f"{sg['self_harm_30d']} self-harm incidents in 30 days.",
            "severity": "high",
        })

    # Patterns surfaced inside Reg44 modules
    for m in all_modules:
        for p in (m.get("pattern_alerts") or []):
            likely_concerns.append({
                "title": p.get("title") or "Operational pattern",
                "probe": "Show me how this is being monitored and what intervention is in place.",
                "evidence": p.get("message"),
                "severity": p.get("severity", "medium"),
                "source_id": m["id"],
            })

    # Documentation/expiry signals
    docs_mod = by_id.get("missing_documentation")
    if docs_mod and docs_mod.get("score", 100) < 70:
        likely_concerns.append({
            "title": "Documentation gaps",
            "probe": "Show me the missing risk assessments, expired documents, and your audit trail of updates.",
            "evidence": "; ".join(f"{i['label']}: {i['value']}" for i in (docs_mod.get("indicators") or [])),
            "severity": "medium",
            "source_id": "missing_documentation",
        })

    # Workforce signals
    sup_mod = by_id.get("supervision")
    if sup_mod and sup_mod.get("score", 100) < 70:
        likely_concerns.append({
            "title": "Supervision compliance",
            "probe": "How are you supporting staff wellbeing and reflective practice? Show me supervision records.",
            "evidence": "; ".join(f"{i['label']}: {i['value']}" for i in (sup_mod.get("indicators") or [])),
            "severity": "medium",
            "source_id": "supervision",
        })

    # ---- Repeated compliance failures (modules consistently red) ----
    repeated_failures = [
        {
            "title": m["title"],
            "module_id": m["id"],
            "score": m["score"],
            "indicators": m.get("indicators", []),
            "regulation_refs": m.get("regulation_refs", []),
        }
        for m in red
    ]

    # ---- Safeguarding exposure (consolidated view) ----
    safeguarding_exposure = []
    sg_mods_red_amber = [
        m for m in all_modules
        if m["category"] == "safeguarding" and m["rag"] in ("red", "amber")
    ]
    for m in sg_mods_red_amber:
        safeguarding_exposure.append({
            "title": m["title"],
            "rag": m["rag"],
            "score": m["score"],
            "evidence": "; ".join(f"{i['label']}: {i['value']}" for i in (m.get("indicators") or [])),
            "module_id": m["id"],
        })

    # ---- Recommendations (prioritised) ----
    recommendations: list[dict] = []
    # 1) Top 3 red modules → P0 recommendations
    for m in red[:3]:
        actions = (m.get("overdue_actions") or [])[:2]
        recommendations.append({
            "priority": "P0",
            "title": f"Close the gap on {m['title']}",
            "rationale": f"RAG RED at {m['score']}%. Visible to inspectors as a current operational weakness.",
            "concrete_steps": [a.get("title") for a in actions if a.get("title")] or [
                f"Review the {m['title']} dashboard and complete the top outstanding actions."
            ],
            "regulation_refs": m.get("regulation_refs", []),
            "quality_standards": m.get("quality_standards", []),
            "module_id": m["id"],
        })
    # 2) Open safeguarding >48h
    if sg.get("open_over_48h", 0) > 0:
        recommendations.append({
            "priority": "P0",
            "title": "Resolve open safeguarding incidents older than 48 hours",
            "rationale": "Open SGs beyond 48h with no documented progression suggest weak oversight.",
            "concrete_steps": [
                "Triage each open SG today.",
                "Document outcome, escalation, and any Reg 40 notification.",
                "Sign-off by the registered manager before close.",
            ],
            "regulation_refs": ["Reg 12 — Protection of children", "Reg 40 — Notifications"],
            "quality_standards": ["QS7", "QS8"],
        })
    # 3) Action plan focus
    high_open = sum(1 for a in (command_centre.get("critical_actions") or [])
                    if a.get("severity") == "high")
    if high_open >= 5:
        recommendations.append({
            "priority": "P1",
            "title": "Reduce the high-severity action backlog",
            "rationale": f"{high_open} high-severity actions are currently outstanding.",
            "concrete_steps": [
                "Allocate owners to each high-severity action this week.",
                "Set 7-day due dates and tracking in the Manager Action Plan.",
                "Review backlog in the next Reg 44 visit.",
            ],
            "regulation_refs": ["Reg 45 — Visit recommendations"],
            "quality_standards": ["QS8"],
        })
    # 4) Quality standards below Good
    weak_qs = [q for q in qs_judgement if q["score"] < 70]
    for q in weak_qs:
        recommendations.append({
            "priority": "P1",
            "title": f"Strengthen evidence for {q['key']} — {q['title']}",
            "rationale": f"Aggregate score {q['score']}% across {q['module_count']} module(s). Likely judgement: {q['judgement']}.",
            "concrete_steps": [
                f"Identify the weakest module mapped to {q['key']}.",
                "Capture manager evidence notes against any manual modules.",
                "Close the top 2 overdue actions in those modules.",
            ],
            "quality_standards": [q["key"]],
        })

    # ---- Overall predicted rating ----
    overall_score = reg44.get("overall_score", 0)
    predicted = _predicted_rating(overall_score)

    return {
        "generated_at": now.isoformat(),
        "scope": "children",
        "overall_score": overall_score,
        "predicted_rating": predicted,
        "module_summary": {
            "total": len(all_modules),
            "green": len(green),
            "amber": len(amber),
            "red": len(red),
        },
        "quality_standards_judgement": qs_judgement,
        "likely_strengths": likely_strengths[:8],
        "likely_weaknesses": likely_weaknesses[:8],
        "likely_inspection_concerns": likely_concerns[:10],
        "repeated_compliance_failures": repeated_failures[:8],
        "safeguarding_exposure": safeguarding_exposure[:8],
        "recommendations": recommendations[:8],
    }


def build_reg44_auto_draft(reg44: dict, simulation: dict, command_centre: dict) -> dict:
    """Pre-fill the Regulation 44 visit summary based on live data.

    Returns the SAME fields used by the manual editor, ready to drop into the
    form for the independent visitor to refine.
    """
    strengths = simulation.get("likely_strengths", [])
    weaknesses = simulation.get("likely_weaknesses", [])
    concerns = simulation.get("likely_inspection_concerns", [])
    recs = simulation.get("recommendations", [])
    resolved = command_centre.get("recently_resolved", []) or []

    def bullets(items: list[str], max_n: int = 6) -> str:
        return "\n".join(f"• {x}" for x in items[:max_n] if x)

    strengths_text = bullets([
        f"{s['title']} — {s['evidence']}" for s in strengths
    ])
    development_text = bullets([
        f"{w['title']} ({w['evidence']})" for w in weaknesses
    ])
    immediate_text = bullets([
        f"{c['title']} — {c.get('evidence') or ''}" for c in concerns if c.get("severity") == "high"
    ])
    progress_text = bullets([
        f"{r.get('title')} — resolved by {r.get('resolved_by_name') or 'team'}"
        for r in resolved
    ])
    recs_text = bullets([
        f"[{r['priority']}] {r['title']} — {r['rationale']}" for r in recs
    ])

    pred = simulation.get("predicted_rating", {})
    judgement_key_map = {
        "outstanding": "outstanding",
        "good": "good",
        "requires_improvement": "requires_improvement",
        "inadequate": "inadequate",
    }
    visit_judgement = judgement_key_map.get(pred.get("key"), "good")

    return {
        "visit_date": datetime.now(timezone.utc).date().isoformat(),
        "visitor_name": "",
        "overall_judgement": visit_judgement,
        "strengths": strengths_text,
        "areas_for_development": development_text,
        "immediate_concerns": immediate_text or "No immediate safeguarding concerns identified by the operational dashboard at the time of visit.",
        "progress_since_last": progress_text or "No actions resolved in the last reporting period.",
        "recommendations": recs_text,
        "manager_comments": "",
        "data_signature": {
            "overall_score": reg44.get("overall_score"),
            "module_count": reg44.get("module_count"),
            "live_count": reg44.get("live_count"),
            "manual_count": reg44.get("manual_count"),
            "generated_at": simulation.get("generated_at"),
        },
    }
