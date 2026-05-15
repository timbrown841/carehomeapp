"""Tests for the Staff Reflective Practice & Wellbeing Hub (Iteration 33).

Covers:
  - Wellbeing emoji check-ins CRUD and own-only enforcement
  - Reflection entry CRUD with hybrid privacy (shared_with_manager flag)
  - Staff cannot read another staff's private reflections
  - Manager+ supervision view: only shared reflections + mood trend
  - Team awareness aggregate (manager+, anonymised count + named only when shared)
  - Pattern nudge for staff (gentle, 14-day window)
  - Prompt-sets + mood_meta metadata endpoint
"""
import os
import pytest
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") + "/api"
assert API, "REACT_APP_BACKEND_URL must be set"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module")
def staff():
    token, user = _login("staff@care.local", "Staff@123")
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def senior():
    token, user = _login("senior@care.local", "Senior@123")
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def manager():
    token, user = _login("manager@care.local", "Manager@123")
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(autouse=True)
def _reset(staff, senior, manager):
    """Delete the staff member's own check-ins + reflections before each test."""
    for u in (staff, senior):
        ci = requests.get(f"{API}/reflection/checkins/mine", headers=u["h"]).json()
        for c in ci:
            requests.delete(f"{API}/reflection/checkins/{c['id']}", headers=u["h"])
        re_list = requests.get(f"{API}/reflection/entries/mine", headers=u["h"]).json()
        for r in re_list:
            requests.delete(f"{API}/reflection/entries/{r['id']}", headers=u["h"])


def test_prompt_sets_endpoint(staff):
    r = requests.get(f"{API}/reflection/prompt-sets", headers=staff["h"])
    assert r.status_code == 200
    body = r.json()
    assert set(body["prompt_sets"].keys()) >= {
        "shift_reflection", "gibbs", "trauma_informed", "restorative", "learning_from_incident"
    }
    assert set(body["mood_meta"].keys()) == {"overwhelmed", "stressed", "okay", "positive", "confident"}
    for mood, m in body["mood_meta"].items():
        assert "emoji" in m and "label" in m and "tone" in m and "score" in m


def test_checkin_create_and_list_mine_only(staff, senior):
    r = requests.post(f"{API}/reflection/checkins", headers=staff["h"],
                      json={"mood": "stressed", "shift_context": "after_shift", "note": "Tough day."})
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    # Staff sees own
    own = requests.get(f"{API}/reflection/checkins/mine", headers=staff["h"]).json()
    assert any(c["id"] == cid for c in own)
    # Senior does NOT see staff's check-in on their own /mine
    other = requests.get(f"{API}/reflection/checkins/mine", headers=senior["h"]).json()
    assert not any(c["id"] == cid for c in other)


def test_checkin_delete_only_own(staff, senior):
    r = requests.post(f"{API}/reflection/checkins", headers=staff["h"],
                      json={"mood": "okay"}).json()
    # Senior cannot delete staff's checkin
    bad = requests.delete(f"{API}/reflection/checkins/{r['id']}", headers=senior["h"])
    assert bad.status_code == 403
    # Staff can
    ok = requests.delete(f"{API}/reflection/checkins/{r['id']}", headers=staff["h"])
    assert ok.status_code == 200


def test_reflection_create_private_by_default(staff, manager):
    r = requests.post(f"{API}/reflection/entries", headers=staff["h"], json={
        "kind": "shift_reflection",
        "prompt_set": "shift_reflection",
        "title": "End of late shift",
        "responses": {"feel": "tired but okay", "proud": "stayed calm in the lounge"},
    }).json()
    eid = r["id"]
    assert r["shared_with_manager"] is False

    # Manager cannot read it
    mr = requests.get(f"{API}/reflection/entries/{eid}", headers=manager["h"])
    assert mr.status_code == 403
    # Staff can
    own = requests.get(f"{API}/reflection/entries/{eid}", headers=staff["h"])
    assert own.status_code == 200


def test_reflection_share_with_manager(staff, manager):
    r = requests.post(f"{API}/reflection/entries", headers=staff["h"], json={
        "kind": "shift_reflection",
        "prompt_set": "shift_reflection",
        "responses": {"feel": "supported", "challenging": "missing episode at 22:00"},
        "shared_with_manager": True,
    }).json()
    eid = r["id"]
    assert r["shared_with_manager"] is True
    # Manager can now read
    mr = requests.get(f"{API}/reflection/entries/{eid}", headers=manager["h"])
    assert mr.status_code == 200


def test_reflection_only_owner_can_edit_or_delete(staff, senior, manager):
    r = requests.post(f"{API}/reflection/entries", headers=staff["h"], json={
        "kind": "win", "title": "Helped Maddy", "body": "She opened up.", "shared_with_manager": True,
    }).json()
    eid = r["id"]
    # Manager can READ (shared) but cannot edit
    bad_patch = requests.patch(f"{API}/reflection/entries/{eid}", headers=manager["h"],
                               json={"title": "Hijacked"})
    assert bad_patch.status_code == 403
    bad_delete = requests.delete(f"{API}/reflection/entries/{eid}", headers=manager["h"])
    assert bad_delete.status_code == 403
    # Owner can
    ok_patch = requests.patch(f"{API}/reflection/entries/{eid}", headers=staff["h"],
                              json={"title": "Helped Maddy — proud moment"})
    assert ok_patch.status_code == 200
    assert ok_patch.json()["title"] == "Helped Maddy — proud moment"


def test_staff_cannot_read_others_shared_reflections(staff, senior, manager):
    """Senior (tier 2) is not manager+ → cannot read shared reflections via direct GET."""
    r = requests.post(f"{API}/reflection/entries", headers=staff["h"], json={
        "kind": "shift_reflection", "title": "Shared with manager",
        "body": "Long day.", "shared_with_manager": True,
    }).json()
    eid = r["id"]
    senior_read = requests.get(f"{API}/reflection/entries/{eid}", headers=senior["h"])
    assert senior_read.status_code == 403


def test_my_pattern_supportive_nudge_after_three_stress_checkins(staff):
    # Baseline: no nudge
    p0 = requests.get(f"{API}/reflection/my-pattern", headers=staff["h"]).json()
    assert p0["nudge"] is None
    # Create 3 stressed check-ins
    for mood in ("stressed", "overwhelmed", "stressed"):
        requests.post(f"{API}/reflection/checkins", headers=staff["h"],
                      json={"mood": mood, "shift_context": "after_shift"})
    p1 = requests.get(f"{API}/reflection/my-pattern", headers=staff["h"]).json()
    assert p1["stressed_count_14d"] == 3
    assert p1["nudge"] is not None
    assert p1["nudge"]["tone"] == "supportive"
    assert "stretched" in p1["nudge"]["title"].lower() or "stretched" in p1["nudge"]["message"].lower()


def test_supervision_view_only_shows_shared(staff, manager):
    # Create 1 private + 1 shared reflection
    requests.post(f"{API}/reflection/entries", headers=staff["h"], json={
        "kind": "shift_reflection", "title": "Private thoughts",
        "body": "Just for me.", "shared_with_manager": False,
    })
    requests.post(f"{API}/reflection/entries", headers=staff["h"], json={
        "kind": "win", "title": "Shared win",
        "body": "Restoring trust with Jordan.", "shared_with_manager": True,
    })
    # Manager pulls supervision view
    uid = staff["user"]["id"]
    sv = requests.get(f"{API}/reflection/supervision/{uid}", headers=manager["h"])
    assert sv.status_code == 200
    body = sv.json()
    titles = [r["title"] for r in body["shared_reflections"]]
    assert "Shared win" in titles
    assert "Private thoughts" not in titles  # privacy is enforced


def test_supervision_view_requires_manager(staff, senior):
    """Tier 2 senior cannot access supervision view (manager-only)."""
    uid = staff["user"]["id"]
    r = requests.get(f"{API}/reflection/supervision/{uid}", headers=senior["h"])
    assert r.status_code == 403


def test_supervision_flag_when_stressed_pattern(staff, manager):
    for _ in range(3):
        requests.post(f"{API}/reflection/checkins", headers=staff["h"],
                      json={"mood": "overwhelmed", "shift_context": "after_shift"})
    uid = staff["user"]["id"]
    sv = requests.get(f"{API}/reflection/supervision/{uid}", headers=manager["h"]).json()
    assert sv["stressed_count_14d"] >= 3
    assert sv["flag"] is not None
    assert sv["flag"]["severity"] == "amber"


def test_team_awareness_aggregate_named_only_when_shared(staff, senior, manager):
    """Without sharing, names should NOT appear in amber_named — they roll up into amber_anonymous_count."""
    # Trigger amber: 3 stress check-ins, NO shared reflection
    for _ in range(3):
        requests.post(f"{API}/reflection/checkins", headers=staff["h"],
                      json={"mood": "stressed"})
    aware = requests.get(f"{API}/reflection/wellbeing/awareness", headers=manager["h"]).json()
    # staff should be anonymous
    named_ids = [x["user_id"] for x in aware["amber_named"]]
    assert staff["user"]["id"] not in named_ids
    assert aware["amber_anonymous_count"] >= 1

    # Now share a reflection — staff becomes named
    requests.post(f"{API}/reflection/entries", headers=staff["h"], json={
        "kind": "shift_reflection", "title": "Visible to manager", "shared_with_manager": True,
    })
    aware2 = requests.get(f"{API}/reflection/wellbeing/awareness", headers=manager["h"]).json()
    named_ids2 = [x["user_id"] for x in aware2["amber_named"]]
    assert staff["user"]["id"] in named_ids2


def test_team_awareness_requires_manager(senior):
    r = requests.get(f"{API}/reflection/wellbeing/awareness", headers=senior["h"])
    assert r.status_code == 403


def test_unauthenticated_endpoints_return_401():
    for path in (
        "/reflection/prompt-sets", "/reflection/checkins/mine",
        "/reflection/entries/mine", "/reflection/my-pattern",
    ):
        r = requests.get(f"{API}{path}")
        assert r.status_code == 401, f"{path} should require auth"
