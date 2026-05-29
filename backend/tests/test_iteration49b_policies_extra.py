"""Phase H supplementary tests — RBAC edge cases + audit events."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
API = f"{BASE.rstrip('/')}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def test_categories_all_authed_can_view():
    """All authed roles should be able to read policy categories."""
    for who in [("staff@care.local", "Staff@123"),
                ("senior@care.local", "Senior@123"),
                ("manager@care.local", "Manager@123"),
                ("admin@care.local", "Admin@123")]:
        t = _login(*who)
        r = requests.get(f"{API}/policy-categories?sector=children", headers=_h(t), timeout=10)
        assert r.status_code == 200, f"{who[0]} should read categories, got {r.status_code}"


def test_categories_exact_counts():
    """Children's = 21 categories, adult = 16."""
    t = _login("manager@care.local", "Manager@123")
    r = requests.get(f"{API}/policy-categories?sector=children", headers=_h(t), timeout=10)
    assert r.json()["count"] == 21
    r2 = requests.get(f"{API}/policy-categories?sector=adult", headers=_h(t), timeout=10)
    assert r2.json()["count"] == 16


def test_folder_rag_status_values_valid():
    t = _login("manager@care.local", "Manager@123")
    r = requests.get(f"{API}/policies/folders?sector=children", headers=_h(t), timeout=10)
    body = r.json()
    valid = {"green", "amber", "red", "grey"}
    for f in body["folders"]:
        assert f["rag_status"] in valid, f"Invalid rag_status: {f['rag_status']}"


def test_staff_cannot_open_others_assignment():
    """Staff opening another user's assignment must 403."""
    mt = _login("manager@care.local", "Manager@123")
    st = _login("staff@care.local", "Staff@123")
    # Create a policy + assign to SENIOR
    pid = requests.post(f"{API}/policies", headers=_h(mt), json={
        "title": "Cross-staff RBAC test", "category": "Safeguarding", "sector": "children",
    }, timeout=10).json()["id"]
    requests.post(f"{API}/policies/{pid}/versions", headers=_h(mt), json={"version": "1.0"}, timeout=10)
    sen_t = _login("senior@care.local", "Senior@123")
    sen_id = requests.get(f"{API}/auth/me", headers=_h(sen_t), timeout=10).json()["id"]
    aid = requests.post(f"{API}/policy-assignments", headers=_h(mt), json={
        "policy_id": pid, "staff_id": sen_id,
    }, timeout=10).json()["id"]
    # staff tries to open senior's assignment
    r = requests.post(f"{API}/policy-assignments/{aid}/open", headers=_h(st), timeout=10)
    assert r.status_code == 403


def test_audit_events_written_for_lifecycle():
    """Audit log should record policy_created, policy_assigned, etc."""
    mt = _login("manager@care.local", "Manager@123")
    # Try audit-log endpoints commonly seen in this project
    pid = requests.post(f"{API}/policies", headers=_h(mt), json={
        "title": "Audit probe policy", "category": "Fire Safety", "sector": "children",
    }, timeout=10).json()["id"]
    # Look at audit endpoint
    candidates = [f"{API}/audit?limit=200"]
    found_actions = set()
    for url in candidates:
        try:
            r = requests.get(url, headers=_h(mt), timeout=10)
            if r.status_code == 200:
                body = r.json()
                entries = body.get("items") if isinstance(body, dict) else body
                for e in entries or []:
                    act = e.get("action") or e.get("event_type")
                    if act:
                        found_actions.add(act)
                break
        except Exception:
            continue
    # Verify policy_created at minimum (others depend on full lifecycle elsewhere)
    assert "policy_created" in found_actions, f"policy_created not found in audit; actions seen: {found_actions}"
