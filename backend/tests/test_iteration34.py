"""Tests for Ofsted Command Centre + Inspection Actions (Iteration 34)."""
import os
import pytest
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") + "/api"
assert API


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["token"]


@pytest.fixture(scope="module")
def staff():
    return {"Authorization": f"Bearer {_login('staff@care.local', 'Staff@123')}"}


@pytest.fixture(scope="module")
def senior():
    return {"Authorization": f"Bearer {_login('senior@care.local', 'Senior@123')}"}


@pytest.fixture(scope="module")
def manager():
    return {"Authorization": f"Bearer {_login('manager@care.local', 'Manager@123')}"}


def test_command_centre_requires_senior_plus(staff, senior, manager):
    assert requests.get(f"{API}/ofsted/command-centre", headers=staff).status_code == 403
    assert requests.get(f"{API}/ofsted/command-centre", headers=senior).status_code == 200
    assert requests.get(f"{API}/ofsted/command-centre", headers=manager).status_code == 200


def test_command_centre_payload_shape(manager):
    r = requests.get(f"{API}/ofsted/command-centre", headers=manager)
    assert r.status_code == 200
    d = r.json()
    assert d["scope"] == "children"
    # 10 domains
    domain_ids = {x["id"] for x in d["domains"]}
    expected = {
        "safeguarding", "missing", "health_medication", "education", "documentation",
        "staffing", "home_environment", "key_work", "compliance", "resident_voice",
    }
    assert expected.issubset(domain_ids)
    for x in d["domains"]:
        assert 0 <= x["score"] <= 100
        assert x["rating"]["label"] in {"Outstanding", "Good", "Requires improvement", "Inadequate"}
        assert x["severity"] in {"low", "medium", "high"}
    # Overall is computed
    assert 0 <= d["overall"] <= 100
    # Safeguarding overview keys
    sg = d["safeguarding_overview"]
    for k in ("open_safeguarding", "currently_missing", "restraint_30d",
              "self_harm_30d", "police_30d", "pattern_alerts", "recent_escalations"):
        assert k in sg
    # Critical actions sorted by severity descending (high before medium before low)
    sev_seen = [a["severity"] for a in d["critical_actions"]]
    order_map = {"high": 0, "medium": 1, "low": 2}
    for i in range(1, len(sev_seen)):
        assert order_map[sev_seen[i - 1]] <= order_map[sev_seen[i]], "actions not sorted"


def test_command_centre_excludes_adult_residents(manager):
    d = requests.get(f"{API}/ofsted/command-centre", headers=manager).json()
    # No Tom or Margaret in attention list
    names = [r["name"] for r in d["residents_attention"]]
    assert "Tom" not in " ".join(names)
    assert "Maggie" not in " ".join(names)
    # Safeguarding recent_escalations also children-only
    for e in d["safeguarding_overview"]["recent_escalations"]:
        assert "Tom Whitfield" not in (e.get("resident_name") or "")
        assert "Margaret Lewis" not in (e.get("resident_name") or "")


def test_inspection_actions_crud(manager, senior, staff):
    # Staff cannot list (senior+ required)
    assert requests.get(f"{API}/inspection-actions", headers=staff).status_code == 403
    # Manager creates
    payload = {"title": "Test action", "detail": "Practice run", "priority": "high"}
    r = requests.post(f"{API}/inspection-actions", headers=manager, json=payload)
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    # Senior can update status to resolved
    rr = requests.patch(f"{API}/inspection-actions/{aid}", headers=senior,
                        json={"status": "resolved", "resolution_notes": "Done."})
    assert rr.status_code == 200
    assert rr.json()["status"] == "resolved"
    assert rr.json()["resolved_at"] is not None
    # Manager can delete (senior cannot)
    bad = requests.delete(f"{API}/inspection-actions/{aid}", headers=senior)
    assert bad.status_code == 403
    ok = requests.delete(f"{API}/inspection-actions/{aid}", headers=manager)
    assert ok.status_code == 200


def test_inspection_actions_reopen_clears_resolution(manager):
    a = requests.post(f"{API}/inspection-actions", headers=manager,
                      json={"title": "Reopen test", "priority": "medium"}).json()
    aid = a["id"]
    requests.patch(f"{API}/inspection-actions/{aid}", headers=manager, json={"status": "resolved"})
    re = requests.patch(f"{API}/inspection-actions/{aid}", headers=manager, json={"status": "open"})
    assert re.status_code == 200
    assert re.json()["status"] == "open"
    assert re.json()["resolved_at"] is None
    requests.delete(f"{API}/inspection-actions/{aid}", headers=manager)


def test_command_centre_includes_recently_resolved(manager):
    a = requests.post(f"{API}/inspection-actions", headers=manager,
                      json={"title": "Quick win", "priority": "low"}).json()
    requests.patch(f"{API}/inspection-actions/{a['id']}", headers=manager, json={"status": "resolved"})
    d = requests.get(f"{API}/ofsted/command-centre", headers=manager).json()
    ids = [r["id"] for r in d["recently_resolved"]]
    assert a["id"] in ids
    requests.delete(f"{API}/inspection-actions/{a['id']}", headers=manager)


def test_command_centre_unauth():
    assert requests.get(f"{API}/ofsted/command-centre").status_code == 401
