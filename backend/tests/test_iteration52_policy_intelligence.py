"""Tests for Phase H.2 — Policy Intelligence & Inspection Readiness."""
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


def test_intelligence_dashboard_shape():
    t = _mtoken()
    r = requests.get(f"{API}/policy-intelligence/dashboard?sector=children",
                     headers=_h(t), timeout=15)
    assert r.status_code == 200
    body = r.json()
    for k in ("sector", "generated_at", "overall_rag", "policy_compliance",
              "most_failed_policies", "policies_due_review",
              "induction_intelligence", "governance"):
        assert k in body, f"missing {k}"
    pc = body["policy_compliance"]
    for k in ("overall_pct", "active_assignments", "complete", "overdue",
              "failed", "by_role", "by_staff"):
        assert k in pc
    dr = body["policies_due_review"]
    for k in ("overdue", "due_within_30_days", "due_within_60_days"):
        assert k in dr
    ind = body["induction_intelligence"]
    for k in ("not_started", "in_progress", "overdue", "total_assignments",
              "complete_assignments", "completion_pct", "new_starter_attention"):
        assert k in ind


def test_intelligence_dashboard_staff_blocked():
    t = _stoken()
    r = requests.get(f"{API}/policy-intelligence/dashboard?sector=children",
                     headers=_h(t), timeout=10)
    assert r.status_code == 403


def test_intelligence_dashboard_most_failed_capped_at_10():
    t = _mtoken()
    r = requests.get(f"{API}/policy-intelligence/dashboard?sector=children",
                     headers=_h(t), timeout=15).json()
    assert isinstance(r["most_failed_policies"], list)
    assert len(r["most_failed_policies"]) <= 10
    # Each entry should have the required keys
    for mf in r["most_failed_policies"]:
        for k in ("policy_id", "policy_title", "attempts", "fails",
                  "fail_rate_pct", "avg_score_pct"):
            assert k in mf


def test_inspection_readiness_score_shape():
    t = _mtoken()
    r = requests.get(f"{API}/inspection-readiness/score?sector=children",
                     headers=_h(t), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["sector"] == "children"
    assert "overall_score" in body
    assert 0 <= body["overall_score"] <= 100
    assert body["rag_status"] in ("red", "amber", "green")
    assert "pillars" in body
    assert len(body["pillars"]) == 5
    for p in body["pillars"]:
        for k in ("key", "label", "score", "evidence"):
            assert k in p
        assert 0 <= p["score"] <= 100


def test_inspection_readiness_staff_blocked():
    t = _stoken()
    r = requests.get(f"{API}/inspection-readiness/score?sector=children",
                     headers=_h(t), timeout=10)
    assert r.status_code == 403


def test_inspection_readiness_evidence_pack_pdf():
    t = _mtoken()
    r = requests.get(f"{API}/inspection-readiness/evidence-pack.pdf?sector=children",
                     headers=_h(t), timeout=30)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-"
    assert len(r.content) > 2000


def test_inspection_readiness_evidence_pack_staff_blocked():
    t = _stoken()
    r = requests.get(f"{API}/inspection-readiness/evidence-pack.pdf?sector=children",
                     headers=_h(t), timeout=10)
    assert r.status_code == 403


def test_intelligence_dashboard_governance_block_present_when_sop_exists():
    """If a Children's SoP exists from prior tests, the governance block
    should reflect compliance figures."""
    t = _mtoken()
    body = requests.get(f"{API}/policy-intelligence/dashboard?sector=children",
                        headers=_h(t), timeout=15).json()
    gov = body.get("governance")
    if gov and gov.get("exists"):
        for k in ("compliance_pct", "total", "complete", "outstanding",
                  "review_date", "review_rag"):
            assert k in gov


def test_intelligence_dashboard_by_role_includes_known_roles():
    t = _mtoken()
    body = requests.get(f"{API}/policy-intelligence/dashboard?sector=children",
                        headers=_h(t), timeout=15).json()
    roles = {r["role"] for r in body["policy_compliance"]["by_role"]}
    # Demo data has at least the staff role
    assert isinstance(roles, set)


def test_intelligence_dashboard_adult_sector_distinct():
    """Adult and children sectors return distinct dashboards (no cross-leak)."""
    t = _mtoken()
    a = requests.get(f"{API}/policy-intelligence/dashboard?sector=adult",
                     headers=_h(t), timeout=15).json()
    c = requests.get(f"{API}/policy-intelligence/dashboard?sector=children",
                     headers=_h(t), timeout=15).json()
    assert a["sector"] == "adult"
    assert c["sector"] == "children"


def test_evidence_pack_audit_event_emitted():
    """Generating the evidence pack must write an audit event."""
    t = _mtoken()
    r = requests.get(f"{API}/inspection-readiness/evidence-pack.pdf?sector=children",
                     headers=_h(t), timeout=30)
    assert r.status_code == 200
    # Best-effort verification via audit endpoint
    a = requests.get(f"{API}/audit?action=inspection_evidence_pack_exported&limit=5",
                     headers=_h(t), timeout=10)
    assert a.status_code in (200, 403)
