"""Safelyn Systems · Notification delivery service.

When configured with credentials this sends real email (Resend) and SMS
(Twilio). Until then it returns a MOCKED delivery record so the rest of the
app can be wired up end-to-end without secrets.

Env vars (all optional):
- RESEND_API_KEY, RESEND_FROM_EMAIL
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
- DEFAULT_DSL_EMAIL, DEFAULT_DSL_PHONE
- DEFAULT_MANAGER_EMAIL, DEFAULT_MANAGER_PHONE
"""
from __future__ import annotations

import os
import logging
from typing import Dict, Optional

import httpx

logger = logging.getLogger("safelyn.notifications")


def _env(name: str) -> Optional[str]:
    val = os.environ.get(name) or ""
    return val.strip() or None


async def send_email(*, to: str, subject: str, html: str) -> Dict:
    """Send an email via Resend if configured, otherwise return mocked delivery."""
    key = _env("RESEND_API_KEY")
    sender = _env("RESEND_FROM_EMAIL") or "no-reply@safelyn.app"
    if not key or not to:
        return {
            "channel": "email",
            "to": to or "",
            "status": "mocked",
            "mocked": True,
            "preview": {"subject": subject, "html": html},
        }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={"from": sender, "to": [to], "subject": subject, "html": html},
            )
            ok = r.status_code in (200, 202)
            return {
                "channel": "email",
                "to": to,
                "status": "sent" if ok else "failed",
                "mocked": False,
                "provider_status": r.status_code,
            }
    except Exception as e:
        logger.exception("Resend send failed")
        return {"channel": "email", "to": to, "status": "failed", "mocked": False, "error": str(e)}


async def send_sms(*, to: str, body: str) -> Dict:
    """Send SMS via Twilio if configured, otherwise return mocked delivery."""
    sid = _env("TWILIO_ACCOUNT_SID")
    token = _env("TWILIO_AUTH_TOKEN")
    sender = _env("TWILIO_FROM_NUMBER")
    if not sid or not token or not sender or not to:
        return {
            "channel": "sms",
            "to": to or "",
            "status": "mocked",
            "mocked": True,
            "preview": {"body": body},
        }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                auth=(sid, token),
                data={"From": sender, "To": to, "Body": body},
            )
            ok = r.status_code in (200, 201)
            return {
                "channel": "sms",
                "to": to,
                "status": "sent" if ok else "failed",
                "mocked": False,
                "provider_status": r.status_code,
            }
    except Exception as e:
        logger.exception("Twilio send failed")
        return {"channel": "sms", "to": to, "status": "failed", "mocked": False, "error": str(e)}


def recipient_for(kind: str) -> Dict[str, str]:
    """Default recipient endpoints based on notification kind."""
    if kind == "dsl":
        return {
            "email": _env("DEFAULT_DSL_EMAIL") or "",
            "phone": _env("DEFAULT_DSL_PHONE") or "",
        }
    return {
        "email": _env("DEFAULT_MANAGER_EMAIL") or "",
        "phone": _env("DEFAULT_MANAGER_PHONE") or "",
    }
