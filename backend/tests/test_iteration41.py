"""Iteration 41 — Placement Intelligence & Matching Engine.

Deterministic, live-operational placement matching. Children's services only.
Manager+ only access.
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


@pytest.fixture(scope="module")
def referral_id(manager):
    payload = {
        "yp_initials": "ZZTEST",
        "yp_full_name": "Zed Test",
        "age": 14, "gender": "male",
        "local_authority": "Camden",
        "social_worker_name": "S Khan",
        "urgency_level": "urgent",
        "legal_status": "S20",
        "reason_for_referral": "Placement breakdown.",
        "needs": ["cse", "trauma", "missing", "aggression"],
        "risk_to_self": "high", "risk_to_others": "medium",
        "absconding_risk": "high", "exploitation_risk": "high",
        "peer_influence_risk": "medium",
        "known_associates": ["JM", "AT"],
        "bed_available": True,
    }
    r = requests.post(f"{API}/referrals", headers=manager, json=payload)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    yield rid
    # cleanup via admin
    admin_hdr = _login("admin@care.local", "Admin@123")
    requests.delete(f"{API}/referrals/{rid}", headers=admin_hdr)


# -----------------------------------------------------------------
# RBAC
# -----------------------------------------------------------------
def test_referral_endpoints_manager_plus_only(staff, senior, manager, admin):
    for hdr in (staff, senior):
        assert requests.get(f"{API}/referrals", headers=hdr).status_code == 403
        assert requests.get(f"{API}/placement-intelligence/home-readiness", headers=hdr).status_code == 403
        assert requests.post(f"{API}/referrals", headers=hdr,
                              json={"yp_initials": "AA"}).status_code == 403
    for hdr in (manager, admin):
        assert requests.get(f"{API}/referrals", headers=hdr).status_code == 200
        assert requests.get(f"{API}/placement-intelligence/home-readiness", headers=hdr).status_code == 200


def test_delete_admin_only(manager, admin, referral_id):
    # Create a throwaway then attempt manager delete
    payload = {"yp_initials": "TMP1"}
    r = requests.post(f"{API}/referrals", headers=manager, json=payload).json()
    tid = r["id"]
    assert requests.delete(f"{API}/referrals/{tid}", headers=manager).status_code == 403
    assert requests.delete(f"{API}/referrals/{tid}", headers=admin).status_code == 200


# -----------------------------------------------------------------
# Home readiness
# -----------------------------------------------------------------
def test_home_readiness_shape(manager):
    d = requests.get(f"{API}/placement-intelligence/home-readiness", headers=manager).json()
    for k in ("generated_at", "score", "overall_readiness", "overall_label",
              "tiles", "factors", "current_residents", "signals_summary"):
        assert k in d
    assert d["overall_readiness"] in ("good", "watch", "elevated", "high_risk")
    tile_keys = {t["key"] for t in d["tiles"]}
    expected = {"emotional_climate", "behaviour_pressure", "missing_trend",
                "safeguarding_pressure", "staffing_readiness"}
    assert tile_keys == expected
    for t in d["tiles"]:
        assert t["status"] in ("good", "watch", "elevated", "high_risk")


def test_home_readiness_deterministic(manager):
    a = requests.get(f"{API}/placement-intelligence/home-readiness", headers=manager).json()
    b = requests.get(f"{API}/placement-intelligence/home-readiness", headers=manager).json()
    assert a["score"] == b["score"]
    assert a["overall_readiness"] == b["overall_readiness"]
    assert [f["label"] for f in a["factors"]] == [f["label"] for f in b["factors"]]


# -----------------------------------------------------------------
# Referral CRUD + intelligence
# -----------------------------------------------------------------
def test_referral_intelligence_shape(manager, referral_id):
    d = requests.get(f"{API}/referrals/{referral_id}/intelligence", headers=manager).json()
    for k in ("generated_at", "matching_confidence", "matching_confidence_label",
              "score", "home_readiness", "group_warnings",
              "what_would_need_to_change", "factor_chain"):
        assert k in d, f"missing {k}"
    assert d["matching_confidence"] in ("strong", "manageable", "elevated", "not_recommended")
    assert isinstance(d["group_warnings"], list)
    for w in d["group_warnings"]:
        for fk in ("domain", "label", "weight", "evidence", "residents"):
            assert fk in w


def test_intelligence_deterministic(manager, referral_id):
    a = requests.get(f"{API}/referrals/{referral_id}/intelligence", headers=manager).json()
    b = requests.get(f"{API}/referrals/{referral_id}/intelligence", headers=manager).json()
    assert a["matching_confidence"] == b["matching_confidence"]
    assert a["score"] == b["score"]


def test_intelligence_explainability(manager, referral_id):
    """Every group warning weight contributes to the overall score deterministically."""
    d = requests.get(f"{API}/referrals/{referral_id}/intelligence", headers=manager).json()
    expected = sum(int(w["weight"]) for w in d["group_warnings"])
    # Score may include home-state amplifier embedded as a group_warning of domain home_state
    assert d["score"] == expected, f"{d['score']} != sum(weights) {expected}"


def test_decision_records_audit(manager, referral_id):
    r = requests.post(f"{API}/referrals/{referral_id}/decision", headers=manager,
                      json={"decision": "more_info",
                            "decision_reason": "Need more clarity",
                            "conditions": ["safeguarding_meeting", "transition_plan"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["decision"] == "more_info"
    assert set(d["conditions"]) >= {"safeguarding_meeting", "transition_plan"}
    assert any(a.get("action", "").startswith("decision_") for a in d["audit_trail"])


def test_unknown_needs_filtered(manager):
    r = requests.post(f"{API}/referrals", headers=manager, json={
        "yp_initials": "JUNK", "needs": ["cse", "FAKE_NEED", "trauma"],
        "conditions": ["safeguarding_meeting", "EVIL"],
    })
    assert r.status_code == 200
    d = r.json()
    assert "FAKE_NEED" not in d["needs"]
    assert "EVIL" not in d["conditions"]
    # cleanup
    admin = _login("admin@care.local", "Admin@123")
    requests.delete(f"{API}/referrals/{d['id']}", headers=admin)


def test_pdf_downloadable_by_manager(manager, referral_id):
    r = requests.get(f"{API}/referrals/{referral_id}/pdf", headers=manager)
    assert r.status_code == 200
    assert r.content[:5] == b"%PDF-"
    assert len(r.content) > 1000


def test_pdf_blocked_for_senior(senior, referral_id):
    r = requests.get(f"{API}/referrals/{referral_id}/pdf", headers=senior)
    assert r.status_code == 403


def test_unknown_referral_404(manager):
    assert requests.get(f"{API}/referrals/does-not-exist", headers=manager).status_code == 404
    assert requests.get(f"{API}/referrals/does-not-exist/intelligence", headers=manager).status_code == 404
    assert requests.get(f"{API}/referrals/does-not-exist/pdf", headers=manager).status_code == 404
