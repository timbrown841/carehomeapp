"""Iteration 27 — Sidebar lockdown + Admin endpoints + Hub navigation tests."""
import os
import requests

API = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- Admin system-info ----------
def test_system_info_manager_ok():
    t = _login("manager@care.local", "Manager@123")
    r = requests.get(f"{API}/admin/system-info", headers=_h(t))
    assert r.status_code == 200
    d = r.json()
    for k in ["users_total", "users_by_role", "residents_total", "incidents_total",
              "notes_total", "audit_events_total", "compliance_logs_total"]:
        assert k in d


def test_system_info_staff_forbidden():
    t = _login("staff@care.local", "Staff@123")
    r = requests.get(f"{API}/admin/system-info", headers=_h(t))
    assert r.status_code == 403


def test_system_info_senior_forbidden():
    t = _login("senior@care.local", "Senior@123")
    r = requests.get(f"{API}/admin/system-info", headers=_h(t))
    assert r.status_code == 403


# ---------- Admin user CRUD ----------
def test_create_user_manager_ok_then_admin_can_delete():
    mgr = _login("manager@care.local", "Manager@123")
    admin = _login("admin@care.local", "Admin@123")

    payload = {
        "name": "Iter27 Test User",
        "email": "iter27_test@care.local",
        "password": "Iter27@123",
        "role": "staff",
    }
    # Cleanup if leftover
    users = requests.get(f"{API}/auth/users", headers=_h(admin)).json()
    leftover = next((u for u in users if u["email"] == payload["email"]), None)
    if leftover:
        requests.delete(f"{API}/admin/users/{leftover['id']}", headers=_h(admin))

    r = requests.post(f"{API}/admin/users", headers=_h(mgr), json=payload)
    assert r.status_code == 200, r.text
    new_id = r.json()["id"]
    assert r.json()["role"] == "staff"
    assert "password_hash" not in r.json()

    # Duplicate email
    r2 = requests.post(f"{API}/admin/users", headers=_h(mgr), json=payload)
    assert r2.status_code == 400

    # Manager cannot create admin
    r3 = requests.post(f"{API}/admin/users", headers=_h(mgr), json={
        "name": "Bad Admin", "email": "badadmin_27@care.local",
        "password": "Test@123", "role": "admin",
    })
    assert r3.status_code == 403

    # Staff cannot delete
    staff = _login("staff@care.local", "Staff@123")
    r4 = requests.delete(f"{API}/admin/users/{new_id}", headers=_h(staff))
    assert r4.status_code == 403

    # Manager cannot delete (admin only)
    r5 = requests.delete(f"{API}/admin/users/{new_id}", headers=_h(mgr))
    assert r5.status_code == 403

    # Admin can delete
    r6 = requests.delete(f"{API}/admin/users/{new_id}", headers=_h(admin))
    assert r6.status_code == 200
    assert r6.json()["deleted"] == 1


def test_admin_cannot_delete_self():
    admin = _login("admin@care.local", "Admin@123")
    me = requests.get(f"{API}/auth/me", headers=_h(admin)).json()
    r = requests.delete(f"{API}/admin/users/{me['id']}", headers=_h(admin))
    assert r.status_code == 400


def test_create_user_validation():
    mgr = _login("manager@care.local", "Manager@123")
    # Bad email
    r = requests.post(f"{API}/admin/users", headers=_h(mgr), json={
        "name": "X", "email": "not-an-email", "password": "Test@123", "role": "staff",
    })
    assert r.status_code in (400, 422)
    # Short password
    r = requests.post(f"{API}/admin/users", headers=_h(mgr), json={
        "name": "X", "email": "x_27@care.local", "password": "x", "role": "staff",
    })
    assert r.status_code in (400, 422)


# ---------- Audit trail captures admin actions ----------
def test_admin_user_create_audit():
    mgr = _login("manager@care.local", "Manager@123")
    admin = _login("admin@care.local", "Admin@123")
    senior = _login("senior@care.local", "Senior@123")

    # Create + delete to leave a clean trail
    payload = {
        "name": "Audit Probe", "email": "audit_probe_27@care.local",
        "password": "Probe@123", "role": "staff",
    }
    r = requests.post(f"{API}/admin/users", headers=_h(mgr), json=payload)
    new_id = r.json()["id"]
    requests.delete(f"{API}/admin/users/{new_id}", headers=_h(admin))

    # Audit visible to senior+
    r = requests.get(f"{API}/audit", headers=_h(senior),
                     params={"object_type": "user", "limit": 50})
    assert r.status_code == 200
    items = r.json()["items"]
    actions = [a for a in items if a["object_id"] == new_id]
    assert any(a["action"] == "admin_user_create" for a in actions)
    assert any(a["action"] == "admin_user_delete" for a in actions)


# ---------- Regression: legacy direct routes still served ----------
def test_legacy_routes_alive():
    """Old direct sidebar routes should still serve content (kept for old links/bookmarks)."""
    t = _login("staff@care.local", "Staff@123")
    # These backend endpoints power the legacy frontend pages — make sure they didn't regress.
    for path in ["/residents", "/notes", "/incidents", "/visits",
                 "/auth/me", "/dashboard/stats"]:
        r = requests.get(f"{API}{path}", headers=_h(t))
        assert r.status_code == 200, f"{path} -> {r.status_code}"
