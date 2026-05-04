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
                  "recent_incidents", "recent_notes",
                  "high_risk_alerts", "overdue_tasks", "missing_records"]:
            assert k in d, f"missing field {k}"
        # new fields must be ints
        assert isinstance(d["high_risk_alerts"], int)
        assert isinstance(d["overdue_tasks"], int)
        assert isinstance(d["missing_records"], int)
        assert d["high_risk_alerts"] >= 0
        assert d["overdue_tasks"] >= 0
        assert d["missing_records"] >= 0

    def test_high_risk_alerts_counts_safeguarding_open(self, staff_token, manager_token):
        # Get baseline
        baseline = requests.get(f"{API}/dashboard/stats", headers=_h(staff_token), timeout=15).json()["high_risk_alerts"]
        # Create a safeguarding + open incident
        rid = pytest.resident_id
        r = requests.post(f"{API}/incidents", headers=_h(staff_token),
                          json={"resident_id": rid, "severity": "low", "category": "verbal",
                                "body": "TEST_high_risk_sf", "safeguarding": True}, timeout=15)
        assert r.status_code == 200
        after = requests.get(f"{API}/dashboard/stats", headers=_h(staff_token), timeout=15).json()["high_risk_alerts"]
        assert after == baseline + 1, f"expected high_risk_alerts to incr: {baseline} -> {after}"
        # close it
        iid = r.json()["id"]
        requests.patch(f"{API}/incidents/{iid}/status", headers=_h(manager_token),
                       params={"status": "closed"}, timeout=15)
        after2 = requests.get(f"{API}/dashboard/stats", headers=_h(staff_token), timeout=15).json()["high_risk_alerts"]
        assert after2 == baseline, f"closing should decrement: {after2} vs {baseline}"

    def test_high_risk_alerts_counts_high_severity_open(self, staff_token):
        baseline = requests.get(f"{API}/dashboard/stats", headers=_h(staff_token), timeout=15).json()["high_risk_alerts"]
        rid = pytest.resident_id
        r = requests.post(f"{API}/incidents", headers=_h(staff_token),
                          json={"resident_id": rid, "severity": "high", "category": "physical",
                                "body": "TEST_high_sev", "safeguarding": False}, timeout=15)
        assert r.status_code == 200
        after = requests.get(f"{API}/dashboard/stats", headers=_h(staff_token), timeout=15).json()["high_risk_alerts"]
        assert after == baseline + 1


@pytest.fixture(scope="session")
def seeded_resident_id(manager_token):
    # Ensure a resident exists for tests that run before TestResidents alphabetically
    rid = getattr(pytest, "resident_id", None)
    if rid:
        return rid
    r = requests.post(f"{API}/residents", headers=_h(manager_token),
                      json={"name": "TEST_Resident_Seed"}, timeout=15)
    assert r.status_code == 200
    rid = r.json()["id"]
    pytest.resident_id = rid
    return rid


# ---- Incident /structure endpoint (GPT-5.2) ----
class TestIncidentStructure:
    def test_structure_unauth(self):
        r = requests.post(f"{API}/incidents/structure",
                          json={"incident_type": "behaviour", "severity": "low",
                                "transcript": "John kicked chair and shouted"}, timeout=15)
        assert r.status_code == 401

    def test_structure_transcript_too_short(self, staff_token):
        r = requests.post(f"{API}/incidents/structure", headers=_h(staff_token),
                          json={"incident_type": "behaviour", "severity": "low",
                                "transcript": "hi", "tags": []}, timeout=30)
        assert r.status_code == 400

    def test_structure_ok(self, staff_token, seeded_resident_id):
        rid = seeded_resident_id
        payload = {
            "resident_id": rid,
            "incident_type": "behaviour",
            "severity": "medium",
            "transcript": "At about 3pm John became angry during homework, threw his pen, "
                          "shouted at staff and refused to engage. Calmed after 10 minutes "
                          "with 1:1 support from Sarah.",
            "tags": ["aggression"],
        }
        r = requests.post(f"{API}/incidents/structure", headers=_h(staff_token),
                          json=payload, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["structured_report", "suggested_action",
                  "suggested_severity", "suggested_safeguarding"]:
            assert k in d, f"missing key {k}"
        assert d["suggested_severity"] in ["low", "medium", "high"]
        assert isinstance(d["suggested_safeguarding"], bool)
        assert "1)" in d["structured_report"], "expected Ofsted section '1)'"
        assert "6)" in d["structured_report"], "expected Ofsted section '6)'"

    def test_incident_new_fields_roundtrip(self, staff_token, seeded_resident_id):
        rid = seeded_resident_id
        body = {
            "resident_id": rid,
            "severity": "medium",
            "category": "verbal",
            "incident_type": "behaviour",
            "body": "TEST_structured_incident body",
            "safeguarding": False,
            "tags": ["aggression", "refusal"],
            "structured_report": "1) Who: John\n2) What: shouted\n3) Where...\n6) Follow up: review",
            "raw_transcript": "he shouted and threw a pen",
            "voice_used": True,
            "action_taken": "Offered 1:1 support",
        }
        cr = requests.post(f"{API}/incidents", headers=_h(staff_token), json=body, timeout=15)
        assert cr.status_code == 200, cr.text
        iid = cr.json()["id"]
        pytest.structured_incident_id = iid
        # GET list and find
        lr = requests.get(f"{API}/incidents", headers=_h(staff_token), timeout=15)
        assert lr.status_code == 200
        found = [x for x in lr.json() if x["id"] == iid]
        assert found, "structured incident not returned in list"
        it = found[0]
        assert it["tags"] == ["aggression", "refusal"]
        assert it["structured_report"].startswith("1) Who: John")
        assert it["raw_transcript"] == "he shouted and threw a pen"
        assert it["incident_type"] == "behaviour"

    def test_incident_backward_compat_old_row(self, staff_token):
        # Any earlier incident (created without the new fields) must still load with defaults
        lr = requests.get(f"{API}/incidents", headers=_h(staff_token), timeout=15)
        assert lr.status_code == 200
        # At least one of the legacy TEST_incident rows should be present
        legacy = [x for x in lr.json() if x.get("body", "").startswith("TEST_incident")]
        assert legacy, "expected legacy incident in list"
        for it in legacy:
            assert isinstance(it.get("tags", []), list)
            assert "structured_report" in it
            assert "raw_transcript" in it
            assert "incident_type" in it


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


# ---- Iteration 4: Trust & Audit ----
class TestIteration4TrustAudit:
    """Verify server-side timestamp + author stamping and reports.records audit array."""

    def test_note_has_server_side_timestamp_and_author(self, staff_token, seeded_resident_id):
        rid = seeded_resident_id
        payload = {
            "resident_id": rid,
            "category": "wellbeing",
            "body": "TEST_trust_note",
            # Try to spoof these — server MUST ignore them
            "author_name": "HACKER",
            "created_at": "1999-01-01T00:00:00+00:00",
        }
        r = requests.post(f"{API}/notes", headers=_h(staff_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # created_at must be a fresh ISO string with timezone info
        ts = d.get("created_at") or ""
        assert ts, "created_at missing"
        assert ("+" in ts) or ts.endswith("Z"), f"created_at lacks timezone: {ts}"
        assert not ts.startswith("1999"), "server accepted client-supplied created_at"
        # author_name must be the JWT user (Staff), not the spoofed value
        assert d.get("author_name")
        assert d["author_name"] != "HACKER", "server trusted client author_name"
        assert "staff" in d["author_name"].lower() or d["author_name"] != "HACKER"
        # id present
        assert d.get("id")

    def test_incident_has_server_side_timestamp_and_author(self, staff_token, seeded_resident_id):
        rid = seeded_resident_id
        payload = {
            "resident_id": rid,
            "severity": "low",
            "category": "verbal",
            "body": "TEST_trust_incident",
            "safeguarding": False,
            "author_name": "SPOOF",
            "created_at": "2000-01-01T00:00:00+00:00",
        }
        r = requests.post(f"{API}/incidents", headers=_h(staff_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        ts = d.get("created_at") or ""
        assert ts
        assert ("+" in ts) or ts.endswith("Z"), f"created_at lacks timezone: {ts}"
        assert not ts.startswith("2000"), "server trusted client-provided created_at"
        assert d.get("author_name") and d["author_name"] != "SPOOF"
        assert d.get("id")

    def test_report_records_array_with_audit_trail(self, staff_token, manager_token, seeded_resident_id):
        rid = seeded_resident_id
        # Create one note + one incident to guarantee records are present
        n = requests.post(f"{API}/notes", headers=_h(staff_token),
                          json={"resident_id": rid, "category": "wellbeing",
                                "body": "TEST_report_audit_note"}, timeout=15)
        assert n.status_code == 200
        inc = requests.post(f"{API}/incidents", headers=_h(staff_token),
                            json={"resident_id": rid, "severity": "low",
                                  "category": "verbal", "body": "TEST_report_audit_inc",
                                  "safeguarding": True}, timeout=15)
        assert inc.status_code == 200

        r = requests.post(f"{API}/reports/generate", headers=_h(manager_token),
                          json={"from_date": "2025-01-01", "to_date": "2026-12-31"}, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "records" in d, "records array missing from /reports/generate response"
        records = d["records"]
        assert isinstance(records, list)
        # counts must match incident_count + note_count
        incident_records = [x for x in records if x.get("kind") == "incident"]
        note_records = [x for x in records if x.get("kind") == "note"]
        assert len(incident_records) == d["incident_count"], \
            f"incident records {len(incident_records)} != incident_count {d['incident_count']}"
        assert len(note_records) == d["note_count"], \
            f"note records {len(note_records)} != note_count {d['note_count']}"
        assert len(records) == d["incident_count"] + d["note_count"]
        # each record has the required fields
        required_common = {"kind", "id", "resident_id", "resident_name",
                           "author_name", "created_at", "category", "body"}
        for rec in records:
            missing = required_common - set(rec.keys())
            assert not missing, f"record missing keys {missing}: {rec}"
            if rec["kind"] == "incident":
                assert "severity" in rec and "safeguarding" in rec
        # sorted ascending by created_at
        ts_list = [x["created_at"] for x in records if x.get("created_at")]
        assert ts_list == sorted(ts_list), "records not sorted ascending by created_at"

    def test_report_generated_by_populated(self, manager_token):
        r = requests.post(f"{API}/reports/generate", headers=_h(manager_token),
                          json={"from_date": "2025-01-01", "to_date": "2026-12-31"}, timeout=120)
        assert r.status_code == 200
        d = r.json()
        assert d.get("generated_by"), "generated_by should be present"


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
