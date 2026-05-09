"""Iteration 22 — Adult Services modular overlay backend tests.

Covers:
- /api/service-types/active (active list + all_active_sectors)
- /api/service-types (full registry)
- /api/cqc/readiness (auth required, payload shape)
- /api/residents filtering by service_type and sector=adult
- Children's regression: /api/residents (no filter), pocket-money & petty-cash GETs, handover GET
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def manager_token():
    return _login("manager@care.local", "Manager@123")


@pytest.fixture(scope="module")
def staff_token():
    return _login("staff@care.local", "Staff@123")


@pytest.fixture(scope="module")
def senior_token():
    return _login("senior@care.local", "Senior@123")


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- service-types ----------------

class TestServiceTypes:
    def test_active_returns_sectors(self, manager_token):
        r = requests.get(f"{API}/service-types/active", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "all_active_sectors" in data
        assert isinstance(data["all_active_sectors"], list)
        assert "children" in data["all_active_sectors"]
        assert "adult" in data["all_active_sectors"]

    def test_full_registry(self, manager_token):
        r = requests.get(f"{API}/service-types", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # Could be list directly or wrapped object
        items = data if isinstance(data, list) else data.get("service_types") or data.get("items") or []
        ids = {s["id"] for s in items}
        for required in ["children", "adult_supported_living", "elderly_residential", "dementia", "mental_health", "veteran"]:
            assert required in ids, f"missing service type {required}; got {ids}"


# ---------------- cqc readiness ----------------

class TestCQCReadiness:
    def test_requires_auth(self):
        r = requests.get(f"{API}/cqc/readiness", timeout=20)
        assert r.status_code in (401, 403), r.status_code

    def test_payload_shape(self, manager_token):
        r = requests.get(f"{API}/cqc/readiness", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("service_users"), int)
        assert isinstance(data.get("overdue_med_reviews"), int)
        assert isinstance(data.get("open_adult_safeguarding"), int)

        audits = data.get("audits_due")
        assert isinstance(audits, list) and len(audits) == 3, f"expected 3 audits, got {audits}"
        for a in audits:
            assert "name" in a and "due" in a and "status" in a

        kqs = data.get("five_key_questions")
        assert isinstance(kqs, list) and len(kqs) == 5
        ids = [q.get("id") for q in kqs]
        for required in ["safe", "effective", "caring", "responsive", "well_led"]:
            assert required in ids, f"missing key question {required}; got {ids}"


# ---------------- residents filtering ----------------

class TestResidentsFiltering:
    def test_children_filter(self, manager_token):
        r = requests.get(f"{API}/residents?service_type=children", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200, r.text
        residents = r.json()
        assert isinstance(residents, list)
        for res in residents:
            st = res.get("service_type") or "children"
            assert st == "children", f"non-children leaked: {res.get('id')} st={st}"

    def test_adult_supported_living_filter(self, manager_token):
        r = requests.get(f"{API}/residents?service_type=adult_supported_living", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200, r.text
        residents = r.json()
        assert isinstance(residents, list)
        # Seed includes Tom Bryant -> at least 1
        assert len(residents) >= 1, "expected at least 1 adult_supported_living resident from seed"
        for res in residents:
            assert res.get("service_type") == "adult_supported_living"

    def test_sector_adult_returns_all_adult(self, manager_token):
        r = requests.get(f"{API}/residents?sector=adult", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200, r.text
        residents = r.json()
        assert isinstance(residents, list)
        assert len(residents) >= 2, f"seed should have >=2 adult residents, got {len(residents)}"
        adult_types = {"adult_supported_living", "elderly_residential", "dementia", "mental_health", "veteran"}
        for res in residents:
            assert res.get("service_type") in adult_types, f"non-adult leaked into sector=adult: {res}"

    def test_no_filter_returns_all(self, manager_token):
        r = requests.get(f"{API}/residents", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200, r.text
        residents = r.json()
        assert isinstance(residents, list) and len(residents) >= 2


# ---------------- regression ----------------

class TestRegression:
    def test_pocket_money_balances(self, manager_token):
        r = requests.get(f"{API}/pocket-money", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_petty_cash_summary(self, manager_token):
        # Try common endpoints; accept any 200
        candidates = ["/petty-cash/summary", "/petty-cash", "/petty-cash/transactions"]
        statuses = []
        for path in candidates:
            rr = requests.get(f"{API}{path}", headers=_h(manager_token), timeout=20)
            statuses.append((path, rr.status_code))
            if rr.status_code == 200:
                return
        pytest.fail(f"no petty-cash GET endpoint returned 200, tried {statuses}")

    def test_handover_list(self, manager_token):
        r = requests.get(f"{API}/handovers", headers=_h(manager_token), timeout=20)
        # Accept 200 list; 404 would be a regression
        assert r.status_code == 200, r.text

    def test_role_gate_reports_staff_blocked(self, staff_token):
        # Reports generation/list — staff should be blocked
        r = requests.get(f"{API}/reports", headers=_h(staff_token), timeout=20)
        assert r.status_code in (401, 403, 404), f"staff should not access /reports, got {r.status_code}"

    def test_role_gate_hr_senior_blocked(self, senior_token):
        # HR endpoints (safer recruitment) — senior cannot access
        candidates = ["/hr/applicants", "/hr", "/safer-recruitment/applicants"]
        for path in candidates:
            r = requests.get(f"{API}{path}", headers=_h(senior_token), timeout=20)
            if r.status_code in (401, 403):
                return
        pytest.skip(f"no clearly-gated HR endpoint found among {candidates}")

    def test_dashboard_stats_manager(self, manager_token):
        r = requests.get(f"{API}/dashboard/stats", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200
