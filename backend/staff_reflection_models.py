"""Staff Reflective Practice & Wellbeing Hub — Pydantic models.

Privacy model (hybrid):
  • Wellbeing emoji check-ins → ALWAYS visible to manager+ as anonymised trend
    data and team-aggregate wellbeing awareness; staff name is shown only to
    the staff member themselves and to manager+ on their own supervision view.
  • Reflections (shift/win/guided) → PRIVATE by default. Staff toggles
    `shared_with_manager=true` per entry when they want it visible for
    supervision preparation.

Endpoints enforce this — no staff can read another staff's reflections.
"""
from datetime import datetime, timezone
from typing import Optional, List, Literal, Dict
from pydantic import BaseModel, Field


# ============================================================
# Wellbeing emoji check-in
# ============================================================

MOOD_CHECKINS = ("overwhelmed", "stressed", "okay", "positive", "confident")
SHIFT_CONTEXTS = ("start_of_shift", "during_shift", "after_shift", "off_shift")

MOOD_META = {
    "overwhelmed": {"emoji": "😞", "label": "Overwhelmed", "tone": "#A8273A", "score": 1},
    "stressed":    {"emoji": "😣", "label": "Stressed",    "tone": "#C9762E", "score": 2},
    "okay":        {"emoji": "😐", "label": "Okay",         "tone": "#7A6A4F", "score": 3},
    "positive":    {"emoji": "🙂", "label": "Positive",     "tone": "#2F6A3A", "score": 4},
    "confident":   {"emoji": "💪", "label": "Confident",    "tone": "#0E3B4A", "score": 5},
}


class WellbeingCheckinIn(BaseModel):
    mood: Literal[MOOD_CHECKINS] = "okay"  # type: ignore
    shift_context: Literal[SHIFT_CONTEXTS] = "after_shift"  # type: ignore
    note: Optional[str] = Field(None, max_length=280)


# ============================================================
# Reflections — shift reflection, wins, guided practice
# ============================================================

REFLECTION_KINDS = ("shift_reflection", "win", "guided")

# Guided reflection prompt sets
PROMPT_SETS = {
    "shift_reflection": {
        "label": "Shift reflection",
        "subtitle": "A simple end-of-shift check-in. Skip any prompt that doesn't fit.",
        "prompts": [
            {"id": "feel", "label": "How did your shift feel today?"},
            {"id": "went_well", "label": "What went well?"},
            {"id": "challenging", "label": "What was challenging?"},
            {"id": "emotional", "label": "Did anything emotionally impact you?"},
            {"id": "supported", "label": "Do you feel supported?"},
            {"id": "manager_aware", "label": "Anything management should be aware of?"},
            {"id": "proud", "label": "What are you proud of from today?"},
        ],
    },
    "gibbs": {
        "label": "Gibbs reflective cycle",
        "subtitle": "Classic 6-stage reflection. Useful after a significant event or incident.",
        "prompts": [
            {"id": "description", "label": "Description — what happened?"},
            {"id": "feelings", "label": "Feelings — what were you thinking and feeling?"},
            {"id": "evaluation", "label": "Evaluation — what was good and bad about the experience?"},
            {"id": "analysis", "label": "Analysis — what sense can you make of the situation?"},
            {"id": "conclusion", "label": "Conclusion — what else could you have done?"},
            {"id": "action_plan", "label": "Action plan — if it arose again, what would you do?"},
        ],
    },
    "trauma_informed": {
        "label": "Trauma-informed reflection",
        "subtitle": "Pause and reflect through a trauma-informed lens — safety, trust, voice.",
        "prompts": [
            {"id": "safety", "label": "Was the young person / resident kept feeling physically & emotionally safe?"},
            {"id": "trust", "label": "How did your response build (or strain) trust?"},
            {"id": "voice", "label": "Was their voice heard and respected?"},
            {"id": "behaviour_as_communication", "label": "What might their behaviour have been communicating?"},
            {"id": "your_reaction", "label": "What was activated for YOU? (your own response matters)"},
            {"id": "support_needed", "label": "What support, debrief, or supervision would help?"},
        ],
    },
    "restorative": {
        "label": "Restorative reflection",
        "subtitle": "When a relationship rupture or conflict occurred — repair-focused.",
        "prompts": [
            {"id": "what_happened", "label": "What happened? (just facts)"},
            {"id": "who_affected", "label": "Who was affected and how?"},
            {"id": "needs", "label": "What needs aren't being met?"},
            {"id": "repair", "label": "What could repair this?"},
            {"id": "your_part", "label": "What is your part in moving forward?"},
        ],
    },
    "learning_from_incident": {
        "label": "Learning from incident",
        "subtitle": "Post-incident reflection — non-blame, learning-oriented.",
        "prompts": [
            {"id": "antecedents", "label": "What was happening BEFORE the incident?"},
            {"id": "during", "label": "What happened during?"},
            {"id": "response", "label": "How did you respond? (what worked, what didn't)"},
            {"id": "team_support", "label": "How did the team support each other?"},
            {"id": "learning", "label": "What did you learn about the young person / resident?"},
            {"id": "next_time", "label": "What might you try next time?"},
        ],
    },
}


class ReflectionIn(BaseModel):
    kind: Literal[REFLECTION_KINDS] = "shift_reflection"  # type: ignore
    prompt_set: Optional[str] = None  # one of PROMPT_SETS keys (or None for free-form / wins)
    title: Optional[str] = Field(None, max_length=200)
    body: Optional[str] = Field(None, max_length=8000)  # free-form text
    responses: Optional[Dict[str, str]] = None  # {prompt_id: response_text} when prompt_set used
    shared_with_manager: bool = False
    tags: Optional[List[str]] = None  # ["safeguarding", "first_aid", "incident", etc.]


class ReflectionUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    body: Optional[str] = Field(None, max_length=8000)
    responses: Optional[Dict[str, str]] = None
    shared_with_manager: Optional[bool] = None
    tags: Optional[List[str]] = None
