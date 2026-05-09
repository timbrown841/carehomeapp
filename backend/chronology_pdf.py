"""Safelyn Systems · Chronology PDF builder.

Inspection-ready chronology export. Supports filtered scopes
(safeguarding-only / missing-only / incident-only / custom date range).
"""
from __future__ import annotations

import io
import hashlib
from datetime import datetime
from typing import Optional, List, Dict, Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)


BRAND_DEEP = colors.HexColor("#0F2A47")
BRAND_TEAL = colors.HexColor("#1E4D5C")
GOLD = colors.HexColor("#B8772F")
INK = colors.HexColor("#1C1C1A")
INK_2 = colors.HexColor("#575752")
INK_3 = colors.HexColor("#8A8A85")
LINE = colors.HexColor("#D6D6D0")
RED = colors.HexColor("#A8273A")
AMBER = colors.HexColor("#D27D2D")
GREEN = colors.HexColor("#2F6A3A")


def _hash(payload: dict) -> str:
    src = f"{payload.get('generated_at', '')}|{payload.get('resident_name', '')}|{len(payload.get('events', []))}"
    return hashlib.sha256(src.encode("utf-8")).hexdigest()[:12].upper()


def _fmt_dt(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return d.strftime("%a %d %b %Y · %H:%M")
    except Exception:
        return iso


def _fmt_date(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return d.strftime("%d %b %Y")
    except Exception:
        return iso


def _styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle(name="H1", parent=s["Heading1"], textColor=BRAND_DEEP,
                         fontName="Helvetica-Bold", fontSize=18, leading=22, spaceAfter=4))
    s.add(ParagraphStyle(name="H2", parent=s["Heading2"], textColor=BRAND_TEAL,
                         fontName="Helvetica-Bold", fontSize=12, leading=15, spaceBefore=10, spaceAfter=4))
    s.add(ParagraphStyle(name="Body", parent=s["BodyText"], textColor=INK,
                         fontName="Helvetica", fontSize=9, leading=12))
    s.add(ParagraphStyle(name="Small", parent=s["BodyText"], textColor=INK_2,
                         fontName="Helvetica", fontSize=8, leading=10))
    return s


def build_chronology_pdf(payload: Dict[str, Any]) -> bytes:
    """Render a chronology PDF.

    payload = {
      generated_at, generated_by, resident_name, resident_dob, resident_id,
      scope_label, filter_summary,
      events: [{at, category, category_label, severity, title, summary, actor_name, tags, metadata}]
      patterns: [{title, message, severity, count}],
      counts_by_category: {cat: n},
    }
    """
    s = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
        title="Resident Chronology",
    )
    story: list = []
    events = payload.get("events") or []
    patterns = payload.get("patterns") or []

    # Header
    story.append(Paragraph("Resident Chronology", s["H1"]))
    story.append(Paragraph(
        f"<b>{payload.get('resident_name') or '—'}</b>" +
        (f" · DOB {_fmt_date(payload.get('resident_dob'))}" if payload.get("resident_dob") else "") +
        (f" · Service: {payload.get('service_type') or '—'}" if payload.get("service_type") else ""),
        s["Body"],
    ))
    story.append(Paragraph(
        f"Scope: {payload.get('scope_label') or 'Full chronology'}" +
        (f" · {payload.get('filter_summary')}" if payload.get('filter_summary') else "") +
        f" · Generated {_fmt_dt(payload.get('generated_at'))} by {payload.get('generated_by') or '—'}",
        s["Small"],
    ))
    story.append(Spacer(1, 8))

    # Counts strip
    counts = payload.get("counts_by_category") or {}
    if counts:
        items = sorted(counts.items(), key=lambda kv: -kv[1])
        chips = " · ".join(f"<b>{n}</b> {k.replace('_', ' ')}" for k, n in items[:8])
        story.append(Paragraph(f"<font color='#1C5C8C'>{chips}</font>", s["Small"]))
        story.append(Spacer(1, 6))

    # Patterns banner
    if patterns:
        story.append(Paragraph("Patterns detected", s["H2"]))
        rows = [["Severity", "Pattern", "Detail"]]
        for p in patterns:
            sev = (p.get("severity") or "").upper()
            sev_col = RED if sev == "HIGH" else AMBER if sev == "MEDIUM" else INK_3
            rows.append([
                Paragraph(f"<font color='{sev_col.hexval()}'><b>{sev}</b></font>", s["Small"]),
                Paragraph(p.get("title") or "", s["Body"]),
                Paragraph(p.get("message") or "", s["Small"]),
            ])
        t = Table(rows, colWidths=[20 * mm, 50 * mm, 110 * mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_DEEP),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9F7F2")]),
            ("GRID", (0, 0), (-1, -1), 0.25, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)
        story.append(Spacer(1, 10))

    # Events
    story.append(Paragraph(f"Events ({len(events)})", s["H2"]))
    if not events:
        story.append(Paragraph("No events match the selected scope.", s["Small"]))
    else:
        rows = [["When", "Type", "Title / Summary", "Recorded by"]]
        for e in events:
            cat = (e.get("category_label") or e.get("category") or "").title()
            sev = (e.get("severity") or "").lower()
            sev_col = RED if sev == "high" else AMBER if sev == "medium" else INK_3
            cat_col_hex = e.get("category_colour") or "#5d6068"
            title_html = (
                f"<b><font color='{cat_col_hex}'>{(e.get('title') or '').replace('&', '&amp;')}</font></b>"
                f"<br/><font size=7 color='#575752'>{(e.get('summary') or '').replace('&', '&amp;')}</font>"
            )
            rows.append([
                Paragraph(_fmt_dt(e.get("at")), s["Small"]),
                Paragraph(f"<b><font color='{cat_col_hex}'>{cat}</font></b><br/>"
                          f"<font color='{sev_col.hexval()}' size=7>{sev.upper()}</font>", s["Small"]),
                Paragraph(title_html, s["Small"]),
                Paragraph(e.get("actor_name") or "—", s["Small"]),
            ])
        t = Table(rows, colWidths=[35 * mm, 28 * mm, 92 * mm, 25 * mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_DEEP),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9F7F2")]),
            ("GRID", (0, 0), (-1, -1), 0.25, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)

    # Footer
    h = _hash(payload)
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        f"<font color='#8A8A85'>Audit hash: {h} · Safelyn Systems · "
        f"This chronology is auto-built from the resident record. "
        f"For inspection / strategy / serious incident review.</font>",
        s["Small"],
    ))

    doc.build(story)
    return buf.getvalue()
