"""Tests for Phase E.3 — Staff Induction Checklist."""
import os
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


def _first_staff_id():
    t = _mtoken()
    users = requests.get(f"{API}/auth/users", headers=_h(t), timeout=10).json()
    users = users if isinstance(users, list) else users.get("users", [])
    return [u["id"] for u in users if u.get("role") == "staff"][0]


def _ensure_no_active_for(sid):
    t = _mtoken()
    lst = requests.get(f"{API}/induction/assignments?staff_id={sid}", headers=_h(t), timeout=10).json()
    for a in lst.get("assignments", []):
        if not a.get("signed_off_at"):
            requests.delete(f"{API}/induction/assignments/{a['id']}", headers=_h(t), timeout=10)


def test_template_returns_16_sections():
    t = _mtoken()
    r = requests.get(f"{API}/induction/template", headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 16
    keys = {s["key"] for s in body["sections"]}
    for required in ("welcome", "safeguarding", "fire_emergency", "medication",
                     "shadow_shifts", "supervision", "mandatory_training", "manager_signoff"):
        assert required in keys, f"missing section {required}"


def test_create_assignment_seeds_16_items():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    r = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid, "sector": "children"},
                       headers=_h(t), timeout=10)
    assert r.status_code == 200, r.text
    a = r.json()
    assert len(a["items"]) == 16
    assert a["progress"]["overall_status"] == "not_started"
    assert a["progress"]["completion_pct"] == 0


def test_duplicate_active_assignment_rejected():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    requests.post(f"{API}/induction/assignments",
                   json={"staff_id": sid}, headers=_h(t), timeout=10)
    r2 = requests.post(f"{API}/induction/assignments",
                        json={"staff_id": sid}, headers=_h(t), timeout=10)
    assert r2.status_code == 400


def test_create_assignment_staff_blocked():
    st = _stoken()
    r = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": "x"}, headers=_h(st), timeout=10)
    assert r.status_code == 403


def test_patch_item_progress_and_evidence():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    r = requests.patch(f"{API}/induction/assignments/{a['id']}/items/welcome",
                       json={"status": "completed", "notes": "Tour completed with manager."},
                       headers=_h(t), timeout=10)
    assert r.status_code == 200
    item = r.json()["item"]
    assert item["status"] == "completed"
    assert item["completed_at"]
    assert item["completed_by_name"]
    assert r.json()["progress"]["complete"] == 1


def test_staff_can_update_own_items():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    st = _stoken()
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    if me["id"] != sid:
        return  # only one staff -- skip
    r = requests.patch(f"{API}/induction/assignments/{a['id']}/items/welcome",
                       json={"status": "in_progress", "notes": "Started reading handbook."},
                       headers=_h(st), timeout=10)
    assert r.status_code == 200


def test_staff_cannot_update_others_induction():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    # Different staff token
    st = _stoken()
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    if me["id"] == sid:
        return  # same person -- skip
    r = requests.patch(f"{API}/induction/assignments/{a['id']}/items/welcome",
                       json={"status": "completed"}, headers=_h(st), timeout=10)
    assert r.status_code == 403


def test_staff_cannot_mark_final_signoff_item():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    st = _stoken()
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    if me["id"] != sid:
        return  # only test when staff IS the assignee
    r = requests.patch(f"{API}/induction/assignments/{a['id']}/items/manager_signoff",
                       json={"status": "completed"}, headers=_h(st), timeout=10)
    assert r.status_code == 403


def test_sign_off_requires_all_complete():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    r = requests.post(f"{API}/induction/assignments/{a['id']}/sign-off",
                      json={"declaration": "Ready for sign-off"}, headers=_h(t), timeout=10)
    assert r.status_code == 400


def test_full_sign_off_flow():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    # Mark all 16 items complete
    for item in a["items"]:
        rr = requests.patch(f"{API}/induction/assignments/{a['id']}/items/{item['key']}",
                            json={"status": "completed"}, headers=_h(t), timeout=10)
        assert rr.status_code == 200
    # Sign off
    r = requests.post(f"{API}/induction/assignments/{a['id']}/sign-off",
                      json={"declaration": "All 16 sections evidenced. Ready for shifts."},
                      headers=_h(t), timeout=10)
    assert r.status_code == 200
    # Read-only post sign-off
    r2 = requests.patch(f"{API}/induction/assignments/{a['id']}/items/welcome",
                        json={"status": "in_progress"}, headers=_h(t), timeout=10)
    assert r2.status_code == 400


def test_sign_off_rbac_senior_blocked():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    senior = _login("senior@care.local", "Senior@123")
    r = requests.post(f"{API}/induction/assignments/{a['id']}/sign-off",
                      json={"declaration": "x"}, headers=_h(senior), timeout=10)
    # Senior is tier 2 but sign-off requires tier 3 (manager+)
    assert r.status_code == 403


def test_staff_sees_only_own_assignments():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    requests.post(f"{API}/induction/assignments",
                   json={"staff_id": sid}, headers=_h(t), timeout=10)
    st = _stoken()
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    r = requests.get(f"{API}/induction/assignments", headers=_h(st), timeout=10).json()
    for a in r["assignments"]:
        assert a["staff_id"] == me["id"]

def test_mine_endpoint_returns_active_assignment():
    """Regression: /assignments/mine must not be captured by /assignments/{aid}."""
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    st = _stoken()
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    if me["id"] != sid:
        return  # only one staff -- skip
    r = requests.get(f"{API}/induction/assignments/mine", headers=_h(st), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["assignment"]
    assert body["assignment"]["id"] == a["id"]
    assert body["assignment"]["staff_id"] == me["id"]




def test_manager_delete_assignment():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    st = _stoken()
    r1 = requests.delete(f"{API}/induction/assignments/{a['id']}", headers=_h(st), timeout=10)
    assert r1.status_code == 403
    r2 = requests.delete(f"{API}/induction/assignments/{a['id']}", headers=_h(t), timeout=10)
    assert r2.status_code == 200
