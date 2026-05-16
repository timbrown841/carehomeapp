"""Iteration 42b — Placement Stability Trajectory.

Longitudinal weekly stability score series. Deterministic, evidence-linked,
supportive tone. Reuses the snapshot's factor engine.
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
    r = requests.get(f"{API}/residents?sector=children", headers=staff).json()
    assert r, "Need at least one children's resident"
    return r[0]


VALID_TRAJ_LABELS = {
    "stabilising", "improving", "steady", "fluctuating",
    "deteriorating", "insufficient_data", "no_admission",
}


# -----------------------------------------------------------------
# RBAC — trajectory is per-child, open to any authenticated user
# -----------------------------------------------------------------
def test_trajectory_open_to_any_authed(staff, senior, manager, admin, some_resident):
    rid = some_resident["id"]
    for hdr in (staff, senior, manager, admin):
        r = requests.get(f"{API}/placement-stability/trajectory/{rid}", headers=hdr)
        assert r.status_code == 200, f"trajectory blocked for {hdr}"


def test_trajectory_404_unknown(manager):
    r = requests.get(f"{API}/placement-stability/trajectory/does-not-exist", headers=manager)
    assert r.status_code == 404


def test_trajectory_requires_auth():
    r = requests.get(f"{API}/placement-stability/trajectory/anything")
    assert r.status_code in (401, 403)


# -----------------------------------------------------------------
# Payload shape
# -----------------------------------------------------------------
def test_trajectory_payload_shape(manager, some_resident):
    rid = some_resident["id"]
    r = requests.get(f"{API}/placement-stability/trajectory/{rid}", headers=manager)
    assert r.status_code == 200
    d = r.json()
    for k in (
        "resident_id", "name", "weeks_back", "weeks_returned",
        "points", "trajectory_label", "trajectory_label_text",
        "trajectory_summary", "score_min", "score_max",
        "score_current", "score_earliest", "explainable_note",
    ):
        assert k in d, f"missing key {k}"

    assert d["trajectory_label"] in VALID_TRAJ_LABELS
    assert d["resident_id"] == rid
    assert isinstance(d["points"], list)
    assert d["weeks_back"] == 10
    assert isinstance(d["score_min"], int)
    assert isinstance(d["score_max"], int)
    assert d["score_min"] <= d["score_max"]


def test_trajectory_point_shape(manager, some_resident):
    rid = some_resident["id"]
    d = requests.get(f"{API}/placement-stability/trajectory/{rid}", headers=manager).json()
    if not d["points"]:
        pytest.skip("no weekly points (resident too recently admitted)")
    p = d["points"][0]
    for k in (
        "week_index", "week_ending_at", "week_starting_at", "delta_starting_at",
        "days_in_placement_at_week", "score", "risk_score", "protective_score",
        "status", "status_label", "key_events", "key_event_count",
        "risk_factor_count", "protective_factor_count",
    ):
        assert k in p, f"point missing key {k}"
    assert p["score"] >= 0
    assert p["risk_score"] >= 0
    assert p["protective_score"] >= 0
    assert isinstance(p["key_events"], list)
    assert p["key_event_count"] == len(p["key_events"])


def test_trajectory_points_ordered_oldest_to_newest(manager, some_resident):
    rid = some_resident["id"]
    d = requests.get(f"{API}/placement-stability/trajectory/{rid}", headers=manager).json()
    if len(d["points"]) < 2:
        pytest.skip("need at least 2 points")
    # week_ending_at strictly increases
    times = [p["week_ending_at"] for p in d["points"]]
    assert times == sorted(times), "points should be oldest → newest"
    # score_current matches last point, score_earliest matches first
    assert d["score_current"] == d["points"][-1]["score"]
    assert d["score_earliest"] == d["points"][0]["score"]


def test_trajectory_clamps_weeks_param(manager, some_resident):
    rid = some_resident["id"]
    # Below floor (4)
    d = requests.get(f"{API}/placement-stability/trajectory/{rid}?weeks=1", headers=manager).json()
    assert d["weeks_back"] == 4
    # Above ceiling (12)
    d = requests.get(f"{API}/placement-stability/trajectory/{rid}?weeks=99", headers=manager).json()
    assert d["weeks_back"] == 12


# -----------------------------------------------------------------
# Determinism — same inputs → same trajectory
# -----------------------------------------------------------------
def test_trajectory_deterministic(manager, some_resident):
    rid = some_resident["id"]
    a = requests.get(f"{API}/placement-stability/trajectory/{rid}?weeks=10", headers=manager).json()
    b = requests.get(f"{API}/placement-stability/trajectory/{rid}?weeks=10", headers=manager).json()
    assert a["trajectory_label"] == b["trajectory_label"]
    assert a["score_current"] == b["score_current"]
    assert a["score_earliest"] == b["score_earliest"]
    assert len(a["points"]) == len(b["points"])
    # Compare just scores and statuses — week_ending_at moves with `now`
    assert [p["score"] for p in a["points"]] == [p["score"] for p in b["points"]]
    assert [p["status"] for p in a["points"]] == [p["status"] for p in b["points"]]


# -----------------------------------------------------------------
# Consistency with snapshot — same factor engine
# -----------------------------------------------------------------
def test_trajectory_current_aligns_with_snapshot_score(manager, some_resident):
    rid = some_resident["id"]
    snap = requests.get(f"{API}/placement-stability/resident/{rid}", headers=manager).json()
    traj = requests.get(f"{API}/placement-stability/trajectory/{rid}", headers=manager).json()
    if not traj["points"]:
        pytest.skip("no points to compare")
    # Most-recent weekly score should equal the snapshot score (both are
    # the latest 14d window vs first 14d post-admission via the same engine)
    assert traj["points"][-1]["score"] == snap["score"]


# -----------------------------------------------------------------
# Tone — no punitive language in any label or summary
# -----------------------------------------------------------------
def test_trajectory_supportive_tone(manager, some_resident):
    rid = some_resident["id"]
    d = requests.get(f"{API}/placement-stability/trajectory/{rid}", headers=manager).json()
    haystack = " ".join([
        d.get("trajectory_label_text", ""),
        d.get("trajectory_summary", ""),
        d.get("explainable_note", ""),
    ]).lower()
    for banned in ["at risk of breakdown", "failing", "unmanageable", "placement breakdown"]:
        assert banned not in haystack, f"punitive phrase leaked: {banned}"


# -----------------------------------------------------------------
# Privacy — no PII leaks in weekly events
# -----------------------------------------------------------------
def test_trajectory_events_no_pii(manager, some_resident):
    rid = some_resident["id"]
    d = requests.get(f"{API}/placement-stability/trajectory/{rid}", headers=manager).json()
    forbidden = {
        "description", "narrative", "body", "details", "notes",
        "young_person_voice", "raw_text", "reason",
    }
    for p in d["points"]:
        for ev in p["key_events"]:
            for k in forbidden:
                assert k not in ev, f"event leaks {k}: {ev}"


# -----------------------------------------------------------------
# Sector boundary — adult residents do not crash, return shape
# (children-only feature, but endpoint must not 500)
# -----------------------------------------------------------------
def test_trajectory_handles_resident_without_admission(manager, admin):
    # Create resident without placement_date (admin-only operation in this app)
    # Use existing resident; if their record has placement_date, skip is fine
    r = requests.get(f"{API}/residents", headers=manager).json()
    for res in r:
        d = requests.get(
            f"{API}/placement-stability/trajectory/{res['id']}", headers=manager,
        )
        # Any resident must respond 200 (graceful when missing admission)
        assert d.status_code == 200, f"failed for {res['id']}"
