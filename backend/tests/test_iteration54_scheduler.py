"""Tests for Phase E.2 — Care Task Scheduler + Training Cliff Edge."""
import os
import requests
from datetime import date, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
API = f"{BASE.rstrip('/')}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _h(t): return {"Authorization": f"Bearer {t}"}
def _mtoken(): return _login("manager@care.local", "Manager@123")
def _stoken(): return _login("staff@care.local", "Staff@123")


def _first_staff():
    t = _mtoken()
    users = requests.get(f"{API}/auth/users", headers=_h(t), timeout=10).json()
    users = users if isinstance(users, list) else users.get("users", [])
    staff = [u for u in users if u.get("role") == "staff"]
    assert staff
    return staff[0]


def _today():
    return date.today().isoformat()


def _plus(days):
    return (date.today() + timedelta(days=days)).isoformat()


# === Cliff Edge ===

def test_cliff_edge_shape_children():
    t = _mtoken()
    r = requests.get(f"{API}/training-centre/cliff-edge?sector=children", headers=_h(t), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("sector", "today", "buckets", "renewal_waves",
              "qualification_renewals", "cliff_list", "trend"):
        assert k in body, f"missing {k}"
    for b in ("30", "60", "90", "overdue"):
        assert b in body["buckets"]
    assert len(body["trend"]) == 30
    assert all("date" in p and "compliance_pct" in p for p in body["trend"])


def test_cliff_edge_rbac_staff_blocked():
    st = _stoken()
    r = requests.get(f"{API}/training-centre/cliff-edge?sector=children", headers=_h(st), timeout=10)
    assert r.status_code == 403


def test_cliff_edge_persists_snapshot():
    t = _mtoken()
    # First call -- writes today's snapshot
    requests.get(f"{API}/training-centre/cliff-edge?sector=children", headers=_h(t), timeout=15)
    # Second call -- today should appear as 'snapshot' source for the last point
    r = requests.get(f"{API}/training-centre/cliff-edge?sector=children", headers=_h(t), timeout=15)
    body = r.json()
    last = body["trend"][-1]
    assert last["date"] == _today()
    assert last["source"] in ("snapshot", "backfill")


# === Task Templates ===

def test_templates_seeded():
    t = _mtoken()
    r = requests.get(f"{API}/tasks/templates", headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 11
    kinds = {x["kind"] for x in body["templates"]}
    for required in ("key_work", "supervision", "team_meeting", "lac_review",
                     "pep_meeting", "family_time", "health_appointment",
                     "independent_living", "training_renewal", "reg44_action",
                     "ofsted_action"):
        assert required in kinds, f"missing template {required}"


# === Task CRUD ===

def test_create_task_basic():
    t = _mtoken()
    s = _first_staff()
    payload = {
        "kind": "team_meeting",
        "title": "Weekly team meeting",
        "assigned_to_id": s["id"],
        "due_at": _plus(7),
        "priority": "medium",
    }
    r = requests.post(f"{API}/tasks", json=payload, headers=_h(t), timeout=10)
    assert r.status_code == 200, r.text
    task = r.json()
    assert task["assigned_to_id"] == s["id"]
    assert task["assigned_to_name"] == s["name"]
    assert task["status"] == "pending"


def test_create_task_staff_rbac():
    st = _stoken()
    payload = {"kind": "team_meeting", "title": "x", "due_at": _plus(7)}
    r = requests.post(f"{API}/tasks", json=payload, headers=_h(st), timeout=10)
    assert r.status_code == 403


def test_task_status_computed_overdue():
    t = _mtoken()
    s = _first_staff()
    payload = {
        "kind": "key_work", "title": "Past-due session",
        "assigned_to_id": s["id"], "due_at": _plus(-2),
    }
    r = requests.post(f"{API}/tasks", json=payload, headers=_h(t), timeout=10)
    assert r.status_code == 200
    listing = requests.get(f"{API}/tasks?status=overdue", headers=_h(t), timeout=10).json()
    assert any(x["id"] == r.json()["id"] and x["computed_status"] == "overdue"
                for x in listing["tasks"])


def test_recurring_task_spawns_next_on_complete():
    t = _mtoken()
    s = _first_staff()
    payload = {
        "kind": "supervision", "title": "Monthly supervision",
        "assigned_to_id": s["id"], "due_at": _plus(7),
        "recurrence": {"kind": "monthly", "interval": 1},
    }
    created = requests.post(f"{API}/tasks", json=payload, headers=_h(t), timeout=10).json()
    cmp_r = requests.post(f"{API}/tasks/{created['id']}/complete",
                          json={"evidence": "Done. Next planned for +1mo."},
                          headers=_h(t), timeout=10)
    assert cmp_r.status_code == 200
    body = cmp_r.json()
    assert body["completed"] is True
    assert body["next_task_id"], "recurrence should spawn next"
    # Fetch the spawned task
    nxt = requests.get(f"{API}/tasks", headers=_h(t), timeout=10).json()
    found = [x for x in nxt["tasks"] if x["id"] == body["next_task_id"]]
    assert found
    assert found[0]["parent_task_id"] == created["id"]
    assert found[0]["due_at"] > created["due_at"]


def test_non_recurring_task_complete_no_spawn():
    t = _mtoken()
    s = _first_staff()
    payload = {
        "kind": "health_appointment", "title": "Dentist appointment",
        "assigned_to_id": s["id"], "due_at": _plus(3),
    }
    created = requests.post(f"{API}/tasks", json=payload, headers=_h(t), timeout=10).json()
    cmp_r = requests.post(f"{API}/tasks/{created['id']}/complete",
                          json={"evidence": "Attended."},
                          headers=_h(t), timeout=10)
    assert cmp_r.status_code == 200
    body = cmp_r.json()
    assert body["next_task_id"] is None


def test_staff_sees_only_own_tasks():
    st = _stoken()
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    # Manager creates a task for someone else
    t = _mtoken()
    others = [u for u in requests.get(f"{API}/auth/users", headers=_h(t), timeout=10).json()
              if u["id"] != me["id"] and u["role"] in ("staff", "senior", "manager")]
    if others:
        requests.post(f"{API}/tasks",
                      json={"kind": "custom", "title": "For someone else",
                            "assigned_to_id": others[0]["id"], "due_at": _plus(5)},
                      headers=_h(t), timeout=10)
    # Staff queries tasks
    r = requests.get(f"{API}/tasks", headers=_h(st), timeout=10).json()
    for x in r["tasks"]:
        assert x["assigned_to_id"] == me["id"], "staff saw foreign task"


def test_staff_can_only_update_status():
    st = _stoken()
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    t = _mtoken()
    created = requests.post(f"{API}/tasks",
                             json={"kind": "custom", "title": "Self-update test",
                                   "assigned_to_id": me["id"], "due_at": _plus(5)},
                             headers=_h(t), timeout=10).json()
    # Staff updating status -- allowed
    r1 = requests.patch(f"{API}/tasks/{created['id']}",
                        json={"status": "in_progress"}, headers=_h(st), timeout=10)
    assert r1.status_code == 200
    # Staff updating title -- blocked
    r2 = requests.patch(f"{API}/tasks/{created['id']}",
                        json={"title": "Hacked"}, headers=_h(st), timeout=10)
    assert r2.status_code == 400


def test_task_delete_rbac():
    t = _mtoken()
    s = _first_staff()
    created = requests.post(f"{API}/tasks",
                             json={"kind": "custom", "title": "To be deleted",
                                   "assigned_to_id": s["id"], "due_at": _plus(5)},
                             headers=_h(t), timeout=10).json()
    st = _stoken()
    r1 = requests.delete(f"{API}/tasks/{created['id']}", headers=_h(st), timeout=10)
    assert r1.status_code == 403
    r2 = requests.delete(f"{API}/tasks/{created['id']}", headers=_h(t), timeout=10)
    assert r2.status_code == 200


# === Dashboard ===

def test_tasks_dashboard_shape():
    t = _mtoken()
    r = requests.get(f"{API}/tasks/dashboard", headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    for k in ("today", "upcoming_7d", "overdue", "by_kind", "manager_focus",
              "total_open", "compliance_pct", "compliance_window_days"):
        assert k in body


def test_tasks_dashboard_rbac_staff_blocked():
    st = _stoken()
    r = requests.get(f"{API}/tasks/dashboard", headers=_h(st), timeout=10)
    assert r.status_code == 403


# === Supervision -> Task bi-dir hook ===

def test_supervision_creates_linked_task():
    t = _mtoken()
    s = _first_staff()
    sup = requests.post(f"{API}/supervisions",
                         json={"staff_id": s["id"], "kind": "supervision",
                               "completed_at": _today(), "notes": "Test sup"},
                         headers=_h(t), timeout=10).json()
    payload = {
        "title": "Complete Team Teach refresher by Q2",
        "kind": "training_renewal",
        "due_at": _plus(60),
        "priority": "high",
    }
    r = requests.post(f"{API}/supervisions/{sup['id']}/tasks", json=payload,
                      headers=_h(t), timeout=10)
    assert r.status_code == 200, r.text
    task = r.json()
    assert task["linked_supervision_id"] == sup["id"]
    assert task["assigned_to_id"] == s["id"]
    # Reverse link — the task lists with linked_supervision_id back to the supervision
    tasks = requests.get(f"{API}/tasks?status=open", headers=_h(t), timeout=10).json()
    found = [x for x in tasks["tasks"] if x["id"] == task["id"]]
    assert found
    assert found[0]["linked_supervision_id"] == sup["id"]


# === Recurrence math ===

def test_weekly_recurrence_with_day_of_week():
    t = _mtoken()
    s = _first_staff()
    # 2026-02-15 is a Sunday. Use day_of_week=1 (Tue). Expected next: ~+7 then snap to Tuesday
    payload = {
        "kind": "key_work", "title": "Weekly KW on Tuesdays",
        "assigned_to_id": s["id"], "due_at": "2026-02-17",  # Tuesday
        "recurrence": {"kind": "weekly", "interval": 1, "day_of_week": 1},
    }
    created = requests.post(f"{API}/tasks", json=payload, headers=_h(t), timeout=10).json()
    cmp_r = requests.post(f"{API}/tasks/{created['id']}/complete",
                          json={"evidence": "x"}, headers=_h(t), timeout=10).json()
    assert cmp_r["next_task_id"]
    nxt = [x for x in requests.get(f"{API}/tasks", headers=_h(t), timeout=10).json()["tasks"]
           if x["id"] == cmp_r["next_task_id"]]
    assert nxt
    # +7 days = 2026-02-24 (Tuesday)
    assert nxt[0]["due_at"] == "2026-02-24"
