"""Iteration 41d — Placement Conversion Analytics tile.

Lightweight, executive-style analytics derived purely from simulation_logs.
Manager+ only. Aggregate-only (no PII, no narrative, no initials in output).
"""
import os
import re
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
def admin(): return _login("admin@care.local", "Admin@123")


UNIQUE_TOKEN_ANALYTICS = "ZZZ_ANALYTICS_NARRATIVE_TOKEN_OMICRON_41D"


def _run_sim(manager, text="Test referral text"):
    return requests.post(f"{API}/placement-intelligence/simulate",
                          headers=manager, data={"raw_text": text}).json()


# -----------------------------------------------------------------
# RBAC
# -----------------------------------------------------------------
def test_analytics_rbac_manager_plus(staff, senior, manager, admin):
    assert requests.get(f"{API}/placement-intelligence/conversion-analytics", headers=staff).status_code == 403
    assert requests.get(f"{API}/placement-intelligence/conversion-analytics", headers=senior).status_code == 403
    assert requests.get(f"{API}/placement-intelligence/conversion-analytics", headers=manager).status_code == 200
    assert requests.get(f"{API}/placement-intelligence/conversion-analytics", headers=admin).status_code == 200


# -----------------------------------------------------------------
# Output shape
# -----------------------------------------------------------------
def test_analytics_payload_shape(manager):
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=30", headers=manager).json()
    for k in ("generated_at", "period_days", "period_start", "period_end",
              "totals", "outcomes", "outcomes_pct", "conversion_rate_pct",
              "risk_distribution", "confidence_distribution",
              "home_readiness_distribution", "averages",
              "weekly_pressure", "weekly_spikes", "out_of_hours", "privacy_notice"):
        assert k in d, f"missing {k}"
    assert d["period_days"] == 30
    for bucket in ("outcomes", "outcomes_pct"):
        for k in ("under_review", "more_info_requested", "converted", "not_progressed"):
            assert k in d[bucket]
    for k in ("low", "medium", "high", "critical"):
        assert k in d["risk_distribution"]
    for k in ("strong", "manageable", "elevated", "not_recommended"):
        assert k in d["confidence_distribution"]
    for k in ("good", "watch", "elevated", "high_risk"):
        assert k in d["home_readiness_distribution"]
    for k in ("avg_risk_score", "avg_risk_band", "avg_confidence", "avg_home_score"):
        assert k in d["averages"]


def test_analytics_period_clamped(manager):
    """days param must clamp to [7, 90]."""
    d1 = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=3", headers=manager).json()
    assert d1["period_days"] == 7
    d2 = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=999", headers=manager).json()
    assert d2["period_days"] == 90


def test_analytics_period_switching(manager):
    for d in (7, 30, 90):
        r = requests.get(f"{API}/placement-intelligence/conversion-analytics?days={d}", headers=manager).json()
        assert r["period_days"] == d
        assert len(r["weekly_pressure"]) == max(1, d // 7)


# -----------------------------------------------------------------
# Privacy boundary — the critical one
# -----------------------------------------------------------------
def test_analytics_never_leaks_narrative(manager):
    """Insert a unique narrative token via a simulation; confirm it never appears in analytics."""
    requests.post(
        f"{API}/placement-intelligence/simulate", headers=manager,
        data={"raw_text": f"Re: AB aged 14 male. CSE concerns. {UNIQUE_TOKEN_ANALYTICS}"},
    )
    txt = requests.get(f"{API}/placement-intelligence/conversion-analytics", headers=manager).text
    assert UNIQUE_TOKEN_ANALYTICS not in txt, "Narrative content must NEVER appear in analytics"


def test_analytics_never_leaks_initials_or_ids(manager):
    """No initials (yp_initials) or staff_id-style fields should appear in the analytics payload."""
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics", headers=manager).json()
    forbidden = {"yp_initials", "initials", "ran_by_id", "ran_by_name",
                 "raw_text", "needs", "known_associates", "social_worker_name",
                 "reason_for_referral", "manager_note", "simulation_id"}

    def _walk(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                assert k not in forbidden, f"forbidden key '{k}' present in analytics payload"
                _walk(v)
        elif isinstance(obj, list):
            for v in obj: _walk(v)
    _walk(d)


# -----------------------------------------------------------------
# Aggregation correctness
# -----------------------------------------------------------------
def test_analytics_aggregates_match_log(manager):
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=90", headers=manager).json()
    total = d["totals"]["simulations"]
    sum_out = sum(d["outcomes"].values())
    sum_risk = sum(d["risk_distribution"].values())
    sum_conf = sum(d["confidence_distribution"].values())
    assert sum_out == total
    assert sum_risk == total
    assert sum_conf == total
    # Outcomes pct should sum ~100 (or 0 if no data)
    if total > 0:
        assert abs(sum(d["outcomes_pct"].values()) - 100) < 0.5


def test_analytics_conversion_rate_match(manager):
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=90", headers=manager).json()
    total = d["totals"]["simulations"]
    converted = d["outcomes"]["converted"]
    if total > 0:
        expected = round((converted / total) * 100, 1)
        assert d["conversion_rate_pct"] == expected


def test_analytics_records_home_state_on_new_runs(manager):
    """Newly run simulations should record home_readiness_at_run for trend analytics."""
    sim = _run_sim(manager, "Newer test for trend GH aged 13 female")
    sim_id = sim["simulation_id"]
    items = requests.get(f"{API}/placement-intelligence/simulations?limit=20",
                         headers=manager).json()["items"]
    row = next((i for i in items if i["id"] == sim_id), None)
    assert row is not None
    # home_readiness_at_run should be one of the readiness statuses
    assert row.get("home_readiness_at_run") in ("good", "watch", "elevated", "high_risk", None)
    assert isinstance(row.get("home_score_at_run"), int)


# -----------------------------------------------------------------
# Out-of-hours + spikes shape
# -----------------------------------------------------------------
def test_analytics_out_of_hours_shape(manager):
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics", headers=manager).json()
    assert "count" in d["out_of_hours"]
    assert "pct" in d["out_of_hours"]
    assert isinstance(d["out_of_hours"]["count"], int)


def test_analytics_weekly_pressure_chronological(manager):
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=30",
                     headers=manager).json()
    weeks = d["weekly_pressure"]
    assert len(weeks) == 4
    for a, b in zip(weeks, weeks[1:]):
        assert a["week_start"] < b["week_start"]


def test_analytics_privacy_notice_present(manager):
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics", headers=manager).json()
    assert "privacy_notice" in d
    assert re.search(r"aggregate", d["privacy_notice"], re.IGNORECASE)
