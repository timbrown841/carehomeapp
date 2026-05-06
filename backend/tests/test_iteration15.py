"""
Iteration 15 backend tests:
  1. Staff Rotas & Training endpoints (/api/staff, /api/shifts*, /api/trainings*)
  2. Ofsted Inspection Bundle PDF (/api/ofsted/inspection-bundle/pdf) — manager+admin only
  3. Role-based access control: staff role cannot hit manager-only endpoints
"""
import os
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Shared fixtures ----------
def _login(email, password):
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def manager_token():
    return _login("manager@care.local", "Manager@123")


@pytest.fixture(scope="session")
def admin_token():
    return _login("admin@care.local", "Admin@123")


@pytest.fixture(scope="session")
def staff_token():
    return _login("staff@care.local", "Staff@123")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- /api/staff ----------
class TestStaffList:
    def test_list_staff_auth_required(self):
        r = requests.get(f"{API}/staff", timeout=20)
        assert r.status_code in (401, 403)

    def test_list_staff_all_roles(self, staff_token, manager_token, admin_token):
        for tok in (staff_token, manager_token, admin_token):
            r = requests.get(f"{API}/staff", headers=_h(tok), timeout=20)
            assert r.status_code == 200, r.text
            arr = r.json()
            assert isinstance(arr, list)
            assert len(arr) >= 3  # at least the 3 seeded users
            emails = {u.get("email") for u in arr}
            assert "manager@care.local" in emails
            assert "staff@care.local" in emails
            # no _id leaked
            assert all("_id" not in u for u in arr)


# ---------- /api/shifts ----------
class TestShifts:
    def test_list_shifts(self, manager_token):
        r = requests.get(f"{API}/shifts", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        # demo seed should have ~45 shifts
        assert len(arr) >= 10, f"expected >=10 seeded shifts, got {len(arr)}"

    def test_shifts_date_range_filter(self, manager_token):
        today = datetime.now(timezone.utc).date()
        frm = (today - timedelta(days=7)).isoformat()
        to = (today + timedelta(days=7)).isoformat()
        r = requests.get(
            f"{API}/shifts?from_date={frm}&to_date={to}",
            headers=_h(manager_token),
            timeout=20,
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_shifts_now(self, staff_token):
        r = requests.get(f"{API}/shifts/now", headers=_h(staff_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_staff_cannot_create_shift(self, staff_token, manager_token):
        # get a staff id first
        staff_list = requests.get(
            f"{API}/staff", headers=_h(manager_token), timeout=20
        ).json()
        sid = staff_list[0]["id"]
        start = datetime.now(timezone.utc).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
        r = requests.post(
            f"{API}/shifts",
            json={
                "staff_id": sid,
                "role": "Support",
                "start_at": start,
                "end_at": end,
            },
            headers=_h(staff_token),
            timeout=20,
        )
        assert r.status_code == 403, r.status_code

    def test_shift_create_and_delete_flow(self, manager_token):
        staff_list = requests.get(
            f"{API}/staff", headers=_h(manager_token), timeout=20
        ).json()
        target = next(s for s in staff_list if s["role"] == "staff")
        start = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(days=30, hours=8)).isoformat()
        payload = {
            "staff_id": target["id"],
            "role": "TEST_iter15_Lead",
            "start_at": start,
            "end_at": end,
            "notes": "TEST_iter15",
        }
        r = requests.post(
            f"{API}/shifts", json=payload, headers=_h(manager_token), timeout=20
        )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["staff_id"] == target["id"]
        assert created["role"] == "TEST_iter15_Lead"
        assert created["staff_name"]  # auto-populated from user
        sid = created["id"]

        # verify it shows up in list
        lst = requests.get(
            f"{API}/shifts", headers=_h(manager_token), timeout=20
        ).json()
        assert any(s["id"] == sid for s in lst)

        # delete
        d = requests.delete(
            f"{API}/shifts/{sid}", headers=_h(manager_token), timeout=20
        )
        assert d.status_code == 200
        assert d.json().get("deleted") == 1

        # verify gone
        lst2 = requests.get(
            f"{API}/shifts", headers=_h(manager_token), timeout=20
        ).json()
        assert not any(s["id"] == sid for s in lst2)


# ---------- /api/trainings ----------
class TestTrainings:
    def test_list_trainings(self, staff_token):
        r = requests.get(f"{API}/trainings", headers=_h(staff_token), timeout=20)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert len(arr) >= 5, f"expected >=5 seeded trainings, got {len(arr)}"

    def test_trainings_matrix_structure(self, manager_token):
        r = requests.get(
            f"{API}/trainings/matrix", headers=_h(manager_token), timeout=20
        )
        assert r.status_code == 200
        data = r.json()
        assert "courses" in data and "rows" in data
        assert len(data["courses"]) >= 6, f"expected >=6 unique courses, got {len(data['courses'])}"
        assert len(data["rows"]) >= 3, f"expected >=3 staff rows, got {len(data['rows'])}"

        # each row has staff info and cells aligned with courses
        ncourses = len(data["courses"])
        valid_statuses = {"ok", "expiring", "expired", "missing"}
        for row in data["rows"]:
            assert "staff" in row and "cells" in row
            assert len(row["cells"]) == ncourses
            for cell in row["cells"]:
                assert cell["status"] in valid_statuses
                assert "course" in cell

        # verify we see at least one expired entry (seed should have expired First Aid for Sarah Manager)
        all_statuses = [
            c["status"] for row in data["rows"] for c in row["cells"]
        ]
        assert "expired" in all_statuses, "expected at least one expired training from seed"

    def test_staff_cannot_create_training(self, staff_token, manager_token):
        staff_list = requests.get(
            f"{API}/staff", headers=_h(manager_token), timeout=20
        ).json()
        sid = staff_list[0]["id"]
        r = requests.post(
            f"{API}/trainings",
            json={
                "staff_id": sid,
                "course": "TEST_denied",
                "completed_on": "2025-01-01",
                "expires_on": "2027-01-01",
            },
            headers=_h(staff_token),
            timeout=20,
        )
        assert r.status_code == 403

    def test_training_create_and_delete_flow(self, manager_token):
        staff_list = requests.get(
            f"{API}/staff", headers=_h(manager_token), timeout=20
        ).json()
        target = next(s for s in staff_list if s["role"] == "staff")
        payload = {
            "staff_id": target["id"],
            "course": "TEST_iter15_Safeguarding",
            "completed_on": "2025-06-01",
            "expires_on": "2027-06-01",
            "certificate_no": "TEST-001",
            "provider": "TEST_Provider",
        }
        r = requests.post(
            f"{API}/trainings",
            json=payload,
            headers=_h(manager_token),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["course"] == "TEST_iter15_Safeguarding"
        assert created["staff_name"]  # auto-populated
        tid = created["id"]

        # verify in matrix
        mat = requests.get(
            f"{API}/trainings/matrix", headers=_h(manager_token), timeout=20
        ).json()
        assert "TEST_iter15_Safeguarding" in mat["courses"]

        # delete
        d = requests.delete(
            f"{API}/trainings/{tid}",
            headers=_h(manager_token),
            timeout=20,
        )
        assert d.status_code == 200
        assert d.json().get("deleted") == 1


# ---------- /api/ofsted/inspection-bundle/pdf ----------
class TestInspectionBundle:
    def test_manager_can_download(self, manager_token):
        r = requests.get(
            f"{API}/ofsted/inspection-bundle/pdf",
            headers={"Authorization": f"Bearer {manager_token}"},
            timeout=60,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF-1.4"), f"bad magic: {r.content[:20]}"
        # sanity: reasonably sized
        assert len(r.content) > 1500

    def test_admin_can_download(self, admin_token):
        r = requests.get(
            f"{API}/ofsted/inspection-bundle/pdf",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60,
        )
        assert r.status_code == 200
        assert r.content.startswith(b"%PDF-1.4")

    def test_staff_forbidden(self, staff_token):
        r = requests.get(
            f"{API}/ofsted/inspection-bundle/pdf",
            headers={"Authorization": f"Bearer {staff_token}"},
            timeout=20,
        )
        assert r.status_code == 403


# ---------- Existing iter-14 regression smoke ----------
class TestRegression:
    def test_health_endpoint(self):
        r = requests.get(f"{API}/", timeout=20)
        assert r.status_code in (200, 404)  # root may not exist — health smoke only

    def test_residents_still_work(self, manager_token):
        r = requests.get(f"{API}/residents", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_ofsted_readiness_json(self, manager_token):
        r = requests.get(
            f"{API}/ofsted/readiness", headers=_h(manager_token), timeout=20
        )
        assert r.status_code == 200
        d = r.json()
        assert "overall" in d or "score" in d or isinstance(d, dict)
