"""Regulation 44 operational intelligence tests (Iteration 35)."""
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


def test_regulation_44_requires_senior(staff, senior):
    assert requests.get(f"{API}/ofsted/regulation-44", headers=staff).status_code == 403
    assert requests.get(f"{API}/ofsted/regulation-44", headers=senior).status_code == 200


def test_regulation_44_payload_shape(manager):
    r = requests.get(f"{API}/ofsted/regulation-44", headers=manager)
    assert r.status_code == 200
    d = r.json()
    assert d["scope"] == "children"
    assert d["module_count"] == 40, f"Expected 40 modules, got {d['module_count']}"
    assert d["live_count"] + d["manual_count"] == 40
    # 8 categories
    assert len(d["categories"]) == 8
    for c in d["categories"]:
        assert c["rag"] in ("green", "amber", "red")
        assert c["rating"]["label"] in {"Outstanding", "Good", "Requires improvement", "Inadequate"}
        for m in c["modules"]:
            assert m["mode"] in ("live", "manual")
            assert m["rag"] in ("green", "amber", "red")
            assert 0 <= m["score"] <= 100
            assert isinstance(m["indicators"], list)
            assert isinstance(m["overdue_actions"], list)
            assert isinstance(m["regulation_refs"], list) and len(m["regulation_refs"]) >= 1
            assert isinstance(m["quality_standards"], list) and len(m["quality_standards"]) >= 1
    # Quality Standards legend
    qs = d["quality_standards_legend"]
    assert {"QS1", "QS5", "QS7", "QS8", "QS9"}.issubset(qs.keys())


def test_regulation_44_live_module_categories(manager):
    """Live modules must include the operationally critical ones."""
    d = requests.get(f"{API}/ofsted/regulation-44", headers=manager).json()
    live_ids = set()
    for c in d["categories"]:
        for m in c["modules"]:
            if m["mode"] == "live":
                live_ids.add(m["id"])
    # Spot-check the most operationally important live modules
    must_live = {
        "safeguarding_audit", "missing_from_care", "risk_assessment", "restraint",
        "medication", "supervision", "training_development", "education",
        "keywork", "action_plan", "incidents_accidents",
    }
    assert must_live.issubset(live_ids), f"Missing live: {must_live - live_ids}"


def test_regulation_44_excludes_adult_data(manager):
    """No adult residents should appear in overdue_actions or indicators."""
    d = requests.get(f"{API}/ofsted/regulation-44", headers=manager).json()
    for c in d["categories"]:
        for m in c["modules"]:
            joined = " ".join(a.get("title", "") + a.get("subtitle", "") for a in m.get("overdue_actions", []))
            assert "Tom Whitfield" not in joined
            assert "Margaret Lewis" not in joined


def test_reg44_notes_upsert_manager_only(senior, manager):
    # Senior cannot upsert
    bad = requests.post(f"{API}/ofsted/regulation-44/notes", headers=senior,
                        json={"module_id": "online_safety", "note": "Filtering reviewed."})
    assert bad.status_code == 403
    # Manager can
    ok = requests.post(f"{API}/ofsted/regulation-44/notes", headers=manager,
                       json={"module_id": "online_safety", "note": "Filtering reviewed."})
    assert ok.status_code == 200, ok.text
    # Bad module_id
    bad2 = requests.post(f"{API}/ofsted/regulation-44/notes", headers=manager,
                         json={"module_id": "fake_module_xyz", "note": "x"})
    assert bad2.status_code == 400


def test_reg44_notes_surface_in_payload(manager):
    requests.post(f"{API}/ofsted/regulation-44/notes", headers=manager,
                  json={"module_id": "equality_diversity", "note": "E&D reviewed Feb 2026 — actions logged."})
    d = requests.get(f"{API}/ofsted/regulation-44", headers=manager).json()
    found = False
    for c in d["categories"]:
        for m in c["modules"]:
            if m["id"] == "equality_diversity":
                assert m["manual_note"]
                assert m["manual_note_by"]
                assert m["rag"] == "green"  # has note → green
                found = True
    assert found


def test_reg44_visits_crud(senior, manager):
    # Senior can list, cannot create
    assert requests.get(f"{API}/ofsted/regulation-44/visits", headers=senior).status_code == 200
    bad = requests.post(f"{API}/ofsted/regulation-44/visits", headers=senior, json={
        "visit_date": "2026-02-10", "visitor_name": "x", "overall_judgement": "good",
    })
    assert bad.status_code == 403
    # Manager creates
    r = requests.post(f"{API}/ofsted/regulation-44/visits", headers=manager, json={
        "visit_date": "2026-02-10",
        "visitor_name": "Sarah Independent",
        "overall_judgement": "good",
        "strengths": "Strong key work practice.",
        "recommendations": "Refresh medication competency assessments by April.",
    })
    assert r.status_code == 200, r.text
    vid = r.json()["id"]
    # Latest visit appears in payload
    d = requests.get(f"{API}/ofsted/regulation-44", headers=manager).json()
    assert d["latest_visit"]["id"] == vid
    # Manager deletes (senior cannot)
    bd = requests.delete(f"{API}/ofsted/regulation-44/visits/{vid}", headers=senior)
    assert bd.status_code == 403
    ok = requests.delete(f"{API}/ofsted/regulation-44/visits/{vid}", headers=manager)
    assert ok.status_code == 200


def test_reg44_unauth():
    assert requests.get(f"{API}/ofsted/regulation-44").status_code == 401
