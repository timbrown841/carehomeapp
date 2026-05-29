"""Phase H — Induction & Policy Management.

Deterministic, audit-first policy lifecycle for Ofsted / Reg 44 / CQC evidence.
Owns its own data shapes; persistence happens via the existing motor DB instance.

NOTE: All file storage uses the existing /api/uploads endpoint (PDF/DOCX/PPTX/MP4),
so this module only holds metadata, not bytes.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional


# ---- Seeded category catalogue -------------------------------------------

CHILDRENS_POLICY_CATEGORIES = [
    "Statement of Purpose", "Safeguarding", "Missing From Care", "Child Protection",
    "Behaviour Support", "Positive Relationships", "Complaints", "Whistleblowing",
    "Medication", "Health & Safety", "Fire Safety", "Equality & Diversity",
    "Online Safety", "CSE / CCE", "Prevent", "Physical Intervention",
    "Supervision", "Care Planning", "Recording & Reporting",
    "Allegations Against Staff", "GDPR & Confidentiality",
]

ADULT_POLICY_CATEGORIES = [
    "Statement of Purpose", "Adult Safeguarding", "MCA", "DoLS",
    "Medication", "Health & Safety", "Fire Safety", "Infection Control",
    "Whistleblowing", "Complaints", "Equality & Diversity", "GDPR",
    "Positive Behaviour Support", "Incident Management", "Risk Management",
    "Professional Boundaries",
]


# ---- Default Children's induction pack -----------------------------------

DEFAULT_CHILDRENS_INDUCTION_PACK = {
    "key": "default_childrens",
    "name": "Children's Services · 4-Week Induction",
    "sector": "children",
    "is_default": True,
    "description": "Operational induction aligned to Ofsted Quality Standards. Customisable per home.",
    "weeks": [
        {"week_no": 1, "title": "Foundations & Safeguarding", "categories": [
            "Statement of Purpose", "Safeguarding", "Child Protection",
            "Missing From Care", "Behaviour Support", "Fire Safety", "Health & Safety",
        ]},
        {"week_no": 2, "title": "Care Practice", "categories": [
            "Care Planning", "Recording & Reporting", "Positive Relationships",
            "Complaints", "Online Safety",
        ]},
        {"week_no": 3, "title": "Trauma-Informed & Contextual Safeguarding", "categories": [
            "CSE / CCE", "Prevent", "Equality & Diversity", "GDPR & Confidentiality",
        ]},
        {"week_no": 4, "title": "Restrictive & Reflective Practice", "categories": [
            "Medication", "Physical Intervention", "Allegations Against Staff",
            "Supervision", "Whistleblowing",
        ]},
    ],
}

DEFAULT_ADULT_INDUCTION_PACK = {
    "key": "default_adult",
    "name": "Adult Services · 4-Week Induction",
    "sector": "adult",
    "is_default": True,
    "description": "Operational induction aligned to CQC fundamental standards. Customisable per service.",
    "weeks": [
        {"week_no": 1, "title": "Foundations & Safeguarding", "categories": [
            "Statement of Purpose", "Adult Safeguarding", "MCA", "DoLS",
            "Fire Safety", "Health & Safety",
        ]},
        {"week_no": 2, "title": "Daily Care Practice", "categories": [
            "Medication", "Infection Control", "Incident Management",
            "Risk Management",
        ]},
        {"week_no": 3, "title": "Professional Standards", "categories": [
            "Equality & Diversity", "GDPR", "Complaints", "Whistleblowing",
        ]},
        {"week_no": 4, "title": "Behaviour & Boundaries", "categories": [
            "Positive Behaviour Support", "Professional Boundaries",
        ]},
    ],
}


# ---- Status machine ------------------------------------------------------

ASSIGNMENT_STATUSES = (
    "assigned",
    "in_progress",
    "assessment_pending",
    "awaiting_staff_signature",
    "awaiting_manager_sign_off",
    "complete",
    "overdue",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def policy_rag_status(policy: dict) -> str:
    """Deterministic RAG colour for a single policy:
        - red: no current version OR past expiry / past review_date by >30 days
        - amber: review_date within 30 days, OR expiry within 60 days
        - green: review_date > 30 days away
    """
    if not policy or not policy.get("current_version_id"):
        return "red"
    now = datetime.now(timezone.utc)
    review = policy.get("review_date")
    expiry = policy.get("expiry_date")
    try:
        if review:
            r = datetime.fromisoformat(review.replace("Z", "+00:00"))
            days = (r - now).days
            if days < 0:
                return "red"
            if days <= 30:
                return "amber"
        if expiry:
            e = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            ed = (e - now).days
            if ed < 0:
                return "red"
            if ed <= 60:
                return "amber"
    except (ValueError, AttributeError):
        return "amber"
    return "green"


def compute_assignment_status(assignment: dict) -> str:
    """Project the canonical status from stored fields; honour explicit override."""
    explicit = assignment.get("status")
    if explicit == "complete":
        return "complete"
    if assignment.get("manager_sig_at"):
        return "complete"
    if assignment.get("staff_sig_at"):
        return "awaiting_manager_sign_off"
    if assignment.get("assessment_passed_at"):
        return "awaiting_staff_signature"
    if assignment.get("opened_at"):
        return "in_progress"
    return explicit or "assigned"


def is_overdue(assignment: dict, now: Optional[datetime] = None) -> bool:
    if compute_assignment_status(assignment) == "complete":
        return False
    due = assignment.get("due_date")
    if not due:
        return False
    try:
        d = datetime.fromisoformat(due.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return False
    n = now or datetime.now(timezone.utc)
    return n > d


async def ensure_seed_categories(db):
    """Idempotent seed of the category catalogue and default induction packs."""
    # Categories: insert if missing
    for sector, names in (("children", CHILDRENS_POLICY_CATEGORIES),
                          ("adult", ADULT_POLICY_CATEGORIES)):
        for name in names:
            await db.policy_categories.update_one(
                {"sector": sector, "name": name},
                {"$setOnInsert": {
                    "sector": sector,
                    "name": name,
                    "created_at": now_iso(),
                }},
                upsert=True,
            )

    # Default induction packs (only if no pack exists for that sector)
    for pack in (DEFAULT_CHILDRENS_INDUCTION_PACK, DEFAULT_ADULT_INDUCTION_PACK):
        existing = await db.induction_packs.find_one({"key": pack["key"]})
        if existing:
            # Ensure 'id' field exists for legacy seeds
            if not existing.get("id"):
                await db.induction_packs.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"id": pack["key"]}},
                )
            continue
        await db.induction_packs.insert_one({
            **pack,
            "id": pack["key"],
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "created_by_id": "system",
            "created_by_name": "Safelyn",
        })


def grade_mcq(questions: list[dict], answers: list[dict]) -> dict:
    """Auto-grade MCQ questions. Reflection questions are not graded — just stored.

    Returns: { mcq_total, mcq_correct, score_pct, passed, per_question }
    """
    if not questions:
        return {"mcq_total": 0, "mcq_correct": 0, "score_pct": 100.0,
                "passed": True, "per_question": []}
    by_id = {a.get("question_id"): a for a in (answers or [])}
    per_question = []
    correct = 0
    total = 0
    for q in questions:
        qid = q.get("id")
        a = by_id.get(qid) or {}
        if q.get("type") == "mcq":
            total += 1
            picked = a.get("selected_index")
            ok = (picked is not None and int(picked) == int(q.get("correct_index", -1)))
            if ok:
                correct += 1
            per_question.append({
                "question_id": qid,
                "type": "mcq",
                "selected_index": picked,
                "correct_index": q.get("correct_index"),
                "correct": ok,
            })
        else:  # reflection
            per_question.append({
                "question_id": qid,
                "type": "reflection",
                "answer_text": a.get("answer_text", ""),
            })
    pct = (correct / total * 100.0) if total else 100.0
    return {
        "mcq_total": total,
        "mcq_correct": correct,
        "score_pct": round(pct, 1),
        "passed": pct >= 80.0,   # 80% threshold (manager can override per-policy in P2)
        "per_question": per_question,
    }
