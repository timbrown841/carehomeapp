"""Tests for Phase G.1 — Notification Centre & Digest Schedules.

Covers:
- Notification creation (auto + manual)
- Inbox listing, counts, filters, dedupe, unread_only
- Mark-as-read, dismiss, mark-all-read
- Per-category channel preferences
- "Since your last login" widget
- Digest schedules (list, patch, send-now, deliveries log)
- RBAC: staff cannot read digest schedules / preferences-manual-trigger
- Notification hooks fire on safeguarding incident / missing episode
"""
import os
import requests
from datetime import datetime, timezone

BASE = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("PUBLIC_APP_URL")
if not BASE:
    # Fallback for local pytest runs
    BASE = "http://localhost:8001"
API = f"{BASE.rstrip('/')}/api"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---- Fixtures ------------------------------------------------------------


def get_manager_token() -> str:
    return _login("manager@care.local", "Manager@123")


def get_staff_token() -> str:
    return _login("staff@care.local", "Staff@123")


def get_admin_token() -> str:
    return _login("admin@care.local", "Admin@123")


# ---- Tests ---------------------------------------------------------------


def test_notif_centre_inbox_and_counts():
    tok = get_manager_token()
    r = requests.get(f"{API}/notif-centre", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "count" in data

    c = requests.get(f"{API}/notif-centre/counts", headers=_headers(tok), timeout=10)
    assert c.status_code == 200
    cd = c.json()
    assert "unread" in cd and "by_category" in cd and "critical" in cd
    # All seven categories present
    for k in ["safeguarding", "missing", "compliance", "staffing",
              "placement_intelligence", "hr", "inspection_readiness"]:
        assert k in cd["by_category"]


def test_notif_centre_categories_endpoint():
    tok = get_manager_token()
    r = requests.get(f"{API}/notif-centre/categories", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    cats = r.json().get("categories", [])
    assert len(cats) == 7
    assert all("id" in c and "label" in c for c in cats)


def test_notif_centre_preferences_default_and_patch():
    tok = get_manager_token()
    r = requests.get(f"{API}/notif-centre/preferences", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    prefs = r.json()["preferences"]
    assert len(prefs) == 7
    assert all("category" in p and "channels" in p for p in prefs)

    # Update one preference
    p = requests.patch(
        f"{API}/notif-centre/preferences",
        headers=_headers(tok),
        json={"category": "safeguarding", "channels": ["in_app", "email", "sms"]},
        timeout=10,
    )
    assert p.status_code == 200
    assert p.json()["ok"] is True

    # Verify persisted
    r2 = requests.get(f"{API}/notif-centre/preferences", headers=_headers(tok), timeout=10)
    safeguarding = next(x for x in r2.json()["preferences"] if x["category"] == "safeguarding")
    assert "sms" in safeguarding["channels"]

    # Invalid category rejected
    bad = requests.patch(
        f"{API}/notif-centre/preferences",
        headers=_headers(tok),
        json={"category": "nope", "channels": ["in_app"]},
        timeout=10,
    )
    assert bad.status_code == 400


def test_notif_centre_manual_trigger_creates_and_dedupes():
    tok = get_manager_token()
    payload = {
        "category": "compliance",
        "event_type": f"test_dedupe_{datetime.now(timezone.utc).isoformat()}",
        "severity": "medium",
        "title": "Test manual notification",
        "body": "From pytest",
    }
    r1 = requests.post(f"{API}/notif-centre/manual", headers=_headers(tok), json=payload, timeout=10)
    assert r1.status_code == 200
    assert r1.json()["created"] is True

    # Dedupe within same day same event_type
    r2 = requests.post(f"{API}/notif-centre/manual", headers=_headers(tok), json=payload, timeout=10)
    assert r2.status_code == 200
    # Second call dedupes — created flag may be False or notification is None for the manager user
    body = r2.json()
    assert body["created"] is False or body.get("notification") is None


def test_notif_centre_staff_cannot_manual_trigger():
    tok = get_staff_token()
    r = requests.post(
        f"{API}/notif-centre/manual",
        headers=_headers(tok),
        json={"category": "compliance", "event_type": "x", "title": "y"},
        timeout=10,
    )
    assert r.status_code == 403


def test_notif_centre_mark_read_dismiss_and_mark_all():
    tok = get_manager_token()
    # Create a notification first
    requests.post(
        f"{API}/notif-centre/manual",
        headers=_headers(tok),
        json={
            "category": "compliance",
            "event_type": f"mark_read_test_{datetime.now(timezone.utc).timestamp()}",
            "severity": "low",
            "title": "Mark-read test",
        },
        timeout=10,
    )
    inbox = requests.get(f"{API}/notif-centre?unread_only=true", headers=_headers(tok), timeout=10).json()
    items = inbox["items"]
    assert len(items) > 0
    first = items[0]

    # Mark read
    mr = requests.patch(f"{API}/notif-centre/{first['id']}/read", headers=_headers(tok), timeout=10)
    assert mr.status_code == 200

    # Dismiss the same one
    ds = requests.delete(f"{API}/notif-centre/{first['id']}", headers=_headers(tok), timeout=10)
    assert ds.status_code == 200

    # Confirm dismissed item no longer in feed
    r2 = requests.get(f"{API}/notif-centre", headers=_headers(tok), timeout=10).json()
    assert not any(i["id"] == first["id"] for i in r2["items"])

    # Mark all read
    ma = requests.post(f"{API}/notif-centre/mark-all-read", headers=_headers(tok), timeout=10)
    assert ma.status_code == 200


def test_notif_centre_category_filter():
    tok = get_manager_token()
    r = requests.get(f"{API}/notif-centre?category=safeguarding", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    items = r.json()["items"]
    assert all(i.get("category") == "safeguarding" for i in items)


def test_since_last_login_widget():
    tok = get_manager_token()
    r = requests.get(f"{API}/notif-centre/since-last-login", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    body = r.json()
    for key in ["since", "incidents", "safeguarding", "missing_episodes",
                "notifications", "critical_notifications"]:
        assert key in body


def test_digest_schedules_default_three():
    tok = get_manager_token()
    r = requests.get(f"{API}/handover/digest-schedules", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    schedules = r.json()["schedules"]
    keys = {s["key"] for s in schedules}
    assert {"morning", "weekly", "monthly"}.issubset(keys)


def test_digest_schedules_staff_blocked():
    tok = get_staff_token()
    r = requests.get(f"{API}/handover/digest-schedules", headers=_headers(tok), timeout=10)
    assert r.status_code == 403


def test_digest_schedule_patch_and_send_now():
    tok = get_manager_token()
    # Update morning recipients
    admin_users = requests.get(f"{API}/auth/users", headers=_headers(tok), timeout=10).json()
    target_id = next(u["id"] for u in admin_users if u["role"] == "manager")

    p = requests.patch(
        f"{API}/handover/digest-schedules/morning",
        headers=_headers(tok),
        json={"enabled": True, "recipients": [target_id]},
        timeout=10,
    )
    assert p.status_code == 200

    # Send now
    s = requests.post(
        f"{API}/handover/digest-schedules/morning/send-now",
        headers=_headers(tok),
        timeout=20,
    )
    assert s.status_code == 200
    body = s.json()
    assert body["schedule_id"] == "morning"
    assert body["manual_trigger"] is True
    assert len(body["recipients"]) >= 1

    # Check deliveries log includes it
    d = requests.get(f"{API}/handover/digest-deliveries", headers=_headers(tok), timeout=10)
    assert d.status_code == 200
    delivs = d.json()["deliveries"]
    assert any(x["id"] == body["id"] for x in delivs)


def test_safeguarding_incident_triggers_notification():
    """Creating a safeguarding incident must create a critical notification."""
    tok = get_manager_token()
    residents = requests.get(f"{API}/residents", headers=_headers(tok), timeout=10).json()
    if isinstance(residents, dict):
        residents = residents.get("items") or []
    assert len(residents) > 0
    rid = residents[0]["id"]

    inc = requests.post(
        f"{API}/incidents",
        headers=_headers(tok),
        json={
            "resident_id": rid,
            "severity": "high",
            "incident_type": "safeguarding",
            "body": "Pytest hook trigger",
            "safeguarding": True,
            "action_taken": "Reported",
        },
        timeout=10,
    )
    assert inc.status_code == 200

    # Centre should now have a safeguarding entry
    feed = requests.get(f"{API}/notif-centre?category=safeguarding", headers=_headers(tok), timeout=10).json()
    items = feed["items"]
    assert len(items) > 0
    # Verify most-recent is critical and links to a resident timeline
    assert items[0]["category"] == "safeguarding"
    assert items[0]["is_critical"] is True
    assert items[0]["link"] and rid in items[0]["link"]


def test_login_tracks_previous_last_login():
    """Two consecutive logins should populate previous_login_at and last_login_at."""
    # First login
    t1 = _login("admin@care.local", "Admin@123")
    me1 = requests.get(f"{API}/auth/me", headers=_headers(t1), timeout=10).json()
    last1 = me1.get("last_login_at")
    assert last1 is not None

    # Second login (should bump last_login_at and set previous_login_at to last1)
    t2 = _login("admin@care.local", "Admin@123")
    me2 = requests.get(f"{API}/auth/me", headers=_headers(t2), timeout=10).json()
    assert me2.get("last_login_at") is not None
    # previous_login_at should be present (may be None on the very first time but should be set now)
    assert me2.get("previous_login_at") == last1
