"""Iteration 25 — Therapeutic Practice & Key Work module backend tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://safeguard-dash-1.preview.emergentagent.com').rstrip('/')

CREDS = {
    "admin": ("admin@care.local", "Admin@123"),
    "manager": ("manager@care.local", "Manager@123"),
    "senior": ("senior@care.local", "Senior@123"),
    "staff": ("staff@care.local", "Staff@123"),
}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def tokens():
    return {role: _login(*c) for role, c in CREDS.items()}


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ----- Frameworks -----
class TestFrameworks:
    def test_list_frameworks(self, tokens):
        r = requests.get(f"{BASE_URL}/api/frameworks", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        ids = {f["id"] for f in data}
        expected = {"bronfenbrenner", "attachment", "trauma_informed", "contextual_safeguarding",
                    "pace", "restorative", "maslow", "social_learning", "child_development"}
        assert expected.issubset(ids), f"missing frameworks: {expected - ids}"
        for f in data:
            assert "name" in f and "summary" in f
            assert isinstance(f.get("key_concepts"), list)
            assert isinstance(f.get("when_to_use"), list)
            assert isinstance(f.get("cautions"), list)
            assert isinstance(f.get("references"), list)

    def test_get_framework_by_id(self, tokens):
        r = requests.get(f"{BASE_URL}/api/frameworks/pace", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == "pace"

    def test_get_framework_404(self, tokens):
        r = requests.get(f"{BASE_URL}/api/frameworks/does_not_exist", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 404


# ----- Resource packs -----
class TestResourcePacks:
    def test_list_resource_packs(self, tokens):
        r = requests.get(f"{BASE_URL}/api/resource-packs", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        themes = {p["theme"] for p in data}
        expected_themes = {"ebd", "trauma", "emotional_regulation", "exploitation",
                           "missing_from_care_prevention", "identity_self_esteem",
                           "healthy_relationships", "independence_skills", "education_engagement"}
        assert expected_themes.issubset(themes), f"missing themes: {expected_themes - themes}"
        assert len(data) >= 9

    def test_filter_resource_packs_by_theme(self, tokens):
        r = requests.get(f"{BASE_URL}/api/resource-packs?theme=trauma", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert all(p["theme"] == "trauma" for p in data)

    def test_get_resource_pack_detail(self, tokens):
        r = requests.get(f"{BASE_URL}/api/resource-packs/rp_trauma", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        pack = r.json()
        assert pack["id"] == "rp_trauma"
        assert isinstance(pack.get("sections"), list) and len(pack["sections"]) >= 1
        valid_types = {"session_idea", "worksheet", "activity", "reflection_prompt", "discussion_prompt"}
        for s in pack["sections"]:
            assert s["type"] in valid_types
            assert "title" in s and "body" in s
        assert isinstance(pack.get("related_framework_ids"), list)

    def test_get_resource_pack_404(self, tokens):
        r = requests.get(f"{BASE_URL}/api/resource-packs/nope", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 404


# ----- Topics & Prompts -----
class TestTopicsAndPrompts:
    def test_list_topics(self, tokens):
        r = requests.get(f"{BASE_URL}/api/key-work/topics", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 9
        for t in data:
            assert "default_frameworks" in t
            assert "default_resource_pack_ids" in t
            assert "default_prompt_ids" in t

    def test_list_guided_prompts(self, tokens):
        r = requests.get(f"{BASE_URL}/api/guided-prompts", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 12

    def test_filter_prompts_by_context(self, tokens):
        r = requests.get(f"{BASE_URL}/api/guided-prompts?context=key_work_planning",
                         headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert all("key_work_planning" in p["context"] for p in data)
        assert len(data) >= 1

    def test_filter_prompts_by_theme(self, tokens):
        r = requests.get(f"{BASE_URL}/api/guided-prompts?theme=trauma",
                         headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert all("trauma" in p["theme_tags"] for p in data)
        assert len(data) >= 1


# ----- Helper to find resident -----
@pytest.fixture(scope="session")
def maddy_id():
    return "a1fb73b6-aced-4cf3-a053-0b861183f897"


@pytest.fixture(scope="session")
def aisha_id(tokens):
    r = requests.get(f"{BASE_URL}/api/residents", headers=H(tokens["manager"]), timeout=15)
    assert r.status_code == 200
    for res in r.json():
        if res.get("name", "").lower().startswith("aisha"):
            return res["id"]
    pytest.skip("Aisha resident not seeded")


# ----- Sessions CRUD + RBAC -----
class TestKeyWorkSessions:
    def test_staff_cannot_create(self, tokens, maddy_id):
        r = requests.post(f"{BASE_URL}/api/key-work/sessions",
                          headers=H(tokens["staff"]),
                          json={"resident_id": maddy_id, "status": "planned"}, timeout=15)
        assert r.status_code == 403

    def test_senior_can_create(self, tokens, maddy_id):
        payload = {
            "resident_id": maddy_id,
            "status": "planned",
            "topic_id": "topic_emotional_regulation",
            "topic_label": "Emotional regulation",
            "frameworks_applied": ["trauma_informed", "pace"],
            "resource_pack_ids": ["rp_emotional_regulation"],
            "goals": [{"text": "TEST_iter25 goal one"}, {"text": "TEST_iter25 goal two"}],
            "mood_before": 3,
            "mood_after": 4,
            "prompt_responses": {"p_yp_voice": "TEST: YP said hi"},
            "safeguarding_flag": False,
        }
        r = requests.post(f"{BASE_URL}/api/key-work/sessions",
                          headers=H(tokens["senior"]), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data and "created_at" in data
        assert data["planner_id"] and data["planner_name"]
        assert all(g.get("id") for g in data["goals"])  # auto goal ids
        TestKeyWorkSessions.created_id = data["id"]

    def test_mood_validation_too_high(self, tokens, maddy_id):
        r = requests.post(f"{BASE_URL}/api/key-work/sessions",
                          headers=H(tokens["senior"]),
                          json={"resident_id": maddy_id, "mood_before": 6}, timeout=15)
        assert r.status_code == 422

    def test_mood_validation_too_low(self, tokens, maddy_id):
        r = requests.post(f"{BASE_URL}/api/key-work/sessions",
                          headers=H(tokens["senior"]),
                          json={"resident_id": maddy_id, "mood_after": 0}, timeout=15)
        assert r.status_code == 422

    def test_mood_null_allowed(self, tokens, maddy_id):
        r = requests.post(f"{BASE_URL}/api/key-work/sessions",
                          headers=H(tokens["senior"]),
                          json={"resident_id": maddy_id, "mood_before": None,
                                "mood_after": None, "topic_label": "TEST_iter25_null"},
                          timeout=15)
        assert r.status_code == 200, r.text

    def test_get_session_by_id(self, tokens):
        sid = TestKeyWorkSessions.created_id
        r = requests.get(f"{BASE_URL}/api/key-work/sessions/{sid}",
                         headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == sid

    def test_get_session_404(self, tokens):
        r = requests.get(f"{BASE_URL}/api/key-work/sessions/no_such_id",
                         headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 404

    def test_list_sessions_filtered(self, tokens, maddy_id):
        r = requests.get(f"{BASE_URL}/api/key-work/sessions?resident_id={maddy_id}",
                         headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert all(s["resident_id"] == maddy_id for s in data)

    def test_patch_session(self, tokens):
        sid = TestKeyWorkSessions.created_id
        r = requests.patch(f"{BASE_URL}/api/key-work/sessions/{sid}",
                           headers=H(tokens["senior"]),
                           json={"plan": "TEST_iter25 updated plan"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["plan"] == "TEST_iter25 updated plan"

    def test_staff_cannot_patch(self, tokens):
        sid = TestKeyWorkSessions.created_id
        r = requests.patch(f"{BASE_URL}/api/key-work/sessions/{sid}",
                           headers=H(tokens["staff"]),
                           json={"plan": "naughty"}, timeout=15)
        assert r.status_code == 403


# ----- Sign off -----
class TestSignOff:
    @classmethod
    def setup_class(cls):
        # Create a safeguarding-flagged session for sign-off
        token = _login(*CREDS["senior"])
        # find maddy
        mid = "a1fb73b6-aced-4cf3-a053-0b861183f897"
        r = requests.post(f"{BASE_URL}/api/key-work/sessions", headers=H(token),
                          json={"resident_id": mid, "status": "planned",
                                "topic_label": "TEST_iter25_signoff",
                                "safeguarding_flag": True}, timeout=15)
        assert r.status_code == 200, r.text
        cls.sid = r.json()["id"]

    def test_senior_cannot_sign_off(self, tokens):
        r = requests.post(f"{BASE_URL}/api/key-work/sessions/{self.sid}/sign-off",
                          headers=H(tokens["senior"]),
                          json={"manager_comments": "ok"}, timeout=15)
        assert r.status_code == 403

    def test_manager_signs_off(self, tokens):
        r = requests.post(f"{BASE_URL}/api/key-work/sessions/{self.sid}/sign-off",
                          headers=H(tokens["manager"]),
                          json={"manager_comments": "TEST_iter25 signed off"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["signed_off_by_id"]
        assert data["signed_off_at"]
        assert data["manager_comments"] == "TEST_iter25 signed off"

    def test_senior_cannot_edit_signed_off(self, tokens):
        r = requests.patch(f"{BASE_URL}/api/key-work/sessions/{self.sid}",
                           headers=H(tokens["senior"]),
                           json={"plan": "after signoff"}, timeout=15)
        assert r.status_code in (403, 409)

    def test_manager_can_edit_signed_off(self, tokens):
        r = requests.patch(f"{BASE_URL}/api/key-work/sessions/{self.sid}",
                           headers=H(tokens["manager"]),
                           json={"plan": "manager edit ok"}, timeout=15)
        assert r.status_code == 200


# ----- PDF -----
class TestPDF:
    def test_session_pdf(self, tokens):
        sid = TestKeyWorkSessions.created_id
        r = requests.get(f"{BASE_URL}/api/key-work/sessions/{sid}/pdf",
                         headers=H(tokens["senior"]), timeout=20)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"

    def test_pdf_requires_auth(self):
        sid = TestKeyWorkSessions.created_id
        r = requests.get(f"{BASE_URL}/api/key-work/sessions/{sid}/pdf", timeout=15)
        assert r.status_code in (401, 403)


# ----- Smart Recommendations -----
class TestRecommendations:
    def test_staff_blocked_global(self, tokens):
        r = requests.get(f"{BASE_URL}/api/key-work/recommendations",
                         headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 403

    def test_senior_global_recs(self, tokens):
        r = requests.get(f"{BASE_URL}/api/key-work/recommendations",
                         headers=H(tokens["senior"]), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        for rec in data:
            assert "resident_id" in rec
            assert "resident_name" in rec
            assert "severity" in rec
            assert "title" in rec

    def test_resident_recs_staff_blocked(self, tokens, maddy_id):
        r = requests.get(f"{BASE_URL}/api/residents/{maddy_id}/key-work/recommendations",
                         headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 403

    def test_maddy_recs_includes_missing_and_overdue(self, tokens, maddy_id):
        r = requests.get(f"{BASE_URL}/api/residents/{maddy_id}/key-work/recommendations",
                         headers=H(tokens["senior"]), timeout=20)
        assert r.status_code == 200
        recs = r.json()
        assert isinstance(recs, list) and len(recs) >= 1
        # Maddy has 2+ missing in 60d → CSE rec expected
        bodies = " ".join((r.get("title", "") + " " + r.get("body", "")) for r in recs).lower()
        assert "exploit" in bodies or "cse" in bodies or "missing" in bodies, f"no missing/CSE rec: {recs}"

    def test_aisha_recs_includes_trauma(self, tokens, aisha_id):
        r = requests.get(f"{BASE_URL}/api/residents/{aisha_id}/key-work/recommendations",
                         headers=H(tokens["senior"]), timeout=20)
        assert r.status_code == 200
        recs = r.json()
        bodies = " ".join((rr.get("title", "") + " " + rr.get("body", "")) for rr in recs).lower()
        # Aisha has open safeguarding + self-harm + high risk → expect trauma-informed or ER rec
        assert "trauma" in bodies or "regulation" in bodies or "ecological" in bodies, f"no expected rec: {recs}"

    def test_rec_engine_reflects_risk_change(self, tokens, aisha_id):
        # GET current risk_level
        r0 = requests.get(f"{BASE_URL}/api/residents/{aisha_id}", headers=H(tokens["manager"]), timeout=15)
        assert r0.status_code == 200
        original_risk = r0.json().get("risk_level")

        # Set to low
        requests.patch(f"{BASE_URL}/api/residents/{aisha_id}",
                       headers=H(tokens["manager"]), json={"risk_level": "low"}, timeout=15)
        r_low = requests.get(f"{BASE_URL}/api/residents/{aisha_id}/key-work/recommendations",
                             headers=H(tokens["senior"]), timeout=20)
        low_count = len(r_low.json())

        # Set to high
        requests.patch(f"{BASE_URL}/api/residents/{aisha_id}",
                       headers=H(tokens["manager"]), json={"risk_level": "high"}, timeout=15)
        r_high = requests.get(f"{BASE_URL}/api/residents/{aisha_id}/key-work/recommendations",
                              headers=H(tokens["senior"]), timeout=20)
        high_count = len(r_high.json())

        # Restore
        if original_risk:
            requests.patch(f"{BASE_URL}/api/residents/{aisha_id}",
                           headers=H(tokens["manager"]), json={"risk_level": original_risk}, timeout=15)

        # high should produce >= low (ecological rec triggers on high)
        assert high_count >= low_count, f"high={high_count} low={low_count}"


# ----- Audit regression -----
class TestAuditRegression:
    def test_audit_facets_includes_key_work(self, tokens):
        r = requests.get(f"{BASE_URL}/api/audit/facets", headers=H(tokens["manager"]), timeout=15)
        assert r.status_code == 200
        facets = r.json()
        ot = facets.get("object_types", [])
        assert "key_work_session" in ot, f"object_types missing key_work_session: {ot}"

    def test_audit_log_has_key_work_events(self, tokens):
        r = requests.get(f"{BASE_URL}/api/audit?object_type=key_work_session",
                         headers=H(tokens["manager"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        events = data.get("items") if isinstance(data, dict) else data
        assert isinstance(events, list)
        assert len(events) >= 1
