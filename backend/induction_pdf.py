"""Phase E.3.1 — Staff Induction Completion Certificate PDF."""
from __future__ import annotations

import io
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)
from reportlab.platypus.flowables import HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT


def build_induction_certificate_pdf(assignment: dict, org_name: str = "Care Home") -> bytes:
    """Returns PDF bytes for a completed/signed-off induction assignment."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title="Staff Induction Completion Certificate",
        author=org_name,
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "h1", parent=styles["Heading1"],
        textColor=HexColor("#0E3B4A"), alignment=TA_CENTER,
        fontSize=24, leading=28, spaceAfter=4,
    )
    sub = ParagraphStyle(
        "sub", parent=styles["Normal"],
        textColor=HexColor("#5d6068"), alignment=TA_CENTER,
        fontSize=10, leading=14, spaceAfter=14,
    )
    label = ParagraphStyle(
        "label", parent=styles["Normal"],
        textColor=HexColor("#5d6068"),
        fontSize=8, leading=10, spaceAfter=2,
        fontName="Helvetica-Bold",
    )
    value = ParagraphStyle(
        "value", parent=styles["Normal"],
        textColor=HexColor("#0F1115"),
        fontSize=12, leading=15, spaceAfter=8,
    )
    body = ParagraphStyle(
        "body", parent=styles["Normal"],
        textColor=HexColor("#0F1115"),
        fontSize=10, leading=14, spaceAfter=8,
    )
    decl = ParagraphStyle(
        "decl", parent=styles["Normal"],
        textColor=HexColor("#0F1115"),
        fontSize=11, leading=16, spaceAfter=8,
        leftIndent=8, rightIndent=8,
        fontName="Helvetica-Oblique",
    )
    item_lbl = ParagraphStyle(
        "item_lbl", parent=styles["Normal"],
        textColor=HexColor("#0F1115"),
        fontSize=9, leading=12,
    )

    story = []

    # === Header ===
    story.append(Paragraph(org_name.upper(), sub))
    story.append(Paragraph("Staff Induction Completion Certificate", h1))
    story.append(Paragraph("Issued under the home's Induction Policy", sub))
    story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#0E3B4A"), spaceAfter=14))

    # === Staff details ===
    target_completion = assignment.get("target_completion") or "—"
    sector_label = "Adult Services" if assignment.get("sector") == "adult" else "Children's Services"
    rows = [
        [Paragraph("STAFF NAME", label), Paragraph(assignment.get("staff_name") or "—", value)],
        [Paragraph("JOB ROLE", label), Paragraph((assignment.get("staff_role") or "—").title(), value)],
        [Paragraph("HOME", label), Paragraph(org_name, value)],
        [Paragraph("SECTOR", label), Paragraph(sector_label, value)],
        [Paragraph("INDUCTION ASSIGNED", label), Paragraph((assignment.get("created_at") or "—")[:10], value)],
        [Paragraph("TARGET COMPLETION", label), Paragraph(target_completion, value)],
        [Paragraph("COMPLETED ON", label), Paragraph((assignment.get("signed_off_at") or "—")[:10], value)],
        [Paragraph("SIGNED OFF BY", label), Paragraph(assignment.get("signed_off_by_name") or "—", value)],
    ]
    t = Table(rows, colWidths=[45 * mm, 110 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, HexColor("#E7E5E0")),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    # === Declaration ===
    decl_text = assignment.get("signed_off_declaration") or (
        f"I confirm that {assignment.get('staff_name')} has completed all sections of the induction checklist "
        f"with appropriate evidence and is ready to operate on independent shifts."
    )
    story.append(Paragraph("MANAGER DECLARATION", label))
    story.append(Paragraph(f"&ldquo;{decl_text}&rdquo;", decl))
    story.append(Spacer(1, 14))

    # === Sections completed ===
    story.append(Paragraph("SECTIONS COMPLETED", label))
    section_rows = [["#", "Section", "Completed", "By"]]
    for idx, item in enumerate(assignment.get("items", []), start=1):
        section_rows.append([
            str(idx).zfill(2),
            item.get("title") or item.get("key"),
            (item.get("completed_at") or "—")[:10],
            item.get("completed_by_name") or "—",
        ])
    sect_table = Table(section_rows, colWidths=[12 * mm, 80 * mm, 30 * mm, 40 * mm])
    sect_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#F1EFEC")),
        ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#5d6068")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, HexColor("#E7E5E0")),
    ]))
    story.append(sect_table)
    story.append(Spacer(1, 18))

    # === Signature block ===
    sig_rows = [
        [Paragraph("MANAGER", label), Paragraph(assignment.get("signed_off_by_name") or "—", value)],
        [Paragraph("DATE", label), Paragraph((assignment.get("signed_off_at") or "—")[:10], value)],
    ]
    sig_t = Table(sig_rows, colWidths=[45 * mm, 110 * mm])
    sig_t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(sig_t)

    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#E7E5E0")))
    story.append(Paragraph(
        f"Certificate generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · "
        f"Assignment ID {assignment.get('id', '—')[:8]}",
        ParagraphStyle("foot", parent=styles["Normal"], fontSize=7,
                        textColor=HexColor("#9CA0A8"), alignment=TA_CENTER),
    ))

    doc.build(story)
    return buf.getvalue()
