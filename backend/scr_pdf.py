"""Single Central Record PDF — Phase F.2.

Inspection-ready A4 landscape PDF. One row per staff. RAG-coloured cells.
Built to feel like a leadership compliance dashboard, NOT a spreadsheet dump.
"""
from __future__ import annotations

import io
import hashlib
from datetime import datetime
from typing import Any, Dict

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)


BRAND_DEEP = colors.HexColor("#0F2A47")
BRAND_TEAL = colors.HexColor("#1E4D5C")
GOLD = colors.HexColor("#B8772F")
INK = colors.HexColor("#1C1C1A")
INK_2 = colors.HexColor("#575752")
INK_3 = colors.HexColor("#8A8A85")
LINE = colors.HexColor("#D6D6D0")
RED = colors.HexColor("#A8273A")
RED_BG = colors.HexColor("#FBE3E7")
AMBER = colors.HexColor("#B8772F")
AMBER_BG = colors.HexColor("#FCEFD4")
GREEN = colors.HexColor("#2F6A3A")
GREEN_BG = colors.HexColor("#E7F3EC")
GREY = colors.HexColor("#5d6068")
GREY_BG = colors.HexColor("#F1EFEC")


TONE_BG = {
    "red":   RED_BG,
    "amber": AMBER_BG,
    "green": GREEN_BG,
    "grey":  GREY_BG,
}
TONE_FG = {
    "red":   RED,
    "amber": AMBER,
    "green": GREEN,
    "grey":  GREY,
}


def _hash(payload: dict) -> str:
    src = f"{payload.get('generated_at', '')}|{payload.get('home_name', '')}|{len(payload.get('rows', []))}"
    return hashlib.sha256(src.encode("utf-8")).hexdigest()[:12].upper()


def _styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle(name="SCRH1", parent=s["Heading1"], textColor=BRAND_DEEP,
                         fontName="Helvetica-Bold", fontSize=18, leading=22, spaceAfter=2))
    s.add(ParagraphStyle(name="SCRMeta", parent=s["BodyText"], textColor=INK_2,
                         fontName="Helvetica", fontSize=9, leading=11))
    s.add(ParagraphStyle(name="SCRMetaB", parent=s["BodyText"], textColor=BRAND_DEEP,
                         fontName="Helvetica-Bold", fontSize=9, leading=11))
    s.add(ParagraphStyle(name="SCRHead", parent=s["BodyText"], textColor=colors.white,
                         fontName="Helvetica-Bold", fontSize=7.5, leading=9, alignment=1))
    s.add(ParagraphStyle(name="SCRCell", parent=s["BodyText"], textColor=INK,
                         fontName="Helvetica", fontSize=7.5, leading=9))
    s.add(ParagraphStyle(name="SCRCellB", parent=s["BodyText"], textColor=INK,
                         fontName="Helvetica-Bold", fontSize=7.5, leading=9))
    s.add(ParagraphStyle(name="SCRSmall", parent=s["BodyText"], textColor=INK_3,
                         fontName="Helvetica", fontSize=7, leading=8))
    return s


def _p(text: str, style) -> Paragraph:
    return Paragraph(text or "—", style)


def build_scr_pdf(payload: Dict[str, Any]) -> bytes:
    """Render the SCR PDF.

    payload = {
      generated_at, generated_by, home_name, sector,
      filters: { non_compliant_only, role, employment_type, status },
      kpis: {...}, summary: {...},
      rows: [scr_row]
    }
    """
    s = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=10 * mm, bottomMargin=14 * mm,
        title="Single Central Record",
    )
    story: list = []

    rows = payload.get("rows") or []
    kpis = payload.get("kpis") or {}
    summary = payload.get("summary") or {}
    filters = payload.get("filters") or {}

    # ---- Header band ----
    home_name = payload.get("home_name") or "Safelyn Systems"
    sector = (payload.get("sector") or "children").title()
    story.append(Paragraph(f"Single Central Record · {sector}'s Services", s["SCRH1"]))
    story.append(Spacer(1, 1.5 * mm))

    header_meta = (
        f"<b>{home_name}</b> · "
        f"Generated {datetime.fromisoformat(payload['generated_at'].replace('Z', '+00:00')).strftime('%d %b %Y · %H:%M')} · "
        f"By {payload.get('generated_by') or 'System'}"
    )
    story.append(Paragraph(header_meta, s["SCRMeta"]))

    # Inspection-ready badge band
    badge_tbl = Table([[
        Paragraph("INSPECTION READY", ParagraphStyle(
            "Badge", parent=s["SCRMetaB"], textColor=colors.white,
            fontSize=8, leading=10, alignment=1,
        )),
        Paragraph(
            f"<b>{summary.get('green', 0)}</b> compliant · "
            f"<b>{summary.get('amber', 0)}</b> action soon · "
            f"<b>{summary.get('red', 0)}</b> action required · "
            f"<b>{kpis.get('expiring_dbs_60d', 0)}</b> DBS expiring · "
            f"<b>{kpis.get('overdue_supervisions', 0)}</b> overdue supervisions · "
            f"<b>{kpis.get('missing_references', 0)}</b> missing references · "
            f"<b>{kpis.get('expired_training', 0)}</b> expired training",
            ParagraphStyle("BadgeMeta", parent=s["SCRMeta"], textColor=colors.white,
                           fontSize=8, leading=10),
        ),
    ]], colWidths=[36 * mm, None])
    badge_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), GOLD),
        ("BACKGROUND", (1, 0), (1, 0), BRAND_DEEP),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(Spacer(1, 2 * mm))
    story.append(badge_tbl)
    story.append(Spacer(1, 3 * mm))

    if filters.get("non_compliant_only") or filters.get("role") or filters.get("employment_type"):
        bits = []
        if filters.get("non_compliant_only"):
            bits.append("non-compliant only")
        if filters.get("role"):
            bits.append(f"role={filters['role']}")
        if filters.get("employment_type"):
            bits.append(f"employment={filters['employment_type']}")
        story.append(Paragraph(
            f"<i>Filtered view: {' · '.join(bits)}</i>",
            s["SCRSmall"],
        ))
        story.append(Spacer(1, 2 * mm))

    if not rows:
        story.append(Paragraph(
            "<i>No staff match the current filters.</i>", s["SCRMeta"],
        ))
        doc.build(story, onFirstPage=_footer(payload), onLaterPages=_footer(payload))
        return buf.getvalue()

    # ---- The SCR table ----
    head = [
        "Staff", "Role / Employment", "Start", "DBS", "DBS no. / Issue / Expiry",
        "Barred list", "RTW", "ID", "References", "Quals", "Training", "Supervision",
        "Appraisal", "Probation", "RAG",
    ]
    header_row = [Paragraph(h, s["SCRHead"]) for h in head]

    table_data = [header_row]
    cell_styles: list[tuple[int, int, str]] = []  # (col, row, tone)

    for i, r in enumerate(rows, start=1):
        # Build row cells
        name_cell = Paragraph(
            f"<b>{r.get('name') or '—'}</b><br/>"
            f"<font size=6 color='#8A8A85'>{r.get('staff_id', '')[:8]}</font>",
            s["SCRCell"],
        )
        role_cell = Paragraph(
            f"{r.get('role_label') or '—'}<br/>"
            f"<font size=6 color='#8A8A85'>{r.get('employment_type', '')}"
            f"{(' · ' + r.get('agency_name')) if r.get('agency_name') else ''}</font>",
            s["SCRCell"],
        )
        start_cell = Paragraph(r.get("start_date") or "—", s["SCRCell"])

        # DBS combined info
        dbs_cell = Paragraph(r["dbs"]["text"], s["SCRCell"])
        dbs_info = Paragraph(
            f"{r['dbs'].get('certificate_no') or '—'}<br/>"
            f"<font size=6 color='#8A8A85'>Iss: {r['dbs'].get('issued_date') or '—'}</font><br/>"
            f"<font size=6 color='#8A8A85'>Exp: {r['dbs'].get('expiry_date') or '—'}</font>",
            s["SCRCell"],
        )

        barred_cell = Paragraph(r["barred_list"]["text"], s["SCRCell"])
        rtw_cell = Paragraph(r["right_to_work"]["text"], s["SCRCell"])
        id_cell = Paragraph(r["id_verified"]["text"], s["SCRCell"])
        refs_cell = Paragraph(r["references"]["text"], s["SCRCell"])
        quals_cell = Paragraph(r["qualifications"]["text"], s["SCRCell"])
        training_cell = Paragraph(r["mandatory_training"]["text"], s["SCRCell"])
        sup_cell = Paragraph(r["last_supervision"]["text"], s["SCRCell"])
        app_cell = Paragraph(r["last_appraisal"]["text"], s["SCRCell"])
        prob_cell = Paragraph(r["probation"]["text"], s["SCRCell"])
        rag_cell = Paragraph(
            {
                "red":   "<b><font color='#A8273A'>ACTION</font></b>",
                "amber": "<b><font color='#B8772F'>SOON</font></b>",
                "green": "<b><font color='#2F6A3A'>OK</font></b>",
            }.get(r["overall_status"], "—"),
            s["SCRCell"],
        )

        table_data.append([
            name_cell, role_cell, start_cell, dbs_cell, dbs_info,
            barred_cell, rtw_cell, id_cell, refs_cell, quals_cell,
            training_cell, sup_cell, app_cell, prob_cell, rag_cell,
        ])

        # Track tone per cell for shading
        cell_styles.append((3, i, r["dbs"]["status"]))
        cell_styles.append((5, i, r["barred_list"]["status"]))
        cell_styles.append((6, i, r["right_to_work"]["status"]))
        cell_styles.append((7, i, r["id_verified"]["status"]))
        cell_styles.append((8, i, r["references"]["status"]))
        cell_styles.append((9, i, r["qualifications"]["status"]))
        cell_styles.append((10, i, r["mandatory_training"]["status"]))
        cell_styles.append((11, i, r["last_supervision"]["status"]))
        cell_styles.append((12, i, r["last_appraisal"]["status"]))
        cell_styles.append((13, i, r["probation"]["status"]))
        cell_styles.append((14, i, r["overall_status"]))

    # Column widths sum ≈ 277mm (A4 landscape minus margins ≈ 277mm)
    col_widths = [
        22 * mm, 26 * mm, 14 * mm, 20 * mm, 26 * mm,  # name/role/start/dbs/dbsno
        14 * mm, 14 * mm, 14 * mm, 16 * mm, 14 * mm,  # barred/rtw/id/refs/quals
        18 * mm, 18 * mm, 18 * mm, 16 * mm, 12 * mm,  # training/sup/app/prob/rag
    ]

    style_cmds = [
        # Header band
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_DEEP),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("ALIGN",      (0, 0), (-1, 0), "CENTER"),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        # Body
        ("FONTNAME",   (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",   (0, 1), (-1, -1), 7.5),
        ("LEADING",    (0, 1), (-1, -1), 9),
        # Grid
        ("LINEBELOW",  (0, 0), (-1, -1), 0.3, LINE),
        ("BOX",        (0, 0), (-1, -1), 0.4, INK_3),
        ("INNERGRID",  (0, 0), (-1, 0), 0.2, colors.white),  # nicer header lines
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    # Apply RAG tints
    for col, row_i, tone in cell_styles:
        bg = TONE_BG.get(tone)
        if bg:
            style_cmds.append(("BACKGROUND", (col, row_i), (col, row_i), bg))
    # Stripe alternating rows (subtle)
    for row_i in range(1, len(rows) + 1):
        if row_i % 2 == 0:
            style_cmds.append((
                "BACKGROUND", (0, row_i), (2, row_i), colors.HexColor("#F7F7F4"),
            ))

    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle(style_cmds))
    story.append(tbl)

    # Audit hash footer
    story.append(Spacer(1, 4 * mm))
    audit = _hash(payload)
    story.append(Paragraph(
        f"<font color='#8A8A85'>Audit hash: <b>{audit}</b> · "
        f"Use this hash to verify document integrity in inspection submissions.</font>",
        s["SCRSmall"],
    ))

    doc.build(story, onFirstPage=_footer(payload), onLaterPages=_footer(payload))
    return buf.getvalue()


def _footer(payload):
    fallback_home = "Children's Services"
    def _draw(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(INK_3)
        home_str = payload.get("home_name") or fallback_home
        by_str = payload.get("generated_by") or "System"
        canvas.drawString(
            10 * mm, 7 * mm,
            f"Safelyn Systems · Single Central Record · {home_str} · Generated by {by_str}",
        )
        canvas.drawRightString(
            doc.pagesize[0] - 10 * mm, 7 * mm,
            f"Page {doc.page}",
        )
        canvas.restoreState()
    return _draw
