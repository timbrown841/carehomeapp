"""Realistic Adult Services demo seed — stress-tests workflows for CQC demos.

Seeds operationally realistic care tasks, falls, mobility, MCA, wellbeing,
appointments and incidents for the two seeded adult residents:
  - Tom Whitfield (adult_supported_living, MH/medication risks)
  - Margaret Lewis (elderly_residential, falls/mobility/MCA-fluctuating)

Designed to deliberately trigger:
  - Chronology activity (10+ events per resident across 7+ categories)
  - Pattern engine rules (falls_cluster, missed_care_tasks_rising, wellbeing_deterioration)
  - Operational widgets (care_tasks_due, care_tasks_missed_7d, falls_30d,
    mca_status fluctuating, wellbeing_14d with deterioration, mobility_risk high)
  - Manager sign-off backlog (unsigned MCA, unsigned recent fall)
  - CQC oversight indicators (capacity fluctuating, nutrition/sleep deterioration)

Idempotent: skipped entirely if Tom OR Margaret already have any adult-module
records (so it never duplicates on restart).
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


async def seed_adult_demo_if_empty(db) -> None:
    """Top-up adult-services demo data for Tom + Margaret if not already present."""
    tom = await db.residents.find_one(
        {"name": "Tom Whitfield"}, {"_id": 0, "id": 1, "name": 1}
    )
    maggie = await db.residents.find_one(
        {"name": "Margaret Lewis"}, {"_id": 0, "id": 1, "name": 1}
    )
    if not tom and not maggie:
        # Adult residents not seeded yet — nothing to do.
        return

    rids = [r["id"] for r in (tom, maggie) if r]

    # Idempotency guard: if either adult resident already has care tasks
    # OR wellbeing observations, assume the realistic demo has been seeded.
    existing_tasks = await db.care_tasks.count_documents({"resident_id": {"$in": rids}})
    existing_wb = await db.wellbeing_observations.count_documents({"resident_id": {"$in": rids}})
    if existing_tasks > 0 or existing_wb > 0:
        return

    staff_user = await db.users.find_one({"email": "staff@care.local"})
    senior_user = await db.users.find_one({"email": "senior@care.local"})
    manager_user = await db.users.find_one({"email": "manager@care.local"})
    if not (staff_user and manager_user):
        logger.warning("Adult demo seed skipped — staff/manager users missing.")
        return
    # Senior may not exist on very early datasets; fall back to manager.
    senior_user = senior_user or manager_user

    now = datetime.now(timezone.utc)
    logger.info("Seeding realistic Adult Services demo data for Tom &amp; Margaret…")

    if tom:
        await _seed_tom(db, tom["id"], now, staff_user, senior_user, manager_user)
    if maggie:
        await _seed_maggie(db, maggie["id"], now, staff_user, senior_user, manager_user)

    logger.info("Adult Services demo seed complete.")


# ---------------------------------------------------------------------------
# Tom Whitfield — adult_supported_living
# Scenario: medication non-compliance, mood deterioration, near-miss fall,
# missed/refused care tasks, upcoming CMHT review.
# ---------------------------------------------------------------------------
async def _seed_tom(db, rid: str, now: datetime, staff, senior, manager) -> None:
    today_at = lambda h, m=0: now.replace(hour=h, minute=m, second=0, microsecond=0)

    # --- Care tasks: today's schedule + last 7 days of missed/refused ---
    care_tasks = [
        # Today
        {
            "kind": "morning_routine", "title": "Morning routine prompt &amp; check-in",
            "due_at": today_at(8, 30), "status": "completed",
            "completed_at": today_at(8, 42), "completed_by_name": staff["name"],
            "notes": "Tom up and dressed independently. Brief chat about CMHT appointment tomorrow.",
            "support_minutes": 15,
        },
        {
            "kind": "medication_prompt", "title": "Morning medication prompt — Quetiapine + Sertraline",
            "due_at": today_at(9, 0), "status": "completed",
            "completed_at": today_at(9, 4), "completed_by_name": staff["name"],
            "notes": "Witnessed dose taken. Discussed importance of evening dose.",
            "support_minutes": 5,
        },
        {
            "kind": "welfare_check", "title": "Afternoon welfare check",
            "due_at": today_at(14, 0), "status": "pending",
            "support_minutes": 10,
        },
        {
            "kind": "medication_prompt", "title": "Evening medication prompt — Quetiapine",
            "due_at": today_at(21, 0), "status": "pending",
            "notes": "PROMPT NEEDED — Tom has missed last 2 evening doses.",
            "support_minutes": 5,
        },
        # Yesterday — refused evening med
        {
            "kind": "medication_prompt", "title": "Evening medication prompt — Quetiapine",
            "due_at": (now - timedelta(days=1)).replace(hour=21, minute=0, second=0, microsecond=0),
            "status": "refused",
            "completed_at": (now - timedelta(days=1)).replace(hour=21, minute=12, second=0),
            "completed_by_name": staff["name"],
            "refused_reason": "Said he wanted to stay out late with friends. Capacity intact at time of refusal.",
            "notes": "Escalated to manager. CMHT informed.",
        },
        # 3 days ago — missed community access (no transport cover)
        {
            "kind": "community_access", "title": "Supported shopping trip",
            "due_at": (now - timedelta(days=3)).replace(hour=11, minute=0, second=0, microsecond=0),
            "status": "missed",
            "completed_at": (now - timedelta(days=3)).replace(hour=13, minute=0, second=0),
            "completed_by_name": senior["name"],
            "refused_reason": "Staff cover unavailable. Rebooked for next week.",
            "notes": "Apologised to Tom. He was disappointed but understanding.",
        },
        # 4 days ago — missed medication prompt (Tom not at home)
        {
            "kind": "medication_prompt", "title": "Evening medication prompt — Quetiapine",
            "due_at": (now - timedelta(days=4)).replace(hour=21, minute=0, second=0, microsecond=0),
            "status": "missed",
            "completed_at": (now - timedelta(days=4)).replace(hour=23, minute=15, second=0),
            "completed_by_name": staff["name"],
            "refused_reason": "Tom not at flat at scheduled time. Returned 23:10. Dose given late.",
            "notes": "Late dose given. CMHT notified.",
        },
        # 5 days ago — refused meal support
        {
            "kind": "meal_support", "title": "Lunch preparation support",
            "due_at": (now - timedelta(days=5)).replace(hour=12, minute=30, second=0, microsecond=0),
            "status": "refused",
            "completed_at": (now - timedelta(days=5)).replace(hour=12, minute=40, second=0),
            "completed_by_name": staff["name"],
            "refused_reason": "Tom said he wasn't hungry. Ate later (toast, observed).",
            "notes": "Low mood noted. See wellbeing obs.",
        },
        # 6 days ago — missed welfare check (Tom didn't answer door)
        {
            "kind": "welfare_check", "title": "Afternoon welfare check",
            "due_at": (now - timedelta(days=6)).replace(hour=15, minute=0, second=0, microsecond=0),
            "status": "missed",
            "completed_at": (now - timedelta(days=6)).replace(hour=16, minute=30, second=0),
            "completed_by_name": staff["name"],
            "refused_reason": "Tom did not answer door at 15:00. Welfare-confirmed at 16:30 — sleeping.",
            "notes": "Concern flagged. CMHT informed of sleep disruption pattern.",
        },
        # 7 days ago — missed morning routine (overslept)
        {
            "kind": "morning_routine", "title": "Morning routine prompt",
            "due_at": (now - timedelta(days=7)).replace(hour=8, minute=30, second=0, microsecond=0),
            "status": "missed",
            "completed_at": (now - timedelta(days=7)).replace(hour=11, minute=0, second=0),
            "completed_by_name": staff["name"],
            "refused_reason": "Tom asleep. Did not respond to door knock at 8:30. Welfare-checked at 11:00 — fine, overslept.",
            "notes": "Sleep disruption — flagged on wellbeing obs.",
        },
    ]
    for t in care_tasks:
        doc = {
            "id": str(uuid.uuid4()),
            "resident_id": rid,
            "kind": t["kind"],
            "title": t["title"],
            "due_at": _iso(t["due_at"]),
            "notes": t.get("notes"),
            "support_minutes": t.get("support_minutes"),
            "status": t["status"],
            "created_at": _iso(t["due_at"] - timedelta(hours=1)),
            "created_by_id": senior["id"],
            "created_by_name": senior["name"],
            "completed_at": _iso(t["completed_at"]) if t.get("completed_at") else None,
            "completed_by_name": t.get("completed_by_name"),
            "refused_reason": t.get("refused_reason"),
        }
        await db.care_tasks.insert_one(doc)

    # --- Wellbeing observations — deterioration trend (5 obs over 12 days) ---
    wb_seed = [
        # 12 days ago — baseline stable
        {
            "at": now - timedelta(days=12),
            "mood": "stable", "hydration_level": "adequate", "nutrition_intake": "adequate",
            "sleep_quality": "adequate", "engagement": "Engaged in conversation, went to football match.",
            "presentation": "Well-presented, shaved, clean clothes.",
            "social_interaction": "Visited mother on weekend, positive contact.",
            "notes": "Settled day. Mood baseline for the week.",
        },
        # 9 days ago — flat mood, sleep starting to dip
        {
            "at": now - timedelta(days=9),
            "mood": "flat", "hydration_level": "adequate", "nutrition_intake": "adequate",
            "sleep_quality": "adequate", "engagement": "Quieter than usual. Declined offer of activity.",
            "presentation": "Slightly subdued.",
            "notes": "Tom reported feeling 'a bit off' — no specific trigger named.",
        },
        # 6 days ago — low mood, poor sleep — DETERIORATION
        {
            "at": now - timedelta(days=6),
            "mood": "low", "hydration_level": "adequate", "nutrition_intake": "poor",
            "sleep_quality": "poor", "engagement": "Stayed in flat most of the day.",
            "presentation": "Unshaven, same clothes as yesterday.",
            "mental_health_concerns": "Low mood persisting. Sleep disturbance reported — first warning sign of relapse per care plan.",
            "deterioration_indicators": ["sleep_disruption", "low_mood", "reduced_self_care"],
            "notes": "Care plan trigger: 'sleep is the earliest sign of relapse'. CMHT informed.",
        },
        # 3 days ago — withdrawn, disturbed sleep — DETERIORATION
        {
            "at": now - timedelta(days=3),
            "mood": "withdrawn", "hydration_level": "poor", "nutrition_intake": "poor",
            "sleep_quality": "disturbed",
            "engagement": "Did not answer door for 30 mins. Welfare check completed.",
            "presentation": "Self-neglect concerns — has not showered in 2 days.",
            "mental_health_concerns": "Withdrawn, not engaging. CMHT Care Coordinator notified by phone.",
            "self_neglect_concerns": "Skipping personal care. Flat untidy. Eating poorly.",
            "deterioration_indicators": ["withdrawal", "self_neglect", "sleep_disruption", "poor_intake"],
            "notes": "ESCALATED — CMHT review brought forward to tomorrow.",
        },
        # 1 day ago — low + poor nutrition — DETERIORATION
        {
            "at": now - timedelta(days=1),
            "mood": "low", "hydration_level": "poor", "nutrition_intake": "poor",
            "sleep_quality": "poor",
            "engagement": "Brief chat. Receptive to support today.",
            "presentation": "Showered after prompt. Slight improvement.",
            "mental_health_concerns": "Still low but engaging again. CMHT review tomorrow at 14:30.",
            "deterioration_indicators": ["low_mood", "poor_intake"],
            "notes": "Refused evening medication. Tomorrow's CMHT review is critical.",
        },
    ]
    for w in wb_seed:
        det = bool(
            w.get("mental_health_concerns")
            or w.get("self_neglect_concerns")
            or w.get("deterioration_indicators")
            or w["mood"] in ("low", "withdrawn", "agitated")
            or w["sleep_quality"] in ("poor", "disturbed")
            or w["nutrition_intake"] in ("poor", "none")
            or w["hydration_level"] in ("poor", "none")
        )
        doc = {
            "id": str(uuid.uuid4()),
            "resident_id": rid,
            "mood": w["mood"],
            "engagement": w.get("engagement"),
            "hydration_level": w["hydration_level"],
            "nutrition_intake": w["nutrition_intake"],
            "sleep_quality": w["sleep_quality"],
            "presentation": w.get("presentation"),
            "mental_health_concerns": w.get("mental_health_concerns"),
            "self_neglect_concerns": w.get("self_neglect_concerns"),
            "social_interaction": w.get("social_interaction"),
            "deterioration_indicators": w.get("deterioration_indicators"),
            "notes": w.get("notes"),
            "observed_at": _iso(w["at"]),
            "observer_name": staff["name"],
            "deterioration_flag": det,
            "created_at": _iso(w["at"]),
        }
        await db.wellbeing_observations.insert_one(doc)

    # --- Mobility assessment (low risk but flagged due to MH meds sedation) ---
    await db.mobility_assessments.insert_one({
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "mobility_level": "independent",
        "walking_aids": [],
        "transfer_support": "Independent. Monitor for medication-related drowsiness.",
        "falls_risk": "low",
        "moving_handling_needs": "No specific moving &amp; handling needs.",
        "equipment_required": [],
        "environmental_risks": "Stairwell — Tom occasionally reports dizziness after evening dose. Bathroom mat secured.",
        "staff_guidance": "Monitor for sedation post-evening dose (Quetiapine). Encourage water intake. Escalate to GP if balance affected.",
        "review_date": (now + timedelta(days=90)).date().isoformat(),
        "assessed_at": _iso(now - timedelta(days=20)),
        "assessor_name": senior["name"],
        "created_at": _iso(now - timedelta(days=20)),
    })

    # --- Near-miss fall (10 days ago, stairwell, no injury) ---
    await db.falls.insert_one({
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "occurred_at": _iso((now - timedelta(days=10)).replace(hour=22, minute=10)),
        "location": "Stairwell — between flat 4 and ground floor",
        "witnessed": True,
        "witness_name": staff["name"],
        "injury": "none",
        "injury_description": "No injury — Tom grabbed the rail. Reported feeling dizzy after evening medication.",
        "body_map_id": None,
        "hospital_involvement": "none",
        "equipment_involved": None,
        "action_taken": "Sat Tom down, water provided. GP informed next day. Encouraged taking evening dose seated.",
        "follow_up": "Mobility re-assessment scheduled. Discuss medication side-effects with CMHT.",
        "notes": "Near-miss — preventable. Linked to evening medication side-effect.",
        "reported_by_id": staff["id"],
        "reported_by_name": staff["name"],
        "created_at": _iso(now - timedelta(days=10)),
        "manager_signed_off_by": manager["name"],
        "manager_signed_off_at": _iso(now - timedelta(days=9)),
    })

    # --- MCA: Capacity to refuse evening medication (fluctuating) ---
    mca_id = str(uuid.uuid4())
    mca_at = _iso(now - timedelta(days=8))
    await db.mca_assessments.insert_one({
        "id": mca_id,
        "resident_id": rid,
        "decision_topic": "Capacity to refuse evening medication (Quetiapine)",
        "communication_needs": "Verbal communication. Allow processing time. Anxious presentation when discussing meds.",
        "can_understand": True,
        "can_retain": True,
        "can_weigh": False,
        "can_communicate": True,
        "capacity_outcome": "fluctuating",
        "best_interest_decision": "When capacity is intact: respect refusal but document and inform CMHT same shift. When capacity in doubt (post-relapse signs): offer dose with senior support; do not coerce. Capacity to be reassessed at every CMHT review.",
        "advocate_involved": True,
        "advocate_name": "Voiceability — Lara Donovan",
        "family_involved": True,
        "family_notes": "Mother (Linda) aware. Supportive of fluctuating-capacity approach.",
        "review_date": (now + timedelta(days=14)).date().isoformat(),
        "assessed_at": mca_at,
        "assessor_name": senior["name"],
        "manager_signed_off_by": None,
        "manager_signed_off_at": None,
        "created_at": mca_at,
    })
    # Reflect onto resident record so AlertsAndRisks reads it
    await db.residents.update_one(
        {"id": rid},
        {"$set": {"capacity_status": "fluctuating", "capacity_status_at": mca_at}},
    )

    # --- Upcoming + past health appointments ---
    appts = [
        # Tomorrow — CMHT review (escalated)
        {
            "kind": "psychiatry", "title": "CMHT review — escalated (mood deterioration)",
            "date": (now + timedelta(days=1)).date().isoformat(), "time": "14:30",
            "location": "Manchester CMHT, Hulme", "with_whom": "Sam Patel (Care Coordinator)",
            "status": "scheduled",
            "notes": "Brought forward — mood deterioration, medication refusals. Tom to attend with key worker.",
        },
        # 14 days ago — GP follow-up (attended)
        {
            "kind": "gp", "title": "GP — medication review (Quetiapine side-effects)",
            "date": (now - timedelta(days=14)).date().isoformat(), "time": "10:00",
            "location": "Hulme Family Practice", "with_whom": "Dr Roberts",
            "status": "attended",
            "notes": "Quetiapine dose unchanged. Discussed evening sedation. GP advised hydration.",
        },
        # In 10 days — annual physical health check
        {
            "kind": "lac_nurse", "title": "Annual physical health check",
            "date": (now + timedelta(days=10)).date().isoformat(), "time": "11:00",
            "location": "Hulme Family Practice", "with_whom": "Practice Nurse",
            "status": "scheduled",
        },
    ]
    for a in appts:
        await db.health_appointments.insert_one({
            "id": str(uuid.uuid4()),
            "resident_id": rid,
            "kind": a["kind"],
            "title": a["title"],
            "date": a["date"],
            "time": a["time"],
            "location": a["location"],
            "with_whom": a["with_whom"],
            "status": a["status"],
            "notes": a.get("notes"),
            "follow_up": None,
            "created_at": _iso(now - timedelta(days=14)),
            "created_by_name": manager["name"],
        })


# ---------------------------------------------------------------------------
# Margaret Lewis — elderly_residential
# Scenario: recurring care routines, 2 falls (cluster), high mobility risk,
# fluctuating MCA on hygiene, nutrition + sleep concerns.
# ---------------------------------------------------------------------------
async def _seed_maggie(db, rid: str, now: datetime, staff, senior, manager) -> None:
    today_at = lambda h, m=0: now.replace(hour=h, minute=m, second=0, microsecond=0)

    # --- Care tasks: today's recurring routines + last 7 days ---
    care_tasks = []

    # Today's 4 routine tasks
    today_tasks = [
        ("morning_routine", "Morning routine — wash, dress, breakfast", 8, 0, "completed", staff["name"],
         "Maggie compliant this morning. Used walking frame. Ate toast and tea.", 30),
        ("personal_care", "Continence care &amp; personal hygiene", 8, 30, "completed", staff["name"],
         "Two-staff support. Maggie compliant today. Skin checked — intact.", 25),
        ("hygiene_support", "Mid-morning hygiene support (handwashing prompt)", 11, 0, "pending", None, None, 10),
        ("evening_routine", "Evening routine — bedtime support, medication, falls sensor check", 19, 30, "pending", None,
         "REMINDER: Check falls sensor mat is plugged in.", 30),
    ]
    for kind, title, h, m, status, who, note, mins in today_tasks:
        care_tasks.append({
            "kind": kind, "title": title, "due_at": today_at(h, m),
            "status": status, "completed_by_name": who,
            "completed_at": today_at(h, m + 8) if status == "completed" else None,
            "notes": note, "support_minutes": mins,
        })

    # Last 7 days — recurring routines (mostly completed) + 3 refusals
    for d in range(1, 8):
        day = now - timedelta(days=d)
        for kind, title, h, m, mins in [
            ("morning_routine", "Morning routine — wash, dress, breakfast", 8, 0, 30),
            ("personal_care", "Continence care &amp; personal hygiene", 8, 30, 25),
            ("evening_routine", "Evening routine — bedtime support, medication", 19, 30, 30),
        ]:
            # Inject 3 personal_care refusals over the last 7 days (days 2, 4, 6)
            if kind == "personal_care" and d in (2, 4, 6):
                care_tasks.append({
                    "kind": kind, "title": title,
                    "due_at": day.replace(hour=h, minute=m, second=0, microsecond=0),
                    "status": "refused",
                    "completed_at": day.replace(hour=h, minute=m + 20, second=0),
                    "completed_by_name": staff["name"],
                    "refused_reason": "Maggie declined personal care. Said 'I'm fine, leave me be.' Documented per MCA fluctuating capacity plan.",
                    "notes": "MCA-informed approach: offered, not coerced. Re-offered 2hrs later — accepted on day 2.",
                    "support_minutes": mins,
                })
            else:
                care_tasks.append({
                    "kind": kind, "title": title,
                    "due_at": day.replace(hour=h, minute=m, second=0, microsecond=0),
                    "status": "completed",
                    "completed_at": day.replace(hour=h, minute=m + 10, second=0),
                    "completed_by_name": staff["name"] if d % 2 else senior["name"],
                    "notes": None, "support_minutes": mins,
                })

    for t in care_tasks:
        doc = {
            "id": str(uuid.uuid4()),
            "resident_id": rid,
            "kind": t["kind"],
            "title": t["title"],
            "due_at": _iso(t["due_at"]),
            "notes": t.get("notes"),
            "support_minutes": t.get("support_minutes"),
            "status": t["status"],
            "created_at": _iso(t["due_at"] - timedelta(hours=1)),
            "created_by_id": senior["id"],
            "created_by_name": senior["name"],
            "completed_at": _iso(t["completed_at"]) if t.get("completed_at") else None,
            "completed_by_name": t.get("completed_by_name"),
            "refused_reason": t.get("refused_reason"),
        }
        await db.care_tasks.insert_one(doc)

    # --- Falls register: 2 falls in 30 days (triggers cluster pattern) ---
    fall_1_at = (now - timedelta(days=22)).replace(hour=7, minute=20)
    await db.falls.insert_one({
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "occurred_at": _iso(fall_1_at),
        "location": "Bathroom — reaching for toothbrush",
        "witnessed": True,
        "witness_name": staff["name"],
        "injury": "minor",
        "injury_description": "Skin tear on left forearm (3cm). Bruising to left hip — no fracture suspected.",
        "body_map_id": None,
        "hospital_involvement": "none",
        "equipment_involved": "Walking frame was within reach but not used (rushed).",
        "action_taken": "First aid administered. Bruising photographed. GP informed. Falls assessment re-reviewed.",
        "follow_up": "Bathroom grab-rails install booked. PT informed.",
        "notes": "Maggie said she 'forgot' the frame. Capacity intact at time. Reminded to use frame at all times.",
        "reported_by_id": staff["id"],
        "reported_by_name": staff["name"],
        "created_at": _iso(fall_1_at),
        "manager_signed_off_by": manager["name"],
        "manager_signed_off_at": _iso(fall_1_at + timedelta(hours=18)),
    })

    fall_2_at = (now - timedelta(days=8)).replace(hour=2, minute=45)
    await db.falls.insert_one({
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "occurred_at": _iso(fall_2_at),
        "location": "Bedroom — getting up to use the toilet, unwitnessed",
        "witnessed": False,
        "witness_name": None,
        "injury": "moderate",
        "injury_description": "Bruised right hip (haematoma 8x6cm). Skin intact. Painful weight-bearing.",
        "body_map_id": None,
        "hospital_involvement": "a_and_e",
        "equipment_involved": "Falls sensor mat triggered alarm — staff on scene within 90s.",
        "action_taken": "999 called. Maggie taken to A&amp;E by ambulance. X-ray clear — no fracture. Returned same day.",
        "follow_up": "Orthopaedic review booked. PT to reassess weight-bearing. Night-time toileting plan in place. Two-staff transfers at night.",
        "notes": "Second fall in 30 days. Pattern of getting up unaided overnight. MCA assessment on bed-rail consent in progress.",
        "reported_by_id": senior["id"],
        "reported_by_name": senior["name"],
        "created_at": _iso(fall_2_at),
        # Intentionally NOT signed off — manager action visible on dashboard
        "manager_signed_off_by": None,
        "manager_signed_off_at": None,
    })

    # --- Mobility assessment: walking_aid, falls_risk HIGH ---
    await db.mobility_assessments.insert_one({
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "mobility_level": "walking_aid",
        "walking_aids": ["walking frame", "perching stool"],
        "transfer_support": "TWO STAFF for bath transfers (hoist required). One-staff for chair-to-bed daytime. Cannot be left unsupervised when standing.",
        "falls_risk": "high",
        "moving_handling_needs": "Hoist (mobile, sling size M) for bath. Walking frame at all transfers. Perching stool in kitchen.",
        "equipment_required": [
            "walking frame", "perching stool", "bed rails (assessed via MCA)",
            "falls sensor mat", "raised toilet seat", "grab rails (en-suite)", "hoist (M sling)",
        ],
        "environmental_risks": "Bedroom rug removed. Bathroom grab-rails installed last week. Night-light fitted.",
        "staff_guidance": "Two-staff bath transfers. Maggie MUST use walking frame at all transfers (verbal reminder every time). Falls sensor mat checked at handover. PT visits Mon &amp; Thu.",
        "review_date": (now + timedelta(days=30)).date().isoformat(),
        "assessed_at": _iso(now - timedelta(days=7)),
        "assessor_name": senior["name"],
        "created_at": _iso(now - timedelta(days=7)),
    })

    # --- MCA assessments ---
    # 1) Bed rails consent — signed off, has_capacity
    await db.mca_assessments.insert_one({
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "decision_topic": "Consent to bed rails &amp; falls sensor mat in bedroom",
        "communication_needs": "Hearing aid in. Speak clearly facing her. Allow processing time.",
        "can_understand": True,
        "can_retain": True,
        "can_weigh": True,
        "can_communicate": True,
        "capacity_outcome": "has_capacity",
        "best_interest_decision": None,
        "advocate_involved": False,
        "family_involved": True,
        "family_notes": "Son (James) informed. Supportive.",
        "review_date": (now + timedelta(days=60)).date().isoformat(),
        "assessed_at": _iso(now - timedelta(days=60)),
        "assessor_name": senior["name"],
        "manager_signed_off_by": manager["name"],
        "manager_signed_off_at": _iso(now - timedelta(days=59)),
        "created_at": _iso(now - timedelta(days=60)),
    })

    # 2) Capacity to refuse personal care — fluctuating, NOT signed off
    mca2_at = _iso(now - timedelta(days=14))
    await db.mca_assessments.insert_one({
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "decision_topic": "Capacity to refuse personal care &amp; hygiene support",
        "communication_needs": "Hearing aid. Allow processing time. Better engagement in mornings.",
        "can_understand": True,
        "can_retain": False,
        "can_weigh": False,
        "can_communicate": True,
        "capacity_outcome": "fluctuating",
        "best_interest_decision": "When Maggie refuses personal care: do NOT coerce. Document refusal. Re-offer within 2 hours when calm. Two-staff approach reduces resistance. Daily skin checks remain mandatory regardless of refusal — explained as 'a quick safety check'. Capacity to be re-assessed monthly.",
        "advocate_involved": True,
        "advocate_name": "Voiceability — Lara Donovan",
        "family_involved": True,
        "family_notes": "James (son) consulted. Comfortable with fluctuating-capacity care plan.",
        "review_date": (now + timedelta(days=16)).date().isoformat(),
        "assessed_at": mca2_at,
        "assessor_name": senior["name"],
        "manager_signed_off_by": None,
        "manager_signed_off_at": None,
        "created_at": mca2_at,
    })
    await db.residents.update_one(
        {"id": rid},
        {"$set": {"capacity_status": "fluctuating", "capacity_status_at": mca2_at}},
    )

    # --- Wellbeing observations across 10 days (nutrition + sleep concerns) ---
    wb_seed = [
        # 10 days ago
        {"at": now - timedelta(days=10), "mood": "stable", "hydration": "adequate",
         "nutrition": "adequate", "sleep": "disturbed",
         "engagement": "Pleasant. Watched TV in lounge.",
         "presentation": "Tidy. Hair brushed.",
         "notes": "Up twice in the night — toileting. Falls sensor triggered both times."},
        # 8 days ago — night of the 2nd fall
        {"at": now - timedelta(days=8) + timedelta(hours=10), "mood": "flat",
         "hydration": "adequate", "nutrition": "poor", "sleep": "disturbed",
         "engagement": "Quiet after A&amp;E visit. Sore.",
         "presentation": "Tired. Bruising visible.",
         "mental_health_concerns": "Shaken by fall. Reassured.",
         "deterioration_indicators": ["post_fall", "poor_intake"],
         "notes": "Returned from A&amp;E this morning. Refused lunch."},
        # 6 days ago
        {"at": now - timedelta(days=6), "mood": "stable", "hydration": "adequate",
         "nutrition": "poor", "sleep": "poor",
         "engagement": "Joined music activity briefly.",
         "presentation": "Tidy.",
         "deterioration_indicators": ["poor_intake", "poor_sleep"],
         "notes": "Ate only half of meals. Weight check booked."},
        # 4 days ago — agitated (DETERIORATION)
        {"at": now - timedelta(days=4), "mood": "agitated", "hydration": "poor",
         "nutrition": "poor", "sleep": "disturbed",
         "engagement": "Resistive at personal care. Calmer after distraction.",
         "presentation": "Hair unbrushed (refused).",
         "mental_health_concerns": "Frustrated about reduced independence. Discussed with son.",
         "deterioration_indicators": ["agitation", "poor_intake", "poor_sleep"],
         "notes": "Personal care refused. Re-offered later, accepted."},
        # 2 days ago
        {"at": now - timedelta(days=2), "mood": "stable", "hydration": "adequate",
         "nutrition": "adequate", "sleep": "adequate",
         "engagement": "Lovely chat about her grandchildren.",
         "presentation": "Hair done. Tidy.",
         "notes": "Brighter day. Encouraged."},
        # Today
        {"at": now - timedelta(hours=2), "mood": "stable", "hydration": "adequate",
         "nutrition": "adequate", "sleep": "poor",
         "engagement": "Took part in morning quiz.",
         "presentation": "Walking frame used correctly.",
         "deterioration_indicators": ["poor_sleep"],
         "notes": "Awake from 03:00. Tired this afternoon. Night-time review scheduled."},
    ]
    for w in wb_seed:
        det = bool(
            w.get("mental_health_concerns") or w.get("deterioration_indicators")
            or w["mood"] in ("low", "withdrawn", "agitated")
            or w["sleep"] in ("poor", "disturbed")
            or w["nutrition"] in ("poor", "none")
            or w["hydration"] in ("poor", "none")
        )
        doc = {
            "id": str(uuid.uuid4()),
            "resident_id": rid,
            "mood": w["mood"],
            "engagement": w.get("engagement"),
            "hydration_level": w["hydration"],
            "nutrition_intake": w["nutrition"],
            "sleep_quality": w["sleep"],
            "presentation": w.get("presentation"),
            "mental_health_concerns": w.get("mental_health_concerns"),
            "self_neglect_concerns": None,
            "social_interaction": None,
            "deterioration_indicators": w.get("deterioration_indicators"),
            "notes": w.get("notes"),
            "observed_at": _iso(w["at"]),
            "observer_name": staff["name"],
            "deterioration_flag": det,
            "created_at": _iso(w["at"]),
        }
        await db.wellbeing_observations.insert_one(doc)

    # --- Health appointments — past attended + upcoming ---
    appts = [
        # 15 days ago — GP follow-up after first fall (attended)
        {"kind": "gp", "title": "GP follow-up — post-fall review",
         "date": (now - timedelta(days=15)).date().isoformat(), "time": "10:00",
         "location": "Withington Community Practice", "with_whom": "Dr Mason",
         "status": "attended",
         "notes": "Bruising healing. Falls risk discussed. PT referral made."},
        # 10 days ago — physio (attended)
        {"kind": "physio", "title": "Physiotherapy — strength &amp; balance",
         "date": (now - timedelta(days=10)).date().isoformat(), "time": "14:00",
         "location": "Manchester Royal Physiotherapy", "with_whom": "Olivia Tan (PT)",
         "status": "attended",
         "notes": "Tolerated 25 mins. Home programme issued — sit-to-stand x10, daily."},
        # 8 days ago — A&E (attended, after 2nd fall)
        {"kind": "hospital", "title": "A&amp;E attendance — post-fall (right hip)",
         "date": (now - timedelta(days=8)).date().isoformat(), "time": "03:30",
         "location": "Manchester Royal Infirmary — A&amp;E", "with_whom": "ED Consultant",
         "status": "attended",
         "notes": "X-ray clear. Discharged same day. Orthopaedic OPD referral made."},
        # In 3 days — physio
        {"kind": "physio", "title": "Physiotherapy — falls-prevention review",
         "date": (now + timedelta(days=3)).date().isoformat(), "time": "14:00",
         "location": "Manchester Royal Physiotherapy", "with_whom": "Olivia Tan (PT)",
         "status": "scheduled"},
        # In 9 days — orthopaedic
        {"kind": "hospital", "title": "Orthopaedic OPD — post-fall review",
         "date": (now + timedelta(days=9)).date().isoformat(), "time": "11:15",
         "location": "Manchester Royal Infirmary — Ortho OPD", "with_whom": "Mr Ahmed (Consultant)",
         "status": "scheduled",
         "notes": "Bring discharge letter from A&amp;E. Two-staff escort. Wheelchair transport booked."},
    ]
    for a in appts:
        await db.health_appointments.insert_one({
            "id": str(uuid.uuid4()),
            "resident_id": rid,
            "kind": a["kind"],
            "title": a["title"],
            "date": a["date"],
            "time": a["time"],
            "location": a["location"],
            "with_whom": a["with_whom"],
            "status": a["status"],
            "notes": a.get("notes"),
            "follow_up": None,
            "created_at": _iso(now - timedelta(days=20)),
            "created_by_name": manager["name"],
        })
