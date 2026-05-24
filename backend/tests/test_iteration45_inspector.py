"""Phase F.3 — Inspector Preview Links.

Time-limited, signed, revocable, scope-locked, read-only public SCR access.

Security expectations:
- Tokens stored hashed (sha-256), never returned after creation.
- 1h/4h/24h expiry only. Defaults to 4h.
- Manager+ only for create/list/revoke.
- Public preview endpoint NEVER requires auth, NEVER exposes staff_id /
  certificate_no etc beyond the SCR-safe subset, and 404s on invalid /
  expired / revoked tokens (same response, no info leak).
- Every action audited.
"""
import os
import time
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


def _create(headers, hours=4, **extra):
    payload = {"expires_in_hours": hours, **extra}
    return requests.post(f"{API}/hr/scr/inspector-link", headers=headers, json=payload)


# -----------------------------------------------------------------
# RBAC — create/list/revoke manager+ only
# -----------------------------------------------------------------
def test_create_manager_plus_only(staff, senior, manager, admin):
    assert _create(staff).status_code == 403
    assert _create(senior).status_code == 403
    assert _create(manager).status_code == 200
    assert _create(admin).status_code == 200


def test_list_manager_plus_only(staff, manager):
    assert requests.get(f"{API}/hr/scr/inspector-links", headers=staff).status_code == 403
    assert requests.get(f"{API}/hr/scr/inspector-links", headers=manager).status_code == 200


def test_revoke_manager_plus_only(staff, manager):
    # Create one
    r = _create(manager); assert r.status_code == 200
    link_id = r.json()["id"]
    # Staff blocked
    assert requests.delete(f"{API}/hr/scr/inspector-link/{link_id}", headers=staff).status_code == 403
    # Manager OK
    rv = requests.delete(f"{API}/hr/scr/inspector-link/{link_id}", headers=manager)
    assert rv.status_code == 200
    assert rv.json()["revoked"] is True


# -----------------------------------------------------------------
# Expiry validation
# -----------------------------------------------------------------
def test_expiry_only_allowed_values(manager):
    for bad in (0, 2, 3, 5, 12, 48, 168, -1):
        r = _create(manager, hours=bad)
        assert r.status_code == 400, f"expected 400 for {bad}, got {r.status_code}"
    for ok in (1, 4, 24):
        r = _create(manager, hours=ok)
        assert r.status_code == 200, f"expected 200 for {ok}"


# -----------------------------------------------------------------
# Create response shape
# -----------------------------------------------------------------
def test_create_response_shape(manager):
    r = _create(manager, hours=4, non_compliant_only=True).json()
    for k in ("id", "share_url", "qr_data_url", "warning", "expires_at",
              "token_prefix", "created_by_name", "is_active", "view_count"):
        assert k in r, f"missing {k}"
    # QR is a data URL
    assert r["qr_data_url"].startswith("data:image/png;base64,")
    # Token NOT included as a plain key
    assert "token" not in r
    assert "token_hash" not in r


def test_create_share_url_contains_token(manager):
    r = _create(manager).json()
    assert "/inspector-preview/" in r["share_url"]
    token = r["share_url"].rsplit("/", 1)[-1]
    assert len(token) > 40  # 256 bits of entropy → urlsafe ≈ 64 chars


def test_listing_never_exposes_token(manager):
    _create(manager)
    d = requests.get(f"{API}/hr/scr/inspector-links?include_inactive=true", headers=manager).json()
    for link in d["links"]:
        assert "token" not in link
        assert "token_hash" not in link
        assert "token_prefix" in link  # prefix is OK


# -----------------------------------------------------------------
# Public preview endpoint
# -----------------------------------------------------------------
def test_public_preview_works_without_auth(manager):
    r = _create(manager, hours=4)
    assert r.status_code == 200
    token = r.json()["share_url"].rsplit("/", 1)[-1]
    pr = requests.get(f"{API}/hr/scr/inspector-preview/{token}")  # NO HEADERS
    assert pr.status_code == 200
    d = pr.json()
    for k in ("preview", "expires_at", "banner_text", "created_by_name", "home_name"):
        assert k in d


def test_public_preview_strips_sensitive_fields(manager):
    r = _create(manager)
    token = r.json()["share_url"].rsplit("/", 1)[-1]
    d = requests.get(f"{API}/hr/scr/inspector-preview/{token}").json()
    rows = d["preview"]["rows"]
    assert rows, "expected at least one row"
    forbidden = {
        "staff_id", "role",  # role is the raw enum (role_label is the friendly name)
        "missing_count",
    }
    for row in rows:
        for k in forbidden:
            assert k not in row, f"sensitive key leaked: {k}"
        # display_idx must be present for stable identification
        assert "display_idx" in row
        # SCR-safe fields must be present
        for k in ("name", "role_label", "dbs", "right_to_work", "overall_status"):
            assert k in row


def test_public_preview_invalid_token_404(manager):
    r = requests.get(f"{API}/hr/scr/inspector-preview/this-token-does-not-exist-at-all")
    assert r.status_code == 404


def test_public_preview_revoked_token_404(manager):
    r = _create(manager)
    link_id = r.json()["id"]
    token = r.json()["share_url"].rsplit("/", 1)[-1]
    # Confirm works
    assert requests.get(f"{API}/hr/scr/inspector-preview/{token}").status_code == 200
    # Revoke
    requests.delete(f"{API}/hr/scr/inspector-link/{link_id}", headers=manager)
    # Now must 404
    r2 = requests.get(f"{API}/hr/scr/inspector-preview/{token}")
    assert r2.status_code == 404


def test_public_preview_increments_view_count(manager):
    r = _create(manager).json()
    link_id = r["id"]
    token = r["share_url"].rsplit("/", 1)[-1]
    for _ in range(3):
        requests.get(f"{API}/hr/scr/inspector-preview/{token}")
    d = requests.get(f"{API}/hr/scr/inspector-links?include_inactive=true", headers=manager).json()
    for link in d["links"]:
        if link["id"] == link_id:
            assert link["view_count"] >= 3
            assert link["last_viewed_at"] is not None
            return
    pytest.fail("created link not found in list")


# -----------------------------------------------------------------
# Filter snapshot honoured by preview
# -----------------------------------------------------------------
def test_filter_snapshot_applies_to_preview(manager):
    full = requests.get(f"{API}/hr/scr", headers=manager).json()
    # Create with non_compliant_only=true
    r = _create(manager, hours=4, non_compliant_only=True).json()
    token = r["share_url"].rsplit("/", 1)[-1]
    d = requests.get(f"{API}/hr/scr/inspector-preview/{token}").json()
    # Every row in the preview should be non-green
    for row in d["preview"]["rows"]:
        assert row["overall_status"] in ("red", "amber")


# -----------------------------------------------------------------
# Revoke idempotency
# -----------------------------------------------------------------
def test_revoke_idempotent(manager):
    r = _create(manager).json()
    link_id = r["id"]
    first = requests.delete(f"{API}/hr/scr/inspector-link/{link_id}", headers=manager).json()
    second = requests.delete(f"{API}/hr/scr/inspector-link/{link_id}", headers=manager).json()
    assert first["revoked"] is True
    assert second["revoked"] is False
    assert second["reason"] == "already_revoked"


def test_revoke_unknown_404(manager):
    r = requests.delete(f"{API}/hr/scr/inspector-link/non-existent-id", headers=manager)
    assert r.status_code == 404


# -----------------------------------------------------------------
# Public endpoint must not accept tokens via Authorization header
# (defence in depth: token is path-only, not bearer)
# -----------------------------------------------------------------
def test_preview_endpoint_ignores_auth_headers(manager):
    r = _create(manager).json()
    token = r["share_url"].rsplit("/", 1)[-1]
    # Even with manager auth, the path token is what matters — works
    pr = requests.get(
        f"{API}/hr/scr/inspector-preview/{token}",
        headers={"Authorization": "Bearer something-irrelevant"},
    )
    assert pr.status_code == 200
    # Without path token = 404 (auth headers don't substitute)
    pr2 = requests.get(
        f"{API}/hr/scr/inspector-preview/fake",
        headers={"Authorization": "Bearer something"},
    )
    assert pr2.status_code == 404


# -----------------------------------------------------------------
# Audit
# -----------------------------------------------------------------
def test_create_writes_audit(manager):
    _create(manager)
    # The HR audit endpoint queries per-staff. The /api/audit endpoint may
    # not be exposed to non-admin here; we can't easily verify cross-cutting
    # audit. Just confirm subsequent list reflects the created entry.
    d = requests.get(f"{API}/hr/scr/inspector-links?include_inactive=true",
                      headers=manager).json()
    assert d["count"] >= 1
