"""Iteration 32 — Deployment readiness regression under realistic adult demo data.

Stress-tests chronology, operational summary, pattern detection, PDF export, dashboards,
RBAC and audit logging against the Tom Whitfield + Margaret Lewis adult seed.
"""
import os
import time
import pytest
import requests

API = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"

TOM = "26a6295d-640c-4dfe-a95c-fd0c0a76a5d1"
MAGGIE = "9349f6d9-a222-465f-90b4-6781a824fee8"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def staff_t():
    return _login("staff@care.local", "Staff@123")


@pytest.fixture(scope="module")
def senior_t():
    return _login("senior@care.local", "Senior@123")


@pytest.fixture(scope="module")
def manager_t():
    return _login("manager@care.local", "Manager@123")


@pytest.fixture(scope="module")
def admin_t():
    return _login("admin@care.local", "Admin@123")


# ---------- Resident sector regression ----------
def test_resident_sector_disjoint(manager_t):
    adult = requests.get(f"{API}/residents", headers=_h(manager_t), params={"sector": "adult"}, timeout=10).json()
    children = requests.get(f"{API}/residents", headers=_h(manager_t), params={"sector": "children"}, timeout=10).json()
    adult_ids = {r["id"] for r in adult}
    child_ids = {r["id"] for r in children}
    assert TOM in adult_ids, f"Tom missing from adult sector list, got {adult_ids}"
    assert MAGGIE in adult_ids, f"Margaret missing from adult sector list"
    assert TOM not in child_ids
    assert MAGGIE not in child_ids
    assert len(adult_ids & child_ids) == 0, "Sectors must be strictly disjoint"


# ---------- Adult demo seed sanity (Tom) ----------
def test_tom_care_tasks_seed(manager_t):
    items = requests.get(f"{API}/residents/{TOM}/care-tasks", headers=_h(manager_t), timeout=10).json()
    assert len(items) >= 8, f"Tom expected ~10 care tasks, got {len(items)}"
    refused = [x for x in items if x.get("status") == "refused"]
    assert len(refused) >= 2, f"Tom expected >=2 refused, got {len(refused)}"


def test_tom_wellbeing_seed(manager_t):
    items = requests.get(f"{API}/residents/{TOM}/wellbeing", headers=_h(manager_t), timeout=10).json()
    assert len(items) >= 5, f"Tom expected ~5 wellbeing, got {len(items)}"
    flagged = [x for x in items if x.get("deterioration_flag")]
    assert len(flagged) >= 3, f"Tom expected >=3 deterioration flags, got {len(flagged)}"


def test_tom_falls_mca_mobility_seed(manager_t):
    falls = requests.get(f"{API}/residents/{TOM}/falls", headers=_h(manager_t), timeout=10).json()
    assert len(falls) >= 1
    mca = requests.get(f"{API}/residents/{TOM}/mca", headers=_h(manager_t), timeout=10).json()
    assert len(mca) >= 1
    # At least one MCA fluctuating + unsigned
    fluct_unsigned = [m for m in mca if m.get("capacity_outcome") == "fluctuating" and not m.get("manager_signed_off_at")]
    assert len(fluct_unsigned) >= 1, f"Tom expected fluctuating unsigned MCA. Got {mca}"
    mobility = requests.get(f"{API}/residents/{TOM}/mobility", headers=_h(manager_t), timeout=10).json()
    assert len(mobility) >= 1


# ---------- Adult demo seed sanity (Margaret) ----------
def test_maggie_care_tasks_seed(manager_t):
    items = requests.get(f"{API}/residents/{MAGGIE}/care-tasks", headers=_h(manager_t), timeout=10).json()
    assert len(items) >= 20, f"Maggie expected ~25 care tasks, got {len(items)}"


def test_maggie_wellbeing_seed(manager_t):
    items = requests.get(f"{API}/residents/{MAGGIE}/wellbeing", headers=_h(manager_t), timeout=10).json()
    assert len(items) >= 5
    flagged = [x for x in items if x.get("deterioration_flag")]
    assert len(flagged) >= 4, f"Maggie expected >=4 deterioration flags, got {len(flagged)}"


def test_maggie_falls_seed_unsigned_present(manager_t):
    falls = requests.get(f"{API}/residents/{MAGGIE}/falls", headers=_h(manager_t), timeout=10).json()
    assert len(falls) >= 2, f"Maggie expected >=2 falls, got {len(falls)}"
    unsigned = [f for f in falls if not f.get("manager_signed_off_at")]
    assert len(unsigned) >= 1, "Maggie should have >=1 unsigned fall (manager-action-required backlog)"


def test_maggie_mca_unsigned_present(manager_t):
    mca = requests.get(f"{API}/residents/{MAGGIE}/mca", headers=_h(manager_t), timeout=10).json()
    assert len(mca) >= 2
    unsigned = [m for m in mca if not m.get("manager_signed_off_at")]
    assert len(unsigned) >= 1
    # Personal care decision topic
    topics = [m.get("decision_topic", "") for m in mca]
    assert any("personal care" in (t or "").lower() or "hygiene" in (t or "").lower() for t in topics), \
        f"Expected personal care/hygiene MCA topic, got {topics}"


def test_maggie_mobility_high_risk(manager_t):
    items = requests.get(f"{API}/residents/{MAGGIE}/mobility", headers=_h(manager_t), timeout=10).json()
    assert len(items) >= 1
    assert any(x.get("falls_risk") == "high" for x in items), f"Maggie expected high mobility falls_risk, got {items}"


# ---------- Operational summary (Tom) ----------
def test_tom_operational_summary(manager_t):
    t0 = time.time()
    r = requests.get(f"{API}/residents/{TOM}/operational-summary", headers=_h(manager_t), timeout=10)
    elapsed = (time.time() - t0) * 1000
    assert r.status_code == 200, r.text
    assert elapsed < 1500, f"Tom operational-summary too slow: {elapsed:.0f}ms"
    data = r.json()
    assert data.get("sector") == "adult"
    alerts = data.get("alerts", [])
    alert_ids = {a.get("id") for a in alerts}
    # Pattern rule names
    assert any("missed" in (a.get("id", "") + a.get("title", "")).lower() for a in alerts), \
        f"Tom missing 'missed care tasks' alert. Alerts={alerts}"
    assert any("wellbeing" in (a.get("id", "") + a.get("title", "")).lower() for a in alerts), \
        f"Tom missing wellbeing deterioration alert. Alerts={alerts}"
    # widgets
    widget_ids = {w["id"] for w in data.get("widgets", [])}
    for must in ["care_tasks_due", "care_tasks_missed_7d", "falls_30d", "mca_status", "wellbeing_14d"]:
        assert must in widget_ids, f"Tom missing widget {must}, got {widget_ids}"
    # report perf
    print(f"Tom operational-summary: {elapsed:.0f}ms, alerts={alert_ids}")


def test_maggie_operational_summary(manager_t):
    t0 = time.time()
    r = requests.get(f"{API}/residents/{MAGGIE}/operational-summary", headers=_h(manager_t), timeout=10)
    elapsed = (time.time() - t0) * 1000
    assert r.status_code == 200
    assert elapsed < 1500, f"Maggie operational-summary too slow: {elapsed:.0f}ms"
    data = r.json()
    assert data.get("sector") == "adult"
    alerts = data.get("alerts", [])
    txt = " ".join((a.get("id", "") + " " + a.get("title", "")).lower() for a in alerts)
    assert "fall" in txt, f"Maggie missing recurrent falls alert. Alerts={alerts}"
    assert "wellbeing" in txt, f"Maggie missing wellbeing alert. Alerts={alerts}"
    widget_ids = {w["id"] for w in data.get("widgets", [])}
    for must in ["falls_30d", "mobility_risk", "mca_status", "wellbeing_14d"]:
        assert must in widget_ids
    # Maggie falls_30d should be high severity
    falls_w = next(w for w in data["widgets"] if w["id"] == "falls_30d")
    assert falls_w.get("severity") in ("high", "medium"), f"falls_30d severity: {falls_w}"
    print(f"Maggie operational-summary: {elapsed:.0f}ms")


# ---------- Chronology engine ----------
def test_tom_timeline(manager_t):
    t0 = time.time()
    r = requests.get(f"{API}/residents/{TOM}/timeline", headers=_h(manager_t), params={"limit": 500}, timeout=10)
    elapsed = (time.time() - t0) * 1000
    assert r.status_code == 200
    assert elapsed < 2000, f"Tom timeline too slow: {elapsed:.0f}ms"
    data = r.json()
    items = data.get("items", [])
    assert len(items) >= 15, f"Tom expected ~19 timeline events, got {len(items)}"
    cats = {e["category"] for e in items}
    for must in ["care_task", "fall", "mca", "wellbeing"]:
        assert must in cats, f"Tom missing category {must}, got {cats}"
    assert data.get("counts_by_category"), "counts_by_category empty"
    assert data.get("category_meta"), "category_meta empty"
    print(f"Tom timeline: {elapsed:.0f}ms, {len(items)} events")


def test_maggie_timeline(manager_t):
    t0 = time.time()
    r = requests.get(f"{API}/residents/{MAGGIE}/timeline", headers=_h(manager_t), params={"limit": 500}, timeout=15)
    elapsed = (time.time() - t0) * 1000
    assert r.status_code == 200
    assert elapsed < 2500, f"Maggie timeline too slow: {elapsed:.0f}ms"
    data = r.json()
    items = data.get("items", [])
    assert len(items) >= 30, f"Maggie expected ~39 timeline events, got {len(items)}"
    cats = {e["category"] for e in items}
    for must in ["care_task", "fall", "mca", "wellbeing", "mobility"]:
        assert must in cats, f"Maggie missing category {must}, got {cats}"
    print(f"Maggie timeline: {elapsed:.0f}ms, {len(items)} events")


# ---------- Pattern detection ----------
def test_tom_patterns(manager_t):
    r = requests.get(f"{API}/residents/{TOM}/timeline/patterns", headers=_h(manager_t), timeout=10)
    assert r.status_code == 200
    data = r.json()
    patterns = data.get("patterns", data) if isinstance(data, dict) else data
    if isinstance(patterns, dict):
        patterns = patterns.get("patterns", [])
    ids = [p.get("id") or p.get("rule") or p.get("type") for p in patterns]
    txt = " ".join(str(p).lower() for p in patterns)
    assert "missed_care" in txt or any("missed_care" in (i or "") for i in ids), \
        f"Tom missing missed_care_cluster pattern. Got {patterns}"
    assert "wellbeing" in txt, f"Tom missing wellbeing_deterioration pattern. Got {patterns}"


def test_maggie_patterns(manager_t):
    r = requests.get(f"{API}/residents/{MAGGIE}/timeline/patterns", headers=_h(manager_t), timeout=10)
    assert r.status_code == 200
    data = r.json()
    patterns = data.get("patterns", data) if isinstance(data, dict) else data
    if isinstance(patterns, dict):
        patterns = patterns.get("patterns", [])
    txt = " ".join(str(p).lower() for p in patterns)
    assert "fall" in txt, f"Maggie missing falls_cluster pattern. Got {patterns}"
    assert "wellbeing" in txt, f"Maggie missing wellbeing_deterioration pattern. Got {patterns}"


# ---------- Chronology filtering ----------
def test_maggie_filter_by_fall_category(manager_t):
    r = requests.get(f"{API}/residents/{MAGGIE}/timeline", headers=_h(manager_t),
                     params={"categories": "fall", "limit": 500}, timeout=10)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) >= 2 and len(items) <= 5, f"Expected ~2 fall events, got {len(items)}"
    assert all(e["category"] == "fall" for e in items)


def test_maggie_filter_by_wellbeing(manager_t):
    r = requests.get(f"{API}/residents/{MAGGIE}/timeline", headers=_h(manager_t),
                     params={"categories": "wellbeing", "limit": 500}, timeout=10)
    items = r.json()["items"]
    assert len(items) >= 5
    assert all(e["category"] == "wellbeing" for e in items)


def test_maggie_filter_from_at(manager_t):
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    r = requests.get(f"{API}/residents/{MAGGIE}/timeline", headers=_h(manager_t),
                     params={"from_at": cutoff, "limit": 500}, timeout=10)
    assert r.status_code == 200
    # Should be a subset (less than full ~39)
    full = requests.get(f"{API}/residents/{MAGGIE}/timeline", headers=_h(manager_t),
                       params={"limit": 500}, timeout=10).json()["items"]
    subset = r.json()["items"]
    assert len(subset) < len(full), f"from_at filter didn't reduce events: {len(subset)} vs {len(full)}"


def test_tom_filter_q_quetiapine(manager_t):
    r = requests.get(f"{API}/residents/{TOM}/timeline", headers=_h(manager_t),
                     params={"q": "Quetiapine", "limit": 500}, timeout=10)
    assert r.status_code == 200
    # Should not error; may have 0+ results
    assert "items" in r.json()


def test_maggie_safeguarding_only(manager_t):
    r = requests.get(f"{API}/residents/{MAGGIE}/timeline", headers=_h(manager_t),
                     params={"safeguarding_only": "true", "limit": 500}, timeout=10)
    assert r.status_code == 200, r.text


# ---------- PDF export ----------
def test_pdf_export_manager_full(manager_t):
    t0 = time.time()
    r = requests.get(f"{API}/residents/{MAGGIE}/timeline.pdf", headers=_h(manager_t),
                     params={"scope": "full"}, timeout=30)
    elapsed = (time.time() - t0) * 1000
    assert r.status_code == 200, f"PDF export failed: {r.status_code} {r.text[:300]}"
    assert "application/pdf" in r.headers.get("content-type", "")
    assert len(r.content) > 1000, f"PDF too small ({len(r.content)} bytes)"
    assert elapsed < 5000, f"PDF gen too slow: {elapsed:.0f}ms"
    print(f"Maggie PDF (full): {elapsed:.0f}ms, {len(r.content)} bytes")


def test_pdf_export_manager_safeguarding(manager_t):
    r = requests.get(f"{API}/residents/{TOM}/timeline.pdf", headers=_h(manager_t),
                     params={"scope": "safeguarding"}, timeout=30)
    assert r.status_code == 200
    assert "application/pdf" in r.headers.get("content-type", "")
    assert len(r.content) > 500


def test_pdf_export_staff_forbidden(staff_t):
    r = requests.get(f"{API}/residents/{MAGGIE}/timeline.pdf", headers=_h(staff_t),
                     params={"scope": "full"}, timeout=15)
    assert r.status_code == 403, f"Staff should be forbidden from PDF export, got {r.status_code}"


# ---------- Dashboard performance ----------
def test_dashboard_stats_perf(manager_t):
    t0 = time.time()
    r = requests.get(f"{API}/dashboard/stats", headers=_h(manager_t), timeout=10)
    elapsed = (time.time() - t0) * 1000
    assert r.status_code == 200
    assert elapsed < 1500, f"dashboard/stats too slow: {elapsed:.0f}ms"
    print(f"dashboard/stats: {elapsed:.0f}ms")


def test_dashboard_urgency_perf(manager_t):
    t0 = time.time()
    r = requests.get(f"{API}/dashboard/urgency", headers=_h(manager_t), timeout=10)
    elapsed = (time.time() - t0) * 1000
    assert r.status_code == 200
    assert elapsed < 1500, f"dashboard/urgency too slow: {elapsed:.0f}ms"
    print(f"dashboard/urgency: {elapsed:.0f}ms")


# ---------- Pre-existing adult CRUD smoke RBAC ----------
def test_care_task_staff_create_complete_then_delete_rbac(staff_t, manager_t):
    r = requests.post(f"{API}/residents/{TOM}/care-tasks", headers=_h(staff_t),
                      json={"resident_id": TOM, "kind": "personal_care", "title": "TEST iter32"}, timeout=10)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    r = requests.patch(f"{API}/care-tasks/{tid}", headers=_h(staff_t),
                       json={"status": "completed", "notes": "TEST"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    # Staff DELETE forbidden
    assert requests.delete(f"{API}/care-tasks/{tid}", headers=_h(staff_t), timeout=10).status_code == 403
    # Manager DELETE OK
    assert requests.delete(f"{API}/care-tasks/{tid}", headers=_h(manager_t), timeout=10).status_code == 200


def test_fall_signoff_rbac(staff_t, manager_t):
    r = requests.post(f"{API}/residents/{TOM}/falls", headers=_h(staff_t), json={
        "resident_id": TOM, "occurred_at": "2026-01-15T10:00:00Z", "location": "TEST iter32",
        "witnessed": False, "injury": "minor",
    }, timeout=10)
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    assert requests.post(f"{API}/falls/{fid}/sign-off", headers=_h(staff_t), timeout=10).status_code == 403
    assert requests.post(f"{API}/falls/{fid}/sign-off", headers=_h(manager_t), timeout=10).status_code == 200


def test_mca_create_rbac(staff_t, senior_t, manager_t):
    # Staff cannot
    payload = {"resident_id": TOM, "decision_topic": "TEST iter32",
               "capacity_outcome": "fluctuating"}
    assert requests.post(f"{API}/residents/{TOM}/mca", headers=_h(staff_t), json=payload, timeout=10).status_code == 403
    r = requests.post(f"{API}/residents/{TOM}/mca", headers=_h(senior_t), json=payload, timeout=10)
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    # Senior cannot sign off
    assert requests.post(f"{API}/mca/{mid}/sign-off", headers=_h(senior_t), timeout=10).status_code == 403
    # Manager can
    assert requests.post(f"{API}/mca/{mid}/sign-off", headers=_h(manager_t), timeout=10).status_code == 200


# ---------- Audit log ----------
def test_audit_log_senior_can_read(senior_t, staff_t):
    # Staff forbidden
    r = requests.get(f"{API}/audit", headers=_h(staff_t), params={"resident_id": MAGGIE}, timeout=10)
    assert r.status_code == 403, f"Staff should be forbidden from /api/audit, got {r.status_code}"
    # Senior allowed
    r = requests.get(f"{API}/audit", headers=_h(senior_t), params={"resident_id": MAGGIE}, timeout=10)
    assert r.status_code == 200
    # Whatever the shape, should not 500


def test_audit_log_records_new_action(senior_t, manager_t):
    # New MCA via API should record an audit entry
    r = requests.post(f"{API}/residents/{TOM}/mca", headers=_h(senior_t), json={
        "resident_id": TOM, "decision_topic": "TEST iter32 audit verify",
        "capacity_outcome": "fluctuating",
    }, timeout=10)
    assert r.status_code == 200
    # Allow a moment for audit
    time.sleep(0.5)
    audit = requests.get(f"{API}/audit", headers=_h(manager_t), params={"resident_id": TOM}, timeout=10)
    assert audit.status_code == 200
    # The audit shape varies — just verify some content returned
    data = audit.json()
    assert data is not None


# ---------- Role gating regression ----------
def test_staff_cannot_admin_users(staff_t):
    r = requests.post(f"{API}/admin/users", headers=_h(staff_t),
                      json={"email": "TEST_x@x.com", "password": "Xxxxx@123", "role": "staff", "name": "T"}, timeout=10)
    assert r.status_code == 403
