"""Iteration 7 tests: dashboard expanded stats, notifications, manager report PDF, incident PDF QR/audit."""
import io
import os
import pytest
import requests
from pypdf import PdfReader

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
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
def admin_token():
    return _login("admin@care.local", "Admin@123")


@pytest.fixture(scope="module")
def seeded(manager_token, staff_token):
    """Create a resident + a safeguarding incident with tags."""
    r = requests.post(f"{API}/residents", headers=_h(manager_token),
                      json={"name": "TEST_IT7_YP", "room": "7", "dob": "2010-01-01"}, timeout=15)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    ci = requests.post(f"{API}/incidents", headers=_h(staff_token), json={
        "resident_id": rid,
        "severity": "high", "category": "physical", "incident_type": "behaviour",
        "body": "TEST_IT7 incident body",
        "safeguarding": True,
        "tags": ["aggression", "restraint"],
        "structured_report": "1) Who: John\n2) What: altercation\n6) Follow up: monitor",
        "raw_transcript": "upset and kicked",
        "voice_used": True,
        "action_taken": "1:1 support",
    }, timeout=15)
    assert ci.status_code == 200, ci.text
    return {"resident_id": rid, "incident_id": ci.json()["id"]}


# ---- Dashboard new fields ----
class TestDashboardExpandedStats:
    def test_new_fields_present(self, staff_token):
        r = requests.get(f"{API}/dashboard/stats", headers=_h(staff_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["incidents_prev_week", "incidents_trend_pct",
                  "supervisions_due", "appraisals_overdue", "total_staff",
                  "top_tags", "top_types"]:
            assert k in d, f"missing {k}"
        assert isinstance(d["incidents_prev_week"], int)
        assert isinstance(d["incidents_trend_pct"], int)
        assert isinstance(d["supervisions_due"], int)
        assert isinstance(d["appraisals_overdue"], int)
        assert isinstance(d["total_staff"], int)
        assert isinstance(d["top_tags"], list)
        assert isinstance(d["top_types"], list)
        # server counts only staff + manager roles (not admin)
        assert d["total_staff"] >= 2, f"total_staff={d['total_staff']} (expected >=2 for manager+staff)"
        # With empty supervisions collection, supervisions_due == total_staff
        # (may not be empty after prior runs, but must be <= total_staff)
        assert 0 <= d["supervisions_due"] <= d["total_staff"]
        assert 0 <= d["appraisals_overdue"] <= d["total_staff"]
        # top_tags items shape
        if d["top_tags"]:
            item = d["top_tags"][0]
            assert "tag" in item and "count" in item
        if d["top_types"]:
            item = d["top_types"][0]
            assert "type" in item and "count" in item


# ---- Notifications ----
class TestNotifications:
    def test_unauth(self, seeded):
        r = requests.post(f"{API}/notifications",
                          json={"incident_id": seeded["incident_id"], "kind": "manager"}, timeout=15)
        assert r.status_code == 401

    def test_notify_manager_by_staff(self, staff_token, seeded):
        r = requests.post(f"{API}/notifications", headers=_h(staff_token),
                          json={"incident_id": seeded["incident_id"], "kind": "manager"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"]
        assert d["sent_by_name"]
        assert d["recipient_role"] == "manager"
        assert d["incident_summary"]["resident_name"] == "TEST_IT7_YP"
        assert d["incident_summary"]["severity"] == "high"
        assert d["incident_summary"]["body_excerpt"]
        pytest.it7_notif_manager_id = d["id"]

    def test_notify_dsl_by_staff(self, staff_token, seeded):
        r = requests.post(f"{API}/notifications", headers=_h(staff_token),
                          json={"incident_id": seeded["incident_id"], "kind": "dsl"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["recipient_role"] == "admin"
        pytest.it7_notif_dsl_id = d["id"]

    def test_notify_invalid_incident(self, staff_token):
        r = requests.post(f"{API}/notifications", headers=_h(staff_token),
                          json={"incident_id": "nope-404", "kind": "manager"}, timeout=15)
        assert r.status_code == 404

    def test_list_manager_sees_manager_notifs(self, manager_token):
        # Ensure manager notification was created in prior test
        r = requests.get(f"{API}/notifications", headers=_h(manager_token), timeout=15)
        assert r.status_code == 200
        docs = r.json()
        assert all(x["recipient_role"] == "manager" for x in docs)
        assert any(x["id"] == getattr(pytest, "it7_notif_manager_id", None) for x in docs), \
            "manager should see manager-targeted notification"

    def test_list_admin_sees_both(self, admin_token):
        r = requests.get(f"{API}/notifications", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        docs = r.json()
        roles = {x["recipient_role"] for x in docs}
        # admin sees manager + admin
        assert roles.issubset({"manager", "admin"})
        assert any(x["id"] == getattr(pytest, "it7_notif_dsl_id", None) for x in docs)

    def test_list_staff_sees_own(self, staff_token):
        r = requests.get(f"{API}/notifications", headers=_h(staff_token), timeout=15)
        assert r.status_code == 200
        docs = r.json()
        # All ids that staff sent must appear; none of other users'
        mid = getattr(pytest, "it7_notif_manager_id", None)
        if mid:
            assert any(x["id"] == mid for x in docs)

    def test_unread_only_filter(self, manager_token):
        r = requests.get(f"{API}/notifications", headers=_h(manager_token),
                         params={"unread_only": "true"}, timeout=15)
        assert r.status_code == 200
        for x in r.json():
            assert x.get("read_at") in (None, "")

    def test_mark_read(self, manager_token):
        nid = getattr(pytest, "it7_notif_manager_id", None)
        assert nid
        r = requests.post(f"{API}/notifications/{nid}/read",
                          headers=_h(manager_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == nid
        assert d.get("read_at")

        # Should not appear in unread_only anymore
        u = requests.get(f"{API}/notifications", headers=_h(manager_token),
                        params={"unread_only": "true"}, timeout=15).json()
        assert all(x["id"] != nid for x in u)


# ---- Manager Report PDF ----
class TestManagerReportPdf:
    @pytest.fixture(scope="class")
    def report_id(self, manager_token):
        r = requests.post(f"{API}/reports/generate", headers=_h(manager_token),
                          json={"from_date": "2025-01-01", "to_date": "2026-12-31"}, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("id")
        return d["id"]

    def test_unauth(self, report_id):
        r = requests.get(f"{API}/reports/{report_id}/pdf", timeout=15)
        assert r.status_code == 401

    def test_staff_forbidden(self, staff_token, report_id):
        r = requests.get(f"{API}/reports/{report_id}/pdf", headers=_h(staff_token), timeout=30)
        assert r.status_code == 403

    def test_missing_returns_404(self, manager_token):
        r = requests.get(f"{API}/reports/not-a-real-report/pdf",
                         headers=_h(manager_token), timeout=15)
        assert r.status_code == 404

    def test_manager_downloads_pdf(self, manager_token, report_id):
        r = requests.get(f"{API}/reports/{report_id}/pdf",
                         headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert "Safelyn_Manager_Report_" in cd
        assert r.content[:4] == b"%PDF"
        # extract text
        reader = PdfReader(io.BytesIO(r.content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        for needle in [
            "Safelyn Systems",
            "Manager Report",
            "AI-GENERATED SUMMARY",
            "AUDIT TRAIL",
            "VERIFICATION",
            "Signature:",
            "Audit hash:",
        ]:
            assert needle in text, f"missing '{needle}' in report PDF (sample: {text[:400]})"
        assert text.count("Signature:") >= 2, "expected 2 signature lines"


# ---- Incident PDF: QR + audit hash ----
class TestIncidentPdfQrAudit:
    def test_incident_pdf_has_audit_hash_and_qr_caption(self, staff_token, seeded):
        r = requests.get(f"{API}/incidents/{seeded['incident_id']}/pdf",
                         headers=_h(staff_token), timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        reader = PdfReader(io.BytesIO(r.content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        assert "Audit hash:" in text, f"missing 'Audit hash:' in PDF: {text[-400:]}"
        assert "Scan to verify" in text, f"missing 'Scan to verify' caption: {text[-400:]}"


def teardown_module(module):
    try:
        admin = _login("admin@care.local", "Admin@123")
        for r in requests.get(f"{API}/residents", headers=_h(admin), timeout=15).json():
            if r["name"].startswith("TEST_IT7_"):
                requests.delete(f"{API}/residents/{r['id']}", headers=_h(admin), timeout=15)
    except Exception:
        pass
