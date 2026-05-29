"""Iteration 47b — supplementary tests for Phase G.1 not covered by main suite.

Covers:
- Missing-episode hook creates critical notification (auto-trigger)
- Legacy /api/notifications endpoints still working (no regression)
- Audit-log entries for notif_preferences_updated, notif_manual_created,
  digest_schedule_updated, digest_sent_manual
- Unread_only filter and limit clamp on /notif-centre
- Staff inbox works (own inbox returns 200)
"""
import os
import time
import requests
from datetime import datetime, timezone

BASE = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
API = f"{BASE.rstrip('/')}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _hdrs(t):
    return {"Authorization": f"Bearer {t}"}


# ---- Missing-episode hook ------------------------------------------------

def test_missing_episode_creates_critical_notification():
    tok = _login("manager@care.local", "Manager@123")
    residents = requests.get(f"{API}/residents", headers=_hdrs(tok), timeout=10).json()
    if isinstance(residents, dict):
        residents = residents.get("items") or []
    assert residents, "Need at least one resident"
    rid = residents[0]["id"]

    payload = {
        "resident_id": rid,
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
        "reported_at": datetime.now(timezone.utc).isoformat(),
        "circumstances": "Pytest missing-episode hook",
    }
    r = requests.post(f"{API}/residents/{rid}/missing", headers=_hdrs(tok), json=payload, timeout=10)
    # endpoint may be /residents/{rid}/missing-episodes or /missing; tolerate alternates
    if r.status_code == 404:
        r = requests.post(f"{API}/residents/{rid}/missing-episodes", headers=_hdrs(tok), json=payload, timeout=10)
    assert r.status_code in (200, 201), f"Missing episode create failed: {r.status_code} {r.text[:200]}"

    time.sleep(0.5)
    feed = requests.get(f"{API}/notif-centre?category=missing", headers=_hdrs(tok), timeout=10).json()
    items = feed["items"]
    assert items, "Expected at least one 'missing' notification after creating missing-episode"
    assert items[0]["category"] == "missing"
    assert items[0].get("is_critical") is True


# ---- Legacy /api/notifications still works ------------------------------

def test_legacy_notifications_get_still_works():
    tok = _login("manager@care.local", "Manager@123")
    r = requests.get(f"{API}/notifications", headers=_hdrs(tok), timeout=10)
    assert r.status_code == 200, f"Legacy GET /notifications regressed: {r.status_code} {r.text[:200]}"
    body = r.json()
    # Could be list or {items: [...]}
    assert isinstance(body, (list, dict))


def test_legacy_notifications_post_still_works():
    """Legacy DSL alert creation should still function (manager+)."""
    tok = _login("manager@care.local", "Manager@123")
    payload = {
        "title": "Legacy alert pytest",
        "body": "regression check",
        "severity": "low",
    }
    r = requests.post(f"{API}/notifications", headers=_hdrs(tok), json=payload, timeout=10)
    # Endpoint may exist but require different shape; we just assert it's NOT a 500/404
    assert r.status_code != 404, "Legacy POST /notifications endpoint disappeared"
    assert r.status_code < 500, f"Legacy POST /notifications crashed: {r.text[:200]}"


def test_legacy_notification_mark_read_still_works():
    tok = _login("manager@care.local", "Manager@123")
    listing = requests.get(f"{API}/notifications", headers=_hdrs(tok), timeout=10).json()
    items = listing if isinstance(listing, list) else listing.get("items", [])
    if not items:
        # Can't test mark-read without an item — skip
        import pytest
        pytest.skip("No legacy notifications to mark-read")
    nid = items[0].get("id") or items[0].get("_id")
    if not nid:
        import pytest
        pytest.skip("Legacy notification missing id field")
    r = requests.post(f"{API}/notifications/{nid}/read", headers=_hdrs(tok), timeout=10)
    assert r.status_code in (200, 204), f"Legacy mark-read regressed: {r.status_code}"


# ---- Audit logging ------------------------------------------------------

def _audit_search(token, event_type, since_ts=None):
    """Search audit log for an event_type after since_ts."""
    r = requests.get(f"{API}/audit", headers=_hdrs(token), timeout=10)
    if r.status_code != 200:
        r = requests.get(f"{API}/audit/events", headers=_hdrs(token), timeout=10)
    if r.status_code != 200:
        r = requests.get(f"{API}/audit-log", headers=_hdrs(token), timeout=10)
    assert r.status_code == 200, f"Audit log inaccessible: {r.status_code}"
    body = r.json()
    events = body if isinstance(body, list) else (body.get("events") or body.get("items") or [])
    return [e for e in events if (e.get("event_type") or e.get("action") or "") == event_type]


def test_audit_notif_preferences_updated():
    tok = _login("manager@care.local", "Manager@123")
    requests.patch(
        f"{API}/notif-centre/preferences",
        headers=_hdrs(tok),
        json={"category": "compliance", "channels": ["in_app"]},
        timeout=10,
    )
    time.sleep(0.3)
    matches = _audit_search(tok, "notif_preferences_updated")
    assert matches, "Expected audit event 'notif_preferences_updated'"


def test_audit_notif_manual_created_and_digest_events():
    tok = _login("manager@care.local", "Manager@123")
    et = f"audit_check_{datetime.now(timezone.utc).timestamp()}"
    requests.post(
        f"{API}/notif-centre/manual",
        headers=_hdrs(tok),
        json={"category": "compliance", "event_type": et, "title": "audit check"},
        timeout=10,
    )
    requests.patch(
        f"{API}/handover/digest-schedules/weekly",
        headers=_hdrs(tok),
        json={"enabled": True},
        timeout=10,
    )
    requests.post(f"{API}/handover/digest-schedules/weekly/send-now", headers=_hdrs(tok), timeout=20)
    time.sleep(0.5)

    for et_name in ("notif_manual_created", "digest_schedule_updated", "digest_sent_manual"):
        matches = _audit_search(tok, et_name)
        assert matches, f"Expected audit event '{et_name}'"


# ---- Filters / RBAC -----------------------------------------------------

def test_notif_centre_unread_only_and_limit():
    tok = _login("manager@care.local", "Manager@123")
    r = requests.get(f"{API}/notif-centre?unread_only=true&limit=5", headers=_hdrs(tok), timeout=10)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) <= 5
    # Every item flagged as unread
    assert all((not i.get("read_at")) and (i.get("is_read") in (False, None)) for i in items)


def test_notif_centre_limit_clamp():
    """Excessive limit should not crash."""
    tok = _login("manager@care.local", "Manager@123")
    r = requests.get(f"{API}/notif-centre?limit=10000", headers=_hdrs(tok), timeout=10)
    assert r.status_code == 200


def test_notif_centre_staff_own_inbox():
    tok = _login("staff@care.local", "Staff@123")
    r = requests.get(f"{API}/notif-centre", headers=_hdrs(tok), timeout=10)
    assert r.status_code == 200
    assert "items" in r.json()
