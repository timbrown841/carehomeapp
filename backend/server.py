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
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, field_validator

from emergentintegrations.llm.openai import OpenAISpeechToText
from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager

from pdf_builder import build_incident_pdf, build_report_pdf
from missing_pack_pdf import build_missing_pack_pdf
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
    if (await db.residents.count_documents({}) > 0) and sample and sample.get("legal_status"):
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

    logger.info("Demo data seeded.")

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
