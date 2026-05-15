"""Inspection Simulation + Pre-Inspection Scan PDF + Reg 44 Auto-draft (Iteration 36)."""
import os
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


def test_simulation_requires_senior(staff, senior):
    assert requests.get(f"{API}/ofsted/inspection-simulation", headers=staff).status_code == 403
    assert requests.get(f"{API}/ofsted/inspection-simulation", headers=senior).status_code == 200


def test_simulation_payload_shape(manager):
    d = requests.get(f"{API}/ofsted/inspection-simulation", headers=manager).json()
    assert d["scope"] == "children"
    assert 0 <= d["overall_score"] <= 100
    assert d["predicted_rating"]["key"] in ("outstanding", "good", "requires_improvement", "inadequate")
    # 9 quality standards
    assert len(d["quality_standards_judgement"]) == 9
    for q in d["quality_standards_judgement"]:
        assert q["judgement"] in ("Outstanding", "Good", "Requires improvement", "Inadequate")
    # Lists present and bounded
    assert isinstance(d["likely_strengths"], list) and len(d["likely_strengths"]) <= 8
    assert isinstance(d["likely_weaknesses"], list) and len(d["likely_weaknesses"]) <= 8
    assert isinstance(d["likely_inspection_concerns"], list) and len(d["likely_inspection_concerns"]) <= 10
    assert isinstance(d["recommendations"], list) and len(d["recommendations"]) <= 8
    # Each weakness carries evidence and regulation refs from the module
    for w in d["likely_weaknesses"]:
        assert "title" in w and "evidence" in w
    # Each concern carries a probe question
    for c in d["likely_inspection_concerns"]:
        assert c.get("probe") and len(c["probe"]) > 5


def test_simulation_is_deterministic(manager):
    """Same data in → same findings out — call twice and compare keys."""
    a = requests.get(f"{API}/ofsted/inspection-simulation", headers=manager).json()
    b = requests.get(f"{API}/ofsted/inspection-simulation", headers=manager).json()
    assert a["overall_score"] == b["overall_score"]
    assert a["predicted_rating"]["key"] == b["predicted_rating"]["key"]
    assert [s["title"] for s in a["likely_strengths"]] == [s["title"] for s in b["likely_strengths"]]
    assert [c["title"] for c in a["likely_inspection_concerns"]] == [c["title"] for c in b["likely_inspection_concerns"]]


def test_auto_draft_pre_fills_fields(manager):
    d = requests.get(f"{API}/ofsted/regulation-44/auto-draft", headers=manager).json()
    assert d["visit_date"]
    assert d["overall_judgement"] in ("outstanding", "good", "requires_improvement", "inadequate")
    # At least one of these must be non-empty given the current operational state
    assert any(d[k] for k in ("strengths", "areas_for_development", "recommendations", "immediate_concerns"))
    # Data signature for traceability
    assert d["data_signature"]["module_count"] >= 30


def test_auto_draft_requires_senior(staff, senior):
    assert requests.get(f"{API}/ofsted/regulation-44/auto-draft", headers=staff).status_code == 403
    assert requests.get(f"{API}/ofsted/regulation-44/auto-draft", headers=senior).status_code == 200


def test_pre_inspection_pdf_manager_only(senior, manager):
    bad = requests.get(f"{API}/ofsted/pre-inspection-scan.pdf", headers=senior)
    assert bad.status_code == 403
    ok = requests.get(f"{API}/ofsted/pre-inspection-scan.pdf", headers=manager)
    assert ok.status_code == 200
    assert ok.headers.get("content-type", "").startswith("application/pdf")
    assert ok.content[:4] == b"%PDF"
    assert len(ok.content) > 2000


def test_simulation_quality_standards_have_module_attribution(manager):
    """Each QS row should report the module_count contributing to its score."""
    d = requests.get(f"{API}/ofsted/inspection-simulation", headers=manager).json()
    for q in d["quality_standards_judgement"]:
        assert "module_count" in q
        # QS7 (Protection of children) and QS8 (Leadership) must have evidence in our seed
        if q["key"] in ("QS7", "QS8"):
            assert q["module_count"] >= 1


def test_unauth_endpoints():
    for p in ("/ofsted/inspection-simulation", "/ofsted/regulation-44/auto-draft"):
        assert requests.get(f"{API}{p}").status_code == 401
    assert requests.get(f"{API}/ofsted/pre-inspection-scan.pdf").status_code == 401
