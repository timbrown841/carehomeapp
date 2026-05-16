"""Deterministic referral text → structured fields extractor.

NO AI inference. Pure keyword / regex / pattern matching so the same text
always produces the same extraction. This powers the Instant Match Simulator
inside Referrals & Matching.

Supports plain text (paste-from-email, paste-from-phone-call) and PDFs.
"""
from __future__ import annotations
import io
import re
from typing import Optional

try:
    import pypdf  # type: ignore
except Exception:  # pragma: no cover
    pypdf = None  # type: ignore


# ---------------------------------------------------------------------------
# Keyword maps — every entry is verifiable. Add cautiously.
# ---------------------------------------------------------------------------

# Maps NEED key → list of case-insensitive substrings / regex fragments.
NEED_KEYWORDS: dict[str, list[str]] = {
    "trauma":         [r"\btrauma\b", r"\btraumat", r"\bACE[s]?\b", r"\badverse childhood"],
    "attachment":     [r"\battachment\b", r"\bdisorganised attachment", r"\bdisorganized attachment"],
    "self_harm":      [r"\bself[\s-]?harm", r"\bcutting\b", r"\bself[\s-]?injur", r"\bsuicid"],
    "missing":        [r"\bmissing from (?:care|home)", r"\bmissing episode", r"\babsconded?\b", r"\bran away\b", r"\bMFC\b"],
    "cse":            [r"\bCSE\b", r"\bchild sexual exploit", r"\bsexual(?:ly)? exploit", r"\bgrooming\b", r"\bgroomed\b"],
    "ce":             [r"\bCCE\b", r"\bcriminal exploit", r"\bcounty lines", r"\bdrug running", r"\bdrug dealing", r"\bcuckoo"],
    "aggression":     [r"\baggressi", r"\bviolen", r"\bphysical(?:ly)? assault", r"\bpunched\b", r"\bkicked\b", r"\bthreaten"],
    "substance":      [r"\bsubstance misuse", r"\bdrugs?\b", r"\bcannabis\b", r"\bcocaine\b", r"\bspice\b", r"\balcohol misuse", r"\bdrinking\b"],
    "mental_health":  [r"\bmental health", r"\banxiet", r"\bdepression\b", r"\bdepressed\b", r"\bPTSD\b", r"\bsuicid", r"\bCAMHS\b"],
    "learning":       [r"\blearning (?:disabilit|difficult)", r"\bSEN\b", r"\bEHCP\b", r"\bdyslex", r"\bautis", r"\bASD\b", r"\bADHD\b"],
    "education":      [r"\bschool refus", r"\bschool exclus", r"\bNEET\b", r"\beducation issues?", r"\bdisengaged from school", r"\bnot in school"],
    "health":         [r"\bmedical condition", r"\bdiabet", r"\basthma\b", r"\bepileps", r"\bchronic"],
    "offending":      [r"\boffend", r"\barrest", r"\bconvict", r"\bcourt order", r"\bremand\b", r"\bcustod", r"\bDTO\b"],
    "gang":           [r"\bgang\b", r"\baffiliat", r"\bcrew\b"],
    "online_safety":  [r"\bonline safety", r"\bsocial media", r"\bsexting\b", r"\bonline grooming", r"\bsnap(?:chat)?\b"],
    "ebd":            [r"\bEBD\b", r"\bemotional (?:and|&) behavioural", r"\bdysregulat"],
}

# Maps risk dimension → trigger phrases
RISK_KEYWORDS: dict[str, dict[str, list[str]]] = {
    "risk_to_self":         {"high": [r"\bhigh risk to self", r"\bself[\s-]?harm", r"\bsuicid"], "medium": [r"\bmedium risk to self"], "low": [r"\blow risk to self"]},
    "risk_to_others":       {"high": [r"\bhigh risk to others", r"\bviolen", r"\bphysical(?:ly)? assault"], "medium": [r"\bmedium risk to others"], "low": [r"\blow risk to others"]},
    "risk_from_others":     {"high": [r"\bhigh risk from others", r"\bvictim of\b", r"\bexploited?\b"], "medium": [r"\bmedium risk from others"], "low": [r"\blow risk from others"]},
    "absconding_risk":      {"high": [r"\bhigh (?:absconding|missing) risk", r"\bfrequent(?:ly)? missing", r"\brepeat missing"], "medium": [r"\bmedium (?:absconding|missing) risk", r"\boccasional(?:ly)? missing"], "low": [r"\blow (?:absconding|missing) risk"]},
    "exploitation_risk":    {"high": [r"\bhigh exploitation risk", r"\bCSE\b", r"\bCCE\b", r"\bgrooming\b", r"\bcounty lines"], "medium": [r"\bmedium exploitation risk"], "low": [r"\blow exploitation risk"]},
    "peer_influence_risk":  {"high": [r"\bhigh peer influence", r"\beasily (?:led|influenced)"], "medium": [r"\bmedium peer influence"], "low": [r"\blow peer influence"]},
}

URGENCY_KEYWORDS = {
    "emergency": [r"\bemergency placement", r"\bemergency\b", r"\bASAP\b", r"\bimmediate placement", r"\btoday\b.*placement", r"\bovernight placement"],
    "urgent":    [r"\burgent\b", r"\bthis week\b", r"\bwithin (?:24|48|72) hours"],
    "planned":   [r"\bplanned (?:move|placement)", r"\bplanned admission"],
}

# Legal status patterns
LEGAL_STATUS_PATTERNS = [
    (r"\bs(?:ection)?[\s-]?20\b", "S20"),
    (r"\bs(?:ection)?[\s-]?31\b", "S31"),
    (r"\bs(?:ection)?[\s-]?38\b", "S38"),
    (r"\binterim care order\b", "ICO (S38)"),
    (r"\bfull care order\b", "FCO (S31)"),
    (r"\bremand\b", "Remand"),
    (r"\bEPO\b", "EPO"),
    (r"\bvoluntary accom", "S20 voluntary"),
    (r"\baccommodated\b", "S20"),
]


def _find_first(patterns: list[str], text: str) -> bool:
    for p in patterns:
        if re.search(p, text, re.IGNORECASE):
            return True
    return False


def extract_pdf_text(file_bytes: bytes) -> str:
    """Extract plain text from a PDF using pypdf. Returns '' on failure."""
    if not pypdf:
        return ""
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        parts: list[str] = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                parts.append("")
        return "\n".join(parts)
    except Exception:
        return ""


def _detect_age(text: str) -> Optional[int]:
    """Find an age expressed as 'X years old' / 'aged X' / 'age: X'."""
    for pat in (
        r"age[d]?\s*[:\s]\s*(\d{1,2})\b",
        r"(\d{1,2})\s*(?:yrs?|years?)\s*old",
        r"\b(\d{1,2})\s*year[s]?[\s-]old\b",
        r"\bDOB[^\n]{0,40}",  # fallback — leave for SW pasted DOB lines
    ):
        m = re.search(pat, text, re.IGNORECASE)
        if m and m.lastindex:
            try:
                a = int(m.group(1))
                if 0 < a <= 25:
                    return a
            except Exception:
                pass
    return None


def _detect_gender(text: str) -> Optional[str]:
    low = text.lower()
    # Strong signals
    if re.search(r"\b(?:male|boy|young man|young person \(male\))\b", low) and not re.search(r"\b(?:female|girl|young woman)\b", low):
        return "male"
    if re.search(r"\b(?:female|girl|young woman)\b", low) and not re.search(r"\b(?:male|boy|young man)\b", low):
        return "female"
    return None


def _detect_initials(text: str) -> Optional[str]:
    # Explicit "Initials: XX" first
    m = re.search(r"initials?\s*[:\-]\s*([A-Z]{1,4})\b", text)
    if m:
        return m.group(1)
    # "YP:" or "Young person:" + name → take initials
    m = re.search(r"(?:young person|YP|child|client)\s*[:\-]\s*([A-Z][a-z]+\s+[A-Z][a-z]+)", text)
    if m:
        parts = m.group(1).split()
        return "".join(p[0] for p in parts if p)[:4].upper()
    # Look for "Re: AB" pattern at top of emails
    m = re.search(r"\b(?:Re|RE|Subject)\s*[:\-].*?([A-Z]{2,4})\b", text)
    if m:
        return m.group(1)
    return None


def _detect_local_authority(text: str) -> Optional[str]:
    for pat in (
        r"(?:local authority|LA)\s*[:\-]\s*([A-Z][A-Za-z\s&]{2,40})(?:\n|,|\.|;)",
        r"\bLondon Borough of ([A-Z][A-Za-z\s&]{2,40})(?:\n|,|\.|;)",
        r"\b([A-Z][A-Za-z]+ (?:County )?Council)\b",
    ):
        m = re.search(pat, text)
        if m:
            return m.group(1).strip()
    return None


def _detect_social_worker(text: str) -> tuple[Optional[str], Optional[str]]:
    name = None; contact = None
    m = re.search(r"social worker\s*[:\-]\s*([A-Z][a-z]+\s+[A-Z][a-z]+)", text, re.IGNORECASE)
    if m:
        name = m.group(1)
    # Phone or email near "social worker"
    m2 = re.search(r"social worker[^\n]{0,200}?(\b[\w\.-]+@[\w\.-]+\.[A-Za-z]{2,}\b|\b0\d{9,10}\b|\b\+44 ?\d{9,10}\b)", text, re.IGNORECASE | re.DOTALL)
    if m2:
        contact = m2.group(1)
    return name, contact


def _detect_urgency(text: str) -> Optional[str]:
    for key, pats in URGENCY_KEYWORDS.items():
        if _find_first(pats, text):
            return key
    return None


def _detect_legal_status(text: str) -> Optional[str]:
    for pat, label in LEGAL_STATUS_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            return label
    return None


def _detect_known_associates(text: str) -> list[str]:
    """Pick up groups of comma-separated upper-cased initials after 'associates:' label."""
    out: list[str] = []
    for pat in (
        r"(?:known )?associates\s*[:\-]\s*([A-Z]{1,4}(?:\s*,\s*[A-Z]{1,4})*)",
        r"peers?\s*[:\-]\s*([A-Z]{1,4}(?:\s*,\s*[A-Z]{1,4})*)",
    ):
        for m in re.finditer(pat, text):
            for tok in re.split(r"[\s,]+", m.group(1)):
                tok = tok.strip()
                if tok and tok.isupper() and 1 <= len(tok) <= 4:
                    out.append(tok)
    # Dedup preserving order
    seen = set(); uniq = []
    for t in out:
        if t not in seen:
            seen.add(t); uniq.append(t)
    return uniq


def _detect_needs(text: str) -> list[str]:
    found: list[str] = []
    for key, pats in NEED_KEYWORDS.items():
        if _find_first(pats, text):
            found.append(key)
    return found


def _detect_risks(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for dim, levels in RISK_KEYWORDS.items():
        for level, pats in levels.items():
            if _find_first(pats, text):
                # Higher levels win (don't downgrade)
                if dim not in out or _level_rank(level) > _level_rank(out[dim]):
                    out[dim] = level
    return out


def _level_rank(lv: str) -> int:
    return {"low": 1, "medium": 2, "high": 3}.get(lv, 0)


def _detect_reason(text: str) -> Optional[str]:
    """Reason for referral — first 1-3 sentences after a 'reason' / 'background' / 'referral' label, else first 400 chars."""
    m = re.search(r"(?:reason for referral|reason|background|referral)\s*[:\-]\s*(.{20,800})", text, re.IGNORECASE | re.DOTALL)
    if m:
        snippet = m.group(1).strip()
        return snippet[:600]
    # Fallback: first non-empty block
    block = next((line.strip() for line in text.splitlines() if len(line.strip()) > 40), None)
    return (block or text.strip())[:400] if text.strip() else None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def extract_referral_from_text(text: str) -> dict:
    """Deterministic text → structured referral fields.

    All matches link back to specific keyword evidence so managers can verify.
    """
    if not text:
        return {"detected_keywords": [], "warnings": ["No text provided"]}

    needs = _detect_needs(text)
    risks = _detect_risks(text)
    associates = _detect_known_associates(text)

    extracted = {
        "yp_initials":          _detect_initials(text) or "",
        "age":                  _detect_age(text),
        "gender":               _detect_gender(text),
        "local_authority":      _detect_local_authority(text),
        "urgency_level":        _detect_urgency(text),
        "legal_status":         _detect_legal_status(text),
        "needs":                needs,
        "known_associates":     associates,
        "reason_for_referral":  _detect_reason(text),
        **risks,
    }
    sw_name, sw_contact = _detect_social_worker(text)
    if sw_name: extracted["social_worker_name"] = sw_name
    if sw_contact: extracted["social_worker_contact"] = sw_contact

    # Evidence chain — what triggered each detection
    evidence: list[dict] = []
    for need in needs:
        kws = NEED_KEYWORDS[need]
        for k in kws:
            m = re.search(k, text, re.IGNORECASE)
            if m:
                evidence.append({"field": "needs", "value": need, "matched_phrase": m.group(0)})
                break
    for dim, lv in risks.items():
        kws = RISK_KEYWORDS[dim][lv]
        for k in kws:
            m = re.search(k, text, re.IGNORECASE)
            if m:
                evidence.append({"field": dim, "value": lv, "matched_phrase": m.group(0)})
                break

    return {
        "extracted": {k: v for k, v in extracted.items() if v not in (None, "", [], {})},
        "raw_text_length": len(text),
        "evidence": evidence,
        "warnings": [],
    }
