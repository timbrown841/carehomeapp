"""Safelyn Systems · Incident Report PDF builder.

Produces a clean, Ofsted-ready, signature-line-bearing PDF for a single
incident record. Designed to be used as evidence in inspections and legal
contexts — keep the layout austere, factual and audit-friendly.
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    PageBreak,
)


# Brand palette (mirrors frontend/index.css)
BRAND_DEEP = colors.HexColor("#0F2A47")
BRAND_TEAL = colors.HexColor("#1E4D5C")
BRAND_GREEN = colors.HexColor("#2D6A4F")
ACCENT_TERRACOTTA = colors.HexColor("#E57A5D")
URGENT_RED = colors.HexColor("#B23A48")
WARN_AMBER = colors.HexColor("#D4A373")
SAFE_GREEN = colors.HexColor("#3A5A40")
INK = colors.HexColor("#1C1C1A")
INK_2 = colors.HexColor("#575752")
INK_3 = colors.HexColor("#8A8A85")
LINE = colors.HexColor("#D6D6D0")
PAPER_BG = colors.HexColor("#F5F5F0")


def _record_ref(record_id: str) -> str:
    if not record_id:
        return "—"
    cleaned = str(record_id).replace("-", "").upper()
    return f"#{cleaned[-8:]}"


def _format_uk(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%a, %d %b %Y · %H:%M:%S")
    except Exception:
        return str(iso)


def _styles():
    base = getSampleStyleSheet()
    s = {
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=INK,
            spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            textColor=INK_2,
            leading=12,
            spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "section",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=BRAND_TEAL,
            spaceAfter=4,
            spaceBefore=10,
            letterSpacing=1.2,
        ),
        "label": ParagraphStyle(
            "label",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            textColor=INK_3,
            leading=10,
        ),
        "value": ParagraphStyle(
            "value",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            textColor=INK,
            leading=14,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            textColor=INK,
            leading=15,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "muted": ParagraphStyle(
            "muted",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=INK_3,
            leading=11,
        ),
        "ref_mono": ParagraphStyle(
            "ref_mono",
            parent=base["Normal"],
            fontName="Courier-Bold",
            fontSize=10,
            textColor=BRAND_TEAL,
        ),
        "badge": ParagraphStyle(
            "badge",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            textColor=colors.white,
            leading=10,
            alignment=1,
        ),
    }
    return s


def _draw_header_footer(canvas, doc, *, ref: str, generated_at: str):
    canvas.saveState()
    width, height = A4

    # Top brand band
    canvas.setFillColor(BRAND_DEEP)
    canvas.rect(0, height - 22 * mm, width, 22 * mm, stroke=0, fill=1)

    # Subtle accent strip
    canvas.setFillColor(ACCENT_TERRACOTTA)
    canvas.rect(0, height - 24 * mm, width, 2 * mm, stroke=0, fill=1)

    # Shield logo glyph (simple stylised shield)
    cx, cy = 18 * mm, height - 11 * mm
    canvas.setFillColor(colors.white)
    canvas.roundRect(cx - 6 * mm, cy - 6 * mm, 12 * mm, 12 * mm, 2 * mm, stroke=0, fill=1)
    canvas.setStrokeColor(BRAND_DEEP)
    canvas.setLineWidth(1.4)
    canvas.line(cx - 3 * mm, cy + 0.5 * mm, cx - 0.5 * mm, cy - 2.5 * mm)
    canvas.line(cx - 0.5 * mm, cy - 2.5 * mm, cx + 3.5 * mm, cy + 2.5 * mm)

    # Wordmark
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(28 * mm, height - 9 * mm, "Safelyn Systems")
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#9DB5C2"))
    canvas.drawString(28 * mm, height - 13 * mm, "CARE · SAFEGUARDING · COMPLIANCE")

    # Top-right meta
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawRightString(width - 18 * mm, height - 9 * mm, "INCIDENT REPORT")
    canvas.setFont("Courier", 8)
    canvas.setFillColor(colors.HexColor("#C8D4DC"))
    canvas.drawRightString(width - 18 * mm, height - 13 * mm, ref)

    # Footer
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(INK_3)
    canvas.drawString(
        18 * mm,
        12 * mm,
        f"Generated by Safelyn Systems · {generated_at}",
    )
    canvas.drawCentredString(width / 2.0, 12 * mm, ref)
    canvas.drawRightString(width - 18 * mm, 12 * mm, f"Page {doc.page}")

    # Footer hairline
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 16 * mm, width - 18 * mm, 16 * mm)

    canvas.restoreState()


def _badge_table(label: str, fill_color):
    t = Table(
        [[label.upper()]],
        colWidths=[36 * mm],
        rowHeights=[7 * mm],
    )
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), fill_color),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROUNDEDCORNERS", [3, 3, 3, 3]),
            ]
        )
    )
    return t


def _severity_color(sev: str):
    return {"high": URGENT_RED, "medium": WARN_AMBER, "low": SAFE_GREEN}.get(
        (sev or "").lower(), INK_3
    )


def build_incident_pdf(
    *,
    incident: dict,
    resident: Optional[dict],
    generated_for: str,
) -> io.BytesIO:
    """Build and return a BytesIO containing the rendered PDF."""
    buf = io.BytesIO()
    ref = _record_ref(incident.get("id", ""))
    generated_at = datetime.utcnow().strftime("%a, %d %b %Y · %H:%M UTC")

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=32 * mm,  # leave room for header band
        bottomMargin=22 * mm,
        title=f"Incident Report {ref}",
        author="Safelyn Systems",
        subject="Incident Report",
    )
    s = _styles()
    story = []

    # ----- Title block
    title = Paragraph(
        f"<b>Incident Report</b> &nbsp;&nbsp;<font color='#8A8A85' size='12'>{ref}</font>",
        s["h1"],
    )
    story.append(title)

    sev = (incident.get("severity") or "low").lower()
    safeguarding = bool(incident.get("safeguarding"))
    incident_type = (incident.get("incident_type") or incident.get("category") or "—").upper()

    sub_meta = (
        f"{incident_type}  ·  Severity {sev.upper()}"
        + ("  ·  <b><font color='#B23A48'>SAFEGUARDING FLAGGED</font></b>" if safeguarding else "")
    )
    story.append(Paragraph(sub_meta, s["subtitle"]))

    # ----- Top info table: Young person · Logged by · Reference
    res_name = (resident or {}).get("name", "—")
    res_room = (resident or {}).get("room") or "—"
    res_dob = (resident or {}).get("dob") or "—"

    info_data = [
        [
            Paragraph("YOUNG PERSON", s["label"]),
            Paragraph("LOGGED BY", s["label"]),
            Paragraph("REFERENCE", s["label"]),
        ],
        [
            Paragraph(f"<b>{res_name}</b>", s["value"]),
            Paragraph(f"<b>{incident.get('author_name', '—')}</b>", s["value"]),
            Paragraph(ref, s["ref_mono"]),
        ],
        [
            Paragraph(f"Room {res_room} · DOB {res_dob}", s["muted"]),
            Paragraph(_format_uk(incident.get("created_at")), s["muted"]),
            Paragraph(f"Status: {(incident.get('status') or 'open').upper()}", s["muted"]),
        ],
    ]
    info = Table(info_data, colWidths=[58 * mm, 58 * mm, 58 * mm])
    info.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8F7F2")),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(info)
    story.append(Spacer(1, 6 * mm))

    # ----- Severity strip
    sev_strip = Table(
        [
            [
                Paragraph("RISK LEVEL", s["label"]),
                Paragraph(f"<b>{sev.upper()}</b>", s["value"]),
                Paragraph("INCIDENT TYPE", s["label"]),
                Paragraph(f"<b>{incident_type}</b>", s["value"]),
                Paragraph("VOICE LOGGED", s["label"]),
                Paragraph(
                    "<b>Yes</b>" if incident.get("voice_used") else "No",
                    s["value"],
                ),
            ]
        ],
        colWidths=[24 * mm, 24 * mm, 28 * mm, 36 * mm, 26 * mm, 18 * mm],
    )
    sev_strip.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (1, 0), (1, 0), _severity_color(sev)),
                ("TEXTCOLOR", (1, 0), (1, 0), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(sev_strip)

    # ----- Tags
    tags = incident.get("tags") or []
    if tags:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph("TAGS", s["section"]))
        chip_row = [
            Paragraph(
                f"<font backColor='#EEEEE7' color='#1E4D5C'>&nbsp;{t}&nbsp;</font>",
                s["value"],
            )
            for t in tags
        ]
        story.append(Paragraph("&nbsp;&nbsp;".join(t for t in tags), s["body"]))

    # ----- Structured report
    story.append(Paragraph("STRUCTURED REPORT", s["section"]))
    structured = (
        incident.get("structured_report")
        or incident.get("body")
        or "No detail provided."
    )
    # Render preserving line breaks and double newlines as paragraphs
    for block in str(structured).split("\n\n"):
        block = block.strip()
        if not block:
            continue
        # Convert single newlines inside a block to <br/>
        story.append(Paragraph(block.replace("\n", "<br/>"), s["body"]))

    # ----- Action taken
    action = (incident.get("action_taken") or "").strip()
    if action:
        story.append(Paragraph("ACTION TAKEN", s["section"]))
        story.append(Paragraph(action.replace("\n", "<br/>"), s["body"]))

    # ----- Raw transcript (audit completeness)
    raw = (incident.get("raw_transcript") or "").strip()
    if raw and raw != (incident.get("structured_report") or ""):
        story.append(Paragraph("ORIGINAL VOICE TRANSCRIPT", s["section"]))
        story.append(
            Paragraph(
                f"<i>{raw.replace(chr(10), '<br/>')}</i>",
                s["body"],
            )
        )

    # ----- Signature block (kept together so it doesn't split across pages)
    story.append(Spacer(1, 10 * mm))
    sig_label = ParagraphStyle(
        "sig_label",
        parent=s["label"],
        textColor=INK_2,
        fontSize=8,
    )
    sig_table = Table(
        [
            [
                Paragraph("REPORTING STAFF", sig_label),
                "",
                Paragraph("REVIEWED BY (MANAGER)", sig_label),
            ],
            [
                Paragraph(
                    f"<b>{incident.get('author_name', '—')}</b>",
                    s["value"],
                ),
                "",
                Paragraph("&nbsp;", s["value"]),
            ],
            [
                Paragraph(
                    "Signature: ____________________________",
                    s["muted"],
                ),
                "",
                Paragraph(
                    "Signature: ____________________________",
                    s["muted"],
                ),
            ],
            [
                Paragraph("Date: __________________", s["muted"]),
                "",
                Paragraph("Date: __________________", s["muted"]),
            ],
        ],
        colWidths=[80 * mm, 14 * mm, 80 * mm],
    )
    sig_table.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 1), (0, 1), 0.5, INK_2),
                ("LINEBELOW", (2, 1), (2, 1), 0.5, INK_2),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    story.append(KeepTogether([Paragraph("VERIFICATION", s["section"]), sig_table]))

    # ----- Audit footer note
    story.append(Spacer(1, 8 * mm))
    audit_note = (
        f"<i>This document is an immutable audit record generated by Safelyn Systems "
        f"for {generated_for}. Reference {ref}. Original entry timestamped "
        f"{_format_uk(incident.get('created_at'))} by {incident.get('author_name', '—')}.</i>"
    )
    story.append(Paragraph(audit_note, s["muted"]))

    doc.build(
        story,
        onFirstPage=lambda c, d: _draw_header_footer(c, d, ref=ref, generated_at=generated_at),
        onLaterPages=lambda c, d: _draw_header_footer(c, d, ref=ref, generated_at=generated_at),
    )
    buf.seek(0)
    return buf
