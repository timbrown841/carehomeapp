"""Iteration 31 — Adult Services modules tests."""
import os
import requests

API = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _adult_id(t):
    r = requests.get(f"{API}/residents", headers=_h(t), params={"sector": "adult"}).json()
    assert r, "Need at least one adult resident"
    return r[0]["id"]


# ---------- Care Tasks ----------
def test_care_task_lifecycle():
    t = _login("staff@care.local", "Staff@123")
    rid = _adult_id(t)
    # Create
    r = requests.post(f"{API}/residents/{rid}/care-tasks", headers=_h(t), json={
        "resident_id": rid, "kind": "morning_routine", "title": "Wash and dress", "support_minutes": 30,
    })
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    assert r.json()["status"] == "pending"
    # List
    items = requests.get(f"{API}/residents/{rid}/care-tasks", headers=_h(t)).json()
    assert any(x["id"] == tid for x in items)
    # Filter by status=pending
    pending = requests.get(f"{API}/residents/{rid}/care-tasks", headers=_h(t), params={"status": "pending"}).json()
    assert any(x["id"] == tid for x in pending)
    # Complete
    r = requests.patch(f"{API}/care-tasks/{tid}", headers=_h(t), json={"status": "completed", "notes": "Done"})
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    assert r.json()["completed_at"]
    assert r.json()["completed_by_name"]


def test_care_task_refused_with_reason():
    t = _login("staff@care.local", "Staff@123")
    rid = _adult_id(t)
    r = requests.post(f"{API}/residents/{rid}/care-tasks", headers=_h(t), json={
        "resident_id": rid, "kind": "personal_care", "title": "Shower"
    })
    tid = r.json()["id"]
    r = requests.patch(f"{API}/care-tasks/{tid}", headers=_h(t),
                       json={"status": "refused", "refused_reason": "Felt unwell"})
    assert r.status_code == 200
    assert r.json()["refused_reason"] == "Felt unwell"


def test_care_task_delete_rbac():
    staff = _login("staff@care.local", "Staff@123")
    mgr = _login("manager@care.local", "Manager@123")
    rid = _adult_id(staff)
    r = requests.post(f"{API}/residents/{rid}/care-tasks", headers=_h(staff), json={
        "resident_id": rid, "kind": "meal_support", "title": "Lunch"
    })
    tid = r.json()["id"]
    assert requests.delete(f"{API}/care-tasks/{tid}", headers=_h(staff)).status_code == 403
    assert requests.delete(f"{API}/care-tasks/{tid}", headers=_h(mgr)).status_code == 200


# ---------- Falls ----------
def test_fall_create_and_signoff():
    staff = _login("staff@care.local", "Staff@123")
    mgr = _login("manager@care.local", "Manager@123")
    rid = _adult_id(staff)
    r = requests.post(f"{API}/residents/{rid}/falls", headers=_h(staff), json={
        "resident_id": rid, "occurred_at": "2026-02-09T10:00:00Z", "location": "Bathroom",
        "witnessed": False, "injury": "minor", "hospital_involvement": "none",
        "action_taken": "First aid given",
    })
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    # List
    items = requests.get(f"{API}/residents/{rid}/falls", headers=_h(staff)).json()
    assert any(f["id"] == fid for f in items)
    # Staff cannot sign off
    assert requests.post(f"{API}/falls/{fid}/sign-off", headers=_h(staff)).status_code == 403
    # Manager can
    r = requests.post(f"{API}/falls/{fid}/sign-off", headers=_h(mgr))
    assert r.status_code == 200
    assert r.json()["manager_signed_off_by"]


# ---------- Mobility ----------
def test_mobility_create():
    t = _login("staff@care.local", "Staff@123")
    rid = _adult_id(t)
    r = requests.post(f"{API}/residents/{rid}/mobility", headers=_h(t), json={
        "resident_id": rid, "mobility_level": "walking_aid", "falls_risk": "medium",
        "walking_aids": ["zimmer frame"], "staff_guidance": "2 staff for transfers",
    })
    assert r.status_code == 200
    assert r.json()["mobility_level"] == "walking_aid"
    assert r.json()["falls_risk"] == "medium"
    assert r.json()["assessor_name"]


# ---------- MCA ----------
def test_mca_requires_senior():
    staff = _login("staff@care.local", "Staff@123")
    senior = _login("senior@care.local", "Senior@123")
    rid = _adult_id(staff)
    payload = {
        "resident_id": rid, "decision_topic": "Choosing where to live",
        "capacity_outcome": "lacks_capacity",
        "best_interest_decision": "Continue current placement after consultation",
    }
    assert requests.post(f"{API}/residents/{rid}/mca", headers=_h(staff), json=payload).status_code == 403
    r = requests.post(f"{API}/residents/{rid}/mca", headers=_h(senior), json=payload)
    assert r.status_code == 200
    assert r.json()["capacity_outcome"] == "lacks_capacity"


def test_mca_signoff_requires_manager():
    senior = _login("senior@care.local", "Senior@123")
    mgr = _login("manager@care.local", "Manager@123")
    rid = _adult_id(senior)
    r = requests.post(f"{API}/residents/{rid}/mca", headers=_h(senior), json={
        "resident_id": rid, "decision_topic": "Test capacity decision",
        "capacity_outcome": "fluctuating",
    })
    mid = r.json()["id"]
    assert requests.post(f"{API}/mca/{mid}/sign-off", headers=_h(senior)).status_code == 403
    r = requests.post(f"{API}/mca/{mid}/sign-off", headers=_h(mgr))
    assert r.status_code == 200
    assert r.json()["manager_signed_off_by"]


# ---------- Wellbeing ----------
def test_wellbeing_observation_deterioration_flag():
    t = _login("staff@care.local", "Staff@123")
    rid = _adult_id(t)
    # Calm observation — no deterioration
    r = requests.post(f"{API}/residents/{rid}/wellbeing", headers=_h(t), json={
        "resident_id": rid, "mood": "stable",
        "hydration_level": "good", "nutrition_intake": "good", "sleep_quality": "good",
    })
    assert r.status_code == 200
    assert r.json()["deterioration_flag"] is False
    # Concerning — should auto-flag
    r = requests.post(f"{API}/residents/{rid}/wellbeing", headers=_h(t), json={
        "resident_id": rid, "mood": "low",
        "hydration_level": "poor", "nutrition_intake": "poor", "sleep_quality": "disturbed",
        "mental_health_concerns": "Withdrawn for 2 days",
    })
    assert r.status_code == 200
    assert r.json()["deterioration_flag"] is True


# ---------- Integration: chronology + summary ----------
def test_adult_modules_feed_chronology():
    t = _login("staff@care.local", "Staff@123")
    rid = _adult_id(t)
    # Seed one of each
    requests.post(f"{API}/residents/{rid}/falls", headers=_h(t), json={
        "resident_id": rid, "occurred_at": "2026-02-09T10:00:00Z", "location": "Hall",
        "witnessed": False, "injury": "moderate",
    })
    requests.post(f"{API}/residents/{rid}/wellbeing", headers=_h(t), json={
        "resident_id": rid, "mood": "low", "hydration_level": "poor",
        "nutrition_intake": "adequate", "sleep_quality": "adequate",
    })
    r = requests.get(f"{API}/residents/{rid}/timeline", headers=_h(t))
    assert r.status_code == 200
    cats = set(e["category"] for e in r.json()["items"])
    assert "fall" in cats
    assert "wellbeing" in cats


def test_adult_summary_includes_new_widgets():
    t = _login("staff@care.local", "Staff@123")
    rid = _adult_id(t)
    r = requests.get(f"{API}/residents/{rid}/operational-summary", headers=_h(t)).json()
    assert r["sector"] == "adult"
    widget_ids = {w["id"] for w in r["widgets"]}
    for must in ["care_tasks_due", "care_tasks_missed_7d", "active_meds",
                 "med_refusals_14d", "appt_next_7d", "falls_30d",
                 "mobility_risk", "mca_status", "wellbeing_14d"]:
        assert must in widget_ids, f"Missing adult widget: {must}"
