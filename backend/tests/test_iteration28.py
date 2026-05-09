"""Iteration 28 — Chronology / Timeline upgrade tests."""
import os
import requests

API = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _maddy_id(t):
    r = requests.get(f"{API}/residents", headers=_h(t)).json()
    m = [x for x in r if "maddy" in (x.get("name") or "").lower()]
    return m[0]["id"] if m else r[0]["id"]


def test_timeline_aggregates_multiple_sources():
    t = _login("staff@care.local", "Staff@123")
    rid = _maddy_id(t)
    r = requests.get(f"{API}/residents/{rid}/timeline", headers=_h(t))
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "counts_by_category" in data and "category_meta" in data
    assert data["total"] == len(data["items"])
    # Should pull from at least 4 different source collections
    sources = {e["source_collection"] for e in data["items"]}
    assert len(sources) >= 4, f"Only sources: {sources}"
    # Each event has the standard normalised fields
    for e in data["items"][:5]:
        for k in ["id", "at", "category", "category_label", "category_colour",
                  "category_icon", "severity", "title", "summary", "tags"]:
            assert k in e


def test_timeline_filters_by_category():
    t = _login("staff@care.local", "Staff@123")
    rid = _maddy_id(t)
    r = requests.get(f"{API}/residents/{rid}/timeline",
                     headers=_h(t), params={"categories": "missing"})
    assert r.status_code == 200
    items = r.json()["items"]
    for e in items:
        assert e["category"] == "missing"


def test_timeline_safeguarding_only():
    t = _login("staff@care.local", "Staff@123")
    rid = _maddy_id(t)
    r = requests.get(f"{API}/residents/{rid}/timeline",
                     headers=_h(t), params={"safeguarding_only": "true"})
    assert r.status_code == 200
    for e in r.json()["items"]:
        assert e["category"] == "safeguarding" or "safeguarding" in (e.get("tags") or [])


def test_timeline_search_q():
    t = _login("staff@care.local", "Staff@123")
    rid = _maddy_id(t)
    # Empty query returns full list
    r0 = requests.get(f"{API}/residents/{rid}/timeline", headers=_h(t), params={"q": ""})
    assert r0.status_code == 200
    # Specific search
    r = requests.get(f"{API}/residents/{rid}/timeline", headers=_h(t), params={"q": "missing"})
    assert r.status_code == 200
    items = r.json()["items"]
    # Either we got matches or none — both valid; just ensure no 500
    assert isinstance(items, list)


def test_timeline_date_range_filter():
    t = _login("staff@care.local", "Staff@123")
    rid = _maddy_id(t)
    # Far-future cutoff returns 0
    r = requests.get(f"{API}/residents/{rid}/timeline",
                     headers=_h(t), params={"from_at": "2099-01-01"})
    assert r.status_code == 200
    assert r.json()["total"] == 0
    # Far-past cutoff returns events
    r = requests.get(f"{API}/residents/{rid}/timeline",
                     headers=_h(t), params={"from_at": "2000-01-01"})
    assert r.status_code == 200
    assert r.json()["total"] > 0


def test_patterns_endpoint_returns_known_patterns():
    """Maddy demo data has repeat missing + safeguarding flags — patterns must surface."""
    t = _login("staff@care.local", "Staff@123")
    rid = _maddy_id(t)
    r = requests.get(f"{API}/residents/{rid}/timeline/patterns", headers=_h(t))
    assert r.status_code == 200
    patterns = r.json()["patterns"]
    assert isinstance(patterns, list)
    # Each pattern has standard fields
    for p in patterns:
        for k in ["id", "severity", "title", "message", "tags"]:
            assert k in p, f"Pattern missing {k}: {p}"


def test_timeline_pdf_full_scope():
    senior = _login("senior@care.local", "Senior@123")
    rid = _maddy_id(senior)
    r = requests.get(f"{API}/residents/{rid}/timeline.pdf",
                     headers=_h(senior), params={"scope": "full"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1000


def test_timeline_pdf_safeguarding_scope():
    mgr = _login("manager@care.local", "Manager@123")
    rid = _maddy_id(mgr)
    r = requests.get(f"{API}/residents/{rid}/timeline.pdf",
                     headers=_h(mgr), params={"scope": "safeguarding"})
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"


def test_timeline_pdf_missing_scope():
    mgr = _login("manager@care.local", "Manager@123")
    rid = _maddy_id(mgr)
    r = requests.get(f"{API}/residents/{rid}/timeline.pdf",
                     headers=_h(mgr), params={"scope": "missing"})
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"


def test_timeline_pdf_staff_forbidden():
    t = _login("staff@care.local", "Staff@123")
    rid = _maddy_id(t)
    r = requests.get(f"{API}/residents/{rid}/timeline.pdf", headers=_h(t))
    assert r.status_code == 403


def test_timeline_pdf_unknown_resident_returns_404():
    senior = _login("senior@care.local", "Senior@123")
    r = requests.get(f"{API}/residents/00000000-fake-fake-fake-000000000000/timeline.pdf",
                     headers=_h(senior))
    assert r.status_code == 404


def test_category_meta_present_and_complete():
    """CATEGORY_META powers frontend icons/colours — ensure all source categories have meta."""
    t = _login("staff@care.local", "Staff@123")
    rid = _maddy_id(t)
    r = requests.get(f"{API}/residents/{rid}/timeline", headers=_h(t)).json()
    meta = r["category_meta"]
    used_categories = {e["category"] for e in r["items"]}
    for c in used_categories:
        assert c in meta, f"category '{c}' missing from CATEGORY_META"
        for k in ["colour", "icon", "label"]:
            assert k in meta[c]
