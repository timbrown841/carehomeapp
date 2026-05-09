"""Iteration 30 — Sidebar split (Children's vs Adult Services hubs)."""
import os
import requests

API = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def test_residents_sector_children_includes_legacy_null():
    """Legacy seeded children residents (service_type==None or 'children') must appear under sector=children."""
    t = _login("staff@care.local", "Staff@123")
    r = requests.get(f"{API}/residents", headers=_h(t), params={"sector": "children"})
    assert r.status_code == 200
    items = r.json()
    assert len(items) > 0, "Children sector returned 0 — legacy residents not included"
    for x in items:
        # service_type after normalisation must be 'children' or one of the children sector ids
        st = x.get("service_type")
        assert st == "children", f"Adult resident leaked into children: {x.get('name')} ({st})"


def test_residents_sector_adult_excludes_children():
    t = _login("staff@care.local", "Staff@123")
    r = requests.get(f"{API}/residents", headers=_h(t), params={"sector": "adult"})
    assert r.status_code == 200
    items = r.json()
    for x in items:
        assert x.get("service_type") in (
            "adult_supported_living", "elderly_residential", "dementia",
            "mental_health", "veteran",
        ), f"Children resident leaked into adult: {x.get('name')}"


def test_residents_sector_invalid_returns_empty_or_all():
    """Unknown sector should not 500 — backend either returns empty or normalises."""
    t = _login("staff@care.local", "Staff@123")
    r = requests.get(f"{API}/residents", headers=_h(t), params={"sector": "made_up"})
    assert r.status_code == 200


def test_no_overlap_between_sectors():
    """Every resident should appear in exactly one sector — never both."""
    t = _login("staff@care.local", "Staff@123")
    children = {x["id"] for x in requests.get(f"{API}/residents", headers=_h(t), params={"sector": "children"}).json()}
    adults = {x["id"] for x in requests.get(f"{API}/residents", headers=_h(t), params={"sector": "adult"}).json()}
    overlap = children & adults
    assert not overlap, f"Residents in both sectors: {overlap}"
    # Combined size should match total
    total = len(requests.get(f"{API}/residents", headers=_h(t)).json())
    assert len(children) + len(adults) == total, \
        f"children({len(children)}) + adult({len(adults)}) != total({total})"
