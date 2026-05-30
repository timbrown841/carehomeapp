"""Phase E.2 — Care Task Scheduler (organisation-wide).

A separate scheduling layer from the resident-level `care_tasks` collection
(Iteration 31 — morning routine etc). These are home-wide operational tasks
that managers schedule, assign and track: key work sessions, supervisions,
LAC reviews, PEP meetings, Reg 44 actions, training renewals, etc.

Stored in `scheduler_tasks` collection. Recurrence supports
day-of-week + interval (e.g. "every 2nd Tuesday" or "monthly on day 1").
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta, date
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api", tags=["Care Task Scheduler"])

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


# ---- Templates (idempotent seed) -------------------------------------------
# Each template: kind, title, default recurrence
TASK_TEMPLATES: list[dict] = [
    {"kind": "key_work", "title": "Key work session", "default_recurrence": {"kind": "weekly", "interval": 1}},
    {"kind": "supervision", "title": "Staff supervision", "default_recurrence": {"kind": "monthly", "interval": 1}},
    {"kind": "team_meeting", "title": "Team meeting", "default_recurrence": {"kind": "monthly", "interval": 1}},
    {"kind": "lac_review", "title": "LAC review", "default_recurrence": {"kind": "monthly", "interval": 6}},
    {"kind": "pep_meeting", "title": "PEP meeting", "default_recurrence": {"kind": "monthly", "interval": 3}},
    {"kind": "family_time", "title": "Family time / contact", "default_recurrence": {"kind": "weekly", "interval": 1}},
    {"kind": "health_appointment", "title": "Health appointment", "default_recurrence": {"kind": "none"}},
    {"kind": "independent_living", "title": "Independent living session", "default_recurrence": {"kind": "weekly", "interval": 2}},
    {"kind": "training_renewal", "title": "Training renewal", "default_recurrence": {"kind": "none"}},
    {"kind": "reg44_action", "title": "Regulation 44 action", "default_recurrence": {"kind": "none"}},
    {"kind": "ofsted_action", "title": "Ofsted action plan task", "default_recurrence": {"kind": "none"}},
    {"kind": "custom", "title": "Custom task", "default_recurrence": {"kind": "none"}},
]


async def seed_templates(db):
    """Idempotent — inserts the 12 default task templates if missing."""
    now = datetime.now(timezone.utc).isoformat()
    for t in TASK_TEMPLATES:
        await db.scheduler_templates.update_one(
            {"kind": t["kind"]},
            {"$setOnInsert": {**t, "created_at": now}},
            upsert=True,
        )


# ---- Pydantic models -------------------------------------------------------

class Recurrence(BaseModel):
    kind: Literal["none", "weekly", "fortnightly", "monthly", "quarterly", "annual"] = "none"
    interval: int = Field(1, ge=1, le=24)
    # 0 = Mon ... 6 = Sun
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    # day_of_month used for monthly/quarterly/annual
    day_of_month: Optional[int] = Field(None, ge=1, le=31)


class TaskIn(BaseModel):
    kind: str = Field(..., max_length=80)
    title: str = Field(..., max_length=300)
    description: Optional[str] = Field(None, max_length=2000)
    assigned_to_id: Optional[str] = None
    resident_id: Optional[str] = None
    staff_id: Optional[str] = None
    due_at: str  # YYYY-MM-DD or ISO datetime
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    recurrence: Optional[Recurrence] = None
    linked_supervision_id: Optional[str] = None
    linked_objective_id: Optional[str] = None
    linked_incident_id: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=2000)


class TaskPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to_id: Optional[str] = None
    due_at: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = None
    status: Optional[Literal["pending", "in_progress", "completed", "cancelled"]] = None
    notes: Optional[str] = None


class TaskCompleteIn(BaseModel):
    evidence: str = Field(..., max_length=4000)


class SupTaskIn(BaseModel):
    title: str = Field(..., max_length=300)
    kind: str = "supervision"
    due_at: str
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    description: Optional[str] = None


# ---- Helpers ---------------------------------------------------------------

def _now():
    return datetime.now(timezone.utc).isoformat()


def _today_iso():
    return date.today().isoformat()


def _parse_date(s: str) -> date:
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


def _compute_status(task: dict) -> str:
    """Deterministic status: pending/in_progress/completed/cancelled/overdue (computed)."""
    if task.get("status") in ("completed", "cancelled"):
        return task["status"]
    due = task.get("due_at", "")[:10]
    if due and due < _today_iso():
        return "overdue"
    return task.get("status", "pending")


def _next_due_at(due_at: str, recurrence: dict | None) -> Optional[str]:
    """Given the current due_at and a recurrence rule, compute the next due_at."""
    if not recurrence or recurrence.get("kind") in (None, "none"):
        return None
    d = _parse_date(due_at)
    kind = recurrence["kind"]
    interval = int(recurrence.get("interval", 1))
    if kind == "weekly":
        d2 = d + timedelta(days=7 * interval)
    elif kind == "fortnightly":
        d2 = d + timedelta(days=14 * interval)
    elif kind == "monthly":
        d2 = _add_months(d, interval)
    elif kind == "quarterly":
        d2 = _add_months(d, 3 * interval)
    elif kind == "annual":
        d2 = _add_months(d, 12 * interval)
    else:
        return None
    # If day_of_week specified for weekly/fortnightly, snap forward to that weekday
    if kind in ("weekly", "fortnightly") and recurrence.get("day_of_week") is not None:
        target = int(recurrence["day_of_week"])
        delta = (target - d2.weekday()) % 7
        d2 = d2 + timedelta(days=delta)
    return d2.isoformat()


def _add_months(d: date, months: int) -> date:
    """Add N calendar months, clamping to month end where needed."""
    y, m = d.year, d.month + months
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    # Clamp day
    import calendar as _cal
    last = _cal.monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def _strip(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


# ---- Routes ----------------------------------------------------------------

def build_routes():
    router.routes.clear()

    @router.get("/tasks/templates")
    async def list_templates(_: dict = Depends(_get_current_user)):
        docs = await _db.scheduler_templates.find({}, {"_id": 0}).to_list(50)
        # Stable order matching TASK_TEMPLATES
        order = {t["kind"]: i for i, t in enumerate(TASK_TEMPLATES)}
        docs.sort(key=lambda x: order.get(x.get("kind"), 99))
        return {"templates": docs, "count": len(docs)}

    @router.get("/tasks")
    async def list_tasks(
        status: Optional[str] = None,
        assigned_to_id: Optional[str] = None,
        kind: Optional[str] = None,
        resident_id: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: int = 200,
        user: dict = Depends(_get_current_user),
    ):
        q: dict = {}
        # Staff can only see tasks assigned to them
        if user.get("role") == "staff":
            q["assigned_to_id"] = user["id"]
        else:
            if assigned_to_id:
                q["assigned_to_id"] = assigned_to_id
        if kind:
            q["kind"] = kind
        if resident_id:
            q["resident_id"] = resident_id
        if from_date or to_date:
            q["due_at"] = {}
            if from_date:
                q["due_at"]["$gte"] = from_date
            if to_date:
                q["due_at"]["$lte"] = to_date
        if status and status not in ("overdue", "open"):
            q["status"] = status
        docs = await _db.scheduler_tasks.find(q, {"_id": 0}).sort("due_at", 1).to_list(max(1, min(limit, 500)))
        for d in docs:
            d["computed_status"] = _compute_status(d)
        if status == "overdue":
            docs = [d for d in docs if d["computed_status"] == "overdue"]
        elif status == "open":
            docs = [d for d in docs if d["computed_status"] in ("pending", "in_progress", "overdue")]
        return {"tasks": docs, "count": len(docs)}

    @router.get("/tasks/mine")
    async def my_tasks(user: dict = Depends(_get_current_user)):
        docs = await _db.scheduler_tasks.find(
            {"assigned_to_id": user["id"], "status": {"$in": ["pending", "in_progress"]}},
            {"_id": 0},
        ).sort("due_at", 1).to_list(200)
        for d in docs:
            d["computed_status"] = _compute_status(d)
        return {"tasks": docs, "count": len(docs), "today": _today_iso()}

    @router.get("/tasks/dashboard")
    async def tasks_dashboard(user: dict = Depends(_require_tier(2))):
        today = _today_iso()
        in_7d = (date.today() + timedelta(days=7)).isoformat()
        docs = await _db.scheduler_tasks.find(
            {"status": {"$in": ["pending", "in_progress"]}}, {"_id": 0}
        ).to_list(2000)
        upcoming = []
        overdue = []
        by_kind: dict[str, int] = {}
        for d in docs:
            d["computed_status"] = _compute_status(d)
            by_kind[d["kind"]] = by_kind.get(d["kind"], 0) + 1
            due = (d.get("due_at") or "")[:10]
            if d["computed_status"] == "overdue":
                overdue.append(d)
            elif today <= due <= in_7d:
                upcoming.append(d)
        upcoming.sort(key=lambda x: x.get("due_at") or "")
        overdue.sort(key=lambda x: x.get("due_at") or "")
        # Manager action centre: overdue + critical priority unsigned
        manager_focus = [d for d in docs if d["computed_status"] == "overdue" or d.get("priority") == "critical"]
        # Home compliance score: ratio of completed-on-time / total within 30 days
        last_30 = (date.today() - timedelta(days=30)).isoformat()
        recent = await _db.scheduler_tasks.find(
            {"due_at": {"$gte": last_30}}, {"_id": 0}
        ).to_list(2000)
        total = len(recent)
        completed_on_time = sum(
            1 for r in recent
            if r.get("status") == "completed"
            and (r.get("completed_at") or "9999-12-31")[:10] <= (r.get("due_at") or "")[:10]
        )
        compliance_pct = round((completed_on_time / total) * 100) if total else 100
        return {
            "today": today,
            "upcoming_7d": upcoming[:30],
            "overdue": overdue[:30],
            "by_kind": [{"kind": k, "count": v} for k, v in sorted(by_kind.items(), key=lambda x: -x[1])],
            "manager_focus": manager_focus[:20],
            "total_open": len(docs),
            "compliance_pct": compliance_pct,
            "compliance_window_days": 30,
        }

    @router.post("/tasks")
    async def create_task(payload: TaskIn, user: dict = Depends(_require_tier(2))):
        assigned_name = None
        if payload.assigned_to_id:
            u = await _db.users.find_one({"id": payload.assigned_to_id}, {"_id": 0, "name": 1})
            if not u:
                raise HTTPException(404, "Assignee not found")
            assigned_name = u.get("name")
        doc = {
            "id": str(uuid.uuid4()),
            "kind": payload.kind,
            "title": payload.title,
            "description": payload.description,
            "assigned_to_id": payload.assigned_to_id,
            "assigned_to_name": assigned_name,
            "resident_id": payload.resident_id,
            "staff_id": payload.staff_id,
            "due_at": payload.due_at,
            "priority": payload.priority,
            "status": "pending",
            "recurrence": payload.recurrence.model_dump() if payload.recurrence else None,
            "linked_supervision_id": payload.linked_supervision_id,
            "linked_objective_id": payload.linked_objective_id,
            "linked_incident_id": payload.linked_incident_id,
            "notes": payload.notes,
            "evidence": None,
            "completed_at": None,
            "completed_by_id": None,
            "completed_by_name": None,
            "created_by_id": user["id"],
            "created_by_name": user["name"],
            "created_at": _now(),
        }
        await _db.scheduler_tasks.insert_one(doc)
        doc.pop("_id", None)
        await _record_audit(
            db=_db, actor=user, action="task_created",
            object_type="scheduler_task", object_id=doc["id"],
            summary=f"Task: {doc['title']}",
        )
        return doc

    @router.patch("/tasks/{tid}")
    async def patch_task(tid: str, payload: TaskPatch, user: dict = Depends(_get_current_user)):
        current = await _db.scheduler_tasks.find_one({"id": tid}, {"_id": 0})
        if not current:
            raise HTTPException(404, "Task not found")
        # Staff can only update status of own assigned task
        if user.get("role") == "staff":
            if current.get("assigned_to_id") != user["id"]:
                raise HTTPException(403, "Not your task")
            allowed_keys = {"status"}
            updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if k in allowed_keys}
            if not updates:
                raise HTTPException(400, "Staff can only update status")
        else:
            updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
        if updates.get("assigned_to_id"):
            u = await _db.users.find_one({"id": updates["assigned_to_id"]}, {"_id": 0, "name": 1})
            updates["assigned_to_name"] = (u or {}).get("name")
        await _db.scheduler_tasks.update_one({"id": tid}, {"$set": updates})
        await _record_audit(
            db=_db, actor=user, action="task_updated",
            object_type="scheduler_task", object_id=tid,
            summary=f"Task updated: {', '.join(updates.keys())}",
        )
        return await _db.scheduler_tasks.find_one({"id": tid}, {"_id": 0})

    @router.post("/tasks/{tid}/complete")
    async def complete_task(tid: str, payload: TaskCompleteIn, user: dict = Depends(_get_current_user)):
        current = await _db.scheduler_tasks.find_one({"id": tid}, {"_id": 0})
        if not current:
            raise HTTPException(404, "Task not found")
        # Assignee or manager+ may complete
        is_assignee = current.get("assigned_to_id") == user["id"]
        is_mgr = user.get("role") in ("manager", "admin", "senior")
        if not (is_assignee or is_mgr):
            raise HTTPException(403, "Not your task")
        now = _now()
        await _db.scheduler_tasks.update_one(
            {"id": tid},
            {"$set": {
                "status": "completed",
                "evidence": payload.evidence,
                "completed_at": now,
                "completed_by_id": user["id"],
                "completed_by_name": user["name"],
            }},
        )
        # Recurrence: spawn the next instance
        next_id = None
        rec = current.get("recurrence")
        if rec and rec.get("kind") not in (None, "none"):
            nx = _next_due_at(current["due_at"], rec)
            if nx:
                next_doc = {
                    **current,
                    "id": str(uuid.uuid4()),
                    "due_at": nx,
                    "status": "pending",
                    "evidence": None,
                    "completed_at": None,
                    "completed_by_id": None,
                    "completed_by_name": None,
                    "created_at": now,
                    "parent_task_id": current["id"],
                }
                next_doc.pop("_id", None)
                await _db.scheduler_tasks.insert_one(next_doc)
                next_id = next_doc["id"]
        await _record_audit(
            db=_db, actor=user, action="task_completed",
            object_type="scheduler_task", object_id=tid,
            summary=f"Completed: {current.get('title')}",
        )
        return {"completed": True, "next_task_id": next_id}

    @router.delete("/tasks/{tid}")
    async def delete_task(tid: str, user: dict = Depends(_require_tier(3))):
        await _db.scheduler_tasks.delete_one({"id": tid})
        await _record_audit(
            db=_db, actor=user, action="task_deleted",
            object_type="scheduler_task", object_id=tid,
            summary="Task deleted",
        )
        return {"deleted": 1}

    # ===== Auto-create from supervision (E.1 bi-dir, Phase E.2 hook) =====
    @router.post("/supervisions/{sid}/tasks")
    async def auto_task_from_supervision(sid: str, payload: SupTaskIn, user: dict = Depends(_require_tier(2))):
        """Create a scheduled task linked back to a supervision session.
        Bi-directional: also records the task_id on the supervision."""
        sup = await _db.supervisions.find_one({"id": sid}, {"_id": 0})
        if not sup:
            raise HTTPException(404, "Supervision not found")
        assignee_id = sup["staff_id"]
        u = await _db.users.find_one({"id": assignee_id}, {"_id": 0, "name": 1})
        doc = {
            "id": str(uuid.uuid4()),
            "kind": payload.kind,
            "title": payload.title,
            "description": payload.description,
            "assigned_to_id": assignee_id,
            "assigned_to_name": (u or {}).get("name"),
            "staff_id": assignee_id,
            "due_at": payload.due_at,
            "priority": payload.priority,
            "status": "pending",
            "recurrence": None,
            "linked_supervision_id": sid,
            "linked_objective_id": None,
            "linked_incident_id": None,
            "notes": None,
            "evidence": None,
            "completed_at": None,
            "completed_by_id": None,
            "completed_by_name": None,
            "created_by_id": user["id"],
            "created_by_name": user["name"],
            "created_at": _now(),
        }
        await _db.scheduler_tasks.insert_one(doc)
        doc.pop("_id", None)
        await _db.supervisions.update_one(
            {"id": sid}, {"$push": {"linked_task_ids": doc["id"]}}
        )
        await _record_audit(
            db=_db, actor=user, action="task_from_supervision",
            object_type="scheduler_task", object_id=doc["id"],
            summary=f"Supervision action -> task: {doc['title']}",
        )
        return doc

    @router.post("/tasks/seed-templates")
    async def reseed_templates(_: dict = Depends(_require_tier(3))):
        await seed_templates(_db)
        c = await _db.scheduler_templates.count_documents({})
        return {"seeded": True, "templates": c}
