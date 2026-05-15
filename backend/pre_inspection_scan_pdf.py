"""Pre-Inspection Readiness Scan — single-page-style PDF.

Renders the deterministic inspection simulation as a manager-ready scan that
fits into the bag for an Ofsted or Reg 44 visit.

Sections:
  1. Header — predicted rating, overall score, generated_at
  2. Module summary chips (green / amber / red counts)
  3. Quality Standards judgement table
  4. Likely strengths (max 6)
  5. Likely weaknesses (max 6)
  6. Likely inspection concerns + the probe questions (max 6)
  7. Safeguarding exposure (max 6)
  8. Prioritised recommendations (max 6)
"""
from __future__ import annotations
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)


BRAND_DEEP = colors.HexColor("#0F2A47")
INK = colors.HexColor("#1C1C1A")
INK_2 = colors.HexColor("#575752")
LINE = colors.HexColor("#D6D6D0")
GREEN = colors.HexColor("#2F6A3A")
AMBER = colors.HexColor("#B8772F")
RED = colors.HexColor("#A8273A")


def _tone(rag):
    return {"green": GREEN, "amber": AMBER, "red": RED}.get(rag, INK_2)


def build_pre_inspection_scan_pdf(sim: dict, home_name: str = "Safelyn Children's Home") -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
        title="Pre-Inspection Readiness Scan",
    )

    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=BRAND_DEEP)
    h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=BRAND_DEEP, spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=12, textColor=INK)
    small = ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=10, textColor=INK_2)
    bullet = ParagraphStyle("bullet", fontName="Helvetica", fontSize=9, leading=12, textColor=INK, leftIndent=10, bulletIndent=0)

    story = []

    pred = sim.get("predicted_rating", {})
    overall = sim.get("overall_score", 0)
    summary = sim.get("module_summary", {})

    # ===== Header =====
    story.append(Paragraph("Pre-Inspection Readiness Scan", h1))
    story.append(Paragraph(
        f"{home_name} · generated {datetime.fromisoformat(sim['generated_at']).strftime('%d %b %Y · %H:%M')} UTC",
        small,
    ))
    story.append(Spacer(1, 6))

    # Banner with predicted rating
    pred_tone = _tone(pred.get("tone", "amber"))
    banner = Table(
        [[
            Paragraph(f"<b><font color='white' size='22'>{overall}%</font></b>", body),
            Paragraph(
                f"<b><font color='white' size='13'>Predicted: {pred.get('label', 'Good')}</font></b><br/>"
                f"<font color='#E8E0D5' size='9'>{summary.get('green', 0)} green · {summary.get('amber', 0)} amber · {summary.get('red', 0)} red across {summary.get('total', 0)} modules</font>",
                body,
            ),
        ]],
        colWidths=[32 * mm, 145 * mm],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), pred_tone),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    story.append(banner)

    # ===== Quality Standards judgement =====
    story.append(Paragraph("Quality standards · predicted judgement", h2))
    qs_rows = [["QS", "Standard", "Score", "Likely judgement"]]
    for q in sim.get("quality_standards_judgement", []):
        qs_rows.append([q["key"], q["title"], f"{q['score']}%", q["judgement"]])
    qs_table = Table(qs_rows, colWidths=[12 * mm, 90 * mm, 18 * mm, 57 * mm])
    qs_table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_DEEP),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(qs_table)

    # ===== Likely strengths =====
    story.append(Paragraph("Likely strengths", h2))
    strengths = sim.get("likely_strengths", [])[:6]
    if strengths:
        for s in strengths:
            story.append(Paragraph(
                f"<b>{s['title']}</b> — <font color='#575752'>{s.get('evidence', '')}</font>",
                bullet, bulletText="•"))
    else:
        story.append(Paragraph("No clear strengths yet — focus on building green RAG modules.", body))

    # ===== Likely weaknesses =====
    story.append(Paragraph("Likely weaknesses", h2))
    weaknesses = sim.get("likely_weaknesses", [])[:6]
    if weaknesses:
        for w in weaknesses:
            refs = ", ".join((w.get("regulation_refs") or [])[:2])
            qs = " · ".join(w.get("quality_standards") or [])
            story.append(Paragraph(
                f"<b>{w['title']}</b> — <font color='#575752'>{w.get('evidence', '')}</font><br/>"
                f"<font size='8' color='#8A8A85'>{refs}{' · ' + qs if qs else ''}</font>",
                bullet, bulletText="•"))
    else:
        story.append(Paragraph("No red or amber modules — strong baseline.", body))

    # ===== Likely inspection concerns =====
    story.append(Paragraph("Likely inspection concerns &amp; the questions you'll be asked", h2))
    concerns = sim.get("likely_inspection_concerns", [])[:6]
    if concerns:
        for c in concerns:
            sev = c.get("severity", "medium").upper()
            tone = _tone("red" if c.get("severity") == "high" else "amber")
            hex_color = "#" + tone.hexval()[2:]
            story.append(Paragraph(
                f"<b><font color='{hex_color}'>[{sev}]</font> {c['title']}</b><br/>"
                f"<font size='8' color='#575752'><i>Inspector probe: {c.get('probe', '')}</i></font><br/>"
                f"<font size='8' color='#8A8A85'>Evidence: {c.get('evidence', '')}</font>",
                bullet, bulletText="•"))
            story.append(Spacer(1, 2))
    else:
        story.append(Paragraph("No active inspection concerns detected.", body))

    # ===== Safeguarding exposure =====
    sg_exp = sim.get("safeguarding_exposure", [])[:6]
    if sg_exp:
        story.append(Paragraph("Safeguarding exposure", h2))
        for s in sg_exp:
            tone = _tone(s.get("rag", "amber"))
            hex_color = "#" + tone.hexval()[2:]
            story.append(Paragraph(
                f"<b><font color='{hex_color}'>{s['title']}</font></b> · {s['score']}% — "
                f"<font size='8' color='#575752'>{s.get('evidence', '')}</font>",
                bullet, bulletText="•"))

    # ===== Prioritised recommendations =====
    story.append(Paragraph("Prioritised recommendations", h2))
    recs = sim.get("recommendations", [])[:6]
    if recs:
        for r in recs:
            steps = "<br/>".join(f"&nbsp;&nbsp;– {s}" for s in (r.get("concrete_steps") or [])[:3])
            refs = ", ".join((r.get("regulation_refs") or [])[:2])
            refs_html = f"<br/><font size='7' color='#8A8A85'>{refs}</font>" if refs else ""
            story.append(Paragraph(
                f"<b>[{r['priority']}] {r['title']}</b><br/>"
                f"<font size='8' color='#575752'><i>{r.get('rationale', '')}</i></font><br/>"
                f"<font size='8' color='#1C1C1A'>{steps}</font>"
                f"{refs_html}",
                bullet, bulletText="•"))
            story.append(Spacer(1, 3))
    else:
        story.append(Paragraph("No critical recommendations — maintain current trajectory.", body))

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "<i>This scan is generated deterministically from live operational data — no AI inference. "
        "Every finding can be traced to a Regulation 44 module or operational dashboard.</i>",
        small,
    ))

    doc.build(story)
    return buf.getvalue()
