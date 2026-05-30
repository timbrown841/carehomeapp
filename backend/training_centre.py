"""Phase E.1 — Training & Workforce Development Centre.

Seed catalogues and deterministic helpers. NO AI / no LLM scoring — every status
is computed from explicit dates and counters.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional


# ---- Mandatory training catalogues -----------------------------------------
# Each course: code, name, category, frequency_months (renewal cycle),
# sector (children|adult|both), mandatory, description
CHILDREN_COURSES: list[dict] = [
    {"code": "safeguarding_l3", "name": "Safeguarding Children Level 3", "category": "Safeguarding", "frequency_months": 24, "mandatory": True},
    {"code": "team_teach", "name": "Team Teach (Physical Intervention)", "category": "Behaviour Support", "frequency_months": 24, "mandatory": True},
    {"code": "pace", "name": "PACE (Playfulness, Acceptance, Curiosity, Empathy)", "category": "Therapeutic Practice", "frequency_months": 36, "mandatory": True},
    {"code": "trauma_informed", "name": "Trauma Informed Practice", "category": "Therapeutic Practice", "frequency_months": 36, "mandatory": True},
    {"code": "child_development", "name": "Child Development & Attachment", "category": "Care Knowledge", "frequency_months": 36, "mandatory": True},
    {"code": "cse_cce", "name": "CSE / CCE Awareness", "category": "Safeguarding", "frequency_months": 24, "mandatory": True},
    {"code": "missing_from_care", "name": "Missing from Care Procedures", "category": "Safeguarding", "frequency_months": 24, "mandatory": True},
    {"code": "prevent_duty", "name": "Prevent Duty (Radicalisation)", "category": "Safeguarding", "frequency_months": 24, "mandatory": True},
    {"code": "first_aid", "name": "First Aid at Work", "category": "Health & Safety", "frequency_months": 36, "mandatory": True},
    {"code": "medication", "name": "Safe Administration of Medication", "category": "Health & Safety", "frequency_months": 24, "mandatory": True},
    {"code": "fire_safety", "name": "Fire Safety", "category": "Health & Safety", "frequency_months": 12, "mandatory": True},
    {"code": "infection_control", "name": "Infection Prevention & Control", "category": "Health & Safety", "frequency_months": 12, "mandatory": True},
    {"code": "food_hygiene", "name": "Food Hygiene Level 2", "category": "Health & Safety", "frequency_months": 36, "mandatory": True},
    {"code": "gdpr", "name": "GDPR & Data Protection", "category": "Compliance", "frequency_months": 24, "mandatory": True},
    {"code": "equality_diversity", "name": "Equality, Diversity & Inclusion", "category": "Compliance", "frequency_months": 36, "mandatory": True},
    {"code": "lone_working", "name": "Lone Working", "category": "Health & Safety", "frequency_months": 24, "mandatory": True},
]

ADULT_COURSES: list[dict] = [
    {"code": "safeguarding_adults", "name": "Safeguarding Adults Level 3", "category": "Safeguarding", "frequency_months": 24, "mandatory": True},
    {"code": "mca", "name": "Mental Capacity Act (MCA)", "category": "Care Knowledge", "frequency_months": 24, "mandatory": True},
    {"code": "dols", "name": "Deprivation of Liberty Safeguards (DoLS)", "category": "Care Knowledge", "frequency_months": 24, "mandatory": True},
    {"code": "medication_adult", "name": "Safe Administration of Medication", "category": "Health & Safety", "frequency_months": 24, "mandatory": True},
    {"code": "falls_prevention", "name": "Falls Prevention & Management", "category": "Care Knowledge", "frequency_months": 24, "mandatory": True},
    {"code": "dementia_care", "name": "Dementia Care Awareness", "category": "Care Knowledge", "frequency_months": 36, "mandatory": True},
    {"code": "moving_handling", "name": "Moving & Handling (People)", "category": "Health & Safety", "frequency_months": 12, "mandatory": True},
    {"code": "pbs", "name": "Positive Behaviour Support", "category": "Behaviour Support", "frequency_months": 24, "mandatory": True},
    {"code": "first_aid_adult", "name": "First Aid at Work", "category": "Health & Safety", "frequency_months": 36, "mandatory": True},
    {"code": "fire_safety_adult", "name": "Fire Safety", "category": "Health & Safety", "frequency_months": 12, "mandatory": True},
    {"code": "infection_control_adult", "name": "Infection Prevention & Control", "category": "Health & Safety", "frequency_months": 12, "mandatory": True},
    {"code": "food_hygiene_adult", "name": "Food Hygiene Level 2", "category": "Health & Safety", "frequency_months": 36, "mandatory": True},
    {"code": "gdpr_adult", "name": "GDPR & Data Protection", "category": "Compliance", "frequency_months": 24, "mandatory": True},
    {"code": "equality_diversity_adult", "name": "Equality, Diversity & Inclusion", "category": "Compliance", "frequency_months": 36, "mandatory": True},
    {"code": "end_of_life", "name": "End of Life Care Awareness", "category": "Care Knowledge", "frequency_months": 36, "mandatory": False},
    {"code": "lone_working_adult", "name": "Lone Working", "category": "Health & Safety", "frequency_months": 24, "mandatory": True},
]


# ---- Qualifications catalogue ---------------------------------------------
QUALIFICATION_CATALOGUE: list[dict] = [
    {"code": "l3_residential_childcare", "name": "Level 3 Diploma in Residential Childcare", "level": 3, "sector": "children"},
    {"code": "l4_children_young_people", "name": "Level 4 Children, Young People & Families Practitioner", "level": 4, "sector": "children"},
    {"code": "l5_leadership_mgmt", "name": "Level 5 Leadership & Management (Health & Social Care)", "level": 5, "sector": "both"},
    {"code": "l3_adult_care", "name": "Level 3 Diploma in Adult Care", "level": 3, "sector": "adult"},
    {"code": "l4_adult_care", "name": "Level 4 Diploma in Adult Care", "level": 4, "sector": "adult"},
    {"code": "social_work_degree", "name": "BA (Hons) / MA Social Work", "level": 6, "sector": "both"},
    {"code": "nursing_degree", "name": "Registered Nurse (NMC)", "level": 6, "sector": "both"},
    {"code": "l2_health_social_care", "name": "Level 2 Diploma in Health & Social Care", "level": 2, "sector": "both"},
    {"code": "team_teach_advanced", "name": "Team Teach Advanced (Tutor)", "level": 4, "sector": "children"},
    {"code": "best_interest_assessor", "name": "Best Interest Assessor (BIA)", "level": 6, "sector": "adult"},
]


def courses_for_sector(sector: str) -> list[dict]:
    if sector == "children":
        return [{**c, "sector": "children"} for c in CHILDREN_COURSES]
    if sector == "adult":
        return [{**c, "sector": "adult"} for c in ADULT_COURSES]
    return []


def qualifications_for_sector(sector: Optional[str] = None) -> list[dict]:
    if not sector:
        return QUALIFICATION_CATALOGUE
    return [q for q in QUALIFICATION_CATALOGUE if q["sector"] in (sector, "both")]


# ---- Status helpers --------------------------------------------------------

def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _soon_cutoff(days: int = 60) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def record_status(record: dict, soon_days: int = 60) -> str:
    """Deterministic status for a single training record:
    - missing: no completed_on
    - expired: expires_on < today
    - expiring: expires_on <= today+60
    - ok: otherwise
    """
    today = _today()
    soon = _soon_cutoff(soon_days)
    if not record.get("completed_on"):
        return "missing"
    exp = record.get("expires_on")
    if not exp:
        return "ok"
    if exp < today:
        return "expired"
    if exp <= soon:
        return "expiring"
    return "ok"


def cell_status(records: list[dict], soon_days: int = 60) -> str:
    """RAG for a matrix cell — pick most-recent record, return its status."""
    if not records:
        return "missing"
    # Most recent by completed_on
    latest = sorted(records, key=lambda r: r.get("completed_on") or "")[-1]
    return record_status(latest, soon_days)


def compliance_pct(total_required: int, ok_or_expiring: int) -> int:
    if total_required <= 0:
        return 100
    return round((ok_or_expiring / total_required) * 100)


# ---- Idempotent seed -------------------------------------------------------

async def seed_catalogues(db):
    """Idempotent. Inserts the children's + adult course catalogues and the
    qualification catalogue if rows are missing. Never auto-enrols staff."""
    now = datetime.now(timezone.utc).isoformat()
    for c in CHILDREN_COURSES + ADULT_COURSES:
        sector = "children" if c in CHILDREN_COURSES else "adult"
        await db.tc_courses.update_one(
            {"code": c["code"], "sector": sector},
            {"$setOnInsert": {**c, "sector": sector, "created_at": now}},
            upsert=True,
        )
    for q in QUALIFICATION_CATALOGUE:
        await db.tc_qual_catalogue.update_one(
            {"code": q["code"]},
            {"$setOnInsert": {**q, "created_at": now}},
            upsert=True,
        )
