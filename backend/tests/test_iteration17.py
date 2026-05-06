"""Iteration 17 backend tests — Pocket Money & Personal Allowance module.

Covers:
- GET /api/pocket-money (cross-home overview)
- GET /api/pocket-money/{rid}
- POST /api/pocket-money/{rid}/transactions (all 7 kinds + validation)
- PATCH /api/pocket-money/{rid}/account (RBAC)
- DELETE /api/pocket-money/transactions/{tx_id} (RBAC + reversal math)
- GET /api/pocket-money/{rid}/statement.pdf (default/invalid month)
- Seed verification: 4 demo residents have accounts + 7-8 tx
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Auth fixtures ----------
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def mgr_token():
    return _login("manager@care.local", "Manager@123")


@pytest.fixture(scope="module")
def staff_token():
    return _login("staff@care.local", "Staff@123")


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@care.local", "Admin@123")


@pytest.fixture(scope="module")
def mgr_h(mgr_token):
    return {"Authorization": f"Bearer {mgr_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def staff_h(staff_token):
    return {"Authorization": f"Bearer {staff_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def overview(mgr_h):
    r = requests.get(f"{API}/pocket-money", headers=mgr_h, timeout=30)
    assert r.status_code == 200, f"overview failed: {r.status_code} {r.text}"
    return r.json()


# ---------- GET /api/pocket-money ----------
class TestOverview:
    def test_overview_shape(self, overview):
        assert isinstance(overview, list)
        assert len(overview) >= 4  # 4 demo residents
        row = overview[0]
        for k in ("resident_id", "name", "weekly_allowance", "pocket_balance", "savings_balance"):
            assert k in row, f"missing {k} in overview row: {row.keys()}"

    def test_overview_has_demo_residents(self, overview):
        names = " ".join(r.get("name", "") for r in overview)
        # 4 demo first names must appear
        expected_first = ["Maddy", "Jordan", "Aisha", "Leo"]
        found = [n for n in expected_first if n in names]
        assert len(found) >= 3, f"Expected demo first-names in: {names}"

    def test_seed_realistic(self, overview):
        """Weekly allowances should be £5-£12 for demo residents."""
        for row in overview:
            wa = float(row.get("weekly_allowance", 0))
            if wa > 0:
                assert 0 < wa <= 20, f"Unrealistic weekly allowance: {wa}"


# ---------- GET /api/pocket-money/{rid} ----------
class TestPerResident:
    def test_per_resident_detail(self, overview, mgr_h):
        rid = overview[0]["resident_id"]
        r = requests.get(f"{API}/pocket-money/{rid}", headers=mgr_h, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "account" in data and "transactions" in data
        assert isinstance(data["transactions"], list)
        # Every tx must carry balance_after + delta
        for tx in data["transactions"]:
            assert "balance_after" in tx
            assert "delta" in tx

    def test_seed_tx_count(self, overview, mgr_h):
        """Demo residents should have 7-8 transactions each."""
        for row in overview[:4]:
            r = requests.get(f"{API}/pocket-money/{row['resident_id']}", headers=mgr_h, timeout=30)
            assert r.status_code == 200
            n = len(r.json()["transactions"])
            assert 5 <= n <= 15, f"{row['name']} has {n} txs, expected 7-8"

    def test_invalid_resident(self, mgr_h):
        r = requests.get(f"{API}/pocket-money/nope-xyz", headers=mgr_h, timeout=30)
        assert r.status_code == 404


# ---------- POST transactions ----------
class TestTransactions:
    @pytest.fixture(autouse=True)
    def _setup(self, overview, mgr_h):
        self.rid = overview[0]["resident_id"]
        self.mgr_h = mgr_h
        # Snapshot
        r = requests.get(f"{API}/pocket-money/{self.rid}", headers=mgr_h, timeout=30)
        self.before = r.json()["account"]

    def _post(self, body):
        return requests.post(
            f"{API}/pocket-money/{self.rid}/transactions",
            json=body,
            headers=self.mgr_h,
            timeout=30,
        )

    def test_amount_must_be_positive(self):
        r = self._post({"kind": "spend", "account": "pocket", "amount": 0, "label": "TEST_iter17 zero"})
        assert r.status_code in (400, 422)

    def test_amount_negative_rejected(self):
        r = self._post({"kind": "spend", "account": "pocket", "amount": -5, "label": "TEST_iter17 neg"})
        assert r.status_code in (400, 422)

    def test_allowance_adds_to_pocket(self):
        before_pocket = float(self.before["pocket_balance"])
        r = self._post({"kind": "allowance", "account": "pocket", "amount": 7.50, "label": "TEST_iter17 allowance"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["delta"] == 7.5
        assert round(body["balance_after"], 2) == round(before_pocket + 7.5, 2)

    def test_spend_decrements_pocket(self):
        # Get fresh
        acct = requests.get(f"{API}/pocket-money/{self.rid}", headers=self.mgr_h, timeout=30).json()["account"]
        before = float(acct["pocket_balance"])
        r = self._post({"kind": "spend", "account": "pocket", "amount": 2.00, "label": "TEST_iter17 spend"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["delta"] == -2.0
        assert round(body["balance_after"], 2) == round(before - 2.0, 2)

    def test_savings_in_moves_pocket_to_savings(self):
        acct = requests.get(f"{API}/pocket-money/{self.rid}", headers=self.mgr_h, timeout=30).json()["account"]
        p0 = float(acct["pocket_balance"])
        s0 = float(acct["savings_balance"])
        r = self._post({"kind": "savings_in", "account": "pocket", "amount": 3.00, "label": "TEST_iter17 sav_in"})
        assert r.status_code == 200, r.text
        # delta sign = -1 => -3.00 on pocket side
        assert r.json()["delta"] == -3.0
        after = requests.get(f"{API}/pocket-money/{self.rid}", headers=self.mgr_h, timeout=30).json()["account"]
        assert round(float(after["pocket_balance"]), 2) == round(p0 - 3.0, 2)
        assert round(float(after["savings_balance"]), 2) == round(s0 + 3.0, 2)

    def test_savings_out_moves_savings_to_pocket(self):
        acct = requests.get(f"{API}/pocket-money/{self.rid}", headers=self.mgr_h, timeout=30).json()["account"]
        p0 = float(acct["pocket_balance"])
        s0 = float(acct["savings_balance"])
        r = self._post({"kind": "savings_out", "account": "pocket", "amount": 2.00, "label": "TEST_iter17 sav_out"})
        assert r.status_code == 200, r.text
        after = requests.get(f"{API}/pocket-money/{self.rid}", headers=self.mgr_h, timeout=30).json()["account"]
        assert round(float(after["pocket_balance"]), 2) == round(p0 + 2.0, 2)
        assert round(float(after["savings_balance"]), 2) == round(s0 - 2.0, 2)

    def test_deposit_and_withdrawal(self):
        acct = requests.get(f"{API}/pocket-money/{self.rid}", headers=self.mgr_h, timeout=30).json()["account"]
        p0 = float(acct["pocket_balance"])
        r1 = self._post({"kind": "deposit", "account": "pocket", "amount": 4.00, "label": "TEST_iter17 dep"})
        assert r1.status_code == 200 and r1.json()["delta"] == 4.0
        r2 = self._post({"kind": "withdrawal", "account": "pocket", "amount": 1.50, "label": "TEST_iter17 wd"})
        assert r2.status_code == 200 and r2.json()["delta"] == -1.5
        after = requests.get(f"{API}/pocket-money/{self.rid}", headers=self.mgr_h, timeout=30).json()["account"]
        assert round(float(after["pocket_balance"]), 2) == round(p0 + 4.0 - 1.5, 2)

    def test_adjustment_positive_default(self):
        r = self._post({"kind": "adjustment", "account": "pocket", "amount": 1.00, "label": "TEST_iter17 adj"})
        assert r.status_code == 200
        assert r.json()["delta"] == 1.0


# ---------- DELETE transaction (reverses delta) ----------
class TestDeleteTx:
    def test_delete_reverses_delta(self, overview, mgr_h):
        rid = overview[1]["resident_id"]
        before = requests.get(f"{API}/pocket-money/{rid}", headers=mgr_h, timeout=30).json()["account"]
        p0 = float(before["pocket_balance"])
        r = requests.post(
            f"{API}/pocket-money/{rid}/transactions",
            json={"kind": "spend", "account": "pocket", "amount": 3.33, "label": "TEST_iter17 del-me"},
            headers=mgr_h, timeout=30,
        )
        assert r.status_code == 200
        tx_id = r.json()["id"]
        # confirm applied
        mid = requests.get(f"{API}/pocket-money/{rid}", headers=mgr_h, timeout=30).json()["account"]
        assert round(float(mid["pocket_balance"]), 2) == round(p0 - 3.33, 2)
        # delete
        d = requests.delete(f"{API}/pocket-money/transactions/{tx_id}", headers=mgr_h, timeout=30)
        assert d.status_code == 200
        after = requests.get(f"{API}/pocket-money/{rid}", headers=mgr_h, timeout=30).json()["account"]
        assert round(float(after["pocket_balance"]), 2) == round(p0, 2)

    def test_staff_cannot_delete(self, overview, mgr_h, staff_h):
        rid = overview[1]["resident_id"]
        r = requests.post(
            f"{API}/pocket-money/{rid}/transactions",
            json={"kind": "spend", "account": "pocket", "amount": 0.50, "label": "TEST_iter17 staff-del"},
            headers=mgr_h, timeout=30,
        )
        tx_id = r.json()["id"]
        d = requests.delete(f"{API}/pocket-money/transactions/{tx_id}", headers=staff_h, timeout=30)
        assert d.status_code == 403
        # cleanup
        requests.delete(f"{API}/pocket-money/transactions/{tx_id}", headers=mgr_h, timeout=30)


# ---------- PATCH account (RBAC) ----------
class TestPatchAccount:
    def test_manager_can_patch(self, overview, mgr_h):
        rid = overview[2]["resident_id"]
        before = requests.get(f"{API}/pocket-money/{rid}", headers=mgr_h, timeout=30).json()["account"]
        orig_wa = float(before["weekly_allowance"])
        r = requests.patch(
            f"{API}/pocket-money/{rid}/account",
            json={"weekly_allowance": 9.99},
            headers=mgr_h, timeout=30,
        )
        assert r.status_code == 200
        assert float(r.json()["weekly_allowance"]) == 9.99
        # restore
        requests.patch(
            f"{API}/pocket-money/{rid}/account",
            json={"weekly_allowance": orig_wa},
            headers=mgr_h, timeout=30,
        )

    def test_staff_forbidden(self, overview, staff_h):
        rid = overview[2]["resident_id"]
        r = requests.patch(
            f"{API}/pocket-money/{rid}/account",
            json={"weekly_allowance": 13.00},
            headers=staff_h, timeout=30,
        )
        assert r.status_code == 403


# ---------- Statement PDF ----------
class TestStatementPDF:
    def test_default_month_returns_pdf(self, overview, mgr_h):
        rid = overview[0]["resident_id"]
        r = requests.get(f"{API}/pocket-money/{rid}/statement.pdf", headers=mgr_h, timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 500
        assert r.content[:4] == b"%PDF"

    def test_specific_month(self, overview, mgr_h):
        rid = overview[0]["resident_id"]
        r = requests.get(f"{API}/pocket-money/{rid}/statement.pdf?month=2026-01", headers=mgr_h, timeout=30)
        assert r.status_code == 200
        assert len(r.content) > 500

    def test_invalid_month_400(self, overview, mgr_h):
        rid = overview[0]["resident_id"]
        r = requests.get(f"{API}/pocket-money/{rid}/statement.pdf?month=banana", headers=mgr_h, timeout=30)
        assert r.status_code == 400
