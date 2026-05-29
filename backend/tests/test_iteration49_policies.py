"""Tests for Phase H — Induction & Policy Management.

Covers:
- Category seeding (children's 21 + adult 16)
- Folder aggregation
- Policy CRUD + versioning (with archive of previous version)
- Question setting
- Assignment workflow: assign → open → assessment → staff-sign → manager-sign → complete
- RBAC: staff cannot create policies, cannot manager-sign
- Auto-grading: MCQ passes 80% threshold
- Dashboard reflects state
- Evidence PDF returns application/pdf
- Default induction packs auto-seeded
- Enrollment creates assignments per matching category
"""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
API = f"{BASE.rstrip('/')}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _h(t): return {"Authorization": f"Bearer {t}"}


MTOKEN = None
STOKEN = None


def _mtoken():
    global MTOKEN
    if not MTOKEN:
        MTOKEN = _login("manager@care.local", "Manager@123")
    return MTOKEN


def _stoken():
    global STOKEN
    if not STOKEN:
        STOKEN = _login("staff@care.local", "Staff@123")
    return STOKEN


def test_categories_seeded():
    r = requests.get(f"{API}/policy-categories?sector=children", headers=_h(_mtoken()), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 21
    names = [c["name"] for c in body["categories"]]
    assert "Safeguarding" in names
    assert "Statement of Purpose" in names

    r2 = requests.get(f"{API}/policy-categories?sector=adult", headers=_h(_mtoken()), timeout=10)
    assert r2.json()["count"] >= 16
    assert "MCA" in [c["name"] for c in r2.json()["categories"]]


def test_folders_with_aggregates():
    r = requests.get(f"{API}/policies/folders?sector=children", headers=_h(_mtoken()), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 21
    sample = body["folders"][0]
    for k in ("category", "sector", "count", "rag_status"):
        assert k in sample


def test_default_induction_packs_seeded():
    r = requests.get(f"{API}/induction-packs?sector=children", headers=_h(_mtoken()), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    pack = body["packs"][0]
    assert pack["is_default"] is True
    assert len(pack["weeks"]) == 4

    r2 = requests.get(f"{API}/induction-packs?sector=adult", headers=_h(_mtoken()), timeout=10)
    assert r2.json()["count"] >= 1


def test_staff_cannot_create_policy():
    r = requests.post(f"{API}/policies", headers=_h(_stoken()), json={
        "title": "Test", "category": "Safeguarding", "sector": "children",
    }, timeout=10)
    assert r.status_code == 403


def test_full_policy_lifecycle():
    """Create policy → add version → set questions → assign → open → submit assessment → staff-sign → manager-sign → dashboard reflects."""
    # 1. Create
    r = requests.post(f"{API}/policies", headers=_h(_mtoken()), json={
        "title": "Lifecycle Test Policy",
        "category": "Health & Safety",
        "sector": "children",
        "summary": "End-to-end test",
        "review_date": "2027-01-01T00:00:00+00:00",
    }, timeout=10)
    assert r.status_code == 200
    policy = r.json()
    pid = policy["id"]

    # 2. Add version
    r = requests.post(f"{API}/policies/{pid}/versions", headers=_h(_mtoken()), json={
        "version": "1.0", "change_summary": "Initial",
    }, timeout=10)
    assert r.status_code == 200

    # 3. Set questions (MCQ + reflection)
    r = requests.post(f"{API}/policies/{pid}/questions", headers=_h(_mtoken()), json={
        "questions": [
            {"type": "mcq", "question": "Q1?", "options": ["a", "b", "c"], "correct_index": 1, "order": 0},
            {"type": "mcq", "question": "Q2?", "options": ["x", "y"], "correct_index": 0, "order": 1},
            {"type": "reflection", "question": "Reflect on this.", "order": 2},
        ],
    }, timeout=10)
    assert r.json()["count"] == 3

    # 4. Get staff id
    me = requests.get(f"{API}/auth/me", headers=_h(_stoken()), timeout=10).json()
    staff_id = me["id"]

    # 5. Assign
    r = requests.post(f"{API}/policy-assignments", headers=_h(_mtoken()), json={
        "policy_id": pid, "staff_id": staff_id,
    }, timeout=10)
    assert r.status_code == 200
    a = r.json()
    aid = a["id"]
    assert a["status"] == "assigned"

    # 6. Open (staff)
    r = requests.post(f"{API}/policy-assignments/{aid}/open", headers=_h(_stoken()), timeout=10)
    assert r.json()["status"] == "in_progress"

    # 7. Get assignment as staff — verify correct_index is HIDDEN
    r = requests.get(f"{API}/policy-assignments/{aid}", headers=_h(_stoken()), timeout=10)
    a_full = r.json()
    qids = [q["id"] for q in a_full["questions"]]
    for q in a_full["questions"]:
        if q["type"] == "mcq":
            assert "correct_index" not in q  # hidden from staff

    # 8. Submit assessment — both MCQs correct + reflection text
    r = requests.post(f"{API}/policy-assignments/{aid}/assessment", headers=_h(_stoken()), json={
        "answers": [
            {"question_id": qids[0], "selected_index": 1},
            {"question_id": qids[1], "selected_index": 0},
            {"question_id": qids[2], "answer_text": "Reflection!"},
        ],
    }, timeout=10)
    assert r.status_code == 200
    res = r.json()["result"]
    assert res["passed"] is True
    assert res["score_pct"] == 100.0

    # 9. Staff sign
    r = requests.post(f"{API}/policy-assignments/{aid}/staff-sign", headers=_h(_stoken()),
                      json={"name": "Sam Staff", "signature": "Sam"}, timeout=10)
    assert r.status_code == 200

    # 10. Manager cannot let staff manager-sign (staff is tier 1)
    r = requests.post(f"{API}/policy-assignments/{aid}/manager-sign", headers=_h(_stoken()),
                      json={"name": "Sam Staff", "signature": "Sam"}, timeout=10)
    assert r.status_code == 403

    # 11. Manager sign
    r = requests.post(f"{API}/policy-assignments/{aid}/manager-sign", headers=_h(_mtoken()),
                      json={"name": "Sarah Manager", "signature": "SM"}, timeout=10)
    assert r.status_code == 200

    # 12. Verify complete
    r = requests.get(f"{API}/policy-assignments/{aid}", headers=_h(_mtoken()), timeout=10).json()
    assert r["status"] == "complete"
    assert r["manager_sig_at"] is not None
    assert r["staff_sig_at"] is not None
    assert r["assessment_score"] == 100.0


def test_assessment_fail_blocks_signature():
    """Failing the assessment must prevent staff from signing."""
    pid = requests.post(f"{API}/policies", headers=_h(_mtoken()), json={
        "title": "Fail-test policy", "category": "Fire Safety", "sector": "children",
    }, timeout=10).json()["id"]
    requests.post(f"{API}/policies/{pid}/versions", headers=_h(_mtoken()),
                  json={"version": "1.0"}, timeout=10)
    requests.post(f"{API}/policies/{pid}/questions", headers=_h(_mtoken()), json={
        "questions": [
            {"type": "mcq", "question": "Q1?", "options": ["a", "b"], "correct_index": 0, "order": 0},
            {"type": "mcq", "question": "Q2?", "options": ["a", "b"], "correct_index": 0, "order": 1},
        ],
    }, timeout=10)
    me = requests.get(f"{API}/auth/me", headers=_h(_stoken()), timeout=10).json()
    aid = requests.post(f"{API}/policy-assignments", headers=_h(_mtoken()), json={
        "policy_id": pid, "staff_id": me["id"],
    }, timeout=10).json()["id"]
    requests.post(f"{API}/policy-assignments/{aid}/open", headers=_h(_stoken()), timeout=10)
    a_full = requests.get(f"{API}/policy-assignments/{aid}", headers=_h(_stoken()), timeout=10).json()
    qids = [q["id"] for q in a_full["questions"]]
    # Submit BOTH wrong → 0%
    r = requests.post(f"{API}/policy-assignments/{aid}/assessment", headers=_h(_stoken()), json={
        "answers": [
            {"question_id": qids[0], "selected_index": 1},
            {"question_id": qids[1], "selected_index": 1},
        ],
    }, timeout=10)
    assert r.json()["result"]["passed"] is False
    # Now try to sign — should 400
    sign = requests.post(f"{API}/policy-assignments/{aid}/staff-sign", headers=_h(_stoken()),
                        json={"name": "Sam", "signature": "Sam"}, timeout=10)
    assert sign.status_code == 400


def test_dashboard_endpoint():
    r = requests.get(f"{API}/policy-compliance/dashboard?sector=children", headers=_h(_mtoken()), timeout=10)
    assert r.status_code == 200
    body = r.json()
    for k in ("total_assignments", "complete", "completion_pct",
              "overdue", "awaiting_manager_sign_off", "failed_assessments",
              "in_induction", "rag_status"):
        assert k in body


def test_staff_cannot_view_dashboard():
    r = requests.get(f"{API}/policy-compliance/dashboard", headers=_h(_stoken()), timeout=10)
    assert r.status_code == 403


def test_evidence_pdf():
    me = requests.get(f"{API}/auth/me", headers=_h(_stoken()), timeout=10).json()
    r = requests.get(f"{API}/policy-compliance/evidence.pdf?staff_id={me['id']}",
                     headers=_h(_mtoken()), timeout=15)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-"
    assert len(r.content) > 1000


def test_version_supersedes_previous():
    pid = requests.post(f"{API}/policies", headers=_h(_mtoken()), json={
        "title": "Versioning test", "category": "Medication", "sector": "children",
    }, timeout=10).json()["id"]
    v1 = requests.post(f"{API}/policies/{pid}/versions", headers=_h(_mtoken()),
                       json={"version": "1.0"}, timeout=10).json()
    v2 = requests.post(f"{API}/policies/{pid}/versions", headers=_h(_mtoken()),
                       json={"version": "2.0", "change_summary": "Updated"}, timeout=10).json()
    # Fetch policy: current_version_id should be v2
    p = requests.get(f"{API}/policies/{pid}", headers=_h(_mtoken()), timeout=10).json()
    assert p["current_version_id"] == v2["id"]
    # And v1 has archived_at set
    versions = requests.get(f"{API}/policies/{pid}/versions",
                            headers=_h(_mtoken()), timeout=10).json()["versions"]
    v1_doc = next(v for v in versions if v["id"] == v1["id"])
    assert v1_doc["archived_at"] is not None


def test_enrollment_creates_assignments_for_matching_categories():
    """When enrolled, every category in the pack that has an active policy
    auto-creates an assignment."""
    # Ensure at least one active policy for Safeguarding (children's)
    pid = requests.post(f"{API}/policies", headers=_h(_mtoken()), json={
        "title": "Safeguarding (enrolment test)", "category": "Safeguarding", "sector": "children",
    }, timeout=10).json()["id"]
    requests.post(f"{API}/policies/{pid}/versions", headers=_h(_mtoken()),
                  json={"version": "1.0"}, timeout=10)
    # Use senior account (so it doesn't conflict with staff)
    sen_t = _login("senior@care.local", "Senior@123")
    sen_id = requests.get(f"{API}/auth/me", headers=_h(sen_t), timeout=10).json()["id"]
    pack = requests.get(f"{API}/induction-packs?sector=children",
                        headers=_h(_mtoken()), timeout=10).json()["packs"][0]
    e = requests.post(f"{API}/induction-enrollments", headers=_h(_mtoken()),
                      json={"pack_id": pack["id"], "staff_id": sen_id}, timeout=15)
    assert e.status_code == 200
    body = e.json()
    assert body["pack_name"] == pack["name"]
    # Walk through weeks: at least one assignment should reference our Safeguarding policy
    found = False
    for w in body["weeks"]:
        for entry in w["assignments"]:
            if entry.get("category") == "Safeguarding" and entry.get("assignment_id"):
                found = True
                break
    assert found
