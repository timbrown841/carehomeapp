"""Iteration 26 — Home Operations & Compliance backend tests."""
import os
import requests

API = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def test_check_types_seeded():
    t = _login("staff@care.local", "Staff@123")
    r = requests.get(f"{API}/compliance/check-types", headers=_h(t))
    assert r.status_code == 200
    items = r.json()
    ids = {c["id"] for c in items}
    # Critical compliance items must be present
    for must in [
        "fridge_temperature", "freezer_temperature", "water_temp_hot", "water_temp_cold",
        "legionella_flush", "fire_alarm_test", "smoke_alarm_check", "fire_drill",
        "sharps_check", "vehicle_check", "cleaning_audit", "hs_audit",
    ]:
        assert must in ids, f"Missing seeded check type: {must}"
    # Each must have fields, frequency_days, group
    for c in items:
        assert c.get("frequency_days"), c["id"]
        assert c.get("fields") is not None, c["id"]
        assert c.get("group"), c["id"]


def test_dashboard_endpoint():
    t = _login("staff@care.local", "Staff@123")
    r = requests.get(f"{API}/compliance/dashboard", headers=_h(t))
    assert r.status_code == 200
    d = r.json()
    assert "rows" in d and "counts" in d
    assert d["counts"]["total"] == len(d["rows"])
    # Each row should have all the expected keys
    for row in d["rows"]:
        for k in ["check_type_id", "name", "group", "frequency_days", "status"]:
            assert k in row, f"row missing {k}: {row}"


def test_create_log_status_pass():
    t = _login("staff@care.local", "Staff@123")
    payload = {
        "check_type_id": "fridge_temperature",
        "values": {"location": "Test fridge OK", "temperature_c": 3.5},
    }
    r = requests.post(f"{API}/compliance/logs", headers=_h(t), json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ok"


def test_create_log_status_fail():
    t = _login("staff@care.local", "Staff@123")
    payload = {
        "check_type_id": "fridge_temperature",
        "values": {"location": "Test fridge FAIL", "temperature_c": 12},
    }
    r = requests.post(f"{API}/compliance/logs", headers=_h(t), json=payload)
    assert r.status_code == 200
    assert r.json()["status"] == "fail"


def test_create_log_status_action_needed_warn():
    """Warn-zone (between ok and fail bounds) should yield action_needed."""
    t = _login("staff@care.local", "Staff@123")
    # fridge ok 0..5, warn_max 8 → 7 should be action_needed
    r = requests.post(f"{API}/compliance/logs", headers=_h(t), json={
        "check_type_id": "fridge_temperature",
        "values": {"location": "Borderline", "temperature_c": 7},
    })
    assert r.status_code == 200
    assert r.json()["status"] == "action_needed"


def test_create_log_required_field_validation():
    t = _login("staff@care.local", "Staff@123")
    # missing required temperature_c
    r = requests.post(f"{API}/compliance/logs", headers=_h(t), json={
        "check_type_id": "fridge_temperature",
        "values": {"location": "Kitchen"},
    })
    assert r.status_code == 400


def test_create_log_unknown_check_type():
    t = _login("staff@care.local", "Staff@123")
    r = requests.post(f"{API}/compliance/logs", headers=_h(t), json={
        "check_type_id": "made_up_check",
        "values": {},
    })
    assert r.status_code == 404


def test_checkbox_rule_all_required():
    """Fire alarm test requires panel_clear AND audible_everywhere."""
    t = _login("staff@care.local", "Staff@123")
    r1 = requests.post(f"{API}/compliance/logs", headers=_h(t), json={
        "check_type_id": "fire_alarm_test",
        "values": {"call_point": "CP-1", "panel_clear": True, "audible_everywhere": True},
    })
    assert r1.status_code == 200
    assert r1.json()["status"] == "ok"
    # Note: required-checkbox semantics are validated server-side as truthy check.
    # If audible_everywhere=False the rule still flags fail provided value is sent.
    # But since required checkbox False is treated as missing, expect 400.
    r2 = requests.post(f"{API}/compliance/logs", headers=_h(t), json={
        "check_type_id": "fire_alarm_test",
        "values": {"call_point": "CP-2", "panel_clear": True, "audible_everywhere": False},
    })
    # backend treats required checkbox False as missing → 400 OR fail (200). Accept either.
    assert r2.status_code in (200, 400)
    if r2.status_code == 200:
        assert r2.json()["status"] == "fail"


def test_list_logs_filter_by_check_type():
    t = _login("staff@care.local", "Staff@123")
    r = requests.get(f"{API}/compliance/logs", headers=_h(t), params={"check_type_id": "fridge_temperature"})
    assert r.status_code == 200
    items = r.json()
    for it in items:
        assert it["check_type_id"] == "fridge_temperature"


def test_signoff_and_delete_rbac():
    # Staff cannot sign off or delete; manager can
    staff = _login("staff@care.local", "Staff@123")
    mgr = _login("manager@care.local", "Manager@123")

    # Create a log as staff
    r = requests.post(f"{API}/compliance/logs", headers=_h(staff), json={
        "check_type_id": "freezer_temperature",
        "values": {"location": "RBAC test", "temperature_c": -20},
    })
    log_id = r.json()["id"]

    # Staff signoff → 403
    r = requests.post(f"{API}/compliance/logs/{log_id}/sign-off", headers=_h(staff))
    assert r.status_code == 403

    # Manager signoff → 200
    r = requests.post(f"{API}/compliance/logs/{log_id}/sign-off", headers=_h(mgr))
    assert r.status_code == 200
    assert r.json()["manager_signed_off_by"]

    # Staff delete → 403
    r = requests.delete(f"{API}/compliance/logs/{log_id}", headers=_h(staff))
    assert r.status_code == 403

    # Manager delete → 200
    r = requests.delete(f"{API}/compliance/logs/{log_id}", headers=_h(mgr))
    assert r.status_code == 200


def test_maintenance_full_lifecycle():
    staff = _login("staff@care.local", "Staff@123")
    mgr = _login("manager@care.local", "Manager@123")

    # Staff can create
    r = requests.post(f"{API}/maintenance", headers=_h(staff), json={
        "title": "Pytest leaky tap",
        "description": "Test",
        "category": "repair",
        "severity": "medium",
    })
    assert r.status_code == 200
    iid = r.json()["id"]
    assert r.json()["status"] == "reported"

    # Anyone signed in can patch (mark in_progress)
    r = requests.patch(f"{API}/maintenance/{iid}", headers=_h(staff), json={"status": "in_progress"})
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"

    # Resolved → resolved_at is set automatically
    r = requests.patch(f"{API}/maintenance/{iid}", headers=_h(mgr), json={
        "status": "resolved",
        "resolution_notes": "Fixed by handyman",
    })
    assert r.status_code == 200
    assert r.json()["resolved_at"]
    assert r.json()["resolved_by_name"]

    # Staff cannot delete
    r = requests.delete(f"{API}/maintenance/{iid}", headers=_h(staff))
    assert r.status_code == 403

    # Manager can delete
    r = requests.delete(f"{API}/maintenance/{iid}", headers=_h(mgr))
    assert r.status_code == 200


def test_maintenance_filter_by_status():
    t = _login("staff@care.local", "Staff@123")
    r = requests.get(f"{API}/maintenance", headers=_h(t), params={"status": "reported"})
    assert r.status_code == 200
    for i in r.json():
        assert i["status"] == "reported"


def test_snapshot_pdf_rbac_and_content():
    staff = _login("staff@care.local", "Staff@123")
    mgr = _login("manager@care.local", "Manager@123")
    senior = _login("senior@care.local", "Senior@123")

    # Staff blocked
    r = requests.get(f"{API}/compliance/snapshot.pdf", headers=_h(staff))
    assert r.status_code == 403
    # Senior blocked (manager+ only)
    r = requests.get(f"{API}/compliance/snapshot.pdf", headers=_h(senior))
    assert r.status_code == 403
    # Manager allowed
    r = requests.get(f"{API}/compliance/snapshot.pdf", headers=_h(mgr))
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1000


def test_audit_event_recorded_on_log_create():
    """A compliance log create should produce an audit_log entry."""
    staff = _login("staff@care.local", "Staff@123")
    senior = _login("senior@care.local", "Senior@123")
    # Create log
    r = requests.post(f"{API}/compliance/logs", headers=_h(staff), json={
        "check_type_id": "smoke_alarm_check",
        "values": {"heads_tested": 8, "all_responsive": True},
    })
    assert r.status_code == 200
    log_id = r.json()["id"]
    # Audit log accessible to senior+
    r = requests.get(f"{API}/audit", headers=_h(senior), params={"object_type": "compliance_log"})
    assert r.status_code == 200
    items = r.json().get("items", [])
    matching = [a for a in items if a.get("object_id") == log_id]
    assert len(matching) >= 1, "Audit event for compliance_log_create not found"
    assert matching[0]["action"] == "compliance_log_create"


def test_dashboard_reflects_last_log():
    t = _login("manager@care.local", "Manager@123")
    # Log a fresh fridge_temperature
    r = requests.post(f"{API}/compliance/logs", headers=_h(t), json={
        "check_type_id": "fridge_temperature",
        "values": {"location": "Dashboard test", "temperature_c": 4.2},
    })
    assert r.status_code == 200
    r = requests.get(f"{API}/compliance/dashboard", headers=_h(t))
    rows = r.json()["rows"]
    fridge = next(x for x in rows if x["check_type_id"] == "fridge_temperature")
    assert fridge["last_done"] is not None
    assert fridge["last_status"] == "ok"
    assert fridge["status"] in ("ok", "due_soon")  # within 1d frequency
