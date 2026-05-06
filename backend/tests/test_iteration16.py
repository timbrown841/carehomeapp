"""
Iteration 16 backend tests — Statutory Visits, Dashboard Urgency, Resident Badges.
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://safeguard-dash-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def manager_token():
    return _login("manager@care.local", "Manager@123")


@pytest.fixture(scope="module")
def staff_token():
    return _login("staff@care.local", "Staff@123")


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@care.local", "Admin@123")


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- /api/visits ----------

class TestVisitsList:
    def test_list_all(self, manager_token):
        r = requests.get(f"{API}/visits", headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # per review request: ~10 demo visits seeded
        assert len(data) >= 1
        v = data[0]
        for k in ["id", "kind", "scheduled_for", "status"]:
            assert k in v

    def test_list_upcoming(self, manager_token):
        r = requests.get(f"{API}/visits?upcoming=true", headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        today = datetime.now(timezone.utc).date().isoformat()
        for v in r.json():
            assert v["scheduled_for"] >= today
            assert v["status"] == "scheduled"

    def test_list_overdue(self, manager_token):
        r = requests.get(f"{API}/visits?overdue=true", headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        today = datetime.now(timezone.utc).date().isoformat()
        for v in r.json():
            assert v["scheduled_for"] < today
            assert v["status"] == "scheduled"

    def test_list_filter_resident(self, manager_token):
        res = requests.get(f"{API}/residents", headers=_h(manager_token), timeout=30)
        assert res.status_code == 200
        residents = res.json()
        assert len(residents) > 0
        rid = residents[0]["id"]
        r = requests.get(f"{API}/visits?resident_id={rid}", headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        for v in r.json():
            assert v["resident_id"] == rid

    def test_unauth_rejected(self):
        r = requests.get(f"{API}/visits", timeout=30)
        assert r.status_code in (401, 403)


# ---------- CRUD ----------

class TestVisitsCRUD:
    created_ids = []

    def test_create_home_wide_visit(self, manager_token):
        future = (datetime.now(timezone.utc) + timedelta(days=10)).date().isoformat()
        payload = {
            "kind": "regulation_44",
            "scheduled_for": future,
            "attended_by": "TEST_Visitor_" + uuid.uuid4().hex[:6],
            "visitor_role": "Regulation 44 Visitor",
            "title": "TEST_iter16_visit",
        }
        r = requests.post(f"{API}/visits", headers=_h(manager_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["kind"] == "regulation_44"
        assert v["scheduled_for"] == future
        assert v["status"] == "scheduled"
        assert v["id"]
        TestVisitsCRUD.created_ids.append(v["id"])

        # GET to verify persistence
        g = requests.get(f"{API}/visits", headers=_h(manager_token), timeout=30)
        ids = [x["id"] for x in g.json()]
        assert v["id"] in ids

    def test_create_per_resident_visit(self, manager_token):
        res = requests.get(f"{API}/residents", headers=_h(manager_token), timeout=30).json()
        rid = res[0]["id"]
        future = (datetime.now(timezone.utc) + timedelta(days=5)).date().isoformat()
        payload = {
            "resident_id": rid,
            "kind": "lac_review",
            "scheduled_for": future,
            "attended_by": "TEST_IRO",
            "visitor_role": "IRO",
        }
        r = requests.post(f"{API}/visits", headers=_h(manager_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["resident_id"] == rid
        TestVisitsCRUD.created_ids.append(v["id"])

    def test_create_invalid_resident(self, manager_token):
        payload = {
            "resident_id": "not-a-real-id",
            "kind": "sw_visit",
            "scheduled_for": "2026-06-01",
        }
        r = requests.post(f"{API}/visits", headers=_h(manager_token), json=payload, timeout=30)
        assert r.status_code == 404

    def test_patch_to_completed(self, manager_token):
        assert TestVisitsCRUD.created_ids, "no seeded visit from previous test"
        vid = TestVisitsCRUD.created_ids[0]
        payload = {
            "kind": "regulation_44",
            "scheduled_for": (datetime.now(timezone.utc) + timedelta(days=10)).date().isoformat(),
            "status": "completed",
            "completed_on": datetime.now(timezone.utc).date().isoformat(),
        }
        r = requests.patch(f"{API}/visits/{vid}", headers=_h(manager_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "completed"

    def test_patch_to_missed(self, manager_token):
        vid = TestVisitsCRUD.created_ids[1]
        payload = {
            "kind": "lac_review",
            "scheduled_for": "2026-06-01",
            "status": "missed",
        }
        r = requests.patch(f"{API}/visits/{vid}", headers=_h(manager_token), json=payload, timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "missed"

    def test_patch_not_found(self, manager_token):
        r = requests.patch(
            f"{API}/visits/does-not-exist",
            headers=_h(manager_token),
            json={"kind": "lac_review", "scheduled_for": "2026-06-01"},
            timeout=30,
        )
        assert r.status_code == 404

    def test_delete_staff_forbidden(self, staff_token):
        vid = TestVisitsCRUD.created_ids[0]
        r = requests.delete(f"{API}/visits/{vid}", headers=_h(staff_token), timeout=30)
        assert r.status_code == 403

    def test_delete_manager_ok(self, manager_token):
        for vid in TestVisitsCRUD.created_ids:
            r = requests.delete(f"{API}/visits/{vid}", headers=_h(manager_token), timeout=30)
            assert r.status_code == 200
            assert r.json().get("deleted") == 1


# ---------- Dashboard urgency ----------

class TestDashboardUrgency:
    EXPECTED_KEYS = [
        "open_safeguarding", "open_missing", "risk_reviews_overdue",
        "missed_doses_24h", "overdue_visits", "upcoming_visits",
    ]

    def test_urgency_keys(self, manager_token):
        r = requests.get(f"{API}/dashboard/urgency", headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        for k in self.EXPECTED_KEYS:
            assert k in data, f"missing {k}"
            assert isinstance(data[k], int), f"{k} not int: {data[k]}"

    def test_urgency_staff_allowed(self, staff_token):
        r = requests.get(f"{API}/dashboard/urgency", headers=_h(staff_token), timeout=30)
        assert r.status_code == 200


# ---------- Resident badges ----------

class TestResidentBadges:
    def test_badges_shape(self, manager_token):
        res = requests.get(f"{API}/residents", headers=_h(manager_token), timeout=30).json()
        assert res
        rid = res[0]["id"]
        r = requests.get(f"{API}/residents/{rid}/badges", headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "badges" in data
        assert isinstance(data["badges"], list)
        for b in data["badges"]:
            assert "label" in b and "tone" in b

    def test_badges_high_risk_resident(self, manager_token):
        res = requests.get(f"{API}/residents", headers=_h(manager_token), timeout=30).json()
        # Look for Maddy O'Brien (high-risk seeded resident per review request)
        target = next((x for x in res if "Maddy" in (x.get("name") or "")), None)
        if not target:
            # fallback: any high-risk
            target = next((x for x in res if (x.get("risk_level") or "").lower() == "high"), None)
        assert target, "no high-risk resident in seed"
        r = requests.get(f"{API}/residents/{target['id']}/badges", headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        labels = [b["label"] for b in r.json()["badges"]]
        assert "High Risk" in labels, f"expected 'High Risk' in {labels}"

    def test_badges_not_found(self, manager_token):
        r = requests.get(f"{API}/residents/does-not-exist/badges", headers=_h(manager_token), timeout=30)
        assert r.status_code == 404
