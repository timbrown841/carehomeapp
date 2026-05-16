"""Iteration 41b — Instant Match Simulator.

Deterministic text → structured fields extraction + live placement match analysis.
NEVER persists data. Manager+ only.
"""
import os
import io
import json
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


SAMPLE_TEXT = (
    "Re: AB, aged 14 male. Local Authority: Camden. "
    "Social worker: Sara Khan. URGENT placement needed. "
    "History of CSE concerns and grooming. High exploitation risk. "
    "Repeat missing episodes. Known associates: JM, AT. "
    "S20 voluntary accommodation."
)


# -----------------------------------------------------------------
# RBAC
# -----------------------------------------------------------------
def test_simulator_rbac_manager_plus_only(staff, senior, manager, admin):
    for hdr in (staff, senior):
        r = requests.post(f"{API}/placement-intelligence/simulate",
                          headers=hdr, data={"raw_text": SAMPLE_TEXT})
        assert r.status_code == 403
    for hdr in (manager, admin):
        r = requests.post(f"{API}/placement-intelligence/simulate",
                          headers=hdr, data={"raw_text": SAMPLE_TEXT})
        assert r.status_code == 200


def test_simulator_does_not_persist(manager):
    """Run a simulation then confirm no referral row was created."""
    before = len(requests.get(f"{API}/referrals", headers=manager).json())
    requests.post(f"{API}/placement-intelligence/simulate",
                  headers=manager, data={"raw_text": SAMPLE_TEXT})
    after = len(requests.get(f"{API}/referrals", headers=manager).json())
    assert after == before, "Simulator must never persist a referral"


# -----------------------------------------------------------------
# Extraction
# -----------------------------------------------------------------
def test_extraction_from_text(manager):
    r = requests.post(f"{API}/placement-intelligence/simulate",
                      headers=manager, data={"raw_text": SAMPLE_TEXT})
    assert r.status_code == 200
    d = r.json()
    e = d["extracted"]
    assert e["yp_initials"] == "AB"
    assert e["age"] == 14
    assert e["gender"] == "male"
    assert e["urgency_level"] == "urgent"
    assert e["legal_status"] == "S20"
    assert "cse" in e["needs"]
    assert "missing" in e["needs"]
    assert "JM" in e["known_associates"]
    assert "AT" in e["known_associates"]
    assert e["exploitation_risk"] == "high"
    assert e["absconding_risk"] == "high"
    assert e["social_worker_name"] == "Sara Khan"
    # Evidence chain present
    assert any(ev["field"] == "needs" and ev["value"] == "cse" for ev in d["extraction_evidence"])


def test_extraction_deterministic(manager):
    a = requests.post(f"{API}/placement-intelligence/simulate",
                      headers=manager, data={"raw_text": SAMPLE_TEXT}).json()
    b = requests.post(f"{API}/placement-intelligence/simulate",
                      headers=manager, data={"raw_text": SAMPLE_TEXT}).json()
    assert a["extracted"] == b["extracted"]
    assert a["analysis"]["matching_confidence"] == b["analysis"]["matching_confidence"]
    assert a["analysis"]["score"] == b["analysis"]["score"]


def test_extraction_no_text_uses_defaults(manager):
    """Missing input → still returns a valid analysis (engine still runs against home)."""
    r = requests.post(f"{API}/placement-intelligence/simulate",
                      headers=manager, data={"overrides_json": json.dumps({"yp_initials": "EMP"})})
    assert r.status_code == 200
    d = r.json()
    assert d["extracted"]["yp_initials"] == "EMP"
    assert "matching_confidence" in d["analysis"]


# -----------------------------------------------------------------
# Overrides
# -----------------------------------------------------------------
def test_overrides_take_priority(manager):
    r = requests.post(
        f"{API}/placement-intelligence/simulate",
        headers=manager,
        data={
            "raw_text": "aged 14 male, CSE concerns",
            "overrides_json": json.dumps({
                "age": 16, "yp_initials": "OVR",
                "needs": ["aggression", "gang"],
                "bed_available": False,
            }),
        },
    )
    assert r.status_code == 200
    e = r.json()["extracted"]
    assert e["age"] == 16
    assert e["yp_initials"] == "OVR"
    assert set(e["needs"]) >= {"aggression", "gang"}
    assert e["bed_available"] is False
    # Bed unavailable should push confidence away from "strong"
    assert r.json()["analysis"]["matching_confidence"] != "strong"


def test_unknown_needs_in_overrides_filtered(manager):
    r = requests.post(
        f"{API}/placement-intelligence/simulate",
        headers=manager,
        data={"overrides_json": json.dumps({"yp_initials": "F1", "needs": ["FAKE", "cse"]})},
    )
    assert r.status_code == 200
    assert "FAKE" not in r.json()["extracted"]["needs"]
    assert "cse" in r.json()["extracted"]["needs"]


# -----------------------------------------------------------------
# Output shape
# -----------------------------------------------------------------
def test_simulator_output_shape(manager):
    r = requests.post(f"{API}/placement-intelligence/simulate",
                      headers=manager, data={"raw_text": SAMPLE_TEXT})
    d = r.json()
    for k in ("is_simulation", "non_binding_notice", "extracted",
              "extraction_evidence", "raw_text_length", "source_meta", "analysis"):
        assert k in d
    assert d["is_simulation"] is True
    assert "non-binding" in d["non_binding_notice"].lower()
    for k in ("matching_confidence", "home_readiness", "group_warnings",
              "what_would_need_to_change", "score"):
        assert k in d["analysis"]


# -----------------------------------------------------------------
# File upload — txt + pdf
# -----------------------------------------------------------------
def test_simulator_accepts_txt_upload(manager):
    files = {"file": ("referral.txt", io.BytesIO(SAMPLE_TEXT.encode()), "text/plain")}
    r = requests.post(f"{API}/placement-intelligence/simulate",
                      headers=manager, files=files)
    assert r.status_code == 200
    d = r.json()
    assert d["source_meta"]["used_file"] is True
    assert d["source_meta"]["file_kind"] == "txt"
    assert d["extracted"]["yp_initials"] == "AB"


def test_simulator_rejects_unknown_file_type(manager):
    files = {"file": ("malware.exe", io.BytesIO(b"junk"), "application/octet-stream")}
    r = requests.post(f"{API}/placement-intelligence/simulate",
                      headers=manager, files=files)
    assert r.status_code == 400


def test_simulator_rejects_oversized_text(manager):
    big = "x" * (200_001)
    r = requests.post(f"{API}/placement-intelligence/simulate",
                      headers=manager, data={"raw_text": big})
    assert r.status_code == 400


def test_simulator_accepts_pdf_upload(manager):
    """Build a tiny valid PDF using reportlab so the extractor has something to chew on."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    for line in [
        "Referral — CD aged 13 female",
        "Local Authority: Hackney",
        "Social worker: Dan Brooks",
        "EMERGENCY placement required",
        "Self-harm history, CAMHS open",
        "S31 full care order",
    ]:
        c.drawString(50, 800 - 20 * c._pageNumber if hasattr(c, "_pageNumber") else 800, line)
        c.translate(0, -20)
    c.save()
    pdf_bytes = buf.getvalue()
    files = {"file": ("ref.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    r = requests.post(f"{API}/placement-intelligence/simulate",
                      headers=manager, files=files)
    assert r.status_code == 200
    d = r.json()
    assert d["source_meta"]["file_kind"] == "pdf"
    # PDF extraction should at least surface SOME content length
    assert d["raw_text_length"] > 0


# -----------------------------------------------------------------
# Save flow — simulator → formal referral
# -----------------------------------------------------------------
def test_save_simulation_as_referral(manager, admin):
    # Run sim
    sim = requests.post(f"{API}/placement-intelligence/simulate",
                        headers=manager, data={"raw_text": SAMPLE_TEXT}).json()
    extracted = sim["extracted"]
    # Save it
    payload = {
        "yp_initials": extracted.get("yp_initials") or "SIM",
        "age": extracted.get("age"),
        "gender": extracted.get("gender"),
        "urgency_level": extracted.get("urgency_level"),
        "legal_status": extracted.get("legal_status"),
        "needs": extracted.get("needs") or [],
        "known_associates": extracted.get("known_associates") or [],
        "exploitation_risk": extracted.get("exploitation_risk"),
        "absconding_risk": extracted.get("absconding_risk"),
        "social_worker_name": extracted.get("social_worker_name"),
        "reason_for_referral": extracted.get("reason_for_referral"),
    }
    r = requests.post(f"{API}/placement-intelligence/simulate/save",
                      headers=manager, json=payload)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    # Cleanup
    requests.delete(f"{API}/referrals/{rid}", headers=admin)
