"""Phase H — Policy Management & Induction routes.

Mounted as an APIRouter into server.py. RBAC:
- Manager / Admin (tier >= 3) — full management, signatures, assignments, evidence PDFs
- All authed users — read assigned policies, complete assessments, sign declarations
"""
from __future__ import annotations

import uuid
import io
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import .policy_management as pm

router = APIRouter(prefix="/api", tags=["Policies & Induction"])


# These are set by server.py after import to avoid circular imports
_db = None
_get_current_user = None
_require_tier = None
_record_audit = None


def init(*, db, get_current_user, require_tier, record_audit):
    global _db, _get_current_user, _require_tier, _record_audit
    _db = db
    _get_current_user = get_current_user
    _require_tier = require_tier
    _record_audit = record_audit


# ---- Pydantic in-models --------------------------------------------------


class PolicyIn(BaseModel):
    title: str = Field(..., max_length=200)
    category: str = Field(..., max_length=200)
    sector: str = Field(..., pattern="^(children|adult)$")
    summary: Optional[str] = Field(None, max_length=2000)
    review_date: Optional[str] = None
    expiry_date: Optional[str] = None


class PolicyPatch(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    review_date: Optional[str] = None
    expiry_date: Optional[str] = None
    category: Optional[str] = None


class PolicyVersionIn(BaseModel):
    version: str = Field(..., max_length=20)
    file_id: Optional[str] = None
    content_text: Optional[str] = Field(None, max_length=100_000)
    change_summary: Optional[str] = Field(None, max_length=2000)
    effective_date: Optional[str] = None


class PolicyQuestionIn(BaseModel):
    type: str = Field(..., pattern="^(mcq|reflection)$")
    question: str = Field(..., max_length=1000)
    options: Optional[list[str]] = None
    correct_index: Optional[int] = None
    order: int = 0


class AssignmentIn(BaseModel):
    policy_id: str
    staff_id: str
    due_date: Optional[str] = None


class AssessmentIn(BaseModel):
    answers: list[dict]


class SignatureIn(BaseModel):
    name: str = Field(..., max_length=200)
    signature: str = Field(..., max_length=500)  # typed signature or drawn-image data URI


class InductionPackIn(BaseModel):
    name: str
    sector: str = Field(..., pattern="^(children|adult)$")
    description: Optional[str] = None
    weeks: list[dict]


class EnrollmentIn(BaseModel):
    pack_id: str
    staff_id: str
    start_date: Optional[str] = None


class SopUploadIn(BaseModel):
    sector: str = Field(..., pattern="^(children|adult)$")
    version: str = Field(..., max_length=20)
    file_id: Optional[str] = None
    content_text: Optional[str] = Field(None, max_length=200_000)
    change_summary: Optional[str] = Field(None, max_length=2000)
    effective_date: Optional[str] = None
    review_date: Optional[str] = None
    questions: Optional[list[dict]] = None
    author_name: Optional[str] = Field(None, max_length=200)


# ---- Helpers -------------------------------------------------------------


def _serialise(doc: dict) -> dict:
    if not doc:
        return doc
    return {k: v for k, v in doc.items() if k != "_id"}


async def _hydrate_policy(p: dict) -> dict:
    """Attach computed RAG + current version + assignment counters."""
    p = _serialise(p)
    p["rag_status"] = pm.policy_rag_status(p)
    if p.get("current_version_id"):
        v = await _db.policy_versions.find_one({"id": p["current_version_id"]}, {"_id": 0})
        p["current_version"] = v
    return p


async def _get_or_404(coll, _id: str, msg: str):
    doc = await coll.find_one({"id": _id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, msg)
    return doc


# ---- Category routes -----------------------------------------------------


@router.get("/policy-categories")
async def list_categories(
    sector: Optional[str] = None,
    user: dict = Depends(lambda: _get_current_user()),
):
    # NOTE — dependency wiring resolved at mount; see init()
    raise HTTPException(501, "policy module not initialised")


# Real handlers below — overwriting after init() wires dependencies.


# ---- Initialise routes (factory) ----------------------------------------

def build_routes():
    """Create the actual routes once init() has been called. Must run after
    server.py supplies the dependencies."""
    router.routes.clear()

    @router.get("/policy-categories")
    async def list_categories(
        sector: Optional[str] = None,
        _: dict = Depends(_get_current_user),
    ):
        q = {"sector": sector} if sector else {}
        docs = await _db.policy_categories.find(q, {"_id": 0}).sort("name", 1).to_list(200)
        return {"categories": docs, "count": len(docs)}

    @router.get("/policies")
    async def list_policies(
        sector: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[str] = None,
        _: dict = Depends(_get_current_user),
    ):
        q: dict = {}
        if sector: q["sector"] = sector
        if category: q["category"] = category
        if status: q["status"] = status
        else: q["status"] = "active"
        docs = await _db.policies.find(q, {"_id": 0}).sort([("category", 1), ("title", 1)]).to_list(500)
        hydrated = [await _hydrate_policy(p) for p in docs]
        return {"policies": hydrated, "count": len(hydrated)}

    @router.get("/policies/folders")
    async def list_folders(
        sector: str = Query(..., pattern="^(children|adult)$"),
        _: dict = Depends(_get_current_user),
    ):
        """Return category folders with aggregated metadata for the library UI."""
        cats = await _db.policy_categories.find({"sector": sector}, {"_id": 0}).sort("name", 1).to_list(200)
        folders = []
        for c in cats:
            policies = await _db.policies.find(
                {"sector": sector, "category": c["name"], "status": "active"},
                {"_id": 0},
            ).to_list(200)
            count = len(policies)
            last_updated = max((p.get("updated_at", "") for p in policies), default=None)
            rags = [pm.policy_rag_status(p) for p in policies]
            if any(r == "red" for r in rags):
                folder_rag = "red"
            elif any(r == "amber" for r in rags):
                folder_rag = "amber"
            elif rags:
                folder_rag = "green"
            else:
                folder_rag = "grey"
            folders.append({
                "category": c["name"],
                "sector": sector,
                "count": count,
                "last_updated": last_updated,
                "rag_status": folder_rag,
            })
        return {"folders": folders, "count": len(folders)}

    @router.post("/policies")
    async def create_policy(payload: PolicyIn, user: dict = Depends(_require_tier(3))):
        now = pm.now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            **payload.model_dump(),
            "status": "active",
            "current_version_id": None,
            "created_at": now,
            "updated_at": now,
            "created_by_id": user.get("id"),
            "created_by_name": user.get("name"),
        }
        await _db.policies.insert_one(doc.copy())
        await _record_audit(
            _db, actor=user, action="policy_created",
            object_type="policy", object_id=doc["id"],
            metadata={"category": doc["category"], "sector": doc["sector"]},
            summary=f"Policy created: {doc['title']}",
        )
        return _serialise(doc)

    @router.get("/policies/{pid}")
    async def get_policy(pid: str, _: dict = Depends(_get_current_user)):
        p = await _get_or_404(_db.policies, pid, "Policy not found")
        out = await _hydrate_policy(p)
        out["versions"] = await _db.policy_versions.find(
            {"policy_id": pid}, {"_id": 0}
        ).sort("created_at", -1).to_list(200)
        out["questions"] = await _db.policy_questions.find(
            {"policy_id": pid}, {"_id": 0}
        ).sort("order", 1).to_list(200)
        return out

    @router.patch("/policies/{pid}")
    async def patch_policy(pid: str, payload: PolicyPatch, user: dict = Depends(_require_tier(3))):
        p = await _get_or_404(_db.policies, pid, "Policy not found")
        update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        update["updated_at"] = pm.now_iso()
        await _db.policies.update_one({"id": pid}, {"$set": update})
        await _record_audit(
            _db, actor=user, action="policy_updated",
            object_type="policy", object_id=pid,
            metadata={"changes": list(update.keys())},
            summary=f"Policy updated: {p['title']}",
        )
        return _serialise({**p, **update})

    @router.post("/policies/{pid}/archive")
    async def archive_policy(pid: str, user: dict = Depends(_require_tier(3))):
        p = await _get_or_404(_db.policies, pid, "Policy not found")
        await _db.policies.update_one(
            {"id": pid},
            {"$set": {"status": "archived", "archived_at": pm.now_iso(),
                      "archived_by_id": user.get("id"),
                      "archived_by_name": user.get("name")}},
        )
        await _record_audit(
            _db, actor=user, action="policy_archived",
            object_type="policy", object_id=pid,
            summary=f"Policy archived: {p['title']}",
        )
        return {"ok": True}

    @router.post("/policies/{pid}/versions")
    async def add_version(pid: str, payload: PolicyVersionIn,
                          user: dict = Depends(_require_tier(3))):
        p = await _get_or_404(_db.policies, pid, "Policy not found")
        # Archive the previous current version
        if p.get("current_version_id"):
            await _db.policy_versions.update_one(
                {"id": p["current_version_id"]},
                {"$set": {"archived_at": pm.now_iso()}},
            )
        now = pm.now_iso()
        v = {
            "id": str(uuid.uuid4()),
            "policy_id": pid,
            "version": payload.version,
            "file_id": payload.file_id,
            "content_text": payload.content_text,
            "change_summary": payload.change_summary,
            "effective_date": payload.effective_date or now,
            "created_at": now,
            "uploaded_by_id": user.get("id"),
            "uploaded_by_name": user.get("name"),
            "archived_at": None,
        }
        await _db.policy_versions.insert_one(v.copy())
        await _db.policies.update_one(
            {"id": pid},
            {"$set": {"current_version_id": v["id"], "updated_at": now}},
        )
        await _record_audit(
            _db, actor=user, action="policy_version_added",
            object_type="policy", object_id=pid,
            metadata={"version": payload.version},
            summary=f"Policy version {payload.version} uploaded: {p['title']}",
        )
        return _serialise(v)

    @router.get("/policies/{pid}/versions")
    async def list_versions(pid: str, _: dict = Depends(_get_current_user)):
        docs = await _db.policy_versions.find(
            {"policy_id": pid}, {"_id": 0}
        ).sort("created_at", -1).to_list(200)
        return {"versions": docs, "count": len(docs)}

    @router.post("/policies/{pid}/questions")
    async def set_questions(pid: str, payload: dict = Body(...),
                            user: dict = Depends(_require_tier(3))):
        """Replace the question set for a policy. payload: {questions: [PolicyQuestionIn]}"""
        await _get_or_404(_db.policies, pid, "Policy not found")
        questions = (payload or {}).get("questions") or []
        await _db.policy_questions.delete_many({"policy_id": pid})
        docs = []
        for i, q in enumerate(questions):
            qm = PolicyQuestionIn(**q)
            doc = {
                "id": str(uuid.uuid4()),
                "policy_id": pid,
                "type": qm.type,
                "question": qm.question,
                "options": qm.options if qm.type == "mcq" else None,
                "correct_index": qm.correct_index if qm.type == "mcq" else None,
                "order": qm.order if qm.order is not None else i,
                "created_at": pm.now_iso(),
            }
            docs.append(doc)
        if docs:
            await _db.policy_questions.insert_many(docs)
        await _record_audit(
            _db, actor=user, action="policy_questions_set",
            object_type="policy", object_id=pid,
            metadata={"question_count": len(docs)},
            summary=f"Assessment questions set ({len(docs)} items)",
        )
        return {"ok": True, "count": len(docs)}

    # ---- Assignments ----

    @router.post("/policy-assignments")
    async def create_assignment(payload: AssignmentIn, user: dict = Depends(_require_tier(3))):
        p = await _get_or_404(_db.policies, payload.policy_id, "Policy not found")
        staff = await _db.users.find_one({"id": payload.staff_id}, {"_id": 0})
        if not staff:
            raise HTTPException(404, "Staff member not found")
        # De-duplicate: if an open assignment already exists, return it
        existing = await _db.policy_assignments.find_one(
            {"policy_id": payload.policy_id, "staff_id": payload.staff_id,
             "status": {"$ne": "complete"}},
            {"_id": 0},
        )
        if existing:
            return existing
        now = pm.now_iso()
        due = payload.due_date or (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "policy_id": payload.policy_id,
            "policy_title": p["title"],
            "policy_category": p.get("category"),
            "policy_sector": p.get("sector"),
            "version_id_at_assignment": p.get("current_version_id"),
            "staff_id": payload.staff_id,
            "staff_name": staff.get("name"),
            "staff_email": staff.get("email"),
            "assigned_by_id": user.get("id"),
            "assigned_by_name": user.get("name"),
            "assigned_at": now,
            "due_date": due,
            "status": "assigned",
            "opened_at": None,
            "assessment_score": None,
            "assessment_passed_at": None,
            "reflection_answers": None,
            "staff_sig_at": None,
            "staff_sig_name": None,
            "manager_sig_at": None,
            "manager_sig_by_id": None,
            "manager_sig_by_name": None,
            "completed_at": None,
        }
        await _db.policy_assignments.insert_one(doc.copy())
        await _record_audit(
            _db, actor=user, action="policy_assigned",
            object_type="policy_assignment", object_id=doc["id"],
            metadata={"policy_id": payload.policy_id, "staff_id": payload.staff_id},
            summary=f"Assigned '{p['title']}' to {staff.get('name')}",
        )
        return _serialise(doc)

    @router.get("/policy-assignments")
    async def list_assignments(
        staff_id: Optional[str] = None,
        status: Optional[str] = None,
        policy_id: Optional[str] = None,
        user: dict = Depends(_require_tier(3)),
    ):
        q: dict = {}
        if staff_id: q["staff_id"] = staff_id
        if status: q["status"] = status
        if policy_id: q["policy_id"] = policy_id
        docs = await _db.policy_assignments.find(q, {"_id": 0}).sort("assigned_at", -1).to_list(500)
        # Project overdue
        for d in docs:
            d["status"] = "overdue" if pm.is_overdue(d) and d.get("status") != "complete" else pm.compute_assignment_status(d)
        return {"assignments": docs, "count": len(docs)}

    @router.get("/policy-assignments/mine")
    async def list_my_assignments(user: dict = Depends(_get_current_user)):
        docs = await _db.policy_assignments.find(
            {"staff_id": user.get("id")}, {"_id": 0},
        ).sort("assigned_at", -1).to_list(200)
        for d in docs:
            d["status"] = "overdue" if pm.is_overdue(d) and d.get("status") != "complete" else pm.compute_assignment_status(d)
        return {"assignments": docs, "count": len(docs)}

    @router.get("/policy-assignments/{aid}")
    async def get_assignment(aid: str, user: dict = Depends(_get_current_user)):
        a = await _get_or_404(_db.policy_assignments, aid, "Assignment not found")
        # Staff can only see their own; managers see all
        role = user.get("role")
        if role not in ("manager", "admin") and a.get("staff_id") != user.get("id"):
            raise HTTPException(403, "Not authorised to view this assignment")
        # Hydrate with policy + version + questions
        policy = await _db.policies.find_one({"id": a["policy_id"]}, {"_id": 0})
        version = None
        if a.get("version_id_at_assignment"):
            version = await _db.policy_versions.find_one(
                {"id": a["version_id_at_assignment"]}, {"_id": 0},
            )
        questions = await _db.policy_questions.find(
            {"policy_id": a["policy_id"]}, {"_id": 0},
        ).sort("order", 1).to_list(200)
        # Hide correct_index from staff
        if role not in ("manager", "admin"):
            for q in questions:
                q.pop("correct_index", None)
        a["status"] = "overdue" if pm.is_overdue(a) and a.get("status") != "complete" else pm.compute_assignment_status(a)
        a["policy"] = policy
        a["version"] = version
        a["questions"] = questions
        return a

    @router.post("/policy-assignments/{aid}/open")
    async def open_assignment(aid: str, user: dict = Depends(_get_current_user)):
        a = await _get_or_404(_db.policy_assignments, aid, "Assignment not found")
        if a.get("staff_id") != user.get("id"):
            raise HTTPException(403, "Only the assigned staff member can open this")
        if a.get("opened_at"):
            return a
        await _db.policy_assignments.update_one(
            {"id": aid},
            {"$set": {"opened_at": pm.now_iso(), "status": "in_progress"}},
        )
        await _record_audit(
            _db, actor=user, action="policy_opened",
            object_type="policy_assignment", object_id=aid,
            metadata={"policy_id": a["policy_id"]},
            summary=f"{user.get('name')} opened '{a.get('policy_title')}'",
        )
        return await _get_or_404(_db.policy_assignments, aid, "Assignment not found")

    @router.post("/policy-assignments/{aid}/assessment")
    async def submit_assessment(aid: str, payload: AssessmentIn,
                                user: dict = Depends(_get_current_user)):
        a = await _get_or_404(_db.policy_assignments, aid, "Assignment not found")
        if a.get("staff_id") != user.get("id"):
            raise HTTPException(403, "Only the assigned staff member can submit")
        if a.get("manager_sig_at"):
            raise HTTPException(400, "Assignment is already completed")
        questions = await _db.policy_questions.find(
            {"policy_id": a["policy_id"]}, {"_id": 0},
        ).sort("order", 1).to_list(200)
        result = pm.grade_mcq(questions, payload.answers or [])
        now = pm.now_iso()
        response_doc = {
            "id": str(uuid.uuid4()),
            "assignment_id": aid,
            "policy_id": a["policy_id"],
            "staff_id": user.get("id"),
            "submitted_at": now,
            "score_pct": result["score_pct"],
            "passed": result["passed"],
            "mcq_total": result["mcq_total"],
            "mcq_correct": result["mcq_correct"],
            "per_question": result["per_question"],
        }
        await _db.policy_assessment_responses.insert_one(response_doc.copy())
        update = {
            "assessment_score": result["score_pct"],
            "reflection_answers": [
                p for p in result["per_question"] if p.get("type") == "reflection"
            ],
        }
        if result["passed"]:
            update["assessment_passed_at"] = now
            update["status"] = "awaiting_staff_signature"
        else:
            update["status"] = "assessment_pending"
        await _db.policy_assignments.update_one({"id": aid}, {"$set": update})
        await _record_audit(
            _db, actor=user, action="policy_assessment_submitted",
            object_type="policy_assignment", object_id=aid,
            metadata={"score_pct": result["score_pct"], "passed": result["passed"]},
            summary=f"Assessment submitted · {result['score_pct']}% · {'PASSED' if result['passed'] else 'NOT PASSED'}",
        )
        return {"ok": True, "result": _serialise(response_doc)}

    @router.post("/policy-assignments/{aid}/staff-sign")
    async def staff_sign(aid: str, payload: SignatureIn,
                         user: dict = Depends(_get_current_user)):
        a = await _get_or_404(_db.policy_assignments, aid, "Assignment not found")
        if a.get("staff_id") != user.get("id"):
            raise HTTPException(403, "Only the assigned staff member can sign")
        if not a.get("assessment_passed_at"):
            raise HTTPException(400, "Pass the assessment before signing")
        now = pm.now_iso()
        await _db.policy_assignments.update_one(
            {"id": aid},
            {"$set": {
                "staff_sig_at": now,
                "staff_sig_name": payload.name,
                "staff_sig_signature": payload.signature,
                "staff_declaration":
                    "I confirm I have read, understood and will follow this policy "
                    "in my day-to-day practice.",
                "status": "awaiting_manager_sign_off",
            }},
        )
        await _record_audit(
            _db, actor=user, action="policy_staff_signed",
            object_type="policy_assignment", object_id=aid,
            metadata={"policy_id": a["policy_id"]},
            summary=f"Staff signed declaration for '{a.get('policy_title')}'",
        )
        return {"ok": True}

    @router.post("/policy-assignments/{aid}/manager-sign")
    async def manager_sign(aid: str, payload: SignatureIn,
                           user: dict = Depends(_require_tier(3))):
        a = await _get_or_404(_db.policy_assignments, aid, "Assignment not found")
        if not a.get("staff_sig_at"):
            raise HTTPException(400, "Staff must sign before manager countersignature")
        now = pm.now_iso()
        await _db.policy_assignments.update_one(
            {"id": aid},
            {"$set": {
                "manager_sig_at": now,
                "manager_sig_by_id": user.get("id"),
                "manager_sig_by_name": payload.name or user.get("name"),
                "manager_sig_signature": payload.signature,
                "manager_declaration":
                    "I have discussed this policy with the employee and am satisfied "
                    "they understand the contents.",
                "status": "complete",
                "completed_at": now,
            }},
        )
        await _record_audit(
            _db, actor=user, action="policy_manager_signed",
            object_type="policy_assignment", object_id=aid,
            metadata={"policy_id": a["policy_id"], "staff_id": a["staff_id"]},
            summary=f"Manager countersigned '{a.get('policy_title')}' for {a.get('staff_name')}",
        )
        return {"ok": True}

    @router.delete("/policy-assignments/{aid}")
    async def delete_assignment(aid: str, user: dict = Depends(_require_tier(4))):
        a = await _get_or_404(_db.policy_assignments, aid, "Assignment not found")
        await _db.policy_assignments.delete_one({"id": aid})
        await _record_audit(
            _db, actor=user, action="policy_assignment_deleted",
            object_type="policy_assignment", object_id=aid,
            summary=f"Assignment deleted: {a.get('policy_title')}",
        )
        return {"ok": True}

    # ---- Induction packs & enrollments ----

    @router.get("/induction-packs")
    async def list_packs(
        sector: Optional[str] = None,
        _: dict = Depends(_get_current_user),
    ):
        q = {"sector": sector} if sector else {}
        docs = await _db.induction_packs.find(q, {"_id": 0}).sort("created_at", 1).to_list(50)
        return {"packs": docs, "count": len(docs)}

    @router.post("/induction-packs")
    async def create_pack(payload: InductionPackIn, user: dict = Depends(_require_tier(3))):
        now = pm.now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            **payload.model_dump(),
            "is_default": False,
            "created_at": now,
            "updated_at": now,
            "created_by_id": user.get("id"),
            "created_by_name": user.get("name"),
        }
        await _db.induction_packs.insert_one(doc.copy())
        await _record_audit(
            _db, actor=user, action="induction_pack_created",
            object_type="induction_pack", object_id=doc["id"],
            metadata={"sector": doc["sector"]},
            summary=f"Induction pack created: {doc['name']}",
        )
        return _serialise(doc)

    @router.patch("/induction-packs/{kid}")
    async def patch_pack(kid: str, payload: dict = Body(...),
                         user: dict = Depends(_require_tier(3))):
        await _get_or_404(_db.induction_packs, kid, "Induction pack not found")
        allowed = {"name", "description", "weeks"}
        update = {k: v for k, v in (payload or {}).items() if k in allowed}
        update["updated_at"] = pm.now_iso()
        await _db.induction_packs.update_one({"id": kid}, {"$set": update})
        await _record_audit(
            _db, actor=user, action="induction_pack_updated",
            object_type="induction_pack", object_id=kid,
            metadata={"changes": list(update.keys())},
            summary="Induction pack updated",
        )
        return {"ok": True}

    @router.post("/induction-enrollments")
    async def enroll_staff(payload: EnrollmentIn, user: dict = Depends(_require_tier(3))):
        pack = await _get_or_404(_db.induction_packs, payload.pack_id, "Induction pack not found")
        staff = await _db.users.find_one({"id": payload.staff_id}, {"_id": 0})
        if not staff:
            raise HTTPException(404, "Staff member not found")
        # Auto-assign every policy in the pack (by category). Skip categories
        # that don't have an active policy yet — they remain "Not Assigned"
        # until the manager uploads the policy.
        now = pm.now_iso()
        start = payload.start_date or now
        assignments_created: list[dict] = []
        weeks_resolved: list[dict] = []
        for w_idx, week in enumerate(pack.get("weeks", []) or []):
            week_due = (datetime.fromisoformat(start.replace("Z", "+00:00"))
                        + timedelta(days=7 * (w_idx + 1))).isoformat()
            week_entry = {"week_no": week.get("week_no", w_idx + 1),
                          "title": week.get("title"),
                          "categories": week.get("categories", []),
                          "assignments": []}
            for cat in week.get("categories", []) or []:
                policy = await _db.policies.find_one({
                    "sector": pack["sector"], "category": cat, "status": "active",
                }, {"_id": 0})
                if not policy:
                    week_entry["assignments"].append({"category": cat, "status": "not_assigned"})
                    continue
                # Use existing assignment if any, else create
                ex = await _db.policy_assignments.find_one(
                    {"policy_id": policy["id"], "staff_id": payload.staff_id,
                     "status": {"$ne": "complete"}}, {"_id": 0},
                )
                if ex:
                    week_entry["assignments"].append({
                        "category": cat, "assignment_id": ex["id"], "status": ex["status"],
                    })
                    continue
                a_doc = {
                    "id": str(uuid.uuid4()),
                    "policy_id": policy["id"],
                    "policy_title": policy["title"],
                    "policy_category": policy.get("category"),
                    "policy_sector": policy.get("sector"),
                    "version_id_at_assignment": policy.get("current_version_id"),
                    "staff_id": payload.staff_id,
                    "staff_name": staff.get("name"),
                    "staff_email": staff.get("email"),
                    "assigned_by_id": user.get("id"),
                    "assigned_by_name": user.get("name"),
                    "assigned_at": now,
                    "due_date": week_due,
                    "status": "assigned",
                    "opened_at": None,
                    "assessment_score": None,
                    "assessment_passed_at": None,
                    "staff_sig_at": None,
                    "manager_sig_at": None,
                    "completed_at": None,
                    "induction_pack_id": payload.pack_id,
                    "induction_week": week_entry["week_no"],
                }
                await _db.policy_assignments.insert_one(a_doc.copy())
                assignments_created.append({"id": a_doc["id"]})
                week_entry["assignments"].append({
                    "category": cat, "assignment_id": a_doc["id"], "status": "assigned",
                })
            weeks_resolved.append(week_entry)
        enrollment = {
            "id": str(uuid.uuid4()),
            "pack_id": payload.pack_id,
            "pack_name": pack["name"],
            "sector": pack["sector"],
            "staff_id": payload.staff_id,
            "staff_name": staff.get("name"),
            "start_date": start,
            "started_at": now,
            "started_by_id": user.get("id"),
            "started_by_name": user.get("name"),
            "weeks": weeks_resolved,
        }
        await _db.induction_enrollments.insert_one(enrollment.copy())
        await _record_audit(
            _db, actor=user, action="induction_enrolled",
            object_type="induction_enrollment", object_id=enrollment["id"],
            metadata={"pack_id": payload.pack_id, "staff_id": payload.staff_id,
                      "assignments_created": len(assignments_created)},
            summary=f"Enrolled {staff.get('name')} into '{pack['name']}'",
        )
        return _serialise(enrollment)

    @router.get("/induction-enrollments")
    async def list_enrollments(
        staff_id: Optional[str] = None,
        sector: Optional[str] = None,
        _: dict = Depends(_require_tier(3)),
    ):
        q: dict = {}
        if staff_id: q["staff_id"] = staff_id
        if sector: q["sector"] = sector
        docs = await _db.induction_enrollments.find(q, {"_id": 0}).sort("started_at", -1).to_list(200)
        # Hydrate per-enrollment completion %
        for e in docs:
            aids = []
            for w in e.get("weeks", []):
                for entry in w.get("assignments", []):
                    if entry.get("assignment_id"):
                        aids.append(entry["assignment_id"])
            total = len(aids)
            done = 0
            if aids:
                done = await _db.policy_assignments.count_documents(
                    {"id": {"$in": aids}, "status": "complete"},
                )
            e["completion_total"] = total
            e["completion_done"] = done
            e["completion_pct"] = round(done / total * 100.0, 1) if total else 0.0
        return {"enrollments": docs, "count": len(docs)}

    # ---- Compliance dashboard ----

    @router.get("/policy-compliance/dashboard")
    async def compliance_dashboard(
        sector: Optional[str] = None,
        _: dict = Depends(_require_tier(3)),
    ):
        now = datetime.now(timezone.utc)
        q_assignment: dict = {}
        if sector:
            q_assignment["policy_sector"] = sector
        all_assignments = await _db.policy_assignments.find(q_assignment, {"_id": 0}).to_list(5000)
        total = len(all_assignments)
        complete = [a for a in all_assignments if a.get("status") == "complete" or a.get("manager_sig_at")]
        overdue = [a for a in all_assignments if pm.is_overdue(a, now)]
        awaiting_manager = [a for a in all_assignments
                            if a.get("staff_sig_at") and not a.get("manager_sig_at")]
        failed_assess = [a for a in all_assignments
                         if a.get("assessment_score") is not None and a.get("assessment_score") < 80]
        in_induction_q: dict = {}
        if sector: in_induction_q["sector"] = sector
        in_induction = await _db.induction_enrollments.find(in_induction_q, {"_id": 0}).to_list(500)
        # Average completion (days) of completed assignments
        durations = []
        for a in complete:
            try:
                start = datetime.fromisoformat((a.get("assigned_at") or "").replace("Z", "+00:00"))
                end_iso = a.get("completed_at") or a.get("manager_sig_at")
                end = datetime.fromisoformat((end_iso or "").replace("Z", "+00:00"))
                durations.append((end - start).total_seconds() / 86400.0)
            except (ValueError, AttributeError):
                continue
        avg_days = round(sum(durations) / len(durations), 1) if durations else None
        comp_pct = round(len(complete) / total * 100.0, 1) if total else 0.0
        return {
            "total_assignments": total,
            "complete": len(complete),
            "completion_pct": comp_pct,
            "overdue": len(overdue),
            "awaiting_manager_sign_off": len(awaiting_manager),
            "failed_assessments": len(failed_assess),
            "in_induction": len(in_induction),
            "avg_completion_days": avg_days,
            "rag_status": (
                "red" if (len(overdue) >= 3 or comp_pct < 50)
                else "amber" if (len(overdue) > 0 or comp_pct < 80)
                else "green"
            ),
        }

    # ---- Evidence PDF ----

    @router.get("/policy-compliance/evidence.pdf")
    async def evidence_pdf(
        staff_id: str = Query(...),
        user: dict = Depends(_require_tier(3)),
    ):
        staff = await _db.users.find_one({"id": staff_id}, {"_id": 0})
        if not staff:
            raise HTTPException(404, "Staff member not found")
        assignments = await _db.policy_assignments.find(
            {"staff_id": staff_id}, {"_id": 0},
        ).sort("assigned_at", 1).to_list(500)
        # Build PDF using reportlab
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib import colors
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
            )
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import mm
        except ImportError:
            raise HTTPException(500, "PDF generation library missing")

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=14*mm, rightMargin=14*mm,
                                topMargin=14*mm, bottomMargin=14*mm)
        styles = getSampleStyleSheet()
        h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=colors.HexColor("#0E3B4A"),
                            fontSize=18, spaceAfter=8)
        h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=colors.HexColor("#0E3B4A"),
                            fontSize=12, spaceAfter=4)
        small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8,
                               textColor=colors.HexColor("#5d6068"))
        body = styles["BodyText"]
        story = []
        story.append(Paragraph("Induction & Policy Compliance · Evidence Pack", h1))
        story.append(Paragraph(
            f"<b>Staff:</b> {staff.get('name')} &nbsp;·&nbsp; "
            f"<b>Email:</b> {staff.get('email')} &nbsp;·&nbsp; "
            f"<b>Role:</b> {staff.get('role')}", body))
        story.append(Paragraph(
            f"Generated {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')} by "
            f"{user.get('name')}", small))
        story.append(Spacer(1, 8))
        # Summary table
        completed = [a for a in assignments if a.get("manager_sig_at")]
        rows = [["Total assigned", "Completed", "Outstanding", "Avg score"]]
        scores = [a.get("assessment_score") for a in completed if a.get("assessment_score") is not None]
        avg_score = f"{round(sum(scores)/len(scores), 1)}%" if scores else "—"
        rows.append([str(len(assignments)), str(len(completed)),
                     str(len(assignments) - len(completed)), avg_score])
        t = Table(rows, colWidths=[40*mm]*4)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0E3B4A")),
            ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
            ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",   (0,0), (-1,-1), 9),
            ("GRID",       (0,0), (-1,-1), 0.5, colors.HexColor("#d4d2cc")),
            ("ALIGN",      (0,0), (-1,-1), "CENTER"),
            ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(t)
        story.append(Spacer(1, 10))
        story.append(Paragraph("Policies — full audit trail", h2))
        # Per-assignment evidence rows
        for a in assignments:
            sig_staff = (
                f"{a.get('staff_sig_name', '—')} · {a.get('staff_sig_at', '—')}"
                if a.get("staff_sig_at") else "Not signed"
            )
            sig_mgr = (
                f"{a.get('manager_sig_by_name', '—')} · {a.get('manager_sig_at', '—')}"
                if a.get("manager_sig_at") else "Pending"
            )
            score = (
                f"{a.get('assessment_score')}%"
                if a.get("assessment_score") is not None else "—"
            )
            status_now = pm.compute_assignment_status(a)
            rows2 = [
                ["Policy",        a.get("policy_title", "—")],
                ["Category",      a.get("policy_category", "—")],
                ["Assigned at",   a.get("assigned_at", "—")],
                ["Due",           a.get("due_date", "—")],
                ["Status",        status_now.replace("_", " ").upper()],
                ["Assessment",    score],
                ["Staff sign",    sig_staff],
                ["Manager sign",  sig_mgr],
            ]
            ts = Table(rows2, colWidths=[35*mm, 130*mm])
            ts.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F1EFEC")),
                ("FONTNAME",   (0,0), (0,-1), "Helvetica-Bold"),
                ("FONTSIZE",   (0,0), (-1,-1), 8),
                ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#d4d2cc")),
                ("VALIGN",     (0,0), (-1,-1), "TOP"),
            ]))
            story.append(ts)
            story.append(Spacer(1, 4))
        story.append(Spacer(1, 8))
        story.append(Paragraph(
            "This document is generated directly from the Safelyn audit log. "
            "Every signature, score and completion timestamp can be traced via "
            "/api/audit using the assignment id.", small))
        doc.build(story)
        buf.seek(0)
        await _record_audit(
            _db, actor=user, action="policy_evidence_exported",
            object_type="user", object_id=staff_id,
            metadata={"assignment_count": len(assignments)},
            summary=f"Evidence pack exported for {staff.get('name')}",
        )
        filename = f"induction-evidence-{staff.get('name','staff').replace(' ', '-').lower()}.pdf"
        return StreamingResponse(
            buf, media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    # ---- Phase H.3: Statement of Purpose Governance ----

    SOP_CATEGORY = "Statement of Purpose"

    async def _ensure_sop_policy(sector: str, user: dict) -> dict:
        """Find or create the canonical SoP policy for a sector."""
        existing = await _db.policies.find_one({
            "sector": sector, "category": SOP_CATEGORY, "status": "active",
        }, {"_id": 0})
        if existing:
            return existing
        # Auto-create on first upload
        now = pm.now_iso()
        sector_label = "Children's" if sector == "children" else "Adult"
        doc = {
            "id": str(uuid.uuid4()),
            "title": f"Statement of Purpose · {sector_label} Services",
            "category": SOP_CATEGORY,
            "sector": sector,
            "summary": "Statement of Purpose — the governing document for the service.",
            "review_date": None,
            "expiry_date": None,
            "status": "active",
            "current_version_id": None,
            "created_at": now,
            "updated_at": now,
            "created_by_id": user.get("id"),
            "created_by_name": user.get("name"),
        }
        await _db.policies.insert_one(doc.copy())
        await _record_audit(
            _db, actor=user, action="sop_policy_initialised",
            object_type="policy", object_id=doc["id"],
            metadata={"sector": sector},
            summary=f"SoP governance initialised for {sector} services",
        )
        return _serialise(doc)

    async def _eligible_sop_staff(sector: str) -> list[dict]:
        """All staff who must read the SoP — every active user with a care-facing role.

        Sector is informational — SoP is whole-service so we include every active
        user. Admins are skipped because they typically don't deliver care.
        """
        users = await _db.users.find(
            {"role": {"$in": ["staff", "senior", "manager"]}}, {"_id": 0},
        ).to_list(1000)
        return users

    @router.get("/governance/sop")
    async def sop_get_state(
        sector: str = Query(..., pattern="^(children|adult)$"),
        user: dict = Depends(_require_tier(3)),
    ):
        policy = await _db.policies.find_one({
            "sector": sector, "category": SOP_CATEGORY, "status": "active",
        }, {"_id": 0})
        if not policy:
            return {"policy": None, "exists": False, "sector": sector}
        out = await _hydrate_policy(policy)
        out["versions"] = await _db.policy_versions.find(
            {"policy_id": policy["id"]}, {"_id": 0},
        ).sort("created_at", -1).to_list(50)
        out["questions"] = await _db.policy_questions.find(
            {"policy_id": policy["id"]}, {"_id": 0},
        ).sort("order", 1).to_list(50)
        out["exists"] = True
        out["sector"] = sector
        return out

    @router.post("/governance/sop/upload-version")
    async def sop_upload_version(payload: SopUploadIn = Body(...), user: dict = Depends(_require_tier(3))):
        """Upload a new SoP version AND auto-assign read-and-sign to every staff member.

        Behaviour:
          1. Ensure SoP policy exists for the sector (auto-create if needed).
          2. Archive the previous current_version (handled by existing logic).
          3. Insert the new version.
          4. Replace assessment questions if supplied; else seed defaults.
          5. Auto-create policy_assignments for every eligible staff member,
             linked to this new version. If an incomplete assignment already
             exists for the previous version, mark it as superseded.
          6. Emit audit events for sop_version_uploaded + each policy_assigned.
        """
        sector = payload.sector
        policy = await _ensure_sop_policy(sector, user)
        pid = policy["id"]
        prev_version_id = policy.get("current_version_id")

        # Archive previous version
        if prev_version_id:
            await _db.policy_versions.update_one(
                {"id": prev_version_id},
                {"$set": {"archived_at": pm.now_iso()}},
            )

        # Insert new version
        now = pm.now_iso()
        version_doc = {
            "id": str(uuid.uuid4()),
            "policy_id": pid,
            "version": payload.version,
            "file_id": payload.file_id,
            "content_text": payload.content_text,
            "change_summary": payload.change_summary,
            "effective_date": payload.effective_date or now,
            "created_at": now,
            "uploaded_by_id": user.get("id"),
            "uploaded_by_name": user.get("name"),
            "author_name": payload.author_name or user.get("name"),
            "archived_at": None,
        }
        await _db.policy_versions.insert_one(version_doc.copy())

        # Update policy pointer + review date
        policy_update = {
            "current_version_id": version_doc["id"],
            "updated_at": now,
        }
        if payload.review_date:
            policy_update["review_date"] = payload.review_date
        await _db.policies.update_one({"id": pid}, {"$set": policy_update})

        # Replace assessment questions if supplied; otherwise seed defaults
        questions_payload = payload.questions
        if questions_payload is None:
            existing_q = await _db.policy_questions.count_documents({"policy_id": pid})
            if existing_q == 0:
                questions_payload = _default_sop_questions(sector)
        if questions_payload is not None:
            await _db.policy_questions.delete_many({"policy_id": pid})
            q_docs = []
            for i, q in enumerate(questions_payload):
                qm = PolicyQuestionIn(**q)
                q_docs.append({
                    "id": str(uuid.uuid4()),
                    "policy_id": pid,
                    "type": qm.type,
                    "question": qm.question,
                    "options": qm.options if qm.type == "mcq" else None,
                    "correct_index": qm.correct_index if qm.type == "mcq" else None,
                    "order": qm.order if qm.order is not None else i,
                    "created_at": now,
                })
            if q_docs:
                await _db.policy_questions.insert_many(q_docs)

        # Supersede any non-complete assignments tied to the previous version
        superseded = 0
        if prev_version_id:
            res = await _db.policy_assignments.update_many(
                {
                    "policy_id": pid,
                    "version_id_at_assignment": prev_version_id,
                    "status": {"$ne": "complete"},
                    "manager_sig_at": None,
                },
                {"$set": {
                    "status": "superseded",
                    "superseded_at": now,
                    "superseded_by_version_id": version_doc["id"],
                }},
            )
            superseded = res.modified_count

        # Auto-assign to every eligible staff
        eligible = await _eligible_sop_staff(sector)
        assignments_created: list[dict] = []
        due = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
        for staff in eligible:
            doc = {
                "id": str(uuid.uuid4()),
                "policy_id": pid,
                "policy_title": policy["title"],
                "policy_category": SOP_CATEGORY,
                "policy_sector": sector,
                "version_id_at_assignment": version_doc["id"],
                "staff_id": staff["id"],
                "staff_name": staff.get("name"),
                "staff_email": staff.get("email"),
                "assigned_by_id": user.get("id"),
                "assigned_by_name": user.get("name"),
                "assigned_at": now,
                "due_date": due,
                "status": "assigned",
                "opened_at": None,
                "assessment_score": None,
                "assessment_passed_at": None,
                "staff_sig_at": None,
                "manager_sig_at": None,
                "completed_at": None,
                "is_sop_assignment": True,
                "sop_version": payload.version,
            }
            await _db.policy_assignments.insert_one(doc.copy())
            assignments_created.append({"id": doc["id"], "staff_id": staff["id"]})

        await _record_audit(
            _db, actor=user, action="sop_version_uploaded",
            object_type="policy", object_id=pid,
            metadata={
                "sector": sector,
                "version": payload.version,
                "previous_version_id": prev_version_id,
                "assignments_created": len(assignments_created),
                "assignments_superseded": superseded,
                "author": payload.author_name or user.get("name"),
            },
            summary=(
                f"Statement of Purpose v{payload.version} published for {sector} services "
                f"— auto-assigned to {len(assignments_created)} staff"
            ),
        )
        return {
            "ok": True,
            "policy_id": pid,
            "version": _serialise(version_doc),
            "assignments_created": len(assignments_created),
            "assignments_superseded": superseded,
        }

    @router.get("/governance/sop/compliance")
    async def sop_compliance(
        sector: str = Query(..., pattern="^(children|adult)$"),
        user: dict = Depends(_require_tier(3)),
    ):
        """Per-staff compliance breakdown for the current SoP version."""
        policy = await _db.policies.find_one({
            "sector": sector, "category": SOP_CATEGORY, "status": "active",
        }, {"_id": 0})
        if not policy or not policy.get("current_version_id"):
            return {
                "sector": sector,
                "compliance_pct": 0.0,
                "buckets": {
                    "not_started": [], "in_progress": [],
                    "complete": [], "failed": [], "superseded": [],
                },
                "counts": {
                    "total": 0, "not_started": 0, "in_progress": 0,
                    "complete": 0, "failed": 0, "superseded": 0,
                },
            }
        version_id = policy["current_version_id"]
        assignments = await _db.policy_assignments.find({
            "policy_id": policy["id"],
            "version_id_at_assignment": version_id,
        }, {"_id": 0}).sort("staff_name", 1).to_list(1000)

        buckets = {
            "not_started": [], "in_progress": [],
            "complete": [], "failed": [], "superseded": [],
        }
        for a in assignments:
            status = pm.compute_assignment_status(a)
            entry = {
                "assignment_id": a["id"],
                "staff_id": a.get("staff_id"),
                "staff_name": a.get("staff_name"),
                "staff_email": a.get("staff_email"),
                "assigned_at": a.get("assigned_at"),
                "due_date": a.get("due_date"),
                "assessment_score": a.get("assessment_score"),
                "staff_sig_at": a.get("staff_sig_at"),
                "manager_sig_at": a.get("manager_sig_at"),
                "is_overdue": pm.is_overdue(a),
                "status": status,
            }
            if a.get("status") == "superseded":
                buckets["superseded"].append(entry)
                continue
            if status == "complete":
                buckets["complete"].append(entry)
            elif (a.get("assessment_score") is not None
                  and a.get("assessment_score") < 80
                  and not a.get("assessment_passed_at")):
                buckets["failed"].append(entry)
            elif status == "assigned" and not a.get("opened_at"):
                buckets["not_started"].append(entry)
            else:
                buckets["in_progress"].append(entry)

        active_total = (
            len(buckets["not_started"]) + len(buckets["in_progress"])
            + len(buckets["complete"]) + len(buckets["failed"])
        )
        comp_pct = (
            round(len(buckets["complete"]) / active_total * 100.0, 1)
            if active_total else 0.0
        )
        return {
            "sector": sector,
            "policy_id": policy["id"],
            "version_id": version_id,
            "compliance_pct": comp_pct,
            "buckets": buckets,
            "counts": {
                "total": active_total,
                "not_started": len(buckets["not_started"]),
                "in_progress": len(buckets["in_progress"]),
                "complete": len(buckets["complete"]),
                "failed": len(buckets["failed"]),
                "superseded": len(buckets["superseded"]),
            },
        }

    @router.get("/governance/sop/dashboard")
    async def sop_dashboard(
        sector: str = Query(..., pattern="^(children|adult)$"),
        user: dict = Depends(_require_tier(3)),
    ):
        """One-call governance dashboard for the SoP."""
        policy = await _db.policies.find_one({
            "sector": sector, "category": SOP_CATEGORY, "status": "active",
        }, {"_id": 0})
        if not policy:
            return {
                "sector": sector,
                "policy": None,
                "exists": False,
                "rag_status": "grey",
                "compliance_pct": 0.0,
                "counts": {},
            }
        hydrated = await _hydrate_policy(policy)
        versions = await _db.policy_versions.find(
            {"policy_id": policy["id"]}, {"_id": 0},
        ).sort("created_at", -1).to_list(20)
        # Reuse the compliance computation
        compliance = await sop_compliance.__wrapped__(sector=sector, user=user) \
            if hasattr(sop_compliance, "__wrapped__") else None
        # Fallback inline (simpler & avoids attribute gymnastics)
        if compliance is None:
            assignments = await _db.policy_assignments.find({
                "policy_id": policy["id"],
                "version_id_at_assignment": policy.get("current_version_id"),
            }, {"_id": 0}).to_list(1000)
            total = len([a for a in assignments if a.get("status") != "superseded"])
            done = len([a for a in assignments if pm.compute_assignment_status(a) == "complete"])
            comp_pct = round(done / total * 100.0, 1) if total else 0.0
            counts = {"total": total, "complete": done}
        else:
            comp_pct = compliance["compliance_pct"]
            counts = compliance["counts"]

        # Review-due RAG
        now = datetime.now(timezone.utc)
        days_to_review = None
        review_rag = "green"
        if policy.get("review_date"):
            try:
                rd = datetime.fromisoformat(policy["review_date"].replace("Z", "+00:00"))
                days_to_review = (rd - now).days
                if days_to_review < 0:
                    review_rag = "red"
                elif days_to_review <= 30:
                    review_rag = "amber"
            except (ValueError, AttributeError):
                review_rag = "amber"
        else:
            review_rag = "amber"

        # Overall governance RAG: red if no SoP or review overdue; amber if review
        # within 30 days OR compliance < 80; else green
        if not policy.get("current_version_id"):
            overall = "red"
        elif review_rag == "red" or comp_pct < 50:
            overall = "red"
        elif review_rag == "amber" or comp_pct < 80:
            overall = "amber"
        else:
            overall = "green"

        return {
            "sector": sector,
            "exists": True,
            "policy": hydrated,
            "current_version": hydrated.get("current_version"),
            "versions": versions,
            "version_count": len(versions),
            "compliance_pct": comp_pct,
            "counts": counts,
            "review_date": policy.get("review_date"),
            "days_to_review": days_to_review,
            "review_rag": review_rag,
            "rag_status": overall,
        }

    @router.get("/governance/sop/evidence.pdf")
    async def sop_evidence_pdf(
        sector: str = Query(..., pattern="^(children|adult)$"),
        user: dict = Depends(_require_tier(3)),
    ):
        """Inspection-ready evidence pack — current SoP + previous versions +
        per-staff compliance + signatures + audit trail."""
        policy = await _db.policies.find_one({
            "sector": sector, "category": SOP_CATEGORY, "status": "active",
        }, {"_id": 0})
        if not policy:
            raise HTTPException(404, "No Statement of Purpose has been uploaded for this sector yet")

        versions = await _db.policy_versions.find(
            {"policy_id": policy["id"]}, {"_id": 0},
        ).sort("created_at", -1).to_list(50)
        current_version = next((v for v in versions if v["id"] == policy.get("current_version_id")), None)
        assignments = await _db.policy_assignments.find({
            "policy_id": policy["id"],
            "version_id_at_assignment": policy.get("current_version_id"),
        }, {"_id": 0}).sort("staff_name", 1).to_list(1000)
        # Audit trail — last 100 SoP-related events
        audit_filter = {
            "object_id": policy["id"],
        }
        audit_events = await _db.audit_events.find(audit_filter, {"_id": 0}) \
            .sort("created_at", -1).to_list(100) if hasattr(_db, "audit_events") else []
        # Fall back to other audit collection name
        if not audit_events:
            try:
                audit_events = await _db.audit_log.find(audit_filter, {"_id": 0}) \
                    .sort("created_at", -1).to_list(100)
            except Exception:
                audit_events = []

        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib import colors
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
            )
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import mm
        except ImportError:
            raise HTTPException(500, "PDF generation library missing")

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=14*mm, rightMargin=14*mm,
                                topMargin=14*mm, bottomMargin=14*mm)
        styles = getSampleStyleSheet()
        h1 = ParagraphStyle("h1", parent=styles["Heading1"],
                            textColor=colors.HexColor("#0E3B4A"),
                            fontSize=18, spaceAfter=8)
        h2 = ParagraphStyle("h2", parent=styles["Heading2"],
                            textColor=colors.HexColor("#0E3B4A"),
                            fontSize=12, spaceAfter=4)
        small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8,
                               textColor=colors.HexColor("#5d6068"))
        body = styles["BodyText"]
        story = []
        sector_label = "Children's" if sector == "children" else "Adult"
        story.append(Paragraph(f"Statement of Purpose · {sector_label} Services", h1))
        story.append(Paragraph(
            f"Inspection-ready evidence pack &nbsp;·&nbsp; "
            f"Generated {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')} by "
            f"{user.get('name')}", small))
        story.append(Spacer(1, 8))

        # Current SoP
        story.append(Paragraph("Current Statement of Purpose", h2))
        rows1 = [
            ["Title",          policy.get("title", "—")],
            ["Version",        current_version.get("version") if current_version else "—"],
            ["Author",         (current_version or {}).get("author_name") or (current_version or {}).get("uploaded_by_name") or "—"],
            ["Effective date", (current_version or {}).get("effective_date", "—")],
            ["Review date",    policy.get("review_date") or "—"],
            ["Change summary", (current_version or {}).get("change_summary") or "—"],
        ]
        t1 = Table(rows1, colWidths=[40*mm, 130*mm])
        t1.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F1EFEC")),
            ("FONTNAME",   (0,0), (0,-1), "Helvetica-Bold"),
            ("FONTSIZE",   (0,0), (-1,-1), 9),
            ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#d4d2cc")),
            ("VALIGN",     (0,0), (-1,-1), "TOP"),
        ]))
        story.append(t1)
        story.append(Spacer(1, 10))

        # Version history
        story.append(Paragraph("Version history", h2))
        vrows = [["Version", "Effective", "Author", "Uploaded", "Archived"]]
        for v in versions:
            vrows.append([
                v.get("version", "—"),
                (v.get("effective_date") or "—")[:10],
                v.get("author_name") or v.get("uploaded_by_name", "—"),
                (v.get("created_at") or "—")[:16].replace("T", " "),
                (v.get("archived_at") or "—")[:10] if v.get("archived_at") else "Current",
            ])
        tv = Table(vrows, colWidths=[20*mm, 28*mm, 50*mm, 40*mm, 32*mm])
        tv.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0E3B4A")),
            ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
            ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",   (0,0), (-1,-1), 8),
            ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#d4d2cc")),
            ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(tv)
        story.append(Spacer(1, 10))

        # Compliance table
        story.append(Paragraph("Staff compliance — current version", h2))
        crows = [["Staff", "Status", "Assess %", "Staff signed", "Manager signed"]]
        for a in assignments:
            if a.get("status") == "superseded":
                continue
            status_now = pm.compute_assignment_status(a)
            crows.append([
                a.get("staff_name", "—"),
                status_now.replace("_", " ").upper(),
                (str(a.get("assessment_score")) + "%") if a.get("assessment_score") is not None else "—",
                (a.get("staff_sig_at") or "—")[:16].replace("T", " ") if a.get("staff_sig_at") else "—",
                (a.get("manager_sig_at") or "—")[:16].replace("T", " ") if a.get("manager_sig_at") else "—",
            ])
        tc = Table(crows, colWidths=[50*mm, 32*mm, 18*mm, 35*mm, 35*mm])
        tc.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0E3B4A")),
            ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
            ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",   (0,0), (-1,-1), 8),
            ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#d4d2cc")),
            ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(tc)
        story.append(Spacer(1, 10))

        # Audit trail
        story.append(Paragraph("Audit trail (most recent 50 SoP events)", h2))
        if not audit_events:
            story.append(Paragraph("Audit trail not available in this database instance.", small))
        else:
            arows = [["When", "Actor", "Action", "Summary"]]
            for e in audit_events[:50]:
                arows.append([
                    (e.get("created_at") or "—")[:16].replace("T", " "),
                    e.get("actor_name", "—"),
                    e.get("action", "—"),
                    (e.get("summary") or "")[:80],
                ])
            ta = Table(arows, colWidths=[34*mm, 36*mm, 36*mm, 65*mm])
            ta.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0E3B4A")),
                ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
                ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
                ("FONTSIZE",   (0,0), (-1,-1), 7),
                ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#d4d2cc")),
                ("VALIGN",     (0,0), (-1,-1), "TOP"),
            ]))
            story.append(ta)

        story.append(Spacer(1, 8))
        story.append(Paragraph(
            "This pack is generated directly from the Safelyn audit log. Every signature, "
            "score, version change and assignment is traceable to the source records.", small))
        doc.build(story)
        buf.seek(0)
        await _record_audit(
            _db, actor=user, action="sop_evidence_exported",
            object_type="policy", object_id=policy["id"],
            metadata={"sector": sector, "version_count": len(versions)},
            summary=f"Statement of Purpose evidence pack exported for {sector} services",
        )
        filename = f"statement-of-purpose-evidence-{sector}.pdf"
        return StreamingResponse(
            buf, media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    # ============================================================
    # Phase H.2 — Policy Intelligence & Inspection Readiness
    # ============================================================

    async def _all_assignments_for_sector(sector: str) -> list[dict]:
        q = {"policy_sector": sector} if sector else {}
        return await _db.policy_assignments.find(q, {"_id": 0}).to_list(20000)

    async def _all_policies_for_sector(sector: str) -> list[dict]:
        q = {"sector": sector, "status": "active"} if sector else {"status": "active"}
        return await _db.policies.find(q, {"_id": 0}).to_list(5000)

    @router.get("/policy-intelligence/dashboard")
    async def policy_intelligence_dashboard(
        sector: Optional[str] = Query(None, pattern="^(children|adult)$"),
        user: dict = Depends(_require_tier(3)),
    ):
        """Single-call aggregate for the manager intelligence dashboard.

        Deterministic, evidence-linked metrics — no AI, no inferred scores.
        """
        now = datetime.now(timezone.utc)
        assignments = await _all_assignments_for_sector(sector)
        active = [a for a in assignments if a.get("status") != "superseded"]
        complete = [a for a in active if pm.compute_assignment_status(a) == "complete"]
        overdue = [a for a in active if pm.is_overdue(a, now)]
        failed = [a for a in active
                  if a.get("assessment_score") is not None
                  and a.get("assessment_score") < 80
                  and not a.get("assessment_passed_at")]

        comp_pct = round(len(complete) / len(active) * 100.0, 1) if active else 0.0

        # Compliance by role
        by_role: dict = {}
        for a in active:
            staff = await _db.users.find_one(
                {"id": a.get("staff_id")}, {"_id": 0, "role": 1}
            )
            role = (staff or {}).get("role") or "unknown"
            bucket = by_role.setdefault(role, {"role": role, "total": 0, "complete": 0})
            bucket["total"] += 1
            if pm.compute_assignment_status(a) == "complete":
                bucket["complete"] += 1
        compliance_by_role = sorted(
            [{**b, "pct": round(b["complete"] / b["total"] * 100.0, 1) if b["total"] else 0.0}
             for b in by_role.values()],
            key=lambda x: x["role"],
        )

        # Compliance by individual staff (top-50)
        by_staff: dict = {}
        for a in active:
            sid = a.get("staff_id")
            if not sid:
                continue
            bucket = by_staff.setdefault(sid, {
                "staff_id": sid, "staff_name": a.get("staff_name"),
                "total": 0, "complete": 0, "overdue": 0,
            })
            bucket["total"] += 1
            if pm.compute_assignment_status(a) == "complete":
                bucket["complete"] += 1
            if pm.is_overdue(a, now):
                bucket["overdue"] += 1
        compliance_by_staff = sorted(
            [{**b, "pct": round(b["complete"] / b["total"] * 100.0, 1) if b["total"] else 0.0}
             for b in by_staff.values()],
            key=lambda x: x["pct"],
        )

        # Most-failed policies (top-10) — average score per policy
        by_policy: dict = {}
        for a in active:
            pid = a.get("policy_id")
            if not pid or a.get("assessment_score") is None:
                continue
            b = by_policy.setdefault(pid, {
                "policy_id": pid, "policy_title": a.get("policy_title"),
                "policy_category": a.get("policy_category"),
                "attempts": 0, "fails": 0, "score_sum": 0.0,
            })
            b["attempts"] += 1
            b["score_sum"] += float(a["assessment_score"])
            if a["assessment_score"] < 80:
                b["fails"] += 1
        most_failed = sorted(
            [{
                "policy_id": b["policy_id"],
                "policy_title": b["policy_title"],
                "policy_category": b["policy_category"],
                "attempts": b["attempts"],
                "fails": b["fails"],
                "fail_rate_pct": round(b["fails"] / b["attempts"] * 100.0, 1) if b["attempts"] else 0.0,
                "avg_score_pct": round(b["score_sum"] / b["attempts"], 1) if b["attempts"] else 0.0,
            } for b in by_policy.values()],
            key=lambda x: (-x["fail_rate_pct"], -x["fails"], x["avg_score_pct"]),
        )[:10]

        # Policies due review (overdue / 30d / 60d)
        policies = await _all_policies_for_sector(sector)
        overdue_review = []
        due_30 = []
        due_60 = []
        for p in policies:
            rd = p.get("review_date")
            if not rd:
                continue
            try:
                d = datetime.fromisoformat(rd.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                continue
            delta = (d - now).days
            entry = {
                "policy_id": p["id"],
                "policy_title": p.get("title"),
                "policy_category": p.get("category"),
                "review_date": rd,
                "days_to_review": delta,
                "rag_status": pm.policy_rag_status(p),
            }
            if delta < 0:
                overdue_review.append(entry)
            elif delta <= 30:
                due_30.append(entry)
            elif delta <= 60:
                due_60.append(entry)

        # Induction intelligence
        enrollments_q = {"sector": sector} if sector else {}
        enrollments = await _db.induction_enrollments.find(enrollments_q, {"_id": 0}).to_list(2000)
        ind_not_started = 0
        ind_in_progress = 0
        ind_overdue = 0
        ind_total_assignments = 0
        ind_done_assignments = 0
        ind_durations_days = []
        new_starter_attention: list[dict] = []
        for e in enrollments:
            aids = [entry["assignment_id"]
                    for w in e.get("weeks", []) for entry in w.get("assignments", [])
                    if entry.get("assignment_id")]
            ind_total_assignments += len(aids)
            if not aids:
                ind_not_started += 1
                continue
            assigns = await _db.policy_assignments.find(
                {"id": {"$in": aids}}, {"_id": 0},
            ).to_list(500)
            done = [a for a in assigns if pm.compute_assignment_status(a) == "complete"]
            ind_done_assignments += len(done)
            opened = [a for a in assigns if a.get("opened_at")]
            overdue_this = [a for a in assigns if pm.is_overdue(a, now)]
            if not opened:
                ind_not_started += 1
            elif len(done) < len(assigns):
                ind_in_progress += 1
            if overdue_this:
                ind_overdue += 1
            if done:
                # Average per-staff durations
                for a in done:
                    try:
                        start = datetime.fromisoformat(a["assigned_at"].replace("Z", "+00:00"))
                        end = datetime.fromisoformat(
                            (a.get("completed_at") or a.get("manager_sig_at")).replace("Z", "+00:00")
                        )
                        ind_durations_days.append((end - start).total_seconds() / 86400.0)
                    except (ValueError, AttributeError, TypeError):
                        continue
            # New starters needing attention — started < 7 days ago AND nothing opened
            try:
                started = datetime.fromisoformat(e["started_at"].replace("Z", "+00:00"))
                if (now - started).days <= 7 and not opened:
                    new_starter_attention.append({
                        "enrollment_id": e["id"],
                        "staff_id": e["staff_id"],
                        "staff_name": e.get("staff_name"),
                        "started_at": e["started_at"],
                    })
            except (ValueError, AttributeError):
                continue

        avg_completion_days = (
            round(sum(ind_durations_days) / len(ind_durations_days), 1)
            if ind_durations_days else None
        )

        # Governance — SoP for this sector
        sop_state = None
        if sector:
            sop_policy = await _db.policies.find_one({
                "sector": sector, "category": "Statement of Purpose", "status": "active",
            }, {"_id": 0})
            if sop_policy and sop_policy.get("current_version_id"):
                sop_assigns = await _db.policy_assignments.find({
                    "policy_id": sop_policy["id"],
                    "version_id_at_assignment": sop_policy["current_version_id"],
                    "status": {"$ne": "superseded"},
                }, {"_id": 0}).to_list(1000)
                sop_total = len(sop_assigns)
                sop_done = sum(1 for a in sop_assigns
                               if pm.compute_assignment_status(a) == "complete")
                sop_outstanding = [
                    {"staff_id": a.get("staff_id"), "staff_name": a.get("staff_name"),
                     "status": pm.compute_assignment_status(a)}
                    for a in sop_assigns
                    if pm.compute_assignment_status(a) != "complete"
                ]
                # Review-date RAG
                review_rag = "green"
                review_days = None
                if sop_policy.get("review_date"):
                    try:
                        rd = datetime.fromisoformat(sop_policy["review_date"].replace("Z", "+00:00"))
                        review_days = (rd - now).days
                        if review_days < 0:
                            review_rag = "red"
                        elif review_days <= 30:
                            review_rag = "amber"
                    except (ValueError, AttributeError):
                        review_rag = "amber"
                sop_state = {
                    "exists": True,
                    "compliance_pct": round(sop_done / sop_total * 100.0, 1) if sop_total else 0.0,
                    "total": sop_total,
                    "complete": sop_done,
                    "outstanding": sop_outstanding[:20],
                    "review_date": sop_policy.get("review_date"),
                    "days_to_review": review_days,
                    "review_rag": review_rag,
                }
            else:
                sop_state = {"exists": False}

        # Overall RAG for the intelligence dashboard
        if not active or comp_pct < 50 or len(overdue) > 5:
            overall_rag = "red"
        elif comp_pct < 80 or len(overdue) > 0 or (most_failed and most_failed[0]["fail_rate_pct"] > 30):
            overall_rag = "amber"
        else:
            overall_rag = "green"

        return {
            "sector": sector,
            "generated_at": now.isoformat(),
            "overall_rag": overall_rag,
            "policy_compliance": {
                "overall_pct": comp_pct,
                "active_assignments": len(active),
                "complete": len(complete),
                "overdue": len(overdue),
                "failed": len(failed),
                "by_role": compliance_by_role,
                "by_staff": compliance_by_staff,
            },
            "most_failed_policies": most_failed,
            "policies_due_review": {
                "overdue": overdue_review,
                "due_within_30_days": due_30,
                "due_within_60_days": due_60,
            },
            "induction_intelligence": {
                "enrollments": len(enrollments),
                "not_started": ind_not_started,
                "in_progress": ind_in_progress,
                "overdue": ind_overdue,
                "total_assignments": ind_total_assignments,
                "complete_assignments": ind_done_assignments,
                "completion_pct": round(ind_done_assignments / ind_total_assignments * 100.0, 1) if ind_total_assignments else 0.0,
                "avg_completion_days": avg_completion_days,
                "new_starter_attention": new_starter_attention,
            },
            "governance": sop_state,
        }

    @router.get("/inspection-readiness/score")
    async def inspection_readiness_score(
        sector: str = Query(..., pattern="^(children|adult)$"),
        user: dict = Depends(_require_tier(3)),
    ):
        """Deterministic 5-pillar readiness score for an inspection.

        Each pillar is 0-100 and evidence-linked. The overall score is the
        rounded mean. RAG: 85+ green, 65+ amber, else red.
        """
        # Pillar 1 — Policy compliance
        assignments = await _all_assignments_for_sector(sector)
        active = [a for a in assignments if a.get("status") != "superseded"]
        if active:
            done = sum(1 for a in active if pm.compute_assignment_status(a) == "complete")
            policy_score = round(done / len(active) * 100.0)
        else:
            policy_score = 0

        # Pillar 2 — Staff induction
        enrollments = await _db.induction_enrollments.find({"sector": sector}, {"_id": 0}).to_list(2000)
        total_ind_assigns = 0
        done_ind_assigns = 0
        for e in enrollments:
            aids = [entry["assignment_id"]
                    for w in e.get("weeks", []) for entry in w.get("assignments", [])
                    if entry.get("assignment_id")]
            if not aids:
                continue
            total_ind_assigns += len(aids)
            done_ind_assigns += await _db.policy_assignments.count_documents(
                {"id": {"$in": aids}, "manager_sig_at": {"$ne": None}},
            )
        induction_score = round(done_ind_assigns / total_ind_assigns * 100.0) if total_ind_assigns else 100

        # Pillar 3 — Governance (SoP)
        sop_policy = await _db.policies.find_one({
            "sector": sector, "category": "Statement of Purpose", "status": "active",
        }, {"_id": 0})
        if not sop_policy or not sop_policy.get("current_version_id"):
            gov_score = 0
        else:
            sop_assigns = await _db.policy_assignments.find({
                "policy_id": sop_policy["id"],
                "version_id_at_assignment": sop_policy["current_version_id"],
                "status": {"$ne": "superseded"},
            }, {"_id": 0}).to_list(1000)
            if sop_assigns:
                sop_done = sum(1 for a in sop_assigns
                               if pm.compute_assignment_status(a) == "complete")
                base = round(sop_done / len(sop_assigns) * 100.0)
            else:
                base = 100
            # Penalty if review overdue
            if sop_policy.get("review_date"):
                try:
                    rd = datetime.fromisoformat(sop_policy["review_date"].replace("Z", "+00:00"))
                    if rd < datetime.now(timezone.utc):
                        base = max(0, base - 20)
                except (ValueError, AttributeError):
                    pass
            gov_score = base

        # Pillar 4 — Staff (HR file) compliance — best-effort: assume green if no HR data
        try:
            personnel = await _db.staff_personnel_files.find({}, {"_id": 0}).to_list(500)
            if personnel:
                rags = [p.get("rag_status", "green") for p in personnel]
                green = sum(1 for r in rags if r == "green")
                staff_score = round(green / len(rags) * 100.0)
            else:
                staff_score = 100
        except Exception:
            staff_score = 100

        # Pillar 5 — SCR compliance — count active staff personnel rows with all checks
        try:
            scr_rows = personnel if 'personnel' in locals() else \
                await _db.staff_personnel_files.find({}, {"_id": 0}).to_list(500)
            if scr_rows:
                scr_ok = sum(1 for r in scr_rows
                             if r.get("dbs_status") in (None, "valid")
                             and r.get("right_to_work_status") in (None, "valid"))
                scr_score = round(scr_ok / len(scr_rows) * 100.0)
            else:
                scr_score = 100
        except Exception:
            scr_score = 100

        overall = round((policy_score + induction_score + gov_score + staff_score + scr_score) / 5)
        if overall >= 85:
            rag = "green"
        elif overall >= 65:
            rag = "amber"
        else:
            rag = "red"

        return {
            "sector": sector,
            "overall_score": overall,
            "rag_status": rag,
            "pillars": [
                {"key": "policy",     "label": "Policy compliance",      "score": policy_score,    "evidence": "/policies"},
                {"key": "induction",  "label": "Staff induction",        "score": induction_score, "evidence": "/policies?tab=induction"},
                {"key": "governance", "label": "Governance (SoP)",       "score": gov_score,       "evidence": "/governance"},
                {"key": "staff",      "label": "Staff personnel files",  "score": staff_score,     "evidence": "/staff-operations"},
                {"key": "scr",        "label": "Single Central Record",  "score": scr_score,       "evidence": "/staff-operations"},
            ],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    @router.get("/inspection-readiness/evidence-pack.pdf")
    async def inspection_readiness_evidence_pack(
        sector: str = Query(..., pattern="^(children|adult)$"),
        user: dict = Depends(_require_tier(3)),
    ):
        """One-click compiled inspection evidence pack covering:
        SCR · SoP · Policy compliance · Induction · Outstanding actions · Audit trail.

        Produced as a single PDF for Ofsted / Reg 44 / CQC use.
        """
        # Reuse the readiness score
        score = await inspection_readiness_score(sector=sector, user=user)

        # Pull relevant data sets
        sop_policy = await _db.policies.find_one({
            "sector": sector, "category": "Statement of Purpose", "status": "active",
        }, {"_id": 0})
        sop_version = None
        sop_assigns: list[dict] = []
        if sop_policy and sop_policy.get("current_version_id"):
            sop_version = await _db.policy_versions.find_one(
                {"id": sop_policy["current_version_id"]}, {"_id": 0},
            )
            sop_assigns = await _db.policy_assignments.find({
                "policy_id": sop_policy["id"],
                "version_id_at_assignment": sop_policy["current_version_id"],
                "status": {"$ne": "superseded"},
            }, {"_id": 0}).to_list(1000)

        policies = await _all_policies_for_sector(sector)
        assignments = await _all_assignments_for_sector(sector)
        active_assignments = [a for a in assignments if a.get("status") != "superseded"]
        outstanding = [a for a in active_assignments
                       if pm.compute_assignment_status(a) != "complete"]

        enrollments = await _db.induction_enrollments.find(
            {"sector": sector}, {"_id": 0},
        ).to_list(500)

        # Best-effort SCR rows + audit log
        scr_rows: list[dict] = []
        try:
            scr_rows = await _db.staff_personnel_files.find({}, {"_id": 0}).to_list(500)
        except Exception:
            scr_rows = []
        audit_events: list[dict] = []
        try:
            audit_events = await _db.audit_events.find({}, {"_id": 0}).sort("created_at", -1).limit(80).to_list(80)
        except Exception:
            try:
                audit_events = await _db.audit_log.find({}, {"_id": 0}).sort("created_at", -1).limit(80).to_list(80)
            except Exception:
                audit_events = []

        # Build PDF
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib import colors
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
            )
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import mm
        except ImportError:
            raise HTTPException(500, "PDF generation library missing")

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=14*mm, rightMargin=14*mm,
                                topMargin=14*mm, bottomMargin=14*mm)
        styles = getSampleStyleSheet()
        h1 = ParagraphStyle("h1", parent=styles["Heading1"],
                            textColor=colors.HexColor("#0E3B4A"), fontSize=20, spaceAfter=8)
        h2 = ParagraphStyle("h2", parent=styles["Heading2"],
                            textColor=colors.HexColor("#0E3B4A"), fontSize=12, spaceAfter=4)
        small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8,
                               textColor=colors.HexColor("#5d6068"))
        body = styles["BodyText"]
        story = []
        sector_label = "Children's" if sector == "children" else "Adult"
        story.append(Paragraph(f"Inspection Evidence Pack · {sector_label} Services", h1))
        story.append(Paragraph(
            f"Generated {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')} by "
            f"{user.get('name')} &nbsp;·&nbsp; "
            f"<b>Overall readiness:</b> <font color='{('#A8273A' if score['rag_status']=='red' else '#B8772F' if score['rag_status']=='amber' else '#2F6A3A')}'>"
            f"{score['overall_score']}/100 ({score['rag_status'].upper()})</font>", body))
        story.append(Spacer(1, 6))

        # Pillar table
        story.append(Paragraph("Readiness pillars", h2))
        rows = [["Pillar", "Score", "Status"]]
        for p in score["pillars"]:
            band = "GREEN" if p["score"] >= 85 else "AMBER" if p["score"] >= 65 else "RED"
            rows.append([p["label"], f"{p['score']}/100", band])
        t = Table(rows, colWidths=[80*mm, 30*mm, 30*mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0E3B4A")),
            ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
            ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",   (0,0), (-1,-1), 9),
            ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#d4d2cc")),
            ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(t)
        story.append(PageBreak())

        # Section: SoP
        story.append(Paragraph("1 · Statement of Purpose", h2))
        if not sop_policy:
            story.append(Paragraph("No Statement of Purpose has been uploaded for this sector.", body))
        else:
            srows = [
                ["Title",          sop_policy.get("title", "—")],
                ["Version",        (sop_version or {}).get("version", "—")],
                ["Author",         (sop_version or {}).get("author_name") or (sop_version or {}).get("uploaded_by_name") or "—"],
                ["Effective",      (sop_version or {}).get("effective_date", "—")],
                ["Review date",    sop_policy.get("review_date", "—")],
                ["Compliance",     f"{sum(1 for a in sop_assigns if pm.compute_assignment_status(a)=='complete')}/{len(sop_assigns)}"],
            ]
            ts = Table(srows, colWidths=[40*mm, 130*mm])
            ts.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F1EFEC")),
                ("FONTNAME",   (0,0), (0,-1), "Helvetica-Bold"),
                ("FONTSIZE",   (0,0), (-1,-1), 8),
                ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#d4d2cc")),
                ("VALIGN",     (0,0), (-1,-1), "TOP"),
            ]))
            story.append(ts)
        story.append(Spacer(1, 8))

        # Section: Policy compliance summary
        story.append(Paragraph("2 · Policy compliance", h2))
        story.append(Paragraph(
            f"Active policies: <b>{len(policies)}</b> &nbsp;·&nbsp; "
            f"Active assignments: <b>{len(active_assignments)}</b> &nbsp;·&nbsp; "
            f"Outstanding: <b>{len(outstanding)}</b>", body))
        prows = [["Policy", "Category", "Status", "Score"]]
        for a in active_assignments[:30]:
            status_now = pm.compute_assignment_status(a)
            prows.append([
                a.get("policy_title", "—")[:50],
                a.get("policy_category", "—"),
                status_now.replace("_", " ").upper(),
                f"{a.get('assessment_score')}%" if a.get("assessment_score") is not None else "—",
            ])
        tp = Table(prows, colWidths=[80*mm, 40*mm, 35*mm, 18*mm])
        tp.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0E3B4A")),
            ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
            ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",   (0,0), (-1,-1), 7),
            ("GRID",       (0,0), (-1,-1), 0.3, colors.HexColor("#d4d2cc")),
            ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(tp)
        if len(active_assignments) > 30:
            story.append(Paragraph(
                f"… plus {len(active_assignments) - 30} more assignments — full per-staff breakdown "
                "available via the Compliance dashboard.", small))
        story.append(PageBreak())

        # Section: Induction
        story.append(Paragraph("3 · Induction evidence", h2))
        irows = [["Staff", "Pack", "Started", "Done / Total"]]
        for e in enrollments[:25]:
            aids = [entry["assignment_id"]
                    for w in e.get("weeks", []) for entry in w.get("assignments", [])
                    if entry.get("assignment_id")]
            total = len(aids)
            done = await _db.policy_assignments.count_documents(
                {"id": {"$in": aids}, "manager_sig_at": {"$ne": None}},
            ) if aids else 0
            irows.append([
                e.get("staff_name", "—"),
                e.get("pack_name", "—"),
                (e.get("started_at") or "—")[:10],
                f"{done}/{total}",
            ])
        ti = Table(irows, colWidths=[55*mm, 60*mm, 25*mm, 30*mm])
        ti.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0E3B4A")),
            ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
            ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",   (0,0), (-1,-1), 7),
            ("GRID",       (0,0), (-1,-1), 0.3, colors.HexColor("#d4d2cc")),
            ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ]))
        if enrollments:
            story.append(ti)
        else:
            story.append(Paragraph("No active induction enrollments.", body))
        story.append(Spacer(1, 8))

        # Section: SCR summary
        story.append(Paragraph("4 · Single Central Record summary", h2))
        if not scr_rows:
            story.append(Paragraph("No personnel rows recorded yet.", body))
        else:
            scrh = [["Staff", "DBS", "Right to work", "RAG"]]
            for r in scr_rows[:30]:
                scrh.append([
                    r.get("staff_name", "—"),
                    r.get("dbs_status", "—") or "—",
                    r.get("right_to_work_status", "—") or "—",
                    (r.get("rag_status") or "—").upper(),
                ])
            tsc = Table(scrh, colWidths=[60*mm, 35*mm, 45*mm, 30*mm])
            tsc.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0E3B4A")),
                ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
                ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
                ("FONTSIZE",   (0,0), (-1,-1), 7),
                ("GRID",       (0,0), (-1,-1), 0.3, colors.HexColor("#d4d2cc")),
                ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
            ]))
            story.append(tsc)
        story.append(PageBreak())

        # Section: Outstanding actions
        story.append(Paragraph("5 · Outstanding actions", h2))
        if not outstanding:
            story.append(Paragraph("No outstanding policy actions. All current assignments are complete.", body))
        else:
            orows = [["Staff", "Policy", "Status", "Due"]]
            for a in outstanding[:30]:
                orows.append([
                    a.get("staff_name", "—"),
                    a.get("policy_title", "—")[:50],
                    pm.compute_assignment_status(a).replace("_", " ").upper(),
                    (a.get("due_date") or "—")[:10],
                ])
            to = Table(orows, colWidths=[45*mm, 65*mm, 40*mm, 25*mm])
            to.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#A8273A")),
                ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
                ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
                ("FONTSIZE",   (0,0), (-1,-1), 7),
                ("GRID",       (0,0), (-1,-1), 0.3, colors.HexColor("#d4d2cc")),
                ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
            ]))
            story.append(to)
        story.append(Spacer(1, 8))

        # Section: Audit trail
        story.append(Paragraph("6 · Governance audit trail (latest 80 events)", h2))
        if not audit_events:
            story.append(Paragraph("Audit log not available in this database instance.", small))
        else:
            arows = [["When", "Actor", "Action", "Summary"]]
            for e in audit_events:
                arows.append([
                    (e.get("created_at") or "—")[:16].replace("T", " "),
                    e.get("actor_name", "—"),
                    e.get("action", "—"),
                    (e.get("summary") or "")[:70],
                ])
            ta = Table(arows, colWidths=[34*mm, 35*mm, 36*mm, 65*mm])
            ta.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0E3B4A")),
                ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
                ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
                ("FONTSIZE",   (0,0), (-1,-1), 6.5),
                ("GRID",       (0,0), (-1,-1), 0.3, colors.HexColor("#d4d2cc")),
                ("VALIGN",     (0,0), (-1,-1), "TOP"),
            ]))
            story.append(ta)

        story.append(Spacer(1, 10))
        story.append(Paragraph(
            "Every score, signature and timestamp in this pack is generated deterministically "
            "from the Safelyn audit log. No AI scoring is used; each metric is fully traceable.", small))
        doc.build(story)
        buf.seek(0)
        await _record_audit(
            _db, actor=user, action="inspection_evidence_pack_exported",
            object_type="user", object_id=user.get("id"),
            metadata={"sector": sector, "overall_score": score["overall_score"]},
            summary=f"Inspection evidence pack exported · {sector} · score {score['overall_score']}/100",
        )
        filename = f"inspection-evidence-pack-{sector}.pdf"
        return StreamingResponse(
            buf, media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )


def _default_sop_questions(sector: str) -> list[dict]:
    """Seed a minimal-yet-meaningful assessment when manager doesn't supply one."""
    sector_label = "children's home" if sector == "children" else "adult service"
    return [
        {
            "type": "mcq",
            "question": (
                "The Statement of Purpose sets out the aims, objectives and ethos of the "
                f"{sector_label}. Who is it primarily for?"
            ),
            "options": [
                "Inspectors only",
                f"Anyone using, working in, or considering the {sector_label} — including "
                f"residents, families, staff and regulators",
                "Senior management only",
            ],
            "correct_index": 1,
            "order": 0,
        },
        {
            "type": "mcq",
            "question": "How often must the Statement of Purpose be reviewed at minimum?",
            "options": [
                "Once every 12 months",
                "Only when a regulator asks",
                "Every 5 years",
            ],
            "correct_index": 0,
            "order": 1,
        },
        {
            "type": "mcq",
            "question": "If your practice contradicts the Statement of Purpose, you should:",
            "options": [
                "Carry on — practice always trumps documents",
                "Raise it with your manager so the SoP or practice can be reviewed",
                "Ignore the SoP and follow what colleagues do",
            ],
            "correct_index": 1,
            "order": 2,
        },
        {
            "type": "reflection",
            "question": (
                "Describe one way your day-to-day practice actively reflects the values "
                "and aims set out in this Statement of Purpose."
            ),
            "order": 3,
        },
    ]
