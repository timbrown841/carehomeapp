"""Adult Services modules — Care Tasks, Falls, Mobility, MCA, Wellbeing.

Collections:
  - care_tasks
  - falls
  - mobility_assessments
  - mca_assessments
  - wellbeing_observations
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal
from pydantic import BaseModel, Field


# ============================================================
# Care Tasks
# ============================================================

CARE_TASK_KINDS = (
    "morning_routine", "afternoon_routine", "evening_routine",
    "personal_care", "hygiene_support", "meal_support",
    "medication_prompt", "domestic_support", "community_access",
    "appointment_support", "welfare_check",
)

CARE_TASK_STATUSES = ("pending", "completed", "refused", "missed")


class CareTaskIn(BaseModel):
    resident_id: str
    kind: Literal[CARE_TASK_KINDS] = "personal_care"  # type: ignore
    title: str = Field(min_length=1, max_length=200)
    due_at: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=2000)
    support_minutes: Optional[int] = Field(None, ge=0, le=480)


class CareTaskUpdate(BaseModel):
    status: Optional[Literal[CARE_TASK_STATUSES]] = None  # type: ignore
    notes: Optional[str] = Field(None, max_length=2000)
    refused_reason: Optional[str] = Field(None, max_length=500)
    support_minutes: Optional[int] = Field(None, ge=0, le=480)


# ============================================================
# Falls Register
# ============================================================

FALL_INJURY_LEVELS = ("none", "minor", "moderate", "serious")
FALL_HOSPITAL = ("none", "ambulance_called", "a_and_e", "admitted")


class FallIn(BaseModel):
    resident_id: str
    occurred_at: str
    location: str = Field(min_length=1, max_length=200)
    witnessed: bool = False
    witness_name: Optional[str] = Field(None, max_length=200)
    injury: Literal[FALL_INJURY_LEVELS] = "none"  # type: ignore
    injury_description: Optional[str] = Field(None, max_length=1000)
    body_map_id: Optional[str] = None
    hospital_involvement: Literal[FALL_HOSPITAL] = "none"  # type: ignore
    equipment_involved: Optional[str] = Field(None, max_length=200)
    action_taken: Optional[str] = Field(None, max_length=2000)
    follow_up: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=4000)


class FallUpdate(BaseModel):
    injury: Optional[Literal[FALL_INJURY_LEVELS]] = None  # type: ignore
    injury_description: Optional[str] = Field(None, max_length=1000)
    hospital_involvement: Optional[Literal[FALL_HOSPITAL]] = None  # type: ignore
    action_taken: Optional[str] = Field(None, max_length=2000)
    follow_up: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=4000)


# ============================================================
# Mobility Assessment
# ============================================================

MOBILITY_LEVELS = ("independent", "walking_aid", "wheelchair", "hoist_required", "bedbound")
FALLS_RISK_LEVELS = ("low", "medium", "high")


class MobilityAssessmentIn(BaseModel):
    resident_id: str
    mobility_level: Literal[MOBILITY_LEVELS] = "independent"  # type: ignore
    walking_aids: Optional[List[str]] = None
    transfer_support: Optional[str] = Field(None, max_length=1000)
    falls_risk: Literal[FALLS_RISK_LEVELS] = "low"  # type: ignore
    moving_handling_needs: Optional[str] = Field(None, max_length=2000)
    equipment_required: Optional[List[str]] = None
    environmental_risks: Optional[str] = Field(None, max_length=2000)
    staff_guidance: Optional[str] = Field(None, max_length=4000)
    review_date: Optional[str] = None


# ============================================================
# MCA / Capacity Assessment
# ============================================================

CAPACITY_OUTCOMES = ("has_capacity", "lacks_capacity", "fluctuating")


class MCAAssessmentIn(BaseModel):
    resident_id: str
    decision_topic: str = Field(min_length=1, max_length=500)
    communication_needs: Optional[str] = Field(None, max_length=1000)
    can_understand: bool = True
    can_retain: bool = True
    can_weigh: bool = True
    can_communicate: bool = True
    capacity_outcome: Literal[CAPACITY_OUTCOMES] = "has_capacity"  # type: ignore
    best_interest_decision: Optional[str] = Field(None, max_length=4000)
    advocate_involved: bool = False
    advocate_name: Optional[str] = Field(None, max_length=200)
    family_involved: bool = False
    family_notes: Optional[str] = Field(None, max_length=1000)
    review_date: Optional[str] = None


# ============================================================
# Wellbeing Observations
# ============================================================

MOOD_LEVELS = ("low", "flat", "stable", "positive", "agitated", "withdrawn")
INTAKE_LEVELS = ("none", "poor", "adequate", "good")
SLEEP_LEVELS = ("disturbed", "poor", "adequate", "good")


class WellbeingObservationIn(BaseModel):
    resident_id: str
    mood: Literal[MOOD_LEVELS] = "stable"  # type: ignore
    engagement: Optional[str] = Field(None, max_length=500)
    hydration_level: Literal[INTAKE_LEVELS] = "adequate"  # type: ignore
    nutrition_intake: Literal[INTAKE_LEVELS] = "adequate"  # type: ignore
    sleep_quality: Literal[SLEEP_LEVELS] = "adequate"  # type: ignore
    presentation: Optional[str] = Field(None, max_length=500)
    mental_health_concerns: Optional[str] = Field(None, max_length=2000)
    self_neglect_concerns: Optional[str] = Field(None, max_length=1000)
    social_interaction: Optional[str] = Field(None, max_length=500)
    deterioration_indicators: Optional[List[str]] = None
    notes: Optional[str] = Field(None, max_length=4000)


def is_deterioration(obs: dict) -> bool:
    """Quick rule — flag if any field signals concern."""
    if obs.get("mood") in ("low", "agitated", "withdrawn"):
        return True
    if obs.get("hydration_level") in ("none", "poor"):
        return True
    if obs.get("nutrition_intake") in ("none", "poor"):
        return True
    if obs.get("sleep_quality") in ("disturbed", "poor"):
        return True
    if obs.get("mental_health_concerns") or obs.get("self_neglect_concerns"):
        return True
    if obs.get("deterioration_indicators"):
        return True
    return False
