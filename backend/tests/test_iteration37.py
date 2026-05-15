"""Iteration 37 — Cross-Module Pattern Intelligence + Strategy Meeting Pack + Action accountability."""
import os
import pytest
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def staff(): return _login("staff@care.local", "Staff@123")
@pytest.fixture(scope="module")
def senior(): return _login("senior@care.local", "Senior@123")
@pytest.fixture(scope="module")
def manager(): return _login("manager@care.local", "Manager@123")


@pytest.fixture(scope="module")
def child_resident_id(manager):
    r = requests.get(f"{API}/residents", params={"sector": "children"}, headers=manager)
    r.raise_for_status()
    items = r.json()
    assert items, "Need at least one children's resident seeded"
    return items[0]["id"]


# ----------------------- Cross-Module Pattern Intelligence -----------------------

def test_patterns_rbac(staff, senior, manager):
    assert requests.get(f"{API}/ofsted/cross-module-patterns", headers=staff).status_code == 403
    assert requests.get(f"{API}/ofsted/cross-module-patterns", headers=senior).status_code == 200
    assert requests.get(f"{API}/ofsted/cross-module-patterns", headers=manager).status_code == 200


def test_patterns_payload_shape(manager):
    d = requests.get(f"{API}/ofsted/cross-module-patterns", headers=manager).json()
    assert d["scope"] == "children"
    assert "generated_at" in d
    for key in [
        "recurring_themes", "repeat_concern_children", "escalation_trends",
        "unresolved_risks", "safeguarding_hotspots", "leadership_blind_spots",
    ]:
        assert key in d, f"missing key {key}"
    # escalation_trends
    et = d["escalation_trends"]
    assert "incidents" in et and "safeguarding" in et and "missing_episodes" in et
    for v in et.values():
        for k in ("this_week", "last_week", "delta"):
            assert k in v
            assert isinstance(v[k], int)
    # hotspots
    h = d["safeguarding_hotspots"]
    assert "locations" in h and "times_of_day" in h and "repeat_residents" in h
    # times_of_day always returns 4 windows
    assert len(h["times_of_day"]) == 4
    for tod in h["times_of_day"]:
        assert "window" in tod and "count" in tod and "pct" in tod


def test_patterns_repeat_concern_each_has_2_plus(manager):
    d = requests.get(f"{API}/ofsted/cross-module-patterns", headers=manager).json()
    for r in d["repeat_concern_children"]:
        assert r["count"] >= 2
        assert isinstance(r["concern_types"], list) and len(r["concern_types"]) >= 2
        assert r["name"]


# ----------------------- Strategy Meeting Pack PDF -----------------------

def test_strategy_pack_rbac(staff, senior, manager, child_resident_id):
    url = f"{API}/reports/strategy-meeting-pack/{child_resident_id}.pdf"
    assert requests.get(url, headers=staff).status_code == 403
    assert requests.get(url, headers=senior).status_code == 403
    r = requests.get(url, headers=manager)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert len(r.content) > 1500


def test_strategy_pack_404_on_unknown_resident(manager):
    r = requests.get(f"{API}/reports/strategy-meeting-pack/does-not-exist.pdf", headers=manager)
    assert r.status_code == 404


def test_strategy_pack_records_audit(manager, child_resident_id):
    requests.get(f"{API}/reports/strategy-meeting-pack/{child_resident_id}.pdf", headers=manager)
    r = requests.get(f"{API}/audit", params={"action": "strategy_meeting_pack_download"}, headers=manager)
    assert r.status_code == 200
    events = r.json().get("items", r.json()) if isinstance(r.json(), dict) else r.json()
    assert any(
        (e.get("object_id") == child_resident_id and "strategy_meeting_pack_download" in (e.get("action") or ""))
        for e in events
    ), "strategy meeting pack download was not audit-logged"


# ----------------------- Action Accountability -----------------------

def test_action_create_with_assignee_and_due_date(manager):
    # Create
    body = {
        "title": "Iter37 test action",
        "detail": "Verifying accountability fields",
        "priority": "high",
        "assigned_to_name": "Sarah Manager",
        "due_date": "2026-12-31",
    }
    r = requests.post(f"{API}/inspection-actions", json=body, headers=manager)
    assert r.status_code == 200
    a = r.json()
    assert a["assigned_to_name"] == "Sarah Manager"
    assert a["due_date"] == "2026-12-31"
    assert a["status"] == "open"
    # action_log present
    assert isinstance(a.get("action_log"), list) and len(a["action_log"]) >= 1
    aid = a["id"]

    # List returns it with is_overdue (false) and needs_escalation (false)
    rl = requests.get(f"{API}/inspection-actions", headers=manager).json()
    me = next((x for x in rl if x["id"] == aid), None)
    assert me is not None
    assert me["is_overdue"] is False
    assert me["needs_escalation"] is False

    # Reassign
    r2 = requests.patch(
        f"{API}/inspection-actions/{aid}",
        json={"assigned_to_name": "Mike Manager"},
        headers=manager,
    )
    assert r2.status_code == 200
    assert r2.json()["assigned_to_name"] == "Mike Manager"

    # Escalate
    r3 = requests.post(
        f"{API}/inspection-actions/{aid}/escalate",
        json={"escalated_to_name": "Registered Manager", "reason": "Overdue safeguarding action"},
        headers=manager,
    )
    assert r3.status_code == 200
    esc = r3.json()
    assert esc["escalated_at"] is not None
    assert esc["escalated_to_name"] == "Registered Manager"
    assert esc["escalation_reason"] == "Overdue safeguarding action"
    assert esc["priority"] == "high"

    # Resolve
    r4 = requests.patch(
        f"{API}/inspection-actions/{aid}",
        json={"status": "resolved", "resolution_notes": "Completed"},
        headers=manager,
    )
    assert r4.status_code == 200
    assert r4.json()["status"] == "resolved"
    assert r4.json()["resolved_at"]
    assert r4.json()["signed_off_at"] is None

    # Sign off
    r5 = requests.post(
        f"{API}/inspection-actions/{aid}/sign-off",
        json={"notes": "Manager evidence reviewed"},
        headers=manager,
    )
    assert r5.status_code == 200
    so = r5.json()
    assert so["signed_off_at"] is not None
    assert so["signed_off_by_name"]
    assert "Manager evidence reviewed" in (so.get("evidence_notes") or "")

    # Sign-off again should fail because the action is signed off; reopen reset path:
    r6 = requests.patch(
        f"{API}/inspection-actions/{aid}",
        json={"status": "open"},
        headers=manager,
    )
    assert r6.status_code == 200
    assert r6.json()["status"] == "open"
    assert r6.json()["signed_off_at"] is None
    assert r6.json()["resolved_at"] is None

    # Cleanup
    requests.delete(f"{API}/inspection-actions/{aid}", headers=manager)


def test_action_sign_off_requires_resolved(manager):
    body = {"title": "Iter37 unresolved", "priority": "low"}
    aid = requests.post(f"{API}/inspection-actions", json=body, headers=manager).json()["id"]
    r = requests.post(
        f"{API}/inspection-actions/{aid}/sign-off", json={}, headers=manager,
    )
    assert r.status_code == 400
    requests.delete(f"{API}/inspection-actions/{aid}", headers=manager)


def test_action_escalate_rbac(staff, senior, manager):
    aid = requests.post(
        f"{API}/inspection-actions",
        json={"title": "Iter37 esc-rbac", "priority": "medium"},
        headers=manager,
    ).json()["id"]
    payload = {"escalated_to_name": "X", "reason": "y"}
    # Staff blocked, senior blocked, manager allowed
    assert requests.post(f"{API}/inspection-actions/{aid}/escalate", json=payload, headers=staff).status_code == 403
    assert requests.post(f"{API}/inspection-actions/{aid}/escalate", json=payload, headers=senior).status_code == 403
    assert requests.post(f"{API}/inspection-actions/{aid}/escalate", json=payload, headers=manager).status_code == 200
    requests.delete(f"{API}/inspection-actions/{aid}", headers=manager)


def test_action_is_overdue_flag(manager):
    """Past due_date + active status ⇒ is_overdue=true."""
    aid = requests.post(
        f"{API}/inspection-actions",
        json={"title": "Iter37 overdue", "priority": "high", "due_date": "2020-01-01"},
        headers=manager,
    ).json()["id"]
    items = requests.get(f"{API}/inspection-actions", headers=manager).json()
    me = next(x for x in items if x["id"] == aid)
    assert me["is_overdue"] is True
    assert me["needs_escalation"] is True  # high priority + overdue + not yet escalated
    requests.delete(f"{API}/inspection-actions/{aid}", headers=manager)
