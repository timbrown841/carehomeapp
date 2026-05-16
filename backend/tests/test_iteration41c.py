"""Iteration 41c — Recent Simulations log (placement decision audit history).

Strict privacy boundary: lightweight audit metadata only. The simulator MUST
NEVER persist referral narrative, uploaded document content, or sensitive
extracted free-text content into the simulation log.
"""
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
@pytest.fixture(scope="module")
def admin(): return _login("admin@care.local", "Admin@123")


UNIQUE_NARRATIVE_TOKEN = "ZZZ_SECRET_NARRATIVE_TOKEN_OMICRON_41C"
SAMPLE = (
    f"Re: AB, aged 14 male. Local Authority: Camden. "
    f"Social worker: Sara Khan. URGENT placement needed. "
    f"History of CSE concerns and grooming. High exploitation risk. "
    f"Repeat missing episodes. Known associates: JM, AT. "
    f"S20 voluntary accommodation. {UNIQUE_NARRATIVE_TOKEN}"
)


# -----------------------------------------------------------------
# RBAC
# -----------------------------------------------------------------
def test_simulations_list_manager_plus_only(staff, senior, manager, admin):
    assert requests.get(f"{API}/placement-intelligence/simulations", headers=staff).status_code == 403
    assert requests.get(f"{API}/placement-intelligence/simulations", headers=senior).status_code == 403
    assert requests.get(f"{API}/placement-intelligence/simulations", headers=manager).status_code == 200
    assert requests.get(f"{API}/placement-intelligence/simulations", headers=admin).status_code == 200


def test_simulations_delete_admin_only(manager, admin):
    sim_id = requests.post(
        f"{API}/placement-intelligence/simulate", headers=manager,
        data={"raw_text": "Test placement for XX"},
    ).json()["simulation_id"]
    assert requests.delete(f"{API}/placement-intelligence/simulations/{sim_id}", headers=manager).status_code == 403
    assert requests.delete(f"{API}/placement-intelligence/simulations/{sim_id}", headers=admin).status_code == 200


# -----------------------------------------------------------------
# Simulation log writes
# -----------------------------------------------------------------
def test_simulation_run_returns_simulation_id(manager):
    d = requests.post(f"{API}/placement-intelligence/simulate", headers=manager,
                      data={"raw_text": SAMPLE}).json()
    assert "simulation_id" in d and len(d["simulation_id"]) > 8


def test_simulation_appears_in_log(manager):
    sim_id = requests.post(f"{API}/placement-intelligence/simulate", headers=manager,
                            data={"raw_text": SAMPLE}).json()["simulation_id"]
    items = requests.get(f"{API}/placement-intelligence/simulations?limit=20", headers=manager).json()["items"]
    found = next((i for i in items if i["id"] == sim_id), None)
    assert found is not None
    assert found["yp_initials"] == "AB"
    assert found["status"] == "under_review"
    assert found["source"] == "paste"
    assert found["risk_band"] in ("low", "medium", "high", "critical")
    assert found["matching_confidence"] in ("strong", "manageable", "elevated", "not_recommended")


# -----------------------------------------------------------------
# Privacy boundary — this is the critical one
# -----------------------------------------------------------------
def test_simulation_log_never_stores_narrative(manager):
    """The unique token from the referral text MUST NOT appear in the log payload."""
    requests.post(f"{API}/placement-intelligence/simulate", headers=manager,
                  data={"raw_text": SAMPLE})
    txt = requests.get(f"{API}/placement-intelligence/simulations?limit=50", headers=manager).text
    assert UNIQUE_NARRATIVE_TOKEN not in txt, "Narrative content must NEVER appear in simulation log"


def test_simulation_log_fields_are_metadata_only(manager):
    """Log items must NOT contain raw_text, needs, known_associates, reason etc."""
    items = requests.get(f"{API}/placement-intelligence/simulations?limit=20", headers=manager).json()["items"]
    assert items, "expected at least one simulation row by now"
    forbidden = {"raw_text", "needs", "known_associates", "reason_for_referral",
                 "social_worker_name", "social_worker_contact", "extracted",
                 "file_name", "police_involvement_history", "safeguarding_history"}
    for row in items:
        leak = forbidden & set(row.keys())
        assert not leak, f"Forbidden keys present: {leak}"


def test_simulation_log_privacy_notice_present(manager):
    d = requests.get(f"{API}/placement-intelligence/simulations", headers=manager).json()
    assert "privacy_notice" in d
    assert "metadata only" in d["privacy_notice"].lower()


# -----------------------------------------------------------------
# Status updates
# -----------------------------------------------------------------
def test_patch_status_and_note(manager):
    sim_id = requests.post(f"{API}/placement-intelligence/simulate", headers=manager,
                            data={"raw_text": "CD aged 12"}).json()["simulation_id"]
    r = requests.patch(
        f"{API}/placement-intelligence/simulations/{sim_id}",
        headers=manager,
        json={"status": "more_info_requested", "manager_note": "Awaiting CAMHS summary"},
    )
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "more_info_requested"
    assert d["manager_note"] == "Awaiting CAMHS summary"
    assert d.get("updated_by_id")


def test_patch_invalid_status_rejected(manager):
    sim_id = requests.post(f"{API}/placement-intelligence/simulate", headers=manager,
                            data={"raw_text": "EF aged 15"}).json()["simulation_id"]
    r = requests.patch(f"{API}/placement-intelligence/simulations/{sim_id}",
                       headers=manager, json={"status": "deleted"})
    assert r.status_code == 400


def test_patch_unknown_id_404(manager):
    r = requests.patch(f"{API}/placement-intelligence/simulations/does-not-exist",
                       headers=manager, json={"status": "under_review"})
    assert r.status_code == 404


def test_note_truncated_at_400_chars(manager):
    sim_id = requests.post(f"{API}/placement-intelligence/simulate", headers=manager,
                            data={"raw_text": "GH aged 13"}).json()["simulation_id"]
    r = requests.patch(f"{API}/placement-intelligence/simulations/{sim_id}",
                       headers=manager, json={"manager_note": "X" * 500})
    # Pydantic should reject (max_length=400)
    assert r.status_code in (400, 422)


# -----------------------------------------------------------------
# Convert flow
# -----------------------------------------------------------------
def test_convert_marks_simulation_as_converted(manager, admin):
    sim_id = requests.post(f"{API}/placement-intelligence/simulate", headers=manager,
                            data={"raw_text": "Sample IJ aged 14 male"}).json()["simulation_id"]
    # Save as formal referral with simulation_id linked
    r = requests.post(
        f"{API}/placement-intelligence/simulate/save?simulation_id={sim_id}",
        headers=manager,
        json={"yp_initials": "IJ", "age": 14, "needs": ["trauma"]},
    )
    assert r.status_code == 200
    referral_id = r.json()["id"]

    items = requests.get(f"{API}/placement-intelligence/simulations?limit=50", headers=manager).json()["items"]
    sim = next((i for i in items if i["id"] == sim_id), None)
    assert sim is not None
    assert sim["status"] == "converted"
    assert sim["converted_referral_id"] == referral_id

    # cleanup
    requests.delete(f"{API}/referrals/{referral_id}", headers=admin)


def test_save_without_simulation_id_works(manager, admin):
    """Saving with no simulation_id should still create a formal referral (backward compat)."""
    r = requests.post(
        f"{API}/placement-intelligence/simulate/save",
        headers=manager,
        json={"yp_initials": "NOSIM", "age": 14},
    )
    assert r.status_code == 200
    ref_id = r.json()["id"]
    requests.delete(f"{API}/referrals/{ref_id}", headers=admin)


# -----------------------------------------------------------------
# Limit and ordering
# -----------------------------------------------------------------
def test_list_respects_limit_and_order_desc(manager):
    d = requests.get(f"{API}/placement-intelligence/simulations?limit=3", headers=manager).json()
    items = d["items"]
    assert len(items) <= 3
    # Should be ran_at descending
    for a, b in zip(items, items[1:]):
        assert a["ran_at"] >= b["ran_at"]
