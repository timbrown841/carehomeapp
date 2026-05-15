"""Iteration 38 — Phase D · Live Staffing Operations.

Clock in/out · sleep-in disturbances · leave requests · shift swaps ·
staffing overview · ratios · pressure indicators.
"""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _whoami(hdr):
    return requests.get(f"{API}/auth/me", headers=hdr).json()


@pytest.fixture(scope="module")
def staff(): return _login("staff@care.local", "Staff@123")
@pytest.fixture(scope="module")
def senior(): return _login("senior@care.local", "Senior@123")
@pytest.fixture(scope="module")
def manager(): return _login("manager@care.local", "Manager@123")
@pytest.fixture(scope="module")
def admin(): return _login("admin@care.local", "Admin@123")


# ============================================================
# Staffing overview
# ============================================================


def test_staffing_overview_open_to_any_auth(staff, senior, manager):
    for hdr in (staff, senior, manager):
        r = requests.get(f"{API}/staffing/overview", headers=hdr)
        assert r.status_code == 200
        d = r.json()
        for k in ("on_shift_now", "next_24h", "coverage_gaps", "ratios", "pressure", "config", "is_asleep_window"):
            assert k in d


def test_staffing_overview_pressure_shape(manager):
    d = requests.get(f"{API}/staffing/overview", headers=manager).json()
    pr = d["pressure"]
    for k in ("agency_pct_14d", "agency_status", "sickness_pct_14d", "sickness_status",
              "sleep_ins_30d", "disturbance_count_30d", "pending_swaps", "pending_leave"):
        assert k in pr


def test_staffing_overview_ratios_compute(manager):
    d = requests.get(f"{API}/staffing/overview", headers=manager).json()
    # Should have at least one sector with residents
    assert isinstance(d["ratios"], list)
    if d["ratios"]:
        r = d["ratios"][0]
        for k in ("sector", "residents", "mode", "required", "actual", "gap", "status"):
            assert k in r
        assert r["status"] in ("ok", "warn", "critical")
        assert r["mode"] in ("awake", "asleep")



def test_staffing_overview_sector_filter_narrows_ratios(manager):
    """sector=children → ratios contains only that sector."""
    d = requests.get(f"{API}/staffing/overview", params={"sector": "children"}, headers=manager).json()
    assert d["filters_applied"]["sector"] == "children"
    assert all(r["sector"] == "children" for r in d["ratios"])
    # Sectors_available still lists every sector with residents (org-wide context preserved)
    assert any(s["sector"] == "children" for s in d["sectors_available"])


def test_staffing_overview_shift_filter_narrows_on_shift(manager):
    """shift_filter=sleep_in narrows on_shift_now but on_shift_total preserves org total."""
    d_all = requests.get(f"{API}/staffing/overview", headers=manager).json()
    d_sleep = requests.get(f"{API}/staffing/overview", params={"shift_filter": "sleep_in"}, headers=manager).json()
    assert d_sleep["filters_applied"]["shift_filter"] == "sleep_in"
    # All filtered items must be sleep-in
    assert all(s["is_sleep_in"] for s in d_sleep["on_shift_now"])
    # on_shift_total preserves org-wide truth
    assert d_sleep["on_shift_total"] == d_all["on_shift_total"]


def test_staffing_overview_pressure_unaffected_by_filters(manager):
    """Pressure indicators are intentionally organisation-wide regardless of filter."""
    a = requests.get(f"{API}/staffing/overview", headers=manager).json()["pressure"]
    b = requests.get(f"{API}/staffing/overview", params={"sector": "children"}, headers=manager).json()["pressure"]
    c = requests.get(f"{API}/staffing/overview", params={"shift_filter": "agency"}, headers=manager).json()["pressure"]
    # Compare the org-wide numbers (overtime/agency/sickness etc.)
    for k in ("agency_pct_14d", "sickness_pct_14d", "sleep_ins_30d", "disturbance_count_30d"):
        assert a[k] == b[k] == c[k]


# ============================================================
# Config
# ============================================================


def test_staffing_config_rbac(staff, senior, manager, admin):
    assert requests.get(f"{API}/staffing/config", headers=staff).status_code == 403
    assert requests.get(f"{API}/staffing/config", headers=senior).status_code == 403
    assert requests.get(f"{API}/staffing/config", headers=manager).status_code == 200
    # Patch only admin
    payload = {"sleep_in_rate_gbp": 70.0}
    assert requests.patch(f"{API}/staffing/config", json=payload, headers=manager).status_code == 403
    r = requests.patch(f"{API}/staffing/config", json=payload, headers=admin)
    assert r.status_code == 200
    assert r.json()["sleep_in_rate_gbp"] == 70.0


# ============================================================
# Clock in / out
# ============================================================


def _create_shift_for(headers_mgr, staff_id, start_offset_min=-30, end_offset_min=240):
    now = datetime.now(timezone.utc)
    body = {
        "staff_id": staff_id,
        "role": "Support",
        "start_at": (now + timedelta(minutes=start_offset_min)).isoformat(),
        "end_at": (now + timedelta(minutes=end_offset_min)).isoformat(),
    }
    r = requests.post(f"{API}/shifts", json=body, headers=headers_mgr)
    assert r.status_code == 200
    return r.json()


def test_clock_in_out_lifecycle(staff, manager):
    me = _whoami(staff)
    s = _create_shift_for(manager, me["id"])
    sid = s["id"]
    try:
        # Clock in
        r = requests.post(f"{API}/shifts/{sid}/clock-in", json={"method": "app"}, headers=staff)
        assert r.status_code == 200
        a = r.json()
        assert a["clocked_in_at"]
        assert a["clocked_in_by_id"] == me["id"]
        assert isinstance(a["clock_in_variance_minutes"], int)
        # Second clock-in is rejected
        r2 = requests.post(f"{API}/shifts/{sid}/clock-in", json={}, headers=staff)
        assert r2.status_code == 400
        # Clock out
        r3 = requests.post(f"{API}/shifts/{sid}/clock-out", json={"notes": "All good"}, headers=staff)
        assert r3.status_code == 200
        b = r3.json()
        assert b["clocked_out_at"]
        assert b["actual_minutes_worked"] >= 0
        # Cannot clock out twice
        r4 = requests.post(f"{API}/shifts/{sid}/clock-out", json={}, headers=staff)
        assert r4.status_code == 400
    finally:
        requests.delete(f"{API}/shifts/{sid}", headers=manager)


def test_clock_in_self_only(staff, manager):
    """Staff cannot clock in to someone else's shift."""
    # Create a shift assigned to a different user (manager themselves)
    me = _whoami(manager)
    s = _create_shift_for(manager, me["id"])
    try:
        r = requests.post(f"{API}/shifts/{s['id']}/clock-in", json={}, headers=staff)
        assert r.status_code == 403
    finally:
        requests.delete(f"{API}/shifts/{s['id']}", headers=manager)


# ============================================================
# Sleep-in disturbances
# ============================================================


def test_sleep_in_disturbance(staff, manager):
    me = _whoami(staff)
    s = _create_shift_for(manager, me["id"])
    sid = s["id"]
    try:
        requests.post(f"{API}/shifts/{sid}/clock-in", json={}, headers=staff)
        body = {"minutes": 25, "reason": "Supported YP back to bed after distress"}
        r = requests.post(f"{API}/shifts/{sid}/disturbance", json=body, headers=staff)
        assert r.status_code == 200
        d = r.json()
        assert d["minutes"] == 25
        assert d["logged_by_id"] == me["id"]
        # Shift is now sleep-in flagged + appears in overview
        overview = requests.get(f"{API}/staffing/overview", headers=manager).json()
        on_shift = next((x for x in overview["on_shift_now"] if x["id"] == sid), None)
        assert on_shift and on_shift["is_sleep_in"] and on_shift["disturbance_count"] >= 1
    finally:
        requests.delete(f"{API}/shifts/{sid}", headers=manager)


# ============================================================
# Leave requests
# ============================================================


def test_leave_request_lifecycle(staff, manager):
    me = _whoami(staff)
    body = {"kind": "annual_leave", "start_date": "2026-07-01", "end_date": "2026-07-05", "days": 5}
    r = requests.post(f"{API}/leave-requests", json=body, headers=staff)
    assert r.status_code == 200
    lid = r.json()["id"]
    assert r.json()["status"] == "pending"
    assert r.json()["staff_id"] == me["id"]
    # Staff cannot approve
    assert requests.post(f"{API}/leave-requests/{lid}/approve", json={}, headers=staff).status_code == 403
    # Manager approves
    r2 = requests.post(f"{API}/leave-requests/{lid}/approve", json={"decision_notes": "OK"}, headers=manager)
    assert r2.status_code == 200
    assert r2.json()["status"] == "approved"
    assert r2.json()["decision_by_name"]
    # Cannot approve twice
    assert requests.post(f"{API}/leave-requests/{lid}/approve", json={}, headers=manager).status_code == 400
    # Staff cancels their own approved request
    r3 = requests.post(f"{API}/leave-requests/{lid}/cancel", headers=staff)
    assert r3.status_code == 200
    assert r3.json()["status"] == "cancelled"


def test_leave_list_scoped_to_self_for_staff(staff, manager):
    requests.post(f"{API}/leave-requests", json={
        "kind": "sickness", "start_date": "2026-08-01", "end_date": "2026-08-01", "days": 1,
    }, headers=staff)
    requests.post(f"{API}/leave-requests", json={
        "kind": "training", "start_date": "2026-08-10", "end_date": "2026-08-11", "days": 2,
    }, headers=manager)
    # Staff list returns only own
    items_s = requests.get(f"{API}/leave-requests", headers=staff).json()
    me = _whoami(staff)
    assert all(it["staff_id"] == me["id"] for it in items_s)
    # Manager unfiltered returns >= 2
    items_m = requests.get(f"{API}/leave-requests", headers=manager).json()
    assert len(items_m) >= 2


# ============================================================
# Shift swaps
# ============================================================


def test_shift_swap_full_lifecycle(staff, senior, manager):
    me = _whoami(staff)
    target = _whoami(senior)
    # Create a future shift for staff
    now = datetime.now(timezone.utc)
    body = {
        "staff_id": me["id"],
        "role": "Support",
        "start_at": (now + timedelta(days=2)).isoformat(),
        "end_at": (now + timedelta(days=2, hours=8)).isoformat(),
    }
    s = requests.post(f"{API}/shifts", json=body, headers=manager).json()
    sid = s["id"]
    try:
        # Staff requests swap targeting senior
        r = requests.post(f"{API}/shift-swaps", json={
            "shift_id": sid, "target_staff_id": target["id"], "reason": "Doctor appointment",
        }, headers=staff)
        assert r.status_code == 200, r.text
        swap = r.json()
        assert swap["status"] == "pending_target"
        assert swap["target_staff_id"] == target["id"]
        # Staff cannot accept (not the target AND is requester) — first check (target mismatch) trips
        assert requests.post(f"{API}/shift-swaps/{swap['id']}/accept", headers=staff).status_code in (400, 403)
        # Random user not targeted cannot accept
        # (manager is not targeted but they pass tier check on /accept — but route checks target_staff_id ≠ user)
        assert requests.post(f"{API}/shift-swaps/{swap['id']}/accept", headers=manager).status_code == 403
        # Senior accepts
        r2 = requests.post(f"{API}/shift-swaps/{swap['id']}/accept", headers=senior)
        assert r2.status_code == 200
        assert r2.json()["status"] == "pending_manager"
        # Staff cannot approve
        assert requests.post(f"{API}/shift-swaps/{swap['id']}/approve", json={}, headers=staff).status_code == 403
        # Manager approves
        r3 = requests.post(f"{API}/shift-swaps/{swap['id']}/approve", json={"decision_notes": "Approved"}, headers=manager)
        assert r3.status_code == 200
        assert r3.json()["status"] == "approved"
        # Shift now reassigned to senior
        re = requests.get(f"{API}/shifts?from_date=" + (now + timedelta(days=1)).date().isoformat()
                          + "&to_date=" + (now + timedelta(days=3)).date().isoformat(), headers=manager).json()
        moved = next((x for x in re if x["id"] == sid), None)
        assert moved and moved["staff_id"] == target["id"]
    finally:
        requests.delete(f"{API}/shifts/{sid}", headers=manager)


def test_swap_cannot_be_created_on_started_shift(staff, manager):
    me = _whoami(staff)
    now = datetime.now(timezone.utc)
    body = {
        "staff_id": me["id"], "role": "Support",
        "start_at": (now - timedelta(minutes=30)).isoformat(),
        "end_at": (now + timedelta(hours=4)).isoformat(),
    }
    s = requests.post(f"{API}/shifts", json=body, headers=manager).json()
    sid = s["id"]
    try:
        # Clock in
        requests.post(f"{API}/shifts/{sid}/clock-in", json={}, headers=staff)
        # Cannot request swap on already-started shift
        r = requests.post(f"{API}/shift-swaps", json={"shift_id": sid}, headers=staff)
        assert r.status_code == 400
    finally:
        requests.delete(f"{API}/shifts/{sid}", headers=manager)


# ============================================================
# My shifts
# ============================================================


def test_staffing_mine(staff, manager):
    me = _whoami(staff)
    now = datetime.now(timezone.utc)
    body = {"staff_id": me["id"], "role": "Support",
            "start_at": (now + timedelta(hours=4)).isoformat(),
            "end_at": (now + timedelta(hours=12)).isoformat()}
    s = requests.post(f"{API}/shifts", json=body, headers=manager).json()
    try:
        r = requests.get(f"{API}/staffing/mine", headers=staff)
        assert r.status_code == 200
        d = r.json()
        assert "current" in d and "next" in d and "recent" in d and "week_hours" in d
        # Verify the new shift appears either as `next` or in `recent`/listed somewhere
        all_ids = {x["id"] for x in (d.get("recent") or [])}
        if d.get("next"): all_ids.add(d["next"]["id"])
        assert s["id"] in all_ids or d.get("next") is not None
    finally:
        requests.delete(f"{API}/shifts/{s['id']}", headers=manager)
