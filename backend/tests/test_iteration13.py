"""Iteration 13 tests — Medications/MAR, Body Maps, Ofsted Readiness."""
import os
from datetime import datetime, timezone, timedelta
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for in-container test runs
    BASE_URL = "http://localhost:8001"

MANAGER = {"email": "manager@care.local", "password": "Manager@123"}
STAFF = {"email": "staff@care.local", "password": "Staff@123"}
ADMIN = {"email": "admin@care.local", "password": "Admin@123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def manager_token():
    return _login(MANAGER)["token"]


@pytest.fixture(scope="module")
def staff_token():
    return _login(STAFF)["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def residents(manager_token):
    r = requests.get(f"{BASE_URL}/api/residents", headers=_h(manager_token), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    return data


# ---------- Ofsted Readiness ----------
class TestOfstedReadiness:
    def test_unauth_401(self):
        r = requests.get(f"{BASE_URL}/api/ofsted/readiness", timeout=15)
        assert r.status_code == 401

    def test_returns_overall_and_six_sections(self, manager_token):
        r = requests.get(
            f"{BASE_URL}/api/ofsted/readiness", headers=_h(manager_token), timeout=15
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Possible shape variations - look for overall + sections
        assert "overall" in body or "score" in body, f"no overall key: {body.keys()}"
        sections = body.get("sections") or body.get("areas") or []
        assert isinstance(sections, list) and len(sections) == 6, f"sections={sections}"
        wanted = {"medication", "risk_reviews", "daily_notes", "supervisions", "safeguarding", "missing"}
        ids = {s.get("id") for s in sections}
        assert wanted.issubset(ids), f"missing ids: {wanted - ids}"
        for s in sections:
            assert "score" in s
            assert "title" in s
            assert "items" in s
            assert "fix_link" in s


# ---------- Medication Round ----------
class TestMedicationRound:
    def test_round_today(self, manager_token):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = requests.get(
            f"{BASE_URL}/api/medications/round?date={today}",
            headers=_h(manager_token),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Acceptable shape: list of rows OR {slots: ...}
        assert isinstance(data, (list, dict))


# ---------- Medication CRUD ----------
class TestMedicationCRUD:
    @pytest.fixture(scope="class")
    def resident_id(self, manager_token):
        r = requests.get(f"{BASE_URL}/api/residents", headers=_h(manager_token), timeout=15)
        for res in r.json():
            if res.get("name") == "Maddy O'Brien":
                return res["id"]
        return r.json()[0]["id"]

    def test_create_med_manager(self, manager_token, resident_id):
        payload = {
            "name": "TEST_Paracetamol",
            "dose": "500mg",
            "route": "Oral",
            "schedule_times": ["12:00"],
            "is_prn": False,
            "instructions": "Take with water",
            "prescriber": "Dr Test",
            "active": True,
        }
        r = requests.post(
            f"{BASE_URL}/api/residents/{resident_id}/medications",
            headers=_h(manager_token),
            json=payload,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        med = r.json()
        assert med["name"] == "TEST_Paracetamol"
        assert med["resident_id"] == resident_id
        pytest.med_id = med["id"]

    def test_staff_cannot_create_med(self, staff_token, resident_id):
        payload = {"name": "TEST_NoStaff", "dose": "1mg", "schedule_times": ["09:00"]}
        r = requests.post(
            f"{BASE_URL}/api/residents/{resident_id}/medications",
            headers=_h(staff_token),
            json=payload,
            timeout=15,
        )
        assert r.status_code == 403

    def test_patch_med(self, manager_token):
        mid = getattr(pytest, "med_id", None)
        assert mid
        payload = {
            "name": "TEST_Paracetamol_Updated",
            "dose": "1g",
            "route": "Oral",
            "schedule_times": ["12:00", "20:00"],
            "is_prn": False,
            "active": True,
        }
        r = requests.patch(
            f"{BASE_URL}/api/medications/{mid}",
            headers=_h(manager_token),
            json=payload,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["dose"] == "1g"

    def test_witness_required_rejects_no_witness(self, staff_token, manager_token):
        # Find Sertraline (requires_witness=true) for Aisha
        rs = requests.get(f"{BASE_URL}/api/residents", headers=_h(manager_token), timeout=15).json()
        aisha = next((x for x in rs if x["name"] == "Aisha Khan"), None)
        assert aisha
        meds = requests.get(
            f"{BASE_URL}/api/residents/{aisha['id']}/medications",
            headers=_h(manager_token),
            timeout=15,
        ).json()
        sertra = next((m for m in meds if "Sertraline" in m.get("name", "")), None)
        assert sertra, f"no Sertraline med: {[m['name'] for m in meds]}"
        assert sertra.get("requires_witness") is True
        # Attempt admin without witness_id
        payload = {
            "medication_id": sertra["id"],
            "scheduled_at": datetime.now(timezone.utc).isoformat(),
            "status": "given",
        }
        r = requests.post(
            f"{BASE_URL}/api/medications/{sertra['id']}/administer",
            headers=_h(staff_token),
            json=payload,
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_administer_success(self, staff_token, resident_id):
        mid = getattr(pytest, "med_id", None)
        assert mid
        payload = {
            "medication_id": mid,
            "scheduled_at": datetime.now(timezone.utc).isoformat(),
            "status": "given",
            "dose_given": "1g",
        }
        r = requests.post(
            f"{BASE_URL}/api/medications/{mid}/administer",
            headers=_h(staff_token),
            json=payload,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        admin = r.json()
        assert admin["status"] == "given"
        assert admin["administered_by_name"]

    def test_delete_soft(self, manager_token, resident_id):
        mid = getattr(pytest, "med_id", None)
        r = requests.delete(
            f"{BASE_URL}/api/medications/{mid}",
            headers=_h(manager_token),
            timeout=15,
        )
        assert r.status_code == 200
        # GET active list should not include
        r2 = requests.get(
            f"{BASE_URL}/api/residents/{resident_id}/medications?active_only=true",
            headers=_h(manager_token),
            timeout=15,
        )
        ids = [m["id"] for m in r2.json()]
        assert mid not in ids


# ---------- MAR PDF ----------
class TestMARPDF:
    def test_mar_pdf(self, manager_token):
        rs = requests.get(f"{BASE_URL}/api/residents", headers=_h(manager_token), timeout=15).json()
        # Pick a resident with meds (Maddy or Jordan)
        target = next((x for x in rs if x["name"] in ("Maddy O'Brien", "Jordan Reilly")), rs[0])
        today = datetime.now(timezone.utc).date()
        from_d = (today - timedelta(days=7)).isoformat()
        to_d = today.isoformat()
        r = requests.get(
            f"{BASE_URL}/api/residents/{target['id']}/mar/pdf?from_date={from_d}&to_date={to_d}",
            headers=_h(manager_token),
            timeout=20,
        )
        assert r.status_code == 200, r.text[:200]
        assert r.content[:5] == b"%PDF-", f"not a PDF: {r.content[:20]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")


# ---------- Body Maps ----------
class TestBodyMaps:
    @pytest.fixture(scope="class")
    def leo_id(self, manager_token):
        rs = requests.get(f"{BASE_URL}/api/residents", headers=_h(manager_token), timeout=15).json()
        leo = next((x for x in rs if x["name"] == "Leo Martinez"), None)
        assert leo
        return leo["id"]

    def test_seed_body_map_exists_for_leo(self, manager_token, leo_id):
        r = requests.get(
            f"{BASE_URL}/api/residents/{leo_id}/bodymaps",
            headers=_h(manager_token),
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        marks = data[0].get("marks", [])
        assert any("knee" in (m.get("region", "").lower()) for m in marks), data

    def test_create_bodymap_staff(self, staff_token, leo_id):
        payload = {
            "notes": "TEST_bodymap created by staff",
            "marks": [
                {
                    "side": "front",
                    "region": "Left forearm",
                    "x": 0.4,
                    "y": 0.5,
                    "type": "bruise",
                    "severity": "minor",
                    "description": "Small bruise observed",
                }
            ],
        }
        r = requests.post(
            f"{BASE_URL}/api/residents/{leo_id}/bodymaps",
            headers=_h(staff_token),
            json=payload,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        bm = r.json()
        assert bm["resident_id"] == leo_id
        assert len(bm["marks"]) == 1
        pytest.bodymap_id = bm["id"]

    def test_patch_bodymap(self, staff_token):
        bid = getattr(pytest, "bodymap_id", None)
        assert bid
        payload = {"notes": "TEST_bodymap updated"}
        r = requests.patch(
            f"{BASE_URL}/api/bodymaps/{bid}",
            headers=_h(staff_token),
            json=payload,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["notes"] == "TEST_bodymap updated"

    def test_staff_cannot_delete(self, staff_token):
        bid = getattr(pytest, "bodymap_id", None)
        r = requests.delete(
            f"{BASE_URL}/api/bodymaps/{bid}",
            headers=_h(staff_token),
            timeout=15,
        )
        assert r.status_code == 403

    def test_manager_can_delete(self, manager_token):
        bid = getattr(pytest, "bodymap_id", None)
        r = requests.delete(
            f"{BASE_URL}/api/bodymaps/{bid}",
            headers=_h(manager_token),
            timeout=15,
        )
        assert r.status_code == 200
