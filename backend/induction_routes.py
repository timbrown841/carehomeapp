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
_save_upload = None
_org_name = "Care Home"


def init(*, db, get_current_user, require_tier, record_audit, save_upload=None, org_name=None):
    global _db, _get_current_user, _require_tier, _record_audit, _save_upload, _org_name
    _db = db
    _get_current_user = get_current_user
    _require_tier = require_tier
    _record_audit = record_audit
    _save_upload = save_upload
    if org_name:
        _org_name = org_name


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


def _risk(assignment: dict) -> str:
    """Deterministic RAG risk for an induction assignment.
    - signed_off: green (completed)
    - no target_completion: green (no deadline pressure)
    - target_completion < today and not signed_off: red
    - target_completion <= today + 7 days and not signed_off: amber
    - else: green
    """
    from datetime import date as _date, timedelta as _td
    if assignment.get("signed_off_at"):
        return "green"
    target = (assignment.get("target_completion") or "")[:10]
    if not target:
        return "green"
    try:
        td = _date.fromisoformat(target)
    except Exception:
        return "green"
    today = _date.today()
    if td < today:
        return "red"
    if td <= today + _td(days=7):
        return "amber"
    return "green"


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
            d["risk"] = _risk(d)
            if status and prog["overall_status"] != status:
                continue
            out.append(d)
        return {"assignments": out, "count": len(out)}

    @router.get("/induction/dashboard")
    async def induction_dashboard(_: dict = Depends(_require_tier(2))):
        """E.3.1 — Induction risk widget for managers."""
        from datetime import date as _date, timedelta as _td
        today = _date.today()
        in_7 = today + _td(days=7)
        ago_30 = today - _td(days=30)
        all_docs = await _db.induction_assignments.find({}, {"_id": 0}).to_list(2000)
        total = len(all_docs)
        signed_off = 0
        in_progress = 0
        overdue: list[dict] = []
        at_risk: list[dict] = []
        due_this_week: list[dict] = []
        recently_completed: list[dict] = []
        for d in all_docs:
            d_progress = _compute_progress(d.get("items", []))
            d_risk = _risk(d)
            row = {
                "id": d["id"], "staff_id": d.get("staff_id"),
                "staff_name": d.get("staff_name"), "staff_role": d.get("staff_role"),
                "sector": d.get("sector"),
                "target_completion": d.get("target_completion"),
                "signed_off_at": d.get("signed_off_at"),
                "completion_pct": d_progress["completion_pct"],
                "risk": d_risk,
            }
            if d.get("signed_off_at"):
                signed_off += 1
                so = (d.get("signed_off_at") or "")[:10]
                try:
                    if _date.fromisoformat(so) >= ago_30:
                        recently_completed.append(row)
                except Exception:
                    pass
                continue
            in_progress += 1
            t = (d.get("target_completion") or "")[:10]
            if t:
                try:
                    td = _date.fromisoformat(t)
                    if td < today:
                        overdue.append(row)
                    elif td <= in_7:
                        due_this_week.append(row)
                        at_risk.append(row)
                except Exception:
                    pass
            if d_risk in ("amber", "red"):
                # ensure at_risk also includes red overdue items
                if row not in at_risk:
                    at_risk.append(row)
        compliance_pct = round((signed_off / total) * 100) if total else 100
        recently_completed.sort(key=lambda r: r.get("signed_off_at") or "", reverse=True)
        overdue.sort(key=lambda r: r.get("target_completion") or "")
        due_this_week.sort(key=lambda r: r.get("target_completion") or "")
        at_risk.sort(key=lambda r: r.get("target_completion") or "")
        return {
            "today": today.isoformat(),
            "total": total,
            "signed_off": signed_off,
            "in_progress": in_progress,
            "compliance_pct": compliance_pct,
            "due_this_week": due_this_week[:20],
            "overdue": overdue[:20],
            "at_risk": at_risk[:20],
            "recently_completed": recently_completed[:10],
        }

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
        doc["risk"] = _risk(doc)
        return {"assignment": doc}

    @router.get("/induction/assignments/{aid}")
    async def get_assignment(aid: str, user: dict = Depends(_get_current_user)):
        doc = await _db.induction_assignments.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Induction assignment not found")
        if user.get("role") == "staff" and doc.get("staff_id") != user["id"]:
            raise HTTPException(403, "Not your induction")
        doc["progress"] = _compute_progress(doc.get("items", []))
        doc["risk"] = _risk(doc)
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
        # Refresh doc with fields just set so the PDF and HR record are complete
        doc.update({
            "signed_off_at": now,
            "signed_off_by_id": user["id"],
            "signed_off_by_name": user["name"],
            "signed_off_declaration": payload.declaration,
        })
        # === E.3.1 — Auto-attach PDF certificate to staff HR file ===
        hr_file_id = None
        try:
            from induction_pdf import build_induction_certificate_pdf
            pdf_bytes = build_induction_certificate_pdf(doc, org_name=_org_name)
            # Persist as a staff_file under the 'induction' folder
            storage_id = str(uuid.uuid4())
            # Write file to disk via uploads infra if available, else inline only
            import staff_personnel as _sp  # noqa: F401  (ensures folders exist)
            from uploads_service import save_bytes
            stored = await save_bytes(
                pdf_bytes,
                filename=f"induction-certificate-{doc['staff_id']}.pdf",
                mime="application/pdf",
                kind="document",
                uploaded_by=user,
                db=_db,
            )
            record = {
                "id": str(uuid.uuid4()),
                "staff_user_id": doc["staff_id"],
                "folder_id": "induction",
                "storage_id": stored["id"],
                "original_filename": stored.get("original_name"),
                "mime_type": "application/pdf",
                "size_bytes": stored.get("size"),
                "uploaded_at": now,
                "uploaded_by_id": user["id"],
                "uploaded_by_name": user["name"],
                "expiry_date": None,
                "review_date": None,
                "issued_date": now[:10],
                "reference_no": doc["id"][:8].upper(),
                "notes": "Induction Completion Certificate (auto-attached on manager sign-off).",
                "version": 1,
                "replaces_file_id": None,
                "auto_generated": True,
                "source": "induction_signoff",
                "source_id": doc["id"],
            }
            await _db.staff_files.insert_one(record.copy())
            hr_file_id = record["id"]
            # Update the induction record to remember the HR file id
            await _db.induction_assignments.update_one(
                {"id": aid},
                {"$set": {"hr_file_id": hr_file_id, "certificate_ready": True}},
            )
        except Exception as _e:  # noqa: BLE001
            # Non-fatal — sign-off still succeeds; surface a hint in response
            pass
        await _record_audit(
            db=_db, actor=user, action="induction_signed_off",
            object_type="induction_assignment", object_id=aid,
            summary=f"Induction signed off for {doc['staff_name']}",
        )
        return {"signed_off": True, "signed_off_at": now, "hr_file_id": hr_file_id}

    @router.get("/induction/assignments/{aid}/certificate.pdf")
    async def certificate_pdf(aid: str, user: dict = Depends(_get_current_user)):
        """Stream the induction completion certificate as a PDF.
        Staff may download their own; senior+ may download any."""
        from fastapi.responses import Response
        from induction_pdf import build_induction_certificate_pdf
        doc = await _db.induction_assignments.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Assignment not found")
        if user.get("role") == "staff" and doc.get("staff_id") != user["id"]:
            raise HTTPException(403, "Not your induction")
        if not doc.get("signed_off_at"):
            raise HTTPException(400, "Certificate available only after manager sign-off")
        pdf_bytes = build_induction_certificate_pdf(doc, org_name=_org_name)
        filename = f"induction-certificate-{(doc.get('staff_name') or 'staff').replace(' ', '_')}.pdf"
        await _record_audit(
            db=_db, actor=user, action="induction_certificate_downloaded",
            object_type="induction_assignment", object_id=aid,
            summary=f"Certificate PDF for {doc.get('staff_name')}",
        )
        return Response(
            content=pdf_bytes, media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )

    @router.get("/induction/staff/{staff_id}/summary")
    async def staff_induction_summary(staff_id: str, user: dict = Depends(_get_current_user)):
        """Compact summary used by the Staff Profile / HR file UI."""
        if user.get("role") == "staff" and staff_id != user["id"]:
            raise HTTPException(403, "Not your record")
        docs = await _db.induction_assignments.find(
            {"staff_id": staff_id}, {"_id": 0},
        ).sort("created_at", -1).to_list(50)
        out = []
        for d in docs:
            d["progress"] = _compute_progress(d.get("items", []))
            d["risk"] = _risk(d)
            out.append({
                "id": d["id"],
                "sector": d.get("sector"),
                "created_at": d.get("created_at"),
                "target_completion": d.get("target_completion"),
                "signed_off_at": d.get("signed_off_at"),
                "signed_off_by_name": d.get("signed_off_by_name"),
                "completion_pct": d["progress"]["completion_pct"],
                "complete": d["progress"]["complete"],
                "total": d["progress"]["total"],
                "overall_status": d["progress"]["overall_status"],
                "risk": d["risk"],
                "hr_file_id": d.get("hr_file_id"),
                "outstanding": [
                    {"key": it["key"], "title": it["title"]}
                    for it in d.get("items", []) if it.get("status") != "completed"
                ][:6],
            })
        return {"staff_id": staff_id, "assignments": out, "count": len(out)}

    @router.get("/induction/inspection-pack")
    async def induction_inspection_pack(_: dict = Depends(_require_tier(2))):
        """E.3.1 — One-click induction evidence summary for Ofsted/CQC.
        The full PDF compilation is via /induction/inspection-pack.pdf."""
        from datetime import date as _date
        users = await _db.users.find(
            {"role": {"$in": ["staff", "senior", "manager", "admin"]}},
            {"_id": 0, "id": 1, "name": 1, "role": 1},
        ).to_list(500)
        all_inductions = await _db.induction_assignments.find({}, {"_id": 0}).to_list(2000)
        by_staff: dict = {}
        for d in all_inductions:
            by_staff.setdefault(d["staff_id"], []).append(d)
        fully_inducted = 0
        in_progress = 0
        overdue_count = 0
        rows = []
        today = _date.today().isoformat()
        for u in users:
            inds = by_staff.get(u["id"], [])
            latest = sorted(inds, key=lambda r: r.get("created_at") or "")[-1] if inds else None
            row = {
                "staff_id": u["id"], "staff_name": u["name"], "staff_role": u["role"],
                "status": "no_induction" if not latest else (
                    "signed_off" if latest.get("signed_off_at") else "in_progress"
                ),
                "completion_pct": _compute_progress(latest.get("items", []))["completion_pct"] if latest else 0,
                "target_completion": (latest or {}).get("target_completion"),
                "signed_off_at": (latest or {}).get("signed_off_at"),
                "assignment_id": (latest or {}).get("id"),
            }
            if row["status"] == "signed_off":
                fully_inducted += 1
            elif row["status"] == "in_progress":
                in_progress += 1
                t = (row.get("target_completion") or "")[:10]
                if t and t < today:
                    overdue_count += 1
            rows.append(row)
        total = len(users)
        compliance_pct = round((fully_inducted / total) * 100) if total else 100
        return {
            "today": today,
            "total_staff": total,
            "fully_inducted": fully_inducted,
            "in_progress": in_progress,
            "overdue": overdue_count,
            "no_induction": total - fully_inducted - in_progress,
            "compliance_pct": compliance_pct,
            "rows": rows,
        }

    @router.get("/induction/inspection-pack.pdf")
    async def induction_inspection_pack_pdf(user: dict = Depends(_require_tier(2))):
        """Multi-page evidence pack: summary + each signed-off certificate."""
        from fastapi.responses import Response
        from induction_pdf import build_induction_certificate_pdf
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.colors import HexColor
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.platypus.flowables import HRFlowable
        from pypdf import PdfWriter, PdfReader
        import io as _io

        # Get summary
        summary_call = await induction_inspection_pack(user)

        # === Page 1: summary ===
        summary_buf = _io.BytesIO()
        doc = SimpleDocTemplate(summary_buf, pagesize=A4,
                                 leftMargin=18*mm, rightMargin=18*mm,
                                 topMargin=18*mm, bottomMargin=18*mm,
                                 title="Induction Evidence Pack")
        styles = getSampleStyleSheet()
        h1 = ParagraphStyle("h1", parent=styles["Heading1"],
                             textColor=HexColor("#0E3B4A"), fontSize=20, spaceAfter=6)
        sub = ParagraphStyle("sub", parent=styles["Normal"],
                              textColor=HexColor("#5d6068"), fontSize=10, spaceAfter=14)
        story = []
        story.append(Paragraph(_org_name.upper(), sub))
        story.append(Paragraph("Induction Compliance — Inspection Evidence Pack", h1))
        story.append(Paragraph(f"Generated {summary_call['today']} · {summary_call['total_staff']} staff", sub))
        story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#0E3B4A"), spaceAfter=10))
        # KPI block
        kpi = [
            ["Total staff", str(summary_call["total_staff"])],
            ["Fully inducted (signed off)", str(summary_call["fully_inducted"])],
            ["In progress", str(summary_call["in_progress"])],
            ["No induction recorded", str(summary_call["no_induction"])],
            ["Overdue against target", str(summary_call["overdue"])],
            ["Overall compliance", f"{summary_call['compliance_pct']}%"],
        ]
        kpit = Table(kpi, colWidths=[80*mm, 70*mm])
        kpit.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, HexColor("#E7E5E0")),
        ]))
        story.append(kpit)
        story.append(Spacer(1, 14))
        # Per-staff table
        rows = [["Staff", "Role", "Status", "Completion %", "Target / Signed off"]]
        for r in summary_call["rows"]:
            status_label = {
                "signed_off": "Signed off",
                "in_progress": "In progress",
                "no_induction": "No induction",
            }.get(r["status"], r["status"])
            target_or_signed = (r.get("signed_off_at") or r.get("target_completion") or "—")[:10]
            rows.append([r["staff_name"], r["staff_role"].title(),
                         status_label, f"{r['completion_pct']}%", target_or_signed])
        t = Table(rows, colWidths=[50*mm, 25*mm, 30*mm, 25*mm, 35*mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HexColor("#F1EFEC")),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, HexColor("#E7E5E0")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t)
        doc.build(story)

        # === Pages 2..N: each signed-off certificate ===
        merger = PdfWriter()
        merger.append(PdfReader(_io.BytesIO(summary_buf.getvalue())))
        signed_inductions = await _db.induction_assignments.find(
            {"signed_off_at": {"$ne": None}}, {"_id": 0},
        ).sort("signed_off_at", -1).to_list(500)
        for ind in signed_inductions:
            cert_pdf = build_induction_certificate_pdf(ind, org_name=_org_name)
            merger.append(PdfReader(_io.BytesIO(cert_pdf)))
        out = _io.BytesIO()
        merger.write(out)

        await _record_audit(
            db=_db, actor=user, action="induction_evidence_pack_exported",
            object_type="induction", object_id="pack",
            summary=f"Induction evidence pack ({len(signed_inductions)} certificates)",
        )
        return Response(
            content=out.getvalue(), media_type="application/pdf",
            headers={"Content-Disposition": 'inline; filename="induction-evidence-pack.pdf"'},
        )

    @router.delete("/induction/assignments/{aid}")
    async def delete_assignment(aid: str, user: dict = Depends(_require_tier(3))):
        res = await _db.induction_assignments.delete_one({"id": aid})
        await _record_audit(
            db=_db, actor=user, action="induction_deleted",
            object_type="induction_assignment", object_id=aid,
            summary="Induction assignment deleted",
        )
        return {"deleted": res.deleted_count}
