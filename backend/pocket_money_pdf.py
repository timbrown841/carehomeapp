"""Safelyn Systems · Personal Allowance Monthly Statement PDF.

Multi-category finance ledger statement: opening / closing balances per category,
running total, money in / out for the month, and a chronological transaction
list with staff + young-person initials.
"""
from __future__ import annotations

import io
import hashlib
from datetime import datetime
from typing import List, Optional, Dict

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
)

BRAND_DEEP = colors.HexColor("#0e3b4a")
BRAND_INK = colors.HexColor("#0F1115")
INK_2 = colors.HexColor("#5d6068")
INK_3 = colors.HexColor("#8a8d95")
LINE = colors.HexColor("#E6E8EC")
SAFE = colors.HexColor("#2F6A3A")
URGENT = colors.HexColor("#A8273A")


def _fmt_money(amount: float, currency: str = "£") -> str:
    sign = "-" if amount < 0 else ""
    return f"{sign}{currency}{abs(float(amount)):,.2f}"


def build_statement_pdf(
    *,
    resident: dict,
    account: dict,
    transactions: List[dict],
    month_label: str,
    categories: Optional[List[dict]] = None,
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Personal Allowance Statement – {resident.get('name')} – {month_label}",
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=BRAND_INK, spaceAfter=2)
    eyebrow = ParagraphStyle("eyebrow", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=BRAND_DEEP, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontName="Helvetica", fontSize=10, leading=13, textColor=INK_2, spaceAfter=4)
    label = ParagraphStyle("label", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=7, leading=9, textColor=INK_3)
    big = ParagraphStyle("big", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12, leading=14, textColor=BRAND_INK)
    sectionH = ParagraphStyle("section", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=11, leading=13, textColor=BRAND_INK, spaceAfter=6, spaceBefore=8)
    cell = ParagraphStyle("cell", parent=styles["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=BRAND_INK)
    foot = ParagraphStyle("foot", parent=styles["Normal"], fontName="Helvetica", fontSize=7, leading=9, textColor=INK_3, alignment=TA_LEFT)

    cur_code = (account or {}).get("currency", "GBP")
    sym = "£" if cur_code == "GBP" else cur_code + " "

    cat_meta_by_id: Dict[str, dict] = {c["id"]: c for c in (categories or [])}
    cb_close = dict(account.get("category_balances") or {})

    # Money in / out + opening balance per category for the month
    in_total = 0.0
    out_total = 0.0
    deltas_by_cat: Dict[str, float] = {}
    for tx in transactions:
        d = float(tx.get("delta", 0.0))
        if d > 0:
            in_total += d
        else:
            out_total += -d
        cat = tx.get("category", "pocket")
        deltas_by_cat[cat] = deltas_by_cat.get(cat, 0.0) + d

    cb_open = {c: round(float(cb_close.get(c, 0.0)) - float(deltas_by_cat.get(c, 0.0)), 2) for c in cb_close.keys()}

    total_open = round(sum(cb_open.values()), 2)
    total_close = round(sum(cb_close.values()), 2)

    story = []
    story.append(Paragraph("SAFELYN SYSTEMS · PERSONAL ALLOWANCE STATEMENT", eyebrow))
    story.append(Paragraph(f"{resident.get('name', '—')}", h1))
    line = []
    if resident.get("preferred_name") and resident["preferred_name"] != resident.get("name"):
        line.append(f"\u201c{resident['preferred_name']}\u201d")
    if resident.get("dob"):
        line.append(f"DOB {resident['dob']}")
    if resident.get("room"):
        line.append(f"Room {resident['room']}")
    line.append(f"Month {month_label}")
    story.append(Paragraph("  ·  ".join(line), sub))

    story.append(Spacer(1, 4))

    # Top summary
    summary_rows = [
        [
            Paragraph("OPENING TOTAL", label),
            Paragraph("CLOSING TOTAL", label),
            Paragraph("MONEY IN", label),
            Paragraph("MONEY OUT", label),
            Paragraph("NET", label),
            Paragraph("WEEKLY ALLOWANCE", label),
        ],
        [
            Paragraph(_fmt_money(total_open, sym), big),
            Paragraph(_fmt_money(total_close, sym), big),
            Paragraph(f"<font color='{SAFE.hexval()}'>+{_fmt_money(in_total, sym)}</font>", big),
            Paragraph(f"<font color='{URGENT.hexval()}'>-{_fmt_money(out_total, sym)}</font>", big),
            Paragraph(_fmt_money(in_total - out_total, sym), big),
            Paragraph(_fmt_money(float(account.get('weekly_allowance', 0.0)), sym), big),
        ],
    ]
    summary_tbl = Table(summary_rows, colWidths=[30 * mm] * 6)
    summary_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F6F8FA")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(summary_tbl)

    # Per-category breakdown
    story.append(Paragraph("Category breakdown", sectionH))
    cat_rows = [[
        Paragraph("CATEGORY", label),
        Paragraph("OPENING", label),
        Paragraph("IN", label),
        Paragraph("OUT", label),
        Paragraph("CLOSING", label),
    ]]
    for cat_id, close_val in cb_close.items():
        meta = cat_meta_by_id.get(cat_id, {})
        open_val = cb_open.get(cat_id, 0.0)
        in_v = max(0.0, deltas_by_cat.get(cat_id, 0.0))
        out_v = abs(min(0.0, deltas_by_cat.get(cat_id, 0.0)))
        if open_val == 0 and close_val == 0 and in_v == 0 and out_v == 0:
            continue  # skip zero-only categories
        label_html = f"<b>{meta.get('label', cat_id)}</b><br/><font size='6' color='{INK_3.hexval()}'>{meta.get('subtitle', '')}</font>"
        cat_rows.append([
            Paragraph(label_html, cell),
            Paragraph(_fmt_money(open_val, sym), cell),
            Paragraph(f"<font color='{SAFE.hexval()}'>+{_fmt_money(in_v, sym)}</font>" if in_v else "—", cell),
            Paragraph(f"<font color='{URGENT.hexval()}'>-{_fmt_money(out_v, sym)}</font>" if out_v else "—", cell),
            Paragraph(f"<b>{_fmt_money(close_val, sym)}</b>", cell),
        ])
    cat_tbl = Table(cat_rows, colWidths=[60 * mm, 30 * mm, 30 * mm, 30 * mm, 30 * mm], repeatRows=1)
    cat_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F6F8FA")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(cat_tbl)

    # Transactions
    story.append(Paragraph("Transactions", sectionH))
    head = [
        Paragraph("DATE", label),
        Paragraph("CATEGORY", label),
        Paragraph("DESCRIPTION", label),
        Paragraph("IN", label),
        Paragraph("OUT", label),
        Paragraph("BAL (CAT)", label),
        Paragraph("BAL (TOTAL)", label),
        Paragraph("STAFF · YP", label),
    ]
    rows = [head]
    if not transactions:
        rows.append([Paragraph("—", cell), Paragraph("No transactions this month.", cell), "", "", "", "", "", ""])
    else:
        for tx in transactions:
            try:
                created = datetime.fromisoformat(tx["created_at"]).strftime("%d %b · %H:%M")
            except Exception:
                created = tx.get("created_at", "—")
            d = float(tx.get("delta", 0.0))
            in_s = _fmt_money(d, sym) if d > 0 else ""
            out_s = _fmt_money(-d, sym) if d < 0 else ""
            sig = (tx.get("signed_by_staff_initials") or tx.get("created_by_name") or "—")
            if tx.get("signed_by_yp_initials"):
                sig += f" · {tx['signed_by_yp_initials']}"
            cat_label = (cat_meta_by_id.get(tx.get("category"), {}) or {}).get("label", tx.get("category", "—"))
            rows.append([
                Paragraph(created, cell),
                Paragraph(cat_label, cell),
                Paragraph(tx.get("reason", "—"), cell),
                Paragraph(f"<font color='{SAFE.hexval()}'>{in_s}</font>", cell),
                Paragraph(f"<font color='{URGENT.hexval()}'>{out_s}</font>", cell),
                Paragraph(_fmt_money(float(tx.get("balance_after_category", 0.0)), sym), cell),
                Paragraph(_fmt_money(float(tx.get("balance_after_total", 0.0)), sym), cell),
                Paragraph(sig, cell),
            ])
    tx_tbl = Table(
        rows,
        colWidths=[22 * mm, 26 * mm, 50 * mm, 18 * mm, 18 * mm, 22 * mm, 22 * mm, 22 * mm],
        repeatRows=1,
    )
    tx_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F6F8FA")),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(tx_tbl)

    story.append(Spacer(1, 6))
    audit_seed = f"{resident.get('id','')}|{month_label}|{len(transactions)}|{total_close}".encode()
    audit_hash = hashlib.sha256(audit_seed).hexdigest()[:16].upper()
    story.append(Paragraph(
        f"Audit hash: {audit_hash} · generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        foot,
    ))

    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    return pdf
