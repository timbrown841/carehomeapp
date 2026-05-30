"""Tests for Phase E.3.2 — Role-specific templates + Unified Compliance Dashboard."""
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


# === Role-specific templates ===

def test_templates_list():
    t = _mtoken()
    r = requests.get(f"{API}/induction/templates", headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    ids = {x["id"] for x in body["templates"]}
    assert {"children_worker", "adult_worker", "manager"}.issubset(ids)
    for tpl in body["templates"]:
        assert tpl["section_count"] >= 16


def test_template_detail():
    t = _mtoken()
    r = requests.get(f"{API}/induction/templates/children_worker", headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    keys = {s["key"] for s in body["sections"]}
    # Base + children extras
    assert "cse_awareness" in keys
    assert "pace_practice" in keys
    assert "trauma_informed_practice" in keys
    assert "childrens_home_regs" in keys


def test_template_recommend_for_staff_role():
    t = _mtoken()
    sid = _first_staff_id()
    r = requests.get(f"{API}/induction/recommend-template?staff_id={sid}&sector=children",
                      headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["recommended_template_id"] in ("children_worker", "adult_worker", "manager")
    # Phase E.3.2 — estimated time exposed
    assert body.get("section_count", 0) >= 16
    assert body.get("estimated_completion")


def test_templates_expose_estimated_time():
    t = _mtoken()
    body = requests.get(f"{API}/induction/templates", headers=_h(t), timeout=10).json()
    for tpl in body["templates"]:
        assert tpl.get("estimated_hours")
        assert tpl.get("estimated_completion")


def test_manager_template_includes_safer_recruitment_and_supervision():
    """Manager Induction must include Leadership/Supervision/Audits/Compliance/
    Investigations/Safer Recruitment/Inspection Readiness/Workforce Management."""
    t = _mtoken()
    body = requests.get(f"{API}/induction/templates/manager", headers=_h(t), timeout=10).json()
    keys = {s["key"] for s in body["sections"]}
    for k in ("leadership", "supervision_leadership", "compliance_audits",
              "investigations", "safer_recruitment", "workforce_management",
              "inspection_readiness", "supervision"):
        assert k in keys, f"manager induction missing {k}"


def test_assignment_uses_recommended_template():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    r = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid, "sector": "children"},
                       headers=_h(t), timeout=10).json()
    assert r["template_id"] == "children_worker"
    assert "Children's Residential Worker Induction" in r["template_label"]


def test_assignment_explicit_template_overrides():
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    r = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid, "sector": "children",
                              "template_id": "manager"},
                       headers=_h(t), timeout=10).json()
    assert r["template_id"] == "manager"
    keys = {it["key"] for it in r["items"]}
    assert "leadership" in keys
    assert "compliance_audits" in keys
    assert "inspection_readiness" in keys


def test_assignment_adult_template_when_adult_sector():
    """No explicit template_id + sector=adult => adult_worker (unless role-overrides)."""
    sid = _first_staff_id()
    _ensure_no_active_for(sid)
    t = _mtoken()
    r = requests.post(f"{API}/induction/assignments",
                       json={"staff_id": sid, "sector": "adult"},
                       headers=_h(t), timeout=10).json()
    # First staff role is 'staff' -> not a manager keyword, so adult sector => adult_worker
    assert r["template_id"] == "adult_worker"
    keys = {it["key"] for it in r["items"]}
    assert "mca_practice" in keys
    assert "dols" in keys


# === Unified Compliance Dashboard ===

def test_unified_compliance_dashboard_children():
    t = _mtoken()
    r = requests.get(f"{API}/compliance/unified-dashboard?sector=children",
                      headers=_h(t), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    # 7 KPI fields
    for k in ("policy_pct", "acknowledgement_pct", "training_pct",
              "supervision_pct", "induction_pct", "workforce_readiness_pct",
              "regulator_readiness_pct"):
        assert k in body, f"missing KPI {k}"
        assert 0 <= body[k] <= 100
    # Sector-aware labels
    assert body["sector"] == "children"
    assert body["regulator"] == "ofsted"
    assert body["readiness_label"] == "Ofsted Readiness"
    # RAG block
    for k in ("policy", "acknowledgement", "training", "supervision",
              "induction", "workforce_readiness", "regulator_readiness"):
        assert body["rag"][k] in ("red", "amber", "green")
    # Widgets
    for k in ("policies_due_review", "overdue_policies",
              "outstanding_acknowledgements", "inductions_at_risk",
              "training_cliff_edge", "compliance_trend"):
        assert k in body["widgets"], f"missing widget {k}"


def test_unified_compliance_dashboard_adult_shows_cqc():
    t = _mtoken()
    r = requests.get(f"{API}/compliance/unified-dashboard?sector=adult",
                      headers=_h(t), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["sector"] == "adult"
    assert body["regulator"] == "cqc"
    assert body["readiness_label"] == "CQC Readiness"


def test_unified_compliance_dashboard_rbac():
    st = _stoken()
    r = requests.get(f"{API}/compliance/unified-dashboard?sector=children",
                      headers=_h(st), timeout=10)
    assert r.status_code == 403


def test_unified_compliance_dashboard_invalid_sector():
    t = _mtoken()
    r = requests.get(f"{API}/compliance/unified-dashboard?sector=bogus",
                      headers=_h(t), timeout=10)
    assert r.status_code == 422
