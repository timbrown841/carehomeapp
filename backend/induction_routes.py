"""Phase E.3 — Staff Induction Checklist module.

A first-class structured induction with 16 standard sections (welcome,
safeguarding, shadow shifts, professional boundaries … final manager
sign-off). Each section tracks progress (not_started / in_progress /
completed), notes, optional evidence file, and per-item completion stamp.

Distinct from the legacy policy-week `induction_packs` collection — that
remains for policy-category enrolments. This is the new operational
checklist the inductee actually works through.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api", tags=["Staff Induction"])

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


# ---- Standard 16-section induction template --------------------------------
INDUCTION_SECTIONS: list[dict] = [
    {"key": "welcome", "title": "Welcome and company overview",
     "description": "Mission, values, structure, who's who and tour of the home."},
    {"key": "policies_procedures", "title": "Policies and procedures",
     "description": "Read & sign for all live policies under your sector."},
    {"key": "safeguarding", "title": "Safeguarding induction",
     "description": "Designated Safeguarding Lead, reporting routes, allegations procedures."},
    {"key": "fire_emergency", "title": "Fire safety and emergency procedures",
     "description": "Evacuation plan, assembly point, extinguishers, drills, contractors."},
    {"key": "medication", "title": "Medication awareness",
     "description": "MAR sheet basics, witness rules, controlled drugs, refusals, disposal."},
    {"key": "behaviour_support", "title": "Behaviour support / PACE approach",
     "description": "Trauma-informed practice, de-escalation, restrictive practice principles."},
    {"key": "missing_from_care", "title": "Missing from care procedures",
     "description": "Reporting, return interviews, Philomena Protocol, partner agencies."},
    {"key": "recording_logs", "title": "Recording and daily logs",
     "description": "Daily note quality, incident structure, handover discipline."},
    {"key": "key_working", "title": "Key working expectations",
     "description": "Session frameworks, young person voice, plan-do-review cycle."},
    {"key": "professional_boundaries", "title": "Professional boundaries",
     "description": "Gifts, social media, dual relationships, confidentiality."},
    {"key": "whistleblowing", "title": "Whistleblowing",
     "description": "Speak Up routes, protections, escalation channels."},
    {"key": "health_safety", "title": "Health and safety",
     "description": "Risk assessments, lone working, infection control, RIDDOR."},
    {"key": "shadow_shifts", "title": "Shadow shifts",
     "description": "Minimum 3 shadow shifts logged with reflective feedback per shift."},
    {"key": "supervision", "title": "Supervision arrangements",
     "description": "Frequency, format, what to bring, reflective practice."},
    {"key": "mandatory_training", "title": "Mandatory training links",
     "description": "All mandatory training booked or completed (see Training Centre)."},
    {"key": "manager_signoff", "title": "Final manager sign-off",
     "description": "Manager confirms induction complete and the staff member is ready to operate on independent shifts."},
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _new_item(section: dict) -> dict:
    return {
        "key": section["key"],
        "title": section["title"],
        "description": section["description"],
        "status": "not_started",
        "notes": None,
        "evidence_file_id": None,
        "evidence_file_name": None,
        "completed_at": None,
        "completed_by_id": None,
        "completed_by_name": None,
    }


def _compute_progress(items: list[dict]) -> dict:
    total = len(items)
    complete = sum(1 for i in items if i.get("status") == "completed")
    in_progress = sum(1 for i in items if i.get("status") == "in_progress")
    not_started = total - complete - in_progress
    pct = round((complete / total) * 100) if total else 0
    overall = "completed" if complete == total else ("in_progress" if (in_progress or complete) else "not_started")
    return {
        "complete": complete, "in_progress": in_progress,
        "not_started": not_started, "total": total,
        "completion_pct": pct, "overall_status": overall,
    }


# ---- Pydantic in-models ----------------------------------------------------

class AssignmentIn(BaseModel):
    staff_id: str
    sector: Literal["children", "adult"] = "children"
    target_completion: Optional[str] = None  # YYYY-MM-DD


class ItemPatch(BaseModel):
    status: Optional[Literal["not_started", "in_progress", "completed"]] = None
    notes: Optional[str] = Field(None, max_length=4000)
    evidence_file_id: Optional[str] = None
    evidence_file_name: Optional[str] = None


class SignOffIn(BaseModel):
    declaration: str = Field(..., max_length=2000)


def _is_manager(user: dict) -> bool:
    return user.get("role") in ("manager", "admin")


def _is_senior_plus(user: dict) -> bool:
    return user.get("role") in ("senior", "manager", "admin")


# ---- Routes ----------------------------------------------------------------

def build_routes():
    router.routes.clear()

    @router.get("/induction/template")
    async def induction_template(_: dict = Depends(_get_current_user)):
        return {"sections": INDUCTION_SECTIONS, "count": len(INDUCTION_SECTIONS)}

    @router.get("/induction/assignments")
    async def list_assignments(
        staff_id: Optional[str] = None,
        status: Optional[str] = None,
        user: dict = Depends(_get_current_user),
    ):
        q: dict = {}
        if user.get("role") == "staff":
            q["staff_id"] = user["id"]
        else:
            if staff_id:
                q["staff_id"] = staff_id
        docs = await _db.induction_assignments.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        # Compute progress per assignment
        out = []
        for d in docs:
            prog = _compute_progress(d.get("items", []))
            d["progress"] = prog
            if status and prog["overall_status"] != status:
                continue
            out.append(d)
        return {"assignments": out, "count": len(out)}

    @router.get("/induction/assignments/mine")
    async def my_assignment(user: dict = Depends(_get_current_user)):
        # Prefer an active (non-signed-off) assignment; fall back to most recent
        doc = await _db.induction_assignments.find_one(
            {"staff_id": user["id"], "signed_off_at": None}, {"_id": 0},
            sort=[("created_at", -1)],
        )
        if not doc:
            doc = await _db.induction_assignments.find_one(
                {"staff_id": user["id"]}, {"_id": 0},
                sort=[("created_at", -1)],
            )
        if not doc:
            return {"assignment": None}
        doc["progress"] = _compute_progress(doc.get("items", []))
        return {"assignment": doc}

    @router.get("/induction/assignments/{aid}")
    async def get_assignment(aid: str, user: dict = Depends(_get_current_user)):
        doc = await _db.induction_assignments.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Induction assignment not found")
        if user.get("role") == "staff" and doc.get("staff_id") != user["id"]:
            raise HTTPException(403, "Not your induction")
        doc["progress"] = _compute_progress(doc.get("items", []))
        return doc

    @router.post("/induction/assignments")
    async def create_assignment(payload: AssignmentIn, user: dict = Depends(_require_tier(2))):
        staff = await _db.users.find_one({"id": payload.staff_id}, {"_id": 0})
        if not staff:
            raise HTTPException(404, "Staff not found")
        # Reject if an active (non-signed-off) assignment already exists
        existing = await _db.induction_assignments.find_one(
            {"staff_id": payload.staff_id, "signed_off_at": None}, {"_id": 0}
        )
        if existing:
            raise HTTPException(400, "Staff member already has an active induction assignment")
        doc = {
            "id": str(uuid.uuid4()),
            "staff_id": payload.staff_id,
            "staff_name": staff.get("name"),
            "staff_role": staff.get("role"),
            "sector": payload.sector,
            "target_completion": payload.target_completion,
            "items": [_new_item(s) for s in INDUCTION_SECTIONS],
            "signed_off_at": None,
            "signed_off_by_id": None,
            "signed_off_by_name": None,
            "signed_off_declaration": None,
            "assigned_by_id": user["id"],
            "assigned_by_name": user["name"],
            "created_at": _now(),
        }
        await _db.induction_assignments.insert_one(doc)
        doc.pop("_id", None)
        doc["progress"] = _compute_progress(doc["items"])
        await _record_audit(
            db=_db, actor=user, action="induction_assigned",
            object_type="induction_assignment", object_id=doc["id"],
            summary=f"Induction assigned to {doc['staff_name']}",
        )
        return doc

    @router.patch("/induction/assignments/{aid}/items/{item_key}")
    async def patch_item(aid: str, item_key: str, payload: ItemPatch,
                          user: dict = Depends(_get_current_user)):
        doc = await _db.induction_assignments.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Assignment not found")
        # Staff may only patch their own assignment
        is_own = doc.get("staff_id") == user["id"]
        if user.get("role") == "staff" and not is_own:
            raise HTTPException(403, "Not your induction")
        # The final manager sign-off item is locked to managers only
        if item_key == "manager_signoff" and not _is_manager(user):
            raise HTTPException(403, "Only managers can mark the final sign-off item")
        if doc.get("signed_off_at"):
            raise HTTPException(400, "Induction already signed off — read-only")
        items = doc.get("items", [])
        idx = next((i for i, it in enumerate(items) if it.get("key") == item_key), -1)
        if idx < 0:
            raise HTTPException(404, "Item not found")
        updates = payload.model_dump(exclude_unset=True)
        for k, v in updates.items():
            items[idx][k] = v
        if updates.get("status") == "completed":
            items[idx]["completed_at"] = _now()
            items[idx]["completed_by_id"] = user["id"]
            items[idx]["completed_by_name"] = user["name"]
        elif updates.get("status") in ("not_started", "in_progress"):
            items[idx]["completed_at"] = None
            items[idx]["completed_by_id"] = None
            items[idx]["completed_by_name"] = None
        await _db.induction_assignments.update_one({"id": aid}, {"$set": {"items": items}})
        await _record_audit(
            db=_db, actor=user, action="induction_item_updated",
            object_type="induction_assignment", object_id=aid,
            summary=f"Item '{item_key}' → {updates.get('status') or 'edit'}",
        )
        return {"item": items[idx], "progress": _compute_progress(items)}

    @router.post("/induction/assignments/{aid}/sign-off")
    async def sign_off(aid: str, payload: SignOffIn, user: dict = Depends(_require_tier(3))):
        doc = await _db.induction_assignments.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Assignment not found")
        if doc.get("signed_off_at"):
            raise HTTPException(400, "Already signed off")
        prog = _compute_progress(doc.get("items", []))
        if prog["overall_status"] != "completed":
            raise HTTPException(400, f"Cannot sign off — {prog['complete']}/{prog['total']} sections complete")
        now = _now()
        await _db.induction_assignments.update_one(
            {"id": aid},
            {"$set": {
                "signed_off_at": now,
                "signed_off_by_id": user["id"],
                "signed_off_by_name": user["name"],
                "signed_off_declaration": payload.declaration,
            }},
        )
        await _record_audit(
            db=_db, actor=user, action="induction_signed_off",
            object_type="induction_assignment", object_id=aid,
            summary=f"Induction signed off for {doc['staff_name']}",
        )
        return {"signed_off": True, "signed_off_at": now}

    @router.delete("/induction/assignments/{aid}")
    async def delete_assignment(aid: str, user: dict = Depends(_require_tier(3))):
        res = await _db.induction_assignments.delete_one({"id": aid})
        await _record_audit(
            db=_db, actor=user, action="induction_deleted",
            object_type="induction_assignment", object_id=aid,
            summary="Induction assignment deleted",
        )
        return {"deleted": res.deleted_count}
