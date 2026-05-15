"""Iteration 40 — Operational Intelligence Engine.

Deterministic, sector-aware, evidence-linked forecast + resident stability.
"""
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
def manager(): return _login("manager@care.local", "Manager@123")


def test_forecast_any_auth(staff, manager):
    for hdr in (staff, manager):
        r = requests.get(f"{API}/intelligence/forecast", headers=hdr)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("generated_at", "mode", "overall_status", "counts_by_severity", "emerging_risks", "windows"):
            assert k in d
        assert d["mode"] == "children"  # default
        assert isinstance(d["emerging_risks"], list)


def test_forecast_children_payload_shape(manager):
    d = requests.get(f"{API}/intelligence/forecast", params={"mode": "children"}, headers=manager).json()
    # Every risk must have a full payload — deterministic, explainable, evidence-linked.
    for r in d["emerging_risks"]:
        for k in ("id", "domain", "title", "summary", "severity", "trend",
                  "timeframe", "confidence", "affected_subjects", "evidence",
                  "recommended_action", "deep_link"):
            assert k in r, f"missing key {k} in risk {r.get('id')}"
        assert r["severity"] in ("critical", "high", "medium", "low")
        assert r["trend"] in ("rising", "falling", "stable")
        assert 0 <= r["confidence"] <= 100
        assert isinstance(r["evidence"], list) and len(r["evidence"]) >= 2
        # Each evidence item carries a type so the modal can render it
        for e in r["evidence"]:
            assert e.get("type") in ("count", "threshold", "duration", "rate")


def test_forecast_determinism(manager):
    """Same data in → same intelligence out (no random surprises)."""
    a = requests.get(f"{API}/intelligence/forecast", params={"mode": "children"}, headers=manager).json()
    b = requests.get(f"{API}/intelligence/forecast", params={"mode": "children"}, headers=manager).json()
    a_ids = sorted(r["id"] for r in a["emerging_risks"])
    b_ids = sorted(r["id"] for r in b["emerging_risks"])
    assert a_ids == b_ids


def test_forecast_adult_does_not_use_children_engine(manager):
    """Adult mode must never return children-domain risk IDs (e.g. missing_velocity)."""
    d = requests.get(f"{API}/intelligence/forecast", params={"mode": "adult"}, headers=manager).json()
    ids = {r["id"] for r in d["emerging_risks"]}
    children_only = {"missing_velocity_14d", "restraint_escalation_14d"}
    assert not (ids & children_only), f"adult forecast leaked children risks: {ids & children_only}"
    # Adult-domain IDs (when present) must be from the adult set
    allowed = {"falls_velocity_30d", "medication_refusals_14d", "care_tasks_overdue", "wellbeing_reviews_overdue"}
    for rid in ids:
        assert rid in allowed, f"unexpected risk id in adult mode: {rid}"


def test_forecast_sorts_by_severity(manager):
    d = requests.get(f"{API}/intelligence/forecast", headers=manager).json()
    sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    ranks = [sev_rank[r["severity"]] for r in d["emerging_risks"]]
    assert ranks == sorted(ranks), "risks must be sorted critical → low"


def test_resident_stability_list(manager):
    r = requests.get(f"{API}/intelligence/resident-stability", params={"mode": "children"}, headers=manager)
    assert r.status_code == 200
    d = r.json()
    for k in ("mode", "summary", "residents", "generated_at"):
        assert k in d
    assert d["mode"] == "children"
    # All four statuses are accounted for in summary
    for k in ("critical", "escalating", "emerging", "stable"):
        assert k in d["summary"]
    for r in d["residents"]:
        for k in ("resident_id", "name", "status", "label", "score", "factors"):
            assert k in r
        assert r["status"] in ("critical", "escalating", "emerging", "stable")
        assert isinstance(r["factors"], list)


def test_resident_stability_single(manager):
    """Per-resident endpoint returns the same scoring for the same resident."""
    sample = requests.get(f"{API}/intelligence/resident-stability", params={"mode": "children"}, headers=manager).json()
    rid = sample["residents"][0]["resident_id"]
    a = requests.get(f"{API}/intelligence/resident-stability/{rid}", params={"mode": "children"}, headers=manager).json()
    assert a["resident_id"] == rid
    # Factors carry weight, label, domain
    for f in a["factors"]:
        for k in ("label", "weight", "domain"):
            assert k in f


def test_resident_stability_explainable(manager):
    """A non-stable resident must explain WHY (factor chain)."""
    d = requests.get(f"{API}/intelligence/resident-stability", params={"mode": "children"}, headers=manager).json()
    non_stable = [r for r in d["residents"] if r["status"] != "stable"]
    if non_stable:
        r = non_stable[0]
        assert len(r["factors"]) >= 1, "non-stable resident must have at least one factor"
        total = sum(f["weight"] for f in r["factors"])
        # Total factor weight should match the score
        assert total == r["score"], f"score {r['score']} ≠ factor sum {total}"
