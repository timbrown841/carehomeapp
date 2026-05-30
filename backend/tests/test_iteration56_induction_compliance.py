"""Tests for Phase E.3.1 — Induction Compliance & Ofsted Evidence."""
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


def _staff_ids():
    t = _mtoken()
    users = requests.get(f"{API}/auth/users", headers=_h(t), timeout=10).json()
    users = users if isinstance(users, list) else users.get("users", [])
    return [u["id"] for u in users if u.get("role") == "staff"]


def _ensure_no_active_for(sid):
    t = _mtoken()
    lst = requests.get(f"{API}/induction/assignments?staff_id={sid}",
                        headers=_h(t), timeout=10).json()
    for a in lst.get("assignments", []):
        if not a.get("signed_off_at"):
            requests.delete(f"{API}/induction/assignments/{a['id']}",
                            headers=_h(t), timeout=10)


def _plus(days):
    return (date.today() + timedelta(days=days)).isoformat()


# === Risk model ===

def test_risk_green_no_target():
    """No target_completion => green regardless of progress."""
    sid = _staff_ids()[0]
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    fetched = requests.get(f"{API}/induction/assignments/{a['id']}",
                            headers=_h(t), timeout=10).json()
    assert fetched["risk"] == "green"


def test_risk_amber_due_within_7d():
    sid = _staff_ids()[0]
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid, "target_completion": _plus(3)},
                       headers=_h(t), timeout=10).json()
    assert a.get("risk") in (None,)  # POST does not include risk; refetch
    fetched = requests.get(f"{API}/induction/assignments/{a['id']}",
                            headers=_h(t), timeout=10).json()
    assert fetched["risk"] == "amber"


def test_risk_red_overdue():
    sid = _staff_ids()[0]
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid, "target_completion": _plus(-5)},
                       headers=_h(t), timeout=10).json()
    fetched = requests.get(f"{API}/induction/assignments/{a['id']}",
                            headers=_h(t), timeout=10).json()
    assert fetched["risk"] == "red"


def test_risk_green_signed_off_regardless_of_target():
    """Signed-off inductions are always green."""
    sids = _staff_ids()
    sid = sids[0]
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid, "target_completion": _plus(-10)},
                       headers=_h(t), timeout=10).json()
    # Complete all 16 items + sign off
    for item in a["items"]:
        requests.patch(f"{API}/induction/assignments/{a['id']}/items/{item['key']}",
                       json={"status": "completed"}, headers=_h(t), timeout=10)
    requests.post(f"{API}/induction/assignments/{a['id']}/sign-off",
                  json={"declaration": "Done"}, headers=_h(t), timeout=10)
    fetched = requests.get(f"{API}/induction/assignments/{a['id']}",
                            headers=_h(t), timeout=10).json()
    assert fetched["risk"] == "green"


# === Dashboard ===

def test_dashboard_shape_and_rbac():
    t = _mtoken()
    r = requests.get(f"{API}/induction/dashboard", headers=_h(t), timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("today", "total", "signed_off", "in_progress", "compliance_pct",
              "due_this_week", "overdue", "at_risk", "recently_completed"):
        assert k in body, f"missing {k}"
    # Staff blocked
    st = _stoken()
    r2 = requests.get(f"{API}/induction/dashboard", headers=_h(st), timeout=10)
    assert r2.status_code == 403


def test_dashboard_overdue_includes_red_assignment():
    sid = _staff_ids()[0]
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid, "target_completion": _plus(-10)},
                       headers=_h(t), timeout=10).json()
    dash = requests.get(f"{API}/induction/dashboard", headers=_h(t), timeout=10).json()
    overdue_ids = {r["id"] for r in dash["overdue"]}
    at_risk_ids = {r["id"] for r in dash["at_risk"]}
    assert a["id"] in overdue_ids
    assert a["id"] in at_risk_ids


def test_dashboard_due_this_week_amber():
    sid = _staff_ids()[0]
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid, "target_completion": _plus(4)},
                       headers=_h(t), timeout=10).json()
    dash = requests.get(f"{API}/induction/dashboard", headers=_h(t), timeout=10).json()
    due_ids = {r["id"] for r in dash["due_this_week"]}
    at_risk_ids = {r["id"] for r in dash["at_risk"]}
    assert a["id"] in due_ids
    assert a["id"] in at_risk_ids


# === Certificate PDF ===

def test_certificate_pdf_requires_signoff():
    sid = _staff_ids()[0]
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    # Not signed off yet
    r = requests.get(f"{API}/induction/assignments/{a['id']}/certificate.pdf",
                       headers=_h(t), timeout=10)
    assert r.status_code == 400


def test_certificate_pdf_after_signoff():
    sid = _staff_ids()[0]
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    for it in a["items"]:
        requests.patch(f"{API}/induction/assignments/{a['id']}/items/{it['key']}",
                       json={"status": "completed"}, headers=_h(t), timeout=10)
    so = requests.post(f"{API}/induction/assignments/{a['id']}/sign-off",
                       json={"declaration": "Ready"}, headers=_h(t), timeout=10).json()
    assert so["signed_off"] is True
    assert so.get("hr_file_id"), "HR file should be auto-attached on sign-off"
    # PDF is valid
    r = requests.get(f"{API}/induction/assignments/{a['id']}/certificate.pdf",
                      headers=_h(t), timeout=15)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1000


def test_certificate_pdf_staff_can_download_own():
    """Staff downloading own certificate works (only when signed off)."""
    sid = _staff_ids()[0]
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    for it in a["items"]:
        requests.patch(f"{API}/induction/assignments/{a['id']}/items/{it['key']}",
                       json={"status": "completed"}, headers=_h(t), timeout=10)
    requests.post(f"{API}/induction/assignments/{a['id']}/sign-off",
                  json={"declaration": "Done"}, headers=_h(t), timeout=10)
    st = _stoken()
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    if me["id"] != sid:
        return
    r = requests.get(f"{API}/induction/assignments/{a['id']}/certificate.pdf",
                      headers=_h(st), timeout=15)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"


# === HR file linkage ===

def test_signoff_attaches_to_hr_induction_folder():
    sid = _staff_ids()[0]
    _ensure_no_active_for(sid)
    t = _mtoken()
    a = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid}, headers=_h(t), timeout=10).json()
    for it in a["items"]:
        requests.patch(f"{API}/induction/assignments/{a['id']}/items/{it['key']}",
                       json={"status": "completed"}, headers=_h(t), timeout=10)
    so = requests.post(f"{API}/induction/assignments/{a['id']}/sign-off",
                       json={"declaration": "Done"}, headers=_h(t), timeout=10).json()
    hr_file_id = so.get("hr_file_id")
    assert hr_file_id
    # The HR staff profile should expose this file under the 'induction' folder
    prof = requests.get(f"{API}/hr/staff/{sid}", headers=_h(t), timeout=10).json()
    all_files = []
    for tab in prof.get("tabs", []):
        for folder in tab.get("folders", []):
            if folder.get("id") == "induction":
                all_files = folder.get("files", [])
                break
    found = [f for f in all_files if f.get("id") == hr_file_id]
    assert found, f"Induction certificate {hr_file_id} should appear in HR induction folder; got {len(all_files)} files"


# === Staff profile summary ===

def test_staff_induction_summary():
    sid = _staff_ids()[0]
    t = _mtoken()
    r = requests.get(f"{API}/induction/staff/{sid}/summary", headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["staff_id"] == sid
    assert "assignments" in body and "count" in body
    if body["count"]:
        a = body["assignments"][0]
        for k in ("id", "completion_pct", "complete", "total", "overall_status",
                  "risk", "outstanding"):
            assert k in a


def test_staff_summary_rbac():
    """Staff can only see their own summary."""
    sids = _staff_ids()
    sid_other = sids[0]
    st = _stoken()
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    if me["id"] == sid_other:
        return  # only one staff
    r = requests.get(f"{API}/induction/staff/{sid_other}/summary",
                       headers=_h(st), timeout=10)
    assert r.status_code == 403


# === Ofsted evidence pack ===

def test_inspection_pack_summary():
    t = _mtoken()
    r = requests.get(f"{API}/induction/inspection-pack", headers=_h(t), timeout=15)
    assert r.status_code == 200
    body = r.json()
    for k in ("today", "total_staff", "fully_inducted", "in_progress",
              "overdue", "no_induction", "compliance_pct", "rows"):
        assert k in body
    # Counts add up
    assert body["fully_inducted"] + body["in_progress"] + body["no_induction"] == body["total_staff"]


def test_inspection_pack_rbac():
    st = _stoken()
    r = requests.get(f"{API}/induction/inspection-pack", headers=_h(st), timeout=10)
    assert r.status_code == 403


def test_inspection_pack_pdf():
    t = _mtoken()
    r = requests.get(f"{API}/induction/inspection-pack.pdf", headers=_h(t), timeout=30)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1000


# === Workforce readiness reweighting ===

def test_readiness_uses_new_weights():
    t = _mtoken()
    r = requests.get(f"{API}/training-centre/dashboard?sector=children",
                      headers=_h(t), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "readiness_weights" in body
    w = body["readiness_weights"]
    assert w == {"mandatory_training": 60, "induction": 15,
                  "qualifications": 10, "supervision": 15}
    assert "induction" in body and "compliance_pct" in body["induction"]
    assert "supervision" in body and "compliance_pct" in body["supervision"]
    # Score is 0..100
    assert 0 <= body["readiness_score"] <= 100
