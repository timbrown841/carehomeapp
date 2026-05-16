"""Referral Matching Assessment PDF — Iteration 41.

Modelled on the Strategy Meeting Pack style (A4 portrait, brand colours, audit hash).
Suitable for RI review, Ofsted evidence, placement planning and LA discussion.
"""
from __future__ import annotations
import io
import hashlib
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from placement_intelligence import (
    build_match_analysis, NEED_LABELS, CONDITION_LABELS,
)


BRAND = colors.HexColor("#0F2A47")
INK = colors.HexColor("#1C1C1A")
MUTED = colors.HexColor("#575752")
LINE = colors.HexColor("#D6D6D0")
RED = colors.HexColor("#A8273A")
AMBER = colors.HexColor("#B8772F")
GREEN = colors.HexColor("#2F6A3A")
NAVY = colors.HexColor("#0e3b4a")

CONFIDENCE_COLOR = {
    "strong":           GREEN,
    "manageable":       AMBER,
    "elevated":         RED,
    "not_recommended":  RED,
}

DECISION_LABELS = {
    "accepted":         "ACCEPTED",
    "rejected":         "REJECTED",
    "more_info":        "MORE INFO REQUESTED",
    "escalated_to_ri":  "ESCALATED TO RI",
    "pending":          "PENDING",
}


def _short(s, n=180):
    if not s: return "—"
    s = str(s)
    return s if len(s) <= n else s[:n - 1] + "…"


def _fmt(iso):
    if not iso: return "—"
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).strftime("%d %b %Y %H:%M")
    except Exception:
        return str(iso)


def _audit_hash(referral: dict, analysis: dict) -> str:
    raw = f"{referral.get('id')}|{referral.get('updated_at') or referral.get('created_at')}|" \
          f"{analysis.get('score')}|{analysis.get('matching_confidence')}|{analysis.get('generated_at')}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


async def build_referral_pdf(db, referral: dict) -> bytes:
    analysis = await build_match_analysis(db, referral)
    home = analysis.get("home_readiness", {})
    now = datetime.now(timezone.utc)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
        title=f"Referral Matching Assessment — {referral.get('yp_initials', 'Referral')}",
    )

    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=BRAND)
    h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=BRAND, spaceBefore=10, spaceAfter=4)
    h3 = ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=MUTED, spaceBefore=6, spaceAfter=2)
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=12, textColor=INK)
    small = ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=10, textColor=MUTED)
    bullet = ParagraphStyle("bullet", fontName="Helvetica", fontSize=9, leading=12, textColor=INK, leftIndent=10)

    story = []

    # ===== Cover =====
    story.append(Paragraph("Referral Matching Assessment", h1))
    story.append(Paragraph(
        f"<b>{referral.get('yp_initials') or referral.get('yp_full_name', '—')}</b> · "
        f"Generated {now.strftime('%d %b %Y %H:%M')} UTC",
        small,
    ))
    story.append(Spacer(1, 4))

    # Confidence banner
    conf = analysis.get("matching_confidence", "strong")
    conf_label = analysis.get("matching_confidence_label", "—")
    conf_col = CONFIDENCE_COLOR.get(conf, NAVY)
    banner = Table([[
        Paragraph(f"<font color='white'><b>MATCHING CONFIDENCE</b></font>", small),
        Paragraph(f"<font color='white' size='12'><b>{conf_label.upper()}</b></font>", body),
        Paragraph(f"<font color='white'>Score: <b>{analysis.get('score')}</b></font>", small),
    ]], colWidths=[55 * mm, 80 * mm, 42 * mm])
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), conf_col),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(banner)
    story.append(Spacer(1, 4))

    # ===== 1. Referral information =====
    story.append(Paragraph("1 · Referral information", h2))
    info_rows = [
        ["Young person", referral.get("yp_full_name") or referral.get("yp_initials") or "—"],
        ["Initials", referral.get("yp_initials") or "—"],
        ["Age", str(referral.get("age") or "—")],
        ["Gender", referral.get("gender") or "—"],
        ["Local authority", referral.get("local_authority") or "—"],
        ["Social worker", referral.get("social_worker_name") or "—"],
        ["SW contact", referral.get("social_worker_contact") or "—"],
        ["Referral date", referral.get("referral_date") or "—"],
        ["Placement type requested", referral.get("placement_type_requested") or "—"],
        ["Urgency", referral.get("urgency_level") or "—"],
        ["Legal status", referral.get("legal_status") or "—"],
    ]
    t = Table(info_rows, colWidths=[48 * mm, 129 * mm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 8),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F4F2EC")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t)
    if referral.get("reason_for_referral"):
        story.append(Paragraph("Reason for referral", h3))
        story.append(Paragraph(_short(referral["reason_for_referral"], 600), body))
    if referral.get("current_placement_situation"):
        story.append(Paragraph("Current placement situation", h3))
        story.append(Paragraph(_short(referral["current_placement_situation"], 600), body))

    # ===== 2. Needs assessment =====
    story.append(Paragraph("2 · Needs assessment", h2))
    needs = referral.get("needs") or []
    if needs:
        story.append(Paragraph(", ".join(NEED_LABELS.get(n, n) for n in needs), body))
    else:
        story.append(Paragraph("None recorded.", body))

    # ===== 3. Risks =====
    story.append(Paragraph("3 · Risk matching", h2))
    risk_rows = [
        ["Risk to self", (referral.get("risk_to_self") or "—").upper()],
        ["Risk to others", (referral.get("risk_to_others") or "—").upper()],
        ["Risk from others", (referral.get("risk_from_others") or "—").upper()],
        ["Absconding / missing risk", (referral.get("absconding_risk") or "—").upper()],
        ["Exploitation risk", (referral.get("exploitation_risk") or "—").upper()],
        ["Peer influence risk", (referral.get("peer_influence_risk") or "—").upper()],
    ]
    rt = Table(risk_rows, colWidths=[60 * mm, 117 * mm])
    rt.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 8),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F4F2EC")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(rt)
    if referral.get("known_associates"):
        story.append(Paragraph(
            f"<b>Known associates:</b> {_short(', '.join(referral['known_associates']), 400)}",
            body,
        ))
    if referral.get("police_involvement_history"):
        story.append(Paragraph("Police involvement history", h3))
        story.append(Paragraph(_short(referral["police_involvement_history"], 500), body))
    if referral.get("safeguarding_history"):
        story.append(Paragraph("Safeguarding history", h3))
        story.append(Paragraph(_short(referral["safeguarding_history"], 500), body))

    # ===== 4. Home readiness =====
    story.append(Paragraph("4 · Home readiness (live operational signals)", h2))
    story.append(Paragraph(
        f"<b>{home.get('overall_label', '—')}</b> · score {home.get('score', 0)}",
        body,
    ))
    tiles = home.get("tiles") or []
    if tiles:
        tile_rows = [[Paragraph(f"<b>{t['label']}</b>", small),
                      Paragraph(t['status'].replace('_', ' ').upper(), small)] for t in tiles]
        tt = Table(tile_rows, colWidths=[80 * mm, 97 * mm])
        tt.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
            ("LINEBELOW", (0, 0), (-1, -1), 0.25, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(tt)

    # ===== 5. Group dynamics / impact =====
    story.append(Paragraph("5 · Group dynamics & placement impact", h2))
    warnings = analysis.get("group_warnings") or []
    if not warnings:
        story.append(Paragraph("No group dynamics concerns flagged.", body))
    else:
        for w in warnings:
            story.append(Paragraph(
                f"<b>[{w['domain'].replace('_', ' ').upper()}]</b> {w['label']} · weight {w['weight']}",
                body,
            ))
            for r in (w.get("residents") or [])[:6]:
                story.append(Paragraph(
                    f"<font size='8' color='#575752'>↳ {r.get('name', '—')} — {r.get('reason', '')}</font>",
                    bullet, bulletText="•",
                ))

    # ===== 6. Recommended conditions =====
    story.append(Paragraph("6 · Conditions before acceptance", h2))
    conds = referral.get("conditions") or []
    if conds:
        for c in conds:
            story.append(Paragraph(f"• {CONDITION_LABELS.get(c, c)}", bullet, bulletText="•"))
    else:
        story.append(Paragraph("No conditions recorded.", body))
    if referral.get("conditions_notes"):
        story.append(Paragraph(_short(referral["conditions_notes"], 500), body))

    # ===== 7. What would need to change =====
    story.append(Paragraph("7 · What would need to change", h2))
    for rec in (analysis.get("what_would_need_to_change") or []):
        story.append(Paragraph(f"• {rec}", bullet, bulletText="•"))

    # ===== 8. Decision record =====
    story.append(Paragraph("8 · Decision record", h2))
    decision = referral.get("decision") or "pending"
    decision_rows = [
        ["Decision", DECISION_LABELS.get(decision, decision.upper())],
        ["Decided by", referral.get("decision_by_name") or "—"],
        ["Decided at", _fmt(referral.get("decision_at"))],
        ["Reason", _short(referral.get("decision_reason"), 500) or "—"],
    ]
    dt = Table(decision_rows, colWidths=[40 * mm, 137 * mm])
    dt.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 8),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F4F2EC")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(dt)

    # ===== Audit footer =====
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        f"<b>Audit hash:</b> {_audit_hash(referral, analysis)} · "
        f"Generated from live operational data. Deterministic — same data in, same output. "
        f"Manager judgement is final.",
        small,
    ))

    doc.build(story)
    return buf.getvalue()
