"""Phase E.1 — Training & Workforce Development Centre — API routes.

Mounted as an APIRouter into server.py (same pattern as policy_routes.py).

RBAC:
- Manager / Admin (tier >= 3): full write — courses, records, certificates verify,
  qualifications create, dev-plans create / quarterly reviews, archive.
- Senior (tier 2): read full matrix + certificates list; cannot write.
- Staff (tier 1): own records only, can upload their own certificates
  (status starts `pending` until manager verifies).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Query, UploadFile, File, Form
from pydantic import BaseModel, Field

import training_centre as tc

router = APIRouter(prefix="/api", tags=["Training Centre"])

# Wired via init() from server.py to avoid circular imports
_db = None
_get_current_user = None
_require_tier = None
_record_audit = None
_save_upload = None


def init(*, db, get_current_user, require_tier, record_audit, save_upload):
    global _db, _get_current_user, _require_tier, _record_audit, _save_upload
    _db = db
    _get_current_user = get_current_user
    _require_tier = require_tier
    _record_audit = record_audit
    _save_upload = save_upload


# ---- Pydantic in-models ----------------------------------------------------

class CourseIn(BaseModel):
    code: str = Field(..., max_length=80)
    name: str = Field(..., max_length=200)
    category: str = Field(..., max_length=100)
    sector: str = Field(..., pattern="^(children|adult|both)$")
    frequency_months: int = Field(..., ge=0, le=120)
    mandatory: bool = True
    description: Optional[str] = Field(None, max_length=2000)


class CoursePatch(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    frequency_months: Optional[int] = Field(None, ge=0, le=120)
    mandatory: Optional[bool] = None
    description: Optional[str] = None
    sector: Optional[str] = Field(None, pattern="^(children|adult|both)$")


class RecordIn(BaseModel):
    staff_id: str
    course_code: str
    course_name: Optional[str] = None
    completed_on: Optional[str] = None  # YYYY-MM-DD
    expires_on: Optional[str] = None
    provider: Optional[str] = None
    certificate_id: Optional[str] = None  # tc_certificates id
    notes: Optional[str] = Field(None, max_length=2000)


class RecordPatch(BaseModel):
    completed_on: Optional[str] = None
    expires_on: Optional[str] = None
    provider: Optional[str] = None
    notes: Optional[str] = None
    certificate_id: Optional[str] = None


class QualificationIn(BaseModel):
    staff_id: str
    qualification_code: str
    awarding_body: Optional[str] = Field(None, max_length=200)
    started_on: Optional[str] = None
    expected_completion: Optional[str] = None
    status: str = Field("not_started", pattern="^(not_started|in_progress|completed|withdrawn)$")
    completed_on: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=2000)


class QualificationPatch(BaseModel):
    awarding_body: Optional[str] = None
    started_on: Optional[str] = None
    expected_completion: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(not_started|in_progress|completed|withdrawn)$")
    completed_on: Optional[str] = None
    notes: Optional[str] = None
    evidence_file_id: Optional[str] = None


class ObjectiveIn(BaseModel):
    title: str = Field(..., max_length=300)
    description: Optional[str] = Field(None, max_length=2000)
    type: str = Field("training", pattern="^(training|qualification|skill|career)$")
    target_date: Optional[str] = None
    linked_course_code: Optional[str] = None
    linked_qualification_code: Optional[str] = None
    linked_supervision_id: Optional[str] = None


class ObjectivePatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(open|in_progress|completed|cancelled)$")
    progress_notes: Optional[str] = None
    completion_evidence: Optional[str] = None


class DevPlanIn(BaseModel):
    staff_id: str
    year: int = Field(..., ge=2020, le=2099)
    focus_area: Optional[str] = Field(None, max_length=2000)


class QuarterlyReviewIn(BaseModel):
    quarter: str = Field(..., pattern="^(q1|q2|q3|q4)$")
    notes: str = Field(..., max_length=4000)
    rag: str = Field("green", pattern="^(green|amber|red)$")


class CertificateVerifyIn(BaseModel):
    verification_status: str = Field(..., pattern="^(verified|rejected|pending)$")
    rejection_reason: Optional[str] = Field(None, max_length=500)


# ---- Helpers ---------------------------------------------------------------

def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(doc: dict) -> dict:
    if not doc:
        return doc
    return {k: v for k, v in doc.items() if k != "_id"}


async def _staff_list() -> list[dict]:
    return await _db.users.find(
        {"role": {"$in": ["staff", "senior", "manager", "admin"]}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1},
    ).sort("name", 1).to_list(500)


def _is_manager(user: dict) -> bool:
    return user.get("role") in ("manager", "admin")


# ---- Route factory ---------------------------------------------------------

def build_routes():
    router.routes.clear()

    # ===== Courses =====
    @router.get("/training-centre/courses")
    async def list_courses(
        sector: Optional[str] = None,
        mandatory_only: bool = False,
        _: dict = Depends(_get_current_user),
    ):
        q: dict = {}
        if sector:
            q["sector"] = {"$in": [sector, "both"]}
        if mandatory_only:
            q["mandatory"] = True
        docs = await _db.tc_courses.find(q, {"_id": 0}).sort([("category", 1), ("name", 1)]).to_list(500)
        return {"courses": docs, "count": len(docs)}

    @router.post("/training-centre/courses")
    async def create_course(payload: CourseIn, user: dict = Depends(_require_tier(3))):
        existing = await _db.tc_courses.find_one({"code": payload.code, "sector": payload.sector}, {"_id": 0})
        if existing:
            raise HTTPException(400, "Course code already exists for this sector")
        doc = {**payload.model_dump(), "id": str(uuid.uuid4()), "created_at": _now()}
        await _db.tc_courses.insert_one(doc)
        doc.pop("_id", None)
        await _record_audit(
            db=_db, actor=user, action="tc_course_created",
            object_type="tc_course", object_id=doc["id"],
            summary=f"Course {doc['name']}",
        )
        return doc

    @router.patch("/training-centre/courses/{cid}")
    async def patch_course(cid: str, payload: CoursePatch, user: dict = Depends(_require_tier(3))):
        current = await _db.tc_courses.find_one({"id": cid}, {"_id": 0})
        if not current:
            raise HTTPException(404, "Course not found")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
        if updates:
            await _db.tc_courses.update_one({"id": cid}, {"$set": updates})
        await _record_audit(
            db=_db, actor=user, action="tc_course_updated",
            object_type="tc_course", object_id=cid, summary="Course updated",
        )
        return await _db.tc_courses.find_one({"id": cid}, {"_id": 0})

    @router.delete("/training-centre/courses/{cid}")
    async def delete_course(cid: str, user: dict = Depends(_require_tier(3))):
        # Refuse if records exist
        in_use = await _db.tc_records.count_documents({"course_code": (await _db.tc_courses.find_one({"id": cid}, {"_id": 0}) or {}).get("code")})
        if in_use:
            raise HTTPException(400, "Course has existing records — archive instead")
        await _db.tc_courses.delete_one({"id": cid})
        await _record_audit(
            db=_db, actor=user, action="tc_course_deleted",
            object_type="tc_course", object_id=cid, summary="Course deleted",
        )
        return {"deleted": 1}

    # ===== Training records =====
    @router.get("/training-centre/records")
    async def list_records(
        staff_id: Optional[str] = None,
        course_code: Optional[str] = None,
        user: dict = Depends(_get_current_user),
    ):
        q: dict = {}
        # Staff can only see their own
        if user.get("role") == "staff":
            q["staff_id"] = user["id"]
        else:
            if staff_id:
                q["staff_id"] = staff_id
        if course_code:
            q["course_code"] = course_code
        docs = await _db.tc_records.find(q, {"_id": 0}).sort([("staff_id", 1), ("completed_on", -1)]).to_list(2000)
        for d in docs:
            d["status"] = tc.record_status(d)
        return {"records": docs, "count": len(docs)}

    @router.get("/training-centre/records/mine")
    async def my_records(user: dict = Depends(_get_current_user)):
        docs = await _db.tc_records.find({"staff_id": user["id"]}, {"_id": 0}).sort("expires_on", 1).to_list(500)
        for d in docs:
            d["status"] = tc.record_status(d)
        return {"records": docs, "count": len(docs), "today": _today()}

    @router.post("/training-centre/records")
    async def create_record(payload: RecordIn, user: dict = Depends(_require_tier(3))):
        course = await _db.tc_courses.find_one({"code": payload.course_code}, {"_id": 0})
        if not course:
            raise HTTPException(404, "Course not found")
        staff = await _db.users.find_one({"id": payload.staff_id}, {"_id": 0})
        if not staff:
            raise HTTPException(404, "Staff member not found")
        # If no expiry given but completed_on + course.frequency_months > 0 → compute
        expires_on = payload.expires_on
        if payload.completed_on and not expires_on and course.get("frequency_months"):
            d = datetime.strptime(payload.completed_on, "%Y-%m-%d").date()
            d2 = d + timedelta(days=int(course["frequency_months"]) * 30)
            expires_on = d2.isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "staff_id": payload.staff_id,
            "staff_name": staff.get("name"),
            "course_code": payload.course_code,
            "course_name": payload.course_name or course["name"],
            "course_category": course["category"],
            "completed_on": payload.completed_on,
            "expires_on": expires_on,
            "provider": payload.provider,
            "certificate_id": payload.certificate_id,
            "notes": payload.notes,
            "created_by_id": user["id"],
            "created_by_name": user["name"],
            "created_at": _now(),
        }
        await _db.tc_records.insert_one(doc)
        doc.pop("_id", None)
        await _record_audit(
            db=_db, actor=user, action="tc_record_created",
            object_type="tc_record", object_id=doc["id"],
            summary=f"Training: {doc['course_name']} for {doc['staff_name']}",
        )
        return doc

    @router.patch("/training-centre/records/{rid}")
    async def patch_record(rid: str, payload: RecordPatch, user: dict = Depends(_require_tier(3))):
        current = await _db.tc_records.find_one({"id": rid}, {"_id": 0})
        if not current:
            raise HTTPException(404, "Record not found")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
        if updates:
            await _db.tc_records.update_one({"id": rid}, {"$set": updates})
        await _record_audit(
            db=_db, actor=user, action="tc_record_updated",
            object_type="tc_record", object_id=rid, summary="Training record updated",
        )
        return await _db.tc_records.find_one({"id": rid}, {"_id": 0})

    @router.delete("/training-centre/records/{rid}")
    async def delete_record(rid: str, user: dict = Depends(_require_tier(3))):
        res = await _db.tc_records.delete_one({"id": rid})
        await _record_audit(
            db=_db, actor=user, action="tc_record_deleted",
            object_type="tc_record", object_id=rid, summary="Training record deleted",
        )
        return {"deleted": res.deleted_count}

    # ===== Matrix =====
    @router.get("/training-centre/matrix")
    async def matrix(
        sector: str = Query(..., pattern="^(children|adult)$"),
        _: dict = Depends(_require_tier(2)),
    ):
        # Courses for this sector (sector OR both)
        courses = await _db.tc_courses.find(
            {"sector": {"$in": [sector, "both"]}}, {"_id": 0}
        ).sort([("category", 1), ("name", 1)]).to_list(500)
        staff = await _staff_list()
        records = await _db.tc_records.find({}, {"_id": 0}).to_list(5000)
        by_staff_course: dict = {}
        for r in records:
            by_staff_course.setdefault((r["staff_id"], r["course_code"]), []).append(r)

        rows = []
        cell_counts = {"ok": 0, "expiring": 0, "expired": 0, "missing": 0}
        for s in staff:
            cells = []
            for c in courses:
                rs = by_staff_course.get((s["id"], c["code"]), [])
                st = tc.cell_status(rs) if rs else "missing"
                cell_counts[st] = cell_counts.get(st, 0) + 1
                latest = sorted(rs, key=lambda r: r.get("completed_on") or "")[-1] if rs else None
                cells.append({
                    "course_code": c["code"],
                    "course_name": c["name"],
                    "status": st,
                    "expires_on": (latest or {}).get("expires_on"),
                    "record_id": (latest or {}).get("id"),
                })
            rows.append({"staff": s, "cells": cells})

        total_cells = sum(cell_counts.values())
        compliant = cell_counts["ok"] + cell_counts["expiring"]
        compliance_pct_val = tc.compliance_pct(total_cells, compliant)
        return {
            "courses": courses,
            "rows": rows,
            "counts": cell_counts,
            "total_cells": total_cells,
            "compliance_pct": compliance_pct_val,
            "sector": sector,
        }

    # ===== Certificates =====
    @router.post("/training-centre/certificates")
    async def upload_certificate(
        file: Optional[UploadFile] = File(None),
        record_id: Optional[str] = Form(None),
        staff_id: str = Form(...),
        course_code: str = Form(...),
        issue_date: Optional[str] = Form(None),
        expiry_date: Optional[str] = Form(None),
        provider: Optional[str] = Form(None),
        external_url: Optional[str] = Form(None),
        user: dict = Depends(_get_current_user),
    ):
        if not file and not external_url:
            raise HTTPException(400, "Provide either a file upload or external_url")
        # Staff can only upload their own
        if user.get("role") == "staff" and staff_id != user["id"]:
            raise HTTPException(403, "Cannot upload certificate for another user")

        file_meta = None
        if file:
            file_meta = await _save_upload(file, kind="document", uploaded_by=user, db=_db, photo_only=False)

        # Version increment if previous certificate exists for this staff+course
        prior_count = await _db.tc_certificates.count_documents(
            {"staff_id": staff_id, "course_code": course_code}
        )
        # Manager+ uploads are auto-verified; staff uploads stay pending
        is_mgr = _is_manager(user)
        doc = {
            "id": str(uuid.uuid4()),
            "staff_id": staff_id,
            "course_code": course_code,
            "record_id": record_id,
            "file_id": (file_meta or {}).get("id"),
            "file_name": (file_meta or {}).get("original_name"),
            "file_mime": (file_meta or {}).get("mime"),
            "file_size": (file_meta or {}).get("size"),
            "external_url": external_url,
            "issue_date": issue_date,
            "expiry_date": expiry_date,
            "provider": provider,
            "version": prior_count + 1,
            "verification_status": "verified" if is_mgr else "pending",
            "verified_by_id": user["id"] if is_mgr else None,
            "verified_by_name": user["name"] if is_mgr else None,
            "verified_at": _now() if is_mgr else None,
            "uploaded_by_id": user["id"],
            "uploaded_by_name": user["name"],
            "created_at": _now(),
        }
        await _db.tc_certificates.insert_one(doc)
        doc.pop("_id", None)
        # If linked to a record, attach certificate_id
        if record_id:
            await _db.tc_records.update_one(
                {"id": record_id}, {"$set": {"certificate_id": doc["id"]}}
            )
        await _record_audit(
            db=_db, actor=user, action="tc_certificate_uploaded",
            object_type="tc_certificate", object_id=doc["id"],
            summary=f"Certificate v{doc['version']} for {course_code}",
        )
        return doc

    @router.get("/training-centre/certificates")
    async def list_certificates(
        staff_id: Optional[str] = None,
        course_code: Optional[str] = None,
        status: Optional[str] = None,
        user: dict = Depends(_get_current_user),
    ):
        q: dict = {}
        if user.get("role") == "staff":
            q["staff_id"] = user["id"]
        else:
            if staff_id:
                q["staff_id"] = staff_id
        if course_code:
            q["course_code"] = course_code
        if status:
            q["verification_status"] = status
        docs = await _db.tc_certificates.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return {"certificates": docs, "count": len(docs)}

    @router.patch("/training-centre/certificates/{cid}/verify")
    async def verify_certificate(cid: str, payload: CertificateVerifyIn, user: dict = Depends(_require_tier(3))):
        cert = await _db.tc_certificates.find_one({"id": cid}, {"_id": 0})
        if not cert:
            raise HTTPException(404, "Certificate not found")
        updates = {
            "verification_status": payload.verification_status,
            "verified_by_id": user["id"],
            "verified_by_name": user["name"],
            "verified_at": _now(),
        }
        if payload.rejection_reason:
            updates["rejection_reason"] = payload.rejection_reason
        await _db.tc_certificates.update_one({"id": cid}, {"$set": updates})
        await _record_audit(
            db=_db, actor=user, action="tc_certificate_verified",
            object_type="tc_certificate", object_id=cid,
            summary=f"Certificate marked {payload.verification_status}",
        )
        return await _db.tc_certificates.find_one({"id": cid}, {"_id": 0})

    @router.delete("/training-centre/certificates/{cid}")
    async def delete_certificate(cid: str, user: dict = Depends(_require_tier(3))):
        res = await _db.tc_certificates.delete_one({"id": cid})
        await _record_audit(
            db=_db, actor=user, action="tc_certificate_deleted",
            object_type="tc_certificate", object_id=cid, summary="Certificate deleted",
        )
        return {"deleted": res.deleted_count}

    # ===== Qualifications =====
    @router.get("/training-centre/qualifications/catalogue")
    async def qualifications_catalogue(
        sector: Optional[str] = None,
        _: dict = Depends(_get_current_user),
    ):
        docs = await _db.tc_qual_catalogue.find({}, {"_id": 0}).sort("level", 1).to_list(200)
        if sector:
            docs = [q for q in docs if q.get("sector") in (sector, "both")]
        return {"qualifications": docs, "count": len(docs)}

    @router.get("/training-centre/qualifications")
    async def list_qualifications(
        staff_id: Optional[str] = None,
        user: dict = Depends(_get_current_user),
    ):
        q: dict = {}
        if user.get("role") == "staff":
            q["staff_id"] = user["id"]
        else:
            if staff_id:
                q["staff_id"] = staff_id
        docs = await _db.tc_qualifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"qualifications": docs, "count": len(docs)}

    @router.post("/training-centre/qualifications")
    async def create_qualification(payload: QualificationIn, user: dict = Depends(_require_tier(3))):
        cat = await _db.tc_qual_catalogue.find_one({"code": payload.qualification_code}, {"_id": 0})
        if not cat:
            raise HTTPException(404, "Qualification code not in catalogue")
        staff = await _db.users.find_one({"id": payload.staff_id}, {"_id": 0})
        if not staff:
            raise HTTPException(404, "Staff member not found")
        doc = {
            "id": str(uuid.uuid4()),
            "staff_id": payload.staff_id,
            "staff_name": staff.get("name"),
            "qualification_code": payload.qualification_code,
            "qualification_name": cat["name"],
            "level": cat["level"],
            "awarding_body": payload.awarding_body,
            "started_on": payload.started_on,
            "expected_completion": payload.expected_completion,
            "completed_on": payload.completed_on,
            "status": payload.status,
            "notes": payload.notes,
            "evidence_file_id": None,
            "created_by_id": user["id"],
            "created_by_name": user["name"],
            "created_at": _now(),
        }
        await _db.tc_qualifications.insert_one(doc)
        doc.pop("_id", None)
        await _record_audit(
            db=_db, actor=user, action="tc_qualification_created",
            object_type="tc_qualification", object_id=doc["id"],
            summary=f"Qualification {doc['qualification_name']} for {doc['staff_name']}",
        )
        return doc

    @router.patch("/training-centre/qualifications/{qid}")
    async def patch_qualification(qid: str, payload: QualificationPatch, user: dict = Depends(_require_tier(3))):
        current = await _db.tc_qualifications.find_one({"id": qid}, {"_id": 0})
        if not current:
            raise HTTPException(404, "Qualification not found")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
        if updates:
            await _db.tc_qualifications.update_one({"id": qid}, {"$set": updates})
        await _record_audit(
            db=_db, actor=user, action="tc_qualification_updated",
            object_type="tc_qualification", object_id=qid, summary="Qualification updated",
        )
        return await _db.tc_qualifications.find_one({"id": qid}, {"_id": 0})

    @router.delete("/training-centre/qualifications/{qid}")
    async def delete_qualification(qid: str, user: dict = Depends(_require_tier(3))):
        await _db.tc_qualifications.delete_one({"id": qid})
        await _record_audit(
            db=_db, actor=user, action="tc_qualification_deleted",
            object_type="tc_qualification", object_id=qid, summary="Qualification deleted",
        )
        return {"deleted": 1}

    # ===== Development plans =====
    @router.get("/training-centre/dev-plans")
    async def list_dev_plans(
        staff_id: Optional[str] = None,
        year: Optional[int] = None,
        status: Optional[str] = None,
        user: dict = Depends(_get_current_user),
    ):
        q: dict = {}
        if user.get("role") == "staff":
            q["staff_id"] = user["id"]
        else:
            if staff_id:
                q["staff_id"] = staff_id
        if year:
            q["year"] = year
        if status:
            q["status"] = status
        docs = await _db.tc_dev_plans.find(q, {"_id": 0}).sort([("year", -1), ("created_at", -1)]).to_list(500)
        return {"dev_plans": docs, "count": len(docs)}

    @router.get("/training-centre/dev-plans/{pid}")
    async def get_dev_plan(pid: str, user: dict = Depends(_get_current_user)):
        doc = await _db.tc_dev_plans.find_one({"id": pid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Plan not found")
        if user.get("role") == "staff" and doc["staff_id"] != user["id"]:
            raise HTTPException(403, "Not your plan")
        return doc

    @router.post("/training-centre/dev-plans")
    async def create_dev_plan(payload: DevPlanIn, user: dict = Depends(_require_tier(3))):
        # If an active plan exists for staff+year, return 400 (use rollover for new year)
        existing = await _db.tc_dev_plans.find_one(
            {"staff_id": payload.staff_id, "year": payload.year, "status": "active"}, {"_id": 0}
        )
        if existing:
            raise HTTPException(400, "Active plan already exists for this staff member and year")
        staff = await _db.users.find_one({"id": payload.staff_id}, {"_id": 0})
        if not staff:
            raise HTTPException(404, "Staff member not found")
        doc = {
            "id": str(uuid.uuid4()),
            "staff_id": payload.staff_id,
            "staff_name": staff.get("name"),
            "year": payload.year,
            "focus_area": payload.focus_area,
            "status": "active",
            "objectives": [],
            "quarterly_reviews": {},  # {"q1": {...}, "q2": {...}, ...}
            "created_by_id": user["id"],
            "created_by_name": user["name"],
            "created_at": _now(),
            "archived_at": None,
        }
        await _db.tc_dev_plans.insert_one(doc)
        doc.pop("_id", None)
        await _record_audit(
            db=_db, actor=user, action="tc_dev_plan_created",
            object_type="tc_dev_plan", object_id=doc["id"],
            summary=f"Annual development plan {payload.year} for {doc['staff_name']}",
        )
        return doc

    @router.post("/training-centre/dev-plans/{pid}/archive")
    async def archive_dev_plan(pid: str, user: dict = Depends(_require_tier(3))):
        await _db.tc_dev_plans.update_one(
            {"id": pid}, {"$set": {"status": "archived", "archived_at": _now()}}
        )
        await _record_audit(
            db=_db, actor=user, action="tc_dev_plan_archived",
            object_type="tc_dev_plan", object_id=pid, summary="Plan archived",
        )
        return {"archived": True}

    @router.post("/training-centre/dev-plans/{pid}/objectives")
    async def add_objective(pid: str, payload: ObjectiveIn, user: dict = Depends(_require_tier(3))):
        plan = await _db.tc_dev_plans.find_one({"id": pid}, {"_id": 0})
        if not plan:
            raise HTTPException(404, "Plan not found")
        if plan.get("status") != "active":
            raise HTTPException(400, "Plan is not active")
        obj = {
            "id": str(uuid.uuid4()),
            **payload.model_dump(),
            "status": "open",
            "progress_notes": None,
            "completion_evidence": None,
            "completed_at": None,
            "created_at": _now(),
        }
        await _db.tc_dev_plans.update_one({"id": pid}, {"$push": {"objectives": obj}})
        # Bi-dir: if linked to a supervision, record on the supervision
        if payload.linked_supervision_id:
            await _db.supervisions.update_one(
                {"id": payload.linked_supervision_id},
                {"$push": {"linked_objectives": {"plan_id": pid, "objective_id": obj["id"], "title": obj["title"]}}},
            )
        await _record_audit(
            db=_db, actor=user, action="tc_objective_added",
            object_type="tc_dev_plan", object_id=pid,
            summary=f"Objective: {obj['title']}",
        )
        return obj

    @router.patch("/training-centre/dev-plans/{pid}/objectives/{oid}")
    async def patch_objective(pid: str, oid: str, payload: ObjectivePatch, user: dict = Depends(_require_tier(3))):
        plan = await _db.tc_dev_plans.find_one({"id": pid}, {"_id": 0})
        if not plan:
            raise HTTPException(404, "Plan not found")
        objs = plan.get("objectives", [])
        idx = next((i for i, o in enumerate(objs) if o.get("id") == oid), -1)
        if idx < 0:
            raise HTTPException(404, "Objective not found")
        updates = payload.model_dump(exclude_unset=True)
        if updates.get("status") == "completed":
            updates["completed_at"] = _now()
        for k, v in updates.items():
            objs[idx][k] = v
        await _db.tc_dev_plans.update_one({"id": pid}, {"$set": {"objectives": objs}})
        await _record_audit(
            db=_db, actor=user, action="tc_objective_updated",
            object_type="tc_dev_plan", object_id=pid,
            summary=f"Objective {oid} updated",
        )
        return objs[idx]

    @router.delete("/training-centre/dev-plans/{pid}/objectives/{oid}")
    async def delete_objective(pid: str, oid: str, user: dict = Depends(_require_tier(3))):
        await _db.tc_dev_plans.update_one(
            {"id": pid}, {"$pull": {"objectives": {"id": oid}}}
        )
        await _record_audit(
            db=_db, actor=user, action="tc_objective_deleted",
            object_type="tc_dev_plan", object_id=pid, summary="Objective removed",
        )
        return {"deleted": 1}

    @router.post("/training-centre/dev-plans/{pid}/quarterly-review")
    async def add_quarterly_review(pid: str, payload: QuarterlyReviewIn, user: dict = Depends(_require_tier(3))):
        plan = await _db.tc_dev_plans.find_one({"id": pid}, {"_id": 0})
        if not plan:
            raise HTTPException(404, "Plan not found")
        review = {
            "quarter": payload.quarter,
            "notes": payload.notes,
            "rag": payload.rag,
            "completed_by_id": user["id"],
            "completed_by_name": user["name"],
            "completed_at": _now(),
        }
        await _db.tc_dev_plans.update_one(
            {"id": pid}, {"$set": {f"quarterly_reviews.{payload.quarter}": review}}
        )
        await _record_audit(
            db=_db, actor=user, action="tc_quarterly_review",
            object_type="tc_dev_plan", object_id=pid,
            summary=f"{payload.quarter.upper()} review ({payload.rag.upper()})",
        )
        return review

    # ===== Dashboard intelligence =====
    @router.get("/training-centre/dashboard")
    async def dashboard(
        sector: str = Query(..., pattern="^(children|adult)$"),
        _: dict = Depends(_require_tier(2)),
    ):
        today = _today()
        soon = tc._soon_cutoff(60)
        courses = await _db.tc_courses.find(
            {"sector": {"$in": [sector, "both"]}}, {"_id": 0}
        ).to_list(500)
        mandatory_codes = {c["code"] for c in courses if c.get("mandatory")}
        all_codes = {c["code"] for c in courses}
        staff = await _staff_list()
        records = await _db.tc_records.find({}, {"_id": 0}).to_list(5000)
        certs = await _db.tc_certificates.find({}, {"_id": 0}).to_list(2000)
        quals = await _db.tc_qualifications.find({}, {"_id": 0}).to_list(2000)
        plans = await _db.tc_dev_plans.find({"status": "active"}, {"_id": 0}).to_list(1000)

        # Compliance per mandatory cell
        expected = len(staff) * len(mandatory_codes)
        ok = expiring = expired = missing = 0
        expiring_list: list[dict] = []
        overdue_list: list[dict] = []
        by_staff_course: dict = {}
        for r in records:
            if r.get("course_code") in all_codes:
                by_staff_course.setdefault((r["staff_id"], r["course_code"]), []).append(r)
        for s in staff:
            for code in mandatory_codes:
                rs = by_staff_course.get((s["id"], code), [])
                st = tc.cell_status(rs) if rs else "missing"
                if st == "ok":
                    ok += 1
                elif st == "expiring":
                    expiring += 1
                    latest = sorted(rs, key=lambda r: r.get("completed_on") or "")[-1]
                    expiring_list.append({
                        "staff_id": s["id"], "staff_name": s["name"],
                        "course_code": code, "expires_on": latest.get("expires_on"),
                    })
                elif st == "expired":
                    expired += 1
                    latest = sorted(rs, key=lambda r: r.get("completed_on") or "")[-1]
                    overdue_list.append({
                        "staff_id": s["id"], "staff_name": s["name"],
                        "course_code": code, "expires_on": latest.get("expires_on"),
                    })
                else:
                    missing += 1
                    overdue_list.append({
                        "staff_id": s["id"], "staff_name": s["name"],
                        "course_code": code, "expires_on": None,
                    })

        compliance_pct_val = tc.compliance_pct(expected, ok + expiring)
        # Readiness score: weighted 70% compliance, 15% certificates verified ratio, 15% active plans coverage
        cert_total = len(certs)
        cert_verified = sum(1 for c in certs if c.get("verification_status") == "verified")
        cert_pct = (cert_verified / cert_total * 100) if cert_total else 100
        plans_coverage = (len(plans) / max(len(staff), 1)) * 100
        plans_coverage = min(plans_coverage, 100)
        readiness_score = round(0.7 * compliance_pct_val + 0.15 * cert_pct + 0.15 * plans_coverage)

        readiness_rag = "green" if readiness_score >= 85 else "amber" if readiness_score >= 65 else "red"

        # Qualification stats
        qual_counts = {"not_started": 0, "in_progress": 0, "completed": 0, "withdrawn": 0}
        for q in quals:
            qual_counts[q.get("status", "not_started")] = qual_counts.get(q.get("status", "not_started"), 0) + 1

        return {
            "sector": sector,
            "today": today,
            "staff_count": len(staff),
            "mandatory_course_count": len(mandatory_codes),
            "compliance_pct": compliance_pct_val,
            "counts": {"ok": ok, "expiring": expiring, "expired": expired, "missing": missing},
            "expiring_soon": sorted(expiring_list, key=lambda x: x.get("expires_on") or "")[:20],
            "overdue": overdue_list[:30],
            "certificates": {"total": cert_total, "verified": cert_verified, "pending": sum(1 for c in certs if c.get("verification_status") == "pending")},
            "qualifications": {"counts": qual_counts, "total": len(quals)},
            "dev_plans": {"active": len(plans), "coverage_pct": round(plans_coverage)},
            "readiness_score": readiness_score,
            "readiness_rag": readiness_rag,
        }

    # ===== Supervision integration (bi-dir) =====
    @router.post("/supervisions/{sid}/training-actions")
    async def add_supervision_training_action(
        sid: str,
        payload: ObjectiveIn,
        user: dict = Depends(_require_tier(3)),
    ):
        """Create a training/qualification action from inside a supervision session.
        Auto-creates (or appends to) the active development plan for the current year
        and links the objective back to the supervision."""
        sup = await _db.supervisions.find_one({"id": sid}, {"_id": 0})
        if not sup:
            raise HTTPException(404, "Supervision not found")
        staff_id = sup["staff_id"]
        year = datetime.now(timezone.utc).year
        plan = await _db.tc_dev_plans.find_one(
            {"staff_id": staff_id, "year": year, "status": "active"}, {"_id": 0}
        )
        if not plan:
            staff = await _db.users.find_one({"id": staff_id}, {"_id": 0}) or {}
            plan = {
                "id": str(uuid.uuid4()),
                "staff_id": staff_id,
                "staff_name": staff.get("name"),
                "year": year,
                "focus_area": "Auto-created from supervision",
                "status": "active",
                "objectives": [],
                "quarterly_reviews": {},
                "created_by_id": user["id"],
                "created_by_name": user["name"],
                "created_at": _now(),
                "archived_at": None,
            }
            await _db.tc_dev_plans.insert_one(plan)
            plan.pop("_id", None)
        obj = {
            "id": str(uuid.uuid4()),
            **payload.model_dump(),
            "linked_supervision_id": sid,
            "status": "open",
            "progress_notes": None,
            "completion_evidence": None,
            "completed_at": None,
            "created_at": _now(),
        }
        await _db.tc_dev_plans.update_one({"id": plan["id"]}, {"$push": {"objectives": obj}})
        await _db.supervisions.update_one(
            {"id": sid},
            {"$push": {"linked_objectives": {"plan_id": plan["id"], "objective_id": obj["id"], "title": obj["title"]}}},
        )
        await _record_audit(
            db=_db, actor=user, action="tc_supervision_action",
            object_type="supervision", object_id=sid,
            summary=f"Supervision action created: {obj['title']}",
        )
        return {"plan_id": plan["id"], "objective": obj}

    # ===== Seed endpoint (manual nudge if seed at startup gets skipped) =====
    @router.post("/training-centre/seed")
    async def reseed(user: dict = Depends(_require_tier(3))):
        await tc.seed_catalogues(_db)
        c_count = await _db.tc_courses.count_documents({})
        q_count = await _db.tc_qual_catalogue.count_documents({})
        return {"seeded": True, "courses": c_count, "qualifications": q_count}
