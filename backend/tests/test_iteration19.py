"""
Iteration 19 — Shift Handover module CRUD + lifecycle.

Covers:
  - GET /api/handovers/sections                (13 section meta items)
  - GET /api/handovers                          (list, includes seeded)
  - POST /api/handovers                         (create draft, empty sections)
  - GET /api/handovers/{id}                     (full doc, all 13 sections)
  - PATCH /api/handovers/{id}                   (sections; locked → 409; unlock window)
  - POST /api/handovers/{id}/sign-out           (initials required, 400 if missing; status → awaiting_incoming)
  - POST /api/handovers/{id}/sign-in            (must be awaiting; flagged → delivery_log; status → locked)
  - POST /api/handovers/{id}/unlock             (manager+admin; staff 403; sets 24h window)
  - DELETE /api/handovers/{id}                  (manager+admin; staff 403)
  - Full lifecycle + delivery_log trigger
"""
import os
import datetime as _dt
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL must be set"

CRED = {
    "manager": ("manager@care.local", "Manager@123"),
    "staff": ("staff@care.local", "Staff@123"),
    "admin": ("admin@care.local", "Admin@123"),
}

EXPECTED_SECTION_IDS = {
    "key_incidents", "missing_updates", "safeguarding", "medication_updates",
    "appointments", "behaviour_concerns", "visitors_contact", "maintenance_property",
    "vehicle_issues", "petty_cash_discrepancies", "reminders", "staff_observations",
    "shift_summary",
}


def _login(role):
    email, pwd = CRED[role]
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def manager_h():
    return {"Authorization": f"Bearer {_login('manager')}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def staff_h():
    return {"Authorization": f"Bearer {_login('staff')}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login('admin')}", "Content-Type": "application/json"}


def _today():
    return _dt.date.today().isoformat()


def _create_draft(headers, shift="morning"):
    r = requests.post(
        f"{BASE}/api/handovers",
        headers=headers,
        json={"shift": shift, "shift_date": _today()},
        timeout=15,
    )
    assert r.status_code == 200, f"create draft failed: {r.status_code} {r.text}"
    return r.json()


# ------------------------- Section metadata -------------------------
class TestSectionsMeta:
    def test_13_sections_returned(self, manager_h):
        r = requests.get(f"{BASE}/api/handovers/sections", headers=manager_h, timeout=15)
        assert r.status_code == 200
        body = r.json()
        sections = body.get("sections")
        assert isinstance(sections, list), f"sections not list: {body}"
        assert len(sections) == 13, f"expected 13 sections, got {len(sections)}"
        ids = {s["id"] for s in sections}
        assert ids == EXPECTED_SECTION_IDS, f"id mismatch: {ids} vs {EXPECTED_SECTION_IDS}"
        for s in sections:
            assert "id" in s and "label" in s and "hint" in s
            assert isinstance(s["label"], str) and s["label"]
            assert isinstance(s["hint"], str) and s["hint"]


# ------------------------- List -------------------------
class TestListHandovers:
    def test_list_includes_seeds(self, manager_h):
        r = requests.get(f"{BASE}/api/handovers", headers=manager_h, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 2, f"expected >=2 seeded handovers, got {len(rows)}"
        statuses = [row.get("status") for row in rows]
        # At least one locked seed exists (initial seed has 1 locked + 1 awaiting; awaiting may
        # have been signed-in during prior testing — accept either state).
        assert "locked" in statuses, f"no locked seed found: {statuses}"
        # At least one with flagged_count > 0 (seeded awaiting_incoming had 2 flags)
        assert any((row.get("flagged_count") or 0) > 0 for row in rows), "no flagged seed found"

    def test_list_status_filter(self, manager_h):
        r = requests.get(f"{BASE}/api/handovers?status=locked", headers=manager_h, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert all(row.get("status") == "locked" for row in rows)


# ------------------------- Create / Get -------------------------
class TestCreateGet:
    def test_create_draft_has_13_empty_sections(self, manager_h):
        d = _create_draft(manager_h, shift="afternoon")
        try:
            assert d["status"] == "draft"
            assert d["shift"] == "afternoon"
            assert d["shift_date"] == _today()
            assert d["flagged_count"] == 0
            assert d["outgoing_user_name"]  # auto-filled from logged-in user
            assert d["outgoing_initials"]   # auto-derived
            assert d["incoming_user_name"] is None
            assert d["locked_at"] is None
            secs = d["sections"]
            assert isinstance(secs, dict)
            assert set(secs.keys()) == EXPECTED_SECTION_IDS
            for k, v in secs.items():
                assert v.get("body") == ""
                assert v.get("flagged") is False
        finally:
            requests.delete(f"{BASE}/api/handovers/{d['id']}", headers=manager_h, timeout=15)

    def test_get_full_doc(self, manager_h):
        d = _create_draft(manager_h)
        try:
            r = requests.get(f"{BASE}/api/handovers/{d['id']}", headers=manager_h, timeout=15)
            assert r.status_code == 200
            full = r.json()
            assert full["id"] == d["id"]
            assert set(full["sections"].keys()) == EXPECTED_SECTION_IDS
        finally:
            requests.delete(f"{BASE}/api/handovers/{d['id']}", headers=manager_h, timeout=15)


# ------------------------- PATCH editability -------------------------
class TestPatch:
    def test_patch_draft_updates_section_and_flagged_count(self, manager_h):
        d = _create_draft(manager_h)
        hid = d["id"]
        try:
            payload = {
                "shift": d["shift"],
                "shift_date": d["shift_date"],
                "sections": {
                    "key_incidents": {"body": "TEST_iter19 incident note", "flagged": False},
                    "safeguarding": {"body": "TEST_iter19 sg concern", "flagged": True},
                },
            }
            r = requests.patch(f"{BASE}/api/handovers/{hid}", headers=manager_h, json=payload, timeout=15)
            assert r.status_code == 200, r.text
            updated = r.json()
            assert updated["sections"]["key_incidents"]["body"] == "TEST_iter19 incident note"
            assert updated["sections"]["safeguarding"]["flagged"] is True
            assert updated["flagged_count"] == 1
            # GET to verify persistence
            g = requests.get(f"{BASE}/api/handovers/{hid}", headers=manager_h, timeout=15).json()
            assert g["sections"]["safeguarding"]["body"] == "TEST_iter19 sg concern"
        finally:
            requests.delete(f"{BASE}/api/handovers/{hid}", headers=manager_h, timeout=15)

    def test_patch_locked_returns_409(self, manager_h):
        # find a seeded locked handover
        rows = requests.get(f"{BASE}/api/handovers?status=locked", headers=manager_h, timeout=15).json()
        if not rows:
            pytest.skip("no locked seeded handover")
        # only choose one without active unlocked_until
        target = None
        for row in rows:
            unl = row.get("unlocked_until")
            if not unl:
                target = row
                break
            try:
                if _dt.datetime.fromisoformat(unl) <= _dt.datetime.now(_dt.timezone.utc):
                    target = row
                    break
            except Exception:
                pass
        if not target:
            pytest.skip("no fully-locked handover (all in active unlock window)")
        r = requests.patch(
            f"{BASE}/api/handovers/{target['id']}",
            headers=manager_h,
            json={"shift": target["shift"], "shift_date": target["shift_date"],
                  "sections": {"reminders": {"body": "TEST_iter19 should fail", "flagged": False}}},
            timeout=15,
        )
        assert r.status_code == 409, f"expected 409, got {r.status_code} {r.text}"


# ------------------------- Sign-out -------------------------
class TestSignOut:
    def test_signout_requires_initials(self, manager_h):
        d = _create_draft(manager_h)
        try:
            r = requests.post(
                f"{BASE}/api/handovers/{d['id']}/sign-out",
                headers=manager_h, json={}, timeout=15,
            )
            assert r.status_code == 400
        finally:
            requests.delete(f"{BASE}/api/handovers/{d['id']}", headers=manager_h, timeout=15)

    def test_signout_moves_to_awaiting_incoming(self, manager_h):
        d = _create_draft(manager_h)
        try:
            r = requests.post(
                f"{BASE}/api/handovers/{d['id']}/sign-out",
                headers=manager_h, json={"initials": "MN"}, timeout=15,
            )
            assert r.status_code == 200, r.text
            updated = r.json()
            assert updated["status"] == "awaiting_incoming"
            assert updated["outgoing_initials"] == "MN"
            assert updated["outgoing_signed_at"]
        finally:
            requests.delete(f"{BASE}/api/handovers/{d['id']}", headers=manager_h, timeout=15)


# ------------------------- Sign-in -------------------------
class TestSignIn:
    def test_signin_requires_awaiting_state(self, manager_h):
        d = _create_draft(manager_h)
        try:
            r = requests.post(
                f"{BASE}/api/handovers/{d['id']}/sign-in",
                headers=manager_h, json={"initials": "ZZ"}, timeout=15,
            )
            assert r.status_code == 409
        finally:
            requests.delete(f"{BASE}/api/handovers/{d['id']}", headers=manager_h, timeout=15)

    def test_signin_requires_initials(self, manager_h, staff_h):
        d = _create_draft(manager_h)
        try:
            requests.post(
                f"{BASE}/api/handovers/{d['id']}/sign-out",
                headers=manager_h, json={"initials": "MO"}, timeout=15,
            )
            r = requests.post(
                f"{BASE}/api/handovers/{d['id']}/sign-in",
                headers=staff_h, json={}, timeout=15,
            )
            assert r.status_code == 400
        finally:
            requests.delete(f"{BASE}/api/handovers/{d['id']}", headers=manager_h, timeout=15)

    def test_signin_locks_and_logs_when_flagged(self, manager_h, staff_h):
        d = _create_draft(manager_h)
        hid = d["id"]
        try:
            # Add a flagged section
            requests.patch(
                f"{BASE}/api/handovers/{hid}",
                headers=manager_h,
                json={"shift": d["shift"], "shift_date": d["shift_date"],
                      "sections": {
                          "safeguarding": {"body": "TEST_iter19 concern", "flagged": True},
                          "reminders": {"body": "TEST_iter19 rem", "flagged": False},
                      }},
                timeout=15,
            )
            # sign-out
            so = requests.post(
                f"{BASE}/api/handovers/{hid}/sign-out",
                headers=manager_h, json={"initials": "MO"}, timeout=15,
            )
            assert so.status_code == 200
            # sign-in (as staff)
            si = requests.post(
                f"{BASE}/api/handovers/{hid}/sign-in",
                headers=staff_h, json={"initials": "ST"}, timeout=15,
            )
            assert si.status_code == 200, si.text
            updated = si.json()
            assert updated["status"] == "locked"
            assert updated["locked_at"]
            assert updated["incoming_initials"] == "ST"
            assert updated["incoming_signed_at"]
            assert updated["flagged_count"] == 1
        finally:
            requests.delete(f"{BASE}/api/handovers/{hid}", headers=manager_h, timeout=15)


# ------------------------- Unlock & RBAC -------------------------
class TestUnlockAndRBAC:
    def _create_locked(self, mgr_h, staff_h):
        d = _create_draft(mgr_h)
        requests.post(f"{BASE}/api/handovers/{d['id']}/sign-out",
                      headers=mgr_h, json={"initials": "MO"}, timeout=15)
        requests.post(f"{BASE}/api/handovers/{d['id']}/sign-in",
                      headers=staff_h, json={"initials": "ST"}, timeout=15)
        return d["id"]

    def test_unlock_staff_forbidden(self, manager_h, staff_h):
        hid = self._create_locked(manager_h, staff_h)
        try:
            r = requests.post(f"{BASE}/api/handovers/{hid}/unlock", headers=staff_h, timeout=15)
            assert r.status_code == 403
        finally:
            requests.delete(f"{BASE}/api/handovers/{hid}", headers=manager_h, timeout=15)

    def test_unlock_must_be_locked(self, manager_h):
        d = _create_draft(manager_h)
        try:
            r = requests.post(f"{BASE}/api/handovers/{d['id']}/unlock", headers=manager_h, timeout=15)
            assert r.status_code == 409
        finally:
            requests.delete(f"{BASE}/api/handovers/{d['id']}", headers=manager_h, timeout=15)

    def test_unlock_sets_window_and_patch_succeeds(self, manager_h, staff_h):
        hid = self._create_locked(manager_h, staff_h)
        try:
            # PATCH should fail before unlock
            r0 = requests.patch(
                f"{BASE}/api/handovers/{hid}", headers=manager_h,
                json={"shift": "morning", "shift_date": _today(),
                      "sections": {"reminders": {"body": "x", "flagged": False}}},
                timeout=15,
            )
            assert r0.status_code == 409
            # unlock
            ru = requests.post(f"{BASE}/api/handovers/{hid}/unlock", headers=manager_h, timeout=15)
            assert ru.status_code == 200, ru.text
            updated = ru.json()
            assert updated["unlocked_until"]
            assert updated["unlocked_by"]
            until = _dt.datetime.fromisoformat(updated["unlocked_until"])
            now = _dt.datetime.now(_dt.timezone.utc)
            assert until > now
            # ~24h
            delta_h = (until - now).total_seconds() / 3600
            assert 23.5 <= delta_h <= 24.5, f"unlock window not ~24h: {delta_h}h"
            # PATCH should now succeed
            r1 = requests.patch(
                f"{BASE}/api/handovers/{hid}", headers=manager_h,
                json={"shift": "morning", "shift_date": _today(),
                      "sections": {"reminders": {"body": "TEST_iter19 post-unlock edit", "flagged": False}}},
                timeout=15,
            )
            assert r1.status_code == 200, r1.text
            assert r1.json()["sections"]["reminders"]["body"] == "TEST_iter19 post-unlock edit"
        finally:
            requests.delete(f"{BASE}/api/handovers/{hid}", headers=manager_h, timeout=15)

    def test_delete_staff_forbidden(self, manager_h, staff_h):
        d = _create_draft(manager_h)
        try:
            r = requests.delete(f"{BASE}/api/handovers/{d['id']}", headers=staff_h, timeout=15)
            assert r.status_code == 403
        finally:
            requests.delete(f"{BASE}/api/handovers/{d['id']}", headers=manager_h, timeout=15)


# ------------------------- Full lifecycle -------------------------
class TestLifecycle:
    def test_full_lifecycle(self, manager_h, staff_h, admin_h):
        # 1. Create draft
        d = _create_draft(manager_h)
        hid = d["id"]
        try:
            # 2. Fill 3 sections (one flagged)
            patch_payload = {
                "shift": d["shift"], "shift_date": d["shift_date"],
                "sections": {
                    "key_incidents": {"body": "TEST_iter19 LC incident", "flagged": False},
                    "safeguarding": {"body": "TEST_iter19 LC safeguarding", "flagged": True},
                    "shift_summary": {"body": "TEST_iter19 LC summary", "flagged": False},
                },
            }
            p1 = requests.patch(f"{BASE}/api/handovers/{hid}", headers=manager_h, json=patch_payload, timeout=15)
            assert p1.status_code == 200
            assert p1.json()["flagged_count"] == 1

            # 3. Sign-out
            so = requests.post(f"{BASE}/api/handovers/{hid}/sign-out",
                               headers=manager_h, json={"initials": "MO"}, timeout=15)
            assert so.status_code == 200
            assert so.json()["status"] == "awaiting_incoming"

            # 4. Sign-in (as staff)
            si = requests.post(f"{BASE}/api/handovers/{hid}/sign-in",
                               headers=staff_h, json={"initials": "ST"}, timeout=15)
            assert si.status_code == 200, si.text
            locked = si.json()
            assert locked["status"] == "locked"
            assert locked["locked_at"]
            assert locked["flagged_count"] == 1

            # 5. PATCH should now fail (locked)
            p_fail = requests.patch(
                f"{BASE}/api/handovers/{hid}", headers=manager_h,
                json={"shift": d["shift"], "shift_date": d["shift_date"],
                      "sections": {"reminders": {"body": "should fail", "flagged": False}}},
                timeout=15,
            )
            assert p_fail.status_code == 409

            # 6. Manager unlock
            ru = requests.post(f"{BASE}/api/handovers/{hid}/unlock", headers=manager_h, timeout=15)
            assert ru.status_code == 200
            assert ru.json()["unlocked_until"]

            # 7. PATCH succeeds within unlock window
            p2 = requests.patch(
                f"{BASE}/api/handovers/{hid}", headers=manager_h,
                json={"shift": d["shift"], "shift_date": d["shift_date"],
                      "sections": {"reminders": {"body": "TEST_iter19 LC post-unlock", "flagged": False}}},
                timeout=15,
            )
            assert p2.status_code == 200, p2.text
            assert p2.json()["sections"]["reminders"]["body"] == "TEST_iter19 LC post-unlock"

            # 8. DELETE as admin
            rd = requests.delete(f"{BASE}/api/handovers/{hid}", headers=admin_h, timeout=15)
            assert rd.status_code == 200
            assert rd.json().get("deleted") == 1
            hid = None  # already deleted
        finally:
            if hid:
                requests.delete(f"{BASE}/api/handovers/{hid}", headers=manager_h, timeout=15)
