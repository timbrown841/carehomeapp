"""Iteration 23 — Children's safeguarding polish: photo upload, return interview,
documents tab full build-out, inspection-ready snapshot.

Covers:
- /api/uploads (multipart) — accept/reject MIME and size, persists file
- /api/files/{id} — Bearer header AND ?token= query param both work; 401/404
- DELETE /api/files/{id} — Senior+ only (staff 403)
- POST/DELETE /api/residents/{rid}/photo — Senior+ only; replaces; clears
- GET /api/missing/{eid}/pdf embeds photo when present
- /api/return-interviews — create/list/get/patch/sign-off/pdf, RBAC, episode close + timeline
- /api/inspection/snapshot + /pdf — Manager/Admin only, scope auto/ofsted/cqc, 12 counts
- /api/residents/{rid}/documents — new categories + file_id + review_date round trip
- DELETE /api/residents/documents/{id} — senior+ cleans up file
"""
import io
import os
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env", "r") as fh:
            for line in fh:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set in env or /app/frontend/.env"
API = f"{BASE_URL}/api"

# Minimal valid PDF / PNG / JPG byte payloads
MIN_PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def _make_png(size=(8, 8)):
    """Generate a real PNG via PIL so reportlab/PIL can parse it for embedding."""
    from PIL import Image
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=(120, 160, 200))
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_jpg(size=(8, 8)):
    from PIL import Image
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=(200, 100, 50))
    img.save(buf, format="JPEG")
    return buf.getvalue()


MIN_PNG = _make_png()
MIN_JPG = _make_jpg()


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def manager_token():
    return _login("manager@care.local", "Manager@123")


@pytest.fixture(scope="module")
def senior_token():
    return _login("senior@care.local", "Senior@123")


@pytest.fixture(scope="module")
def staff_token():
    return _login("staff@care.local", "Staff@123")


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@care.local", "Admin@123")


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def child_resident(manager_token):
    """Find a children's resident — fall back to any non-adult."""
    adult_types = {"adult_supported_living", "elderly_residential", "dementia",
                   "mental_health", "veteran"}
    r = requests.get(f"{API}/residents", headers=_h(manager_token), timeout=20)
    assert r.status_code == 200
    residents = r.json()
    assert residents, "no residents seeded at all"
    # Prefer an explicit children's resident
    children = [x for x in residents
                if (x.get("service_type") or "children") not in adult_types]
    assert children, f"no children residents found among {len(residents)}"
    # Prefer the seeded one mentioned in review_request if present
    preferred = "a1fb73b6-aced-4cf3-a053-0b861183f897"
    for x in children:
        if x.get("id") == preferred:
            return x
    return children[0]


# ---------------- /api/uploads + /api/files ----------------

class TestUploads:
    def test_upload_pdf(self, manager_token):
        files = {"file": ("test.pdf", io.BytesIO(MIN_PDF), "application/pdf")}
        r = requests.post(f"{API}/uploads", headers=_h(manager_token),
                          data={"kind": "document"}, files=files, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["mime"] == "application/pdf"
        assert data["size"] == len(MIN_PDF)
        assert data["url"].startswith("/api/files/")
        TestUploads.file_id = data["id"]
        TestUploads.file_url = data["url"]

    def test_upload_unsupported_mime(self, manager_token):
        files = {"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{API}/uploads", headers=_h(manager_token),
                          data={"kind": "document"}, files=files, timeout=20)
        assert r.status_code == 415, r.status_code

    def test_upload_too_large(self, manager_token):
        big = b"%PDF-1.4\n" + (b"A" * (10 * 1024 * 1024 + 1024))
        files = {"file": ("big.pdf", io.BytesIO(big), "application/pdf")}
        r = requests.post(f"{API}/uploads", headers=_h(manager_token),
                          data={"kind": "document"}, files=files, timeout=60)
        assert r.status_code == 413, r.status_code

    def test_get_file_with_bearer(self, manager_token):
        r = requests.get(f"{API}/files/{TestUploads.file_id}", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_get_file_with_token_query(self, manager_token):
        r = requests.get(f"{API}/files/{TestUploads.file_id}?token={manager_token}", timeout=20)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_get_file_no_auth(self):
        r = requests.get(f"{API}/files/{TestUploads.file_id}", timeout=20)
        assert r.status_code == 401

    def test_get_file_unknown(self, manager_token):
        r = requests.get(f"{API}/files/does-not-exist", headers=_h(manager_token), timeout=20)
        assert r.status_code == 404

    def test_delete_file_staff_forbidden(self, staff_token):
        # Upload separately as staff would not be allowed if it requires tier — actually /uploads only requires auth
        # Use the uploaded id and ensure delete is gated
        r = requests.delete(f"{API}/files/{TestUploads.file_id}", headers=_h(staff_token), timeout=20)
        assert r.status_code in (401, 403), r.status_code

    def test_delete_file_senior_ok(self, senior_token):
        r = requests.delete(f"{API}/files/{TestUploads.file_id}", headers=_h(senior_token), timeout=20)
        assert r.status_code == 200


# ---------------- Resident photo ----------------

class TestResidentPhoto:
    def test_staff_cannot_upload_photo(self, staff_token, child_resident):
        files = {"file": ("p.png", io.BytesIO(MIN_PNG), "image/png")}
        r = requests.post(f"{API}/residents/{child_resident['id']}/photo",
                          headers=_h(staff_token), files=files, timeout=20)
        assert r.status_code in (401, 403)

    def test_senior_upload_photo(self, senior_token, manager_token, child_resident):
        files = {"file": ("p.png", io.BytesIO(MIN_PNG), "image/png")}
        r = requests.post(f"{API}/residents/{child_resident['id']}/photo",
                          headers=_h(senior_token), files=files, timeout=20)
        assert r.status_code == 200, r.text
        meta = r.json()
        assert meta["mime"] == "image/png"
        TestResidentPhoto.first_id = meta["id"]
        # Re-fetch resident to verify photo_file_id + photo_url were set
        rr = requests.get(f"{API}/residents/{child_resident['id']}", headers=_h(manager_token), timeout=20)
        assert rr.status_code == 200
        res = rr.json()
        assert res.get("photo_file_id") == meta["id"]
        assert res.get("photo_url") == f"/api/files/{meta['id']}"
        # Image accessible via ?token= query
        ir = requests.get(f"{API}/files/{meta['id']}?token={manager_token}", timeout=20)
        assert ir.status_code == 200
        assert ir.headers.get("content-type", "").startswith("image/")

    def test_replace_photo_deletes_old(self, senior_token, manager_token, child_resident):
        files = {"file": ("p2.jpg", io.BytesIO(MIN_JPG), "image/jpeg")}
        r = requests.post(f"{API}/residents/{child_resident['id']}/photo",
                          headers=_h(senior_token), files=files, timeout=20)
        assert r.status_code == 200, r.text
        new_id = r.json()["id"]
        assert new_id != TestResidentPhoto.first_id
        # old one should now 404
        old = requests.get(f"{API}/files/{TestResidentPhoto.first_id}",
                           headers=_h(manager_token), timeout=20)
        assert old.status_code == 404

    def test_delete_photo(self, senior_token, manager_token, child_resident):
        r = requests.delete(f"{API}/residents/{child_resident['id']}/photo",
                            headers=_h(senior_token), timeout=20)
        assert r.status_code == 200
        rr = requests.get(f"{API}/residents/{child_resident['id']}", headers=_h(manager_token), timeout=20)
        body = rr.json()
        assert body.get("photo_file_id") in (None, "")


# ---------------- Resident documents (new categories + file_id) ----------------

class TestResidentDocuments:
    def test_add_document_with_file(self, manager_token, child_resident):
        # First upload a PDF
        files = {"file": ("plan.pdf", io.BytesIO(MIN_PDF), "application/pdf")}
        up = requests.post(f"{API}/uploads", headers=_h(manager_token),
                           data={"kind": "document"}, files=files, timeout=20)
        assert up.status_code == 200, up.text
        file_id = up.json()["id"]
        # Now create resident document referencing file
        payload = {
            "title": "TEST_RiskAssessment_v1",
            "category": "risk_assessment",
            "review_date": "2020-01-01",  # overdue on purpose
            "file_id": file_id,
        }
        r = requests.post(f"{API}/residents/{child_resident['id']}/documents",
                          headers=_h(manager_token), json=payload, timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["category"] == "risk_assessment"
        assert doc["file_id"] == file_id
        assert doc["file_name"] == "plan.pdf"
        assert doc["file_size"] == len(MIN_PDF)
        assert doc["mime_type"] == "application/pdf"
        TestResidentDocuments.doc_id = doc["id"]
        TestResidentDocuments.file_id = file_id

    def test_new_categories_accepted(self, manager_token, child_resident):
        for cat in ["support_plan", "education_document", "medical_document",
                    "referral_document", "safeguarding_document"]:
            r = requests.post(f"{API}/residents/{child_resident['id']}/documents",
                              headers=_h(manager_token),
                              json={"title": f"TEST_{cat}", "category": cat}, timeout=20)
            assert r.status_code == 200, f"{cat}: {r.text}"
            assert r.json()["category"] == cat

    def test_legacy_categories_still_work(self, manager_token, child_resident):
        for cat in ["care_plan", "placement_plan", "ehcp"]:
            r = requests.post(f"{API}/residents/{child_resident['id']}/documents",
                              headers=_h(manager_token),
                              json={"title": f"TEST_legacy_{cat}", "category": cat}, timeout=20)
            assert r.status_code == 200
            assert r.json()["category"] == cat

    def test_staff_cannot_delete_document(self, staff_token):
        r = requests.delete(f"{API}/residents/documents/{TestResidentDocuments.doc_id}",
                            headers=_h(staff_token), timeout=20)
        assert r.status_code in (401, 403)

    def test_senior_can_delete_and_cleans_file(self, senior_token, manager_token):
        r = requests.delete(f"{API}/residents/documents/{TestResidentDocuments.doc_id}",
                            headers=_h(senior_token), timeout=20)
        assert r.status_code == 200
        # Underlying file should be 404 now
        fr = requests.get(f"{API}/files/{TestResidentDocuments.file_id}",
                          headers=_h(manager_token), timeout=20)
        assert fr.status_code == 404


# ---------------- Return interview workflow ----------------

class TestReturnInterview:
    @classmethod
    @pytest.fixture(scope="class", autouse=True)
    def _setup(cls, manager_token, child_resident):
        # Create a fresh missing episode to close via RI
        payload = {
            "reported_at": "2026-01-10T08:00:00Z",
            "last_seen_at": "2026-01-10T07:00:00Z",
            "last_seen_location": "TEST_residence",
            "circumstances": "TEST RI flow",
        }
        r = requests.post(f"{API}/residents/{child_resident['id']}/missing",
                          headers=_h(manager_token), json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        cls.episode_id = r.json()["id"]
        cls.resident_id = child_resident["id"]
        # also seed a photo so missing PDF embeds it
        files = {"file": ("p.png", io.BytesIO(MIN_PNG), "image/png")}
        pr = requests.post(f"{API}/residents/{cls.resident_id}/photo",
                           headers=_h(manager_token), files=files, timeout=20)
        assert pr.status_code == 200

    def test_staff_cannot_create(self, staff_token):
        r = requests.post(f"{API}/return-interviews", headers=_h(staff_token),
                          json={"missing_episode_id": self.episode_id}, timeout=20)
        assert r.status_code in (401, 403)

    def test_senior_creates_and_closes_episode(self, senior_token, manager_token):
        payload = {
            "missing_episode_id": self.episode_id,
            "returned_at": "2026-01-10T20:00:00Z",
            "account_of_events": "TEST RI account",
            "locations_visited": ["park", "friend's house"],
            "who_they_were_with": ["older peer"],
            "safeguarding_concerns": "low",
            "exploitation_indicators": ["unknown adults"],
            "actions_taken": "spoke to police",
            "follow_up_required": "review within 7d",
        }
        r = requests.post(f"{API}/return-interviews", headers=_h(senior_token),
                          json=payload, timeout=20)
        assert r.status_code == 200, r.text
        ri = r.json()
        assert ri["resident_id"] == self.resident_id
        assert ri["status"] == "submitted"
        assert ri["account_of_events"] == "TEST RI account"
        TestReturnInterview.ri_id = ri["id"]
        # Episode should be closed + timeline contains return_interview_completed
        ep = requests.get(f"{API}/missing/{self.episode_id}", headers=_h(manager_token), timeout=20)
        assert ep.status_code == 200
        epd = ep.json()
        assert epd["status"] == "closed"
        assert epd.get("return_interview") == ri["id"]
        events = [t.get("event") for t in (epd.get("timeline") or [])]
        assert "return_interview_completed" in events

    def test_get_and_list(self, manager_token):
        r = requests.get(f"{API}/return-interviews/{self.ri_id}", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200
        rr = requests.get(f"{API}/residents/{self.resident_id}/return-interviews",
                          headers=_h(manager_token), timeout=20)
        assert rr.status_code == 200
        ids = [x["id"] for x in rr.json()]
        assert self.ri_id in ids

    def test_senior_can_patch_before_signoff(self, senior_token):
        r = requests.patch(f"{API}/return-interviews/{self.ri_id}", headers=_h(senior_token),
                           json={"actions_taken": "TEST updated by senior"}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["actions_taken"] == "TEST updated by senior"

    def test_staff_signoff_forbidden(self, staff_token):
        r = requests.post(f"{API}/return-interviews/{self.ri_id}/sign-off",
                          headers=_h(staff_token), json={}, timeout=20)
        assert r.status_code in (401, 403)

    def test_senior_signoff_forbidden(self, senior_token):
        r = requests.post(f"{API}/return-interviews/{self.ri_id}/sign-off",
                          headers=_h(senior_token), json={}, timeout=20)
        assert r.status_code in (401, 403)

    def test_manager_signoff(self, manager_token):
        r = requests.post(f"{API}/return-interviews/{self.ri_id}/sign-off",
                          headers=_h(manager_token),
                          json={"manager_comments": "TEST mgr comments"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "signed_off"
        assert d["signed_off_by_name"]
        assert d["signed_off_at"]
        assert d["manager_comments"] == "TEST mgr comments"

    def test_senior_cannot_edit_after_signoff(self, senior_token):
        r = requests.patch(f"{API}/return-interviews/{self.ri_id}", headers=_h(senior_token),
                           json={"actions_taken": "should be blocked"}, timeout=20)
        assert r.status_code == 403

    def test_manager_can_edit_after_signoff(self, manager_token):
        r = requests.patch(f"{API}/return-interviews/{self.ri_id}", headers=_h(manager_token),
                           json={"manager_comments": "TEST mgr comments v2"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["manager_comments"] == "TEST mgr comments v2"

    def test_pdf_export(self, manager_token):
        r = requests.get(f"{API}/return-interviews/{self.ri_id}/pdf",
                         headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:5] == b"%PDF-"
        assert len(r.content) > 1000

    def test_missing_pdf_embeds_photo(self, manager_token):
        # The episode created above has resident with photo set
        r = requests.get(f"{API}/missing/{self.episode_id}/pdf",
                         headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"
        # PDF with embedded image should be reasonably large
        assert len(r.content) > 2000


# ---------------- Inspection-Ready Snapshot ----------------

class TestInspectionSnapshot:
    def test_staff_forbidden(self, staff_token):
        r = requests.get(f"{API}/inspection/snapshot", headers=_h(staff_token), timeout=30)
        assert r.status_code in (401, 403)

    def test_senior_forbidden(self, senior_token):
        r = requests.get(f"{API}/inspection/snapshot", headers=_h(senior_token), timeout=30)
        assert r.status_code in (401, 403)

    def test_manager_snapshot_auto(self, manager_token):
        r = requests.get(f"{API}/inspection/snapshot?scope=auto",
                         headers=_h(manager_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Auto-detect — seeded children + adult so 'both'
        assert d["scope"] in ("both", "ofsted", "cqc")
        assert d["scope"] == "both", f"expected 'both' (children+adult seeded), got {d['scope']}"
        assert isinstance(d["service_mix"], list)
        counts = d.get("counts") or {}
        required_count_keys = {
            "open_safeguarding", "recent_incidents_7d", "open_missing",
            "mar_completeness_pct", "missed_doses_24h", "statutory_visits_overdue",
            "statutory_visits_next14d", "handovers_24h", "residents_with_no_note_24h",
            "outstanding_actions", "risk_reviews_overdue", "document_reviews_overdue",
        }
        missing = required_count_keys - set(counts.keys())
        assert not missing, f"missing count keys: {missing}"
        assert isinstance(d.get("recent_incidents"), list)
        assert isinstance(d.get("open_missing_episodes"), list)
        assert isinstance(d.get("outstanding_actions_list"), list)
        # Both scope means both ofsted_self_rating and cqc_five_kqs populated
        assert d.get("ofsted_self_rating")
        cqc = d.get("cqc_five_kqs") or []
        kq_ids = {q.get("id") for q in cqc}
        for k in ["safe", "effective", "caring", "responsive", "well_led"]:
            assert k in kq_ids

    def test_explicit_ofsted_scope(self, manager_token):
        r = requests.get(f"{API}/inspection/snapshot?scope=ofsted",
                         headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["scope"] == "ofsted"
        assert d.get("ofsted_self_rating")
        assert not d.get("cqc_five_kqs")

    def test_explicit_cqc_scope(self, manager_token):
        r = requests.get(f"{API}/inspection/snapshot?scope=cqc",
                         headers=_h(manager_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["scope"] == "cqc"
        assert d.get("cqc_five_kqs")

    def test_pdf_auto(self, manager_token):
        r = requests.get(f"{API}/inspection/snapshot/pdf?scope=auto",
                         headers=_h(manager_token), timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:5] == b"%PDF-"
        assert len(r.content) > 5 * 1024, f"PDF too small: {len(r.content)} bytes"

    def test_pdf_ofsted(self, manager_token):
        r = requests.get(f"{API}/inspection/snapshot/pdf?scope=ofsted",
                         headers=_h(manager_token), timeout=60)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"

    def test_pdf_cqc(self, manager_token):
        r = requests.get(f"{API}/inspection/snapshot/pdf?scope=cqc",
                         headers=_h(manager_token), timeout=60)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"

    def test_pdf_staff_forbidden(self, staff_token):
        r = requests.get(f"{API}/inspection/snapshot/pdf?scope=auto",
                         headers=_h(staff_token), timeout=30)
        assert r.status_code in (401, 403)


# ---------------- Regression: existing endpoints still healthy ----------------

class TestRegression:
    def test_pocket_money(self, manager_token):
        r = requests.get(f"{API}/pocket-money", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200

    def test_handovers(self, manager_token):
        r = requests.get(f"{API}/handovers", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200

    def test_dashboard_stats(self, manager_token):
        r = requests.get(f"{API}/dashboard/stats", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200

    def test_cqc_readiness_still_works(self, manager_token):
        r = requests.get(f"{API}/cqc/readiness", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200

    def test_service_types_active(self, manager_token):
        r = requests.get(f"{API}/service-types/active", headers=_h(manager_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "children" in (d.get("all_active_sectors") or [])
        assert "adult" in (d.get("all_active_sectors") or [])
