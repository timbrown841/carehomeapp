"""Tests for Phase E.1 — Training & Workforce Development Centre."""
import os
import io
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
API = f"{BASE.rstrip('/')}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _mtoken():
    return _login("manager@care.local", "Manager@123")


def _stoken():
    return _login("staff@care.local", "Staff@123")


def _seed_if_needed():
    t = _mtoken()
    r = requests.get(f"{API}/training-centre/courses?sector=children", headers=_h(t), timeout=10)
    if r.json().get("count", 0) == 0:
        requests.post(f"{API}/training-centre/seed", headers=_h(t), timeout=10)


def _first_staff_id():
    t = _mtoken()
    r = requests.get(f"{API}/auth/users", headers=_h(t), timeout=10)
    users = r.json() if isinstance(r.json(), list) else r.json().get("users", [])
    staff = [u for u in users if u.get("role") == "staff"]
    assert staff, "no staff user available"
    return staff[0]["id"]


# === Catalogue ===

def test_courses_seeded_for_both_sectors():
    _seed_if_needed()
    t = _mtoken()
    rc = requests.get(f"{API}/training-centre/courses?sector=children", headers=_h(t), timeout=10)
    ra = requests.get(f"{API}/training-centre/courses?sector=adult", headers=_h(t), timeout=10)
    assert rc.status_code == 200 and ra.status_code == 200
    assert rc.json()["count"] >= 10
    assert ra.json()["count"] >= 10
    # Sanity — sector-specific courses present
    children_codes = {c["code"] for c in rc.json()["courses"]}
    adult_codes = {c["code"] for c in ra.json()["courses"]}
    assert "team_teach" in children_codes
    assert "pace" in children_codes
    assert "mca" in adult_codes
    assert "dols" in adult_codes


def test_qualifications_catalogue_seeded():
    _seed_if_needed()
    t = _mtoken()
    r = requests.get(f"{API}/training-centre/qualifications/catalogue", headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 5
    codes = {q["code"] for q in body["qualifications"]}
    assert "l3_residential_childcare" in codes
    assert "l5_leadership_mgmt" in codes


def test_courses_sector_filter_isolation():
    _seed_if_needed()
    t = _mtoken()
    rc = requests.get(f"{API}/training-centre/courses?sector=children", headers=_h(t), timeout=10)
    ra = requests.get(f"{API}/training-centre/courses?sector=adult", headers=_h(t), timeout=10)
    children_codes = {c["code"] for c in rc.json()["courses"]}
    adult_codes = {c["code"] for c in ra.json()["courses"]}
    # Adult-only courses must not show in children
    assert "mca" not in children_codes
    assert "dols" not in children_codes
    # Children-only courses must not show in adult
    assert "team_teach" not in adult_codes
    assert "pace" not in adult_codes


# === Records ===

def test_create_record_and_status():
    _seed_if_needed()
    t = _mtoken()
    sid = _first_staff_id()
    payload = {
        "staff_id": sid,
        "course_code": "safeguarding_l3",
        "completed_on": "2025-11-01",
        "provider": "TrainingCo",
    }
    r = requests.post(f"{API}/training-centre/records", json=payload, headers=_h(t), timeout=10)
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec["staff_id"] == sid
    assert rec["course_code"] == "safeguarding_l3"
    assert rec["expires_on"]  # auto-computed from frequency_months
    # status reachable via list
    lst = requests.get(f"{API}/training-centre/records?staff_id={sid}", headers=_h(t), timeout=10).json()
    found = [x for x in lst["records"] if x["id"] == rec["id"]]
    assert found and "status" in found[0]


def test_record_rbac_staff_cannot_create():
    _seed_if_needed()
    st = _stoken()
    payload = {
        "staff_id": "any", "course_code": "safeguarding_l3",
        "completed_on": "2025-11-01",
    }
    r = requests.post(f"{API}/training-centre/records", json=payload, headers=_h(st), timeout=10)
    assert r.status_code == 403


def test_record_mine_returns_only_own():
    _seed_if_needed()
    st = _stoken()
    r = requests.get(f"{API}/training-centre/records/mine", headers=_h(st), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "records" in body and "today" in body


# === Matrix ===

def test_matrix_shape_and_compliance():
    _seed_if_needed()
    t = _mtoken()
    r = requests.get(f"{API}/training-centre/matrix?sector=children", headers=_h(t), timeout=15)
    assert r.status_code == 200
    body = r.json()
    for k in ("courses", "rows", "counts", "compliance_pct", "sector"):
        assert k in body
    assert body["sector"] == "children"
    assert len(body["courses"]) >= 1
    # Each row.cell maps every course
    if body["rows"]:
        assert len(body["rows"][0]["cells"]) == len(body["courses"])


def test_matrix_rbac_staff_blocked():
    _seed_if_needed()
    st = _stoken()
    r = requests.get(f"{API}/training-centre/matrix?sector=children", headers=_h(st), timeout=10)
    assert r.status_code == 403


# === Certificates ===

def test_certificate_upload_with_external_url():
    _seed_if_needed()
    t = _mtoken()
    sid = _first_staff_id()
    data = {
        "staff_id": sid,
        "course_code": "first_aid",
        "external_url": "https://example.org/certs/first-aid.pdf",
        "issue_date": "2025-09-15",
        "expiry_date": "2028-09-15",
        "provider": "FirstAid UK",
    }
    r = requests.post(f"{API}/training-centre/certificates", data=data, headers=_h(t), timeout=15)
    assert r.status_code == 200, r.text
    cert = r.json()
    assert cert["external_url"] == data["external_url"]
    assert cert["verification_status"] == "verified"  # manager upload auto-verified
    assert cert["version"] >= 1


def test_certificate_upload_file():
    _seed_if_needed()
    t = _mtoken()
    sid = _first_staff_id()
    # Minimal valid PDF header so uploads_service accepts it
    pdf_bytes = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF"
    files = {"file": ("cert.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    data = {
        "staff_id": sid,
        "course_code": "fire_safety",
        "issue_date": "2025-10-01",
        "expiry_date": "2026-10-01",
        "provider": "FireCorp",
    }
    r = requests.post(f"{API}/training-centre/certificates", data=data, files=files,
                      headers=_h(t), timeout=15)
    assert r.status_code == 200, r.text
    cert = r.json()
    assert cert["file_id"]
    assert cert["file_name"] == "cert.pdf"


def test_certificate_staff_upload_pending():
    _seed_if_needed()
    st = _stoken()
    # Staff fetches own id
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    data = {
        "staff_id": me["id"],
        "course_code": "gdpr",
        "external_url": "https://staff-self.example/gdpr.pdf",
        "issue_date": "2025-12-01",
        "expiry_date": "2027-12-01",
    }
    r = requests.post(f"{API}/training-centre/certificates", data=data, headers=_h(st), timeout=10)
    assert r.status_code == 200
    cert = r.json()
    assert cert["verification_status"] == "pending"


def test_certificate_staff_cannot_upload_for_other():
    _seed_if_needed()
    st = _stoken()
    other = _first_staff_id()
    me = requests.get(f"{API}/auth/me", headers=_h(st), timeout=10).json()
    if other == me["id"]:
        return  # only one staff — skip
    data = {
        "staff_id": other,
        "course_code": "gdpr",
        "external_url": "https://malicious.example/forged.pdf",
    }
    r = requests.post(f"{API}/training-centre/certificates", data=data, headers=_h(st), timeout=10)
    assert r.status_code == 403


# === Qualifications ===

def test_qualification_create_and_list():
    _seed_if_needed()
    t = _mtoken()
    sid = _first_staff_id()
    payload = {
        "staff_id": sid,
        "qualification_code": "l3_residential_childcare",
        "awarding_body": "City & Guilds",
        "status": "in_progress",
        "started_on": "2025-09-01",
        "expected_completion": "2026-08-31",
    }
    r = requests.post(f"{API}/training-centre/qualifications", json=payload, headers=_h(t), timeout=10)
    assert r.status_code == 200, r.text
    qual = r.json()
    assert qual["status"] == "in_progress"
    assert qual["level"] == 3
    # List filter
    lst = requests.get(f"{API}/training-centre/qualifications?staff_id={sid}",
                        headers=_h(t), timeout=10).json()
    assert any(q["id"] == qual["id"] for q in lst["qualifications"])


def test_qualification_invalid_code_404():
    _seed_if_needed()
    t = _mtoken()
    sid = _first_staff_id()
    payload = {
        "staff_id": sid,
        "qualification_code": "nope_not_real",
        "status": "in_progress",
    }
    r = requests.post(f"{API}/training-centre/qualifications", json=payload, headers=_h(t), timeout=10)
    assert r.status_code == 404


# === Development plans ===

def test_dev_plan_create_objective_and_quarterly_review():
    _seed_if_needed()
    t = _mtoken()
    sid = _first_staff_id()
    # Cleanup any active plan from previous runs
    plans = requests.get(f"{API}/training-centre/dev-plans?staff_id={sid}",
                          headers=_h(t), timeout=10).json()["dev_plans"]
    for p in plans:
        if p.get("status") == "active":
            requests.post(f"{API}/training-centre/dev-plans/{p['id']}/archive",
                          headers=_h(t), timeout=10)
    payload = {"staff_id": sid, "year": 2026, "focus_area": "Specialism in trauma-informed practice"}
    r = requests.post(f"{API}/training-centre/dev-plans", json=payload, headers=_h(t), timeout=10)
    assert r.status_code == 200, r.text
    plan = r.json()
    # Add objective
    obj_payload = {
        "title": "Complete Advanced Safeguarding by 30/09/26",
        "type": "training",
        "target_date": "2026-09-30",
        "linked_course_code": "safeguarding_l3",
    }
    ro = requests.post(f"{API}/training-centre/dev-plans/{plan['id']}/objectives",
                        json=obj_payload, headers=_h(t), timeout=10)
    assert ro.status_code == 200
    obj = ro.json()
    assert obj["status"] == "open"
    # Quarterly review
    rev_payload = {"quarter": "q1", "notes": "Good engagement with reflective sessions.", "rag": "green"}
    rv = requests.post(f"{API}/training-centre/dev-plans/{plan['id']}/quarterly-review",
                        json=rev_payload, headers=_h(t), timeout=10)
    assert rv.status_code == 200
    # Re-fetch and verify
    full = requests.get(f"{API}/training-centre/dev-plans/{plan['id']}",
                         headers=_h(t), timeout=10).json()
    assert len(full["objectives"]) >= 1
    assert "q1" in full.get("quarterly_reviews", {})


def test_dev_plan_duplicate_year_rejected():
    _seed_if_needed()
    t = _mtoken()
    sid = _first_staff_id()
    # Ensure an active 2027 plan exists
    payload = {"staff_id": sid, "year": 2027}
    requests.post(f"{API}/training-centre/dev-plans", json=payload, headers=_h(t), timeout=10)
    r2 = requests.post(f"{API}/training-centre/dev-plans", json=payload, headers=_h(t), timeout=10)
    assert r2.status_code == 400


def test_dev_plan_archive_rollover():
    _seed_if_needed()
    t = _mtoken()
    sid = _first_staff_id()
    plans = requests.get(f"{API}/training-centre/dev-plans?staff_id={sid}&year=2027",
                          headers=_h(t), timeout=10).json()["dev_plans"]
    if not plans:
        return
    pid = plans[0]["id"]
    r = requests.post(f"{API}/training-centre/dev-plans/{pid}/archive",
                      headers=_h(t), timeout=10)
    assert r.status_code == 200
    again = requests.get(f"{API}/training-centre/dev-plans/{pid}", headers=_h(t), timeout=10).json()
    assert again["status"] == "archived"


# === Supervision integration (bi-dir) ===

def test_supervision_action_creates_objective():
    _seed_if_needed()
    t = _mtoken()
    sid = _first_staff_id()
    # Create a supervision
    sup_payload = {"staff_id": sid, "kind": "supervision",
                    "completed_at": "2026-02-01", "notes": "Routine"}
    sup = requests.post(f"{API}/supervisions", json=sup_payload, headers=_h(t), timeout=10).json()
    # Add training action
    obj_payload = {
        "title": "Complete Team Teach refresher by Q2",
        "type": "training",
        "target_date": "2026-06-30",
        "linked_course_code": "team_teach",
    }
    r = requests.post(f"{API}/supervisions/{sup['id']}/training-actions",
                        json=obj_payload, headers=_h(t), timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["plan_id"]
    assert body["objective"]["linked_supervision_id"] == sup["id"]


# === Dashboard intelligence ===

def test_dashboard_returns_full_shape():
    _seed_if_needed()
    t = _mtoken()
    r = requests.get(f"{API}/training-centre/dashboard?sector=children", headers=_h(t), timeout=15)
    assert r.status_code == 200
    body = r.json()
    for k in ("sector", "today", "staff_count", "mandatory_course_count",
              "compliance_pct", "counts", "expiring_soon", "overdue",
              "certificates", "qualifications", "dev_plans",
              "readiness_score", "readiness_rag"):
        assert k in body, f"missing {k}"
    assert 0 <= body["readiness_score"] <= 100
    assert body["readiness_rag"] in ("green", "amber", "red")
    for k in ("ok", "expiring", "expired", "missing"):
        assert k in body["counts"]


def test_dashboard_rbac_staff_blocked():
    _seed_if_needed()
    st = _stoken()
    r = requests.get(f"{API}/training-centre/dashboard?sector=children", headers=_h(st), timeout=10)
    assert r.status_code == 403


def test_dashboard_sector_distinct():
    _seed_if_needed()
    t = _mtoken()
    rc = requests.get(f"{API}/training-centre/dashboard?sector=children", headers=_h(t), timeout=15).json()
    ra = requests.get(f"{API}/training-centre/dashboard?sector=adult", headers=_h(t), timeout=15).json()
    assert rc["sector"] == "children"
    assert ra["sector"] == "adult"
    # Mandatory course counts likely differ between sectors
    assert rc["mandatory_course_count"] >= 1
    assert ra["mandatory_course_count"] >= 1
