"""Iteration 41e — Local Authority breakdown inside Placement Analytics.

Aggregate-only commissioning intelligence. Tests that:
  - LA is captured on each simulation log when present in referral text/overrides.
  - Per-LA aggregates compute correctly (volume, conversion, modal confidence, OOH).
  - Privacy: no child-level data, no narrative, no initials.
  - Tone: neutral insight lines (never punitive labels).
"""
import os
import re
import json
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
@pytest.fixture(scope="module")
def admin(): return _login("admin@care.local", "Admin@123")


UNIQUE_TOKEN_LA = "ZZZ_LA_LEAK_TOKEN_OMICRON_41E"


def _seed(manager, la, text_extra=""):
    return requests.post(
        f"{API}/placement-intelligence/simulate", headers=manager,
        data={"raw_text": f"Re: ZZ aged 14 male. Local Authority: {la}. {text_extra}"},
    ).json()["simulation_id"]


# -----------------------------------------------------------------
# Capture
# -----------------------------------------------------------------
def test_la_captured_on_simulation_log(manager):
    sim_id = _seed(manager, "Camden")
    items = requests.get(f"{API}/placement-intelligence/simulations?limit=20",
                         headers=manager).json()["items"]
    row = next((i for i in items if i["id"] == sim_id), None)
    assert row is not None
    assert row.get("local_authority") == "Camden"


def test_la_captured_from_overrides(manager):
    r = requests.post(
        f"{API}/placement-intelligence/simulate", headers=manager,
        data={"overrides_json": json.dumps({"yp_initials": "OV", "local_authority": "Westminster"})},
    ).json()
    sim_id = r["simulation_id"]
    items = requests.get(f"{API}/placement-intelligence/simulations?limit=20",
                         headers=manager).json()["items"]
    row = next((i for i in items if i["id"] == sim_id), None)
    assert row["local_authority"] == "Westminster"


# -----------------------------------------------------------------
# Aggregation
# -----------------------------------------------------------------
def test_la_breakdown_present_in_analytics(manager):
    _seed(manager, "Camden")
    _seed(manager, "Camden")
    _seed(manager, "Barnet")
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=90",
                     headers=manager).json()
    assert "local_authorities" in d
    names = [la["local_authority"] for la in d["local_authorities"]]
    assert "Camden" in names
    assert "Barnet" in names


def test_la_breakdown_fields(manager):
    _seed(manager, "Hackney")
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=90",
                     headers=manager).json()
    for la in d["local_authorities"]:
        for k in ("local_authority", "simulations", "converted",
                  "more_info_requested", "not_progressed", "under_review",
                  "conversion_rate_pct", "more_info_rate_pct",
                  "not_progressed_rate_pct", "out_of_hours", "out_of_hours_pct",
                  "avg_risk_score", "avg_risk_band", "modal_confidence", "insight"):
            assert k in la, f"missing {k}"
        # No PII/narrative fields
        for forbidden in ("yp_initials", "initials", "raw_text", "narrative",
                          "needs", "known_associates", "social_worker_name"):
            assert forbidden not in la
        assert la["avg_risk_band"] in ("low", "medium", "high", "critical")
        assert la["modal_confidence"] in ("strong", "manageable", "elevated", "not_recommended")


def test_la_breakdown_sorted_by_volume(manager):
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=90",
                     headers=manager).json()
    las = d["local_authorities"]
    for a, b in zip(las, las[1:]):
        assert a["simulations"] >= b["simulations"]


def test_la_breakdown_top_10_cap(manager):
    """Seed 12 distinct LAs and confirm the response caps at 10."""
    for la in ["LA1", "LA2", "LA3", "LA4", "LA5", "LA6", "LA7", "LA8", "LA9", "LA10", "LA11", "LA12"]:
        _seed(manager, la)
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=90",
                     headers=manager).json()
    assert len(d["local_authorities"]) <= 10


def test_la_conversion_math(manager, admin):
    """Convert two of three sims for a unique LA and verify conversion_rate matches."""
    import random, string
    unique_la = "Test" + "".join(random.choices(string.ascii_letters, k=10))
    ids = [_seed(manager, unique_la) for _ in range(3)]
    # Convert two via /simulate/save
    converted_referral_ids: list[str] = []
    for sid in ids[:2]:
        r = requests.post(
            f"{API}/placement-intelligence/simulate/save?simulation_id={sid}",
            headers=manager, json={"yp_initials": "ZZ"},
        ).json()
        converted_referral_ids.append(r["id"])

    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=90",
                     headers=manager).json()
    row = next((la for la in d["local_authorities"] if la["local_authority"] == unique_la), None)
    assert row is not None
    assert row["simulations"] == 3
    assert row["converted"] == 2
    assert row["conversion_rate_pct"] == round((2 / 3) * 100, 1)

    # cleanup
    for rid in converted_referral_ids:
        requests.delete(f"{API}/referrals/{rid}", headers=admin)


# -----------------------------------------------------------------
# Privacy
# -----------------------------------------------------------------
def test_la_breakdown_no_narrative_leak(manager):
    requests.post(
        f"{API}/placement-intelligence/simulate", headers=manager,
        data={"raw_text": f"Re: AB aged 14 male. Local Authority: Newham. CSE concerns. {UNIQUE_TOKEN_LA}"},
    )
    txt = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=90",
                       headers=manager).text
    assert UNIQUE_TOKEN_LA not in txt


def test_la_breakdown_rbac(staff, manager):
    """LA breakdown lives inside the analytics endpoint — RBAC already covered, but confirm staff can't reach it."""
    r = requests.get(f"{API}/placement-intelligence/conversion-analytics", headers=staff)
    assert r.status_code == 403


def test_la_insight_tone_is_neutral(manager):
    """Insight strings must not include punitive/judgemental words."""
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=90",
                     headers=manager).json()
    for la in d["local_authorities"]:
        ins = la["insight"].lower()
        for punitive in ("bad", "poor", "failing", "incompetent", "blame", "fault"):
            assert punitive not in ins, f"punitive word '{punitive}' in: {ins}"


def test_simulations_without_la_excluded_from_breakdown(manager):
    """Simulations with no local authority must not create a 'None' or '' entry."""
    # Run a sim with no LA in text
    requests.post(f"{API}/placement-intelligence/simulate", headers=manager,
                  data={"raw_text": "Quick check — no LA captured here"})
    d = requests.get(f"{API}/placement-intelligence/conversion-analytics?days=90",
                     headers=manager).json()
    for la in d["local_authorities"]:
        assert la["local_authority"] not in (None, "", "None", "null")
