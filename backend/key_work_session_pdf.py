"""Safelyn Systems · Key Work Session PDF.

Clean A4 PDF for a therapeutic key-work session record.
"""
from __future__ import annotations

import io
import hashlib
from datetime import datetime
from typing import Optional, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)


BRAND_DEEP = colors.HexColor("#0F2A47")
BRAND_TEAL = colors.HexColor("#1E4D5C")
ACCENT = colors.HexColor("#5a3d8c")
INK = colors.HexColor("#1C1C1A")
INK_2 = colors.HexColor("#575752")
INK_3 = colors.HexColor("#8A8A85")
LINE = colors.HexColor("#D6D6D0")
SAFE = colors.HexColor("#3A5A40")


def _hash(payload: dict) -> str:
    src = "|".join(str(v) for v in [
        payload.get("id"), payload.get("completed_at") or payload.get("planned_for"),
        payload.get("facilitator_name"), payload.get("topic_label"),
    ])
    return hashlib.sha256(src.encode("utf-8")).hexdigest()[:12].upper()


def _short_ref(rid: str) -> str:
    return f"#{str(rid or '').replace('-', '').upper()[-8:]}"


def _format_uk(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return dt.strftime("%a, %d %b %Y · %H:%M")
    except Exception:
        return str(iso)


def _styles():
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold",
                             fontSize=20, leading=24, textColor=INK, spaceAfter=2),
        "subtitle": ParagraphStyle("subtitle", parent=base["Normal"], fontName="Helvetica",
                                   fontSize=9, textColor=INK_2, leading=12, spaceAfter=10),
        "section": ParagraphStyle("section", parent=base["Heading3"], fontName="Helvetica-Bold",
                                  fontSize=10, leading=12, textColor=BRAND_TEAL,
                                  spaceAfter=4, spaceBefore=10),
        "label": ParagraphStyle("label", parent=base["Normal"], fontName="Helvetica-Bold",
                                fontSize=8, textColor=INK_3, leading=10),
        "value": ParagraphStyle("value", parent=base["Normal"], fontName="Helvetica",
                                fontSize=10, textColor=INK, leading=14),
        "body": ParagraphStyle("body", parent=base["Normal"], fontName="Helvetica",
                               fontSize=10, textColor=INK, leading=14, spaceAfter=6),
        "muted": ParagraphStyle("muted", parent=base["Normal"], fontName="Helvetica",
                                fontSize=8, textColor=INK_3, leading=11),
        "voice": ParagraphStyle("voice", parent=base["Normal"], fontName="Helvetica-Oblique",
                                fontSize=10, textColor=INK, leading=14, leftIndent=8,
                                borderColor=ACCENT, borderWidth=0, borderPadding=4),
    }


def _draw_header_footer(canvas, doc, *, ref, generated_at, audit_hash):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(BRAND_DEEP)
    canvas.rect(0, height - 22 * mm, width, 22 * mm, stroke=0, fill=1)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, height - 24 * mm, width, 2 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(18 * mm, height - 9 * mm, "Safelyn Systems · KEY WORK SESSION")
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#C9C0DD"))
    canvas.drawString(18 * mm, height - 13 * mm, "THERAPEUTIC PRACTICE · CONFIDENTIAL")
    canvas.setFillColor(colors.white)
    canvas.setFont("Courier", 8)
    canvas.drawRightString(width - 18 * mm, height - 13 * mm, ref)

    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(INK_3)
    canvas.drawString(18 * mm, 12 * mm, f"Generated · {generated_at}")
    canvas.setFont("Courier", 7)
    canvas.drawString(18 * mm, 8 * mm, f"Audit hash: {audit_hash}")
    canvas.drawCentredString(width / 2.0, 12 * mm, ref)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(width - 60 * mm, 12 * mm, f"Page {doc.page}")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 16 * mm, width - 18 * mm, 16 * mm)
    canvas.restoreState()


def _kv(rows):
    s = _styles()
    data = [[Paragraph(label.upper(), s["label"]), Paragraph(value or "—", s["value"])] for label, value in rows]
    t = Table(data, colWidths=[50 * mm, 124 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8F7F2")),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def build_key_work_session_pdf(
    *,
    session: dict,
    resident: dict,
    framework_lookup: Optional[dict] = None,
    pack_lookup: Optional[dict] = None,
    prompt_lookup: Optional[dict] = None,
) -> io.BytesIO:
    framework_lookup = framework_lookup or {}
    pack_lookup = pack_lookup or {}
    prompt_lookup = prompt_lookup or {}

    buf = io.BytesIO()
    s = _styles()
    ref = _short_ref(session.get("id"))
    generated_at = datetime.utcnow().strftime("%a, %d %b %Y · %H:%M UTC")
    audit_hash = _hash(session)

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=32 * mm, bottomMargin=22 * mm,
        title=f"Key Work Session · {resident.get('name','Resident')} · {ref}",
        author="Safelyn Systems",
        subject="Therapeutic Practice",
    )
    story = []

    title = (session.get("topic_label") or "Key work session").strip()
    story.append(Paragraph(
        f"<b>{title}</b> &nbsp;&nbsp;<font color='#8A8A85' size='12'>{ref}</font>",
        s["h1"],
    ))
    status = (session.get("status") or "completed").upper()
    story.append(Paragraph(
        f"Status: <b>{status}</b>"
        f" · Planned: <b>{_format_uk(session.get('planned_for'))}</b>"
        f" · Completed: <b>{_format_uk(session.get('completed_at'))}</b>",
        s["subtitle"],
    ))

    story.append(_kv([
        ("Young person", resident.get("name")),
        ("Date of birth", resident.get("dob")),
        ("Facilitator", session.get("facilitator_name")),
        ("Planner", session.get("planner_name")),
        ("Review date", session.get("review_date")),
        ("Mood (before / after)",
         f"{session.get('mood_before') or '—'} / {session.get('mood_after') or '—'}"),
    ]))

    # Frameworks applied
    fw_ids = session.get("frameworks_applied") or []
    if fw_ids:
        story.append(Paragraph("FRAMEWORKS APPLIED", s["section"]))
        names = [framework_lookup.get(fid, {}).get("name") or fid for fid in fw_ids]
        story.append(Paragraph(" · ".join(names), s["body"]))

    # Resource packs used
    rp_ids = session.get("resource_pack_ids") or []
    if rp_ids:
        story.append(Paragraph("RESOURCE PACKS USED", s["section"]))
        names = [pack_lookup.get(rid, {}).get("title") or rid for rid in rp_ids]
        story.append(Paragraph(" · ".join(names), s["body"]))

    # Plan
    if session.get("plan"):
        story.append(Paragraph("SESSION PLAN", s["section"]))
        story.append(Paragraph(session["plan"], s["body"]))

    # Goals
    goals = session.get("goals") or []
    if goals:
        story.append(Paragraph("GOALS", s["section"]))
        for g in goals:
            sym = {"met": "✓", "progress": "→", "open": "○", "unmet": "✗"}.get(g.get("status") or "open", "○")
            story.append(Paragraph(f"<b>{sym}</b> {g.get('text','—')} <font color='#8A8A85'>({(g.get('status') or 'open').title()})</font>", s["body"]))

    # Discussion
    if session.get("discussion"):
        story.append(Paragraph("WHAT WAS DISCUSSED", s["section"]))
        story.append(Paragraph(session["discussion"].replace("\n", "<br/>"), s["body"]))

    # YP voice
    if session.get("young_person_voice"):
        story.append(Paragraph("YOUNG PERSON'S VOICE", s["section"]))
        story.append(Paragraph(f"&ldquo;{session['young_person_voice']}&rdquo;", s["voice"]))

    # Staff reflection
    if session.get("staff_reflection"):
        story.append(Paragraph("STAFF REFLECTION", s["section"]))
        story.append(Paragraph(session["staff_reflection"].replace("\n", "<br/>"), s["body"]))

    # Outcomes
    if session.get("outcomes"):
        story.append(Paragraph("OUTCOMES", s["section"]))
        story.append(Paragraph(session["outcomes"].replace("\n", "<br/>"), s["body"]))

    # Follow-up actions
    actions = session.get("follow_up_actions") or []
    if actions:
        story.append(Paragraph("FOLLOW-UP ACTIONS", s["section"]))
        for a in actions:
            line = f"• {a.get('text','—')} — <b>{a.get('owner_name') or 'TBA'}</b>"
            if a.get("due_date"):
                line += f" · due {a['due_date']}"
            story.append(Paragraph(line, s["body"]))

    # Prompt responses
    pr = session.get("prompt_responses") or {}
    if pr:
        story.append(Paragraph("GUIDED PROMPT RESPONSES", s["section"]))
        for pid, response in pr.items():
            ptext = (prompt_lookup.get(pid) or {}).get("text") or pid
            story.append(Paragraph(f"<b>{ptext}</b>", s["label"]))
            story.append(Paragraph(str(response), s["body"]))

    # Manager sign-off
    if session.get("signed_off_by_name"):
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph("MANAGER SIGN-OFF", s["section"]))
        story.append(_kv([
            ("Signed off by", session.get("signed_off_by_name")),
            ("Signed off at", _format_uk(session.get("signed_off_at"))),
            ("Manager comments", session.get("manager_comments")),
        ]))

    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(
        "<i>This record supports professional judgement — it does not replace it. "
        "Therapeutic interventions should be planned alongside specialist clinicians where appropriate.</i>",
        s["muted"],
    ))

    doc.build(
        story,
        onFirstPage=lambda c, d: _draw_header_footer(c, d, ref=ref, generated_at=generated_at, audit_hash=audit_hash),
        onLaterPages=lambda c, d: _draw_header_footer(c, d, ref=ref, generated_at=generated_at, audit_hash=audit_hash),
    )
    buf.seek(0)
    return buf
