"""Iteration 12 — Resident profile (8 tabs) + Missing-from-Care Rapid Response Pack."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://safeguard-dash-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def manager_token():
    return _login("manager@care.local", "Manager@123")


@pytest.fixture(scope="session")
def staff_token():
    return _login("staff@care.local", "Staff@123")


@pytest.fixture(scope="session")
def residents(staff_token):
    r = requests.get(f"{API}/residents", headers=_h(staff_token), timeout=15)
    assert r.status_code == 200
    return r.json()


# ---- Resident profile (8-tab) richness ----
class TestResidentProfile:
    def test_residents_have_legal_status_seeded(self, residents):
        seeded = [r for r in residents if r["name"] in ("Jordan Reilly", "Aisha Khan", "Leo Martinez", "Maddy O'Brien")]
        assert len(seeded) == 4, f"expected 4 seeded residents, got {[r['name'] for r in seeded]}"
        for r in seeded:
            assert r.get("legal_status"), f"{r['name']} missing legal_status — auto-reseed didn't run"

    def test_get_resident_full_profile(self, staff_token, residents):
        maddy = next((r for r in residents if r["name"] == "Maddy O'Brien"), None)
        assert maddy, "Maddy O'Brien not seeded"
        r = requests.get(f"{API}/residents/{maddy['id']}", headers=_h(staff_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # Overview
        for k in ["preferred_name", "dob", "gender", "placement_date", "legal_status",
                  "local_authority", "key_worker", "social_worker_name", "social_worker_contact"]:
            assert d.get(k), f"missing overview field {k}"
        # Background
        for k in ["referral_reason", "placement_history", "family_background",
                  "education_background", "trauma_history", "professional_involvement", "presenting_needs"]:
            assert d.get(k), f"missing background field {k}"
        # Risk
        assert d.get("risk_level") == "high"
        risks = d.get("risks") or {}
        for k in ["self_harm", "absconding", "aggression", "substance", "cse", "mental_health", "medical"]:
            assert k in risks, f"missing risk category {k}"
        assert d.get("risk_next_review") == "2026-02-26"  # OVERDUE
        assert isinstance(d.get("risk_triggers"), list)
        assert isinstance(d.get("protective_factors"), list)
        # Care plan
        for k in ["emotional_support", "behaviour_strategies", "education_support",
                  "health_needs", "independence_skills", "contact_arrangements",
                  "goals_outcomes", "staff_guidance"]:
            assert k in d, f"missing care field {k}"
        # Missing/Philomena
        for k in ["height", "build", "hair", "eyes", "distinguishing_marks", "usual_clothing",
                  "known_locations", "known_associates", "family_contacts",
                  "missing_triggers", "safety_plan"]:
            assert k in d, f"missing philomena field {k}"
        # Medical
        med = d.get("medical") or {}
        for k in ["nhs_number", "gp", "allergies", "diagnoses", "current_medication",
                  "schedule", "prn", "appointments", "conditions", "emergency_notes"]:
            assert k in med, f"missing medical field {k}"
        # Emergency contacts
        ec = d.get("emergency_contacts") or []
        assert len(ec) >= 1
        assert ec[0].get("name") and ec[0].get("phone")

    def test_get_resident_404(self, staff_token):
        r = requests.get(f"{API}/residents/does-not-exist", headers=_h(staff_token), timeout=15)
        assert r.status_code == 404

    def test_patch_resident_manager_persists(self, manager_token, residents):
        leo = next((r for r in residents if r["name"] == "Leo Martinez"), None)
        assert leo
        r = requests.patch(
            f"{API}/residents/{leo['id']}",
            headers=_h(manager_token),
            json={"placement_summary": "TEST_iter12 updated summary"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["placement_summary"] == "TEST_iter12 updated summary"
        # GET to verify persistence
        g = requests.get(f"{API}/residents/{leo['id']}", headers=_h(manager_token), timeout=15)
        assert g.status_code == 200
        assert g.json()["placement_summary"] == "TEST_iter12 updated summary"

    def test_patch_resident_staff_forbidden(self, staff_token, residents):
        leo = next((r for r in residents if r["name"] == "Leo Martinez"), None)
        r = requests.patch(
            f"{API}/residents/{leo['id']}",
            headers=_h(staff_token),
            json={"placement_summary": "STAFF_should_fail"},
            timeout=15,
        )
        assert r.status_code == 403


# ---- Resident timeline ----
class TestResidentTimeline:
    def test_timeline_returns_items(self, staff_token, residents):
        leo = next((r for r in residents if r["name"] == "Leo Martinez"), None)
        r = requests.get(f"{API}/residents/{leo['id']}/timeline", headers=_h(staff_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d
        assert isinstance(d["items"], list)
        assert len(d["items"]) >= 1, "Leo should have at least one seeded note/incident"
        for it in d["items"]:
            assert it["kind"] in ("incident", "note", "missing")
            assert it.get("at")
            assert it.get("title")
        # Sorted desc by 'at'
        ats = [it["at"] for it in d["items"] if it.get("at")]
        assert ats == sorted(ats, reverse=True)


# ---- Missing-from-Care / Rapid Response Pack ----
class TestMissingPack:
    def test_open_episode_creates_share_token_and_incident(self, manager_token, residents):
        maddy = next((r for r in residents if r["name"] == "Maddy O'Brien"), None)
        # Get incident count before
        before = requests.get(f"{API}/incidents", headers=_h(manager_token),
                              params={"resident_id": maddy["id"]}, timeout=15).json()
        before_count = len(before)

        payload = {
            "last_seen_location": "TEST_Piccadilly Gardens",
            "last_seen_at": "2026-01-15T18:30:00+00:00",
            "clothing_last_seen": "Hoodie + leggings",
            "notes": "TEST_iter12 missing pack open",
        }
        r = requests.post(f"{API}/residents/{maddy['id']}/missing", headers=_h(manager_token),
                          json=payload, timeout=15)
        assert r.status_code == 200, r.text
        ep = r.json()
        assert ep["resident_id"] == maddy["id"]
        assert ep["share_token"] and len(ep["share_token"]) >= 20
        assert ep["status"] == "open"
        assert ep.get("reported_by_name")
        tl = ep.get("timeline") or []
        assert any(t.get("event") == "reported_missing" for t in tl)
        pytest.episode_id = ep["id"]
        pytest.share_token = ep["share_token"]

        # Auto-created safeguarding incident exists
        after = requests.get(f"{API}/incidents", headers=_h(manager_token),
                             params={"resident_id": maddy["id"]}, timeout=15).json()
        assert len(after) == before_count + 1, "missing-pack should auto-create one safeguarding incident"
        new_inc = [i for i in after if i["id"] not in {x["id"] for x in before}][0]
        assert new_inc["safeguarding"] is True
        assert new_inc["category"] == "missing"
        assert new_inc["incident_type"] == "absconding"

    def test_patch_episode_police_notified(self, manager_token):
        eid = pytest.episode_id
        r = requests.patch(f"{API}/missing/{eid}", headers=_h(manager_token),
                           json={"police_notified_at": "2026-01-15T19:00:00+00:00",
                                 "police_reference": "TEST_GMP-12345"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["police_notified_at"]
        assert d["police_reference"] == "TEST_GMP-12345"
        events = [t.get("event") for t in (d.get("timeline") or [])]
        assert "police_notified" in events

    def test_patch_episode_returned_sets_status(self, manager_token):
        eid = pytest.episode_id
        r = requests.patch(f"{API}/missing/{eid}", headers=_h(manager_token),
                           json={"returned_at": "2026-01-15T22:30:00+00:00",
                                 "return_interview": "TEST_safe and well"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["returned_at"]
        assert d["status"] == "returned"
        events = [t.get("event") for t in (d.get("timeline") or [])]
        assert "returned" in events

    def test_episode_pdf_authenticated(self, manager_token):
        eid = pytest.episode_id
        r = requests.get(f"{API}/missing/{eid}/pdf", headers=_h(manager_token), timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert "Safelyn_Missing_Pack" in r.headers.get("content-disposition", "")

    def test_share_link_no_auth(self):
        token = pytest.share_token
        r = requests.get(f"{API}/missing/share/{token}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "episode" in d and "resident" in d
        assert d["episode"]["share_token"] == token
        assert d["resident"]["name"] == "Maddy O'Brien"
        # Must include physical description, known_locations, medical, emergency_contacts
        for k in ["height", "build", "hair", "eyes", "known_locations", "medical", "emergency_contacts"]:
            assert k in d["resident"], f"public share resident missing {k}"

    def test_share_link_pdf_no_auth(self):
        token = pytest.share_token
        r = requests.get(f"{API}/missing/share/{token}/pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_share_link_invalid_token(self):
        r = requests.get(f"{API}/missing/share/not-a-real-token-xxx", timeout=15)
        assert r.status_code == 404

    def test_list_episodes_for_resident(self, manager_token, residents):
        maddy = next((r for r in residents if r["name"] == "Maddy O'Brien"), None)
        r = requests.get(f"{API}/residents/{maddy['id']}/missing", headers=_h(manager_token), timeout=15)
        assert r.status_code == 200
        eps = r.json()
        assert any(e["id"] == pytest.episode_id for e in eps)

    def test_timeline_includes_missing_episode(self, manager_token, residents):
        maddy = next((r for r in residents if r["name"] == "Maddy O'Brien"), None)
        r = requests.get(f"{API}/residents/{maddy['id']}/timeline", headers=_h(manager_token), timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        missing_items = [it for it in items if it["kind"] == "missing"]
        assert any(it["id"] == pytest.episode_id for it in missing_items)


# ---- Cleanup ----
def teardown_module(module):
    try:
        admin = _login("admin@care.local", "Admin@123")
        eid = getattr(pytest, "episode_id", None)
        if eid:
            # No DELETE endpoint for episodes; leave in DB. Clean up auto-created TEST_ incidents not strictly needed.
            pass
    except Exception:
        pass
