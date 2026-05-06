"""
Iteration 18 — Pocket Money (multi-category) + Petty Cash (home-wide handover).

Covers:
  - GET /api/pocket-money/categories                (17 items, shape)
  - GET /api/pocket-money                            (overview totals)
  - GET /api/pocket-money/{rid}                      (account+txs+categories)
  - POST /api/pocket-money/{rid}/transactions        (in/out, validation, math)
  - PATCH /api/pocket-money/{rid}/account            (manager only)
  - DELETE /api/pocket-money/transactions/{tx_id}    (manager only, reverse delta)
  - GET /api/pocket-money/{rid}/statement.pdf        (multi-category PDF)
  - GET /api/petty-cash                              (state + transactions)
  - POST /api/petty-cash/transactions                (deposit/spend/handover/adjustment)
  - DELETE /api/petty-cash/transactions/{tx_id}      (manager only, non-handover reverses)
"""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL must be set"

CRED = {
    "manager": ("manager@care.local", "Manager@123"),
    "staff": ("staff@care.local", "Staff@123"),
    "admin": ("admin@care.local", "Admin@123"),
}


def _login(role):
    email, pwd = CRED[role]
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def manager_h():
    return {"Authorization": f"Bearer {_login('manager')}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def staff_h():
    return {"Authorization": f"Bearer {_login('staff')}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login('admin')}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def maddy_id(manager_h):
    r = requests.get(f"{BASE}/api/residents", headers=manager_h, timeout=15)
    assert r.status_code == 200
    for res in r.json():
        if "Maddy" in (res.get("name") or ""):
            return res["id"]
    pytest.skip("Maddy resident not found")


@pytest.fixture(scope="module")
def jordan_id(manager_h):
    r = requests.get(f"{BASE}/api/residents", headers=manager_h, timeout=15)
    for res in r.json():
        if "Jordan" in (res.get("name") or ""):
            return res["id"]
    pytest.skip("Jordan resident not found")


# ------------------------- Pocket Money: categories -------------------------
EXPECTED_CATS = {
    "pocket", "personal_spending", "savings", "trust_leaving_care", "subsistence",
    "clothing", "incentives", "deductions", "staff_purchases", "external_income",
    "education_activity", "transport", "mobile_phone", "emergency", "gifts",
    "health_personal_care", "fines",
}


class TestCategories:
    def test_categories_shape(self, manager_h):
        r = requests.get(f"{BASE}/api/pocket-money/categories", headers=manager_h, timeout=15)
        assert r.status_code == 200
        data = r.json()
        cats = data.get("categories")
        assert isinstance(cats, list) and len(cats) == 17
        ids = {c["id"] for c in cats}
        assert ids == EXPECTED_CATS
        for c in cats:
            for key in ("id", "label", "subtitle", "tone", "default_direction"):
                assert key in c, f"missing {key} in {c}"
            assert c["default_direction"] in ("in", "out")


# ------------------------- Pocket Money: overview & detail -------------------------
class TestOverviewAndDetail:
    def test_overview(self, manager_h):
        r = requests.get(f"{BASE}/api/pocket-money", headers=manager_h, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 4
        for row in rows:
            for k in ("resident_id", "name", "weekly_allowance", "total_balance",
                      "pocket_balance", "savings_balance"):
                assert k in row, f"missing {k} in {row}"

    def test_overview_maddy_weekly(self, manager_h):
        r = requests.get(f"{BASE}/api/pocket-money", headers=manager_h, timeout=15).json()
        maddy = next((x for x in r if "Maddy" in x["name"]), None)
        assert maddy is not None
        assert maddy["weekly_allowance"] == 12

    def test_resident_detail(self, manager_h, maddy_id):
        r = requests.get(f"{BASE}/api/pocket-money/{maddy_id}", headers=manager_h, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "account" in body and "transactions" in body and "categories" in body
        acct = body["account"]
        assert "category_balances" in acct and "total_balance" in acct
        cb = acct["category_balances"]
        assert set(cb.keys()) == EXPECTED_CATS
        assert isinstance(body["transactions"], list)
        assert len(body["transactions"]) >= 5
        # Maddy seeded with 5+ categories opened, including trust_leaving_care
        assert acct["category_balances"].get("trust_leaving_care", 0) >= 1000


# ------------------------- Pocket Money: transactions math -------------------------
class TestTransactions:
    def test_amount_zero_rejected(self, manager_h, jordan_id):
        r = requests.post(f"{BASE}/api/pocket-money/{jordan_id}/transactions", headers=manager_h,
                          json={"category": "pocket", "direction": "out", "amount": 0,
                                "reason": "TEST_iter18 zero"}, timeout=15)
        assert r.status_code in (400, 422)

    def test_amount_negative_rejected(self, manager_h, jordan_id):
        r = requests.post(f"{BASE}/api/pocket-money/{jordan_id}/transactions", headers=manager_h,
                          json={"category": "pocket", "direction": "out", "amount": -3,
                                "reason": "TEST_iter18 neg"}, timeout=15)
        assert r.status_code in (400, 422)

    def test_invalid_category_rejected(self, manager_h, jordan_id):
        r = requests.post(f"{BASE}/api/pocket-money/{jordan_id}/transactions", headers=manager_h,
                          json={"category": "foo", "direction": "out", "amount": 1,
                                "reason": "TEST_iter18 bad"}, timeout=15)
        assert r.status_code in (400, 422)

    def test_in_adds_out_subtracts(self, manager_h, jordan_id):
        # Read current jordan balance
        before = requests.get(f"{BASE}/api/pocket-money/{jordan_id}", headers=manager_h, timeout=15).json()
        cat_before = before["account"]["category_balances"].get("gifts", 0.0)
        total_before = before["account"]["total_balance"]

        # IN +5 to gifts
        r1 = requests.post(f"{BASE}/api/pocket-money/{jordan_id}/transactions", headers=manager_h,
                           json={"category": "gifts", "direction": "in", "amount": 5,
                                 "reason": "TEST_iter18 gift in",
                                 "signed_by_staff_initials": "TS",
                                 "signed_by_yp_initials": "JR",
                                 "receipt_attached": True}, timeout=15)
        assert r1.status_code == 200, r1.text
        tx1 = r1.json()
        assert tx1["delta"] == 5.0
        assert round(tx1["balance_after_category"], 2) == round(cat_before + 5.0, 2)
        assert round(tx1["balance_after_total"], 2) == round(total_before + 5.0, 2)
        tx1_id = tx1["id"]

        # OUT -2 from gifts
        r2 = requests.post(f"{BASE}/api/pocket-money/{jordan_id}/transactions", headers=manager_h,
                           json={"category": "gifts", "direction": "out", "amount": 2,
                                 "reason": "TEST_iter18 gift out"}, timeout=15)
        assert r2.status_code == 200
        tx2 = r2.json()
        assert tx2["delta"] == -2.0
        assert round(tx2["balance_after_category"], 2) == round(cat_before + 3.0, 2)
        assert round(tx2["balance_after_total"], 2) == round(total_before + 3.0, 2)
        tx2_id = tx2["id"]

        # GET to verify persistence
        after = requests.get(f"{BASE}/api/pocket-money/{jordan_id}", headers=manager_h, timeout=15).json()
        assert round(after["account"]["category_balances"]["gifts"], 2) == round(cat_before + 3.0, 2)

        # Cleanup
        for tid in (tx1_id, tx2_id):
            requests.delete(f"{BASE}/api/pocket-money/transactions/{tid}", headers=manager_h, timeout=15)

        # Verify reversal restored balance
        final = requests.get(f"{BASE}/api/pocket-money/{jordan_id}", headers=manager_h, timeout=15).json()
        assert round(final["account"]["category_balances"]["gifts"], 2) == round(cat_before, 2)
        assert round(final["account"]["total_balance"], 2) == round(total_before, 2)

    def test_staff_can_create_tx(self, staff_h, jordan_id):
        r = requests.post(f"{BASE}/api/pocket-money/{jordan_id}/transactions", headers=staff_h,
                          json={"category": "transport", "direction": "out", "amount": 1.5,
                                "reason": "TEST_iter18 staff bus"}, timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]
        # cleanup via manager
        mh = {"Authorization": f"Bearer {_login('manager')}"}
        requests.delete(f"{BASE}/api/pocket-money/transactions/{tid}", headers=mh, timeout=15)


# ------------------------- Pocket Money: RBAC -------------------------
class TestRBAC:
    def test_patch_account_staff_forbidden(self, staff_h, maddy_id):
        r = requests.patch(f"{BASE}/api/pocket-money/{maddy_id}/account", headers=staff_h,
                           json={"weekly_allowance": 99, "currency": "GBP"}, timeout=15)
        assert r.status_code == 403

    def test_patch_account_manager_ok(self, manager_h, maddy_id):
        # read current
        cur = requests.get(f"{BASE}/api/pocket-money/{maddy_id}", headers=manager_h, timeout=15).json()
        prev = cur["account"]["weekly_allowance"]
        r = requests.patch(f"{BASE}/api/pocket-money/{maddy_id}/account", headers=manager_h,
                           json={"weekly_allowance": 13, "currency": "GBP",
                                 "note": "TEST_iter18 patch"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["weekly_allowance"] == 13
        # restore
        requests.patch(f"{BASE}/api/pocket-money/{maddy_id}/account", headers=manager_h,
                       json={"weekly_allowance": prev, "currency": "GBP"}, timeout=15)

    def test_delete_tx_staff_forbidden(self, manager_h, staff_h, jordan_id):
        # create as manager, attempt delete as staff
        r = requests.post(f"{BASE}/api/pocket-money/{jordan_id}/transactions", headers=manager_h,
                          json={"category": "mobile_phone", "direction": "out", "amount": 1,
                                "reason": "TEST_iter18 mobile"}, timeout=15)
        tid = r.json()["id"]
        rd = requests.delete(f"{BASE}/api/pocket-money/transactions/{tid}", headers=staff_h, timeout=15)
        assert rd.status_code == 403
        # cleanup
        requests.delete(f"{BASE}/api/pocket-money/transactions/{tid}", headers=manager_h, timeout=15)


# ------------------------- Pocket Money: PDF -------------------------
class TestStatementPDF:
    def test_pdf_default_month(self, manager_h, maddy_id):
        r = requests.get(f"{BASE}/api/pocket-money/{maddy_id}/statement.pdf", headers=manager_h, timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 500
        assert r.content[:4] == b"%PDF"

    def test_pdf_invalid_month(self, manager_h, maddy_id):
        r = requests.get(f"{BASE}/api/pocket-money/{maddy_id}/statement.pdf?month=2025-99",
                         headers=manager_h, timeout=15)
        assert r.status_code == 400


# ------------------------- Petty Cash -------------------------
class TestPettyCash:
    def test_get_state(self, manager_h):
        r = requests.get(f"{BASE}/api/petty-cash", headers=manager_h, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "state" in body and "transactions" in body
        st = body["state"]
        for k in ("balance", "currency", "last_handover_at",
                  "last_handover_outgoing", "last_handover_incoming", "updated_at"):
            assert k in st, f"missing {k} in state"
        assert isinstance(body["transactions"], list)

    def test_seeded_handover_AS_DT(self, manager_h):
        st = requests.get(f"{BASE}/api/petty-cash", headers=manager_h, timeout=15).json()["state"]
        # Iter-18 seed: float £80, AS->DT last handover
        assert st.get("last_handover_outgoing") == "AS"
        assert st.get("last_handover_incoming") == "DT"

    def test_amount_zero_rejected(self, manager_h):
        r = requests.post(f"{BASE}/api/petty-cash/transactions", headers=manager_h,
                          json={"kind": "spend", "direction": "out", "amount": 0,
                                "reason": "TEST_iter18 zero"}, timeout=15)
        assert r.status_code in (400, 422)

    def test_handover_requires_both_initials(self, manager_h):
        # missing incoming
        r1 = requests.post(f"{BASE}/api/petty-cash/transactions", headers=manager_h,
                           json={"kind": "handover", "direction": "check", "amount": 80,
                                 "reason": "TEST_iter18 ho missing inc",
                                 "signed_by_outgoing_initials": "AS"}, timeout=15)
        assert r1.status_code == 400
        # missing outgoing
        r2 = requests.post(f"{BASE}/api/petty-cash/transactions", headers=manager_h,
                           json={"kind": "handover", "direction": "check", "amount": 80,
                                 "reason": "TEST_iter18 ho missing out",
                                 "signed_by_incoming_initials": "DT"}, timeout=15)
        assert r2.status_code == 400

    def test_deposit_spend_math_and_delete(self, manager_h):
        before = requests.get(f"{BASE}/api/petty-cash", headers=manager_h, timeout=15).json()["state"]
        bal0 = float(before["balance"])

        # Deposit 20
        r = requests.post(f"{BASE}/api/petty-cash/transactions", headers=manager_h,
                          json={"kind": "deposit", "direction": "in", "amount": 20,
                                "reason": "TEST_iter18 deposit"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["delta"] == 20.0
        assert round(d["balance_after"], 2) == round(bal0 + 20, 2)
        dep_id = d["id"]

        # Spend 5
        r = requests.post(f"{BASE}/api/petty-cash/transactions", headers=manager_h,
                          json={"kind": "spend", "direction": "out", "amount": 5,
                                "reason": "TEST_iter18 spend"}, timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["delta"] == -5.0
        assert round(s["balance_after"], 2) == round(bal0 + 15, 2)
        sp_id = s["id"]

        # Verify state
        st = requests.get(f"{BASE}/api/petty-cash", headers=manager_h, timeout=15).json()["state"]
        assert round(float(st["balance"]), 2) == round(bal0 + 15, 2)

        # Delete the spend (reverse)
        rd = requests.delete(f"{BASE}/api/petty-cash/transactions/{sp_id}", headers=manager_h, timeout=15)
        assert rd.status_code == 200
        st = requests.get(f"{BASE}/api/petty-cash", headers=manager_h, timeout=15).json()["state"]
        assert round(float(st["balance"]), 2) == round(bal0 + 20, 2)

        # Delete the deposit
        rd2 = requests.delete(f"{BASE}/api/petty-cash/transactions/{dep_id}", headers=manager_h, timeout=15)
        assert rd2.status_code == 200
        st = requests.get(f"{BASE}/api/petty-cash", headers=manager_h, timeout=15).json()["state"]
        assert round(float(st["balance"]), 2) == round(bal0, 2)

    def test_handover_sets_balance_and_logs_discrepancy(self, manager_h):
        before = requests.get(f"{BASE}/api/petty-cash", headers=manager_h, timeout=15).json()["state"]
        bal0 = float(before["balance"])
        # Verified amount intentionally off by +£0.50 to force discrepancy
        verified = round(bal0 + 0.5, 2)
        r = requests.post(f"{BASE}/api/petty-cash/transactions", headers=manager_h,
                          json={"kind": "handover", "direction": "check", "amount": verified,
                                "reason": "TEST_iter18 handover",
                                "signed_by_outgoing_initials": "TX",
                                "signed_by_incoming_initials": "TY"}, timeout=15)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert round(tx["balance_after"], 2) == verified
        assert round(tx["discrepancy"], 2) == 0.5
        # state synced
        st = requests.get(f"{BASE}/api/petty-cash", headers=manager_h, timeout=15).json()["state"]
        assert round(float(st["balance"]), 2) == verified
        assert st["last_handover_outgoing"] == "TX"
        assert st["last_handover_incoming"] == "TY"
        # restore balance via handover back to bal0
        r2 = requests.post(f"{BASE}/api/petty-cash/transactions", headers=manager_h,
                          json={"kind": "handover", "direction": "check", "amount": bal0,
                                "reason": "TEST_iter18 handover restore",
                                "signed_by_outgoing_initials": "AS",
                                "signed_by_incoming_initials": "DT"}, timeout=15)
        assert r2.status_code == 200

    def test_delete_petty_staff_forbidden(self, manager_h, staff_h):
        r = requests.post(f"{BASE}/api/petty-cash/transactions", headers=manager_h,
                          json={"kind": "spend", "direction": "out", "amount": 1,
                                "reason": "TEST_iter18 delete-rbac"}, timeout=15)
        tid = r.json()["id"]
        rd = requests.delete(f"{BASE}/api/petty-cash/transactions/{tid}", headers=staff_h, timeout=15)
        assert rd.status_code == 403
        # cleanup
        requests.delete(f"{BASE}/api/petty-cash/transactions/{tid}", headers=manager_h, timeout=15)
