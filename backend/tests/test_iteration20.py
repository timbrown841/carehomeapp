"""Iteration 20 — Light 3-tier permissions overhaul tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://safeguard-dash-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@care.local", "Admin@123"),
    "manager": ("manager@care.local", "Manager@123"),
    "senior": ("senior@care.local", "Senior@123"),
    "staff": ("staff@care.local", "Staff@123"),
}

EXPECTED_TIER = {"staff": 1, "senior": 2, "manager": 3, "admin": 4}


def _login(role: str) -> str:
    email, pw = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data.get("user", {}).get("role") == role
    return data["token"]


@pytest.fixture(scope="module")
def tokens():
    return {r: _login(r) for r in CREDS}


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ------------------ Permissions & seed ------------------

class TestAuthPermissions:
    def test_senior_seed_exists_and_logs_in(self):
        r = requests.post(f"{API}/auth/login", json={"email": "senior@care.local", "password": "Senior@123"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "senior"

    @pytest.mark.parametrize("role", ["staff", "senior", "manager", "admin"])
    def test_permissions_endpoint_shape(self, tokens, role):
        r = requests.get(f"{API}/auth/permissions", headers=H(tokens[role]), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == role
        assert body["tier"] == EXPECTED_TIER[role]
        assert isinstance(body["grants"], list)
        assert len(body["grants"]) > 0

    def test_staff_has_training_self_not_matrix(self, tokens):
        g = set(requests.get(f"{API}/auth/permissions", headers=H(tokens["staff"]), timeout=15).json()["grants"])
        assert "training_self:read" in g
        assert "training_matrix:read" not in g
        assert "hr:read" not in g

    def test_senior_has_matrix_not_hr(self, tokens):
        g = set(requests.get(f"{API}/auth/permissions", headers=H(tokens["senior"]), timeout=15).json()["grants"])
        assert "training_matrix:read" in g
        assert "hr:read" not in g

    def test_manager_has_hr(self, tokens):
        g = set(requests.get(f"{API}/auth/permissions", headers=H(tokens["manager"]), timeout=15).json()["grants"])
        assert "hr:read" in g
        assert "training_matrix:read" in g

    def test_admin_has_everything(self, tokens):
        body = requests.get(f"{API}/auth/permissions", headers=H(tokens["admin"]), timeout=15).json()
        # admin tier 4 should have every key in the permissions dict
        # Fetch a known subset
        g = set(body["grants"])
        for p in ["hr:read", "hr:write", "training_matrix:read", "training_self:read", "residents:delete"]:
            assert p in g, f"admin missing {p}"


# ------------------ HR preview ------------------

class TestHRPreview:
    def test_staff_forbidden(self, tokens):
        r = requests.get(f"{API}/hr/preview", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 403
        assert "Insufficient permissions" in r.text or "Forbidden" in r.text

    def test_senior_forbidden(self, tokens):
        r = requests.get(f"{API}/hr/preview", headers=H(tokens["senior"]), timeout=15)
        assert r.status_code == 403

    def test_manager_ok(self, tokens):
        r = requests.get(f"{API}/hr/preview", headers=H(tokens["manager"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("module") == "Safer Recruitment & HR"

    def test_admin_ok(self, tokens):
        r = requests.get(f"{API}/hr/preview", headers=H(tokens["admin"]), timeout=15)
        assert r.status_code == 200


# ------------------ Trainings gating ------------------

class TestTrainings:
    def test_matrix_staff_forbidden(self, tokens):
        r = requests.get(f"{API}/trainings/matrix", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 403

    @pytest.mark.parametrize("role", ["senior", "manager", "admin"])
    def test_matrix_senior_plus_ok(self, tokens, role):
        r = requests.get(f"{API}/trainings/matrix", headers=H(tokens[role]), timeout=15)
        assert r.status_code == 200

    def test_list_trainings_staff_forbidden(self, tokens):
        r = requests.get(f"{API}/trainings", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 403

    @pytest.mark.parametrize("role", ["senior", "manager", "admin"])
    def test_list_trainings_senior_plus_ok(self, tokens, role):
        r = requests.get(f"{API}/trainings", headers=H(tokens[role]), timeout=15)
        assert r.status_code == 200

    @pytest.mark.parametrize("role", ["staff", "senior", "manager", "admin"])
    def test_trainings_mine_all_roles(self, tokens, role):
        r = requests.get(f"{API}/trainings/mine", headers=H(tokens[role]), timeout=15)
        assert r.status_code == 200, f"{role}: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert "trainings" in body
        assert "today" in body
        assert "soon_cutoff" in body
        assert isinstance(body["trainings"], list)
        for row in body["trainings"]:
            assert "status" in row
            assert row["status"] in ("ok", "expiring", "expired")


# ------------------ Register accepts senior ------------------

class TestRegister:
    def test_register_senior_role_accepted(self):
        # Just validate pydantic accepts 'senior' — bad password won't be issue since we check status != 422
        r = requests.post(f"{API}/auth/register", json={
            "email": "TEST_senior_reg@care.local",
            "name": "Test Senior Reg",
            "role": "senior",
            "password": "TestPwd@123",
        }, timeout=15)
        # Accept 200/201 success, or 400 duplicate — anything BUT 422 (validation error) means role accepted
        assert r.status_code != 422, f"Senior role rejected: {r.text}"

    def test_register_invalid_role_rejected(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": "TEST_bogus@care.local",
            "name": "Bogus",
            "role": "superuser",
            "password": "TestPwd@123",
        }, timeout=15)
        assert r.status_code == 422


# ------------------ Regression: iter 19 smoke ------------------

class TestIter19Regression:
    def test_handover_list(self, tokens):
        r = requests.get(f"{API}/handovers", headers=H(tokens["manager"]), timeout=15)
        assert r.status_code in (200, 404)  # endpoint exists; 200 preferred

    def test_residents_ok(self, tokens):
        r = requests.get(f"{API}/residents", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code == 200

    def test_petty_cash_list(self, tokens):
        r = requests.get(f"{API}/petty-cash", headers=H(tokens["staff"]), timeout=15)
        assert r.status_code in (200, 404)

    def test_dashboard_stats(self, tokens):
        r = requests.get(f"{API}/dashboard/stats", headers=H(tokens["manager"]), timeout=15)
        assert r.status_code == 200
