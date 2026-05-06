"""Safelyn Systems · Pocket Money Monthly Statement PDF.

Auditor / inspector / parent-friendly statement of a resident's pocket money
ledger for a given month, with running balance, opening/closing balances,
total in/out, and a clear list of every transaction signed by staff (and YP
where applicable).
"""
from __future__ import annotations

import io
import hashlib
from datetime import datetime
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
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
AMBER = colors.HexColor("#B8772F")

KIND_LABEL = {
    "allowance": "Weekly allowance",
    "spend": "Spend",
    "deposit": "Deposit",
    "withdrawal": "Withdrawal",
    "savings_in": "→ Savings",
    "savings_out": "Savings →",
    "adjustment": "Adjustment",
}


def _fmt_money(amount: float, currency: str = "£") -> str:
    sign = "-" if amount < 0 else ""
    return f"{sign}{currency}{abs(float(amount)):,.2f}"


def build_statement_pdf(
    *, resident: dict, account: dict, transactions: List[dict], month_label: str
) -> bytes:
    """Return a single-page (or 2-page if many tx) statement as bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=f"Pocket Money Statement – {resident.get('name')} – {month_label}",
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "h1", parent=styles["Heading1"],
        fontName="Helvetica-Bold", fontSize=18, leading=22,
        textColor=BRAND_INK, spaceAfter=2,
    )
    eyebrow = ParagraphStyle(
        "eyebrow", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=8, leading=10,
        textColor=BRAND_DEEP, spaceAfter=2,
    )
    sub = ParagraphStyle(
        "sub", parent=styles["Normal"],
        fontName="Helvetica", fontSize=10, leading=13,
        textColor=INK_2, spaceAfter=4,
    )
    label = ParagraphStyle(
        "label", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=7, leading=9,
        textColor=INK_3,
    )
    big = ParagraphStyle(
        "big", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=14, leading=16,
        textColor=BRAND_INK,
    )
    section = ParagraphStyle(
        "section", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=11, leading=13,
        textColor=BRAND_INK, spaceAfter=6, spaceBefore=8,
    )
    foot = ParagraphStyle(
        "foot", parent=styles["Normal"],
        fontName="Helvetica", fontSize=7, leading=9,
        textColor=INK_3, alignment=TA_LEFT,
    )

    cur = (account or {}).get("currency", "GBP")
    sym = "£" if cur == "GBP" else cur + " "

    # Opening balance from running balance_after of last tx BEFORE the month
    # Simplification: use the first tx's `balance_after - delta` if present, otherwise current account balance backed-out via deltas.
    pocket_open: float = float(account.get("pocket_balance", 0.0))
    savings_open: float = float(account.get("savings_balance", 0.0))
    # Reverse all this month's deltas to get the opening at start of the month
    in_total = 0.0
    out_total = 0.0
    for tx in transactions:
        d = float(tx.get("delta", 0.0))
        if (tx.get("account") or "pocket") == "pocket":
            pocket_open -= d
        else:
            savings_open -= d
        # savings_in/savings_out also affect the OTHER account
        if tx.get("kind") == "savings_in":
            savings_open -= float(tx["amount"])  # had been added to savings
            pocket_open += float(tx["amount"])  # had been removed from pocket
        elif tx.get("kind") == "savings_out":
            savings_open += float(tx["amount"])  # had been removed from savings
            pocket_open -= float(tx["amount"])  # had been added to pocket
        if d > 0:
            in_total += d
        elif d < 0:
            out_total += -d

    pocket_close = float(account.get("pocket_balance", 0.0))
    savings_close = float(account.get("savings_balance", 0.0))

    # Header
    story = []
    story.append(Paragraph("SAFELYN SYSTEMS · POCKET MONEY STATEMENT", eyebrow))
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

    story.append(Spacer(1, 6))

    # Summary panel
    summary_rows = [
        [
            Paragraph("OPENING POCKET", label),
            Paragraph("CLOSING POCKET", label),
            Paragraph("OPENING SAVINGS", label),
            Paragraph("CLOSING SAVINGS", label),
            Paragraph("MONEY IN", label),
            Paragraph("MONEY OUT", label),
        ],
        [
            Paragraph(_fmt_money(pocket_open, sym), big),
            Paragraph(_fmt_money(pocket_close, sym), big),
            Paragraph(_fmt_money(savings_open, sym), big),
            Paragraph(_fmt_money(savings_close, sym), big),
            Paragraph(f"<font color='{SAFE.hexval()}'>+{_fmt_money(in_total, sym)}</font>", big),
            Paragraph(f"<font color='{URGENT.hexval()}'>{_fmt_money(-out_total, sym)}</font>", big),
        ],
    ]
    summary_tbl = Table(summary_rows, colWidths=[28 * mm] * 6)
    summary_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.3, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F6F8FA")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(summary_tbl)

    story.append(Paragraph("Transactions", section))

    # Tx table
    head = [
        Paragraph("DATE", label),
        Paragraph("KIND", label),
        Paragraph("DESCRIPTION", label),
        Paragraph("ACCOUNT", label),
        Paragraph("IN", label),
        Paragraph("OUT", label),
        Paragraph("BALANCE", label),
        Paragraph("STAFF / YP", label),
    ]
    rows = [head]
    if not transactions:
        rows.append([
            Paragraph("—", sub),
            Paragraph("No transactions this month.", sub),
            "", "", "", "", "", "",
        ])
    else:
        for tx in transactions:
            try:
                created = datetime.fromisoformat(tx["created_at"]).strftime("%d %b · %H:%M")
            except Exception:
                created = tx.get("created_at", "—")
            d = float(tx.get("delta", 0.0))
            in_s = _fmt_money(d, sym) if d > 0 else ""
            out_s = _fmt_money(-d, sym) if d < 0 else ""
            sig = (tx.get("created_by_name") or "—")
            if tx.get("signed_by_yp_initials"):
                sig += f" / YP: {tx['signed_by_yp_initials']}"
            rows.append([
                Paragraph(created, sub),
                Paragraph(KIND_LABEL.get(tx.get("kind", ""), tx.get("kind", "—")), sub),
                Paragraph(tx.get("label", "—"), sub),
                Paragraph(tx.get("account", "pocket").title(), sub),
                Paragraph(f"<font color='{SAFE.hexval()}'>{in_s}</font>", sub),
                Paragraph(f"<font color='{URGENT.hexval()}'>{out_s}</font>", sub),
                Paragraph(_fmt_money(float(tx.get("balance_after", 0.0)), sym), sub),
                Paragraph(sig, sub),
            ])
    tx_tbl = Table(
        rows,
        colWidths=[24 * mm, 22 * mm, 42 * mm, 16 * mm, 18 * mm, 18 * mm, 18 * mm, 16 * mm],
        repeatRows=1,
    )
    tx_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F6F8FA")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(tx_tbl)

    story.append(Spacer(1, 8))
    audit_seed = f"{resident.get('id','')}|{month_label}|{len(transactions)}|{pocket_close}|{savings_close}".encode()
    audit_hash = hashlib.sha256(audit_seed).hexdigest()[:16].upper()
    story.append(Paragraph(
        f"Audit hash: {audit_hash} · generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · weekly allowance: {_fmt_money(float(account.get('weekly_allowance', 0.0)), sym)}",
        foot,
    ))

    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    return pdf
