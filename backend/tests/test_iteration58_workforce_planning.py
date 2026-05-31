"""Tests for Phase E.4 — Workforce Planning & Capacity Intelligence."""
import os
from datetime import date, timedelta
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
API = f"{BASE.rstrip('/')}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _h(t): return {"Authorization": f"Bearer {t}"}
def _mtoken(): return _login("manager@care.local", "Manager@123")
def _stoken(): return _login("staff@care.local", "Staff@123")


# === Dashboard ===

def test_dashboard_shape_children():
    r = requests.get(f"{API}/workforce-planning/dashboard?sector=children",
                      headers=_h(_mtoken()), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("sector", "today", "forecast", "cliff_edge", "renewal_waves",
              "capacity", "manager_actions"):
        assert k in body, f"missing top-level key {k}"
    # Forecast
    for w in ("today", "in_30_days", "in_60_days", "in_90_days"):
        assert w in body["forecast"]
        assert 0 <= body["forecast"][w]["projected_compliance_pct"] <= 100
        assert body["forecast"][w]["rag"] in ("red", "amber", "green")
    # Cliff edge
    for k in ("overdue", "in_30", "in_60", "in_90"):
        assert k in body["cliff_edge"]["buckets"]
    assert len(body["cliff_edge"]["by_role"]) >= 3
    for r2 in body["cliff_edge"]["by_role"]:
        assert "role" in r2 and "compliance_pct" in r2 and "rag" in r2
        assert "expired" in r2 and "in_30" in r2 and "in_60" in r2 and "in_90" in r2
    # Capacity
    cap = body["capacity"]
    for k in ("staff_total", "on_shift_now", "on_leave_today", "on_sickness_today",
              "on_training_today", "vacancies", "available_today",
              "release_for_training_safe"):
        assert k in cap, f"capacity missing {k}"
    assert isinstance(cap["release_for_training_safe"], bool)


def test_dashboard_adult_sector():
    r = requests.get(f"{API}/workforce-planning/dashboard?sector=adult",
                      headers=_h(_mtoken()), timeout=15)
    assert r.status_code == 200
    assert r.json()["sector"] == "adult"


def test_dashboard_invalid_sector():
    r = requests.get(f"{API}/workforce-planning/dashboard?sector=bogus",
                      headers=_h(_mtoken()), timeout=10)
    assert r.status_code == 422


def test_dashboard_rbac_staff_blocked():
    r = requests.get(f"{API}/workforce-planning/dashboard?sector=children",
                      headers=_h(_stoken()), timeout=10)
    assert r.status_code == 403


def test_forecast_decay_logic():
    """Projected compliance should weakly-decay (or stay flat) across 30/60/90."""
    body = requests.get(f"{API}/workforce-planning/dashboard?sector=children",
                         headers=_h(_mtoken()), timeout=15).json()
    f = body["forecast"]
    # Each successive horizon should have <= compliance % than the previous
    # (or equal — if no records expire in the buckets).
    assert f["in_30_days"]["projected_compliance_pct"] <= f["today"]["projected_compliance_pct"]
    assert f["in_60_days"]["projected_compliance_pct"] <= f["in_30_days"]["projected_compliance_pct"]
    assert f["in_90_days"]["projected_compliance_pct"] <= f["in_60_days"]["projected_compliance_pct"]


def test_renewal_waves_have_recommended_action_date():
    body = requests.get(f"{API}/workforce-planning/dashboard?sector=children",
                         headers=_h(_mtoken()), timeout=15).json()
    for w in body["renewal_waves"]:
        assert "month" in w and "month_label" in w
        assert "course_count" in w and "staff_count" in w
        assert "estimated_hours" in w
        assert "recommended_action_date" in w
        # Recommended action date should be before or on the first day of the wave month
        wave_first = f"{w['month']}-01"
        assert w["recommended_action_date"] <= wave_first


def test_manager_actions_sorted_by_priority():
    body = requests.get(f"{API}/workforce-planning/dashboard?sector=children",
                         headers=_h(_mtoken()), timeout=15).json()
    actions = body["manager_actions"]
    priorities = [a["priority"] for a in actions]
    assert priorities == sorted(priorities)
    for a in actions:
        assert "severity" in a and a["severity"] in ("red", "amber", "blue")
        assert "deep_link" in a and a["deep_link"].startswith("/")


# === Calendar ===

def test_calendar_window_validation():
    today = date.today()
    plus30 = (today + timedelta(days=30)).isoformat()
    r = requests.get(f"{API}/workforce-planning/calendar?sector=children&from={today.isoformat()}&to={plus30}",
                      headers=_h(_mtoken()), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "events" in body
    assert "event_count" in body
    assert body["event_count"] == len(body["events"])
    # All events have required keys
    for e in body["events"]:
        for k in ("id", "kind", "label", "date", "deep_link", "severity"):
            assert k in e, f"event missing {k}: {e}"


def test_calendar_invalid_dates():
    r = requests.get(f"{API}/workforce-planning/calendar?sector=children&from=garbage&to=2026-12-31",
                      headers=_h(_mtoken()), timeout=10)
    assert r.status_code == 400


def test_calendar_reversed_dates():
    r = requests.get(f"{API}/workforce-planning/calendar?sector=children&from=2026-12-31&to=2026-01-01",
                      headers=_h(_mtoken()), timeout=10)
    assert r.status_code == 400


def test_calendar_rbac_staff():
    today = date.today().isoformat()
    plus30 = (date.today() + timedelta(days=30)).isoformat()
    r = requests.get(f"{API}/workforce-planning/calendar?sector=children&from={today}&to={plus30}",
                      headers=_h(_stoken()), timeout=10)
    assert r.status_code == 403


# === Capacity day-by-day ===

def test_capacity_day_by_day_shape():
    today = date.today().isoformat()
    plus7 = (date.today() + timedelta(days=7)).isoformat()
    r = requests.get(f"{API}/workforce-planning/capacity?sector=children&from={today}&to={plus7}",
                      headers=_h(_mtoken()), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert len(body["days"]) == 8  # inclusive
    for d in body["days"]:
        for k in ("date", "weekday", "staff_total", "on_leave", "on_sickness",
                  "on_training", "available", "available_pct", "rag",
                  "release_for_training_safe"):
            assert k in d
        assert d["rag"] in ("red", "amber", "green")
        assert 0 <= d["available_pct"] <= 100


def test_capacity_window_too_large():
    today = date.today().isoformat()
    plus_year = (date.today() + timedelta(days=400)).isoformat()
    r = requests.get(f"{API}/workforce-planning/capacity?sector=children&from={today}&to={plus_year}",
                      headers=_h(_mtoken()), timeout=10)
    assert r.status_code == 400


def test_capacity_rbac_staff():
    today = date.today().isoformat()
    plus7 = (date.today() + timedelta(days=7)).isoformat()
    r = requests.get(f"{API}/workforce-planning/capacity?sector=children&from={today}&to={plus7}",
                      headers=_h(_stoken()), timeout=10)
    assert r.status_code == 403
