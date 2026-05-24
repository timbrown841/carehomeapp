"""Safer Recruitment & HR — Operational Personnel Files (Phase F).

A folder-style digital personnel file engine. Deterministic RAG compliance
status per folder, sector-aware (children → Ofsted, adult → CQC), audit-led.

DESIGN PRINCIPLE: We do not invent compliance rules — every folder definition
is mappable to a real safer-recruitment requirement (Working Together /
Children Act / Regulation 44 / CQC Fundamental Standards).
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional

# --- Folder Registry --------------------------------------------------------
# Each folder = single canonical config item. Fields:
#   tab:           Recruitment | Compliance | Supervisions | Training | HR | Audit
#   label:         Display name
#   icon:          lucide-react icon name (frontend uses it)
#   required:      True → missing = RED. False → optional, missing = NEUTRAL.
#   expiry_days:   If not None, files older than this since `expiry_date` go RED.
#   warn_days:     Days before expiry to flag AMBER (default 60).
#   multi:         Multiple docs allowed (True) vs single canonical doc (False).
#   description:   Sub-label for inspector clarity.
#   sectors:       ["children","adult"] (default both). Some folders are sector-specific.
#   agency_only:   True → folder hidden unless staff is_agency=True.
#   review_days:   Some folders require periodic review (e.g. supervision agreement
#                  every 12 months). If older than this since last review → AMBER.

FOLDERS: list[dict] = [
    # === RECRUITMENT — "Can this person legally and safely work here?" ===
    {"id": "initial_application", "tab": "Recruitment", "label": "Initial Application", "icon": "FileText", "required": True, "description": "Application form, CV, covering letter."},
    {"id": "references", "tab": "Recruitment", "label": "References", "icon": "Mail", "required": True, "multi": True, "description": "Two satisfactory references — at least one from most recent employer."},
    {"id": "interview_notes", "tab": "Recruitment", "label": "Interview Notes", "icon": "ClipboardList", "required": True, "multi": True, "description": "Interview record, panel notes, scoring matrix."},
    {"id": "offer_letter", "tab": "Recruitment", "label": "Offer Letter", "icon": "FileSignature", "required": True, "description": "Conditional offer letter."},
    {"id": "job_description", "tab": "Recruitment", "label": "Job Description", "icon": "ScrollText", "required": True, "description": "Signed JD + person specification."},
    {"id": "recruitment_decision", "tab": "Recruitment", "label": "Recruitment Decision", "icon": "Gavel", "required": True, "description": "Documented recruitment decision rationale."},
    {"id": "safer_recruitment_checks", "tab": "Recruitment", "label": "Safer Recruitment Checks", "icon": "ShieldCheck", "required": True, "description": "Safer recruitment self-declaration / Disqualification by Association.", "sectors": ["children"]},
    {"id": "document_original_checks", "tab": "Recruitment", "label": "Document Original Checks", "icon": "FileCheck2", "required": True, "description": "Manager declaration that originals were sighted."},
    {"id": "right_to_work", "tab": "Recruitment", "label": "Right To Work", "icon": "Globe", "required": True, "expiry_days": True, "warn_days": 60, "description": "Right-to-Work check, share code or document. Track expiry where applicable."},
    {"id": "dbs", "tab": "Recruitment", "label": "DBS", "icon": "BadgeCheck", "required": True, "expiry_days": True, "warn_days": 90, "description": "Enhanced DBS with barred list (children's workforce). Update Service status."},
    {"id": "id_documents", "tab": "Recruitment", "label": "I.D Documents", "icon": "Fingerprint", "required": True, "expiry_days": True, "warn_days": 60, "multi": True, "description": "Passport, biometric residence permit, photo driving licence."},
    {"id": "photo", "tab": "Recruitment", "label": "Photo", "icon": "User", "required": True, "description": "Current photo for identification."},
    {"id": "qualifications", "tab": "Recruitment", "label": "Qualifications", "icon": "GraduationCap", "required": True, "multi": True, "description": "Level 3/4/5 Diploma certificates, prior CPD."},
    {"id": "professional_registrations", "tab": "Recruitment", "label": "Professional Registrations", "icon": "BookOpenCheck", "required": False, "expiry_days": True, "warn_days": 60, "multi": True, "description": "NMC / Social Work England / regulated registrations."},
    {"id": "driver_checks", "tab": "Recruitment", "label": "Driver Checks", "icon": "Car", "required": False, "expiry_days": True, "warn_days": 60, "multi": True, "description": "Driving licence, DVLA check, insurance, MOT."},
    {"id": "agency_compliance", "tab": "Recruitment", "label": "Agency Compliance", "icon": "Building2", "required": True, "agency_only": True, "expiry_days": True, "warn_days": 30, "multi": True, "description": "Agency profile, DBS, training certs, framework compliance."},

    # === COMPLIANCE — "Is this staff member currently compliant?" ===
    {"id": "policies_signed", "tab": "Compliance", "label": "Policies Signed", "icon": "Signature", "required": True, "review_days": 365, "multi": True, "description": "Acknowledged policies (safeguarding, whistleblowing, GDPR, IT, lone working)."},
    {"id": "staff_handbook", "tab": "Compliance", "label": "Staff Handbook", "icon": "BookText", "required": True, "review_days": 365, "description": "Signed staff handbook acknowledgement."},
    {"id": "mandatory_training", "tab": "Compliance", "label": "Mandatory Training", "icon": "ShieldAlert", "required": True, "expiry_days": True, "warn_days": 60, "multi": True, "description": "Safeguarding L3, First Aid, Fire, Medication, Restrictive Practice, Food Hygiene, GDPR."},
    {"id": "training_matrix", "tab": "Compliance", "label": "Training Matrix", "icon": "Grid3X3", "required": True, "review_days": 90, "description": "Live training matrix snapshot — what's in-date, expiring, overdue."},
    {"id": "supervision_agreement", "tab": "Compliance", "label": "Supervision Agreement", "icon": "Handshake", "required": True, "review_days": 365, "description": "Signed supervision agreement renewed annually."},
    {"id": "supervision_matrix", "tab": "Compliance", "label": "Supervision Matrix", "icon": "CalendarCheck", "required": True, "review_days": 90, "description": "Frequency record — minimum every 6 weeks (Ofsted)."},
    {"id": "occupational_health", "tab": "Compliance", "label": "Occupational Health", "icon": "HeartPulse", "required": False, "multi": True, "description": "OH clearance, ongoing health assessments."},
    {"id": "return_to_work", "tab": "Compliance", "label": "Return to Work", "icon": "Activity", "required": False, "multi": True, "description": "RTW interviews after sickness/leave."},
    {"id": "compliance_notes", "tab": "Compliance", "label": "Compliance Notes", "icon": "StickyNote", "required": False, "multi": True, "description": "Ongoing compliance observations / concerns."},

    # === SUPERVISIONS — Ofsted scrutiny area ===
    {"id": "supervisions", "tab": "Supervisions", "label": "Supervisions", "icon": "MessagesSquare", "required": True, "review_days": 42, "multi": True, "description": "Routine supervision records — every 6 weeks (Ofsted standard)."},
    {"id": "reflective_supervisions", "tab": "Supervisions", "label": "Reflective Supervisions", "icon": "Brain", "required": False, "multi": True, "description": "Trauma-informed reflective practice sessions."},
    {"id": "probation_supervisions", "tab": "Supervisions", "label": "Probation Supervisions", "icon": "TimerReset", "required": False, "multi": True, "description": "Probationary-period supervision records."},
    {"id": "supervision_outcomes", "tab": "Supervisions", "label": "Outcomes & Actions", "icon": "ListTodo", "required": False, "multi": True, "description": "Action tracking + manager sign-off."},

    # === TRAINING — kept separate (large operationally) ===
    {"id": "specialist_training", "tab": "Training", "label": "Specialist Training", "icon": "Award", "required": False, "expiry_days": True, "warn_days": 60, "multi": True, "description": "Therapeutic crisis, ASD, attachment, CSE, trauma."},
    {"id": "training_certificates", "tab": "Training", "label": "Certificates", "icon": "Trophy", "required": False, "expiry_days": True, "warn_days": 60, "multi": True, "description": "All training certificates filed."},
    {"id": "training_requests", "tab": "Training", "label": "Training Requests", "icon": "Send", "required": False, "multi": True, "description": "Pending CPD / training requests."},
    {"id": "cpd_logs", "tab": "Training", "label": "CPD Logs", "icon": "TrendingUp", "required": False, "multi": True, "description": "Continuing Professional Development records."},
    {"id": "learning_pathways", "tab": "Training", "label": "Learning Pathways", "icon": "Route", "required": False, "description": "Diploma progress, apprenticeship plan."},
    {"id": "training_agreement", "tab": "Training", "label": "Training Agreement", "icon": "FileSignature", "required": True, "review_days": 365, "description": "Signed training agreement / claw-back clause."},

    # === HR — Ongoing employment management ===
    {"id": "contract", "tab": "HR", "label": "Contract", "icon": "FileText", "required": True, "description": "Signed contract of employment."},
    {"id": "induction", "tab": "HR", "label": "Induction", "icon": "Sprout", "required": True, "description": "Induction checklist + sign-off (Children's Workforce Development Council)."},
    {"id": "probation", "tab": "HR", "label": "Probation", "icon": "Hourglass", "required": False, "description": "Probation review + outcome decision."},
    {"id": "appraisals", "tab": "HR", "label": "Appraisals", "icon": "Star", "required": False, "review_days": 365, "multi": True, "description": "Annual appraisal records."},
    {"id": "performance_management", "tab": "HR", "label": "Performance Management", "icon": "Target", "required": False, "multi": True, "description": "Performance improvement plans, capability."},
    {"id": "disciplinary", "tab": "HR", "label": "Disciplinary / Investigations", "icon": "AlertOctagon", "required": False, "multi": True, "description": "Disciplinary records, investigations (restricted)."},
    {"id": "absence_sickness", "tab": "HR", "label": "Absence / Sickness", "icon": "ThermometerSnowflake", "required": False, "multi": True, "description": "Sickness records, Bradford factor."},
    {"id": "annual_leave", "tab": "HR", "label": "Annual Leave", "icon": "Palmtree", "required": False, "multi": True, "description": "AL allowance + record."},
    {"id": "workforce_dev_plan", "tab": "HR", "label": "Workforce Development Plan", "icon": "Map", "required": False, "review_days": 365, "description": "Individual development plan."},
    {"id": "hr_notes", "tab": "HR", "label": "HR Actions / Notes", "icon": "PenLine", "required": False, "multi": True, "description": "General HR notes and actions."},
]

FOLDER_BY_ID = {f["id"]: f for f in FOLDERS}

TABS_ORDER = ["Recruitment", "Compliance", "Supervisions", "Training", "HR", "Audit"]


# --- Helpers ----------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        s = str(s).replace("Z", "+00:00")
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        return None


def applicable_folders(sector: str, is_agency: bool) -> list[dict]:
    """Return the folder set that applies to a staff member for their sector."""
    out: list[dict] = []
    for f in FOLDERS:
        if f.get("agency_only") and not is_agency:
            continue
        sectors = f.get("sectors")
        if sectors and sector not in sectors:
            continue
        out.append(f)
    return out


def compute_folder_status(folder_def: dict, files: list[dict]) -> dict:
    """Deterministic RAG status for a folder based on its files.

    Returns dict with: status (green/amber/red/grey), reason, doc_count,
    earliest_expiry, soonest_review, expiring_count, expired_count.
    """
    now = _now()
    required = bool(folder_def.get("required"))
    has_expiry_field = bool(folder_def.get("expiry_days"))
    review_days = folder_def.get("review_days")
    warn_days = int(folder_def.get("warn_days") or 60)

    doc_count = len(files)
    if doc_count == 0:
        if required:
            return {
                "status": "red", "reason": "Missing required document(s)",
                "doc_count": 0, "earliest_expiry": None, "soonest_review": None,
                "expiring_count": 0, "expired_count": 0,
            }
        return {
            "status": "grey", "reason": "Optional — no records yet",
            "doc_count": 0, "earliest_expiry": None, "soonest_review": None,
            "expiring_count": 0, "expired_count": 0,
        }

    expired_count = 0
    expiring_count = 0
    earliest_expiry: Optional[datetime] = None
    soonest_review: Optional[datetime] = None

    for f in files:
        if has_expiry_field:
            exp = _parse_iso(f.get("expiry_date"))
            if exp:
                if earliest_expiry is None or exp < earliest_expiry:
                    earliest_expiry = exp
                days_to = (exp - now).days
                if days_to < 0:
                    expired_count += 1
                elif days_to <= warn_days:
                    expiring_count += 1
        if review_days:
            rev = _parse_iso(f.get("review_date")) or _parse_iso(f.get("uploaded_at"))
            if rev:
                next_review = rev + timedelta(days=int(review_days))
                if soonest_review is None or next_review < soonest_review:
                    soonest_review = next_review

    # RAG ladder
    if expired_count > 0:
        status, reason = "red", f"{expired_count} expired document(s)"
    elif review_days and soonest_review and soonest_review < now:
        status, reason = "red", "Review overdue"
    elif expiring_count > 0:
        status, reason = "amber", f"{expiring_count} document(s) expiring within {warn_days} days"
    elif review_days and soonest_review and (soonest_review - now).days <= 30:
        status, reason = "amber", "Review due soon"
    elif has_expiry_field and earliest_expiry is None and required:
        # Required doc uploaded but no expiry date set — flag amber
        status, reason = "amber", "Expiry date not recorded"
    else:
        status, reason = "green", "Compliant"

    return {
        "status": status,
        "reason": reason,
        "doc_count": doc_count,
        "earliest_expiry": earliest_expiry.isoformat() if earliest_expiry else None,
        "soonest_review": soonest_review.isoformat() if soonest_review else None,
        "expiring_count": expiring_count,
        "expired_count": expired_count,
    }


async def build_staff_profile_view(db, user_id: str, sector: str = "children") -> Optional[dict]:
    """Full personnel file view for a staff member.

    Returns: profile + tab-grouped folders, each with status + files list (lite).
    """
    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1},
    )
    if not user:
        return None

    profile = await db.staff_profiles.find_one(
        {"user_id": user_id}, {"_id": 0},
    ) or {}
    is_agency = bool(profile.get("is_agency"))

    # Pull all files for this staff
    files = await db.staff_files.find(
        {"staff_user_id": user_id},
        {"_id": 0},
    ).sort("uploaded_at", -1).to_list(2000)

    folders = applicable_folders(sector, is_agency)
    by_folder: dict[str, list[dict]] = {}
    for fl in files:
        by_folder.setdefault(fl.get("folder_id"), []).append(fl)

    tab_groups: dict[str, list[dict]] = {t: [] for t in TABS_ORDER if t != "Audit"}

    overall = {"red": 0, "amber": 0, "green": 0, "grey": 0}
    missing_required: list[dict] = []

    for fdef in folders:
        f_files = by_folder.get(fdef["id"], [])
        status = compute_folder_status(fdef, f_files)
        overall[status["status"]] = overall.get(status["status"], 0) + 1
        if status["status"] == "red" and fdef.get("required"):
            missing_required.append({
                "folder_id": fdef["id"], "label": fdef["label"],
                "tab": fdef["tab"], "reason": status["reason"],
            })

        tab_groups.setdefault(fdef["tab"], []).append({
            "id": fdef["id"],
            "label": fdef["label"],
            "icon": fdef.get("icon"),
            "required": bool(fdef.get("required")),
            "agency_only": bool(fdef.get("agency_only")),
            "expiry_tracked": bool(fdef.get("expiry_days")),
            "review_days": fdef.get("review_days"),
            "warn_days": int(fdef.get("warn_days") or 60),
            "multi": bool(fdef.get("multi")),
            "description": fdef.get("description"),
            "status": status,
            "files": [_file_lite(f) for f in sorted(f_files, key=lambda x: x.get("uploaded_at") or "", reverse=True)],
        })

    overall_status = (
        "red" if overall["red"] > 0 else
        "amber" if overall["amber"] > 0 else
        "green"
    )

    return {
        "staff": {
            "id": user["id"],
            "name": user.get("name"),
            "email": user.get("email"),
            "role": user.get("role"),
        },
        "profile": {
            "is_agency": is_agency,
            "agency_name": profile.get("agency_name"),
            "role_label": profile.get("role_label") or user.get("role", "").title(),
            "start_date": profile.get("start_date"),
            "last_reviewed_at": profile.get("last_reviewed_at"),
            "last_reviewed_by": profile.get("last_reviewed_by"),
        },
        "sector": sector,
        "overall_status": overall_status,
        "overall_counts": overall,
        "missing_required": missing_required,
        "tabs": [
            {"id": t, "folders": tab_groups.get(t, [])}
            for t in TABS_ORDER if t != "Audit"
        ],
    }


def _file_lite(f: dict) -> dict:
    """Trim file record for transport. Excludes sensitive flags."""
    return {
        "id": f.get("id"),
        "folder_id": f.get("folder_id"),
        "original_filename": f.get("original_filename"),
        "mime_type": f.get("mime_type"),
        "size_bytes": f.get("size_bytes"),
        "storage_id": f.get("storage_id"),
        "uploaded_at": f.get("uploaded_at"),
        "uploaded_by_name": f.get("uploaded_by_name"),
        "expiry_date": f.get("expiry_date"),
        "review_date": f.get("review_date"),
        "issued_date": f.get("issued_date"),
        "reference_no": f.get("reference_no"),
        "signed_off_by": f.get("signed_off_by"),
        "signed_off_at": f.get("signed_off_at"),
        "notes": f.get("notes"),
        "version": f.get("version") or 1,
        "replaces_file_id": f.get("replaces_file_id"),
    }


async def build_missing_items(db, user_id: str, sector: str = "children") -> dict:
    """All items currently RED or AMBER for this staff — for the
    'Open all missing items' manager CTA."""
    view = await build_staff_profile_view(db, user_id, sector)
    if not view:
        return {"items": [], "count_red": 0, "count_amber": 0}

    items = []
    for tab in view["tabs"]:
        for folder in tab["folders"]:
            st = folder["status"]
            if st["status"] in ("red", "amber"):
                items.append({
                    "folder_id": folder["id"],
                    "label": folder["label"],
                    "tab": tab["id"],
                    "status": st["status"],
                    "reason": st["reason"],
                    "earliest_expiry": st.get("earliest_expiry"),
                    "soonest_review": st.get("soonest_review"),
                    "required": folder["required"],
                })
    items.sort(key=lambda i: (0 if i["status"] == "red" else 1, not i["required"]))
    return {
        "staff_id": user_id,
        "staff_name": view["staff"]["name"],
        "items": items,
        "count_red": sum(1 for i in items if i["status"] == "red"),
        "count_amber": sum(1 for i in items if i["status"] == "amber"),
    }


async def build_hr_dashboard(db, sector: str = "children") -> dict:
    """Manager dashboard — org-wide HR oversight.

    Surfaces: missing compliance, expiring documents (next 60d), overall RAG
    distribution, top concerns.
    """
    users = await db.users.find(
        {"role": {"$in": ["staff", "senior", "manager", "admin"]}},
        {"_id": 0, "id": 1, "name": 1, "role": 1},
    ).to_list(500)

    rows: list[dict] = []
    summary = {"red": 0, "amber": 0, "green": 0}
    total_expiring_60d = 0
    total_expired = 0

    for u in users:
        view = await build_staff_profile_view(db, u["id"], sector)
        if not view:
            continue
        # Aggregate expiring + expired counts
        for tab in view["tabs"]:
            for folder in tab["folders"]:
                total_expiring_60d += folder["status"].get("expiring_count", 0)
                total_expired += folder["status"].get("expired_count", 0)
        rows.append({
            "staff_id": u["id"],
            "name": u.get("name"),
            "role": u.get("role"),
            "role_label": view["profile"]["role_label"],
            "is_agency": view["profile"]["is_agency"],
            "overall_status": view["overall_status"],
            "missing_count": len(view["missing_required"]),
            "top_missing": view["missing_required"][:3],
            "last_reviewed_at": view["profile"]["last_reviewed_at"],
        })
        summary[view["overall_status"]] = summary.get(view["overall_status"], 0) + 1

    # Rank rows by severity (red first, then amber, then by missing_count)
    rank = {"red": 0, "amber": 1, "green": 2}
    rows.sort(key=lambda r: (rank.get(r["overall_status"], 9), -r["missing_count"]))

    return {
        "generated_at": _now().isoformat(),
        "sector": sector,
        "total_staff": len(rows),
        "summary": summary,
        "total_expired": total_expired,
        "total_expiring_60d": total_expiring_60d,
        "rows": rows,
        "explainable_note": (
            "Deterministic personnel-file compliance. Each staff RAG is computed "
            "from required folders + document expiry + review windows. Same data in → "
            "same RAG out. Use as supportive intelligence for Reg 44/Ofsted/CQC readiness."
        ),
    }
