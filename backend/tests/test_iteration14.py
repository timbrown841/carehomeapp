"""Iteration 14 backend tests: Health & Wellbeing, Education/PEP, AttentionNow (Ofsted readiness)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to frontend .env via file read (public URL)
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

API = f"{BASE_URL}/api"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def manager_token():
    r = requests.post(f"{API}/auth/login", json={"email": "manager@care.local", "password": "Manager@123"})
    assert r.status_code == 200, f"manager login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{API}/auth/login", json={"email": "staff@care.local", "password": "Staff@123"})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@care.local", "password": "Admin@123"})
    assert r.status_code == 200
    return r.json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def residents(manager_token):
    r = requests.get(f"{API}/residents", headers=auth(manager_token))
    assert r.status_code == 200
    data = r.json()
    # Response can be list or dict
    items = data if isinstance(data, list) else data.get("items", data.get("residents", []))
    assert items, "No residents seeded"
    by_name = {}
    for x in items:
        name = (x.get("name") or "").lower()
        by_name[name] = x
    return {"all": items, "by_name": by_name}


def _find(residents, part):
    for name, r in residents["by_name"].items():
        if part.lower() in name:
            return r
    return None


# ---------- Health bundle ----------
class TestHealthBundle:
    def test_get_health_bundle_structure(self, manager_token, residents):
        res = _find(residents, "aisha") or residents["all"][0]
        r = requests.get(f"{API}/residents/{res['id']}/health", headers=auth(manager_token))
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ["appointments", "observations", "immunisations", "upcoming_appointments", "overdue_immunisations"]:
            assert key in data, f"missing key {key}"
            assert isinstance(data[key], list)

    def test_maddy_has_overdue_immunisation(self, manager_token, residents):
        maddy = _find(residents, "maddy")
        if not maddy:
            pytest.skip("Maddy not seeded")
        r = requests.get(f"{API}/residents/{maddy['id']}/health", headers=auth(manager_token))
        assert r.status_code == 200
        data = r.json()
        # Expect at least one overdue immunisation seeded (Td/IPV)
        overdue = data["overdue_immunisations"]
        assert len(overdue) >= 1, f"Expected Maddy to have overdue immunisation, got: {overdue}"


class TestHealthCRUD:
    _created_appt = None
    _created_obs = None
    _created_immu = None

    def test_create_appointment_and_persist(self, manager_token, residents):
        res = _find(residents, "aisha") or residents["all"][0]
        payload = {
            "kind": "gp",
            "title": "TEST_iter14 GP check-up",
            "date": "2030-12-01",
            "time": "10:00",
            "status": "scheduled",
        }
        r = requests.post(f"{API}/residents/{res['id']}/health/appointments",
                          json=payload, headers=auth(manager_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == payload["title"]
        assert data["resident_id"] == res["id"]
        assert "id" in data
        TestHealthCRUD._created_appt = (res["id"], data["id"])

        # verify via bundle
        r2 = requests.get(f"{API}/residents/{res['id']}/health", headers=auth(manager_token))
        ids = [a["id"] for a in r2.json()["appointments"]]
        assert data["id"] in ids
        # should be in upcoming since far future + scheduled
        up_ids = [a["id"] for a in r2.json()["upcoming_appointments"]]
        assert data["id"] in up_ids

    def test_patch_appointment(self, manager_token):
        if not TestHealthCRUD._created_appt:
            pytest.skip("no appt")
        rid, aid = TestHealthCRUD._created_appt
        r = requests.patch(f"{API}/health/appointments/{aid}", json={
            "kind": "dental", "title": "TEST_iter14 updated", "date": "2030-12-02", "status": "scheduled"
        }, headers=auth(manager_token))
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "TEST_iter14 updated"

    def test_create_observation(self, staff_token, residents):
        res = _find(residents, "aisha") or residents["all"][0]
        r = requests.post(f"{API}/residents/{res['id']}/health/observations",
                          json={"kind": "weight", "value": "52.3", "unit": "kg"},
                          headers=auth(staff_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["value"] == "52.3"
        assert data["kind"] == "weight"
        TestHealthCRUD._created_obs = (res["id"], data["id"])

    def test_create_immunisation(self, manager_token, residents):
        res = _find(residents, "aisha") or residents["all"][0]
        r = requests.post(f"{API}/residents/{res['id']}/health/immunisations",
                          json={"vaccine": "TEST_iter14 Flu", "date_given": "2026-01-01"},
                          headers=auth(manager_token))
        assert r.status_code == 200, r.text
        TestHealthCRUD._created_immu = (res["id"], r.json()["id"])

    def test_delete_immunisation_requires_manager(self, staff_token):
        if not TestHealthCRUD._created_immu:
            pytest.skip()
        _, iid = TestHealthCRUD._created_immu
        r = requests.delete(f"{API}/health/immunisations/{iid}", headers=auth(staff_token))
        assert r.status_code in (401, 403), f"staff should not delete immu: {r.status_code}"

    def test_cleanup(self, manager_token):
        # delete appt
        if TestHealthCRUD._created_appt:
            _, aid = TestHealthCRUD._created_appt
            requests.delete(f"{API}/health/appointments/{aid}", headers=auth(manager_token))
        if TestHealthCRUD._created_obs:
            _, oid = TestHealthCRUD._created_obs
            r = requests.delete(f"{API}/health/observations/{oid}", headers=auth(manager_token))
            assert r.status_code == 200
        if TestHealthCRUD._created_immu:
            _, iid = TestHealthCRUD._created_immu
            r = requests.delete(f"{API}/health/immunisations/{iid}", headers=auth(manager_token))
            assert r.status_code == 200


# ---------- Education ----------
class TestEducation:
    def test_get_education_stub_for_unknown(self, manager_token, residents):
        # Pick any resident and GET; should return at minimum exclusions/achievements arrays
        res = residents["all"][0]
        r = requests.get(f"{API}/residents/{res['id']}/education", headers=auth(manager_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "exclusions" in data
        assert "achievements" in data

    def test_leo_has_overdue_next_pep(self, manager_token, residents):
        leo = _find(residents, "leo")
        if not leo:
            pytest.skip("Leo not seeded")
        r = requests.get(f"{API}/residents/{leo['id']}/education", headers=auth(manager_token))
        assert r.status_code == 200
        data = r.json()
        # next_pep_date must be set and in the past
        from datetime import date
        assert data.get("next_pep_date"), f"expected next_pep_date for Leo, got {data}"
        assert data["next_pep_date"] < date.today().isoformat(), f"Leo next PEP should be overdue, got {data['next_pep_date']}"

    def test_upsert_education(self, manager_token, residents):
        res = _find(residents, "aisha") or residents["all"][0]
        payload = {
            "school": "TEST_iter14 High",
            "year_group": "Year 10",
            "attendance_pct": 92.5,
            "next_pep_date": "2030-06-01",
            "designated_teacher": "Test DT",
        }
        r = requests.put(f"{API}/residents/{res['id']}/education", json=payload, headers=auth(manager_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["school"] == "TEST_iter14 High"
        assert data["attendance_pct"] == 92.5
        # verify GET
        r2 = requests.get(f"{API}/residents/{res['id']}/education", headers=auth(manager_token))
        assert r2.json()["school"] == "TEST_iter14 High"

    def test_add_achievement_and_exclusion(self, manager_token, residents):
        res = _find(residents, "aisha") or residents["all"][0]
        r = requests.post(f"{API}/residents/{res['id']}/education/achievements",
                          json={"date": "2026-01-05", "title": "TEST_iter14 achievement"},
                          headers=auth(manager_token))
        assert r.status_code == 200, r.text
        assert any(a["title"] == "TEST_iter14 achievement" for a in r.json()["achievements"])

        r2 = requests.post(f"{API}/residents/{res['id']}/education/exclusions",
                           json={"date": "2026-01-06", "reason": "TEST_iter14 exc", "days": 1, "type": "fixed_term"},
                           headers=auth(manager_token))
        assert r2.status_code == 200
        assert any(e["reason"] == "TEST_iter14 exc" for e in r2.json()["exclusions"])


# ---------- Ofsted readiness (for Attention Now) ----------
class TestOfstedReadiness:
    def test_readiness_shape(self, manager_token):
        r = requests.get(f"{API}/ofsted/readiness", headers=auth(manager_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "overall" in data
        assert isinstance(data["overall"], (int, float))
        # Seed always < 100 in dev so attention strip shows
        assert data["overall"] < 100
        assert "sections" in data
        assert isinstance(data["sections"], list)
        assert len(data["sections"]) > 0
        # Each section must have id + score
        for s in data["sections"]:
            assert "id" in s
            assert "score" in s


# ---------- Regression: medications/bodymaps still functional ----------
class TestRegressionIter13:
    def test_medications_round_accessible(self, staff_token):
        from datetime import date
        r = requests.get(f"{API}/medications/round?date={date.today().isoformat()}",
                         headers=auth(staff_token))
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), (list, dict))

    def test_dashboard_stats(self, manager_token):
        r = requests.get(f"{API}/dashboard/stats", headers=auth(manager_token))
        assert r.status_code == 200
