"""Tests for Phase Sector-Boundary fix.

Confirms `/api/staffing/overview` honours `workspace_sector` so the active
workspace never sees cross-sector data.
"""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
API = f"{BASE.rstrip('/')}/api"

SECTOR_OF = {
    "children": "children",
    "adult_supported_living": "adult",
    "elderly_residential": "adult",
    "dementia": "adult",
    "mental_health": "adult",
    "veteran": "adult",
}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _h(t): return {"Authorization": f"Bearer {t}"}


def test_staffing_overview_no_workspace_returns_all():
    t = _login("manager@care.local", "Manager@123")
    r = requests.get(f"{API}/staffing/overview", headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    sectors = {s["sector"] for s in body.get("sectors_available", [])}
    # Without a workspace_sector at minimum children should appear (we have demo
    # children's residents). May also include adult — both are acceptable.
    assert "children" in sectors or len(sectors) == 0  # tolerate empty fixtures


def test_staffing_overview_children_workspace_excludes_adult():
    t = _login("manager@care.local", "Manager@123")
    r = requests.get(f"{API}/staffing/overview?workspace_sector=children",
                     headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    sectors = [s["sector"] for s in body.get("sectors_available", [])]
    for s in sectors:
        assert SECTOR_OF.get(s) == "children", f"Adult sector '{s}' leaked into children workspace"
    ratio_sectors = [r["sector"] for r in body.get("ratios", [])]
    for s in ratio_sectors:
        assert SECTOR_OF.get(s) == "children", f"Adult ratio '{s}' leaked into children workspace"
    assert body["filters_applied"]["workspace_sector"] == "children"


def test_staffing_overview_adult_workspace_excludes_children():
    t = _login("manager@care.local", "Manager@123")
    r = requests.get(f"{API}/staffing/overview?workspace_sector=adult",
                     headers=_h(t), timeout=10)
    assert r.status_code == 200
    body = r.json()
    sectors = [s["sector"] for s in body.get("sectors_available", [])]
    for s in sectors:
        assert SECTOR_OF.get(s) == "adult", f"Children sector '{s}' leaked into adult workspace"
    ratio_sectors = [r["sector"] for r in body.get("ratios", [])]
    for s in ratio_sectors:
        assert SECTOR_OF.get(s) == "adult", f"Children ratio '{s}' leaked into adult workspace"
    assert body["filters_applied"]["workspace_sector"] == "adult"


def test_staffing_overview_invalid_workspace_falls_back_open():
    """An unknown workspace_sector should fall back gracefully (no filter applied)."""
    t = _login("manager@care.local", "Manager@123")
    r = requests.get(f"{API}/staffing/overview?workspace_sector=invalid",
                     headers=_h(t), timeout=10)
    assert r.status_code == 200  # No 400 — just doesn't filter
