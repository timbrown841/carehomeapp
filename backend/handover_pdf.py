"""Manager Handover Digest PDF — A4 portrait, single-page executive summary."""
from __future__ import annotations

import io
import hashlib
from datetime import datetime
from typing import Any, Dict

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
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
AMBER = colors.HexColor("#B8772F")
GREEN = colors.HexColor("#2F6A3A")
RED_BG = colors.HexColor("#FBE3E7")
AMBER_BG = colors.HexColor("#FCEFD4")
GREEN_BG = colors.HexColor("#E7F3EC")


def _hash(payload: dict) -> str:
    src = (
        f"{payload.get('generated_at', '')}|{payload.get('period', '')}|"
        f"{payload.get('generated_by', '')}"
    )
    return hashlib.sha256(src.encode("utf-8")).hexdigest()[:12].upper()


def _fmt(iso):
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return d.strftime("%a %d %b · %H:%M")
    except Exception:
        return str(iso)


def _styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle(name="DH1", parent=s["Heading1"], textColor=BRAND_DEEP,
                         fontName="Helvetica-Bold", fontSize=18, leading=22, spaceAfter=2))
    s.add(ParagraphStyle(name="DSection", parent=s["Heading2"], textColor=BRAND_DEEP,
                         fontName="Helvetica-Bold", fontSize=10.5, leading=13,
                         spaceBefore=4, spaceAfter=2))
    s.add(ParagraphStyle(name="DBody", parent=s["BodyText"], textColor=INK,
                         fontName="Helvetica", fontSize=8.5, leading=11))
    s.add(ParagraphStyle(name="DSmall", parent=s["BodyText"], textColor=INK_2,
                         fontName="Helvetica", fontSize=7.5, leading=9))
    s.add(ParagraphStyle(name="DKpi", parent=s["BodyText"], textColor=BRAND_DEEP,
                         fontName="Helvetica-Bold", fontSize=14, leading=16, alignment=1))
    s.add(ParagraphStyle(name="DKpiLabel", parent=s["BodyText"], textColor=INK_3,
                         fontName="Helvetica-Bold", fontSize=6.5, leading=8, alignment=1))
    return s


def _kpi_grid(rows: list[list[tuple[str, str, colors.Color]]], style):
    """rows: list of rows of (value, label, color) tuples. Returns a Table."""
    table_rows = []
    for r in rows:
        cells = []
        for value, label, colour in r:
            cell = Table(
                [[Paragraph(str(value), ParagraphStyle(
                    "v", fontName="Helvetica-Bold", fontSize=15, leading=17,
                    textColor=colour, alignment=1,
                ))],
                 [Paragraph(label.upper(), style["DKpiLabel"])]],
                colWidths=[None], rowHeights=[18, 9],
            )
            cell.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]))
            cells.append(cell)
        table_rows.append(cells)

    n = max(len(r) for r in table_rows)
    table = Table(table_rows, colWidths=[(190 / n) * mm] * n)
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.3, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAFAF7")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


def _bullet_list(items, style, prefix="• ", colour=INK):
    if not items:
        return Paragraph(
            "<i><font color='#8A8A85'>None in this period.</font></i>", style["DSmall"],
        )
    return Paragraph(
        "<br/>".join(f"<font color='{colour.hexval()}'>{prefix}</font>"
                     f"{('<b>' + i['resident_name'] + '</b> — ') if isinstance(i, dict) and i.get('resident_name') else ''}"
                     f"{i if isinstance(i, str) else (i.get('summary') or i.get('top_risk') or i.get('status_label') or '')}"
                     for i in items[:6]),
        style["DBody"],
    )


def _spotlight_block(label: str, item: dict | None, tone: colors.Color, style):
    if not item:
        return Paragraph(
            f"<b>{label}</b><br/><font color='#8A8A85'>None flagged this period.</font>",
            style["DBody"],
        )
    return Paragraph(
        f"<b><font color='{tone.hexval()}'>{label}</font></b><br/>"
        f"<b>{item.get('resident_name', '—')}</b><br/>"
        f"<font color='#575752' size=7>{item.get('why', '')}</font><br/>"
        f"<font color='#1C1C1A' size=7>Action: <i>{item.get('recommended_action', '—')}</i></font>",
        style["DBody"],
    )


def _action_block(actions: list[dict], style, tone: colors.Color = INK):
    if not actions:
        return Paragraph(
            "<i><font color='#8A8A85'>None.</font></i>", style["DSmall"],
        )
    rows = []
    for a in actions[:8]:
        title = a.get("title", "—")
        cat = a.get("category", "")
        rows.append(
            f"<font color='{tone.hexval()}'>•</font> <b>{title}</b> "
            f"<font color='#8A8A85'>· {cat}</font>"
        )
    return Paragraph("<br/>".join(rows), style["DBody"])


def build_handover_pdf(payload: Dict[str, Any]) -> bytes:
    s = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=10 * mm, bottomMargin=12 * mm,
        title="Manager Handover Digest",
    )
    story: list = []

    p = payload
    sg = p["safeguarding"]; miss = p["missing"]; inc = p["incidents"]
    placement = p["placement_stability"]; staffing = p["staffing"]
    compliance = p["compliance"]; spotlight = p["child_spotlight"]
    actions = p["manager_actions"]; home_int = p["home_intelligence"]

    # ---- Header band ----
    story.append(Paragraph(f"Manager Handover Digest · {p['period_label']}", s["DH1"]))
    story.append(Paragraph(
        f"<font color='#575752'>{_fmt(p['period_start'])} → {_fmt(p['period_end'])} · "
        f"Generated by <b>{p['generated_by']}</b> at {_fmt(p['generated_at'])}</font>",
        s["DSmall"],
    ))
    story.append(Spacer(1, 3 * mm))

    # ---- KPI grids ----
    kpi_safeguard = [
        (sg["new_count"], "new safeguard.", RED if sg["new_count"] else INK_3),
        (sg["open_count"], "open", AMBER if sg["open_count"] else INK_3),
        (sg["closed_count"], "closed", GREEN if sg["closed_count"] else INK_3),
        (sg["escalated_count"], "escalated", RED if sg["escalated_count"] else INK_3),
        (sg["reg40_count"], "reg 40", RED if sg["reg40_count"] else INK_3),
        (miss["episodes_count"], "missing eps.", AMBER if miss["episodes_count"] else INK_3),
        (miss["outstanding_interviews"], "RI outstanding", RED if miss["outstanding_interviews"] else INK_3),
        (miss["repeat_count"], "repeat children", RED if miss["repeat_count"] else INK_3),
    ]
    kpi_ops = [
        (inc["physical_count"], "physical", AMBER if inc["physical_count"] else INK_3),
        (inc["high_risk_count"], "high-risk", RED if inc["high_risk_count"] else INK_3),
        (inc["police_count"], "police", RED if inc["police_count"] else INK_3),
        (placement["improving_count"], "improving", GREEN if placement["improving_count"] else INK_3),
        (placement["deteriorating_count"], "deteriorating", RED if placement["deteriorating_count"] else INK_3),
        (compliance["overdue_supervisions"], "sup. overdue", RED if compliance["overdue_supervisions"] else INK_3),
        (compliance["expiring_dbs"], "dbs expiring", AMBER if compliance["expiring_dbs"] else INK_3),
        (staffing["burnout_alert_count"], "burnout alerts", AMBER if staffing["burnout_alert_count"] else INK_3),
    ]
    # Split into two rows of 4
    story.append(_kpi_grid([kpi_safeguard[:4], kpi_safeguard[4:]], s))
    story.append(Spacer(1, 1.5 * mm))
    story.append(_kpi_grid([kpi_ops[:4], kpi_ops[4:]], s))
    story.append(Spacer(1, 4 * mm))

    # ---- Manager actions required (most important) ----
    story.append(Paragraph(
        "<font color='#A8273A'>What do I need to do?</font> · Manager actions",
        s["DSection"],
    ))
    action_tbl = Table([[
        Paragraph("<b><font color='#A8273A'>Urgent</font></b><br/>" +
                  ("<br/>".join(f"• {a['title']}" for a in actions["urgent"][:5])
                   or "<font color='#8A8A85'><i>None</i></font>"),
                  s["DBody"]),
        Paragraph("<b><font color='#B8772F'>Overdue</font></b><br/>" +
                  ("<br/>".join(f"• {a['title']}" for a in actions["overdue"][:5])
                   or "<font color='#8A8A85'><i>None</i></font>"),
                  s["DBody"]),
        Paragraph("<b><font color='#0F2A47'>Due today</font></b><br/>" +
                  ("<br/>".join(f"• {a['title']}" for a in actions["due_today"][:5])
                   or "<font color='#8A8A85'><i>None</i></font>"),
                  s["DBody"]),
    ]], colWidths=[63 * mm, 63 * mm, 63 * mm])
    action_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.3, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
        ("BACKGROUND", (0, 0), (0, 0), RED_BG),
        ("BACKGROUND", (1, 0), (1, 0), AMBER_BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(action_tbl)
    story.append(Spacer(1, 4 * mm))

    # ---- Child spotlight ----
    story.append(Paragraph("Child spotlight", s["DSection"]))
    spot_tbl = Table([[
        _spotlight_block("Most improved", spotlight.get("most_improved"), GREEN, s),
        _spotlight_block("Highest concern", spotlight.get("highest_concern"), RED, s),
        _spotlight_block("Review required", spotlight.get("review_required"), AMBER, s),
    ]], colWidths=[63 * mm, 63 * mm, 63 * mm])
    spot_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.3, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(spot_tbl)
    story.append(Spacer(1, 4 * mm))

    # ---- Home intelligence ----
    story.append(Paragraph("Home intelligence · Cross-module pattern alerts", s["DSection"]))
    alerts_str = "<br/>".join(f"• {a}" for a in home_int["alerts"]) or \
                  "<font color='#8A8A85'><i>No alerts this period.</i></font>"
    recs_str = "<br/>".join(f"→ {r}" for r in home_int["recommendations"]) or ""
    positives_str = "<br/>".join(f"✓ {p}" for p in home_int["positives"]) or ""

    home_tbl = Table([[
        Paragraph(f"<b><font color='#A8273A'>Alerts</font></b><br/>{alerts_str}", s["DBody"]),
        Paragraph(
            f"<b><font color='#0F2A47'>Recommendations</font></b><br/>{recs_str}"
            + (f"<br/><br/><b><font color='#2F6A3A'>Positives</font></b><br/>{positives_str}"
               if positives_str else ""),
            s["DBody"],
        ),
    ]], colWidths=[95 * mm, 95 * mm])
    home_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.3, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(home_tbl)

    # ---- Footer ----
    story.append(Spacer(1, 6 * mm))
    audit = _hash(payload)
    story.append(Paragraph(
        f"<font color='#8A8A85'>Audit hash: <b>{audit}</b> · "
        f"This digest is part of leadership oversight evidence and is audit-logged.</font>",
        s["DSmall"],
    ))

    doc.build(story)
    return buf.getvalue()
