"""Iteration 9 backend tests:
- Supervisions CRUD (manager/admin only)
- Login brute-force lockout (5 fails / 15 min -> 423)
- Lifespan migration & demo seed data
- Sanitised errors (incidents/structure)
- Notifications delivery + delivery_mocked
"""

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://safeguard-dash-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def manager_token():
    r = requests.post(f"{API}/auth/login", json={"email": "manager@care.local", "password": "Manager@123"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def staff_token():
    r = requests.post(f"{API}/auth/login", json={"email": "staff@care.local", "password": "Staff@123"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@care.local", "password": "Admin@123"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def hh(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- Health / lifespan ----------
class TestLifespanAndSeed:
    def test_root_ok(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert "ok" in r.text.lower() or r.json().get("status") == "ok"

    def test_demo_residents_seeded(self, manager_token):
        r = requests.get(f"{API}/residents", headers=hh(manager_token), timeout=15)
        assert r.status_code == 200
        names = [x.get("full_name") or x.get("name") for x in r.json()]
        # Expect 4 demo residents seeded by lifespan
        expected = {"Jordan Reilly", "Aisha Khan", "Leo Martinez", "Maddy O'Brien"}
        present = expected.intersection(set(names))
        assert len(present) == 4, f"Expected demo residents, got {names}"

    def test_demo_incidents_seeded(self, manager_token):
        r = requests.get(f"{API}/incidents", headers=hh(manager_token), timeout=15)
        assert r.status_code == 200
        incidents = r.json()
        assert len(incidents) >= 4
        types = {i.get("incident_type") for i in incidents}
        assert len(types) >= 4, f"Expected 4 distinct incident_types, got {types}"


# ---------- Supervisions ----------
class TestSupervisions:
    created_id = None

    def test_list_supervisions_200(self, manager_token):
        r = requests.get(f"{API}/supervisions", headers=hh(manager_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_supervisions_staff_allowed(self, staff_token):
        # GET allowed for any authed user
        r = requests.get(f"{API}/supervisions", headers=hh(staff_token), timeout=15)
        assert r.status_code == 200

    def test_create_supervision_manager_ok(self, manager_token, staff_token):
        # find a staff id via /auth/me
        me = requests.get(f"{API}/auth/me", headers=hh(staff_token), timeout=10).json()
        staff_id = me["id"]

        payload = {
            "staff_id": staff_id,
            "kind": "supervision",
            "completed_at": "2026-01-15",
            "notes": "TEST_iter9 supervision record",
        }
        r = requests.post(f"{API}/supervisions", headers=hh(manager_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["staff_id"] == staff_id
        assert data["kind"] == "supervision"
        assert data["completed_at"] == "2026-01-15"
        assert data.get("created_by_name"), "created_by_name should be auto-filled"
        assert "id" in data
        TestSupervisions.created_id = data["id"]

        # GET to verify persistence
        r2 = requests.get(f"{API}/supervisions", headers=hh(manager_token), timeout=15)
        assert any(x["id"] == data["id"] for x in r2.json())

    def test_create_supervision_staff_forbidden(self, staff_token):
        payload = {
            "staff_id": "x" * 8,
            "kind": "supervision",
            "completed_at": "2026-01-15",
            "notes": "TEST_iter9 unauthorised",
        }
        r = requests.post(f"{API}/supervisions", headers=hh(staff_token), json=payload, timeout=15)
        assert r.status_code == 403

    def test_delete_supervision_staff_forbidden(self, staff_token):
        sid = TestSupervisions.created_id or "non-existent-id"
        r = requests.delete(f"{API}/supervisions/{sid}", headers=hh(staff_token), timeout=15)
        assert r.status_code == 403

    def test_delete_supervision_manager_ok(self, manager_token):
        sid = TestSupervisions.created_id
        assert sid, "Create test must run first"
        r = requests.delete(f"{API}/supervisions/{sid}", headers=hh(manager_token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("deleted", 0) >= 1


# ---------- Login brute-force lockout ----------
class TestLoginLockout:
    def test_lockout_after_5_fails_then_clears_on_success(self, admin_token):
        # Use a unique throwaway user so we don't lock out shared accounts
        unique = f"TEST_lockout_{uuid.uuid4().hex[:8]}@care.local"
        reg = requests.post(
            f"{API}/auth/register",
            json={"email": unique, "password": "Correct@123", "name": "Lockout Tester", "role": "staff"},
            timeout=15,
        )
        assert reg.status_code == 200, reg.text

        # 4 bad attempts => 401 each
        for i in range(4):
            r = requests.post(f"{API}/auth/login", json={"email": unique, "password": "wrong"}, timeout=10)
            assert r.status_code == 401, f"attempt {i+1}: {r.status_code} {r.text}"

        # Correct password BEFORE lockout clears the counter
        r = requests.post(f"{API}/auth/login", json={"email": unique, "password": "Correct@123"}, timeout=10)
        assert r.status_code == 200, "correct password before lock should succeed and clear counter"

        # 5 more bad attempts; the 5th should lock
        for i in range(4):
            r = requests.post(f"{API}/auth/login", json={"email": unique, "password": "wrong"}, timeout=10)
            assert r.status_code == 401, f"after-clear attempt {i+1}: {r.status_code}"

        # 5th fail => 423
        r = requests.post(f"{API}/auth/login", json={"email": unique, "password": "wrong"}, timeout=10)
        assert r.status_code == 423, f"5th fail must trigger 423, got {r.status_code} {r.text}"

        # Correct password DURING lockout => 423
        r = requests.post(f"{API}/auth/login", json={"email": unique, "password": "Correct@123"}, timeout=10)
        assert r.status_code == 423, f"login during lockout must 423, got {r.status_code}"


# ---------- Notifications delivery ----------
class TestNotificationsDelivery:
    def test_post_notification_includes_delivery_mocked(self, manager_token):
        # Pick any incident
        inc = requests.get(f"{API}/incidents", headers=hh(manager_token), timeout=15).json()
        assert inc, "need at least one incident from seed"
        incident_id = inc[0]["id"]

        r = requests.post(
            f"{API}/notifications",
            headers=hh(manager_token),
            json={"incident_id": incident_id, "kind": "manager", "message": "TEST_iter9 notify"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "delivery" in data
        assert isinstance(data["delivery"], list)
        assert len(data["delivery"]) == 2, f"expected 2 channels (email+sms), got {data['delivery']}"
        channels = {d.get("channel") for d in data["delivery"]}
        assert channels == {"email", "sms"}
        assert data.get("delivery_mocked") is True
        for d in data["delivery"]:
            assert d.get("mocked") is True
            assert d.get("status") in ("mocked", "sent", "failed")


# ---------- Sanitised errors ----------
class TestSanitisedErrors:
    def test_structure_handler_returns_safe_message_or_skips(self, staff_token):
        # We can't easily break LLM, but we can hit the endpoint with malformed payload
        # to see error handler returns generic message (no Exception/stack).
        r = requests.post(
            f"{API}/incidents/structure",
            headers=hh(staff_token),
            json={"transcript": ""},  # likely valid; might 400 or 200
            timeout=30,
        )
        # Acceptable: 200 (LLM ok), 400 (validation), 502 (sanitised LLM fail), 422 pydantic
        assert r.status_code in (200, 400, 422, 502), f"unexpected {r.status_code} {r.text[:200]}"
        if r.status_code == 502:
            text = r.text
            assert "AI service unavailable" in text or "ai service" in text.lower()
            assert "Traceback" not in text
            assert "Exception" not in text


# ---------- Dashboard reflects supervisions/appraisals ----------
class TestDashboardCompliance:
    def test_dashboard_has_supervisions_due_and_appraisals_overdue(self, manager_token):
        r = requests.get(f"{API}/dashboard/stats", headers=hh(manager_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "supervisions_due" in data
        assert "appraisals_overdue" in data
        # seeded values per task description
        assert isinstance(data["supervisions_due"], int)
        assert isinstance(data["appraisals_overdue"], int)
