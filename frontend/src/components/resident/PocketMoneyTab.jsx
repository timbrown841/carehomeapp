import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Plus,
  Minus,
  X,
  Loader2,
  Wallet,
  Coins,
  Download,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

const fmt = (n, currency = "GBP") => {
  const s = currency === "GBP" ? "£" : currency + " ";
  const num = Number(n || 0);
  return `${num < 0 ? "-" : ""}${s}${Math.abs(num).toFixed(2)}`;
};

const monthOf = (iso) => (iso || "").slice(0, 7);

export default function PocketMoneyTab({ resident }) {
  const { user } = useAuth();
  const canManage = user?.role === "manager" || user?.role === "admin";
  const [data, setData] = useState({ account: null, transactions: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addCategory, setAddCategory] = useState(null);
  const [editAccount, setEditAccount] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/pocket-money/${resident.id}`);
      setData(r.data || { account: null, transactions: [], categories: [] });
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
  const cats = data.categories || [];
  const txs = data.transactions || [];
  const cb = acct.category_balances || {};
  const total = Number(acct.total_balance || 0);

  const thisMonth = useMemo(() => {
    const m = new Date().toISOString().slice(0, 7);
    let inT = 0,
      outT = 0;
    for (const t of txs) {
      if (monthOf(t.created_at) !== m) continue;
      const d = Number(t.delta || 0);
      if (d > 0) inT += d;
      else outT += -d;
    }
    return { inT, outT };
  }, [txs]);

  const filteredTxs = useMemo(() => {
    let arr = txs;
    if (filterCat !== "all") arr = arr.filter((t) => t.category === filterCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(
        (t) =>
          (t.reason || "").toLowerCase().includes(q) ||
          (t.signed_by_yp_initials || "").toLowerCase().includes(q) ||
          (t.created_by_name || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [txs, filterCat, search]);

  const payAllowance = async () => {
    const amt = Number(acct.weekly_allowance || 0);
    if (amt <= 0) {
      toast.error("Set a weekly allowance first");
      return;
    }
    try {
      await api.post(`/pocket-money/${resident.id}/transactions`, {
        category: "pocket",
        direction: "in",
        amount: amt,
        reason: "Weekly allowance",
      });
      toast.success("Weekly allowance paid");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const removeTx = async (tx) => {
    if (!window.confirm(`Reverse and delete: ${tx.reason} (${fmt(tx.delta, cur)})?`)) return;
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
        a.download = `finance_${resident.name.replace(/\s+/g, "_")}_${m}.pdf`;
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
            Personal allowance ledger
          </h3>
          <p className="text-xs text-[#5d6068] mt-0.5">
            Multi-category finance ledger with running balance, signatures, receipts and a monthly statement for {resident.name}.
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
            onClick={() => {
              setAddCategory(null);
              setShowAdd(true);
            }}
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
          {/* Top stats */}
          <div className="grid sm:grid-cols-3 gap-3">
            <BalanceCard
              icon={Wallet}
              tone="#0e3b4a"
              label="Total balance"
              value={fmt(total, cur)}
              testid="pm-total-balance"
              sub={`Across ${Object.values(cb).filter((v) => v).length} categor${Object.values(cb).filter((v) => v).length === 1 ? "y" : "ies"}`}
            />
            <BalanceCard
              icon={Coins}
              tone="#2F6A3A"
              label="Weekly allowance"
              value={fmt(acct.weekly_allowance, cur)}
              testid="pm-weekly"
              sub={
                acct.last_allowance_paid
                  ? `Last paid ${acct.last_allowance_paid}`
                  : "No allowance paid yet"
              }
            />
            <BalanceCard
              icon={Receipt}
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

          {/* Category grid */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5d6068] px-1 mb-2">
              Categories — tap to log a transaction
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" data-testid="pm-category-grid">
              {cats.map((c) => {
                const v = Number(cb[c.id] || 0);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setAddCategory(c);
                      setShowAdd(true);
                    }}
                    data-testid={`pm-cat-${c.id}`}
                    className="group bg-white border-l-4 border-y border-r divider-soft rounded-xl p-3 text-left hover:-translate-y-0.5 hover:shadow-card-lg transition-all"
                    style={{ borderLeftColor: c.tone }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068] leading-tight">
                        {c.label}
                      </div>
                      <span
                        className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded text-white"
                        style={{ background: c.tone }}
                      >
                        {c.default_direction === "in" ? "IN" : "OUT"}
                      </span>
                    </div>
                    <div
                      className="font-display text-lg font-black tabular-nums mt-1"
                      style={{ color: c.tone }}
                    >
                      {fmt(v, cur)}
                    </div>
                    <div className="text-[10px] text-[#8a8d95] truncate">
                      {c.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8d95]" />
              <input
                placeholder="Search transactions"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="pm-search"
                className="w-full bg-white border divider-soft rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
              />
            </div>
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              data-testid="pm-filter-category"
              className="bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
            >
              <option value="all">All categories</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Transactions */}
          <div className="bg-white border divider-soft rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b divider-soft flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                Transactions ({filteredTxs.length})
              </div>
            </div>
            {filteredTxs.length === 0 ? (
              <div className="text-sm text-[#5d6068] text-center py-8" data-testid="pm-empty">
                No transactions found.
              </div>
            ) : (
              <ul className="divide-y divider-soft" data-testid="pm-tx-list">
                {filteredTxs.map((t) => {
                  const isIn = Number(t.delta || 0) >= 0;
                  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
                  const meta = cats.find((c) => c.id === t.category) || {};
                  return (
                    <li
                      key={t.id}
                      data-testid={`pm-tx-${t.id}`}
                      className="px-4 py-3 flex items-start gap-3 hover:bg-stone-50/60"
                    >
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          background: (meta.tone || "#0e3b4a") + "14",
                          color: meta.tone || "#0e3b4a",
                        }}
                      >
                        <Icon size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#0F1115] truncate">
                          {t.reason}
                        </div>
                        <div className="text-[11px] text-[#5d6068] mt-0.5 flex items-center gap-2 flex-wrap">
                          <span
                            className="uppercase tracking-wider font-bold"
                            style={{ color: meta.tone || "#0e3b4a" }}
                          >
                            {meta.label || t.category}
                          </span>
                          <span className="font-mono tabular-nums">
                            {(t.created_at || "").slice(0, 16).replace("T", " ")}
                          </span>
                          <span className="text-[#8a8d95]">
                            staff: {t.signed_by_staff_initials || (t.created_by_name || "—").split(" ").map((s) => s[0]).join("").slice(0, 3)}
                          </span>
                          {t.signed_by_yp_initials && (
                            <span>YP: {t.signed_by_yp_initials}</span>
                          )}
                          {t.receipt_attached && (
                            <span className="inline-flex items-center gap-0.5 text-[#0e3b4a]">
                              <Receipt size={10} /> Receipt
                            </span>
                          )}
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
                          cat {fmt(t.balance_after_category, cur)} · tot {fmt(t.balance_after_total, cur)}
                        </div>
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => removeTx(t)}
                          className="text-[#8a8d95] hover:text-[#A8273A] p-1 rounded"
                          data-testid={`pm-tx-delete-${t.id}`}
                          title="Reverse and delete"
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
          residentName={resident.name}
          currency={cur}
          categories={cats}
          accountSnapshot={{ cb, total }}
          presetCategory={addCategory}
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

function AddTxModal({
  residentId,
  residentName,
  currency,
  categories,
  accountSnapshot,
  presetCategory,
  onClose,
  onSaved,
}) {
  const initialCat = presetCategory || categories[0] || { id: "pocket", default_direction: "out", tone: "#0e3b4a" };
  const [f, setF] = useState({
    category: initialCat.id,
    direction: initialCat.default_direction || "out",
    amount: "",
    reason: "",
    signed_by_staff_initials: "",
    signed_by_yp_initials: "",
    receipt_attached: false,
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const cat = categories.find((c) => c.id === f.category) || initialCat;
  const currentCatBal = Number((accountSnapshot.cb || {})[f.category] || 0);
  const amtNum = Number(f.amount || 0);
  const sign = f.direction === "in" ? +1 : -1;
  const projectedCat = currentCatBal + sign * amtNum;
  const projectedTotal = Number(accountSnapshot.total || 0) + sign * amtNum;
  const willGoNegative = projectedCat < 0;

  const submit = async () => {
    if (!amtNum || amtNum <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    if (!f.reason.trim()) {
      toast.error("Reason / description required");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/pocket-money/${residentId}/transactions`, {
        ...f,
        amount: amtNum,
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
        className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-xl border divider-soft space-y-3"
        data-testid="pm-add-tx-modal"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            Record transaction · {residentName}
          </h3>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
            Category
          </label>
          <select
            value={f.category}
            onChange={(e) => {
              const c = categories.find((x) => x.id === e.target.value);
              setF({
                ...f,
                category: e.target.value,
                direction: c?.default_direction || f.direction,
              });
            }}
            data-testid="pm-tx-category"
            className={inputCls}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — {c.subtitle}
              </option>
            ))}
          </select>
        </div>

        {/* Direction segmented + amount */}
        <div className="grid grid-cols-5 gap-2">
          <div className="col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Direction
            </label>
            <div className="flex gap-1 mt-1" data-testid="pm-direction-toggle">
              <button
                type="button"
                onClick={() => setF({ ...f, direction: "in" })}
                data-testid="pm-direction-in"
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  f.direction === "in"
                    ? "bg-[#2F6A3A] text-white"
                    : "bg-white border divider-soft text-[#5d6068]"
                }`}
              >
                <Plus size={12} /> In
              </button>
              <button
                type="button"
                onClick={() => setF({ ...f, direction: "out" })}
                data-testid="pm-direction-out"
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  f.direction === "out"
                    ? "bg-[#A8273A] text-white"
                    : "bg-white border divider-soft text-[#5d6068]"
                }`}
              >
                <Minus size={12} /> Out
              </button>
            </div>
          </div>
          <div className="col-span-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Amount ({currency})
            </label>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
              data-testid="pm-tx-amount"
              className={`${inputCls} text-lg font-bold tabular-nums`}
              autoFocus
            />
          </div>
        </div>

        {/* Live calculator preview */}
        <div
          data-testid="pm-calculator-preview"
          className="bg-stone-50 border divider-soft rounded-xl px-3 py-2.5 text-xs space-y-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-[#5d6068]">{cat.label} balance was</span>
            <span className="font-mono tabular-nums text-[#0F1115]">{fmt(currentCatBal, currency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#5d6068]">
              {f.direction === "in" ? "+ in" : "- out"}
            </span>
            <span
              className="font-mono tabular-nums font-bold"
              style={{ color: f.direction === "in" ? "#2F6A3A" : "#A8273A" }}
            >
              {f.direction === "in" ? "+" : "-"}{fmt(amtNum, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t divider-soft pt-1">
            <span className="text-[#5d6068] font-semibold">New {cat.label} balance</span>
            <span
              className={`font-mono tabular-nums font-bold ${
                willGoNegative ? "text-[#A8273A]" : "text-[#0F1115]"
              }`}
            >
              {fmt(projectedCat, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#8a8d95]">
            <span>Total balance after</span>
            <span className="font-mono tabular-nums">{fmt(projectedTotal, currency)}</span>
          </div>
          {willGoNegative && (
            <div className="text-[11px] text-[#A8273A] font-semibold pt-1">
              ⚠ This will take {cat.label} balance into the red.
            </div>
          )}
        </div>

        <input
          required
          placeholder="Reason / description (e.g. Cinema ticket, Phone top-up)"
          value={f.reason}
          onChange={(e) => setF({ ...f, reason: e.target.value })}
          data-testid="pm-tx-reason"
          className={inputCls}
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Staff initials (auto if blank)"
            value={f.signed_by_staff_initials}
            onChange={(e) => setF({ ...f, signed_by_staff_initials: e.target.value })}
            data-testid="pm-tx-staff-initials"
            className={inputCls}
            maxLength={6}
          />
          <input
            placeholder="Young person initials"
            value={f.signed_by_yp_initials}
            onChange={(e) => setF({ ...f, signed_by_yp_initials: e.target.value })}
            data-testid="pm-tx-yp-initials"
            className={inputCls}
            maxLength={6}
          />
        </div>

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
    note: account.note || "",
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.patch(`/pocket-money/${residentId}/account`, {
        weekly_allowance: Number(f.weekly_allowance),
        note: f.note || null,
      });
      toast.success("Saved");
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
        <textarea
          rows={2}
          placeholder="Note (e.g. allowance reasoning)"
          value={f.note}
          onChange={(e) => setF({ ...f, note: e.target.value })}
          className={`${inputCls} resize-none`}
        />
        <div className="text-[11px] text-[#5d6068]">
          Per-category balances are now updated automatically by transactions. To override a balance, log an "adjustment" transaction in the relevant category.
        </div>
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
