"""Inspector Preview Links — Phase F.3.

Time-limited, signed, revocable, read-only access to the Single Central Record
for Reg 44 visitors / Ofsted inspectors / RIs on site.

SECURITY MODEL:
- Tokens are 64-character urlsafe random strings (256 bits of entropy).
- Stored hashed in DB (sha-256) — never plaintext at rest.
- Time-limited: 1h / 4h / 24h only.
- Scope-locked: ONLY exposes the SCR JSON. No personnel files, no audit drilldown,
  no individual uploaded files. The public endpoint never accepts auth headers.
- Revocable on demand by any manager/admin.
- Every action audited: create, view (with IP + UA), revoke.
- Inspector preview JSON strips internal IDs that could be used to forge
  follow-on requests against authenticated endpoints.
"""
from __future__ import annotations

import base64
import hashlib
import io
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import qrcode


ALLOWED_EXPIRY_HOURS = (1, 4, 24)
DEFAULT_EXPIRY_HOURS = 4
TOKEN_BYTES = 48  # 64-char urlsafe token


def _now() -> datetime:
    return datetime.now(timezone.utc)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def make_qr_data_url(text: str) -> str:
    """Generate a small QR code PNG as a base64 data: URL."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0F2A47", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _link_lite(doc: dict, current_user_was_creator: bool = False) -> dict:
    """Lite view for manager-facing list endpoint — never includes the raw token
    (only the prefix for visual identification + revoke decisions)."""
    return {
        "id": doc.get("id"),
        "expires_at": doc.get("expires_at"),
        "created_at": doc.get("created_at"),
        "created_by_name": doc.get("created_by_name"),
        "revoked_at": doc.get("revoked_at"),
        "revoked_by_name": doc.get("revoked_by_name"),
        "view_count": doc.get("view_count", 0),
        "last_viewed_at": doc.get("last_viewed_at"),
        "filters_snapshot": doc.get("filters_snapshot"),
        "sector": doc.get("sector"),
        "is_active": _is_active(doc),
        "is_expired": _is_expired(doc),
        "is_revoked": bool(doc.get("revoked_at")),
        # token_prefix lets manager visually recognise the link in the list
        # without exposing the full token (which is what authenticates the
        # public preview endpoint). Stored at create time on the doc.
        "token_prefix": doc.get("token_prefix"),
    }


def _is_expired(doc: dict) -> bool:
    exp = doc.get("expires_at")
    if not exp:
        return True
    try:
        d = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d < _now()
    except Exception:
        return True


def _is_active(doc: dict) -> bool:
    return not doc.get("revoked_at") and not _is_expired(doc)


def filter_inspector_payload(scr: dict) -> dict:
    """Strip a full SCR JSON down to the inspector-safe subset.

    KEEP: name, role_label, employment_type, agency_name, start_date,
    DBS cert no + expiry, RTW, ID verified, references, qualifications,
    mandatory training, last supervision, last appraisal, probation, overall RAG,
    KPIs, summary, sector, generated_at.

    STRIP: staff_id (no internal IDs the inspector could correlate), filters,
    explainable_note (internal), and anything not on the keep-list.
    """
    keep_row = {
        "name", "role_label", "employment_type", "is_agency", "agency_name",
        "start_date",
        "dbs", "barred_list", "right_to_work", "id_verified",
        "references", "qualifications", "mandatory_training",
        "last_supervision", "last_appraisal", "probation",
        "overall_status",
    }
    rows = []
    for idx, r in enumerate(scr.get("rows") or [], start=1):
        out = {k: v for k, v in r.items() if k in keep_row}
        out["display_idx"] = idx  # so the UI can render a stable row number
        rows.append(out)
    return {
        "generated_at": scr.get("generated_at"),
        "sector": scr.get("sector"),
        "summary": scr.get("summary"),
        "kpis": scr.get("kpis"),
        "rows": rows,
        "total_staff": len(rows),
    }


def public_link_view(doc: dict, base_url: str) -> dict:
    """Manager-facing 'link just created' view — INCLUDES the raw token URL
    + QR code data url. Returned ONLY once at creation time. After this the
    raw token is never persisted as plaintext."""
    url = doc.get("share_url") or f"{base_url}/inspector-preview/{doc.get('_raw_token', '')}"
    return {
        **_link_lite(doc),
        "share_url": url,
        "qr_data_url": make_qr_data_url(url),
        "warning": (
            "This link provides temporary read-only access to the Single Central Record. "
            "Do not share outside authorised inspection or governance purposes."
        ),
    }
