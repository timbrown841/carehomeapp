"""Strategy Meeting Pack — per-child 1-click PDF.

Pulls together everything a strategy meeting / placement review / serious-incident
review chair needs to read before sitting down:

  - Cover: child summary, legal status, social worker, LA, key worker
  - Risk: latest risk profile + assessment date + key risk themes
  - Chronology: last 60 days condensed
  - Safeguarding: open + closed in window
  - Missing history: episodes + return interviews
  - Body maps: count and most recent
  - Key work: last 5 sessions
  - Family contact / known associates
  - Police involvement (from incidents)
  - Outstanding inspection actions for this child's domain
  - Manager oversight notes (Reg 44 visit latest)
"""
from __future__ import annotations
import io
from datetime import datetime, timezone, timedelta

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)


BRAND = colors.HexColor("#0F2A47")
INK = colors.HexColor("#1C1C1A")
MUTED = colors.HexColor("#575752")
LINE = colors.HexColor("#D6D6D0")
RED = colors.HexColor("#A8273A")
AMBER = colors.HexColor("#B8772F")


def _short(s, n=120):
    if not s: return "—"
    s = str(s)
    return s if len(s) <= n else s[:n - 1] + "…"


def _fmt(iso):
    if not iso: return "—"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d %b %Y %H:%M")
    except Exception:
        return iso


async def build_strategy_meeting_pack(db, resident_id: str) -> bytes:
    now = datetime.now(timezone.utc)
    cutoff_60 = (now - timedelta(days=60)).isoformat()
    cutoff_90 = (now - timedelta(days=90)).isoformat()

    resident = await db.residents.find_one({"id": resident_id}, {"_id": 0})
    if not resident:
        raise ValueError("Resident not found")

    # ---- Gather data ----
    incidents = await db.incidents.find(
        {"resident_id": resident_id, "created_at": {"$gte": cutoff_60}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    sg_open = [i for i in incidents if i.get("safeguarding") and i.get("status") == "open"]
    police = [i for i in incidents if "police" in (i.get("summary", "") + (i.get("category") or "")).lower()]

    missing = await db.missing_episodes.find(
        {"resident_id": resident_id},
        {"_id": 0},
    ).sort("reported_at", -1).to_list(20)
    ri = await db.return_interviews.find(
        {"resident_id": resident_id}, {"_id": 0},
    ).sort("conducted_at", -1).to_list(20)

    body_maps = await db.body_maps.find(
        {"resident_id": resident_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(20)

    kw = await db.key_work_sessions.find(
        {"resident_id": resident_id}, {"_id": 0},
    ).sort("planned_for", -1).to_list(5)

    family_contacts = await db.family_contacts.find(
        {"resident_id": resident_id}, {"_id": 0},
    ).to_list(20)

    actions = await db.inspection_actions.find(
        {"status": {"$ne": "resolved"}}, {"_id": 0},
    ).sort("priority", -1).to_list(40)
    # Filter actions referencing this child by name
    rname = resident.get("preferred_name") or resident.get("name") or ""
    child_actions = [a for a in actions if rname and rname in (
        f"{a.get('title', '')} {a.get('detail', '')} {a.get('domain', '')}"
    )]

    latest_visit = await db.regulation_44_visits.find_one({}, {"_id": 0}, sort=[("visit_date", -1)])

    # ---- Build PDF ----
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
        title=f"Strategy Meeting Pack — {rname}",
    )

    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=BRAND)
    h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=BRAND, spaceBefore=10, spaceAfter=4)
    h3 = ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=MUTED, spaceBefore=6, spaceAfter=2)
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=12, textColor=INK)
    small = ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=10, textColor=MUTED)
    bullet = ParagraphStyle("bullet", fontName="Helvetica", fontSize=9, leading=12, textColor=INK, leftIndent=10)

    story = []

    # ===== Cover =====
    story.append(Paragraph(f"Strategy Meeting Pack", h1))
    story.append(Paragraph(
        f"<b>{rname}</b> · generated {now.strftime('%d %b %Y %H:%M')} UTC",
        small,
    ))
    story.append(Spacer(1, 6))

    # Cover table
    cover_rows = [
        ["Preferred name", rname],
        ["DOB", resident.get("dob") or "—"],
        ["Legal status", resident.get("legal_status") or "—"],
        ["Placement type", resident.get("service_type") or "—"],
        ["Local authority", resident.get("local_authority") or "—"],
        ["Social worker", resident.get("social_worker_name") or "—"],
        ["Key worker", resident.get("key_worker") or "—"],
        ["Risk level", resident.get("risk_level") or "—"],
        ["Risk last reviewed", resident.get("risk_last_review") or "—"],
        ["Risk next due", resident.get("risk_next_review") or "—"],
    ]
    t = Table(cover_rows, colWidths=[42 * mm, 135 * mm])
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

    if resident.get("referral_reason"):
        story.append(Paragraph("Referral context", h3))
        story.append(Paragraph(_short(resident.get("referral_reason"), 400), body))

    # ===== Risk profile =====
    story.append(Paragraph("Risk profile", h2))
    risk_themes = resident.get("risk_themes") or []
    if isinstance(risk_themes, list) and risk_themes:
        story.append(Paragraph("<b>Themes:</b> " + ", ".join(risk_themes), body))
    if resident.get("risk_summary"):
        story.append(Paragraph(_short(resident.get("risk_summary"), 600), body))

    # ===== Open safeguarding =====
    story.append(Paragraph(f"Open safeguarding incidents ({len(sg_open)})", h2))
    if sg_open:
        for i in sg_open[:6]:
            story.append(Paragraph(
                f"<b>{_fmt(i.get('created_at'))}</b> · {i.get('category', 'incident')}<br/>"
                f"{_short(i.get('summary'), 220)}",
                bullet, bulletText="•"))
    else:
        story.append(Paragraph("No open safeguarding incidents.", body))

    # ===== Chronology (60 days) =====
    story.append(Paragraph(f"Chronology — last 60 days ({len(incidents)} events)", h2))
    if incidents:
        rows = [["Date", "Category", "Severity", "Summary"]]
        for i in incidents[:15]:
            rows.append([
                _fmt(i.get("created_at"))[:11],
                _short(i.get("category"), 18),
                (i.get("severity") or "—").upper(),
                _short(i.get("summary"), 70),
            ])
        chron = Table(rows, colWidths=[24 * mm, 28 * mm, 18 * mm, 107 * mm])
        chron.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
            ("FONT", (0, 1), (-1, -1), "Helvetica", 7.5),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BACKGROUND", (0, 0), (-1, 0), BRAND),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.25, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(chron)
    else:
        story.append(Paragraph("No incidents recorded in the last 60 days.", body))

    # ===== Missing history =====
    story.append(Paragraph(f"Missing-from-care history ({len(missing)} total)", h2))
    if missing:
        for m in missing[:8]:
            status = "RETURNED" if m.get("returned_at") else "OPEN"
            color = MUTED if m.get("returned_at") else RED
            story.append(Paragraph(
                f"<b>Reported {_fmt(m.get('reported_at'))}</b> · <font color='{('#' + color.hexval()[2:])}'>{status}</font><br/>"
                f"Last seen: {_short(m.get('last_seen_at'), 60)} · Returned: {_fmt(m.get('returned_at'))}<br/>"
                f"<font size='8' color='#575752'>{_short(m.get('circumstances'), 220)}</font>",
                bullet, bulletText="•"))
        if ri:
            story.append(Paragraph(f"Return interviews recorded: {len(ri)}", small))
    else:
        story.append(Paragraph("No missing-from-care episodes recorded.", body))

    # ===== Body maps =====
    if body_maps:
        story.append(Paragraph(f"Body maps ({len(body_maps)} on record)", h2))
        recent = body_maps[0]
        story.append(Paragraph(
            f"Most recent: {_fmt(recent.get('created_at'))} · {_short(recent.get('summary') or recent.get('notes'), 200)}",
            body,
        ))

    # ===== Key work =====
    story.append(Paragraph("Recent key work sessions", h2))
    if kw:
        for k in kw[:5]:
            story.append(Paragraph(
                f"<b>{_fmt(k.get('planned_for'))}</b> · {k.get('focus', 'general session')}<br/>"
                f"<font size='8' color='#575752'>{_short(k.get('young_person_voice') or k.get('summary'), 280)}</font>",
                bullet, bulletText="•"))
    else:
        story.append(Paragraph("No key work sessions recorded.", body))

    # ===== Family contact / associates =====
    if family_contacts:
        story.append(Paragraph("Family contact &amp; known associates", h2))
        for c in family_contacts[:8]:
            label = c.get("relationship") or "contact"
            risk = c.get("risk_flag")
            risk_tag = f" <font color='#{RED.hexval()[2:]}'>[RISK]</font>" if risk else ""
            story.append(Paragraph(
                f"<b>{c.get('name', '—')}</b> · {label}{risk_tag}<br/>"
                f"<font size='8' color='#575752'>{_short(c.get('notes'), 180)}</font>",
                bullet, bulletText="•"))

    # ===== Police involvement =====
    if police:
        story.append(Paragraph(f"Police involvement (last 60 days · {len(police)} events)", h2))
        for p in police[:6]:
            story.append(Paragraph(
                f"<b>{_fmt(p.get('created_at'))}</b> · {_short(p.get('summary'), 220)}",
                bullet, bulletText="•"))

    # ===== Outstanding actions =====
    if child_actions:
        story.append(Paragraph(f"Outstanding inspection actions ({len(child_actions)})", h2))
        for a in child_actions[:6]:
            prio = a.get("priority", "medium").upper()
            story.append(Paragraph(
                f"<b>[{prio}] {a.get('title')}</b><br/>"
                f"<font size='8' color='#575752'>Assigned: {a.get('assigned_to_name') or 'unassigned'} · "
                f"Due: {a.get('due_date') or '—'}</font>",
                bullet, bulletText="•"))

    # ===== Manager oversight =====
    if latest_visit:
        story.append(Paragraph("Latest Regulation 44 visit (manager oversight)", h2))
        story.append(Paragraph(
            f"<b>{latest_visit.get('visit_date')} · {latest_visit.get('visitor_name', '—')}</b> · "
            f"Judgement: {(latest_visit.get('overall_judgement') or 'good').replace('_', ' ')}",
            body,
        ))
        for field, label in [
            ("immediate_concerns", "Immediate concerns"),
            ("recommendations", "Recommendations"),
        ]:
            if latest_visit.get(field):
                story.append(Paragraph(label, h3))
                story.append(Paragraph(_short(latest_visit[field], 600), body))

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "<i>This pack is generated from the live operational system. "
        "All entries can be opened and verified inside Safelyn.</i>",
        small,
    ))

    doc.build(story)
    return buf.getvalue()
