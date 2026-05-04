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


# ---------- Setup ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI(title="Care Companion API")
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
    body: str
    safeguarding: bool = False
    action_taken: Optional[str] = ""
    voice_used: bool = False


class Incident(IncidentIn):
    id: str
    author_id: str
    author_name: str
    status: Literal["open", "reviewed", "closed"] = "open"
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
async def login(payload: LoginIn):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
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
    except Exception as e:
        logger.exception("Transcription failed")
        raise HTTPException(500, f"Transcription failed: {e}")


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
        except Exception as e:
            logger.exception("LLM summary failed")
            raise HTTPException(500, f"Summary generation failed: {e}")

    doc = {
        "id": str(uuid.uuid4()),
        "summary": str(summary),
        "from_date": payload.from_date,
        "to_date": payload.to_date,
        "resident_id": payload.resident_id,
        "incident_count": len(incidents),
        "note_count": len(notes),
        "generated_by": user["name"],
        "created_at": now_iso(),
    }
    await db.reports.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/reports", response_model=List[ReportOut])
async def list_reports(_: dict = Depends(require_role("manager", "admin"))):
    docs = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


# ---------- Dashboard ----------
@api_router.get("/dashboard/stats")
async def dashboard_stats(_: dict = Depends(get_current_user)):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    total_residents = await db.residents.count_documents({})
    notes_today = await db.notes.count_documents({"created_at": {"$gte": today_start}})
    incidents_week = await db.incidents.count_documents({"created_at": {"$gte": week_start}})
    safeguarding_open = await db.incidents.count_documents({"safeguarding": True, "status": "open"})

    recent_incidents = (
        await db.incidents.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    )
    recent_notes = await db.notes.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)

    return {
        "total_residents": total_residents,
        "notes_today": notes_today,
        "incidents_week": incidents_week,
        "safeguarding_open": safeguarding_open,
        "recent_incidents": recent_incidents,
        "recent_notes": recent_notes,
    }


@api_router.get("/")
async def root():
    return {"message": "Care Companion API", "status": "ok"}


# ---------- Startup ----------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.residents.create_index("created_at")
    await db.notes.create_index([("resident_id", 1), ("created_at", -1)])
    await db.incidents.create_index([("resident_id", 1), ("created_at", -1)])

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

    # Seed test manager + staff if missing
    for email, name, role, pwd in [
        ("manager@care.local", "Sarah Manager", "manager", "Manager@123"),
        ("staff@care.local", "Alex Staff", "staff", "Staff@123"),
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
