"""Phase F — Safer Recruitment & HR Operational Personnel Files.

Validates the folder registry, RAG compute, RBAC, file CRUD, missing-items
endpoint, audit trail, and dashboard aggregate.
"""
import io
import os
import uuid
import pytest
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def staff(): return _login("staff@care.local", "Staff@123")
@pytest.fixture(scope="module")
def senior(): return _login("senior@care.local", "Senior@123")
@pytest.fixture(scope="module")
def manager(): return _login("manager@care.local", "Manager@123")
@pytest.fixture(scope="module")
def admin(): return _login("admin@care.local", "Admin@123")


@pytest.fixture(scope="module")
def manager_user_id(manager):
    """Find the manager's user_id for testing per-staff endpoints against."""
    rows = requests.get(f"{API}/hr/staff", headers=manager).json()["rows"]
    return [r for r in rows if r["role"] == "manager"][0]["staff_id"]


@pytest.fixture(scope="module")
def senior_user_id(manager):
    rows = requests.get(f"{API}/hr/staff", headers=manager).json()["rows"]
    return [r for r in rows if r["role"] == "senior"][0]["staff_id"]


# -----------------------------------------------------------------
# RBAC — manager+ only
# -----------------------------------------------------------------
def test_hr_dashboard_manager_plus_only(staff, senior, manager, admin):
    assert requests.get(f"{API}/hr/staff", headers=staff).status_code == 403
    assert requests.get(f"{API}/hr/staff", headers=senior).status_code == 403
    assert requests.get(f"{API}/hr/staff", headers=manager).status_code == 200
    assert requests.get(f"{API}/hr/staff", headers=admin).status_code == 200


def test_hr_folders_manager_plus_only(staff, manager):
    assert requests.get(f"{API}/hr/folders", headers=staff).status_code == 403
    assert requests.get(f"{API}/hr/folders", headers=manager).status_code == 200


def test_hr_staff_view_manager_plus_only(staff, manager, manager_user_id):
    assert requests.get(f"{API}/hr/staff/{manager_user_id}", headers=staff).status_code == 403
    assert requests.get(f"{API}/hr/staff/{manager_user_id}", headers=manager).status_code == 200


# -----------------------------------------------------------------
# Folder registry shape
# -----------------------------------------------------------------
def test_folders_registry_shape(manager):
    d = requests.get(f"{API}/hr/folders?sector=children&is_agency=false", headers=manager).json()
    assert "tabs_order" in d and isinstance(d["tabs_order"], list)
    assert "folders" in d and isinstance(d["folders"], list)
    assert len(d["folders"]) >= 30, f"expected 30+ folders, got {len(d['folders'])}"
    # Each folder has minimum keys
    for f in d["folders"]:
        for k in ("id", "tab", "label"):
            assert k in f


def test_folders_agency_visibility(manager):
    """Agency Compliance folder hidden when is_agency=false, visible when true."""
    no_agency = requests.get(f"{API}/hr/folders?is_agency=false", headers=manager).json()
    with_agency = requests.get(f"{API}/hr/folders?is_agency=true", headers=manager).json()
    no_ids = {f["id"] for f in no_agency["folders"]}
    yes_ids = {f["id"] for f in with_agency["folders"]}
    assert "agency_compliance" not in no_ids
    assert "agency_compliance" in yes_ids


# -----------------------------------------------------------------
# Dashboard shape
# -----------------------------------------------------------------
def test_dashboard_shape(manager):
    d = requests.get(f"{API}/hr/staff", headers=manager).json()
    for k in ("total_staff", "summary", "rows", "total_expired", "total_expiring_60d"):
        assert k in d
    for k in ("red", "amber", "green"):
        assert k in d["summary"]
    assert d["total_staff"] == len(d["rows"])


def test_dashboard_rows_have_rag(manager):
    d = requests.get(f"{API}/hr/staff", headers=manager).json()
    for r in d["rows"]:
        assert r["overall_status"] in ("red", "amber", "green")
        assert "missing_count" in r
        assert "role_label" in r


def test_dashboard_sorted_red_first(manager):
    d = requests.get(f"{API}/hr/staff", headers=manager).json()
    statuses = [r["overall_status"] for r in d["rows"]]
    rank = {"red": 0, "amber": 1, "green": 2}
    assert statuses == sorted(statuses, key=lambda s: rank.get(s, 9)), \
        "expected red→amber→green ordering"


# -----------------------------------------------------------------
# Per-staff view
# -----------------------------------------------------------------
def test_staff_view_shape(manager, manager_user_id):
    d = requests.get(f"{API}/hr/staff/{manager_user_id}", headers=manager).json()
    for k in ("staff", "profile", "sector", "overall_status", "overall_counts", "tabs", "missing_required"):
        assert k in d
    assert d["staff"]["id"] == manager_user_id
    assert d["overall_status"] in ("red", "amber", "green")
    # 5 non-Audit tabs in the view (Audit is loaded separately)
    tab_ids = [t["id"] for t in d["tabs"]]
    assert "Recruitment" in tab_ids
    assert "Compliance" in tab_ids
    assert "HR" in tab_ids


def test_staff_view_folder_status_keys(manager, manager_user_id):
    d = requests.get(f"{API}/hr/staff/{manager_user_id}", headers=manager).json()
    for tab in d["tabs"]:
        for f in tab["folders"]:
            for k in ("id", "label", "required", "status"):
                assert k in f
            assert f["status"]["status"] in ("red", "amber", "green", "grey")
            assert "doc_count" in f["status"]
            assert "reason" in f["status"]


def test_staff_view_404_unknown(manager):
    r = requests.get(f"{API}/hr/staff/does-not-exist", headers=manager)
    assert r.status_code == 404


def test_senior_has_expected_red_folders(manager, senior_user_id):
    """Demo seed gives senior an expired Mandatory Training + DBS expiring soon.
    Verify the RAG fires correctly."""
    d = requests.get(f"{API}/hr/staff/{senior_user_id}", headers=manager).json()
    by_id = {f["id"]: f for tab in d["tabs"] for f in tab["folders"]}
    assert by_id["mandatory_training"]["status"]["status"] == "red"
    # DBS is expired in 30d for senior in seed → amber or red depending on warn
    assert by_id["dbs"]["status"]["status"] in ("red", "amber")


# -----------------------------------------------------------------
# Missing items endpoint
# -----------------------------------------------------------------
def test_missing_items_shape(manager, senior_user_id):
    d = requests.get(f"{API}/hr/staff/{senior_user_id}/missing-items", headers=manager).json()
    for k in ("items", "count_red", "count_amber"):
        assert k in d
    assert d["count_red"] >= 1  # senior demo has missing supervisions/etc
    # Items sorted reds first
    for i, item in enumerate(d["items"][:d["count_red"]]):
        assert item["status"] == "red"


# -----------------------------------------------------------------
# File CRUD + audit
# -----------------------------------------------------------------
def test_file_upload_patch_delete_and_audit(manager, manager_user_id):
    # Upload a tiny PDF
    pdf_bytes = b"%PDF-1.4\n%fake test pdf for hr tests\n%%EOF"
    files = {"file": ("test-dbs.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    data = {
        "folder_id": "compliance_notes",  # optional folder, no expiry rules
        "notes": "Test upload from pytest",
    }
    r = requests.post(
        f"{API}/hr/staff/{manager_user_id}/files",
        headers=manager, data=data, files=files,
    )
    assert r.status_code == 200, f"upload failed: {r.text}"
    rec = r.json()
    file_id = rec["id"]
    assert rec["folder_id"] == "compliance_notes"
    assert rec["original_filename"] == "test-dbs.pdf"
    assert rec["version"] == 1

    # Patch the file with expiry
    pr = requests.patch(
        f"{API}/hr/staff/{manager_user_id}/files/{file_id}",
        headers=manager,
        json={"notes": "patched note", "reference_no": "DBS-12345"},
    )
    assert pr.status_code == 200
    assert "notes" in pr.json()["updated"]

    # Audit should contain both upload + update for this staff
    ar = requests.get(f"{API}/hr/staff/{manager_user_id}/audit?limit=50", headers=manager)
    assert ar.status_code == 200
    actions = {it["action"] for it in ar.json()["items"]}
    assert "hr_file_upload" in actions
    assert "hr_file_update" in actions

    # Delete
    dr = requests.delete(
        f"{API}/hr/staff/{manager_user_id}/files/{file_id}", headers=manager,
    )
    assert dr.status_code == 200
    assert dr.json()["deleted"] == 1

    # Audit again — should include delete
    ar2 = requests.get(f"{API}/hr/staff/{manager_user_id}/audit?limit=50", headers=manager)
    actions2 = {it["action"] for it in ar2.json()["items"]}
    assert "hr_file_delete" in actions2


def test_file_upload_rejects_bad_folder_id(manager, manager_user_id):
    pdf_bytes = b"%PDF-1.4\n%test"
    files = {"file": ("x.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    r = requests.post(
        f"{API}/hr/staff/{manager_user_id}/files",
        headers=manager,
        data={"folder_id": "this_folder_does_not_exist"},
        files=files,
    )
    assert r.status_code == 400


def test_file_upload_rejects_non_manager(staff, manager_user_id):
    pdf_bytes = b"%PDF-1.4\n%test"
    files = {"file": ("x.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    r = requests.post(
        f"{API}/hr/staff/{manager_user_id}/files",
        headers=staff,
        data={"folder_id": "compliance_notes"},
        files=files,
    )
    assert r.status_code == 403


# -----------------------------------------------------------------
# Profile patch
# -----------------------------------------------------------------
def test_profile_patch(manager, senior_user_id):
    r = requests.patch(
        f"{API}/hr/staff/{senior_user_id}/profile",
        headers=manager,
        json={"role_label": "Senior Support Worker (Lead)", "is_agency": False},
    )
    assert r.status_code == 200
    # Verify it stuck
    d = requests.get(f"{API}/hr/staff/{senior_user_id}", headers=manager).json()
    assert d["profile"]["role_label"] == "Senior Support Worker (Lead)"


# -----------------------------------------------------------------
# Determinism
# -----------------------------------------------------------------
def test_dashboard_deterministic(manager):
    a = requests.get(f"{API}/hr/staff", headers=manager).json()
    b = requests.get(f"{API}/hr/staff", headers=manager).json()
    # Same overall counts
    assert a["summary"] == b["summary"]
    # Same per-staff overall_status
    a_rows = {r["staff_id"]: r["overall_status"] for r in a["rows"]}
    b_rows = {r["staff_id"]: r["overall_status"] for r in b["rows"]}
    assert a_rows == b_rows
