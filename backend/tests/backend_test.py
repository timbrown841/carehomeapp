"""End-to-end backend tests for Care Companion API."""
import os
import io
import struct
import math
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://safeguard-dash-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login("admin@care.local", "Admin@123")


@pytest.fixture(scope="session")
def manager_token():
    return _login("manager@care.local", "Manager@123")


@pytest.fixture(scope="session")
def staff_token():
    return _login("staff@care.local", "Staff@123")


def _h(t):
    return {"Authorization": f"Bearer {t}"}


# ---- Auth ----
class TestAuth:
    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@y.z", "password": "bad"}, timeout=15)
        assert r.status_code == 401

    def test_me_admin(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == "admin@care.local"
        assert d["role"] == "admin"

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# ---- Residents ----
class TestResidents:
    def test_staff_cannot_create(self, staff_token):
        r = requests.post(f"{API}/residents", headers=_h(staff_token), json={"name": "TEST_NoAccess"}, timeout=15)
        assert r.status_code == 403

    def test_manager_create_and_list(self, manager_token):
        r = requests.post(f"{API}/residents", headers=_h(manager_token),
                          json={"name": "TEST_Resident_A", "room": "R1", "notes": "test"}, timeout=15)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        assert r.json()["name"] == "TEST_Resident_A"
        # list
        lr = requests.get(f"{API}/residents", headers=_h(manager_token), timeout=15)
        assert lr.status_code == 200
        assert any(x["id"] == rid for x in lr.json())
        pytest.resident_id = rid


# ---- Notes ----
class TestNotes:
    def test_create_note_staff(self, staff_token, manager_token):
        rid = getattr(pytest, "resident_id", None)
        if not rid:
            r = requests.post(f"{API}/residents", headers=_h(manager_token),
                              json={"name": "TEST_R_Notes"}, timeout=15)
            rid = r.json()["id"]
            pytest.resident_id = rid
        r = requests.post(f"{API}/notes", headers=_h(staff_token),
                          json={"resident_id": rid, "category": "wellbeing", "body": "TEST_note body"},
                          timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["body"] == "TEST_note body"

    def test_list_notes_filter(self, staff_token):
        rid = pytest.resident_id
        r = requests.get(f"{API}/notes", headers=_h(staff_token), params={"resident_id": rid}, timeout=15)
        assert r.status_code == 200
        assert all(n["resident_id"] == rid for n in r.json())


# ---- Incidents ----
class TestIncidents:
    def test_create_incident(self, staff_token):
        rid = pytest.resident_id
        r = requests.post(f"{API}/incidents", headers=_h(staff_token),
                          json={"resident_id": rid, "severity": "medium", "category": "verbal",
                                "body": "TEST_incident", "safeguarding": True}, timeout=15)
        assert r.status_code == 200, r.text
        pytest.incident_id = r.json()["id"]
        assert r.json()["status"] == "open"

    def test_safeguarding_filter(self, staff_token):
        r = requests.get(f"{API}/incidents", headers=_h(staff_token),
                         params={"safeguarding_only": "true"}, timeout=15)
        assert r.status_code == 200
        assert all(i["safeguarding"] for i in r.json())

    def test_staff_cant_review(self, staff_token):
        iid = pytest.incident_id
        r = requests.patch(f"{API}/incidents/{iid}/status", headers=_h(staff_token),
                           params={"status": "reviewed"}, timeout=15)
        assert r.status_code == 403

    def test_manager_can_review(self, manager_token):
        iid = pytest.incident_id
        r = requests.patch(f"{API}/incidents/{iid}/status", headers=_h(manager_token),
                           params={"status": "reviewed"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "reviewed"


# ---- Dashboard ----
class TestDashboard:
    def test_stats(self, staff_token):
        r = requests.get(f"{API}/dashboard/stats", headers=_h(staff_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_residents", "notes_today", "incidents_week", "safeguarding_open",
                  "recent_incidents", "recent_notes"]:
            assert k in d


# ---- Reports (LLM) ----
class TestReports:
    def test_staff_forbidden(self, staff_token):
        r = requests.post(f"{API}/reports/generate", headers=_h(staff_token),
                          json={"from_date": "2025-01-01", "to_date": "2026-12-31"}, timeout=60)
        assert r.status_code == 403

    def test_manager_generate(self, manager_token):
        r = requests.post(f"{API}/reports/generate", headers=_h(manager_token),
                          json={"from_date": "2025-01-01", "to_date": "2026-12-31"}, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "summary" in d and len(d["summary"]) > 10
        assert d["incident_count"] >= 0


# ---- Voice transcription ----
def _make_wav(seconds=1, freq=440, rate=16000):
    n = seconds * rate
    buf = io.BytesIO()
    # WAV header
    data = b"".join(struct.pack("<h", int(0.2 * 32767 * math.sin(2 * math.pi * freq * i / rate))) for i in range(n))
    size = 36 + len(data)
    buf.write(b"RIFF" + struct.pack("<I", size) + b"WAVE")
    buf.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16))
    buf.write(b"data" + struct.pack("<I", len(data)) + data)
    return buf.getvalue()


class TestVoice:
    def test_transcribe_unauth(self):
        r = requests.post(f"{API}/voice/transcribe",
                          files={"audio": ("a.wav", b"x", "audio/wav")}, timeout=15)
        assert r.status_code == 401

    def test_transcribe_empty(self, staff_token):
        r = requests.post(f"{API}/voice/transcribe", headers=_h(staff_token),
                          files={"audio": ("a.wav", b"", "audio/wav")}, timeout=30)
        assert r.status_code == 400

    def test_transcribe_wav(self, staff_token):
        wav = _make_wav(seconds=1)
        r = requests.post(f"{API}/voice/transcribe", headers=_h(staff_token),
                          files={"audio": ("test.wav", wav, "audio/wav")}, timeout=60)
        assert r.status_code == 200, r.text
        assert "text" in r.json()


# ---- Cleanup ----
def teardown_module(module):
    try:
        admin = _login("admin@care.local", "Admin@123")
        # Delete test residents (cascades nothing, but cleans data)
        for r in requests.get(f"{API}/residents", headers=_h(admin), timeout=15).json():
            if r["name"].startswith("TEST_"):
                requests.delete(f"{API}/residents/{r['id']}", headers=_h(admin), timeout=15)
    except Exception:
        pass
