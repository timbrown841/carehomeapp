"""Safelyn Systems · Home Operations Compliance Snapshot PDF.

Inspection-ready PDF: per-check-type summary (last completed, next due,
overdue/upcoming counts) + recent activity log + open maintenance issues.
"""
from __future__ import annotations

import io
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional

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
URGENT_RED = colors.HexColor("#B23A48")
INK = colors.HexColor("#1C1C1A")
INK_2 = colors.HexColor("#575752")
INK_3 = colors.HexColor("#8A8A85")
LINE = colors.HexColor("#D6D6D0")
SAFE_GREEN = colors.HexColor("#3A5A40")
WARN_AMBER = colors.HexColor("#D4A373")
PAGE_BG = colors.HexColor("#F7F4EE")


def _hash(payload: dict) -> str:
    src = f"{payload.get('generated_at', '')}|{payload.get('generated_by', '')}|{len(payload.get('rows', []))}"
    return hashlib.sha256(src.encode("utf-8")).hexdigest()[:12].upper()


def _fmt(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        if "T" in iso:
            d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return d.strftime("%d %b %Y %H:%M")
        d = datetime.fromisoformat(iso)
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


def build_compliance_snapshot_pdf(payload: Dict[str, Any]) -> bytes:
    """Build a compliance-snapshot PDF.

    Payload shape:
      {
        generated_at, generated_by,
        rows: [{ name, group, frequency_days, last_done, next_due,
                 days_until_due, status }],   # status: 'overdue' | 'due_soon' | 'ok' | 'never'
        recent_logs: [{ at, type_name, performed_by, status, summary }],
        open_issues: [{ title, severity, status, reported_at, reported_by }],
      }
    """
    s = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
        title="Home Operations Compliance Snapshot",
    )
    story: list = []

    # Header
    story.append(Paragraph("Home Operations Compliance Snapshot", s["H1"]))
    story.append(Paragraph(
        f"Generated {_fmt(payload.get('generated_at'))} by {payload.get('generated_by') or '—'}",
        s["Small"],
    ))
    story.append(Spacer(1, 8))

    rows = payload.get("rows") or []
    overdue = sum(1 for r in rows if r.get("status") == "overdue")
    due_soon = sum(1 for r in rows if r.get("status") == "due_soon")
    ok = sum(1 for r in rows if r.get("status") == "ok")
    never = sum(1 for r in rows if r.get("status") == "never")

    # Headline strip
    strip_data = [[
        Paragraph(f"<b>{overdue}</b><br/><font size=7 color='#575752'>OVERDUE</font>", s["Body"]),
        Paragraph(f"<b>{due_soon}</b><br/><font size=7 color='#575752'>DUE SOON</font>", s["Body"]),
        Paragraph(f"<b>{ok}</b><br/><font size=7 color='#575752'>UP TO DATE</font>", s["Body"]),
        Paragraph(f"<b>{never}</b><br/><font size=7 color='#575752'>NEVER LOGGED</font>", s["Body"]),
    ]]
    strip = Table(strip_data, colWidths=[42 * mm] * 4)
    strip.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), URGENT_RED if overdue else PAGE_BG),
        ("BACKGROUND", (1, 0), (1, 0), WARN_AMBER if due_soon else PAGE_BG),
        ("BACKGROUND", (2, 0), (2, 0), SAFE_GREEN if ok else PAGE_BG),
        ("BACKGROUND", (3, 0), (3, 0), INK_3 if never else PAGE_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0),
         colors.white if overdue or due_soon or ok or never else INK),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(strip)
    story.append(Spacer(1, 12))

    # Per-check status table
    story.append(Paragraph("Compliance status by check type", s["H2"]))
    table_data = [["Check", "Group", "Cadence", "Last done", "Next due", "Status"]]
    for r in rows:
        st = (r.get("status") or "").upper()
        st_col = (
            URGENT_RED if r.get("status") == "overdue"
            else WARN_AMBER if r.get("status") == "due_soon"
            else SAFE_GREEN if r.get("status") == "ok"
            else INK_3
        )
        table_data.append([
            Paragraph(r.get("name") or "", s["Body"]),
            Paragraph(r.get("group") or "", s["Small"]),
            f"every {r.get('frequency_days')}d",
            _fmt(r.get("last_done")),
            _fmt(r.get("next_due")),
            Paragraph(f"<font color='{st_col.hexval()}'><b>{st}</b></font>", s["Small"]),
        ])
    t = Table(table_data, colWidths=[42 * mm, 36 * mm, 22 * mm, 30 * mm, 30 * mm, 22 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_DEEP),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9F7F2")]),
        ("GRID", (0, 0), (-1, -1), 0.25, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 14))

    # Recent activity
    recent = payload.get("recent_logs") or []
    if recent:
        story.append(Paragraph(f"Recent activity (last {len(recent)})", s["H2"]))
        rec_data = [["When", "Check", "Performed by", "Result", "Notes"]]
        for r in recent[:25]:
            rec_data.append([
                _fmt(r.get("at")),
                Paragraph(r.get("type_name") or "", s["Small"]),
                Paragraph(r.get("performed_by") or "", s["Small"]),
                (r.get("status") or "").upper(),
                Paragraph(r.get("summary") or "", s["Small"]),
            ])
        rt = Table(rec_data, colWidths=[26 * mm, 38 * mm, 30 * mm, 20 * mm, 68 * mm], repeatRows=1)
        rt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9F7F2")]),
            ("GRID", (0, 0), (-1, -1), 0.25, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(rt)
        story.append(Spacer(1, 12))

    # Open maintenance issues
    issues = payload.get("open_issues") or []
    if issues:
        story.append(Paragraph(f"Open maintenance issues ({len(issues)})", s["H2"]))
        idata = [["Reported", "Title", "Severity", "Status", "Reported by"]]
        for i in issues[:25]:
            idata.append([
                _fmt(i.get("reported_at")),
                Paragraph(i.get("title") or "", s["Body"]),
                (i.get("severity") or "").upper(),
                (i.get("status") or "").upper(),
                i.get("reported_by") or "",
            ])
        it = Table(idata, colWidths=[28 * mm, 70 * mm, 22 * mm, 30 * mm, 32 * mm], repeatRows=1)
        it.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), GOLD),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9F7F2")]),
            ("GRID", (0, 0), (-1, -1), 0.25, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(it)

    # Audit hash footer
    h = _hash(payload)
    story.append(Spacer(1, 14))
    story.append(Paragraph(
        f"<font color='#8A8A85'>Audit hash: {h} · Safelyn Systems · "
        f"This document is a point-in-time snapshot for inspection purposes.</font>",
        s["Small"],
    ))

    doc.build(story)
    return buf.getvalue()
