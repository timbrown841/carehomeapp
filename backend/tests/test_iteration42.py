"""Iteration 42 — Placement Stability Intelligence.

Deterministic, evidence-linked, supportive tone. Compares first 14 days
post-admission against latest 14 days. Surfaces risks AND protective factors.
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
def senior(): return _login("senior@care.local", "Senior@123")
@pytest.fixture(scope="module")
def manager(): return _login("manager@care.local", "Manager@123")
@pytest.fixture(scope="module")
def admin(): return _login("admin@care.local", "Admin@123")


@pytest.fixture(scope="module")
def some_resident(staff):
    r = requests.get(f"{API}/residents", headers=staff).json()
    assert r, "Need at least one resident"
    return r[0]


# -----------------------------------------------------------------
# RBAC
# -----------------------------------------------------------------
def test_per_child_endpoint_open_to_any_authed(staff, senior, manager, admin, some_resident):
    for hdr in (staff, senior, manager, admin):
        r = requests.get(f"{API}/placement-stability/resident/{some_resident['id']}", headers=hdr)
        assert r.status_code == 200


def test_emerging_concerns_manager_plus_only(staff, senior, manager, admin):
    assert requests.get(f"{API}/placement-stability/emerging-concerns", headers=staff).status_code == 403
    assert requests.get(f"{API}/placement-stability/emerging-concerns", headers=senior).status_code == 403
    assert requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).status_code == 200
    assert requests.get(f"{API}/placement-stability/emerging-concerns", headers=admin).status_code == 200


def test_per_child_404_unknown_id(manager):
    r = requests.get(f"{API}/placement-stability/resident/does-not-exist", headers=manager)
    assert r.status_code == 404


# -----------------------------------------------------------------
# Per-child shape
# -----------------------------------------------------------------
def test_per_child_payload_shape(manager, some_resident):
    d = requests.get(f"{API}/placement-stability/resident/{some_resident['id']}", headers=manager).json()
    for k in ("resident_id", "name", "status", "status_label", "trend_direction",
              "score", "risk_score", "protective_score",
              "risk_factors", "protective_factors", "signals",
              "suggested_actions", "explainable_note"):
        assert k in d, f"missing {k}"
    assert d["status"] in ("stabilising", "steady", "watch", "deteriorating", "critical", "new_placement")
    assert d["trend_direction"] in ("improving", "stable", "deteriorating")
    assert isinstance(d["risk_factors"], list)
    assert isinstance(d["protective_factors"], list)


def test_per_child_factor_shape(manager, some_resident):
    d = requests.get(f"{API}/placement-stability/resident/{some_resident['id']}", headers=manager).json()
    for f in d["risk_factors"] + d["protective_factors"]:
        for k in ("domain", "label", "weight", "evidence"):
            assert k in f
        assert isinstance(f["weight"], int)
        assert isinstance(f["evidence"], dict)


def test_per_child_signals_include_baseline_and_current(manager, some_resident):
    d = requests.get(f"{API}/placement-stability/resident/{some_resident['id']}", headers=manager).json()
    if d.get("signals"):
        for sig_name in ("incidents", "missing", "restraints", "safeguarding"):
            assert sig_name in d["signals"]
            assert "base" in d["signals"][sig_name]
            assert "curr" in d["signals"][sig_name]


# -----------------------------------------------------------------
# Determinism + score math
# -----------------------------------------------------------------
def test_per_child_deterministic(manager, some_resident):
    a = requests.get(f"{API}/placement-stability/resident/{some_resident['id']}", headers=manager).json()
    b = requests.get(f"{API}/placement-stability/resident/{some_resident['id']}", headers=manager).json()
    assert a["status"] == b["status"]
    assert a["score"] == b["score"]
    assert [f["label"] for f in a["risk_factors"]] == [f["label"] for f in b["risk_factors"]]
    assert [f["label"] for f in a["protective_factors"]] == [f["label"] for f in b["protective_factors"]]


def test_score_math_is_risk_minus_protective_clamped(manager, some_resident):
    d = requests.get(f"{API}/placement-stability/resident/{some_resident['id']}", headers=manager).json()
    expected_risk = sum(f["weight"] for f in d["risk_factors"])
    expected_prot = sum(f["weight"] for f in d["protective_factors"])
    assert d["risk_score"] == expected_risk
    assert d["protective_score"] == expected_prot
    assert d["score"] == max(0, expected_risk - expected_prot)


# -----------------------------------------------------------------
# Supportive tone (no punitive language)
# -----------------------------------------------------------------
def test_supportive_tone_in_labels(manager, some_resident):
    d = requests.get(f"{API}/placement-stability/resident/{some_resident['id']}", headers=manager).json()
    forbidden = ("at risk of breakdown", "failing", "bad child", "doomed", "lost cause", "hopeless")
    txt = (d.get("status_label", "") + " " + " ".join(a for a in d.get("suggested_actions", []))).lower()
    for w in forbidden:
        assert w not in txt


def test_status_labels_are_supportive(manager):
    """Org panel's status labels should all be supportive."""
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    for r in d.get("all_residents", []):
        assert r["status_label"] in (
            "Stabilising", "Steady", "Watching for early signs",
            "Support recommended", "Immediate review recommended", "Recently admitted",
        )


# -----------------------------------------------------------------
# Org panel
# -----------------------------------------------------------------
def test_org_panel_shape(manager):
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    for k in ("generated_at", "summary", "overall_status", "overall_label",
              "emerging_concerns", "stabilising_trends", "all_residents", "explainable_note"):
        assert k in d
    for k in ("critical", "deteriorating", "watch", "stabilising", "steady", "new_placement", "total"):
        assert k in d["summary"]


def test_org_panel_summary_counts_match(manager):
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    actual_counts = {"critical": 0, "deteriorating": 0, "watch": 0,
                     "stabilising": 0, "steady": 0, "new_placement": 0}
    for r in d["all_residents"]:
        actual_counts[r["status"]] += 1
    for k, v in actual_counts.items():
        assert d["summary"][k] == v, f"summary[{k}] = {d['summary'][k]} but actual {v}"
    assert d["summary"]["total"] == len(d["all_residents"])


def test_org_panel_concerns_sorted_by_severity(manager):
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    rank = {"critical": 0, "deteriorating": 1, "watch": 2}
    concerns = d["emerging_concerns"]
    for a, b in zip(concerns, concerns[1:]):
        assert rank[a["status"]] <= rank[b["status"]]


def test_org_panel_lite_rows_no_sensitive_fields(manager):
    """Lite rows for the org panel must not include 'signals' / 'risk_factors' (those are per-child only)."""
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    forbidden = {"risk_factors", "protective_factors", "signals", "suggested_actions"}
    for r in d["all_residents"]:
        leak = forbidden & set(r.keys())
        assert not leak, f"forbidden keys leaked into org panel: {leak}"


def test_org_panel_separates_stabilising_from_concerns(manager):
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    concern_statuses = {r["status"] for r in d["emerging_concerns"]}
    stab_statuses = {r["status"] for r in d["stabilising_trends"]}
    assert concern_statuses <= {"critical", "deteriorating", "watch"}
    assert stab_statuses <= {"stabilising"}


def test_explainable_note_present(manager, some_resident):
    d_child = requests.get(f"{API}/placement-stability/resident/{some_resident['id']}", headers=manager).json()
    assert "same data" in d_child["explainable_note"].lower()
    d_org = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    assert "deterministic" in d_org["explainable_note"].lower()
