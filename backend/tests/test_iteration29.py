"""Iteration 29 — Sector-aware operational summary tests."""
import os
import requests

API = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _residents(t):
    return requests.get(f"{API}/residents", headers=_h(t)).json()


def test_summary_children_sector_widgets():
    t = _login("staff@care.local", "Staff@123")
    residents = _residents(t)
    children = [r for r in residents if (r.get("service_type") or "children") == "children"]
    assert children, "Expected at least one children's resident in seed"
    rid = children[0]["id"]
    r = requests.get(f"{API}/residents/{rid}/operational-summary", headers=_h(t))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["sector"] == "children"
    assert d["resident_id"] == rid
    widget_ids = {w["id"] for w in d["widgets"]}
    # Children-specific widgets must be present
    for must in ["safeguarding_14d", "incidents_7d", "missing_30d",
                 "body_maps_30d", "ri_outstanding", "key_work_last"]:
        assert must in widget_ids, f"Missing children widget: {must}"
    # Adult-specific widgets must NOT be present
    for must_not in ["active_meds", "appt_next_7d", "falls_30d", "mca_status"]:
        assert must_not not in widget_ids, f"Adult widget leaked: {must_not}"


def test_summary_adult_sector_widgets():
    t = _login("staff@care.local", "Staff@123")
    residents = _residents(t)
    adults = [r for r in residents if r.get("service_type") in
              ("adult_supported_living", "elderly_residential", "dementia", "mental_health", "veteran")]
    assert adults, "Expected at least one adult-sector resident"
    rid = adults[0]["id"]
    r = requests.get(f"{API}/residents/{rid}/operational-summary", headers=_h(t))
    assert r.status_code == 200
    d = r.json()
    assert d["sector"] == "adult"
    widget_ids = {w["id"] for w in d["widgets"]}
    for must in ["active_meds", "med_refusals_14d", "appt_next_7d",
                 "falls_30d", "mca_status", "observations_7d"]:
        assert must in widget_ids, f"Missing adult widget: {must}"
    for must_not in ["missing_30d", "ri_outstanding", "key_work_last", "body_maps_30d"]:
        assert must_not not in widget_ids, f"Children widget leaked: {must_not}"


def test_summary_widget_shape():
    """Every widget has the standard operational fields used by the frontend."""
    t = _login("staff@care.local", "Staff@123")
    residents = _residents(t)
    rid = residents[0]["id"]
    r = requests.get(f"{API}/residents/{rid}/operational-summary", headers=_h(t)).json()
    for w in r["widgets"]:
        for k in ["id", "title", "value", "sublabel", "severity", "icon", "tab"]:
            assert k in w, f"Widget {w.get('id')} missing field: {k}"
        assert w["severity"] in ("low", "medium", "high", "urgent")


def test_summary_active_missing_alert():
    """If there's an open missing episode, the alerts list should include 'currently_missing'."""
    t = _login("staff@care.local", "Staff@123")
    residents = _residents(t)
    children = [r for r in residents if (r.get("service_type") or "children") == "children"]
    # Find any resident with an open missing episode (Maddy demo data has one)
    found_with_alert = False
    for c in children:
        rid = c["id"]
        miss = requests.get(f"{API}/residents/{rid}/missing", headers=_h(t)).json()
        open_eps = [m for m in miss if not m.get("returned_at")]
        if not open_eps:
            continue
        s = requests.get(f"{API}/residents/{rid}/operational-summary", headers=_h(t)).json()
        alert_ids = [a["id"] for a in s["alerts"]]
        assert "currently_missing" in alert_ids, f"Open episode but no currently_missing alert: {alert_ids}"
        # urgent severity for currently_missing
        ca = next(a for a in s["alerts"] if a["id"] == "currently_missing")
        assert ca["severity"] == "urgent"
        found_with_alert = True
        break
    # If no demo resident is currently missing, that's also valid — just skip
    if not found_with_alert:
        import pytest
        pytest.skip("No demo resident currently missing")


def test_summary_unknown_resident_404():
    t = _login("staff@care.local", "Staff@123")
    r = requests.get(f"{API}/residents/00000000-fake-fake-fake-000000000000/operational-summary",
                     headers=_h(t))
    assert r.status_code == 404


def test_summary_auth_required():
    residents_path = "/residents/anything/operational-summary"
    r = requests.get(f"{API}{residents_path}")
    assert r.status_code == 401
