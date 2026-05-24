"""Iteration 42c — Org-wide Placement Stability Trajectory.

Validates the Emerging Placement Concerns panel is enriched with per-resident
compact trajectory data (mini sparkline points + label) for leadership at-a-glance.
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


VALID_TRAJ_LABELS = {
    "stabilising", "improving", "steady", "fluctuating",
    "deteriorating", "insufficient_data", "no_admission",
}


def test_emerging_still_manager_plus(staff, senior, manager, admin):
    assert requests.get(f"{API}/placement-stability/emerging-concerns", headers=staff).status_code == 403
    assert requests.get(f"{API}/placement-stability/emerging-concerns", headers=senior).status_code == 403
    assert requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).status_code == 200
    assert requests.get(f"{API}/placement-stability/emerging-concerns", headers=admin).status_code == 200


def test_emerging_rows_carry_trajectory(manager):
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    rows = (d.get("emerging_concerns") or []) + (d.get("stabilising_trends") or []) + (d.get("all_residents") or [])
    assert rows, "expected at least one resident row to validate trajectory enrichment"
    for r in rows:
        assert "trajectory" in r, f"row missing trajectory: {r.get('name')}"
        t = r["trajectory"]
        for k in (
            "trajectory_label", "trajectory_label_text", "weeks_returned",
            "score_min", "score_max", "score_current", "score_earliest",
            "sparkline",
        ):
            assert k in t, f"trajectory missing key {k}"
        assert t["trajectory_label"] in VALID_TRAJ_LABELS
        assert isinstance(t["sparkline"], list)


def test_emerging_sparkline_shape(manager):
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    rows = (d.get("emerging_concerns") or []) + (d.get("stabilising_trends") or []) + (d.get("all_residents") or [])
    for r in rows:
        for p in r["trajectory"]["sparkline"]:
            assert set(p.keys()) == {"week_ending_at", "score", "status", "status_label"}, \
                f"unexpected sparkline keys: {p.keys()}"
            assert p["score"] >= 0


def test_emerging_sparkline_no_pii(manager):
    """Compact trajectory must never carry narrative / PII / event lists."""
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    rows = (d.get("emerging_concerns") or []) + (d.get("stabilising_trends") or []) + (d.get("all_residents") or [])
    forbidden = {
        "key_events", "description", "narrative", "body", "notes",
        "young_person_voice", "raw_text", "reason",
    }
    for r in rows:
        for k in forbidden:
            assert k not in r["trajectory"], f"trajectory leaks {k}"
            for p in r["trajectory"]["sparkline"]:
                assert k not in p, f"sparkline leaks {k}"


def test_emerging_score_current_matches_snapshot(manager):
    """Each row's trajectory.score_current must equal row.score (most recent week
    equals the snapshot — they use the same factor engine)."""
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    rows = (d.get("emerging_concerns") or []) + (d.get("stabilising_trends") or []) + (d.get("all_residents") or [])
    checked = 0
    for r in rows:
        if r["trajectory"]["weeks_returned"] > 0:
            assert r["trajectory"]["score_current"] == r["score"], \
                f"{r['name']}: trajectory current={r['trajectory']['score_current']} != snapshot score={r['score']}"
            checked += 1
    if checked == 0:
        pytest.skip("no resident has enough days in placement for trajectory comparison")


def test_emerging_summary_supportive_tone(manager):
    """No punitive language anywhere in the panel response."""
    d = requests.get(f"{API}/placement-stability/emerging-concerns", headers=manager).json()
    blob = (
        (d.get("overall_label") or "") + " " +
        (d.get("explainable_note") or "")
    ).lower()
    for banned in ["at risk of breakdown", "failing placement", "unmanageable", "league table"]:
        assert banned not in blob
    rows = (d.get("emerging_concerns") or []) + (d.get("stabilising_trends") or [])
    for r in rows:
        text = (r["trajectory"].get("trajectory_label_text", "") + " " +
                (r["trajectory"].get("trajectory_summary") or "")).lower()
        for banned in ["at risk of breakdown", "failing", "unmanageable"]:
            assert banned not in text
