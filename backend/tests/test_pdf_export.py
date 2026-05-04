"""Iteration 6: PDF export endpoint tests."""
import os
import io
import pytest
import requests
from pypdf import PdfReader

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://safeguard-dash-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def staff_token():
    return _login("staff@care.local", "Staff@123")


@pytest.fixture(scope="module")
def manager_token():
    return _login("manager@care.local", "Manager@123")


@pytest.fixture(scope="module")
def seeded(manager_token, staff_token):
    """Create a resident + a safeguarding incident with tags + a normal incident."""
    r = requests.post(f"{API}/residents", headers=_h(manager_token),
                      json={"name": "TEST_PDF_Young_Person", "room": "12", "dob": "2010-06-01"},
                      timeout=15)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]

    # Incident with safeguarding + tags + structured report
    inc_payload = {
        "resident_id": rid,
        "severity": "high",
        "category": "physical",
        "incident_type": "behaviour",
        "body": "TEST_pdf_body incident summary",
        "safeguarding": True,
        "tags": ["aggression", "restraint"],
        "structured_report": "1) Who: John\n2) What: altercation\n3) Where: lounge\n6) Follow up: monitor",
        "raw_transcript": "he was upset and kicked the chair hard",
        "voice_used": True,
        "action_taken": "1:1 support offered",
    }
    ci = requests.post(f"{API}/incidents", headers=_h(staff_token), json=inc_payload, timeout=15)
    assert ci.status_code == 200, ci.text
    iid = ci.json()["id"]
    return {"resident_id": rid, "incident_id": iid, "resident_name": "TEST_PDF_Young_Person"}


class TestGetIncidentById:
    def test_get_incident_returns_full_dict(self, staff_token, seeded):
        r = requests.get(f"{API}/incidents/{seeded['incident_id']}", headers=_h(staff_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["id", "body", "severity", "status", "created_at", "author_name",
                  "tags", "structured_report", "raw_transcript"]:
            assert k in d, f"missing field {k}"
        assert d["id"] == seeded["incident_id"]
        assert d["safeguarding"] is True
        assert d["tags"] == ["aggression", "restraint"]

    def test_get_incident_unauth(self, seeded):
        r = requests.get(f"{API}/incidents/{seeded['incident_id']}", timeout=15)
        assert r.status_code == 401

    def test_get_incident_404(self, staff_token):
        r = requests.get(f"{API}/incidents/non-existent-id", headers=_h(staff_token), timeout=15)
        assert r.status_code == 404


class TestPdfExport:
    def test_pdf_unauth(self, seeded):
        r = requests.get(f"{API}/incidents/{seeded['incident_id']}/pdf", timeout=15)
        assert r.status_code == 401

    def test_pdf_404(self, staff_token):
        r = requests.get(f"{API}/incidents/non-existent-id/pdf", headers=_h(staff_token), timeout=15)
        assert r.status_code == 404

    def test_pdf_headers_and_content(self, staff_token, seeded):
        r = requests.get(f"{API}/incidents/{seeded['incident_id']}/pdf",
                         headers=_h(staff_token), timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert "Safelyn_Incident_" in cd
        assert "TEST_PDF_Young_Person" in cd
        # ref 8-char suffix
        short_ref = seeded["incident_id"].replace("-", "")[-8:].upper()
        assert short_ref in cd
        assert cd.endswith('.pdf"') or cd.endswith(".pdf")
        # PDF magic
        assert r.content[:4] == b"%PDF"
        # extract text
        reader = PdfReader(io.BytesIO(r.content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        for needle in [
            "Safelyn Systems",
            "INCIDENT REPORT",
            "TEST_PDF_Young_Person",
            "YOUNG PERSON",
            "LOGGED BY",
            "REFERENCE",
            "STRUCTURED REPORT",
            "VERIFICATION",
            "REPORTING STAFF",
            "REVIEWED BY (MANAGER)",
            "Signature:",
            "Date:",
        ]:
            assert needle in text, f"missing '{needle}' in PDF text. Sample: {text[:400]}"
        # 2 signature lines and 2 date lines
        assert text.count("Signature:") >= 2, "expected 2 Signature: lines"
        assert text.count("Date:") >= 2, "expected 2 Date: lines"
        # Ref starts with #
        short_ref_hash = f"#{short_ref}"
        assert short_ref_hash in text, f"missing {short_ref_hash} in PDF"
        # Safeguarding flagged
        assert "SAFEGUARDING FLAGGED" in text or "SAFEGUARDING" in text
        # Tags
        assert "aggression" in text
        assert "restraint" in text
        # Author_name present
        # author_name stamped by server (Staff user)
        # Fetch incident to get author_name
        inc = requests.get(f"{API}/incidents/{seeded['incident_id']}", headers=_h(staff_token), timeout=15).json()
        author = inc["author_name"]
        assert author in text, f"author_name '{author}' missing from PDF"

    def test_pdf_manager_can_download(self, manager_token, seeded):
        r = requests.get(f"{API}/incidents/{seeded['incident_id']}/pdf",
                         headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")


def teardown_module(module):
    try:
        admin = _login("admin@care.local", "Admin@123")
        for r in requests.get(f"{API}/residents", headers=_h(admin), timeout=15).json():
            if r["name"].startswith("TEST_PDF_"):
                requests.delete(f"{API}/residents/{r['id']}", headers=_h(admin), timeout=15)
    except Exception:
        pass
