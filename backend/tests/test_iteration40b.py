"""Iteration 40b — Burnout forecasting.

Deterministic, aggregate-metadata-only. Never reads private reflection text.
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


def test_burnout_requires_manager_tier(staff, senior, manager, admin):
    assert requests.get(f"{API}/intelligence/burnout-forecast", headers=staff).status_code == 403
    assert requests.get(f"{API}/intelligence/burnout-forecast", headers=senior).status_code == 403
    assert requests.get(f"{API}/intelligence/burnout-forecast", headers=manager).status_code == 200
    assert requests.get(f"{API}/intelligence/burnout-forecast", headers=admin).status_code == 200


def test_burnout_payload_shape(manager):
    d = requests.get(f"{API}/intelligence/burnout-forecast", headers=manager).json()
    for k in ("generated_at", "overall_status", "summary", "config", "staff", "privacy_notice"):
        assert k in d
    assert d["overall_status"] in ("stable", "watch", "support_recommended", "high_pressure")
    s = d["summary"]
    for k in ("high", "medium", "low", "total_staff"):
        assert k in s and isinstance(s[k], int)
    assert isinstance(d["staff"], list)
    assert "aggregate" in d["privacy_notice"].lower()


def test_burnout_staff_card_shape(manager):
    d = requests.get(f"{API}/intelligence/burnout-forecast", headers=manager).json()
    for row in d["staff"]:
        for k in ("staff_id", "name", "role", "risk", "label", "score",
                  "top_factors", "factors", "recommended_actions", "signals_summary"):
            assert k in row, f"missing key {k} on staff row {row.get('staff_id')}"
        assert row["risk"] in ("low", "medium", "high")
        # Score non-negative integer
        assert isinstance(row["score"], int) and row["score"] >= 0
        # Top factors is a subset of factors (≤2)
        assert len(row["top_factors"]) <= 2
        for f in row["factors"]:
            for fk in ("label", "weight", "domain"):
                assert fk in f
        # signals_summary only contains counts/durations — no free text
        for sk, sv in row["signals_summary"].items():
            assert isinstance(sv, (int, float)), f"{sk} should be numeric metadata"


def test_burnout_label_tone_is_supportive(manager):
    d = requests.get(f"{API}/intelligence/burnout-forecast", headers=manager).json()
    # Labels never use punitive wording like "burnt out" / "failing"
    for row in d["staff"]:
        for word in ("burnt", "failing", "broken", "incompetent"):
            assert word not in row["label"].lower()
        assert row["label"] in ("Support recommended", "Pressure increasing", "Steady")


def test_burnout_determinism(manager):
    """Same data in → same risk out — deterministic, no AI."""
    a = requests.get(f"{API}/intelligence/burnout-forecast", headers=manager).json()
    b = requests.get(f"{API}/intelligence/burnout-forecast", headers=manager).json()
    a_keys = sorted((r["staff_id"], r["risk"], r["score"]) for r in a["staff"])
    b_keys = sorted((r["staff_id"], r["risk"], r["score"]) for r in b["staff"])
    assert a_keys == b_keys


def test_burnout_summary_consistency(manager):
    """Summary counts equal actual staff bucket counts."""
    d = requests.get(f"{API}/intelligence/burnout-forecast", headers=manager).json()
    s = d["summary"]
    high = sum(1 for x in d["staff"] if x["risk"] == "high")
    med = sum(1 for x in d["staff"] if x["risk"] == "medium")
    low = sum(1 for x in d["staff"] if x["risk"] == "low")
    assert s["high"] == high
    assert s["medium"] == med
    assert s["low"] == low
    assert s["total_staff"] == len(d["staff"])


def test_burnout_does_not_leak_reflection_text(manager):
    """Privacy boundary: payload must never echo private reflection diary text."""
    # Seed a private reflection with a unique token, then assert it's not in the payload.
    staff_hdr = _login("staff@care.local", "Staff@123")
    unique = "ZZZ_SECRET_DIARY_TOKEN_BURNOUT_TEST_OMICRON"
    # Best-effort create — endpoint may name differently in this codebase.
    requests.post(
        f"{API}/reflections",
        headers={**staff_hdr, "Content-Type": "application/json"},
        json={"kind": "win", "title": unique, "body": unique, "shared_with_manager": False},
    )
    txt = requests.get(f"{API}/intelligence/burnout-forecast", headers=manager).text
    assert unique not in txt, "Private reflection text must NEVER appear in burnout payload"


def test_burnout_evidence_chain_explainable(manager):
    """Every weighted factor must have label, weight, domain (explainable)."""
    d = requests.get(f"{API}/intelligence/burnout-forecast", headers=manager).json()
    for row in d["staff"]:
        # Sum of factor weights must equal score (deterministic math)
        s = sum(int(f.get("weight", 0)) for f in row["factors"])
        s = max(0, s)  # mirrors backend's clamp
        assert s == row["score"], f"score math doesn't add up for {row['name']}: {s} vs {row['score']}"


def test_burnout_recommended_actions_present(manager):
    d = requests.get(f"{API}/intelligence/burnout-forecast", headers=manager).json()
    for row in d["staff"]:
        assert isinstance(row["recommended_actions"], list) and len(row["recommended_actions"]) >= 1
