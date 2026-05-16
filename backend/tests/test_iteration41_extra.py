"""Extra iteration 41 coverage — PATCH semantics, listing, sector boundary."""
import os
import requests
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def manager(): return _login("manager@care.local", "Manager@123")
@pytest.fixture(scope="module")
def admin(): return _login("admin@care.local", "Admin@123")
@pytest.fixture(scope="module")
def staff(): return _login("staff@care.local", "Staff@123")
@pytest.fixture(scope="module")
def senior(): return _login("senior@care.local", "Senior@123")


def test_listing_works_for_manager(manager):
    r = requests.get(f"{API}/referrals", headers=manager)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_single_404(manager, staff, senior):
    # 404 for missing
    r = requests.get(f"{API}/referrals/nope-xxx", headers=manager)
    assert r.status_code == 404
    # 403 for low tier
    assert requests.get(f"{API}/referrals/nope-xxx", headers=staff).status_code == 403
    assert requests.get(f"{API}/referrals/nope-xxx", headers=senior).status_code == 403


def test_patch_locked_after_accept(manager, admin):
    # Create
    r = requests.post(f"{API}/referrals", headers=manager,
                      json={"yp_initials": "PATCH1", "needs": ["cse"]})
    assert r.status_code == 200
    rid = r.json()["id"]
    try:
        # Patch works pre-decision (PATCH currently requires full body via ReferralIn)
        full_body = {"yp_initials": "PATCH1", "needs": ["cse"], "reason_for_referral": "Updated reason"}
        r2 = requests.patch(f"{API}/referrals/{rid}", headers=manager, json=full_body)
        assert r2.status_code == 200, r2.text
        # Patch blocked for staff
        assert requests.patch(f"{API}/referrals/{rid}", headers=_login("staff@care.local", "Staff@123"),
                              json=full_body).status_code == 403
        # Accept decision
        rd = requests.post(f"{API}/referrals/{rid}/decision", headers=manager,
                           json={"decision": "accepted", "decision_reason": "Match ok"})
        assert rd.status_code == 200
        # PATCH now blocked
        r3 = requests.patch(f"{API}/referrals/{rid}", headers=manager, json=full_body)
        assert r3.status_code in (400, 409, 403), f"expected lock, got {r3.status_code} body={r3.text}"
    finally:
        requests.delete(f"{API}/referrals/{rid}", headers=admin)


def test_intelligence_factor_chain_present(manager, admin):
    r = requests.post(f"{API}/referrals", headers=manager,
                      json={"yp_initials": "CHAIN", "needs": ["cse", "missing"],
                            "absconding_risk": "high", "exploitation_risk": "high"})
    rid = r.json()["id"]
    try:
        d = requests.get(f"{API}/referrals/{rid}/intelligence", headers=manager).json()
        assert "factor_chain" in d
        assert isinstance(d["factor_chain"], list)
        assert "what_would_need_to_change" in d
        assert isinstance(d["what_would_need_to_change"], list)
        # Embedded home readiness
        assert "home_readiness" in d
        hr = d["home_readiness"]
        assert "tiles" in hr
    finally:
        requests.delete(f"{API}/referrals/{rid}", headers=admin)


def test_decision_conditions_filtered(manager, admin):
    r = requests.post(f"{API}/referrals", headers=manager,
                      json={"yp_initials": "DECF"}).json()
    rid = r["id"]
    try:
        rd = requests.post(f"{API}/referrals/{rid}/decision", headers=manager,
                           json={"decision": "more_info",
                                 "conditions": ["transition_plan", "FAKE_COND"]}).json()
        assert "FAKE_COND" not in rd["conditions"]
        assert "transition_plan" in rd["conditions"]
        # audit trail
        assert any(a.get("action", "").startswith("decision_") for a in rd["audit_trail"])
    finally:
        requests.delete(f"{API}/referrals/{rid}", headers=admin)


def test_decision_blocked_low_tier(manager, admin, staff, senior):
    r = requests.post(f"{API}/referrals", headers=manager,
                      json={"yp_initials": "LOWT"}).json()
    rid = r["id"]
    try:
        for hdr in (staff, senior):
            r2 = requests.post(f"{API}/referrals/{rid}/decision", headers=hdr,
                               json={"decision": "more_info"})
            assert r2.status_code == 403
    finally:
        requests.delete(f"{API}/referrals/{rid}", headers=admin)
