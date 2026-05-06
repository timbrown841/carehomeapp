import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Plus,
  X,
  Loader2,
  Wallet,
  PiggyBank,
  Coins,
  Download,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const KIND_LABEL = {
  allowance: "Weekly allowance",
  spend: "Spend",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  savings_in: "Move to savings",
  savings_out: "Move from savings",
  adjustment: "Adjustment",
};

const KIND_OPTIONS = [
  { v: "spend", l: "Spend (out)" },
  { v: "allowance", l: "Weekly allowance (in)" },
  { v: "deposit", l: "Deposit (in)" },
  { v: "withdrawal", l: "Withdrawal (out)" },
  { v: "savings_in", l: "Move pocket → savings" },
  { v: "savings_out", l: "Move savings → pocket" },
  { v: "adjustment", l: "Adjustment (in)" },
];

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

const fmt = (n, currency = "GBP") => {
  const s = currency === "GBP" ? "£" : currency + " ";
  const num = Number(n || 0);
  const sign = num < 0 ? "-" : "";
  return `${sign}${s}${Math.abs(num).toFixed(2)}`;
};

const monthOf = (iso) => (iso || "").slice(0, 7);

export default function PocketMoneyTab({ resident }) {
  const { user } = useAuth();
  const canManage = user?.role === "manager" || user?.role === "admin";
  const [data, setData] = useState({ account: null, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editAccount, setEditAccount] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/pocket-money/${resident.id}`);
      setData(r.data || { account: null, transactions: [] });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (resident?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident?.id]);

  const acct = data.account || {};
  const cur = acct.currency || "GBP";
  const txs = data.transactions || [];

  const thisMonth = useMemo(() => {
    const m = new Date().toISOString().slice(0, 7);
    let inT = 0,
      outT = 0;
    for (const t of txs) {
      if (monthOf(t.created_at) !== m) continue;
      const d = Number(t.delta || 0);
      if (d > 0) inT += d;
      else if (d < 0) outT += -d;
    }
    return { inT, outT };
  }, [txs]);

  const payAllowance = async () => {
    const amt = Number(acct.weekly_allowance || 0);
    if (amt <= 0) {
      toast.error("Set a weekly allowance first");
      return;
    }
    try {
      await api.post(`/pocket-money/${resident.id}/transactions`, {
        account: "pocket",
        kind: "allowance",
        amount: amt,
        label: "Weekly allowance",
      });
      toast.success("Allowance paid");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const remove = async (tx) => {
    if (!window.confirm(`Reverse and delete: ${tx.label} (${fmt(tx.delta, cur)})?`)) return;
    try {
      await api.delete(`/pocket-money/transactions/${tx.id}`);
      toast.success("Reversed");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const downloadStatement = () => {
    const m = new Date().toISOString().slice(0, 7);
    const url = `${API}/pocket-money/${resident.id}/statement.pdf?month=${m}`;
    const token = localStorage.getItem("token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const u = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u;
        a.download = `pocket_money_${resident.name.replace(/\s+/g, "_")}_${m}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(u);
      })
      .catch(() => toast.error("Download failed"));
  };

  return (
    <div className="space-y-4" data-testid="resident-pocket-money-tab">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            Pocket money & personal allowance
          </h3>
          <p className="text-xs text-[#5d6068] mt-0.5">
            Running balance, weekly allowance, savings ledger and a monthly statement for {resident.name}.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={downloadStatement}
            data-testid="pm-statement-pdf-btn"
            className="inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border divider-soft text-[#0F1115] font-semibold rounded-xl px-3 py-2 text-sm"
          >
            <Download size={13} /> Monthly statement
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            data-testid="pm-add-tx-btn"
            className="inline-flex items-center gap-1.5 bg-[#0e3b4a] hover:bg-[#0a2c38] text-white font-semibold rounded-xl px-3 py-2 text-sm"
          >
            <Plus size={14} /> Add transaction
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[#5d6068]">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <BalanceCard
              icon={Wallet}
              tone="#0e3b4a"
              label="Pocket balance"
              value={fmt(acct.pocket_balance, cur)}
              testid="pm-pocket-balance"
              sub={`Weekly allowance ${fmt(acct.weekly_allowance, cur)}`}
            />
            <BalanceCard
              icon={PiggyBank}
              tone="#2F6A3A"
              label="Savings balance"
              value={fmt(acct.savings_balance, cur)}
              testid="pm-savings-balance"
              sub={
                acct.last_allowance_paid
                  ? `Last allowance ${acct.last_allowance_paid}`
                  : "No allowance paid yet"
              }
            />
            <BalanceCard
              icon={Coins}
              tone="#B8772F"
              label="This month"
              value={
                <span className="space-x-2">
                  <span style={{ color: "#2F6A3A" }}>+{fmt(thisMonth.inT, cur)}</span>
                  <span style={{ color: "#A8273A" }}>-{fmt(thisMonth.outT, cur)}</span>
                </span>
              }
              testid="pm-month-totals"
              sub="Money in / out so far this month"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={payAllowance}
              data-testid="pm-pay-allowance-btn"
              className="inline-flex items-center gap-1.5 bg-[#2F6A3A] hover:bg-[#234d2c] text-white font-semibold rounded-xl px-3 py-1.5 text-xs uppercase tracking-wider"
            >
              <Plus size={12} /> Pay weekly allowance ({fmt(acct.weekly_allowance, cur)})
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setEditAccount(true)}
                data-testid="pm-edit-account-btn"
                className="inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border divider-soft text-[#5d6068] font-semibold rounded-xl px-3 py-1.5 text-xs uppercase tracking-wider"
              >
                Adjust weekly amount
              </button>
            )}
          </div>

          <div className="bg-white border divider-soft rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b divider-soft text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Transactions
            </div>
            {txs.length === 0 ? (
              <div className="text-sm text-[#5d6068] text-center py-8" data-testid="pm-empty">
                No transactions yet.
              </div>
            ) : (
              <ul className="divide-y divider-soft" data-testid="pm-tx-list">
                {txs.map((t) => {
                  const isIn = Number(t.delta || 0) >= 0;
                  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
                  return (
                    <li
                      key={t.id}
                      data-testid={`pm-tx-${t.id}`}
                      className="px-4 py-3 flex items-start gap-3 hover:bg-stone-50/60"
                    >
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          background: isIn ? "#2F6A3A14" : "#A8273A14",
                          color: isIn ? "#2F6A3A" : "#A8273A",
                        }}
                      >
                        <Icon size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#0F1115] truncate">
                          {t.label}
                        </div>
                        <div className="text-[11px] text-[#5d6068] mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="uppercase tracking-wider font-bold">
                            {KIND_LABEL[t.kind] || t.kind}
                          </span>
                          <span className="font-mono tabular-nums">
                            {(t.created_at || "").slice(0, 16).replace("T", " ")}
                          </span>
                          {t.account === "savings" && (
                            <span className="text-[#2F6A3A] font-bold">SAVINGS</span>
                          )}
                          {t.signed_by_yp_initials && (
                            <span>YP: {t.signed_by_yp_initials}</span>
                          )}
                          {t.receipt_attached && (
                            <span className="inline-flex items-center gap-0.5 text-[#0e3b4a]">
                              <Receipt size={10} /> Receipt
                            </span>
                          )}
                          <span className="text-[#8a8d95]">by {t.created_by_name}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="text-sm font-bold tabular-nums"
                          style={{ color: isIn ? "#2F6A3A" : "#A8273A" }}
                        >
                          {isIn ? "+" : "-"}
                          {fmt(Math.abs(Number(t.delta || 0)), cur)}
                        </div>
                        <div className="text-[10px] text-[#8a8d95] tabular-nums">
                          bal {fmt(t.balance_after, cur)}
                        </div>
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => remove(t)}
                          className="text-[#8a8d95] hover:text-[#A8273A] p-1 rounded"
                          data-testid={`pm-tx-delete-${t.id}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {showAdd && (
        <AddTxModal
          residentId={resident.id}
          currency={cur}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
      {editAccount && (
        <EditAccountModal
          residentId={resident.id}
          account={acct}
          onClose={() => setEditAccount(false)}
          onSaved={() => {
            setEditAccount(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function BalanceCard({ icon: Icon, tone, label, value, sub, testid }) {
  return (
    <div
      data-testid={testid}
      className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4"
      style={{ borderLeftColor: tone }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          {label}
        </div>
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: tone + "14", color: tone }}
        >
          <Icon size={14} />
        </span>
      </div>
      <div
        className="font-display text-2xl font-black tabular-nums mt-1.5"
        style={{ color: tone }}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-[#5d6068] mt-1">{sub}</div>}
    </div>
  );
}

function AddTxModal({ residentId, currency, onClose, onSaved }) {
  const [f, setF] = useState({
    account: "pocket",
    kind: "spend",
    amount: "",
    label: "",
    signed_by_yp_initials: "",
    receipt_attached: false,
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const amt = Number(f.amount);
    if (!amt || amt <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    if (!f.label.trim()) {
      toast.error("Description required");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/pocket-money/${residentId}/transactions`, {
        ...f,
        amount: amt,
      });
      toast.success("Transaction recorded");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border divider-soft space-y-3"
        data-testid="pm-add-tx-modal"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            Record transaction
          </h3>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <select
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value })}
          data-testid="pm-tx-kind"
          className={inputCls}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
        <select
          value={f.account}
          onChange={(e) => setF({ ...f, account: e.target.value })}
          data-testid="pm-tx-account"
          className={inputCls}
        >
          <option value="pocket">Pocket money</option>
          <option value="savings">Savings</option>
        </select>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              placeholder={`Amount (${currency})`}
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
              data-testid="pm-tx-amount"
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <input
              required
              placeholder="Description (e.g. Cinema ticket)"
              value={f.label}
              onChange={(e) => setF({ ...f, label: e.target.value })}
              data-testid="pm-tx-label"
              className={inputCls}
            />
          </div>
        </div>
        <input
          placeholder="Young person initials (optional)"
          value={f.signed_by_yp_initials}
          onChange={(e) => setF({ ...f, signed_by_yp_initials: e.target.value })}
          className={inputCls}
        />
        <label className="flex items-center gap-2 text-sm text-[#2f3038]">
          <input
            type="checkbox"
            checked={f.receipt_attached}
            onChange={(e) => setF({ ...f, receipt_attached: e.target.checked })}
            data-testid="pm-tx-receipt"
          />
          Receipt attached / kept on file
        </label>
        <textarea
          rows={2}
          placeholder="Notes (optional)"
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
          className={`${inputCls} resize-none`}
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="pm-submit-tx-btn"
          className="w-full bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Save transaction
        </button>
      </form>
    </div>
  );
}

function EditAccountModal({ residentId, account, onClose, onSaved }) {
  const [f, setF] = useState({
    weekly_allowance: account.weekly_allowance ?? 5,
    pocket_balance: account.pocket_balance ?? 0,
    savings_balance: account.savings_balance ?? 0,
    note: account.note || "",
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.patch(`/pocket-money/${residentId}/account`, {
        weekly_allowance: Number(f.weekly_allowance),
        pocket_balance: Number(f.pocket_balance),
        savings_balance: Number(f.savings_balance),
        note: f.note || null,
      });
      toast.success("Account updated");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border divider-soft space-y-3"
        data-testid="pm-edit-account-modal"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            Adjust account
          </h3>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          Weekly allowance (£)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={f.weekly_allowance}
          onChange={(e) => setF({ ...f, weekly_allowance: e.target.value })}
          data-testid="pm-edit-weekly"
          className={inputCls}
        />
        <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          Pocket balance (£) — manual override
        </label>
        <input
          type="number"
          step="0.01"
          value={f.pocket_balance}
          onChange={(e) => setF({ ...f, pocket_balance: e.target.value })}
          className={inputCls}
        />
        <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          Savings balance (£) — manual override
        </label>
        <input
          type="number"
          step="0.01"
          value={f.savings_balance}
          onChange={(e) => setF({ ...f, savings_balance: e.target.value })}
          className={inputCls}
        />
        <textarea
          rows={2}
          placeholder="Note (e.g. allowance reasoning)"
          value={f.note}
          onChange={(e) => setF({ ...f, note: e.target.value })}
          className={`${inputCls} resize-none`}
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Save
        </button>
      </form>
    </div>
  );
}
