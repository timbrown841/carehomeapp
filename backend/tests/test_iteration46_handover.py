"""Phase F.4 — Manager Handover Digest.

Aggregate executive summary across safeguarding, missing, incidents,
placement stability, staffing, compliance, child spotlight, and manager
actions. PDF export with audit log.
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


# -----------------------------------------------------------------
# RBAC
# -----------------------------------------------------------------
def test_digest_manager_plus_only(staff, senior, manager, admin):
    assert requests.get(f"{API}/handover/digest", headers=staff).status_code == 403
    assert requests.get(f"{API}/handover/digest", headers=senior).status_code == 403
    assert requests.get(f"{API}/handover/digest", headers=manager).status_code == 200
    assert requests.get(f"{API}/handover/digest", headers=admin).status_code == 200


def test_pdf_manager_plus_only(staff, manager):
    assert requests.get(f"{API}/handover/digest.pdf", headers=staff).status_code == 403
    r = requests.get(f"{API}/handover/digest.pdf", headers=manager)
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")
    assert r.headers["content-type"] == "application/pdf"


# -----------------------------------------------------------------
# Period validation
# -----------------------------------------------------------------
def test_periods_supported(manager):
    for p in ("shift", "week", "month"):
        r = requests.get(f"{API}/handover/digest?period={p}", headers=manager)
        assert r.status_code == 200, f"period={p} failed"
        assert r.json()["period"] == p


def test_bad_period_rejected(manager):
    assert requests.get(f"{API}/handover/digest?period=bogus", headers=manager).status_code == 400
    assert requests.get(f"{API}/handover/digest.pdf?period=lifetime", headers=manager).status_code == 400


# -----------------------------------------------------------------
# Shape — all 9 expected sections present
# -----------------------------------------------------------------
def test_digest_has_all_sections(manager):
    d = requests.get(f"{API}/handover/digest?period=week", headers=manager).json()
    for k in (
        "generated_at", "generated_by", "period", "period_label",
        "period_start", "period_end",
        "safeguarding", "missing", "incidents", "placement_stability",
        "home_intelligence", "staffing", "compliance", "child_spotlight",
        "manager_actions", "explainable_note",
    ):
        assert k in d, f"missing section {k}"


def test_safeguarding_shape(manager):
    d = requests.get(f"{API}/handover/digest", headers=manager).json()
    for k in ("new_count", "open_count", "closed_count", "escalated_count", "reg40_count"):
        assert k in d["safeguarding"]
        assert isinstance(d["safeguarding"][k], int)


def test_missing_shape(manager):
    d = requests.get(f"{API}/handover/digest", headers=manager).json()
    m = d["missing"]
    for k in ("episodes_count", "outstanding_interviews", "repeat_count", "top_affected"):
        assert k in m
    assert isinstance(m["top_affected"], list)


def test_incidents_shape(manager):
    d = requests.get(f"{API}/handover/digest", headers=manager).json()
    inc = d["incidents"]
    for k in ("physical_count", "high_risk_count", "police_count", "damage_count", "patterns"):
        assert k in inc


def test_placement_shape(manager):
    d = requests.get(f"{API}/handover/digest", headers=manager).json()
    p = d["placement_stability"]
    for k in ("improving", "deteriorating", "new_concerns", "improving_count", "deteriorating_count"):
        assert k in p


def test_staffing_shape(manager):
    d = requests.get(f"{API}/handover/digest", headers=manager).json()
    s = d["staffing"]
    for k in ("sickness_count", "agency_count", "burnout_alerts", "burnout_alert_count", "shifts_count"):
        assert k in s


def test_compliance_shape(manager):
    d = requests.get(f"{API}/handover/digest", headers=manager).json()
    c = d["compliance"]
    for k in ("overdue_supervisions", "expiring_dbs", "expired_training",
              "scr_red_count", "scr_amber_count", "scr_green_count", "open_actions"):
        assert k in c


def test_spotlight_shape(manager):
    d = requests.get(f"{API}/handover/digest", headers=manager).json()
    sp = d["child_spotlight"]
    for k in ("most_improved", "highest_concern", "review_required"):
        assert k in sp
    # Each, if present, must have why + recommended_action
    for k in ("most_improved", "highest_concern", "review_required"):
        if sp[k]:
            assert "why" in sp[k]
            assert "recommended_action" in sp[k]


def test_manager_actions_shape(manager):
    d = requests.get(f"{API}/handover/digest", headers=manager).json()
    a = d["manager_actions"]
    for k in ("urgent", "due_today", "overdue", "awaiting_signoff",
              "safeguarding_actions", "total"):
        assert k in a
        if k != "total":
            assert isinstance(a[k], list)


def test_home_intelligence_shape(manager):
    d = requests.get(f"{API}/handover/digest", headers=manager).json()
    hi = d["home_intelligence"]
    for k in ("alerts", "recommendations", "positives"):
        assert k in hi
        assert isinstance(hi[k], list)


# -----------------------------------------------------------------
# Determinism
# -----------------------------------------------------------------
def test_digest_deterministic(manager):
    a = requests.get(f"{API}/handover/digest?period=week", headers=manager).json()
    b = requests.get(f"{API}/handover/digest?period=week", headers=manager).json()
    # Counts must match
    assert a["safeguarding"] == b["safeguarding"]
    assert a["missing"]["episodes_count"] == b["missing"]["episodes_count"]
    assert a["incidents"] == b["incidents"]
    assert a["compliance"] == b["compliance"]


# -----------------------------------------------------------------
# Period covers different durations
# -----------------------------------------------------------------
def test_period_durations(manager):
    shift = requests.get(f"{API}/handover/digest?period=shift", headers=manager).json()
    week = requests.get(f"{API}/handover/digest?period=week", headers=manager).json()
    month = requests.get(f"{API}/handover/digest?period=month", headers=manager).json()
    # period_start should be earlier for longer periods
    assert shift["period_start"] > week["period_start"] > month["period_start"]


# -----------------------------------------------------------------
# generated_by reflects current user
# -----------------------------------------------------------------
def test_generated_by_reflects_user(manager, admin):
    m = requests.get(f"{API}/handover/digest", headers=manager).json()
    a = requests.get(f"{API}/handover/digest", headers=admin).json()
    assert m["generated_by"] and a["generated_by"]
    # Names should differ between manager and admin
    assert m["generated_by"] != a["generated_by"]


# -----------------------------------------------------------------
# Auth required
# -----------------------------------------------------------------
def test_digest_requires_auth():
    assert requests.get(f"{API}/handover/digest").status_code in (401, 403)
    assert requests.get(f"{API}/handover/digest.pdf").status_code in (401, 403)
