from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, field_validator

from emergentintegrations.llm.openai import OpenAISpeechToText
from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi.responses import StreamingResponse, Response
from contextlib import asynccontextmanager

from pdf_builder import build_incident_pdf, build_report_pdf
from missing_pack_pdf import build_missing_pack_pdf
from mar_pdf import build_mar_pdf
from inspection_bundle_pdf import build_inspection_bundle_pdf
from notifications_service import send_email, send_sms, recipient_for
import secrets as _secrets


# ---------- Setup ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# Login lockout policy
LOCKOUT_MAX_ATTEMPTS = 5
LOCKOUT_WINDOW_MINUTES = 15
LOCKOUT_DURATION_MINUTES = 15


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # ---- startup ----
    await db.users.create_index("email", unique=True)
    await db.residents.create_index("created_at")
    await db.notes.create_index([("resident_id", 1), ("created_at", -1)])
    await db.incidents.create_index([("resident_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("recipient_role", 1), ("created_at", -1)])
    await db.supervisions.create_index([("staff_id", 1), ("completed_at", -1)])
    await db.login_attempts.create_index("email")
    await db.missing_episodes.create_index([("resident_id", 1), ("reported_at", -1)])
    await db.missing_episodes.create_index("share_token", unique=True, sparse=True)
    await db.medications.create_index([("resident_id", 1), ("active", -1)])
    await db.medication_admins.create_index([("medication_id", 1), ("scheduled_at", -1)])
    await db.medication_admins.create_index([("resident_id", 1), ("scheduled_at", -1)])
    await db.body_maps.create_index([("resident_id", 1), ("recorded_at", -1)])
    await db.health_appointments.create_index([("resident_id", 1), ("date", -1)])
    await db.health_observations.create_index([("resident_id", 1), ("recorded_at", -1)])
    await db.immunisations.create_index([("resident_id", 1), ("date_given", -1)])
    await db.education_records.create_index("resident_id", unique=True, sparse=True)
    await db.shifts.create_index([("start_at", 1), ("end_at", 1)])
    await db.trainings.create_index([("staff_id", 1), ("expires_on", 1)])
    await db.statutory_visits.create_index([("resident_id", 1), ("scheduled_for", -1)])
    await db.statutory_visits.create_index("status")

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@care.local").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one(
            {
                "id": str(uuid.uuid4()),
                "email": admin_email,
                "password_hash": hash_password(admin_password),
                "name": "Admin",
                "role": "admin",
                "created_at": now_iso(),
            }
        )
        logger.info(f"Seeded admin user: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )

    for email, name, role, pwd in [
        ("manager@care.local", "Sarah Manager", "manager", "Manager@123"),
        ("staff@care.local", "Alex Staff", "staff", "Staff@123"),
        ("james@care.local", "James Patel", "staff", "Staff@123"),
    ]:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "email": email,
                    "password_hash": hash_password(pwd),
                    "name": name,
                    "role": role,
                    "created_at": now_iso(),
                }
            )

    await _seed_demo_data_if_empty()

    yield
    # ---- shutdown ----
    client.close()


async def _seed_demo_data_if_empty():
    """Populate a realistic demo dataset on first run."""
    # If any resident is missing the rich profile fields (e.g. legal_status),
    # treat data as stale demo data and rebuild.
    sample = await db.residents.find_one({}, {"_id": 0, "legal_status": 1})
    fully_seeded = (await db.residents.count_documents({}) > 0) and sample and sample.get("legal_status")
    has_meds = await db.medications.count_documents({}) > 0
    has_health = await db.health_appointments.count_documents({}) > 0
    has_edu = await db.education_records.count_documents({}) > 0
    has_shifts = await db.shifts.count_documents({}) > 0
    has_train = await db.trainings.count_documents({}) > 0
    has_visits = await db.statutory_visits.count_documents({}) > 0
    has_pm = await db.pocket_money_accounts.count_documents({}) > 0
    if fully_seeded and has_meds and has_health and has_edu and has_shifts and has_train and has_visits and has_pm:
        return
    if fully_seeded:
        # Profiles exist but new modules missing — top up only.
        await _seed_meds_and_bodymaps()
        return
    if await db.residents.count_documents({}) > 0:
        logger.info("Stale demo residents detected — clearing care collections to reseed full profiles.")
        await db.residents.delete_many({})
        await db.notes.delete_many({})
        await db.incidents.delete_many({})
        await db.missing_episodes.delete_many({})
        await db.supervisions.delete_many({})
        await db.reports.delete_many({})
        await db.notifications.delete_many({})
        await db.medications.delete_many({})
        await db.medication_admins.delete_many({})
        await db.body_maps.delete_many({})
        await db.health_appointments.delete_many({})
        await db.health_observations.delete_many({})
        await db.immunisations.delete_many({})
        await db.education_records.delete_many({})
        await db.shifts.delete_many({})
        await db.trainings.delete_many({})
    logger.info("Seeding demo data…")

    staff_user = await db.users.find_one({"email": "staff@care.local"})
    james = await db.users.find_one({"email": "james@care.local"})
    manager_user = await db.users.find_one({"email": "manager@care.local"})

    residents = [
        {
            "name": "Jordan Reilly",
            "preferred_name": "Jordy",
            "dob": "2010-03-14",
            "room": "1A",
            "gender": "Male",
            "placement_date": "2023-04-12",
            "legal_status": "Section 20 (voluntary accommodation)",
            "social_worker_name": "Priya Shah",
            "social_worker_contact": "07700 900111 · priya.shah@la.gov.uk",
            "local_authority": "Manchester City Council",
            "key_worker": "Alex Staff",
            "placement_summary": "Long-term placement, settled. Likes football and art.",
            "risk_level": "low",
            "notes": "Likes football and art. Long-term placement.",
            "referral_reason": "Family breakdown following parental ill-health.",
            "placement_history": "Two short-term foster placements (2021-22) before current home.",
            "family_background": "Mother in recovery; supervised contact monthly. No paternal contact.",
            "education_background": "Year 9, mainstream secondary. Reading age slightly below peers.",
            "trauma_history": "Witnessed domestic conflict aged 6-9.",
            "professional_involvement": "CAMHS — discharged 2024. School counsellor weekly.",
            "presenting_needs": "Needs predictability, anxious about contact visits.",
            "risks": {
                "self_harm": "None known",
                "absconding": "Low — has not absconded",
                "aggression": "Low — verbal only when frustrated",
                "substance": "None",
                "cse": "None known",
                "mental_health": "Mild anxiety",
                "medical": "Asthma",
            },
            "risk_triggers": ["Contact-visit anxiety", "Loud or chaotic environments"],
            "protective_factors": ["Strong relationship with key worker", "Loves football team"],
            "risk_management": "Reassure 24h before contact visits; quiet wind-down routine post-school.",
            "risk_last_reviewed": "2026-01-14",
            "risk_next_review": "2026-04-14",
            "emotional_support": "Daily 10-min check-ins with key worker.",
            "behaviour_strategies": "Use 'name it to tame it' for anger; quiet space available.",
            "education_support": "Reading catch-up programme; meet SENCo termly.",
            "health_needs": "Asthma — preventer + reliever inhalers, peak-flow weekly.",
            "independence_skills": "Cooking once a week, money management age-appropriate.",
            "contact_arrangements": "Mum: supervised, monthly, 1 hour at family centre.",
            "goals_outcomes": "Keep mainstream education; gain Bronze Duke of Edinburgh.",
            "staff_guidance": "Avoid surprises before contact days. Praise specific actions.",
            "height": "5'2\"",
            "build": "Slim",
            "hair": "Brown, short",
            "eyes": "Hazel",
            "distinguishing_marks": "Small scar above left eyebrow",
            "usual_clothing": "Football tracksuits, Adidas trainers",
            "phone": "07700 900221",
            "known_locations": ["Local park (skate area)", "Football club Mon/Wed evenings"],
            "known_associates": ["Tom (school friend, Year 9)", "Riley (cousin)"],
            "family_contacts": ["Mum — Lisa Reilly · 07700 900112 (supervised contact only)"],
            "missing_triggers": ["Conflict with peers", "Disappointing news from contact"],
            "safety_plan": "If missing: contact football club, then school friends. Strong return record.",
            "medical": {
                "nhs_number": "401 020 3045",
                "gp": "Dr A. Roberts, Northern Family Practice · 0161 555 0123",
                "allergies": "Peanuts (mild)",
                "diagnoses": "Asthma",
                "current_medication": "Salbutamol PRN, Beclometasone preventer 100mcg AM/PM",
                "prn": "Antihistamine for peanut exposure",
                "schedule": "Inhalers AM/PM",
                "conditions": "Asthma — well controlled",
                "emergency_notes": "Carry inhaler at all times. Antihistamine in first-aid box.",
                "appointments": "Annual asthma review · April 2026",
            },
            "emergency_contacts": [
                {"name": "Priya Shah (Social Worker)", "relation": "LA", "phone": "07700 900111"},
                {"name": "Manchester EDT", "relation": "Out-of-hours", "phone": "0161 234 5001"},
            ],
        },
        {
            "name": "Aisha Khan",
            "preferred_name": "Aisha",
            "dob": "2009-11-02",
            "room": "2B",
            "gender": "Female",
            "placement_date": "2024-09-03",
            "legal_status": "Care Order (Section 31)",
            "social_worker_name": "Marcus Wright",
            "social_worker_contact": "07700 900113 · marcus.wright@la.gov.uk",
            "local_authority": "Manchester City Council",
            "key_worker": "James Patel",
            "placement_summary": "Recent placement; settling. Strong academic ability.",
            "risk_level": "high",
            "notes": "Strong academic interests, anxious in groups.",
            "referral_reason": "Safeguarding — historic neglect and emotional abuse.",
            "placement_history": "One previous residential placement (6 months).",
            "family_background": "Estranged from mother. Letterbox contact only.",
            "education_background": "Year 10, A* / A predicted. Strong in sciences.",
            "trauma_history": "Historic self-harm. Disclosure made Feb 2026.",
            "professional_involvement": "CAMHS active. School ELSA support.",
            "presenting_needs": "Trust-building; anxiety in unstructured social settings.",
            "risks": {
                "self_harm": "Active concern — historical, monitored",
                "absconding": "Low",
                "aggression": "None",
                "substance": "None known",
                "cse": "Low — online safety reviewed",
                "mental_health": "Anxiety + low mood",
                "medical": "None",
            },
            "risk_triggers": ["Unstructured group settings", "Reminders of birth family"],
            "protective_factors": ["Trust in James (key worker)", "Academic engagement"],
            "risk_management": "Daily check-ins. CAMHS clinical review monthly. Sharps audit weekly.",
            "risk_last_reviewed": "2026-02-01",
            "risk_next_review": "2026-03-01",
            "emotional_support": "1:1 sessions with key worker 3x/week.",
            "behaviour_strategies": "Validate emotions; offer regulated activities (art, journaling).",
            "education_support": "Quiet study space; mentor for university aspirations.",
            "health_needs": "CAMHS therapy ongoing.",
            "independence_skills": "Strong — focus on emotional independence.",
            "contact_arrangements": "Letterbox via LA, twice yearly.",
            "goals_outcomes": "Sit GCSEs; emotional regulation toolkit; supportive transition planning.",
            "staff_guidance": "Always offer choice. Watch for withdrawn periods after letterbox.",
            "height": "5'5\"",
            "build": "Slim",
            "hair": "Black, long",
            "eyes": "Dark brown",
            "distinguishing_marks": "—",
            "usual_clothing": "Hoodie + jeans, often a denim jacket",
            "phone": "07700 900222",
            "known_locations": ["School library", "Local mosque (Friday)"],
            "known_associates": ["Hannah (school friend)"],
            "family_contacts": [],
            "missing_triggers": ["Letterbox contact week", "Anniversary dates"],
            "safety_plan": "If missing: contact school first. CAMHS to be informed within 4h.",
            "medical": {
                "nhs_number": "402 030 4055",
                "gp": "Dr A. Roberts, Northern Family Practice · 0161 555 0123",
                "allergies": "None",
                "diagnoses": "Generalised anxiety disorder",
                "current_medication": "Sertraline 50mg AM",
                "prn": "—",
                "schedule": "Sertraline 50mg with breakfast",
                "conditions": "—",
                "emergency_notes": "Active CAMHS plan. Sharps protocol in place.",
                "appointments": "CAMHS · monthly",
            },
            "emergency_contacts": [
                {"name": "Marcus Wright (Social Worker)", "relation": "LA", "phone": "07700 900113"},
                {"name": "Manchester EDT", "relation": "Out-of-hours", "phone": "0161 234 5001"},
                {"name": "CAMHS Crisis", "relation": "Clinical", "phone": "0161 222 0000"},
            ],
        },
        {
            "name": "Leo Martinez",
            "preferred_name": "Leo",
            "dob": "2011-07-21",
            "room": "3A",
            "gender": "Male",
            "placement_date": "2025-12-01",
            "legal_status": "Section 20 (voluntary accommodation)",
            "social_worker_name": "Helena Brown",
            "social_worker_contact": "07700 900114 · helena.brown@la.gov.uk",
            "local_authority": "Salford City Council",
            "key_worker": "Alex Staff",
            "placement_summary": "Recently arrived. Settling in. Loves cycling.",
            "risk_level": "medium",
            "notes": "Recently arrived, settling in. Loves cycling.",
            "referral_reason": "Parental capacity — temporary placement during family assessment.",
            "placement_history": "First placement.",
            "family_background": "Maternal contact weekly, supervised. Father unknown.",
            "education_background": "Year 8, achieving expected. Behaviour notes around frustration.",
            "trauma_history": "Witnessed parental substance misuse.",
            "professional_involvement": "Family Support Worker via LA.",
            "presenting_needs": "Settling routines; emotional regulation.",
            "risks": {
                "self_harm": "None",
                "absconding": "Medium — left placement once",
                "aggression": "Medium — verbal/property",
                "substance": "None known",
                "cse": "None known",
                "mental_health": "Adjustment difficulty",
                "medical": "None",
            },
            "risk_triggers": ["Sharing equipment", "Sudden routine changes"],
            "protective_factors": ["Cycling — strong outlet", "Good rapport with staff"],
            "risk_management": "Predictable routine. Cycling time daily. Restorative approach.",
            "risk_last_reviewed": "2026-01-20",
            "risk_next_review": "2026-02-20",
            "emotional_support": "Key-work 2x/week + ad-hoc check-ins.",
            "behaviour_strategies": "Restorative conversations; clear, calm boundaries.",
            "education_support": "Liaise with school behaviour lead weekly.",
            "health_needs": "Routine.",
            "independence_skills": "Bike maintenance, basic cooking.",
            "contact_arrangements": "Mum: weekly supervised at family centre.",
            "goals_outcomes": "Stable placement; consistent attendance; broaden friendships.",
            "staff_guidance": "Prepare for transitions 15 min ahead. Avoid public correction.",
            "height": "4'11\"",
            "build": "Average",
            "hair": "Black, curly",
            "eyes": "Brown",
            "distinguishing_marks": "Birthmark on right forearm",
            "usual_clothing": "Cycling top, joggers",
            "phone": "07700 900223",
            "known_locations": ["BMX track Salford Quays", "Cycling club Saturday"],
            "known_associates": ["Sam (cycling club)"],
            "family_contacts": ["Mum — Carla Martinez · 07700 900115 (supervised only)"],
            "missing_triggers": ["Disappointing contact visits", "Conflict over rules"],
            "safety_plan": "Check BMX track and cycling club first. Mum to be informed only after police.",
            "medical": {
                "nhs_number": "403 040 5066",
                "gp": "Dr A. Roberts, Northern Family Practice · 0161 555 0123",
                "allergies": "None",
                "diagnoses": "—",
                "current_medication": "—",
                "prn": "—",
                "schedule": "—",
                "conditions": "—",
                "emergency_notes": "—",
                "appointments": "Routine medical · April 2026",
            },
            "emergency_contacts": [
                {"name": "Helena Brown (Social Worker)", "relation": "LA", "phone": "07700 900114"},
                {"name": "Salford EDT", "relation": "Out-of-hours", "phone": "0161 794 0000"},
            ],
        },
        {
            "name": "Maddy O'Brien",
            "preferred_name": "Mads",
            "dob": "2008-05-30",
            "room": "3B",
            "gender": "Female",
            "placement_date": "2022-06-18",
            "legal_status": "Care Order (Section 31)",
            "social_worker_name": "Daniel Owusu",
            "social_worker_contact": "07700 900116 · daniel.owusu@la.gov.uk",
            "local_authority": "Trafford Council",
            "key_worker": "Sarah Manager",
            "placement_summary": "Approaching independence. Pathway plan in progress.",
            "risk_level": "high",
            "notes": "Approaching independence; weekly key-work sessions.",
            "referral_reason": "Family breakdown; long-term LA care.",
            "placement_history": "Three foster placements before residential (2018-22).",
            "family_background": "Inconsistent maternal contact; phone only.",
            "education_background": "College — Health & Social Care L2.",
            "trauma_history": "Childhood neglect; multiple disruptions.",
            "professional_involvement": "Personal Adviser (post-16); IRO; LAC nurse.",
            "presenting_needs": "Identity and family contact distress; pre-independence skills.",
            "risks": {
                "self_harm": "Historic — none in last 12 months",
                "absconding": "High — three episodes in last 12 months",
                "aggression": "Low",
                "substance": "Cannabis use disclosed Feb 2026",
                "cse": "Moderate — historic; ongoing online-safety work",
                "mental_health": "Low mood after maternal contact",
                "medical": "None",
            },
            "risk_triggers": ["Phone calls from biological mother", "Birthdays"],
            "protective_factors": ["Trusting bond with manager", "College engagement"],
            "risk_management": "Pre-and-post contact session with key worker. Substance-misuse keyworker referral made.",
            "risk_last_reviewed": "2026-01-29",
            "risk_next_review": "2026-02-26",
            "emotional_support": "Weekly 1:1 + check-in after every contact.",
            "behaviour_strategies": "Validate, then reflect. Avoid pressuring decisions when distressed.",
            "education_support": "College mentor weekly; transport pass.",
            "health_needs": "—",
            "independence_skills": "Pathway plan: budgeting, tenancy, cooking once weekly.",
            "contact_arrangements": "Mum: phone, weekly. In-person when assessed safe.",
            "goals_outcomes": "Complete L2; secure semi-independent placement at 18.",
            "staff_guidance": "Always assume distress after maternal contact. Offer space + key-work.",
            "height": "5'6\"",
            "build": "Average",
            "hair": "Blonde, long",
            "eyes": "Blue",
            "distinguishing_marks": "Small tattoo on left wrist (rose)",
            "usual_clothing": "Hoodie, leggings, white trainers",
            "phone": "07700 900224",
            "known_locations": ["Manchester Piccadilly Gardens", "Friend's flat — Stretford"],
            "known_associates": ["Chloe (older friend) — caution noted", "Jamie (college)"],
            "family_contacts": ["Mum — Lorraine O'Brien · 07700 900117 (phone only)"],
            "missing_triggers": ["Contact phone-calls", "Anniversary of removal (June)"],
            "safety_plan": "If missing: police IMMEDIATELY. Check Piccadilly Gardens and Stretford address. Cannabis use risk in associates.",
            "medical": {
                "nhs_number": "404 050 6077",
                "gp": "Dr A. Roberts, Northern Family Practice · 0161 555 0123",
                "allergies": "None known",
                "diagnoses": "—",
                "current_medication": "Combined contraceptive pill",
                "prn": "—",
                "schedule": "Pill daily AM",
                "conditions": "—",
                "emergency_notes": "Substance-misuse risk noted. LAC nurse contactable.",
                "appointments": "LAC review · monthly",
            },
            "emergency_contacts": [
                {"name": "Daniel Owusu (Social Worker)", "relation": "LA", "phone": "07700 900116"},
                {"name": "Trafford EDT", "relation": "Out-of-hours", "phone": "0161 912 2020"},
                {"name": "Personal Adviser — Lou Carter", "relation": "Post-16", "phone": "07700 900118"},
            ],
        },
    ]
    res_docs = []
    for r in residents:
        d = {**r, "id": str(uuid.uuid4()), "created_at": now_iso()}
        res_docs.append(d)
        await db.residents.insert_one(d)

    now = datetime.now(timezone.utc)

    notes = [
        ("Jordan Reilly", "wellbeing", "Good day at school, came home settled and chatted about football trial.", 1, staff_user, False),
        ("Aisha Khan", "education", "Completed maths homework independently, proud of progress.", 1, james, False),
        ("Leo Martinez", "behaviour", "Some testing of boundaries at dinner — calmed quickly with key-work.", 2, staff_user, True),
        ("Maddy O'Brien", "activity", "Attended cooking session, made spaghetti bolognese for the house.", 2, manager_user, False),
        ("Jordan Reilly", "health", "GP appointment for asthma review, all observations normal.", 3, james, False),
        ("Aisha Khan", "wellbeing", "Withdrawn this evening, declined dinner. Will monitor.", 4, staff_user, False),
    ]
    for name, cat, body, days_ago, user, voice in notes:
        rid = next(r["id"] for r in res_docs if r["name"] == name)
        await db.notes.insert_one(
            {
                "id": str(uuid.uuid4()),
                "resident_id": rid,
                "category": cat,
                "body": body,
                "voice_used": voice,
                "author_id": user["id"],
                "author_name": user["name"],
                "created_at": (now - timedelta(days=days_ago, hours=2)).isoformat(),
            }
        )

    incidents = [
        {
            "name": "Leo Martinez",
            "type": "behaviour",
            "severity": "medium",
            "category": "verbal",
            "body": "1) Summary: Verbal altercation with peer over PlayStation use.\n\n2) Antecedent: Leo had been waiting 20 minutes for his turn.\n\n3) Behaviour: Raised voice, swore at Peer A, kicked the controller across the floor.\n\n4) Consequence: Peer A left the room upset; controller damaged (cosmetic only).\n\n5) Action Taken: Staff de-escalated using calm voice, gave Leo space for 10 minutes, then revisited via key-work conversation. Leo apologised to Peer A.\n\n6) Risk & Safeguarding Notes: No physical harm. Pattern of frustration around shared resources noted — to be discussed with manager.",
            "tags": ["aggression", "verbal abuse"],
            "safeguarding": False,
            "action": "Key-work session booked. Monitor sharing dynamics over next 7 days.",
            "voice": True,
            "days_ago": 1,
            "user": staff_user,
            "status": "open",
        },
        {
            "name": "Aisha Khan",
            "type": "safeguarding",
            "severity": "high",
            "category": "self-harm",
            "body": "1) Summary: Aisha disclosed historical self-harm during 1:1 with key-worker.\n\n2) Antecedent: Routine check-in following withdrawn behaviour at dinner.\n\n3) Behaviour: Aisha shared experiences of self-harm prior to placement (last incident reportedly 4 months ago). No current marks observed during the conversation.\n\n4) Consequence: Aisha appeared relieved to share, requested ongoing support.\n\n5) Action Taken: Key-worker thanked her for trusting them, emphasised confidentiality limits. DSL informed within 30 minutes (verbal). Manager notified.\n\n6) Risk & Safeguarding Notes: Active safeguarding concern. CAMHS referral discussion to be raised at next clinical review.",
            "tags": ["disclosure", "self-harm"],
            "safeguarding": True,
            "action": "DSL notified. Care plan update scheduled for tomorrow. Increased check-ins for 7 days.",
            "voice": True,
            "days_ago": 2,
            "user": manager_user,
            "status": "reviewed",
        },
        {
            "name": "Maddy O'Brien",
            "type": "absconding",
            "severity": "high",
            "category": "missing",
            "body": "1) Summary: Maddy left the house without permission for 3 hours; returned safely.\n\n2) Antecedent: After phone call with biological mother, Maddy was visibly upset.\n\n3) Behaviour: Left through the front door without telling staff at 18:42; phone unanswered.\n\n4) Consequence: Returned at 21:48 of own accord; appeared low but unharmed.\n\n5) Action Taken: Police informed at 19:00 per missing-from-care procedure. Welfare interview completed on return. Care plan reviewed with Maddy.\n\n6) Risk & Safeguarding Notes: Pattern noted — third absconding event linked to family contact. Risk assessment to be updated.",
            "tags": ["missing", "returned", "police informed"],
            "safeguarding": True,
            "action": "Update missing-from-care risk assessment. Discuss family-contact protocol with social worker.",
            "voice": True,
            "days_ago": 4,
            "user": james,
            "status": "open",
        },
        {
            "name": "Jordan Reilly",
            "type": "other",
            "severity": "low",
            "category": "medical",
            "body": "1) Summary: Mild allergic reaction to a snack (peanut traces).\n\n2) Antecedent: Jordan ate a chocolate bar from a friend at school.\n\n3) Behaviour: Reported itchy lips and slight throat tightness on return.\n\n4) Consequence: Antihistamine administered, symptoms resolved within 30 minutes.\n\n5) Action Taken: Allergy info repeated, school informed. No A&E required.\n\n6) Risk & Safeguarding Notes: None. Continue allergy awareness conversations.",
            "tags": ["medical"],
            "safeguarding": False,
            "action": "Reinforce allergy awareness; replace expired antihistamine in first-aid box.",
            "voice": False,
            "days_ago": 5,
            "user": staff_user,
            "status": "reviewed",
        },
    ]
    for inc in incidents:
        rid = next(r["id"] for r in res_docs if r["name"] == inc["name"])
        u = inc["user"]
        await db.incidents.insert_one(
            {
                "id": str(uuid.uuid4()),
                "resident_id": rid,
                "severity": inc["severity"],
                "category": inc["category"],
                "incident_type": inc["type"],
                "body": inc["body"],
                "structured_report": inc["body"],
                "raw_transcript": inc["body"][:200] + "…",
                "safeguarding": inc["safeguarding"],
                "action_taken": inc["action"],
                "voice_used": inc["voice"],
                "tags": inc["tags"],
                "author_id": u["id"],
                "author_name": u["name"],
                "status": inc["status"],
                "created_at": (now - timedelta(days=inc["days_ago"], hours=4)).isoformat(),
            }
        )

    # Supervisions: log one for each staff/manager so dashboard shows "1 due" rather than empty
    for u, kind, days in [
        (staff_user, "supervision", 12),
        (james, "supervision", 45),  # overdue
        (manager_user, "supervision", 8),
        (staff_user, "appraisal", 90),
        (james, "appraisal", 400),  # overdue
    ]:
        await db.supervisions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "staff_id": u["id"],
                "kind": kind,
                "completed_at": (now - timedelta(days=days)).isoformat()[:10],
                "notes": "Demo seed record.",
                "created_by_id": manager_user["id"],
                "created_by_name": manager_user["name"],
                "created_at": (now - timedelta(days=days)).isoformat(),
            }
        )

    # ---- Medications & Body Maps ----
    await _seed_meds_and_bodymaps()

    logger.info("Demo data seeded.")


async def _seed_meds_and_bodymaps():
    """Idempotent top-up of medications/body_maps/health/education/shifts/trainings."""
    have_meds = await db.medications.count_documents({}) > 0
    have_bm = await db.body_maps.count_documents({}) > 0
    have_health = await db.health_appointments.count_documents({}) > 0
    have_edu = await db.education_records.count_documents({}) > 0
    have_shifts = await db.shifts.count_documents({}) > 0
    have_train = await db.trainings.count_documents({}) > 0
    have_visits = await db.statutory_visits.count_documents({}) > 0
    have_pm = await db.pocket_money_accounts.count_documents({}) > 0
    if have_meds and have_bm and have_health and have_edu and have_shifts and have_train and have_visits and have_pm:
        return
    residents = await db.residents.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    if not residents:
        return
    res_by_name = {r["name"]: r["id"] for r in residents}
    staff_user = await db.users.find_one({"email": "staff@care.local"})
    manager_user = await db.users.find_one({"email": "manager@care.local"})
    if not (staff_user and manager_user):
        return
    now = datetime.now(timezone.utc)

    med_seed = [
        {
            "name": "Jordan Reilly",
            "med": "Salbutamol Inhaler",
            "dose": "100mcg, 2 puffs",
            "route": "Inhaled",
            "schedule_times": ["08:00", "20:00"],
            "is_prn": False,
            "instructions": "Use spacer. Rinse mouth after.",
            "prescriber": "Dr A. Roberts",
            "allergy_warning": "Peanut allergy on file.",
        },
        {
            "name": "Jordan Reilly",
            "med": "Antihistamine",
            "dose": "10mg",
            "route": "Oral",
            "schedule_times": [],
            "is_prn": True,
            "indication": "Allergic reaction to peanuts",
            "instructions": "PRN — give if known peanut exposure or reaction symptoms.",
            "prescriber": "Dr A. Roberts",
            "allergy_warning": "PEANUT ALLERGY — administer with EpiPen if anaphylaxis.",
        },
        {
            "name": "Aisha Khan",
            "med": "Sertraline",
            "dose": "50mg",
            "route": "Oral",
            "schedule_times": ["08:00"],
            "is_prn": False,
            "instructions": "Take with food.",
            "prescriber": "CAMHS — Dr Patel",
            "requires_witness": True,
        },
        {
            "name": "Maddy O'Brien",
            "med": "Microgynon 30",
            "dose": "1 tablet",
            "route": "Oral",
            "schedule_times": ["08:00"],
            "is_prn": False,
            "instructions": "Combined contraceptive — take same time daily.",
            "prescriber": "Dr A. Roberts",
        },
    ]
    med_docs_by_resident = {}
    if await db.medications.count_documents({}) == 0:
        for ms in med_seed:
            rid = res_by_name.get(ms["name"])
            if not rid:
                continue
            doc = {
                "id": str(uuid.uuid4()),
                "resident_id": rid,
                "name": ms["med"],
                "dose": ms["dose"],
                "route": ms.get("route", "Oral"),
                "schedule_times": ms.get("schedule_times", []),
                "is_prn": ms.get("is_prn", False),
                "indication": ms.get("indication"),
                "instructions": ms.get("instructions"),
                "prescriber": ms.get("prescriber"),
                "start_date": (now - timedelta(days=120)).date().isoformat(),
                "end_date": None,
                "expiry_date": (now + timedelta(days=180)).date().isoformat(),
                "allergy_warning": ms.get("allergy_warning"),
                "requires_witness": ms.get("requires_witness", False),
                "active": True,
                "created_at": (now - timedelta(days=120)).isoformat(),
                "created_by_name": manager_user["name"],
            }
            await db.medications.insert_one(doc)
            med_docs_by_resident.setdefault(rid, []).append(doc)
        # Seed yesterday's morning dose for each non-PRN
        yday = (now - timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
        for rid, meds_list in med_docs_by_resident.items():
            for m in meds_list:
                if m["is_prn"]:
                    continue
                for t in (m.get("schedule_times") or [])[:1]:
                    hh, mm = t.split(":")
                    sched = yday.replace(hour=int(hh), minute=int(mm))
                    await db.medication_admins.insert_one({
                        "id": str(uuid.uuid4()),
                        "medication_id": m["id"],
                        "resident_id": rid,
                        "scheduled_at": sched.isoformat(),
                        "status": "given",
                        "notes": None,
                        "dose_given": m["dose"],
                        "administered_at": (sched + timedelta(minutes=4)).isoformat(),
                        "administered_by_id": staff_user["id"],
                        "administered_by_name": staff_user["name"],
                        "witness_id": None,
                        "witness_name": None,
                    })

    if await db.body_maps.count_documents({}) == 0:
        leo_id = res_by_name.get("Leo Martinez")
        if leo_id:
            await db.body_maps.insert_one({
                "id": str(uuid.uuid4()),
                "resident_id": leo_id,
                "incident_id": None,
                "notes": "Minor scrape from cycling. Self-disclosed; no concern.",
                "marks": [{
                    "side": "front",
                    "region": "Right knee",
                    "x": 0.55,
                    "y": 0.72,
                    "type": "scratch",
                    "severity": "minor",
                    "description": "Graze approx 2cm. Cleaned, plaster applied.",
                    "healing_notes": "Healing well after 2 days.",
                }],
                "recorded_at": (now - timedelta(days=2)).isoformat(),
                "recorded_by_id": staff_user["id"],
                "recorded_by_name": staff_user["name"],
            })

    # ---- Health & Wellbeing seed ----
    if await db.health_appointments.count_documents({}) == 0:
        appt_seed = [
            ("Jordan Reilly", "gp", "Annual asthma review", 30, "10:30",
             "Northern Family Practice", "Dr A. Roberts"),
            ("Aisha Khan", "camhs", "CAMHS therapy session", 7, "15:00",
             "CAMHS Withington", "Dr Patel"),
            ("Aisha Khan", "lac_nurse", "LAC health assessment", -10, "11:00",
             "LAC Nurse — Sarah Cole", "Sarah Cole"),
            ("Maddy O'Brien", "dental", "Routine check-up", 12, "09:30",
             "Bright Smiles Dental", "Dr Lee"),
            ("Maddy O'Brien", "gp", "LAC review", 60, "14:00",
             "Northern Family Practice", "Dr A. Roberts"),
            ("Leo Martinez", "optician", "Eye test", 45, "10:00",
             "Specsavers Salford", "Mr Khan"),
        ]
        for (name, kind, title, day_offset, time, loc, with_whom) in appt_seed:
            rid = res_by_name.get(name)
            if not rid:
                continue
            d = (now + timedelta(days=day_offset)).date().isoformat()
            await db.health_appointments.insert_one({
                "id": str(uuid.uuid4()),
                "resident_id": rid,
                "kind": kind,
                "title": title,
                "date": d,
                "time": time,
                "location": loc,
                "with_whom": with_whom,
                "status": "attended" if day_offset < 0 else "scheduled",
                "notes": None,
                "follow_up": None,
                "created_at": (now - timedelta(days=14)).isoformat(),
                "created_by_name": manager_user["name"],
            })

    if await db.health_observations.count_documents({}) == 0:
        obs_seed = [
            ("Jordan Reilly", "weight", "48", "kg", 30),
            ("Jordan Reilly", "height", "158", "cm", 30),
            ("Jordan Reilly", "peak_flow", "320", "L/min", 7),
            ("Aisha Khan", "weight", "55", "kg", 14),
            ("Maddy O'Brien", "weight", "61", "kg", 14),
        ]
        for (name, kind, value, unit, days_ago) in obs_seed:
            rid = res_by_name.get(name)
            if not rid:
                continue
            await db.health_observations.insert_one({
                "id": str(uuid.uuid4()),
                "resident_id": rid,
                "kind": kind,
                "value": value,
                "unit": unit,
                "recorded_on": (now - timedelta(days=days_ago)).date().isoformat(),
                "recorded_at": (now - timedelta(days=days_ago)).isoformat(),
                "recorded_by_name": staff_user["name"],
                "notes": None,
            })

    if await db.immunisations.count_documents({}) == 0:
        immu_seed = [
            ("Jordan Reilly", "MenACWY booster", -300, 1500),
            ("Aisha Khan", "HPV (course)", -180, None),
            ("Maddy O'Brien", "Td/IPV (3-in-1 teenage booster)", -800, -30),  # overdue
            ("Leo Martinez", "Annual flu", -90, 275),
        ]
        for (name, vaccine, days_given, days_next) in immu_seed:
            rid = res_by_name.get(name)
            if not rid:
                continue
            await db.immunisations.insert_one({
                "id": str(uuid.uuid4()),
                "resident_id": rid,
                "vaccine": vaccine,
                "date_given": (now + timedelta(days=days_given)).date().isoformat(),
                "next_due": (now + timedelta(days=days_next)).date().isoformat() if days_next is not None else None,
                "given_by": "School nurse" if "HPV" in vaccine else "GP",
                "batch": None,
                "notes": None,
                "created_at": (now + timedelta(days=days_given)).isoformat(),
            })

    # ---- Education / PEP seed ----
    if await db.education_records.count_documents({}) == 0:
        edu_seed = [
            {
                "name": "Jordan Reilly",
                "school": "St Joseph's High School",
                "school_contact": "0161 555 0210",
                "year_group": "Year 9",
                "senco": "Mrs K. Hart",
                "has_ehcp": False,
                "pep_date": (now - timedelta(days=80)).date().isoformat(),
                "next_pep_date": (now + timedelta(days=10)).date().isoformat(),
                "designated_teacher": "Mr T. Williams",
                "attendance_pct": 94.2,
                "target_grades": "Pass in core subjects; bronze D of E.",
                "current_grades": "On track in English & PE; behind in Maths.",
                "additional_support": "Reading-catch-up programme. Quiet study area.",
                "notes": "Loves football and art. Needs predictability before contact days.",
                "exclusions": [],
                "achievements": [
                    {"date": (now - timedelta(days=40)).date().isoformat(), "title": "Football team — Player of the match", "notes": None},
                    {"date": (now - timedelta(days=120)).date().isoformat(), "title": "Art display selected for school exhibition", "notes": None},
                ],
            },
            {
                "name": "Aisha Khan",
                "school": "Manchester Academy",
                "school_contact": "0161 555 0220",
                "year_group": "Year 10",
                "senco": "Ms B. Owens",
                "has_ehcp": False,
                "pep_date": (now - timedelta(days=20)).date().isoformat(),
                "next_pep_date": (now + timedelta(days=70)).date().isoformat(),
                "designated_teacher": "Ms F. Reid",
                "attendance_pct": 97.1,
                "target_grades": "Predicted A* English, A* Biology.",
                "current_grades": "Top set across sciences; outstanding ELSA reports.",
                "additional_support": "School counsellor weekly. Quiet space pre-exams.",
                "notes": "Strong academic profile; watch for low-mood after letterbox contact.",
                "exclusions": [],
                "achievements": [
                    {"date": (now - timedelta(days=60)).date().isoformat(), "title": "Top of year in Biology mock", "notes": None},
                ],
            },
            {
                "name": "Leo Martinez",
                "school": "Salford Boys' High",
                "school_contact": "0161 555 0230",
                "year_group": "Year 8",
                "senco": "Mr R. Cooper",
                "has_ehcp": False,
                "pep_date": (now - timedelta(days=110)).date().isoformat(),
                "next_pep_date": (now - timedelta(days=20)).date().isoformat(),  # overdue
                "designated_teacher": "Mrs J. Singh",
                "attendance_pct": 88.5,
                "target_grades": "Achieving expected level in core subjects.",
                "current_grades": "Behaviour notes around frustration during groupwork.",
                "additional_support": "Behaviour-mentor weekly.",
                "notes": "Cycling helps regulate. Recently arrived placement.",
                "exclusions": [
                    {
                        "date": (now - timedelta(days=18)).date().isoformat(),
                        "reason": "Verbal altercation with peer; refused to follow staff direction.",
                        "days": 1,
                        "type": "fixed_term",
                    }
                ],
                "achievements": [],
            },
            {
                "name": "Maddy O'Brien",
                "school": "Trafford College — H&SC L2",
                "school_contact": "0161 555 0240",
                "year_group": "Year 12 / College Y1",
                "senco": "—",
                "has_ehcp": False,
                "pep_date": (now - timedelta(days=50)).date().isoformat(),
                "next_pep_date": (now + timedelta(days=40)).date().isoformat(),
                "designated_teacher": "Lou Carter (Personal Adviser)",
                "attendance_pct": 91.8,
                "target_grades": "Pass L2 Health & Social Care.",
                "current_grades": "Strong placement-portfolio scores.",
                "additional_support": "Travel pass; college mentor weekly.",
                "notes": "Approaching independence; pathway plan in progress.",
                "exclusions": [],
                "achievements": [
                    {"date": (now - timedelta(days=70)).date().isoformat(), "title": "Distinction in placement portfolio module", "notes": None},
                ],
            },
        ]
        for e in edu_seed:
            rid = res_by_name.get(e.pop("name"))
            if not rid:
                continue
            e["resident_id"] = rid
            e["created_at"] = (now - timedelta(days=120)).isoformat()
            e["updated_at"] = now.isoformat()
            e["updated_by_name"] = manager_user["name"]
            await db.education_records.insert_one(e)

    # ---- Staff Rotas seed ----
    if not have_shifts:
        admin_user = await db.users.find_one({"email": "admin@care.local"})
        roster = [staff_user, manager_user, admin_user]
        roster = [u for u in roster if u]
        # Seed last week + this week + next week of rotating shifts
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        for day_offset in range(-7, 8):
            d = today + timedelta(days=day_offset)
            for shift_idx, (shift_name, start_h, end_h) in enumerate([
                ("Day shift", 7, 15),
                ("Late shift", 14, 22),
                ("Sleep-in", 22, 31),  # 22:00 → 07:00 next day
            ]):
                u = roster[(day_offset + shift_idx) % len(roster)]
                start = d.replace(hour=start_h % 24)
                if end_h >= 24:
                    end = (d + timedelta(days=1)).replace(hour=end_h - 24)
                else:
                    end = d.replace(hour=end_h)
                await db.shifts.insert_one({
                    "id": str(uuid.uuid4()),
                    "staff_id": u["id"],
                    "staff_name": u["name"],
                    "role": shift_name,
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "notes": None,
                    "created_at": (now - timedelta(days=14)).isoformat(),
                })

    # ---- Trainings seed ----
    if not have_train:
        admin_user = await db.users.find_one({"email": "admin@care.local"})
        roster = [u for u in [staff_user, manager_user, admin_user] if u]
        # Each course: (name, completed_days_ago, validity_months)
        courses = [
            ("Safeguarding L3", 365, 24),
            ("First Aid at Work", 1500, 36),  # intentionally expired (~14mo overdue)
            ("Medication Administration", 200, 12),
            ("DBS Check", 540, 36),
            ("Fire Safety", 90, 12),
            ("Restrictive Practice", 30, 24),
        ]
        # Make staff have most courses; manager has all; admin has fewer
        coverage = {
            staff_user["id"]: ["Safeguarding L3", "Medication Administration", "DBS Check", "Fire Safety", "Restrictive Practice"],
            manager_user["id"]: [c[0] for c in courses],
        }
        if admin_user:
            coverage[admin_user["id"]] = ["Safeguarding L3", "DBS Check", "Fire Safety"]
        for u in roster:
            for (course, days_ago, months_valid) in courses:
                if course not in coverage.get(u["id"], []):
                    continue
                completed = (now - timedelta(days=days_ago)).date().isoformat()
                expires_at = (
                    now - timedelta(days=days_ago) + timedelta(days=months_valid * 30)
                ).date().isoformat()
                await db.trainings.insert_one({
                    "id": str(uuid.uuid4()),
                    "staff_id": u["id"],
                    "staff_name": u["name"],
                    "course": course,
                    "completed_on": completed,
                    "expires_on": expires_at,
                    "certificate_no": None,
                    "provider": "External provider",
                    "notes": None,
                    "created_at": (now - timedelta(days=days_ago)).isoformat(),
                })

    # ---- Statutory Visits seed ----
    if not have_visits:
        visit_seed = [
            ("Jordan Reilly", "lac_review", -45, 90, "Pri Patel", "Social Worker", "completed"),
            ("Jordan Reilly", "sw_visit", 5, None, "Pri Patel", "Social Worker", "scheduled"),
            ("Aisha Khan", "lac_review", 12, None, "Marcus Wright", "Social Worker", "scheduled"),
            ("Aisha Khan", "iro_visit", -10, 80, "James Connell", "Independent Reviewing Officer", "completed"),
            ("Aisha Khan", "sw_visit", -3, None, "Marcus Wright", "Social Worker", "missed"),  # missed
            ("Maddy O'Brien", "lac_review", 30, None, "Daniel Owusu", "Social Worker", "scheduled"),
            ("Maddy O'Brien", "iro_visit", -2, None, "James Connell", "Independent Reviewing Officer", "scheduled"),  # overdue
            ("Leo Martinez", "sw_visit", 7, None, "Helena Brown", "Social Worker", "scheduled"),
            (None, "regulation_44", 14, None, "External Visitor — D. Hughes", "Regulation 44 Visitor", "scheduled"),
            (None, "regulation_44", -28, 60, "External Visitor — D. Hughes", "Regulation 44 Visitor", "completed"),
        ]
        for (name, kind, day_offset, next_offset, attendee, role, status) in visit_seed:
            rid = res_by_name.get(name) if name else None
            scheduled = (now + timedelta(days=day_offset)).date().isoformat()
            doc = {
                "id": str(uuid.uuid4()),
                "resident_id": rid,
                "kind": kind,
                "title": kind.replace("_", " ").title() + (f" — {name}" if name else " — Home-wide"),
                "scheduled_for": scheduled,
                "time": "14:00" if kind != "regulation_44" else "10:00",
                "completed_on": scheduled if status == "completed" else None,
                "attended_by": attendee if status == "completed" else None,
                "visitor_role": role,
                "location": "Home" if kind != "lac_review" else "Local Authority",
                "status": status,
                "next_due": (now + timedelta(days=next_offset)).date().isoformat() if next_offset else None,
                "notes": "Auto-seeded demo visit." if status == "completed" else None,
                "follow_up": None,
                "created_at": (now - timedelta(days=30)).isoformat(),
                "created_by_name": manager_user["name"],
            }
            await db.statutory_visits.insert_one(doc)

    # ---- Pocket Money seed (multi-category finance ledger) ----
    if not have_pm:
        FIN_CATS = [
            "pocket", "personal_spending", "savings", "trust_leaving_care", "subsistence",
            "clothing", "incentives", "deductions", "staff_purchases", "external_income",
            "education_activity", "transport", "mobile_phone", "emergency", "gifts",
            "health_personal_care", "fines",
        ]
        # (name, weekly, opening_balances{category:amount}, transactions[(days_ago, category, direction, amount, reason, yp_init, receipt)])
        pm_seed = [
            ("Jordan Reilly", 7.50, {
                "pocket": 22.50, "savings": 50.00, "clothing": 80.00, "trust_leaving_care": 0.0,
            }, [
                (28, "pocket", "in", 7.50, "Weekly allowance · w/c Mar", "JR", False),
                (24, "pocket", "out", 3.00, "Sports drink + crisps", "JR", False),
                (21, "pocket", "in", 7.50, "Weekly allowance", "JR", False),
                (18, "transport", "out", 5.50, "Bus pass top-up", "JR", True),
                (16, "incentives", "in", 5.00, "Reward · helped with chores", "JR", False),
                (14, "savings", "in", 5.00, "Saving for new boots", "JR", False),
                (12, "education_activity", "out", 8.00, "Football club fees", "JR", True),
                (10, "pocket", "in", 7.50, "Weekly allowance", "JR", False),
                (8, "subsistence", "out", 4.20, "Lunch out (away day)", "JR", True),
                (4, "pocket", "out", 4.20, "Cinema ticket", "JR", False),
                (3, "pocket", "in", 7.50, "Weekly allowance", "JR", False),
            ]),
            ("Aisha Khan", 10.00, {
                "pocket": 18.00, "savings": 120.00, "clothing": 60.00, "trust_leaving_care": 250.00,
                "education_activity": 35.00,
            }, [
                (29, "pocket", "in", 10.00, "Weekly allowance", "AK", False),
                (26, "education_activity", "out", 6.50, "Stationery / school supplies", "AK", True),
                (23, "external_income", "in", 25.00, "Family contribution", "AK", False),
                (22, "pocket", "in", 10.00, "Weekly allowance", "AK", False),
                (19, "gifts", "out", 12.00, "Birthday gift for friend", "AK", True),
                (16, "mobile_phone", "out", 10.00, "Phone top-up", "AK", True),
                (15, "pocket", "in", 10.00, "Weekly allowance", "AK", False),
                (12, "health_personal_care", "out", 18.00, "Haircut", "AK", True),
                (10, "incentives", "in", 5.00, "Reward · school attendance", "AK", False),
                (8, "savings", "in", 10.00, "Long-term savings transfer", "AK", False),
                (5, "pocket", "in", 10.00, "Weekly allowance", "AK", False),
                (2, "transport", "out", 4.00, "Bus fare top-up", "AK", False),
            ]),
            ("Maddy O'Brien", 12.00, {
                "pocket": 35.00, "savings": 80.00, "trust_leaving_care": 1200.00,
                "clothing": 100.00, "personal_spending": 20.00,
            }, [
                (27, "pocket", "in", 12.00, "Weekly allowance", "MO", False),
                (25, "health_personal_care", "out", 8.40, "Hairdresser tip + travel", "MO", True),
                (22, "external_income", "in", 80.00, "Care leaver bursary", "MO", False),
                (20, "pocket", "in", 12.00, "Weekly allowance", "MO", False),
                (17, "education_activity", "out", 22.00, "College trip — Manchester", "MO", True),
                (16, "mobile_phone", "out", 9.00, "Phone top-up", "MO", True),
                (14, "deductions", "out", 5.00, "Sanction · damaged property (per policy)", "MO", False),
                (12, "pocket", "in", 12.00, "Weekly allowance", "MO", False),
                (9, "gifts", "in", 20.00, "Birthday money from mum", "MO", False),
                (7, "subsistence", "out", 6.50, "Toiletries", "MO", True),
                (6, "personal_spending", "out", 14.50, "Lunch with friends in town", "MO", False),
                (3, "pocket", "in", 12.00, "Weekly allowance", "MO", False),
            ]),
            ("Leo Martinez", 5.00, {
                "pocket": 12.50, "savings": 25.00, "clothing": 45.00, "trust_leaving_care": 0.0,
                "education_activity": 12.00,
            }, [
                (28, "pocket", "in", 5.00, "Weekly allowance", "LM", False),
                (24, "pocket", "out", 1.80, "Pokemon cards", "LM", False),
                (21, "pocket", "in", 5.00, "Weekly allowance", "LM", False),
                (18, "education_activity", "out", 4.00, "School trip lunch", "LM", True),
                (16, "incentives", "in", 3.00, "Reward · brushing teeth chart", "LM", False),
                (14, "pocket", "in", 5.00, "Weekly allowance", "LM", False),
                (12, "subsistence", "out", 2.50, "Snack on outing", "LM", False),
                (7, "pocket", "in", 5.00, "Weekly allowance", "LM", False),
                (5, "gifts", "in", 10.00, "Aunt's visit gift", "LM", False),
                (4, "pocket", "out", 2.50, "Ice cream at park", "LM", False),
            ]),
        ]
        for (name, weekly, opening_balances, txs) in pm_seed:
            rid = res_by_name.get(name)
            if not rid:
                continue
            cb = {c: 0.0 for c in FIN_CATS}
            for c, v in opening_balances.items():
                cb[c] = round(float(v), 2)
            total = round(sum(cb.values()), 2)
            account_doc = {
                "resident_id": rid,
                "weekly_allowance": float(weekly),
                "currency": "GBP",
                "note": None,
                "category_balances": cb,
                "total_balance": total,
                "last_allowance_paid": None,
                "updated_at": now.isoformat(),
            }
            await db.pocket_money_accounts.insert_one(account_doc)
            last_allowance = None
            for (days_ago, cat, direction, amt, reason, yp_init, receipt) in txs:
                sign = +1 if direction == "in" else -1
                d = round(sign * float(amt), 2)
                cb[cat] = round(float(cb.get(cat, 0.0)) + d, 2)
                total = round(sum(cb.values()), 2)
                ts = (now - timedelta(days=days_ago, hours=2)).isoformat()
                tx_doc = {
                    "id": str(uuid.uuid4()),
                    "resident_id": rid,
                    "category": cat,
                    "direction": direction,
                    "amount": float(amt),
                    "reason": reason,
                    "signed_by_staff_initials": "AS",
                    "signed_by_yp_initials": yp_init,
                    "receipt_attached": bool(receipt),
                    "notes": None,
                    "delta": d,
                    "balance_after_category": cb[cat],
                    "balance_after_total": total,
                    "created_at": ts,
                    "created_by_name": staff_user["name"],
                }
                await db.pocket_money_tx.insert_one(tx_doc)
                if cat == "pocket" and direction == "in" and reason.lower().startswith("weekly allowance"):
                    last_allowance = (now - timedelta(days=days_ago)).date().isoformat()
            await db.pocket_money_accounts.update_one(
                {"resident_id": rid},
                {"$set": {
                    "category_balances": cb,
                    "total_balance": total,
                    "last_allowance_paid": last_allowance,
                    "updated_at": now.isoformat(),
                }},
            )

    # ---- Petty Cash (home-wide) seed ----
    if not await db.home_petty_cash.find_one({"id": "home"}):
        await db.home_petty_cash.insert_one({
            "id": "home",
            "balance": 80.00,
            "currency": "GBP",
            "last_handover_at": (now - timedelta(hours=8)).isoformat(),
            "last_handover_outgoing": "AS",
            "last_handover_incoming": "DT",
            "updated_at": (now - timedelta(hours=8)).isoformat(),
        })
        # Seed a few petty cash transactions
        seed_petty = [
            (5, "deposit", "in", 100.00, "Float top-up from manager", "SM", None, 0.0),
            (4, "spend", "out", 6.50, "Sandwiches for activity day", "AS", None, 0.0),
            (3, "spend", "out", 12.00, "Diesel · home minibus", "AS", None, 0.0),
            (2, "spend", "out", 4.50, "Emergency school stationery (Leo)", "AS", None, 0.0),
            (1, "spend", "out", 3.00, "Bus fares · YP appointment", "AS", None, 0.0),
            (0, "handover", "check", 80.00, "Shift handover · evening", "AS", "DT", 6.00),
        ]
        running = 0.0
        for (days_ago, kind, direction, amt, reason, out_init, in_init, _disc_seed) in seed_petty:
            ts = (now - timedelta(days=days_ago, hours=8)).isoformat()
            if kind == "handover":
                discrepancy = round(float(amt) - running, 2)
                running = round(float(amt), 2)
                delta = 0.0
            else:
                if direction == "in":
                    delta = round(float(amt), 2)
                else:
                    delta = round(-float(amt), 2)
                running = round(running + delta, 2)
                discrepancy = 0.0
            await db.home_petty_cash_tx.insert_one({
                "id": str(uuid.uuid4()),
                "kind": kind,
                "direction": direction,
                "amount": float(amt),
                "reason": reason,
                "signed_by_outgoing_initials": out_init,
                "signed_by_incoming_initials": in_init,
                "notes": None,
                "delta": delta,
                "balance_after": running,
                "discrepancy": discrepancy,
                "created_at": ts,
                "created_by_name": staff_user["name"],
            })
        await db.home_petty_cash.update_one(
            {"id": "home"},
            {"$set": {"balance": running, "updated_at": now.isoformat()}},
        )


app = FastAPI(title="Care Companion API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")
bearer_scheme = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*roles: str):
    async def _checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return _checker


# ---------- Models ----------
class RegisterIn(BaseModel):
    email: str
    password: str = Field(min_length=6)
    name: str
    role: Literal["staff", "manager", "admin"] = "staff"

    @field_validator("email")
    @classmethod
    def _norm_email(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email")
        return v


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _norm_email(cls, v: str) -> str:
        return (v or "").strip().lower()


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str


class AuthOut(BaseModel):
    token: str
    user: UserOut


class ResidentIn(BaseModel):
    name: str
    dob: Optional[str] = None
    room: Optional[str] = None
    notes: Optional[str] = ""
    photo_url: Optional[str] = None

    # Overview
    preferred_name: Optional[str] = None
    gender: Optional[str] = None
    placement_date: Optional[str] = None
    legal_status: Optional[str] = None
    social_worker_name: Optional[str] = None
    social_worker_contact: Optional[str] = None
    local_authority: Optional[str] = None
    key_worker: Optional[str] = None
    placement_summary: Optional[str] = None
    risk_level: Optional[Literal["low", "medium", "high"]] = "medium"

    # Background & Referral
    referral_reason: Optional[str] = None
    placement_history: Optional[str] = None
    family_background: Optional[str] = None
    education_background: Optional[str] = None
    trauma_history: Optional[str] = None
    professional_involvement: Optional[str] = None
    presenting_needs: Optional[str] = None

    # Risk
    risks: Optional[dict] = None  # { self_harm, absconding, aggression, substance, cse, mental_health, medical }
    risk_triggers: Optional[List[str]] = None
    protective_factors: Optional[List[str]] = None
    risk_management: Optional[str] = None
    risk_last_reviewed: Optional[str] = None
    risk_next_review: Optional[str] = None

    # Care plan
    emotional_support: Optional[str] = None
    behaviour_strategies: Optional[str] = None
    education_support: Optional[str] = None
    health_needs: Optional[str] = None
    independence_skills: Optional[str] = None
    contact_arrangements: Optional[str] = None
    goals_outcomes: Optional[str] = None
    staff_guidance: Optional[str] = None

    # Missing-from-care / Philomena
    height: Optional[str] = None
    build: Optional[str] = None
    hair: Optional[str] = None
    eyes: Optional[str] = None
    distinguishing_marks: Optional[str] = None
    usual_clothing: Optional[str] = None
    phone: Optional[str] = None
    known_locations: Optional[List[str]] = None
    known_associates: Optional[List[str]] = None
    family_contacts: Optional[List[str]] = None
    missing_triggers: Optional[List[str]] = None
    safety_plan: Optional[str] = None

    # Medical
    medical: Optional[dict] = None  # { gp, nhs_number, allergies, diagnoses, current_medication, prn, schedule, conditions, emergency_notes, appointments }

    # Emergency contacts
    emergency_contacts: Optional[List[dict]] = None  # [{ name, relation, phone }]


class Resident(ResidentIn):
    id: str
    created_at: str


class NoteIn(BaseModel):
    resident_id: str
    category: Literal["wellbeing", "education", "health", "behaviour", "activity", "other"] = "wellbeing"
    body: str
    voice_used: bool = False


class Note(NoteIn):
    id: str
    author_id: str
    author_name: str
    created_at: str


class IncidentIn(BaseModel):
    resident_id: str
    severity: Literal["low", "medium", "high"] = "low"
    category: Literal["physical", "verbal", "self-harm", "missing", "medical", "other"] = "other"
    incident_type: Optional[
        Literal["behaviour", "safeguarding", "absconding", "other"]
    ] = "other"
    body: str
    safeguarding: bool = False
    action_taken: Optional[str] = ""
    voice_used: bool = False
    tags: List[str] = Field(default_factory=list)
    structured_report: Optional[str] = ""
    raw_transcript: Optional[str] = ""


class Incident(IncidentIn):
    id: str
    author_id: str
    author_name: str
    status: Literal["open", "reviewed", "closed"] = "open"
    created_at: str


class StructureRequest(BaseModel):
    resident_id: Optional[str] = None
    incident_type: Literal["behaviour", "safeguarding", "absconding", "other"] = "other"
    severity: Literal["low", "medium", "high"] = "low"
    transcript: str
    tags: List[str] = Field(default_factory=list)


class StructureOut(BaseModel):
    structured_report: str
    suggested_action: str
    suggested_severity: Literal["low", "medium", "high"]
    suggested_safeguarding: bool


class NotificationIn(BaseModel):
    incident_id: str
    kind: Literal["manager", "dsl"]
    message: Optional[str] = ""


class Notification(BaseModel):
    id: str
    incident_id: str
    kind: Literal["manager", "dsl"]
    message: str
    sent_by_id: str
    sent_by_name: str
    recipient_role: str
    created_at: str
    read_at: Optional[str] = None
    incident_summary: Optional[dict] = None
    delivery: List[dict] = Field(default_factory=list)
    delivery_mocked: bool = True


class SupervisionIn(BaseModel):
    staff_id: str
    kind: Literal["supervision", "appraisal"] = "supervision"
    completed_at: str  # YYYY-MM-DD
    notes: Optional[str] = ""


class Supervision(SupervisionIn):
    id: str
    created_by_id: str
    created_by_name: str
    created_at: str


class ReportRequest(BaseModel):
    from_date: str  # ISO date
    to_date: str
    resident_id: Optional[str] = None


class ReportOut(BaseModel):
    id: str
    summary: str
    from_date: str
    to_date: str
    resident_id: Optional[str] = None
    incident_count: int
    note_count: int
    generated_by: str
    created_at: str
    records: List[dict] = Field(default_factory=list)


# ---------- Auth Endpoints ----------
@api_router.post("/auth/register", response_model=AuthOut)
async def register(payload: RegisterIn):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_doc["id"], email, payload.role)
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    return {"token": token, "user": user_doc}


@api_router.post("/auth/login", response_model=AuthOut)
async def login(payload: LoginIn, request: Request):
    email = payload.email.lower()
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=LOCKOUT_WINDOW_MINUTES)).isoformat()
    lock_until_cutoff = (now - timedelta(minutes=LOCKOUT_DURATION_MINUTES)).isoformat()

    # Active lockout?
    lock = await db.login_attempts.find_one({"email": email, "kind": "lock"})
    if lock and (lock.get("until", "") > now.isoformat()):
        raise HTTPException(
            status_code=423,
            detail="Account temporarily locked after too many failed attempts. Try again in 15 minutes.",
        )

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        # Record fail
        await db.login_attempts.insert_one(
            {
                "email": email,
                "kind": "fail",
                "at": now.isoformat(),
            }
        )
        recent_fails = await db.login_attempts.count_documents(
            {"email": email, "kind": "fail", "at": {"$gte": cutoff}}
        )
        if recent_fails >= LOCKOUT_MAX_ATTEMPTS:
            until = (now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)).isoformat()
            await db.login_attempts.update_one(
                {"email": email, "kind": "lock"},
                {"$set": {"until": until, "set_at": now.isoformat()}},
                upsert=True,
            )
            raise HTTPException(
                status_code=423,
                detail="Account temporarily locked after too many failed attempts. Try again in 15 minutes.",
            )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Success — clear fails
    await db.login_attempts.delete_many({"email": email})
    token = create_access_token(user["id"], email, user["role"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"token": token, "user": user}


@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.get("/auth/users", response_model=List[UserOut])
async def list_users(_: dict = Depends(require_role("admin", "manager"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users


# ---------- Residents ----------
@api_router.get("/residents", response_model=List[Resident])
async def list_residents(_: dict = Depends(get_current_user)):
    docs = await db.residents.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.post("/residents", response_model=Resident)
async def create_resident(payload: ResidentIn, user: dict = Depends(require_role("manager", "admin"))):
    doc = {**payload.model_dump(), "id": str(uuid.uuid4()), "created_at": now_iso()}
    await db.residents.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/residents/{rid}")
async def delete_resident(rid: str, _: dict = Depends(require_role("admin"))):
    res = await db.residents.delete_one({"id": rid})
    return {"deleted": res.deleted_count}


@api_router.get("/residents/{rid}", response_model=Resident)
async def get_resident(rid: str, _: dict = Depends(get_current_user)):
    doc = await db.residents.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Resident not found")
    return doc


class ResidentPatch(BaseModel):
    """All fields optional — partial update of a resident profile."""
    name: Optional[str] = None
    dob: Optional[str] = None
    room: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    preferred_name: Optional[str] = None
    gender: Optional[str] = None
    placement_date: Optional[str] = None
    legal_status: Optional[str] = None
    social_worker_name: Optional[str] = None
    social_worker_contact: Optional[str] = None
    local_authority: Optional[str] = None
    key_worker: Optional[str] = None
    placement_summary: Optional[str] = None
    risk_level: Optional[Literal["low", "medium", "high"]] = None
    referral_reason: Optional[str] = None
    placement_history: Optional[str] = None
    family_background: Optional[str] = None
    education_background: Optional[str] = None
    trauma_history: Optional[str] = None
    professional_involvement: Optional[str] = None
    presenting_needs: Optional[str] = None
    risks: Optional[dict] = None
    risk_triggers: Optional[List[str]] = None
    protective_factors: Optional[List[str]] = None
    risk_management: Optional[str] = None
    risk_last_reviewed: Optional[str] = None
    risk_next_review: Optional[str] = None
    emotional_support: Optional[str] = None
    behaviour_strategies: Optional[str] = None
    education_support: Optional[str] = None
    health_needs: Optional[str] = None
    independence_skills: Optional[str] = None
    contact_arrangements: Optional[str] = None
    goals_outcomes: Optional[str] = None
    staff_guidance: Optional[str] = None
    height: Optional[str] = None
    build: Optional[str] = None
    hair: Optional[str] = None
    eyes: Optional[str] = None
    distinguishing_marks: Optional[str] = None
    usual_clothing: Optional[str] = None
    phone: Optional[str] = None
    known_locations: Optional[List[str]] = None
    known_associates: Optional[List[str]] = None
    family_contacts: Optional[List[str]] = None
    missing_triggers: Optional[List[str]] = None
    safety_plan: Optional[str] = None
    medical: Optional[dict] = None
    emergency_contacts: Optional[List[dict]] = None


@api_router.patch("/residents/{rid}", response_model=Resident)
async def update_resident(
    rid: str,
    payload: ResidentPatch,
    _: dict = Depends(require_role("manager", "admin")),
):
    update_doc = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update_doc:
        doc = await db.residents.find_one({"id": rid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Resident not found")
        return doc
    update_doc["updated_at"] = now_iso()
    result = await db.residents.update_one({"id": rid}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(404, "Resident not found")
    doc = await db.residents.find_one({"id": rid}, {"_id": 0})
    return doc


@api_router.get("/residents/{rid}/timeline")
async def resident_timeline(rid: str, _: dict = Depends(get_current_user)):
    incidents = await db.incidents.find({"resident_id": rid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    notes = await db.notes.find({"resident_id": rid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    episodes = await db.missing_episodes.find({"resident_id": rid}, {"_id": 0}).sort("reported_at", -1).to_list(50)
    items = []
    for inc in incidents:
        items.append({
            "kind": "incident",
            "id": inc["id"],
            "at": inc.get("created_at"),
            "title": (inc.get("incident_type") or inc.get("category") or "incident").title(),
            "severity": inc.get("severity"),
            "safeguarding": bool(inc.get("safeguarding")),
            "body": (inc.get("structured_report") or inc.get("body") or "")[:240],
            "author": inc.get("author_name"),
        })
    for n in notes:
        items.append({
            "kind": "note",
            "id": n["id"],
            "at": n.get("created_at"),
            "title": (n.get("category") or "note").title(),
            "body": (n.get("body") or "")[:240],
            "author": n.get("author_name"),
        })
    for ep in episodes:
        items.append({
            "kind": "missing",
            "id": ep["id"],
            "at": ep.get("reported_at"),
            "title": "Missing episode" + (" · returned" if ep.get("returned_at") else " · open"),
            "body": ep.get("last_seen_location") or "",
            "author": ep.get("reported_by_name"),
            "share_token": ep.get("share_token"),
        })
    items.sort(key=lambda x: x.get("at") or "", reverse=True)
    return {"items": items[:120]}


# ---------- Missing-from-Care / Rapid Response Pack ----------
class MissingEpisodeIn(BaseModel):
    last_seen_location: Optional[str] = None
    last_seen_at: Optional[str] = None
    direction_of_travel: Optional[str] = None
    clothing_last_seen: Optional[str] = None
    contact_phone: Optional[str] = None
    police_reference: Optional[str] = None
    notes: Optional[str] = None


class MissingEpisode(BaseModel):
    id: str
    resident_id: str
    reported_at: str
    reported_by_id: str
    reported_by_name: str
    police_notified_at: Optional[str] = None
    returned_at: Optional[str] = None
    return_interview: Optional[str] = None
    last_seen_location: Optional[str] = None
    last_seen_at: Optional[str] = None
    direction_of_travel: Optional[str] = None
    clothing_last_seen: Optional[str] = None
    contact_phone: Optional[str] = None
    police_reference: Optional[str] = None
    notes: Optional[str] = None
    share_token: str
    status: Literal["open", "returned", "closed"] = "open"
    timeline: List[dict] = Field(default_factory=list)


@api_router.post("/residents/{rid}/missing", response_model=MissingEpisode)
async def open_missing_episode(
    rid: str,
    payload: MissingEpisodeIn,
    user: dict = Depends(get_current_user),
):
    resident = await db.residents.find_one({"id": rid}, {"_id": 0})
    if not resident:
        raise HTTPException(404, "Resident not found")
    now = now_iso()
    token = _secrets.token_urlsafe(24)
    doc = {
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "reported_at": now,
        "reported_by_id": user["id"],
        "reported_by_name": user["name"],
        "police_notified_at": None,
        "returned_at": None,
        "return_interview": None,
        **payload.model_dump(),
        "share_token": token,
        "status": "open",
        "timeline": [{"event": "reported_missing", "at": now, "by": user["name"]}],
    }
    await db.missing_episodes.insert_one(doc)

    # Auto-create a linked safeguarding incident for full audit trail
    inc_body = (
        f"Missing episode opened by {user['name']}.\n"
        f"Last seen: {payload.last_seen_location or '—'} at "
        f"{payload.last_seen_at or now}.\n"
        f"Notes: {payload.notes or '—'}"
    )
    await db.incidents.insert_one({
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "severity": "high",
        "category": "missing",
        "incident_type": "absconding",
        "body": inc_body,
        "structured_report": inc_body,
        "raw_transcript": "",
        "safeguarding": True,
        "action_taken": "Rapid Response Pack generated. Manager and DSL alerted.",
        "voice_used": False,
        "tags": ["missing", "rapid response"],
        "author_id": user["id"],
        "author_name": user["name"],
        "status": "open",
        "created_at": now,
        "missing_episode_id": doc["id"],
    })
    doc.pop("_id", None)
    return doc


@api_router.get("/residents/{rid}/missing", response_model=List[MissingEpisode])
async def list_missing_episodes(rid: str, _: dict = Depends(get_current_user)):
    docs = await db.missing_episodes.find({"resident_id": rid}, {"_id": 0}).sort("reported_at", -1).to_list(50)
    return docs


@api_router.get("/missing/{eid}", response_model=MissingEpisode)
async def get_missing_episode(eid: str, _: dict = Depends(get_current_user)):
    doc = await db.missing_episodes.find_one({"id": eid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Episode not found")
    return doc


class MissingEpisodePatch(BaseModel):
    police_notified_at: Optional[str] = None
    returned_at: Optional[str] = None
    return_interview: Optional[str] = None
    last_seen_location: Optional[str] = None
    last_seen_at: Optional[str] = None
    direction_of_travel: Optional[str] = None
    clothing_last_seen: Optional[str] = None
    contact_phone: Optional[str] = None
    police_reference: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Literal["open", "returned", "closed"]] = None


@api_router.patch("/missing/{eid}", response_model=MissingEpisode)
async def update_missing_episode(
    eid: str,
    payload: MissingEpisodePatch,
    user: dict = Depends(get_current_user),
):
    doc = await db.missing_episodes.find_one({"id": eid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Episode not found")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    timeline = list(doc.get("timeline") or [])
    now = now_iso()
    if update.get("police_notified_at") and not doc.get("police_notified_at"):
        timeline.append({"event": "police_notified", "at": update["police_notified_at"], "by": user["name"]})
    if update.get("returned_at") and not doc.get("returned_at"):
        timeline.append({"event": "returned", "at": update["returned_at"], "by": user["name"]})
        update["status"] = update.get("status") or "returned"
    if update:
        update["timeline"] = timeline
        update["updated_at"] = now
        await db.missing_episodes.update_one({"id": eid}, {"$set": update})
    doc = await db.missing_episodes.find_one({"id": eid}, {"_id": 0})
    return doc


@api_router.get("/missing/{eid}/pdf")
async def export_missing_pdf(eid: str, user: dict = Depends(get_current_user)):
    episode = await db.missing_episodes.find_one({"id": eid}, {"_id": 0})
    if not episode:
        raise HTTPException(404, "Episode not found")
    resident = await db.residents.find_one({"id": episode.get("resident_id")}, {"_id": 0}) or {}
    incidents = (
        await db.incidents.find(
            {"resident_id": episode.get("resident_id")}, {"_id": 0}
        )
        .sort("created_at", -1)
        .to_list(20)
    )
    pdf_buf = build_missing_pack_pdf(
        episode=episode,
        resident=resident,
        incidents=incidents,
        generated_for=user.get("name", "—"),
    )
    safe_name = (resident.get("name") or "resident").replace(" ", "_")
    short_ref = str(eid).replace("-", "")[-8:].upper()
    filename = f"Safelyn_Missing_Pack_{safe_name}_{short_ref}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# Public secure-link routes — token-protected, no JWT needed
@api_router.get("/missing/share/{token}")
async def get_missing_episode_by_token(token: str):
    doc = await db.missing_episodes.find_one({"share_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Pack not found or link revoked")
    resident = await db.residents.find_one({"id": doc.get("resident_id")}, {"_id": 0}) or {}
    return {"episode": doc, "resident": resident}


@api_router.get("/missing/share/{token}/pdf")
async def export_missing_pdf_by_token(token: str):
    episode = await db.missing_episodes.find_one({"share_token": token}, {"_id": 0})
    if not episode:
        raise HTTPException(404, "Pack not found or link revoked")
    resident = await db.residents.find_one({"id": episode.get("resident_id")}, {"_id": 0}) or {}
    incidents = (
        await db.incidents.find(
            {"resident_id": episode.get("resident_id")}, {"_id": 0}
        )
        .sort("created_at", -1)
        .to_list(20)
    )
    pdf_buf = build_missing_pack_pdf(
        episode=episode,
        resident=resident,
        incidents=incidents,
        generated_for="Shared link",
    )
    safe_name = (resident.get("name") or "resident").replace(" ", "_")
    short_ref = str(episode.get("id", "")).replace("-", "")[-8:].upper()
    filename = f"Safelyn_Missing_Pack_{safe_name}_{short_ref}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ---------- Daily Notes ----------
@api_router.get("/notes", response_model=List[Note])
async def list_notes(
    resident_id: Optional[str] = None,
    limit: int = 100,
    _: dict = Depends(get_current_user),
):
    q = {"resident_id": resident_id} if resident_id else {}
    docs = await db.notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@api_router.post("/notes", response_model=Note)
async def create_note(payload: NoteIn, user: dict = Depends(get_current_user)):
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "author_id": user["id"],
        "author_name": user["name"],
        "created_at": now_iso(),
    }
    await db.notes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/notes/{nid}")
async def delete_note(nid: str, user: dict = Depends(get_current_user)):
    q = {"id": nid}
    if user["role"] not in ("manager", "admin"):
        q["author_id"] = user["id"]
    res = await db.notes.delete_one(q)
    return {"deleted": res.deleted_count}


# ---------- Incidents ----------
@api_router.get("/incidents", response_model=List[Incident])
async def list_incidents(
    resident_id: Optional[str] = None,
    safeguarding_only: bool = False,
    limit: int = 200,
    _: dict = Depends(get_current_user),
):
    q: dict = {}
    if resident_id:
        q["resident_id"] = resident_id
    if safeguarding_only:
        q["safeguarding"] = True
    docs = await db.incidents.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@api_router.post("/incidents", response_model=Incident)
async def create_incident(payload: IncidentIn, user: dict = Depends(get_current_user)):
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "author_id": user["id"],
        "author_name": user["name"],
        "status": "open",
        "created_at": now_iso(),
    }
    await db.incidents.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.post("/incidents/structure", response_model=StructureOut)
async def structure_incident(payload: StructureRequest, _: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI structuring not configured")
    if not payload.transcript or len(payload.transcript.strip()) < 5:
        raise HTTPException(400, "Transcript too short")

    resident_name = "the young person"
    if payload.resident_id:
        r = await db.residents.find_one({"id": payload.resident_id}, {"_id": 0, "name": 1})
        if r:
            resident_name = r["name"]

    system = (
        "You are an experienced safeguarding lead writing an Ofsted-ready incident report "
        "for a UK children's home / supported-living service. You take a staff member's raw "
        "voice transcript and produce a clear, factual, professional incident report.\n\n"
        "STRICT RULES:\n"
        "- UK English. Plain, neutral, non-judgemental tone.\n"
        "- Never invent details. If something is unclear, write 'Not specified'.\n"
        "- Always anonymise other young people referred to (e.g. 'Peer A').\n"
        "- Output MUST be valid JSON only, no markdown, no preamble.\n\n"
        "JSON schema:\n"
        "{\n"
        '  "structured_report": "Multi-line plain-text report with these labelled sections: '
        "1) Summary (1 sentence), 2) Antecedent / Context, 3) Behaviour / Incident, "
        "4) Consequence / Outcome, 5) Action Taken by Staff, 6) Risk & Safeguarding Notes. "
        'Use blank lines between sections.",\n'
        '  "suggested_action": "Short follow-up action managers should consider.",\n'
        '  "suggested_severity": "low|medium|high",\n'
        '  "suggested_safeguarding": true|false\n'
        "}"
    )
    user_prompt = (
        f"Young person: {resident_name}\n"
        f"Incident type: {payload.incident_type}\n"
        f"Staff-selected severity: {payload.severity}\n"
        f"Quick tags: {', '.join(payload.tags) if payload.tags else 'none'}\n\n"
        f"Raw voice transcript from staff:\n\"\"\"\n{payload.transcript.strip()}\n\"\"\"\n\n"
        "Return ONLY the JSON object."
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"structure-{uuid.uuid4()}",
        system_message=system,
    ).with_model("openai", "gpt-5.2")

    try:
        raw = await chat.send_message(UserMessage(text=user_prompt))
    except Exception:
        logger.exception("Structure failed")
        raise HTTPException(502, "AI service unavailable. Please try again.")

    import json as _json
    import re as _re

    text = str(raw).strip()
    # Strip markdown code fences if present
    text = _re.sub(r"^```(?:json)?\s*", "", text)
    text = _re.sub(r"\s*```$", "", text)
    try:
        data = _json.loads(text)
    except Exception:
        # Last resort: extract first {...} block
        m = _re.search(r"\{.*\}", text, _re.DOTALL)
        if not m:
            raise HTTPException(500, "AI returned non-JSON output")
        try:
            data = _json.loads(m.group(0))
        except Exception:
            raise HTTPException(500, "AI returned malformed JSON")

    sev = (data.get("suggested_severity") or payload.severity).lower()
    if sev not in ("low", "medium", "high"):
        sev = payload.severity

    return {
        "structured_report": str(data.get("structured_report", "")).strip(),
        "suggested_action": str(data.get("suggested_action", "")).strip(),
        "suggested_severity": sev,
        "suggested_safeguarding": bool(data.get("suggested_safeguarding", False)),
    }


@api_router.patch("/incidents/{iid}/status", response_model=Incident)
async def update_incident_status(
    iid: str,
    status: Literal["open", "reviewed", "closed"],
    _: dict = Depends(require_role("manager", "admin")),
):
    await db.incidents.update_one({"id": iid}, {"$set": {"status": status}})
    doc = await db.incidents.find_one({"id": iid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@api_router.get("/incidents/{iid}", response_model=Incident)
async def get_incident(iid: str, _: dict = Depends(get_current_user)):
    doc = await db.incidents.find_one({"id": iid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Incident not found")
    return doc


@api_router.get("/incidents/{iid}/pdf")
async def export_incident_pdf(iid: str, user: dict = Depends(get_current_user)):
    incident = await db.incidents.find_one({"id": iid}, {"_id": 0})
    if not incident:
        raise HTTPException(404, "Incident not found")
    resident = await db.residents.find_one(
        {"id": incident.get("resident_id")}, {"_id": 0}
    )
    pdf_buf = build_incident_pdf(
        incident=incident,
        resident=resident,
        generated_for=user.get("name", "—"),
    )
    safe_name = (resident or {}).get("name", "incident").replace(" ", "_")
    short_ref = str(iid).replace("-", "")[-8:].upper()
    filename = f"Safelyn_Incident_{safe_name}_{short_ref}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@api_router.delete("/incidents/{iid}")
async def delete_incident(iid: str, _: dict = Depends(require_role("admin"))):
    res = await db.incidents.delete_one({"id": iid})
    return {"deleted": res.deleted_count}


# ---------- Voice Transcription ----------
@api_router.post("/voice/transcribe")
async def transcribe(audio: UploadFile = File(...), _: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "Voice transcription not configured")
    raw = await audio.read()
    if len(raw) == 0:
        raise HTTPException(400, "Empty audio file")
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(400, "Audio file too large (>25MB)")

    # Determine extension
    name = audio.filename or "audio.webm"
    if "." not in name:
        name = "audio.webm"

    file_like = io.BytesIO(raw)
    file_like.name = name

    stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
    try:
        response = await stt.transcribe(
            file=file_like,
            model="whisper-1",
            response_format="json",
            language="en",
        )
        text = getattr(response, "text", None) or str(response)
        return {"text": text}
    except Exception:
        logger.exception("Transcription failed")
        raise HTTPException(502, "Voice transcription service unavailable.")


# ---------- AI Reports ----------
@api_router.post("/reports/generate", response_model=ReportOut)
async def generate_report(
    payload: ReportRequest, user: dict = Depends(require_role("manager", "admin"))
):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI summary not configured")

    q: dict = {"created_at": {"$gte": payload.from_date, "$lte": payload.to_date + "T23:59:59"}}
    if payload.resident_id:
        q["resident_id"] = payload.resident_id

    incidents = await db.incidents.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    notes = await db.notes.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    residents = await db.residents.find({}, {"_id": 0}).to_list(500)
    res_map = {r["id"]: r["name"] for r in residents}

    if not incidents and not notes:
        summary = "No incidents or daily notes were logged in this period."
    else:
        # Build context for LLM
        lines = []
        for inc in incidents:
            lines.append(
                f"INCIDENT [{inc['created_at'][:10]}] - {res_map.get(inc['resident_id'], 'Unknown')} - "
                f"severity={inc['severity']}, category={inc['category']}, "
                f"safeguarding={inc['safeguarding']}, by={inc['author_name']}: {inc['body']}"
                + (f" Action: {inc.get('action_taken','')}" if inc.get("action_taken") else "")
            )
        for n in notes:
            lines.append(
                f"NOTE [{n['created_at'][:10]}] - {res_map.get(n['resident_id'], 'Unknown')} - "
                f"category={n['category']}, by={n['author_name']}: {n['body']}"
            )
        context = "\n".join(lines)

        system = (
            "You are an experienced safeguarding lead summarising care records for a children's home / "
            "supported living service. Produce a clear, concise manager-facing report in UK English. "
            "Structure: 1) Overview, 2) Safeguarding concerns (highlight any patterns, escalations, or risks), "
            "3) Wellbeing & positive observations, 4) Recommended actions. Use plain text with short paragraphs "
            "and bullet points. Be factual, non-judgemental, and never invent details that aren't in the records."
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"report-{uuid.uuid4()}",
            system_message=system,
        ).with_model("openai", "gpt-5.2")
        prompt = (
            f"Period: {payload.from_date} to {payload.to_date}\n"
            f"Resident filter: {res_map.get(payload.resident_id, 'All residents')}\n"
            f"Total incidents: {len(incidents)} | Total notes: {len(notes)}\n\n"
            f"Records:\n{context}\n\nGenerate the manager report now."
        )
        try:
            summary = await chat.send_message(UserMessage(text=prompt))
        except Exception:
            logger.exception("LLM summary failed")
            raise HTTPException(502, "AI service unavailable. Please try again.")

    # Build a flat list of records ordered chronologically — used by the
    # frontend to display per-entry timestamps + authorship for full
    # auditability of the AI summary.
    flat_records = []
    for inc in incidents:
        flat_records.append(
            {
                "kind": "incident",
                "id": inc.get("id"),
                "resident_id": inc.get("resident_id"),
                "resident_name": res_map.get(inc.get("resident_id"), "Unknown"),
                "author_name": inc.get("author_name"),
                "created_at": inc.get("created_at"),
                "category": inc.get("category"),
                "severity": inc.get("severity"),
                "safeguarding": inc.get("safeguarding", False),
                "body": inc.get("body", ""),
            }
        )
    for n in notes:
        flat_records.append(
            {
                "kind": "note",
                "id": n.get("id"),
                "resident_id": n.get("resident_id"),
                "resident_name": res_map.get(n.get("resident_id"), "Unknown"),
                "author_name": n.get("author_name"),
                "created_at": n.get("created_at"),
                "category": n.get("category"),
                "body": n.get("body", ""),
            }
        )
    flat_records.sort(key=lambda r: r.get("created_at") or "")

    doc = {
        "id": str(uuid.uuid4()),
        "summary": str(summary),
        "from_date": payload.from_date,
        "to_date": payload.to_date,
        "resident_id": payload.resident_id,
        "incident_count": len(incidents),
        "note_count": len(notes),
        "generated_by": user["name"],
        "generated_by_id": user["id"],
        "created_at": now_iso(),
        "records": flat_records,
    }
    await db.reports.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/reports", response_model=List[ReportOut])
async def list_reports(_: dict = Depends(require_role("manager", "admin"))):
    docs = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@api_router.get("/reports/{rid}/pdf")
async def export_report_pdf(rid: str, user: dict = Depends(require_role("manager", "admin"))):
    report = await db.reports.find_one({"id": rid}, {"_id": 0})
    if not report:
        raise HTTPException(404, "Report not found")
    pdf_buf = build_report_pdf(report=report, generated_for=user.get("name", "—"))
    short_ref = str(rid).replace("-", "")[-8:].upper()
    filename = f"Safelyn_Manager_Report_{short_ref}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ---------- Medication / MAR ----------
class MedicationIn(BaseModel):
    name: str
    dose: str
    route: Optional[str] = "Oral"
    schedule_times: List[str] = Field(default_factory=list)  # ["08:00","20:00"]
    is_prn: bool = False
    indication: Optional[str] = None  # for PRN
    instructions: Optional[str] = None
    prescriber: Optional[str] = None
    start_date: Optional[str] = None  # YYYY-MM-DD
    end_date: Optional[str] = None
    expiry_date: Optional[str] = None
    allergy_warning: Optional[str] = None
    requires_witness: bool = False
    active: bool = True


class Medication(MedicationIn):
    id: str
    resident_id: str
    created_at: str
    created_by_name: Optional[str] = None


class MedicationAdminIn(BaseModel):
    medication_id: str
    scheduled_at: str  # ISO datetime
    status: Literal["given", "refused", "missed", "withheld", "self-administered", "not-required"] = "given"
    notes: Optional[str] = None
    dose_given: Optional[str] = None
    witness_id: Optional[str] = None
    witness_name: Optional[str] = None


class MedicationAdmin(BaseModel):
    id: str
    medication_id: str
    resident_id: str
    scheduled_at: str
    status: str
    notes: Optional[str] = None
    dose_given: Optional[str] = None
    administered_at: str
    administered_by_id: str
    administered_by_name: str
    witness_id: Optional[str] = None
    witness_name: Optional[str] = None


@api_router.get("/residents/{rid}/medications", response_model=List[Medication])
async def list_medications(
    rid: str, active_only: bool = True, _: dict = Depends(get_current_user)
):
    q: dict = {"resident_id": rid}
    if active_only:
        q["active"] = True
    docs = await db.medications.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@api_router.post("/residents/{rid}/medications", response_model=Medication)
async def create_medication(
    rid: str,
    payload: MedicationIn,
    user: dict = Depends(require_role("manager", "admin")),
):
    resident = await db.residents.find_one({"id": rid}, {"_id": 0, "id": 1})
    if not resident:
        raise HTTPException(404, "Resident not found")
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "created_at": now_iso(),
        "created_by_name": user["name"],
    }
    await db.medications.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/medications/{mid}", response_model=Medication)
async def update_medication(
    mid: str,
    payload: MedicationIn,
    _: dict = Depends(require_role("manager", "admin")),
):
    update = payload.model_dump()
    res = await db.medications.update_one({"id": mid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Medication not found")
    doc = await db.medications.find_one({"id": mid}, {"_id": 0})
    return doc


@api_router.delete("/medications/{mid}")
async def delete_medication(mid: str, _: dict = Depends(require_role("manager", "admin"))):
    # Soft-delete: mark inactive to keep audit trail
    await db.medications.update_one({"id": mid}, {"$set": {"active": False}})
    return {"deleted": 1}


@api_router.post("/medications/{mid}/administer", response_model=MedicationAdmin)
async def administer_medication(
    mid: str,
    payload: MedicationAdminIn,
    user: dict = Depends(get_current_user),
):
    med = await db.medications.find_one({"id": mid}, {"_id": 0})
    if not med:
        raise HTTPException(404, "Medication not found")
    if med.get("requires_witness") and not (payload.witness_id or payload.witness_name):
        raise HTTPException(400, "This medication requires a witness signature")
    doc = {
        "id": str(uuid.uuid4()),
        "medication_id": mid,
        "resident_id": med["resident_id"],
        "scheduled_at": payload.scheduled_at,
        "status": payload.status,
        "notes": payload.notes,
        "dose_given": payload.dose_given or med.get("dose"),
        "administered_at": now_iso(),
        "administered_by_id": user["id"],
        "administered_by_name": user["name"],
        "witness_id": payload.witness_id,
        "witness_name": payload.witness_name,
    }
    await db.medication_admins.insert_one(doc)
    doc.pop("_id", None)
    return doc


def _date_range(date_str: Optional[str]) -> tuple:
    """Returns (start_iso, end_iso) for a single YYYY-MM-DD day, UTC."""
    if not date_str:
        target = datetime.now(timezone.utc).date()
    else:
        target = datetime.strptime(date_str, "%Y-%m-%d").date()
    start = datetime(target.year, target.month, target.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


@api_router.get("/residents/{rid}/mar")
async def get_mar(
    rid: str,
    date: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    """Return scheduled doses for a single day with admin records merged."""
    start_iso, end_iso = _date_range(date)
    target_date = (date or datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    meds = await db.medications.find(
        {"resident_id": rid, "active": True}, {"_id": 0}
    ).sort("name", 1).to_list(200)
    admins = await db.medication_admins.find(
        {"resident_id": rid, "scheduled_at": {"$gte": start_iso, "$lt": end_iso}},
        {"_id": 0},
    ).to_list(500)
    by_med: dict = {}
    for a in admins:
        by_med.setdefault(a["medication_id"], []).append(a)

    schedule = []
    for m in meds:
        if m.get("is_prn"):
            # PRN: list all PRN admins for the day under one "row"
            admins_today = by_med.get(m["id"], [])
            schedule.append({
                "medication": m,
                "kind": "prn",
                "scheduled_at": None,
                "admin": None,
                "prn_admins": admins_today,
            })
            continue
        for t in m.get("schedule_times", []) or []:
            try:
                hh, mm = t.split(":")
                sched_dt = datetime.fromisoformat(start_iso).replace(hour=int(hh), minute=int(mm))
                sched_iso = sched_dt.isoformat()
            except Exception:
                continue
            admin = next(
                (a for a in by_med.get(m["id"], []) if a.get("scheduled_at") == sched_iso),
                None,
            )
            schedule.append({
                "medication": m,
                "kind": "scheduled",
                "scheduled_at": sched_iso,
                "admin": admin,
                "prn_admins": [],
            })
    schedule.sort(key=lambda r: r.get("scheduled_at") or "z")
    return {"date": target_date, "items": schedule}


@api_router.get("/medications/round")
async def medication_round(
    date: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    """Cross-home medication round — every scheduled dose for the day,
    grouped by time slot, across all residents."""
    start_iso, end_iso = _date_range(date)
    target_date = (date or datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    residents = await db.residents.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    name_map = {r["id"]: r["name"] for r in residents}
    meds = await db.medications.find(
        {"active": True, "is_prn": False}, {"_id": 0}
    ).to_list(500)
    admins = await db.medication_admins.find(
        {"scheduled_at": {"$gte": start_iso, "$lt": end_iso}}, {"_id": 0}
    ).to_list(2000)
    admin_key = {(a["medication_id"], a["scheduled_at"]): a for a in admins}

    rows = []
    for m in meds:
        if m["resident_id"] not in name_map:
            continue
        for t in m.get("schedule_times", []) or []:
            try:
                hh, mm = t.split(":")
                sched_dt = datetime.fromisoformat(start_iso).replace(hour=int(hh), minute=int(mm))
                sched_iso = sched_dt.isoformat()
            except Exception:
                continue
            rows.append({
                "scheduled_at": sched_iso,
                "time": t,
                "resident_id": m["resident_id"],
                "resident_name": name_map.get(m["resident_id"], "—"),
                "medication": m,
                "admin": admin_key.get((m["id"], sched_iso)),
            })
    rows.sort(key=lambda r: (r["time"], r["resident_name"]))
    return {"date": target_date, "items": rows}


@api_router.get("/residents/{rid}/mar/pdf")
async def export_mar_pdf(
    rid: str,
    from_date: str,
    to_date: str,
    user: dict = Depends(get_current_user),
):
    """Weekly MAR chart PDF for a resident."""
    resident = await db.residents.find_one({"id": rid}, {"_id": 0})
    if not resident:
        raise HTTPException(404, "Resident not found")
    meds = await db.medications.find(
        {"resident_id": rid, "active": True}, {"_id": 0}
    ).sort("name", 1).to_list(200)
    admins = await db.medication_admins.find(
        {"resident_id": rid, "scheduled_at": {"$gte": from_date + "T00:00:00", "$lte": to_date + "T23:59:59"}},
        {"_id": 0},
    ).to_list(2000)
    pdf_buf = build_mar_pdf(
        resident=resident,
        medications=meds,
        admins=admins,
        from_date=from_date,
        to_date=to_date,
        generated_for=user.get("name", "—"),
    )
    safe_name = (resident.get("name") or "resident").replace(" ", "_")
    filename = f"Safelyn_MAR_{safe_name}_{from_date}_{to_date}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ---------- Body Maps & Injuries ----------
class BodyMark(BaseModel):
    side: Literal["front", "back"] = "front"
    region: Optional[str] = None  # human-readable area, e.g. "Left forearm"
    x: float  # 0..1 SVG-relative
    y: float  # 0..1
    type: Literal["bruise", "cut", "scratch", "burn", "swelling", "rash", "other"] = "other"
    severity: Literal["minor", "moderate", "significant"] = "minor"
    description: Optional[str] = None
    healing_notes: Optional[str] = None


class BodyMapIn(BaseModel):
    incident_id: Optional[str] = None
    notes: Optional[str] = None
    marks: List[BodyMark] = Field(default_factory=list)


class BodyMap(BodyMapIn):
    id: str
    resident_id: str
    recorded_at: str
    recorded_by_id: str
    recorded_by_name: str


@api_router.get("/residents/{rid}/bodymaps", response_model=List[BodyMap])
async def list_body_maps(rid: str, _: dict = Depends(get_current_user)):
    docs = await db.body_maps.find({"resident_id": rid}, {"_id": 0}).sort("recorded_at", -1).to_list(100)
    return docs


@api_router.post("/residents/{rid}/bodymaps", response_model=BodyMap)
async def create_body_map(
    rid: str,
    payload: BodyMapIn,
    user: dict = Depends(get_current_user),
):
    resident = await db.residents.find_one({"id": rid}, {"_id": 0, "id": 1})
    if not resident:
        raise HTTPException(404, "Resident not found")
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "recorded_at": now_iso(),
        "recorded_by_id": user["id"],
        "recorded_by_name": user["name"],
    }
    await db.body_maps.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/bodymaps/{bid}", response_model=BodyMap)
async def update_body_map(
    bid: str,
    payload: BodyMapIn,
    _: dict = Depends(get_current_user),
):
    update = payload.model_dump()
    res = await db.body_maps.update_one({"id": bid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Body map not found")
    doc = await db.body_maps.find_one({"id": bid}, {"_id": 0})
    return doc


@api_router.delete("/bodymaps/{bid}")
async def delete_body_map(bid: str, _: dict = Depends(require_role("manager", "admin"))):
    res = await db.body_maps.delete_one({"id": bid})
    return {"deleted": res.deleted_count}


# ---------- Health & Wellbeing ----------
APPT_KIND = Literal[
    "gp", "dental", "optician", "camhs", "lac_nurse", "immunisation",
    "specialist", "hospital", "physio", "other"
]
APPT_STATUS = Literal["scheduled", "attended", "missed", "cancelled", "rescheduled"]


class HealthAppointmentIn(BaseModel):
    kind: APPT_KIND = "gp"
    title: str
    date: str  # YYYY-MM-DD
    time: Optional[str] = None  # HH:MM
    location: Optional[str] = None
    with_whom: Optional[str] = None
    status: APPT_STATUS = "scheduled"
    notes: Optional[str] = None
    follow_up: Optional[str] = None


class HealthAppointment(HealthAppointmentIn):
    id: str
    resident_id: str
    created_at: str
    created_by_name: Optional[str] = None


class HealthObservationIn(BaseModel):
    kind: Literal["weight", "height", "bmi", "temp", "bp", "peak_flow", "blood_sugar", "pulse", "other"]
    value: str
    unit: Optional[str] = None
    recorded_on: Optional[str] = None  # YYYY-MM-DD
    notes: Optional[str] = None


class HealthObservation(HealthObservationIn):
    id: str
    resident_id: str
    recorded_at: str
    recorded_by_name: str


class ImmunisationIn(BaseModel):
    vaccine: str
    date_given: str  # YYYY-MM-DD
    next_due: Optional[str] = None
    given_by: Optional[str] = None
    batch: Optional[str] = None
    notes: Optional[str] = None


class Immunisation(ImmunisationIn):
    id: str
    resident_id: str
    created_at: str


@api_router.get("/residents/{rid}/health")
async def health_bundle(rid: str, _: dict = Depends(get_current_user)):
    """Combined health bundle: appointments, observations, immunisations + alerts."""
    today = datetime.now(timezone.utc).date().isoformat()
    appts = await db.health_appointments.find({"resident_id": rid}, {"_id": 0}).sort("date", -1).to_list(200)
    obs = await db.health_observations.find({"resident_id": rid}, {"_id": 0}).sort("recorded_at", -1).to_list(200)
    immus = await db.immunisations.find({"resident_id": rid}, {"_id": 0}).sort("date_given", -1).to_list(200)

    upcoming = [a for a in appts if a.get("date") >= today and a.get("status") == "scheduled"]
    overdue_immu = [i for i in immus if i.get("next_due") and i["next_due"] < today]
    return {
        "appointments": appts,
        "observations": obs,
        "immunisations": immus,
        "upcoming_appointments": upcoming[:5],
        "overdue_immunisations": overdue_immu,
    }


@api_router.post("/residents/{rid}/health/appointments", response_model=HealthAppointment)
async def create_appointment(
    rid: str, payload: HealthAppointmentIn, user: dict = Depends(get_current_user)
):
    if not await db.residents.find_one({"id": rid}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Resident not found")
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "created_at": now_iso(),
        "created_by_name": user["name"],
    }
    await db.health_appointments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/health/appointments/{aid}", response_model=HealthAppointment)
async def update_appointment(
    aid: str, payload: HealthAppointmentIn, _: dict = Depends(get_current_user)
):
    update = payload.model_dump()
    res = await db.health_appointments.update_one({"id": aid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Appointment not found")
    doc = await db.health_appointments.find_one({"id": aid}, {"_id": 0})
    return doc


@api_router.delete("/health/appointments/{aid}")
async def delete_appointment(aid: str, _: dict = Depends(require_role("manager", "admin"))):
    res = await db.health_appointments.delete_one({"id": aid})
    return {"deleted": res.deleted_count}


@api_router.post("/residents/{rid}/health/observations", response_model=HealthObservation)
async def create_observation(
    rid: str, payload: HealthObservationIn, user: dict = Depends(get_current_user)
):
    if not await db.residents.find_one({"id": rid}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Resident not found")
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "recorded_at": now_iso(),
        "recorded_by_name": user["name"],
    }
    await db.health_observations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/health/observations/{oid}")
async def delete_observation(oid: str, _: dict = Depends(get_current_user)):
    res = await db.health_observations.delete_one({"id": oid})
    return {"deleted": res.deleted_count}


@api_router.post("/residents/{rid}/health/immunisations", response_model=Immunisation)
async def create_immunisation(
    rid: str, payload: ImmunisationIn, _: dict = Depends(get_current_user)
):
    if not await db.residents.find_one({"id": rid}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Resident not found")
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "created_at": now_iso(),
    }
    await db.immunisations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/health/immunisations/{iid}")
async def delete_immunisation(iid: str, _: dict = Depends(require_role("manager", "admin"))):
    res = await db.immunisations.delete_one({"id": iid})
    return {"deleted": res.deleted_count}


# ---------- Education / PEP ----------
class Exclusion(BaseModel):
    date: str  # YYYY-MM-DD
    reason: str
    days: Optional[int] = None
    type: Literal["fixed_term", "permanent", "internal"] = "fixed_term"


class Achievement(BaseModel):
    date: str
    title: str
    notes: Optional[str] = None


class EducationIn(BaseModel):
    school: Optional[str] = None
    school_contact: Optional[str] = None
    year_group: Optional[str] = None
    senco: Optional[str] = None
    has_ehcp: Optional[bool] = None
    pep_date: Optional[str] = None
    next_pep_date: Optional[str] = None
    designated_teacher: Optional[str] = None
    attendance_pct: Optional[float] = None
    target_grades: Optional[str] = None
    current_grades: Optional[str] = None
    additional_support: Optional[str] = None
    notes: Optional[str] = None
    exclusions: List[Exclusion] = Field(default_factory=list)
    achievements: List[Achievement] = Field(default_factory=list)


@api_router.get("/residents/{rid}/education")
async def get_education(rid: str, _: dict = Depends(get_current_user)):
    if not await db.residents.find_one({"id": rid}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Resident not found")
    doc = await db.education_records.find_one({"resident_id": rid}, {"_id": 0}) or {
        "resident_id": rid,
        "exclusions": [],
        "achievements": [],
    }
    return doc


@api_router.put("/residents/{rid}/education")
async def upsert_education(
    rid: str, payload: EducationIn, user: dict = Depends(get_current_user)
):
    if not await db.residents.find_one({"id": rid}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Resident not found")
    update = payload.model_dump()
    update.update({
        "resident_id": rid,
        "updated_at": now_iso(),
        "updated_by_name": user["name"],
    })
    await db.education_records.update_one(
        {"resident_id": rid},
        {"$set": update, "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )
    doc = await db.education_records.find_one({"resident_id": rid}, {"_id": 0})
    return doc


@api_router.post("/residents/{rid}/education/exclusions")
async def add_exclusion(
    rid: str, payload: Exclusion, _: dict = Depends(get_current_user)
):
    await db.education_records.update_one(
        {"resident_id": rid},
        {
            "$push": {"exclusions": payload.model_dump()},
            "$setOnInsert": {"resident_id": rid, "achievements": [], "created_at": now_iso()},
        },
        upsert=True,
    )
    doc = await db.education_records.find_one({"resident_id": rid}, {"_id": 0})
    return doc


@api_router.post("/residents/{rid}/education/achievements")
async def add_achievement(
    rid: str, payload: Achievement, _: dict = Depends(get_current_user)
):
    await db.education_records.update_one(
        {"resident_id": rid},
        {
            "$push": {"achievements": payload.model_dump()},
            "$setOnInsert": {"resident_id": rid, "exclusions": [], "created_at": now_iso()},
        },
        upsert=True,
    )
    doc = await db.education_records.find_one({"resident_id": rid}, {"_id": 0})
    return doc


@api_router.get("/ofsted/readiness")
async def ofsted_readiness(_: dict = Depends(get_current_user)):
    """Aggregate, real-time Ofsted compliance scorecard.
    Each section returns: score (0-100), label, items (list of human details)."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today.isoformat()
    yesterday_iso = (now - timedelta(hours=24)).isoformat()
    week_iso = (now - timedelta(days=7)).isoformat()

    # 1) Medication — % scheduled doses signed in the last 24h
    med_active = await db.medications.find(
        {"active": True, "is_prn": False}, {"_id": 0}
    ).to_list(500)
    expected_doses = 0
    signed_doses = 0
    med_items = []
    for m in med_active:
        for t in m.get("schedule_times", []) or []:
            try:
                hh, mm = t.split(":")
                sched_dt = today.replace(hour=int(hh), minute=int(mm))
                if sched_dt > now:
                    continue  # not yet due
                expected_doses += 1
                sched_iso = sched_dt.isoformat()
                rec = await db.medication_admins.find_one(
                    {"medication_id": m["id"], "scheduled_at": sched_iso}, {"_id": 0}
                )
                if rec and rec.get("status") in ("given", "refused", "self-administered", "withheld"):
                    signed_doses += 1
                else:
                    med_items.append({
                        "label": f"{m['name']} {m['dose']} · {t}",
                        "resident_id": m["resident_id"],
                    })
            except Exception:
                continue
    med_score = 100 if expected_doses == 0 else round(signed_doses * 100.0 / expected_doses)

    # 2) Risk reviews — % residents with non-overdue review
    residents = await db.residents.find({}, {"_id": 0}).to_list(500)
    today_date = now.date().isoformat()
    rr_overdue = []
    for r in residents:
        nxt = r.get("risk_next_review") or ""
        if not nxt or nxt < today_date:
            rr_overdue.append({"label": r.get("name", "—"), "resident_id": r["id"], "due": nxt or "Not set"})
    rr_score = 100 if not residents else round((len(residents) - len(rr_overdue)) * 100.0 / len(residents))

    # 3) Daily notes — % residents with at least one note in last 24h
    notes_missing = []
    for r in residents:
        rec = await db.notes.find_one({"resident_id": r["id"], "created_at": {"$gte": yesterday_iso}})
        if not rec:
            notes_missing.append({"label": r.get("name", "—"), "resident_id": r["id"]})
    notes_score = 100 if not residents else round((len(residents) - len(notes_missing)) * 100.0 / len(residents))

    # 4) Supervisions — % staff supervised in last 30 days
    staff_users = await db.users.find(
        {"role": {"$in": ["staff", "manager"]}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(500)
    sup_cutoff = (now - timedelta(days=30)).date().isoformat()
    sup_overdue = []
    for u in staff_users:
        last = await db.supervisions.find_one(
            {"staff_id": u["id"], "kind": "supervision"}, sort=[("completed_at", -1)]
        )
        if not last or (last.get("completed_at") or "") < sup_cutoff:
            sup_overdue.append({"label": u.get("name", "—"), "staff_id": u["id"]})
    sup_score = 100 if not staff_users else round((len(staff_users) - len(sup_overdue)) * 100.0 / len(staff_users))

    # 5) Safeguarding — open safeguarding incidents > 48h old (target = 0)
    sg_overdue_cutoff = (now - timedelta(hours=48)).isoformat()
    sg_old = await db.incidents.find(
        {"safeguarding": True, "status": "open", "created_at": {"$lt": sg_overdue_cutoff}},
        {"_id": 0, "id": 1, "resident_id": 1, "created_at": 1},
    ).to_list(50)
    sg_score = 100 if not sg_old else max(0, 100 - len(sg_old) * 25)

    # 6) Missing-from-care — episodes still open (target = 0)
    open_missing = await db.missing_episodes.find(
        {"returned_at": None}, {"_id": 0, "id": 1, "resident_id": 1, "reported_at": 1}
    ).to_list(50)
    missing_score = 100 if not open_missing else max(0, 100 - len(open_missing) * 50)

    sections = [
        {
            "id": "medication",
            "title": "Medication (MAR)",
            "score": med_score,
            "summary": f"{signed_doses}/{expected_doses} doses signed today",
            "items": med_items[:10],
            "fix_link": "/medications",
        },
        {
            "id": "risk_reviews",
            "title": "Risk reviews",
            "score": rr_score,
            "summary": f"{len(rr_overdue)} overdue / {len(residents)} residents",
            "items": rr_overdue[:10],
            "fix_link": "/residents",
        },
        {
            "id": "daily_notes",
            "title": "Daily notes (24h)",
            "score": notes_score,
            "summary": f"{len(notes_missing)} residents without note in 24h",
            "items": notes_missing[:10],
            "fix_link": "/notes",
        },
        {
            "id": "supervisions",
            "title": "Staff supervisions (30d)",
            "score": sup_score,
            "summary": f"{len(sup_overdue)} staff overdue / {len(staff_users)}",
            "items": sup_overdue[:10],
            "fix_link": "/supervisions",
        },
        {
            "id": "safeguarding",
            "title": "Safeguarding open >48h",
            "score": sg_score,
            "summary": f"{len(sg_old)} incidents open >48h",
            "items": [{"label": f"Incident {i.get('id','')[:8].upper()}", "incident_id": i.get("id")} for i in sg_old][:10],
            "fix_link": "/incidents",
        },
        {
            "id": "missing",
            "title": "Open missing episodes",
            "score": missing_score,
            "summary": f"{len(open_missing)} child(ren) currently missing",
            "items": [],
            "fix_link": "/residents",
        },
    ]

    overall = round(sum(s["score"] for s in sections) / len(sections))
    if overall >= 90:
        rating = {"label": "Outstanding", "tone": "green"}
    elif overall >= 75:
        rating = {"label": "Good", "tone": "green"}
    elif overall >= 60:
        rating = {"label": "Requires improvement", "tone": "amber"}
    else:
        rating = {"label": "Inadequate", "tone": "red"}

    return {
        "overall": overall,
        "rating": rating,
        "generated_at": now_iso(),
        "sections": sections,
    }


@api_router.get("/ofsted/inspection-bundle/pdf")
async def ofsted_inspection_bundle(user: dict = Depends(require_role("manager", "admin"))):
    """Single-PDF inspection bundle: scorecard + last 30d incidents + active meds + recent missing."""
    # Live readiness (re-use the function above by calling its endpoint logic inline)
    readiness = await ofsted_readiness(_=user)  # type: ignore[arg-type]

    cutoff_30 = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    cutoff_7 = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    incidents = (
        await db.incidents.find(
            {"created_at": {"$gte": cutoff_30}}, {"_id": 0}
        )
        .sort("created_at", -1)
        .to_list(100)
    )
    medications = await db.medications.find(
        {"active": True}, {"_id": 0}
    ).sort("name", 1).to_list(500)
    mar_admins = await db.medication_admins.find(
        {"administered_at": {"$gte": cutoff_7}}, {"_id": 0}
    ).to_list(2000)
    missing_episodes = (
        await db.missing_episodes.find(
            {"reported_at": {"$gte": cutoff_30}}, {"_id": 0}
        )
        .sort("reported_at", -1)
        .to_list(50)
    )
    residents = await db.residents.find({}, {"_id": 0}).to_list(500)
    residents_by_id = {r["id"]: r for r in residents}
    period_label = (
        datetime.now(timezone.utc) - timedelta(days=30)
    ).strftime("%d %b %Y") + " → " + datetime.now(timezone.utc).strftime("%d %b %Y")

    pdf_buf = build_inspection_bundle_pdf(
        readiness=readiness,
        incidents=incidents,
        medications=medications,
        mar_admins=mar_admins,
        missing_episodes=missing_episodes,
        residents_by_id=residents_by_id,
        generated_for=user.get("name", "—"),
        period_label=period_label,
    )
    filename = f"Safelyn_Inspection_Bundle_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ---------- Staff Rotas & Training ----------
class ShiftIn(BaseModel):
    staff_id: str
    staff_name: Optional[str] = None
    role: Optional[str] = None  # e.g. "Lead", "Support", "Sleep-in"
    start_at: str  # ISO datetime
    end_at: str
    notes: Optional[str] = None


class Shift(ShiftIn):
    id: str
    created_at: str


class TrainingIn(BaseModel):
    staff_id: str
    staff_name: Optional[str] = None
    course: str
    completed_on: str  # YYYY-MM-DD
    expires_on: Optional[str] = None  # YYYY-MM-DD
    certificate_no: Optional[str] = None
    provider: Optional[str] = None
    notes: Optional[str] = None


class Training(TrainingIn):
    id: str
    created_at: str


@api_router.get("/staff", response_model=List[dict])
async def list_staff(_: dict = Depends(get_current_user)):
    """List staff users (read-only — for shift / training assignment)."""
    docs = await db.users.find(
        {"role": {"$in": ["staff", "manager", "admin"]}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1},
    ).sort("name", 1).to_list(500)
    return docs


@api_router.get("/shifts")
async def list_shifts(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    q: dict = {}
    if from_date or to_date:
        q["start_at"] = {}
        if from_date:
            q["start_at"]["$gte"] = from_date + "T00:00:00+00:00"
        if to_date:
            q["start_at"]["$lt"] = to_date + "T23:59:59+00:00"
    docs = await db.shifts.find(q, {"_id": 0}).sort("start_at", 1).to_list(500)
    return docs


@api_router.get("/shifts/now")
async def shifts_now(_: dict = Depends(get_current_user)):
    """Who is on shift right now — for the dashboard panel."""
    now = now_iso()
    docs = await db.shifts.find(
        {"start_at": {"$lte": now}, "end_at": {"$gte": now}}, {"_id": 0}
    ).sort("start_at", 1).to_list(50)
    return docs


@api_router.post("/shifts", response_model=Shift)
async def create_shift(payload: ShiftIn, _: dict = Depends(require_role("manager", "admin"))):
    if not payload.staff_name:
        u = await db.users.find_one({"id": payload.staff_id}, {"_id": 0, "name": 1})
        payload.staff_name = (u or {}).get("name") or "—"
    doc = {**payload.model_dump(), "id": str(uuid.uuid4()), "created_at": now_iso()}
    await db.shifts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/shifts/{sid}")
async def delete_shift(sid: str, _: dict = Depends(require_role("manager", "admin"))):
    res = await db.shifts.delete_one({"id": sid})
    return {"deleted": res.deleted_count}


@api_router.get("/trainings")
async def list_trainings(staff_id: Optional[str] = None, _: dict = Depends(get_current_user)):
    q: dict = {}
    if staff_id:
        q["staff_id"] = staff_id
    docs = await db.trainings.find(q, {"_id": 0}).sort("expires_on", 1).to_list(1000)
    return docs


@api_router.get("/trainings/matrix")
async def trainings_matrix(_: dict = Depends(get_current_user)):
    """Cross-staff training matrix with RAG status."""
    today = datetime.now(timezone.utc).date().isoformat()
    soon = (datetime.now(timezone.utc) + timedelta(days=60)).date().isoformat()
    staff = await db.users.find(
        {"role": {"$in": ["staff", "manager", "admin"]}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1},
    ).sort("name", 1).to_list(500)
    trainings = await db.trainings.find({}, {"_id": 0}).to_list(2000)
    by_staff: dict = {}
    for t in trainings:
        by_staff.setdefault(t["staff_id"], []).append(t)
    courses = sorted({t["course"] for t in trainings})
    rows = []
    for u in staff:
        cells = []
        for c in courses:
            recs = [t for t in by_staff.get(u["id"], []) if t["course"] == c]
            if not recs:
                cells.append({"course": c, "status": "missing", "expires_on": None})
                continue
            latest = sorted(recs, key=lambda r: r.get("expires_on") or r.get("completed_on") or "")[-1]
            exp = latest.get("expires_on")
            if not exp:
                status = "ok"
            elif exp < today:
                status = "expired"
            elif exp < soon:
                status = "expiring"
            else:
                status = "ok"
            cells.append({"course": c, "status": status, "expires_on": exp, "id": latest.get("id")})
        rows.append({"staff": u, "cells": cells})
    return {"courses": courses, "rows": rows}


@api_router.post("/trainings", response_model=Training)
async def create_training(payload: TrainingIn, _: dict = Depends(require_role("manager", "admin"))):
    if not payload.staff_name:
        u = await db.users.find_one({"id": payload.staff_id}, {"_id": 0, "name": 1})
        payload.staff_name = (u or {}).get("name") or "—"
    doc = {**payload.model_dump(), "id": str(uuid.uuid4()), "created_at": now_iso()}
    await db.trainings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/trainings/{tid}")
async def delete_training(tid: str, _: dict = Depends(require_role("manager", "admin"))):
    res = await db.trainings.delete_one({"id": tid})
    return {"deleted": res.deleted_count}


# ---------- Statutory Visits & LAC Reviews ----------
VISIT_KIND = Literal[
    "lac_review", "iro_visit", "sw_visit", "regulation_44",
    "regulation_45", "ofsted_visit", "other"
]
VISIT_STATUS = Literal["scheduled", "completed", "missed", "cancelled", "rescheduled"]


class StatutoryVisitIn(BaseModel):
    resident_id: Optional[str] = None  # None = home-wide visit (e.g. Reg 44)
    kind: VISIT_KIND = "lac_review"
    title: Optional[str] = None
    scheduled_for: str  # YYYY-MM-DD
    time: Optional[str] = None
    completed_on: Optional[str] = None
    attended_by: Optional[str] = None
    visitor_role: Optional[str] = None  # "IRO", "Social Worker", "Regulation 44 Visitor"
    location: Optional[str] = None
    status: VISIT_STATUS = "scheduled"
    next_due: Optional[str] = None
    notes: Optional[str] = None
    follow_up: Optional[str] = None


class StatutoryVisit(StatutoryVisitIn):
    id: str
    created_at: str
    created_by_name: Optional[str] = None


@api_router.get("/visits", response_model=List[StatutoryVisit])
async def list_visits(
    resident_id: Optional[str] = None,
    upcoming: bool = False,
    overdue: bool = False,
    _: dict = Depends(get_current_user),
):
    today = datetime.now(timezone.utc).date().isoformat()
    q: dict = {}
    if resident_id:
        q["resident_id"] = resident_id
    if upcoming:
        q["scheduled_for"] = {"$gte": today}
        q["status"] = "scheduled"
    if overdue:
        q["scheduled_for"] = {"$lt": today}
        q["status"] = "scheduled"
    docs = await db.statutory_visits.find(q, {"_id": 0}).sort("scheduled_for", 1).to_list(500)
    return docs


@api_router.post("/visits", response_model=StatutoryVisit)
async def create_visit(payload: StatutoryVisitIn, user: dict = Depends(get_current_user)):
    if payload.resident_id and not await db.residents.find_one(
        {"id": payload.resident_id}, {"_id": 0, "id": 1}
    ):
        raise HTTPException(404, "Resident not found")
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "created_at": now_iso(),
        "created_by_name": user["name"],
    }
    await db.statutory_visits.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/visits/{vid}", response_model=StatutoryVisit)
async def update_visit(vid: str, payload: StatutoryVisitIn, _: dict = Depends(get_current_user)):
    update = payload.model_dump(exclude_unset=True)
    res = await db.statutory_visits.update_one({"id": vid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Visit not found")
    doc = await db.statutory_visits.find_one({"id": vid}, {"_id": 0})
    return doc


@api_router.delete("/visits/{vid}")
async def delete_visit(vid: str, _: dict = Depends(require_role("manager", "admin"))):
    res = await db.statutory_visits.delete_one({"id": vid})
    return {"deleted": res.deleted_count}


@api_router.get("/dashboard/urgency")
async def dashboard_urgency(_: dict = Depends(get_current_user)):
    """Compact widget data for the new dashboard urgency bar."""
    now = datetime.now(timezone.utc)
    today_iso_d = now.date().isoformat()
    last24 = (now - timedelta(hours=24)).isoformat()
    cutoff_review = today_iso_d

    # Overdue risk reviews
    residents = await db.residents.find({}, {"_id": 0}).to_list(500)
    risk_overdue = [
        r for r in residents
        if (r.get("risk_next_review") or "") and r["risk_next_review"] < cutoff_review
    ]

    # Missed medication doses (scheduled but not signed) in last 24h
    meds = await db.medications.find({"active": True, "is_prn": False}, {"_id": 0}).to_list(500)
    missed = 0
    for m in meds:
        for t in m.get("schedule_times", []) or []:
            try:
                hh, mn = t.split(":")
                sched = now.replace(hour=int(hh), minute=int(mn), second=0, microsecond=0)
                if sched > now or sched < (now - timedelta(hours=24)):
                    continue
                rec = await db.medication_admins.find_one(
                    {"medication_id": m["id"], "scheduled_at": sched.isoformat()}, {"_id": 0}
                )
                if not rec:
                    missed += 1
            except Exception:
                pass

    # Open safeguarding incidents
    open_safeguarding = await db.incidents.count_documents(
        {"safeguarding": True, "status": "open"}
    )

    # Open missing episodes
    open_missing = await db.missing_episodes.count_documents({"returned_at": None})

    # Overdue statutory visits
    overdue_visits = await db.statutory_visits.count_documents(
        {"scheduled_for": {"$lt": today_iso_d}, "status": "scheduled"}
    )

    # Upcoming visits next 14 days
    fortnight = (now + timedelta(days=14)).date().isoformat()
    upcoming_visits = await db.statutory_visits.count_documents(
        {"scheduled_for": {"$gte": today_iso_d, "$lte": fortnight}, "status": "scheduled"}
    )

    return {
        "risk_reviews_overdue": len(risk_overdue),
        "missed_doses_24h": missed,
        "open_safeguarding": open_safeguarding,
        "open_missing": open_missing,
        "overdue_visits": overdue_visits,
        "upcoming_visits": upcoming_visits,
    }


@api_router.get("/residents/{rid}/badges")
async def resident_badges(rid: str, _: dict = Depends(get_current_user)):
    """Human-readable priority badges for a resident card."""
    r = await db.residents.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Resident not found")
    today_d = datetime.now(timezone.utc).date().isoformat()
    badges = []

    risk = (r.get("risk_level") or "").lower()
    if risk == "high":
        badges.append({"label": "High Risk", "tone": "red"})

    if r.get("risk_next_review") and r["risk_next_review"] < today_d:
        badges.append({"label": "Risk Review Overdue", "tone": "red"})

    risks = r.get("risks") or {}
    if str(risks.get("absconding") or "").lower().startswith(("high", "active", "moderate")):
        badges.append({"label": "Missing Risk", "tone": "amber"})
    if str(risks.get("self_harm") or "").lower().startswith(("high", "active")):
        badges.append({"label": "Self-Harm Risk", "tone": "red"})
    if str(risks.get("substance") or "").lower() not in ("none", "none known", "", "—"):
        badges.append({"label": "Substance Use", "tone": "amber"})

    # Active missing episode
    open_ep = await db.missing_episodes.find_one({"resident_id": rid, "returned_at": None})
    if open_ep:
        badges.append({"label": "Currently Missing", "tone": "red"})

    # Med-related
    if (r.get("medical") or {}).get("allergies") and (r.get("medical") or {}).get("allergies") not in ("None", "None known", "—"):
        badges.append({"label": "Allergy on File", "tone": "amber"})

    # Recent self-harm or violent incident in last 7d
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recent_sg = await db.incidents.count_documents(
        {"resident_id": rid, "safeguarding": True, "created_at": {"$gte": cutoff}}
    )
    if recent_sg:
        badges.append({"label": "Recent Safeguarding", "tone": "red"})

    # Overdue PEP
    edu = await db.education_records.find_one({"resident_id": rid}, {"_id": 0})
    if edu and edu.get("next_pep_date") and edu["next_pep_date"] < today_d:
        badges.append({"label": "PEP Overdue", "tone": "amber"})

    # Overdue immunisations
    overdue_immu = await db.immunisations.count_documents(
        {"resident_id": rid, "next_due": {"$lt": today_d}}
    )
    if overdue_immu:
        badges.append({"label": "Immunisation Overdue", "tone": "amber"})

    return {"badges": badges}


# ---------- Pocket Money & Personal Allowance ----------
FINANCE_CATEGORY = Literal[
    "pocket",
    "personal_spending",
    "savings",
    "trust_leaving_care",
    "subsistence",
    "clothing",
    "incentives",
    "deductions",
    "staff_purchases",
    "external_income",
    "education_activity",
    "transport",
    "mobile_phone",
    "emergency",
    "gifts",
    "health_personal_care",
    "fines",
]

FIN_DIRECTION = Literal["in", "out"]

FINANCE_CATEGORY_META = [
    {"id": "pocket", "label": "Pocket Money", "subtitle": "Weekly allowance", "tone": "#0e3b4a", "default_direction": "out"},
    {"id": "personal_spending", "label": "Personal Spending", "subtitle": "Discretionary", "tone": "#0e3b4a", "default_direction": "out"},
    {"id": "savings", "label": "Savings", "subtitle": "Long-term savings", "tone": "#2F6A3A", "default_direction": "in"},
    {"id": "trust_leaving_care", "label": "Trust / Leaving Care", "subtitle": "Held in trust", "tone": "#3F4F8C", "default_direction": "in"},
    {"id": "subsistence", "label": "Subsistence", "subtitle": "Food, toiletries, travel", "tone": "#5B6E58", "default_direction": "out"},
    {"id": "clothing", "label": "Clothing", "subtitle": "Seasonal & special", "tone": "#A5556B", "default_direction": "out"},
    {"id": "incentives", "label": "Incentives / Rewards", "subtitle": "Achievement-based", "tone": "#2F6A3A", "default_direction": "in"},
    {"id": "deductions", "label": "Deductions / Sanctions", "subtitle": "Per policy only", "tone": "#A8273A", "default_direction": "out"},
    {"id": "staff_purchases", "label": "Staff Purchases", "subtitle": "On behalf of YP", "tone": "#5d6068", "default_direction": "out"},
    {"id": "external_income", "label": "External Income", "subtitle": "Benefits, wages, family", "tone": "#2F6A3A", "default_direction": "in"},
    {"id": "education_activity", "label": "Education / Activity", "subtitle": "Trips, clubs, school", "tone": "#0e3b4a", "default_direction": "out"},
    {"id": "transport", "label": "Transport / Travel", "subtitle": "Bus, train, taxi", "tone": "#0e3b4a", "default_direction": "out"},
    {"id": "mobile_phone", "label": "Mobile / Comms", "subtitle": "Top-up, plan", "tone": "#0e3b4a", "default_direction": "out"},
    {"id": "emergency", "label": "Emergency Funds", "subtitle": "Reserve", "tone": "#B8772F", "default_direction": "out"},
    {"id": "gifts", "label": "Gifts", "subtitle": "Birthday, Christmas, cultural", "tone": "#A5556B", "default_direction": "out"},
    {"id": "health_personal_care", "label": "Health & Personal Care", "subtitle": "Hair, hygiene", "tone": "#2F6A3A", "default_direction": "out"},
    {"id": "fines", "label": "Fines / Restitution", "subtitle": "Per policy only", "tone": "#A8273A", "default_direction": "out"},
]

_FIN_CATEGORY_IDS = [c["id"] for c in FINANCE_CATEGORY_META]


class PocketMoneyAccountIn(BaseModel):
    weekly_allowance: float = 5.0
    currency: str = "GBP"
    note: Optional[str] = None


class PocketMoneyAccount(PocketMoneyAccountIn):
    resident_id: str
    total_balance: float = 0.0
    category_balances: Dict[str, float] = {}
    last_allowance_paid: Optional[str] = None
    updated_at: Optional[str] = None


class PocketMoneyTxIn(BaseModel):
    category: FINANCE_CATEGORY = "pocket"
    direction: FIN_DIRECTION = "out"
    amount: float
    reason: str
    signed_by_staff_initials: Optional[str] = None
    signed_by_yp_initials: Optional[str] = None
    receipt_attached: bool = False
    notes: Optional[str] = None


class PocketMoneyTx(PocketMoneyTxIn):
    id: str
    resident_id: str
    delta: float
    balance_after_category: float
    balance_after_total: float
    created_at: str
    created_by_name: Optional[str] = None


def _empty_category_balances() -> Dict[str, float]:
    return {c: 0.0 for c in _FIN_CATEGORY_IDS}


async def _ensure_pm_account(resident_id: str) -> dict:
    acct = await db.pocket_money_accounts.find_one({"resident_id": resident_id}, {"_id": 0})
    if not acct:
        acct = {
            "resident_id": resident_id,
            "weekly_allowance": 5.0,
            "currency": "GBP",
            "note": None,
            "category_balances": _empty_category_balances(),
            "total_balance": 0.0,
            "last_allowance_paid": None,
            "updated_at": now_iso(),
        }
        await db.pocket_money_accounts.insert_one(acct)
        acct.pop("_id", None)
    else:
        # Self-heal: ensure all categories present in account doc (e.g. after schema upgrade)
        cb = acct.get("category_balances") or {}
        changed = False
        for c in _FIN_CATEGORY_IDS:
            if c not in cb:
                cb[c] = 0.0
                changed = True
        if changed:
            acct["category_balances"] = cb
            acct["total_balance"] = round(sum(cb.values()), 2)
            await db.pocket_money_accounts.update_one(
                {"resident_id": resident_id},
                {"$set": {"category_balances": cb, "total_balance": acct["total_balance"]}},
            )
    return acct


@api_router.get("/pocket-money/categories")
async def pm_categories(_: dict = Depends(get_current_user)):
    """Static metadata for finance categories — used by the frontend ledger UI."""
    return {"categories": FINANCE_CATEGORY_META}


@api_router.get("/pocket-money", response_model=List[dict])
async def pm_overview(_: dict = Depends(get_current_user)):
    """Cross-home pocket money overview: every resident with totals + last tx."""
    residents = await db.residents.find(
        {}, {"_id": 0, "id": 1, "name": 1, "preferred_name": 1, "room": 1}
    ).sort("name", 1).to_list(500)
    out = []
    for r in residents:
        acct = await _ensure_pm_account(r["id"])
        last_tx = await db.pocket_money_tx.find_one(
            {"resident_id": r["id"]}, {"_id": 0}, sort=[("created_at", -1)]
        )
        cb = acct.get("category_balances") or {}
        out.append({
            "resident_id": r["id"],
            "name": r["name"],
            "preferred_name": r.get("preferred_name"),
            "room": r.get("room"),
            "weekly_allowance": acct["weekly_allowance"],
            "currency": acct.get("currency", "GBP"),
            "total_balance": round(sum(cb.values()), 2),
            "pocket_balance": round(float(cb.get("pocket", 0.0)), 2),
            "savings_balance": round(float(cb.get("savings", 0.0)), 2),
            "last_allowance_paid": acct.get("last_allowance_paid"),
            "last_tx_date": (last_tx or {}).get("created_at"),
            "last_tx_label": (last_tx or {}).get("reason"),
            "last_tx_category": (last_tx or {}).get("category"),
        })
    return out


@api_router.get("/pocket-money/{rid}")
async def pm_for_resident(rid: str, limit: int = 200, _: dict = Depends(get_current_user)):
    if not await db.residents.find_one({"id": rid}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Resident not found")
    acct = await _ensure_pm_account(rid)
    txs = await db.pocket_money_tx.find(
        {"resident_id": rid}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return {"account": acct, "transactions": txs, "categories": FINANCE_CATEGORY_META}


@api_router.patch("/pocket-money/{rid}/account", response_model=PocketMoneyAccount)
async def pm_update_account(
    rid: str,
    payload: PocketMoneyAccountIn,
    _: dict = Depends(require_role("manager", "admin")),
):
    if not await db.residents.find_one({"id": rid}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Resident not found")
    await _ensure_pm_account(rid)
    update = payload.model_dump(exclude_unset=True)
    update["updated_at"] = now_iso()
    await db.pocket_money_accounts.update_one({"resident_id": rid}, {"$set": update})
    acct = await db.pocket_money_accounts.find_one({"resident_id": rid}, {"_id": 0})
    return acct


@api_router.post("/pocket-money/{rid}/transactions", response_model=PocketMoneyTx)
async def pm_add_transaction(
    rid: str, payload: PocketMoneyTxIn, user: dict = Depends(get_current_user)
):
    if not await db.residents.find_one({"id": rid}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Resident not found")
    if payload.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    if payload.category not in _FIN_CATEGORY_IDS:
        raise HTTPException(400, "Invalid category")
    acct = await _ensure_pm_account(rid)
    cb = dict(acct.get("category_balances") or _empty_category_balances())

    sign = +1 if payload.direction == "in" else -1
    delta = round(sign * float(payload.amount), 2)
    cb[payload.category] = round(float(cb.get(payload.category, 0.0)) + delta, 2)
    total = round(sum(cb.values()), 2)

    tx_doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "resident_id": rid,
        "delta": delta,
        "balance_after_category": cb[payload.category],
        "balance_after_total": total,
        "created_at": now_iso(),
        "created_by_name": user["name"],
    }
    await db.pocket_money_tx.insert_one(tx_doc)
    tx_doc.pop("_id", None)

    set_doc = {
        "category_balances": cb,
        "total_balance": total,
        "updated_at": now_iso(),
    }
    if payload.category == "pocket" and payload.direction == "in" and (payload.reason or "").lower().startswith("weekly allowance"):
        set_doc["last_allowance_paid"] = datetime.now(timezone.utc).date().isoformat()
    await db.pocket_money_accounts.update_one({"resident_id": rid}, {"$set": set_doc})
    return tx_doc


@api_router.delete("/pocket-money/transactions/{tx_id}")
async def pm_delete_transaction(tx_id: str, _: dict = Depends(require_role("manager", "admin"))):
    """Reverse and delete a transaction."""
    tx = await db.pocket_money_tx.find_one({"id": tx_id}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Transaction not found")
    rid = tx["resident_id"]
    acct = await _ensure_pm_account(rid)
    cb = dict(acct.get("category_balances") or _empty_category_balances())
    cat = tx.get("category", "pocket")
    cb[cat] = round(float(cb.get(cat, 0.0)) - float(tx.get("delta", 0.0)), 2)
    total = round(sum(cb.values()), 2)
    await db.pocket_money_accounts.update_one(
        {"resident_id": rid},
        {"$set": {"category_balances": cb, "total_balance": total, "updated_at": now_iso()}},
    )
    await db.pocket_money_tx.delete_one({"id": tx_id})
    return {"deleted": 1}


@api_router.get("/pocket-money/{rid}/statement.pdf")
async def pm_statement_pdf(rid: str, month: Optional[str] = None, _: dict = Depends(get_current_user)):
    """Monthly statement PDF (multi-category)."""
    resident = await db.residents.find_one({"id": rid}, {"_id": 0})
    if not resident:
        raise HTTPException(404, "Resident not found")
    acct = await _ensure_pm_account(rid)
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        y, m = map(int, month.split("-"))
        month_start = datetime(y, m, 1, tzinfo=timezone.utc)
        next_month = datetime(y + 1, 1, 1, tzinfo=timezone.utc) if m == 12 else datetime(y, m + 1, 1, tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(400, "month must be YYYY-MM")

    txs = await db.pocket_money_tx.find(
        {
            "resident_id": rid,
            "created_at": {"$gte": month_start.isoformat(), "$lt": next_month.isoformat()},
        },
        {"_id": 0},
    ).sort("created_at", 1).to_list(2000)

    from pocket_money_pdf import build_statement_pdf

    pdf_bytes = build_statement_pdf(
        resident=resident, account=acct, transactions=txs, month_label=month, categories=FINANCE_CATEGORY_META,
    )
    safe_name = (resident.get("name") or "resident").replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=finance_{safe_name}_{month}.pdf"},
    )


# ---------- Petty Cash (home-wide handover float) ----------
PETTY_KIND = Literal["deposit", "spend", "handover", "adjustment"]
PETTY_DIRECTION = Literal["in", "out", "check"]


class PettyCashTxIn(BaseModel):
    kind: PETTY_KIND = "spend"
    direction: PETTY_DIRECTION = "out"
    amount: float  # for handover, this is the verified float at hand-over
    reason: str
    signed_by_outgoing_initials: Optional[str] = None
    signed_by_incoming_initials: Optional[str] = None
    notes: Optional[str] = None


class PettyCashTx(PettyCashTxIn):
    id: str
    delta: float
    balance_after: float
    discrepancy: float = 0.0
    created_at: str
    created_by_name: Optional[str] = None


async def _ensure_petty_cash() -> dict:
    doc = await db.home_petty_cash.find_one({"id": "home"}, {"_id": 0})
    if not doc:
        doc = {
            "id": "home",
            "balance": 0.0,
            "currency": "GBP",
            "last_handover_at": None,
            "last_handover_outgoing": None,
            "last_handover_incoming": None,
            "updated_at": now_iso(),
        }
        await db.home_petty_cash.insert_one(doc)
        doc.pop("_id", None)
    return doc


@api_router.get("/petty-cash")
async def petty_cash_get(limit: int = 100, _: dict = Depends(get_current_user)):
    state = await _ensure_petty_cash()
    txs = await db.home_petty_cash_tx.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"state": state, "transactions": txs}


@api_router.post("/petty-cash/transactions", response_model=PettyCashTx)
async def petty_cash_add(payload: PettyCashTxIn, user: dict = Depends(get_current_user)):
    if payload.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    state = await _ensure_petty_cash()
    balance = float(state.get("balance", 0.0))
    discrepancy = 0.0

    if payload.kind == "handover":
        # Verified count at handover. Both sigs required.
        if not payload.signed_by_outgoing_initials or not payload.signed_by_incoming_initials:
            raise HTTPException(400, "Both outgoing and incoming staff initials required for handover")
        verified = round(float(payload.amount), 2)
        discrepancy = round(verified - balance, 2)
        # Sync running balance to verified amount; record discrepancy on the tx for audit.
        balance = verified
        delta = 0.0
        # Update last_handover trail
        await db.home_petty_cash.update_one(
            {"id": "home"},
            {"$set": {
                "balance": balance,
                "last_handover_at": now_iso(),
                "last_handover_outgoing": payload.signed_by_outgoing_initials,
                "last_handover_incoming": payload.signed_by_incoming_initials,
                "updated_at": now_iso(),
            }},
        )
    else:
        if payload.kind == "deposit" or payload.direction == "in":
            delta = round(float(payload.amount), 2)
        elif payload.kind == "adjustment":
            delta = round(float(payload.amount) * (1 if payload.direction == "in" else -1), 2)
        else:
            delta = round(-float(payload.amount), 2)
        balance = round(balance + delta, 2)
        await db.home_petty_cash.update_one(
            {"id": "home"},
            {"$set": {"balance": balance, "updated_at": now_iso()}},
        )

    tx_doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "delta": delta if payload.kind != "handover" else 0.0,
        "balance_after": balance,
        "discrepancy": discrepancy,
        "created_at": now_iso(),
        "created_by_name": user["name"],
    }
    await db.home_petty_cash_tx.insert_one(tx_doc)
    tx_doc.pop("_id", None)
    return tx_doc


@api_router.delete("/petty-cash/transactions/{tx_id}")
async def petty_cash_delete(tx_id: str, _: dict = Depends(require_role("manager", "admin"))):
    tx = await db.home_petty_cash_tx.find_one({"id": tx_id}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Transaction not found")
    if tx.get("kind") != "handover":
        state = await _ensure_petty_cash()
        new_bal = round(float(state.get("balance", 0.0)) - float(tx.get("delta", 0.0)), 2)
        await db.home_petty_cash.update_one(
            {"id": "home"},
            {"$set": {"balance": new_bal, "updated_at": now_iso()}},
        )
    await db.home_petty_cash_tx.delete_one({"id": tx_id})
    return {"deleted": 1}



# ---------- Notifications ----------
@api_router.post("/notifications", response_model=Notification)
async def create_notification(
    payload: NotificationIn, user: dict = Depends(get_current_user)
):
    incident = await db.incidents.find_one({"id": payload.incident_id}, {"_id": 0})
    if not incident:
        raise HTTPException(404, "Incident not found")
    resident = await db.residents.find_one(
        {"id": incident.get("resident_id")}, {"_id": 0, "name": 1}
    )
    summary = {
        "id": incident["id"],
        "resident_name": (resident or {}).get("name", "—"),
        "severity": incident.get("severity"),
        "incident_type": incident.get("incident_type") or incident.get("category"),
        "safeguarding": bool(incident.get("safeguarding")),
        "body_excerpt": (incident.get("structured_report") or incident.get("body") or "")[:240],
        "created_at": incident.get("created_at"),
    }
    recipient_role = "admin" if payload.kind == "dsl" else "manager"

    # Build notification message
    body_excerpt = (incident.get("structured_report") or incident.get("body") or "")[:240]
    summary = {
        "id": incident["id"],
        "resident_name": (resident or {}).get("name", "—"),
        "severity": incident.get("severity"),
        "incident_type": incident.get("incident_type") or incident.get("category"),
        "safeguarding": bool(incident.get("safeguarding")),
        "body_excerpt": body_excerpt,
        "created_at": incident.get("created_at"),
    }
    msg_text = (payload.message or "").strip() or (
        f"{user.get('name','Staff')} flagged an incident requiring "
        + ("DSL review" if payload.kind == "dsl" else "manager review")
    )

    # Dispatch via notification service (mocked unless keys are configured)
    rcpt = recipient_for(payload.kind)
    public_url = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
    incident_link = (
        f"{public_url}/incidents/{incident['id']}" if public_url else ""
    )
    email_html = (
        f"<div style='font-family:Helvetica,Arial,sans-serif;color:#1c1c1a'>"
        f"<h2 style='color:#0F2A47'>Safelyn Systems · "
        f"{'DSL alert' if payload.kind=='dsl' else 'Manager alert'}</h2>"
        f"<p>{msg_text}</p>"
        f"<p><b>{summary['resident_name']}</b> · {summary['incident_type']} · "
        f"severity {summary['severity']}"
        + (" · <span style='color:#B23A48'><b>SAFEGUARDING</b></span>" if summary["safeguarding"] else "")
        + "</p>"
        f"<blockquote style='border-left:4px solid #1E4D5C;padding:.6rem 1rem;color:#444;background:#f5f5f0'>"
        f"{body_excerpt}</blockquote>"
        + (f"<p><a href='{incident_link}'>Open in Safelyn →</a></p>" if incident_link else "")
        + "</div>"
    )
    sms_body = (
        f"[Safelyn] {('DSL' if payload.kind=='dsl' else 'Manager')} alert · "
        f"{summary['resident_name']} · {summary['severity']} severity. "
        f"{msg_text[:80]}"
    )
    delivery = []
    delivery.append(await send_email(to=rcpt["email"], subject="Safelyn alert · " + (summary["resident_name"] or ""), html=email_html))
    delivery.append(await send_sms(to=rcpt["phone"], body=sms_body))

    doc = {
        "id": str(uuid.uuid4()),
        "incident_id": payload.incident_id,
        "kind": payload.kind,
        "message": msg_text,
        "sent_by_id": user["id"],
        "sent_by_name": user["name"],
        "recipient_role": recipient_role,
        "created_at": now_iso(),
        "read_at": None,
        "incident_summary": summary,
        "delivery": delivery,
        "delivery_mocked": all(d.get("mocked") for d in delivery),
    }
    await db.notifications.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/notifications", response_model=List[Notification])
async def list_notifications(
    unread_only: bool = False, user: dict = Depends(get_current_user)
):
    role = user.get("role")
    # Managers see manager notifications; admins see manager + dsl;
    # staff see only the ones they sent themselves.
    if role == "admin":
        q = {"recipient_role": {"$in": ["manager", "admin"]}}
    elif role == "manager":
        q = {"recipient_role": "manager"}
    else:
        q = {"sent_by_id": user["id"]}
    if unread_only:
        q["read_at"] = None
    docs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@api_router.post("/notifications/{nid}/read", response_model=Notification)
async def mark_notification_read(nid: str, _: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": nid}, {"$set": {"read_at": now_iso()}}
    )
    doc = await db.notifications.find_one({"id": nid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


# ---------- Supervisions & Appraisals ----------
@api_router.get("/supervisions", response_model=List[Supervision])
async def list_supervisions(_: dict = Depends(get_current_user)):
    docs = (
        await db.supervisions.find({}, {"_id": 0})
        .sort("completed_at", -1)
        .to_list(500)
    )
    return docs


@api_router.post("/supervisions", response_model=Supervision)
async def create_supervision(
    payload: SupervisionIn, user: dict = Depends(require_role("manager", "admin"))
):
    staff = await db.users.find_one({"id": payload.staff_id}, {"_id": 0})
    if not staff:
        raise HTTPException(404, "Staff member not found")
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "created_by_id": user["id"],
        "created_by_name": user["name"],
        "created_at": now_iso(),
    }
    await db.supervisions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/supervisions/{sid}")
async def delete_supervision(
    sid: str, _: dict = Depends(require_role("manager", "admin"))
):
    res = await db.supervisions.delete_one({"id": sid})
    return {"deleted": res.deleted_count}


# ---------- Dashboard ----------
@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=7)).isoformat()
    prev_week_start = (now - timedelta(days=14)).isoformat()
    overdue_cutoff = (now - timedelta(hours=48)).isoformat()
    yesterday = (now - timedelta(hours=24)).isoformat()

    total_residents = await db.residents.count_documents({})
    notes_today = await db.notes.count_documents({"created_at": {"$gte": today_start}})
    incidents_week = await db.incidents.count_documents({"created_at": {"$gte": week_start}})
    incidents_prev_week = await db.incidents.count_documents(
        {"created_at": {"$gte": prev_week_start, "$lt": week_start}}
    )
    safeguarding_open = await db.incidents.count_documents(
        {"safeguarding": True, "status": "open"}
    )

    # Risk overview metrics
    high_risk_alerts = await db.incidents.count_documents(
        {
            "$or": [
                {"safeguarding": True, "status": {"$ne": "closed"}},
                {"severity": "high", "status": {"$ne": "closed"}},
            ]
        }
    )
    overdue_tasks = await db.incidents.count_documents(
        {"status": "open", "created_at": {"$lt": overdue_cutoff}}
    )

    # Missing records: residents with no daily note in last 24h
    residents = await db.residents.find({}, {"_id": 0, "id": 1}).to_list(500)
    missing_records = 0
    for r in residents:
        has_recent = await db.notes.find_one(
            {"resident_id": r["id"], "created_at": {"$gte": yesterday}}
        )
        if not has_recent:
            missing_records += 1

    # Trend
    if incidents_prev_week == 0:
        incidents_trend_pct = 100 if incidents_week > 0 else 0
    else:
        incidents_trend_pct = round(
            ((incidents_week - incidents_prev_week) / incidents_prev_week) * 100
        )

    # Staff compliance — Supervisions (every 30 days), Appraisals (every 365 days)
    # We compute against the staff/manager/admin user list. If a user has no
    # supervisions collection record, they are counted as 'due'.
    staff_users = await db.users.find(
        {"role": {"$in": ["staff", "manager"]}}, {"_id": 0, "id": 1, "created_at": 1}
    ).to_list(500)
    sup_cutoff = (now - timedelta(days=30)).isoformat()
    app_cutoff = (now - timedelta(days=365)).isoformat()
    supervisions_due = 0
    appraisals_overdue = 0
    for u in staff_users:
        last_sup = await db.supervisions.find_one(
            {"staff_id": u["id"], "kind": "supervision"},
            sort=[("completed_at", -1)],
        )
        if not last_sup or (last_sup.get("completed_at") or "") < sup_cutoff:
            supervisions_due += 1
        last_app = await db.supervisions.find_one(
            {"staff_id": u["id"], "kind": "appraisal"},
            sort=[("completed_at", -1)],
        )
        if not last_app or (last_app.get("completed_at") or "") < app_cutoff:
            appraisals_overdue += 1

    recent_incidents = (
        await db.incidents.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    )
    recent_notes = await db.notes.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)

    # Top recurring tags this week
    week_incidents = await db.incidents.find(
        {"created_at": {"$gte": week_start}}, {"_id": 0, "tags": 1, "incident_type": 1}
    ).to_list(500)
    tag_counts: dict = {}
    type_counts: dict = {}
    for inc in week_incidents:
        for t in inc.get("tags") or []:
            tag_counts[t] = tag_counts.get(t, 0) + 1
        it = inc.get("incident_type") or "other"
        type_counts[it] = type_counts.get(it, 0) + 1
    top_tags = sorted(tag_counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
    top_types = sorted(type_counts.items(), key=lambda kv: kv[1], reverse=True)[:4]

    return {
        "total_residents": total_residents,
        "notes_today": notes_today,
        "incidents_week": incidents_week,
        "incidents_prev_week": incidents_prev_week,
        "incidents_trend_pct": incidents_trend_pct,
        "safeguarding_open": safeguarding_open,
        "high_risk_alerts": high_risk_alerts,
        "overdue_tasks": overdue_tasks,
        "missing_records": missing_records,
        "supervisions_due": supervisions_due,
        "appraisals_overdue": appraisals_overdue,
        "total_staff": len(staff_users),
        "top_tags": [{"tag": t, "count": c} for t, c in top_tags],
        "top_types": [{"type": t, "count": c} for t, c in top_types],
        "recent_incidents": recent_incidents,
        "recent_notes": recent_notes,
    }


@api_router.get("/")
async def root():
    return {"message": "Care Companion API", "status": "ok"}


# ---------- Startup is handled via lifespan above ----------


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
