"""Safelyn Systems · Rapid Response Pack PDF builder.

Generates a police-ready missing-from-care PDF for a resident, designed to be
shared with police, social workers and managers under pressure. Mirrors the
Safelyn brand language used in pdf_builder.py.
"""
from __future__ import annotations

import io
import os
import hashlib
from datetime import datetime
from typing import Optional, List

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
)


BRAND_DEEP = colors.HexColor("#0F2A47")
BRAND_TEAL = colors.HexColor("#1E4D5C")
ACCENT_TERRACOTTA = colors.HexColor("#E57A5D")
URGENT_RED = colors.HexColor("#B23A48")
WARN_AMBER = colors.HexColor("#D4A373")
SAFE_GREEN = colors.HexColor("#3A5A40")
INK = colors.HexColor("#1C1C1A")
INK_2 = colors.HexColor("#575752")
INK_3 = colors.HexColor("#8A8A85")
LINE = colors.HexColor("#D6D6D0")


def _short_ref(rid: str) -> str:
    cleaned = str(rid or "").replace("-", "").upper()
    return f"#{cleaned[-8:]}" if cleaned else "—"


def _audit_hash(episode: dict) -> str:
    src = "|".join(
        [
            str(episode.get("id", "")),
            str(episode.get("reported_at", "")),
            str(episode.get("resident_id", "")),
            str(episode.get("reported_by_name", "")),
        ]
    )
    return hashlib.sha256(src.encode("utf-8")).hexdigest()[:12].upper()


def _qr_image(url: str) -> ImageReader:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=4, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0F2A47", back_color="white")
    bio = io.BytesIO()
    img.save(bio, format="PNG")
    bio.seek(0)
    return ImageReader(bio)


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
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=22, leading=26, textColor=INK, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=base["Normal"], fontName="Helvetica",
            fontSize=9, textColor=INK_2, leading=12, spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "section", parent=base["Heading3"], fontName="Helvetica-Bold",
            fontSize=10, leading=12, textColor=BRAND_TEAL,
            spaceAfter=4, spaceBefore=10,
        ),
        "label": ParagraphStyle(
            "label", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8, textColor=INK_3, leading=10,
        ),
        "value": ParagraphStyle(
            "value", parent=base["Normal"], fontName="Helvetica",
            fontSize=10, textColor=INK, leading=14,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Helvetica",
            fontSize=10, textColor=INK, leading=14, alignment=TA_LEFT, spaceAfter=6,
        ),
        "muted": ParagraphStyle(
            "muted", parent=base["Normal"], fontName="Helvetica",
            fontSize=8, textColor=INK_3, leading=11,
        ),
        "ref_mono": ParagraphStyle(
            "ref_mono", parent=base["Normal"], fontName="Courier-Bold",
            fontSize=10, textColor=BRAND_TEAL,
        ),
    }


def _draw_header_footer(canvas, doc, *, ref, generated_at, qr_url=None, audit_hash=None):
    canvas.saveState()
    width, height = A4

    # Red urgency band on top
    canvas.setFillColor(URGENT_RED)
    canvas.rect(0, height - 22 * mm, width, 22 * mm, stroke=0, fill=1)
    canvas.setFillColor(BRAND_DEEP)
    canvas.rect(0, height - 24 * mm, width, 2 * mm, stroke=0, fill=1)

    # Wordmark
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(18 * mm, height - 9 * mm, "Safelyn Systems · RAPID RESPONSE PACK")
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#FFE3D9"))
    canvas.drawString(18 * mm, height - 13 * mm, "MISSING FROM CARE · PHILOMENA PROTOCOL · POLICE-READY")

    # Ref top right
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawRightString(width - 18 * mm, height - 9 * mm, "MISSING REPORT")
    canvas.setFont("Courier", 8)
    canvas.setFillColor(colors.HexColor("#FFE3D9"))
    canvas.drawRightString(width - 18 * mm, height - 13 * mm, ref)

    # QR
    if qr_url:
        try:
            qr_img = _qr_image(qr_url)
            qr_size = 18 * mm
            canvas.drawImage(
                qr_img, width - 18 * mm - qr_size, 18 * mm,
                qr_size, qr_size, preserveAspectRatio=True, mask="auto",
            )
            canvas.setFont("Helvetica", 6)
            canvas.setFillColor(INK_3)
            canvas.drawCentredString(width - 18 * mm - qr_size / 2.0, 15.5 * mm, "Scan to verify")
        except Exception:
            pass

    # Footer
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(INK_3)
    canvas.drawString(18 * mm, 12 * mm, f"Generated by Safelyn Systems · {generated_at}")
    canvas.setFont("Courier", 7)
    if audit_hash:
        canvas.drawString(18 * mm, 8 * mm, f"Audit hash: {audit_hash}")
    canvas.setFont("Helvetica", 7.5)
    canvas.drawCentredString(width / 2.0, 12 * mm, ref)
    canvas.drawString(width - 60 * mm, 12 * mm, f"Page {doc.page}")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 16 * mm, width - 18 * mm, 16 * mm)
    canvas.restoreState()


def _kv_table(rows, col_widths=None):
    s = _styles()
    data = []
    for label, value in rows:
        data.append([
            Paragraph(label.upper(), s["label"]),
            Paragraph(value or "—", s["value"]),
        ])
    t = Table(data, colWidths=col_widths or [50 * mm, 124 * mm])
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


def _bullet_list(items):
    s = _styles()
    if not items:
        return Paragraph("—", s["muted"])
    return Paragraph(
        "<br/>".join(f"• {str(i)}" for i in items),
        s["body"],
    )


def build_missing_pack_pdf(
    *,
    episode: dict,
    resident: dict,
    incidents: List[dict],
    generated_for: str,
    photo_path: Optional[str] = None,
) -> io.BytesIO:
    """Build a police-ready missing-from-care PDF."""
    buf = io.BytesIO()
    ref = _short_ref(episode.get("id", ""))
    generated_at = datetime.utcnow().strftime("%a, %d %b %Y · %H:%M UTC")
    audit_hash = _audit_hash(episode)
    public_url = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
    qr_url = (
        f"{public_url}/missing/share/{episode.get('share_token')}"
        if public_url and episode.get("share_token")
        else None
    )

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=32 * mm, bottomMargin=22 * mm,
        title=f"Missing From Care · {resident.get('name','Resident')} · {ref}",
        author="Safelyn Systems",
        subject="Missing-from-Care Rapid Response Pack",
    )
    s = _styles()
    story = []

    name = resident.get("name", "—")
    preferred = resident.get("preferred_name") or name

    # Title
    story.append(Paragraph(
        f"<b>Missing From Care</b> &nbsp;&nbsp;<font color='#8A8A85' size='12'>{ref}</font>",
        s["h1"],
    ))
    story.append(Paragraph(
        f"Reported missing: <b>{_format_uk(episode.get('reported_at'))}</b>"
        + (
            f"  ·  Police notified: <b>{_format_uk(episode.get('police_notified_at'))}</b>"
            if episode.get("police_notified_at") else ""
        )
        + (
            f"  ·  Returned: <b>{_format_uk(episode.get('returned_at'))}</b>"
            if episode.get("returned_at") else "  ·  <b><font color='#B23A48'>STILL MISSING</font></b>"
        ),
        s["subtitle"],
    ))

    # Banner: identification — with photo (if available)
    risk = (resident.get("risk_level") or "medium").lower()
    risk_color = {"high": URGENT_RED, "medium": WARN_AMBER, "low": SAFE_GREEN}.get(risk, INK_3)

    photo_cell = Paragraph("<i>No photo<br/>on file</i>", s["muted"])
    if photo_path and os.path.exists(photo_path):
        try:
            from reportlab.platypus import Image as RLImage
            img = RLImage(photo_path, width=28 * mm, height=34 * mm, kind="proportional")
            img.hAlign = "CENTER"
            photo_cell = img
        except Exception:
            pass

    head_inner = Table([
        [
            Paragraph("YOUNG PERSON", s["label"]),
            Paragraph("DOB", s["label"]),
            Paragraph("RISK LEVEL", s["label"]),
            Paragraph("PLACEMENT", s["label"]),
        ],
        [
            Paragraph(f"<b>{name}</b>", s["value"]),
            Paragraph(resident.get("dob") or "—", s["value"]),
            Paragraph(f"<b>{risk.upper()}</b>", s["value"]),
            Paragraph(resident.get("local_authority") or resident.get("placement_summary") or "—", s["value"]),
        ],
        [
            Paragraph(f"Preferred name: {preferred}", s["muted"]),
            Paragraph(f"Gender: {resident.get('gender') or '—'}", s["muted"]),
            Paragraph("&nbsp;", s["muted"]),
            Paragraph(f"Placed: {resident.get('placement_date') or '—'}", s["muted"]),
        ],
    ], colWidths=[40 * mm, 28 * mm, 28 * mm, 42 * mm])
    head_inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8F7F2")),
        ("BACKGROUND", (2, 1), (2, 1), risk_color),
        ("TEXTCOLOR", (2, 1), (2, 1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    head = Table(
        [[photo_cell, head_inner]],
        colWidths=[34 * mm, 140 * mm],
    )
    head.setStyle(TableStyle([
        ("BOX", (0, 0), (0, 0), 0.5, LINE),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#F8F7F2")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(head)
    story.append(Spacer(1, 5 * mm))

    # Physical description
    story.append(Paragraph("PHYSICAL DESCRIPTION", s["section"]))
    story.append(_kv_table([
        ("Height", resident.get("height")),
        ("Build", resident.get("build")),
        ("Hair", resident.get("hair")),
        ("Eyes", resident.get("eyes")),
        ("Distinguishing marks", resident.get("distinguishing_marks")),
        ("Clothing last seen in", episode.get("clothing_last_seen") or resident.get("usual_clothing")),
    ]))

    # Episode-specific
    story.append(Paragraph("MISSING EPISODE DETAIL", s["section"]))
    story.append(_kv_table([
        ("Last seen", episode.get("last_seen_location")),
        ("Last seen at", _format_uk(episode.get("last_seen_at"))),
        ("Direction of travel", episode.get("direction_of_travel")),
        ("Mobile phone / contact", episode.get("contact_phone") or resident.get("phone")),
        ("Police reference", episode.get("police_reference")),
        ("Reporting officer", episode.get("reported_by_name")),
    ]))

    # Known places & associates
    story.append(Paragraph("KNOWN PLACES / ADDRESSES", s["section"]))
    story.append(_bullet_list(resident.get("known_locations") or []))
    story.append(Paragraph("FRIENDS / ASSOCIATES", s["section"]))
    story.append(_bullet_list(resident.get("known_associates") or []))
    story.append(Paragraph("FAMILY CONTACTS", s["section"]))
    story.append(_bullet_list(resident.get("family_contacts") or []))

    # Triggers and behaviours
    story.append(Paragraph("TRIGGERS & BEHAVIOUR PATTERNS", s["section"]))
    story.append(_bullet_list(resident.get("missing_triggers") or []))

    # Risk summary
    story.append(Paragraph("RISK ASSESSMENT SUMMARY", s["section"]))
    risk_lines = []
    risks = resident.get("risks") or {}
    if isinstance(risks, dict):
        for k, v in risks.items():
            if v and str(v).lower() != "none":
                risk_lines.append(f"<b>{k.replace('_',' ').title()}:</b> {v}")
    if resident.get("risk_management"):
        risk_lines.append(f"<b>Management:</b> {resident.get('risk_management')}")
    if resident.get("protective_factors"):
        story.append(_bullet_list([resident.get("protective_factors")] if isinstance(resident.get("protective_factors"), str) else resident.get("protective_factors")))
    if not risk_lines:
        risk_lines = ["No documented risks captured. Treat as moderate risk by default."]
    story.append(Paragraph("<br/>".join(risk_lines), s["body"]))

    # Medical alerts
    story.append(Paragraph("MEDICAL INFORMATION (CRITICAL)", s["section"]))
    med = resident.get("medical") or {}
    story.append(_kv_table([
        ("NHS number", med.get("nhs_number")),
        ("GP", med.get("gp")),
        ("Allergies", med.get("allergies")),
        ("Diagnoses", med.get("diagnoses")),
        ("Current medication", med.get("current_medication")),
        ("Emergency medical notes", med.get("emergency_notes")),
    ]))

    # Emergency contacts
    story.append(Paragraph("EMERGENCY CONTACTS", s["section"]))
    ec = resident.get("emergency_contacts") or []
    if ec:
        rows = [[
            Paragraph("NAME", s["label"]),
            Paragraph("RELATIONSHIP", s["label"]),
            Paragraph("PHONE", s["label"]),
        ]]
        for c in ec:
            rows.append([
                Paragraph(c.get("name") or "—", s["value"]),
                Paragraph(c.get("relation") or "—", s["value"]),
                Paragraph(c.get("phone") or "—", s["value"]),
            ])
        ect = Table(rows, colWidths=[60 * mm, 50 * mm, 64 * mm])
        ect.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8F7F2")),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(ect)
    else:
        story.append(Paragraph("—", s["muted"]))

    # Recent incidents
    if incidents:
        story.append(Paragraph(f"RECENT INCIDENTS · LAST {len(incidents)}", s["section"]))
        rows = [[
            Paragraph("WHEN", s["label"]),
            Paragraph("TYPE / SEVERITY", s["label"]),
            Paragraph("SUMMARY", s["label"]),
        ]]
        for inc in incidents[:6]:
            kind = (inc.get("incident_type") or inc.get("category") or "—").upper()
            sev = (inc.get("severity") or "").upper()
            tag = f"{kind} · {sev}"
            if inc.get("safeguarding"):
                tag += " · SG"
            short = (inc.get("body") or "")[:160]
            if len(inc.get("body") or "") > 160:
                short += "…"
            rows.append([
                Paragraph(_format_uk(inc.get("created_at")), s["muted"]),
                Paragraph(tag, s["muted"]),
                Paragraph(short, s["muted"]),
            ])
        t = Table(rows, colWidths=[34 * mm, 42 * mm, 98 * mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8F7F2")),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(t)

    # Episode timeline
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("EPISODE TIMELINE", s["section"]))
    timeline_rows = [
        ("Reported missing", _format_uk(episode.get("reported_at"))),
        ("Police notified", _format_uk(episode.get("police_notified_at"))),
        ("Returned", _format_uk(episode.get("returned_at"))),
    ]
    story.append(_kv_table(timeline_rows))

    # Audit footer
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        f"<i>Immutable Rapid Response Pack generated by Safelyn Systems for {generated_for}. "
        f"Reference {ref}. Episode opened {_format_uk(episode.get('reported_at'))} by "
        f"{episode.get('reported_by_name','—')}.</i>",
        s["muted"],
    ))

    doc.build(
        story,
        onFirstPage=lambda c, d: _draw_header_footer(c, d, ref=ref, generated_at=generated_at, qr_url=qr_url, audit_hash=audit_hash),
        onLaterPages=lambda c, d: _draw_header_footer(c, d, ref=ref, generated_at=generated_at, qr_url=qr_url, audit_hash=audit_hash),
    )
    buf.seek(0)
    return buf
