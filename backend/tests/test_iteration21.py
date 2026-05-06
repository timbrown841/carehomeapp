"""Iteration 21 — Resident documents & independence skills tests."""
import os
import pytest
import requests
from pathlib import Path


def _load_frontend_url():
    env_url = os.environ.get("REACT_APP_BACKEND_URL")
    if env_url:
        return env_url
    p = Path("/app/frontend/.env")
    if p.exists():
        for line in p.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_frontend_url().rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "manager": ("manager@care.local", "Manager@123"),
    "senior": ("senior@care.local", "Senior@123"),
    "staff": ("staff@care.local", "Staff@123"),
}

VALID_CATS = [
    "care_plan", "placement_plan", "pathway_plan", "court_order", "ehcp",
    "assessment", "consent_form", "review", "id_document", "placement_agreement",
    "delegated_authority", "other",
]
VALID_LEVELS = ["not_started", "needs_support", "developing", "competent", "mastered"]
EXPECTED_SKILL_IDS = {
    "cooking", "budgeting", "shopping", "travel", "appointments",
    "self_medication", "cleaning", "emotional_regulation", "tenancy_readiness",
    "daily_living", "personal_hygiene", "communication",
}


def _login(role):
    email, pw = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"{role} login: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def tokens():
    return {r: _login(r) for r in CREDS}


@pytest.fixture(scope="module")
def resident_id(tokens):
    r = requests.get(f"{API}/residents", headers={"Authorization": f"Bearer {tokens['manager']}"}, timeout=15)
    assert r.status_code == 200
    residents = r.json()
    assert len(residents) > 0
    return residents[0]["id"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ===== Resident Documents =====
class TestResidentDocuments:
    def test_list_documents_empty_or_list(self, tokens, resident_id):
        r = requests.get(f"{API}/residents/{resident_id}/documents", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_document_minimum(self, tokens, resident_id):
        r = requests.post(
            f"{API}/residents/{resident_id}/documents",
            headers=H(tokens["manager"]),
            json={"title": "TEST_iter21_care_plan", "category": "care_plan"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == "TEST_iter21_care_plan"
        assert body["category"] == "care_plan"
        assert "id" in body
        assert body["resident_id"] == resident_id
        assert body["created_at"]
        # GET to verify persistence + ordering
        lst = requests.get(f"{API}/residents/{resident_id}/documents", headers=H(tokens["staff"]), timeout=15).json()
        ids = [d["id"] for d in lst]
        assert body["id"] in ids
        # ordering by created_at desc — newest first
        if len(lst) > 1:
            assert lst[0]["created_at"] >= lst[-1]["created_at"]

    def test_create_document_full(self, tokens, resident_id):
        payload = {
            "title": "TEST_iter21_full",
            "category": "ehcp",
            "expiry_date": "2027-01-01",
            "notes": "Full payload",
            "file_url": "https://example.com/doc.pdf",
        }
        r = requests.post(f"{API}/residents/{resident_id}/documents", headers=H(tokens["senior"]), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["expiry_date"] == "2027-01-01"
        assert body["file_url"] == "https://example.com/doc.pdf"
        assert body["uploaded_by_name"]

    def test_create_document_invalid_category(self, tokens, resident_id):
        r = requests.post(
            f"{API}/residents/{resident_id}/documents",
            headers=H(tokens["manager"]),
            json={"title": "TEST_bad_cat", "category": "bogus_category"},
            timeout=15,
        )
        assert r.status_code == 422

    def test_create_document_missing_title(self, tokens, resident_id):
        r = requests.post(
            f"{API}/residents/{resident_id}/documents",
            headers=H(tokens["manager"]),
            json={"category": "care_plan"},
            timeout=15,
        )
        assert r.status_code == 422

    def test_create_document_404_unknown_resident(self, tokens):
        r = requests.post(
            f"{API}/residents/does-not-exist-xyz/documents",
            headers=H(tokens["manager"]),
            json={"title": "TEST_orphan", "category": "other"},
            timeout=15,
        )
        assert r.status_code == 404

    @pytest.mark.parametrize("cat", VALID_CATS)
    def test_all_12_categories_accepted(self, tokens, resident_id, cat):
        r = requests.post(
            f"{API}/residents/{resident_id}/documents",
            headers=H(tokens["manager"]),
            json={"title": f"TEST_cat_{cat}", "category": cat},
            timeout=15,
        )
        assert r.status_code == 200, f"cat={cat}: {r.status_code} {r.text}"

    def test_delete_staff_forbidden(self, tokens, resident_id):
        # First create a doc as senior
        r = requests.post(
            f"{API}/residents/{resident_id}/documents",
            headers=H(tokens["senior"]),
            json={"title": "TEST_staff_cannot_del", "category": "other"},
            timeout=15,
        )
        assert r.status_code == 200
        doc_id = r.json()["id"]
        # Staff attempt delete
        r2 = requests.delete(f"{API}/residents/documents/{doc_id}", headers=H(tokens["staff"]), timeout=15)
        assert r2.status_code == 403

    def test_delete_senior_ok(self, tokens, resident_id):
        r = requests.post(
            f"{API}/residents/{resident_id}/documents",
            headers=H(tokens["senior"]),
            json={"title": "TEST_senior_del", "category": "other"},
            timeout=15,
        )
        doc_id = r.json()["id"]
        r2 = requests.delete(f"{API}/residents/documents/{doc_id}", headers=H(tokens["senior"]), timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("deleted") == 1
        # Verify gone
        lst = requests.get(f"{API}/residents/{resident_id}/documents", headers=H(tokens["senior"]), timeout=15).json()
        assert doc_id not in [d["id"] for d in lst]

    def test_delete_manager_ok(self, tokens, resident_id):
        r = requests.post(
            f"{API}/residents/{resident_id}/documents",
            headers=H(tokens["manager"]),
            json={"title": "TEST_mgr_del", "category": "other"},
            timeout=15,
        )
        doc_id = r.json()["id"]
        r2 = requests.delete(f"{API}/residents/documents/{doc_id}", headers=H(tokens["manager"]), timeout=15)
        assert r2.status_code == 200


# ===== Independence Skills =====
class TestIndependenceSkills:
    def test_get_returns_all_12_with_defaults(self, tokens, resident_id):
        # Use a fresh-ish resident if possible — pick last one in list to avoid prior state
        all_res = requests.get(f"{API}/residents", headers=H(tokens["manager"]), timeout=15).json()
        rid = all_res[-1]["id"] if all_res else resident_id
        r = requests.get(f"{API}/residents/{rid}/independence", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "skills" in body
        skills = body["skills"]
        assert len(skills) == 12
        ids = {s["id"] for s in skills}
        assert ids == EXPECTED_SKILL_IDS
        for s in skills:
            assert "label" in s
            assert s["level"] in VALID_LEVELS

    def test_post_upsert_skill(self, tokens, resident_id):
        payload = {"skill": "cooking", "level": "developing", "notes": "TEST_iter21 cooking ok"}
        r = requests.post(f"{API}/residents/{resident_id}/independence", headers=H(tokens["senior"]), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["skill"] == "cooking"
        assert body["level"] == "developing"
        assert body["updated_by_name"]
        # Verify GET reflects it
        g = requests.get(f"{API}/residents/{resident_id}/independence", headers=H(tokens["staff"]), timeout=15).json()
        cooking = next(s for s in g["skills"] if s["id"] == "cooking")
        assert cooking["level"] == "developing"

    def test_post_upsert_updates_same_record(self, tokens, resident_id):
        # First write
        requests.post(f"{API}/residents/{resident_id}/independence", headers=H(tokens["senior"]),
                      json={"skill": "budgeting", "level": "needs_support"}, timeout=15)
        # Update
        r = requests.post(f"{API}/residents/{resident_id}/independence", headers=H(tokens["senior"]),
                          json={"skill": "budgeting", "level": "competent"}, timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{API}/residents/{resident_id}/independence", headers=H(tokens["staff"]), timeout=15).json()
        budgeting = [s for s in g["skills"] if s["id"] == "budgeting"]
        assert len(budgeting) == 1
        assert budgeting[0]["level"] == "competent"

    def test_post_invalid_level_rejected(self, tokens, resident_id):
        r = requests.post(f"{API}/residents/{resident_id}/independence", headers=H(tokens["manager"]),
                          json={"skill": "cooking", "level": "expert"}, timeout=15)
        assert r.status_code == 422

    def test_post_invalid_skill_rejected(self, tokens, resident_id):
        r = requests.post(f"{API}/residents/{resident_id}/independence", headers=H(tokens["manager"]),
                          json={"skill": "telepathy", "level": "developing"}, timeout=15)
        assert r.status_code == 422

    def test_post_404_unknown_resident(self, tokens):
        r = requests.post(f"{API}/residents/no-such-rid/independence", headers=H(tokens["manager"]),
                          json={"skill": "cooking", "level": "developing"}, timeout=15)
        assert r.status_code == 404

    @pytest.mark.parametrize("level", VALID_LEVELS)
    def test_all_5_levels_accepted(self, tokens, resident_id, level):
        r = requests.post(f"{API}/residents/{resident_id}/independence", headers=H(tokens["manager"]),
                          json={"skill": "communication", "level": level}, timeout=15)
        assert r.status_code == 200, f"level={level}: {r.text}"


# ===== Iter 19+20 regression =====
class TestRegression:
    def test_handover_list_manager(self, tokens):
        r = requests.get(f"{API}/handovers", headers=H(tokens["manager"]), timeout=15)
        assert r.status_code in (200, 404)

    def test_residents_ok_staff(self, tokens):
        r = requests.get(f"{API}/residents", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200

    def test_dashboard_stats(self, tokens):
        r = requests.get(f"{API}/dashboard/stats", headers=H(tokens["manager"]), timeout=15)
        assert r.status_code == 200

    def test_permissions_endpoint(self, tokens):
        r = requests.get(f"{API}/auth/permissions", headers=H(tokens["senior"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "senior"

    def test_hr_preview_staff_forbidden(self, tokens):
        r = requests.get(f"{API}/hr/preview", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 403

    def test_trainings_mine_staff(self, tokens):
        r = requests.get(f"{API}/trainings/mine", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200
