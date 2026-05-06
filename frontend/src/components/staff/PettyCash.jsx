import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Plus,
  Minus,
  X,
  Loader2,
  HandCoins,
  Coins,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;

const KIND_LABEL = {
  deposit: "Deposit / float top-up",
  spend: "Spend",
  handover: "Handover check",
  adjustment: "Adjustment",
};

export default function PettyCash() {
  const { user } = useAuth();
  const canManage = user?.role === "manager" || user?.role === "admin";
  const [data, setData] = useState({ state: null, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [showSpend, setShowSpend] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showHandover, setShowHandover] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/petty-cash");
      setData(r.data || { state: null, transactions: [] });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const state = data.state || {};
  const txs = data.transactions || [];

  const remove = async (tx) => {
    if (tx.kind === "handover") {
      toast.error("Cannot delete a handover record");
      return;
    }
    if (!window.confirm(`Delete ${tx.kind}: ${tx.reason} (${fmt(tx.delta)})?`)) return;
    try {
      await api.delete(`/petty-cash/transactions/${tx.id}`);
      toast.success("Reversed");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const lastHandover = state.last_handover_at
    ? new Date(state.last_handover_at)
    : null;
  const handoverHoursAgo = lastHandover
    ? Math.floor((Date.now() - lastHandover.getTime()) / 3_600_000)
    : null;

  return (
    <div className="space-y-4" data-testid="petty-cash-section">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            Home petty cash
          </h3>
          <p className="text-xs text-[#5d6068] mt-0.5">
            Shared float for staff use. Both outgoing and incoming staff sign at every shift handover.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border divider-soft text-[#0F1115] rounded-xl px-3 py-2 text-sm"
          aria-label="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[#5d6068]">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : (
        <>
          {/* Top stats */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div
              data-testid="petty-balance"
              className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4"
              style={{ borderLeftColor: "#0e3b4a" }}
            >
              <div className="flex items-start justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                  Current float
                </div>
                <span className="w-7 h-7 rounded-md flex items-center justify-center bg-[#0e3b4a14] text-[#0e3b4a]">
                  <HandCoins size={14} />
                </span>
              </div>
              <div className="font-display text-3xl font-black tabular-nums mt-1.5 text-[#0e3b4a]">
                {fmt(state.balance)}
              </div>
              <div className="text-[11px] text-[#5d6068] mt-1">
                Updated {(state.updated_at || "").slice(0, 16).replace("T", " ")}
              </div>
            </div>
            <div
              data-testid="petty-last-handover"
              className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4"
              style={{
                borderLeftColor: handoverHoursAgo > 12 ? "#B8772F" : "#2F6A3A",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                  Last handover
                </div>
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center"
                  style={{
                    background: (handoverHoursAgo > 12 ? "#B8772F" : "#2F6A3A") + "14",
                    color: handoverHoursAgo > 12 ? "#B8772F" : "#2F6A3A",
                  }}
                >
                  {handoverHoursAgo > 12 ? (
                    <AlertTriangle size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                </span>
              </div>
              <div className="font-display text-base font-bold mt-1.5">
                {state.last_handover_outgoing && state.last_handover_incoming
                  ? `${state.last_handover_outgoing} → ${state.last_handover_incoming}`
                  : "Never recorded"}
              </div>
              <div className="text-[11px] text-[#5d6068] mt-1">
                {lastHandover
                  ? `${handoverHoursAgo}h ago · ${lastHandover.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`
                  : "Use the Handover button below to record a count"}
              </div>
            </div>
            <div
              className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4"
              style={{ borderLeftColor: "#5d6068" }}
            >
              <div className="flex items-start justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                  Activity
                </div>
                <span className="w-7 h-7 rounded-md flex items-center justify-center bg-[#5d606814] text-[#5d6068]">
                  <Coins size={14} />
                </span>
              </div>
              <div className="font-display text-3xl font-black tabular-nums mt-1.5 text-[#5d6068]">
                {txs.length}
              </div>
              <div className="text-[11px] text-[#5d6068] mt-1">
                Total ledger entries
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setShowSpend(true)}
              data-testid="petty-spend-btn"
              className="inline-flex items-center gap-1.5 bg-[#A8273A] hover:bg-[#8b1f30] text-white font-semibold rounded-xl px-3 py-2 text-sm"
            >
              <Minus size={13} /> Record spend
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowDeposit(true)}
                data-testid="petty-deposit-btn"
                className="inline-flex items-center gap-1.5 bg-[#2F6A3A] hover:bg-[#234d2c] text-white font-semibold rounded-xl px-3 py-2 text-sm"
              >
                <Plus size={13} /> Top up float
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowHandover(true)}
              data-testid="petty-handover-btn"
              className="inline-flex items-center gap-1.5 bg-[#0e3b4a] hover:bg-[#0a2c38] text-white font-semibold rounded-xl px-3 py-2 text-sm"
            >
              <HandCoins size={13} /> Shift handover
            </button>
          </div>

          {/* Ledger */}
          <div className="bg-white border divider-soft rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b divider-soft text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Ledger
            </div>
            {txs.length === 0 ? (
              <div className="text-sm text-[#5d6068] text-center py-8" data-testid="petty-empty">
                No petty cash activity yet.
              </div>
            ) : (
              <ul className="divide-y divider-soft" data-testid="petty-tx-list">
                {txs.map((t) => {
                  const isHandover = t.kind === "handover";
                  const isIn = !isHandover && Number(t.delta || 0) >= 0;
                  const Icon = isHandover ? HandCoins : isIn ? ArrowDownLeft : ArrowUpRight;
                  const tone = isHandover
                    ? "#0e3b4a"
                    : isIn
                    ? "#2F6A3A"
                    : "#A8273A";
                  return (
                    <li
                      key={t.id}
                      data-testid={`petty-tx-${t.id}`}
                      className="px-4 py-3 flex items-start gap-3 hover:bg-stone-50/60"
                    >
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: tone + "14", color: tone }}
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
                            style={{ color: tone }}
                          >
                            {KIND_LABEL[t.kind] || t.kind}
                          </span>
                          <span className="font-mono tabular-nums">
                            {(t.created_at || "").slice(0, 16).replace("T", " ")}
                          </span>
                          {t.signed_by_outgoing_initials && (
                            <span>Out: {t.signed_by_outgoing_initials}</span>
                          )}
                          {t.signed_by_incoming_initials && (
                            <span>In: {t.signed_by_incoming_initials}</span>
                          )}
                          <span className="text-[#8a8d95]">by {t.created_by_name}</span>
                          {isHandover && Number(t.discrepancy || 0) !== 0 && (
                            <span
                              className="font-bold"
                              style={{
                                color:
                                  Number(t.discrepancy) > 0 ? "#2F6A3A" : "#A8273A",
                              }}
                            >
                              ⚠ {Number(t.discrepancy) > 0 ? "+" : ""}
                              {fmt(t.discrepancy)} discrepancy
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {isHandover ? (
                          <div className="text-sm font-bold tabular-nums text-[#0e3b4a]">
                            {fmt(t.amount)}
                          </div>
                        ) : (
                          <div
                            className="text-sm font-bold tabular-nums"
                            style={{ color: isIn ? "#2F6A3A" : "#A8273A" }}
                          >
                            {isIn ? "+" : "-"}
                            {fmt(Math.abs(Number(t.delta || 0)))}
                          </div>
                        )}
                        <div className="text-[10px] text-[#8a8d95] tabular-nums">
                          bal {fmt(t.balance_after)}
                        </div>
                      </div>
                      {canManage && !isHandover && (
                        <button
                          type="button"
                          onClick={() => remove(t)}
                          className="text-[#8a8d95] hover:text-[#A8273A] p-1 rounded"
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

      {showSpend && (
        <PettySpendModal
          balance={state.balance}
          onClose={() => setShowSpend(false)}
          onSaved={() => {
            setShowSpend(false);
            load();
          }}
        />
      )}
      {showDeposit && (
        <PettyDepositModal
          balance={state.balance}
          onClose={() => setShowDeposit(false)}
          onSaved={() => {
            setShowDeposit(false);
            load();
          }}
        />
      )}
      {showHandover && (
        <PettyHandoverModal
          balance={state.balance}
          onClose={() => setShowHandover(false)}
          onSaved={() => {
            setShowHandover(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function PettySpendModal({ balance, onClose, onSaved }) {
  const [f, setF] = useState({
    amount: "",
    reason: "",
    signed_by_outgoing_initials: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const amt = Number(f.amount || 0);
  const after = Number(balance || 0) - amt;
  const submit = async () => {
    if (!amt || amt <= 0) return toast.error("Amount required");
    if (!f.reason.trim()) return toast.error("Reason required");
    setBusy(true);
    try {
      await api.post("/petty-cash/transactions", {
        kind: "spend",
        direction: "out",
        amount: amt,
        reason: f.reason,
        signed_by_outgoing_initials: f.signed_by_outgoing_initials || null,
        notes: f.notes || null,
      });
      toast.success("Spend recorded");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Record petty cash spend" onClose={onClose} testid="petty-spend-modal" onSubmit={submit}>
      <input
        required
        type="number"
        step="0.01"
        min="0.01"
        placeholder="Amount (£)"
        value={f.amount}
        onChange={(e) => setF({ ...f, amount: e.target.value })}
        data-testid="petty-spend-amount"
        className={`${inputCls} text-lg font-bold tabular-nums`}
        autoFocus
      />
      <CalculatorPreview was={balance} delta={-amt} after={after} />
      <input
        required
        placeholder="Reason / what was bought"
        value={f.reason}
        onChange={(e) => setF({ ...f, reason: e.target.value })}
        data-testid="petty-spend-reason"
        className={inputCls}
      />
      <input
        placeholder="Your initials (signing staff)"
        value={f.signed_by_outgoing_initials}
        onChange={(e) => setF({ ...f, signed_by_outgoing_initials: e.target.value })}
        data-testid="petty-spend-initials"
        className={inputCls}
        maxLength={6}
      />
      <textarea
        rows={2}
        placeholder="Notes (optional)"
        value={f.notes}
        onChange={(e) => setF({ ...f, notes: e.target.value })}
        className={`${inputCls} resize-none`}
      />
      <SubmitButton busy={busy} testid="petty-spend-submit" label="Save spend" />
    </ModalShell>
  );
}

function PettyDepositModal({ balance, onClose, onSaved }) {
  const [f, setF] = useState({ amount: "", reason: "Float top-up", signed_by_outgoing_initials: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const amt = Number(f.amount || 0);
  const after = Number(balance || 0) + amt;
  const submit = async () => {
    if (!amt || amt <= 0) return toast.error("Amount required");
    if (!f.reason.trim()) return toast.error("Reason required");
    setBusy(true);
    try {
      await api.post("/petty-cash/transactions", {
        kind: "deposit",
        direction: "in",
        amount: amt,
        reason: f.reason,
        signed_by_outgoing_initials: f.signed_by_outgoing_initials || null,
        notes: f.notes || null,
      });
      toast.success("Float topped up");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Top up petty cash float" onClose={onClose} testid="petty-deposit-modal" onSubmit={submit}>
      <input
        required
        type="number"
        step="0.01"
        min="0.01"
        placeholder="Amount (£)"
        value={f.amount}
        onChange={(e) => setF({ ...f, amount: e.target.value })}
        data-testid="petty-deposit-amount"
        className={`${inputCls} text-lg font-bold tabular-nums`}
        autoFocus
      />
      <CalculatorPreview was={balance} delta={+amt} after={after} />
      <input
        required
        placeholder="Reason / source"
        value={f.reason}
        onChange={(e) => setF({ ...f, reason: e.target.value })}
        className={inputCls}
      />
      <input
        placeholder="Manager initials"
        value={f.signed_by_outgoing_initials}
        onChange={(e) => setF({ ...f, signed_by_outgoing_initials: e.target.value })}
        className={inputCls}
        maxLength={6}
      />
      <textarea
        rows={2}
        placeholder="Notes (optional)"
        value={f.notes}
        onChange={(e) => setF({ ...f, notes: e.target.value })}
        className={`${inputCls} resize-none`}
      />
      <SubmitButton busy={busy} testid="petty-deposit-submit" label="Top up float" />
    </ModalShell>
  );
}

function PettyHandoverModal({ balance, onClose, onSaved }) {
  const [f, setF] = useState({
    counted: balance ?? "",
    reason: "Shift handover · count and sign",
    signed_by_outgoing_initials: "",
    signed_by_incoming_initials: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const amt = Number(f.counted || 0);
  const discrepancy = amt - Number(balance || 0);
  const submit = async () => {
    if (amt < 0) return toast.error("Counted amount must be ≥ 0");
    if (!f.signed_by_outgoing_initials.trim() || !f.signed_by_incoming_initials.trim()) {
      return toast.error("Both outgoing and incoming staff initials required");
    }
    setBusy(true);
    try {
      await api.post("/petty-cash/transactions", {
        kind: "handover",
        direction: "check",
        amount: amt,
        reason: f.reason,
        signed_by_outgoing_initials: f.signed_by_outgoing_initials,
        signed_by_incoming_initials: f.signed_by_incoming_initials,
        notes: f.notes || null,
      });
      toast.success(
        Math.abs(discrepancy) < 0.01
          ? "Handover signed · float balanced"
          : `Handover signed · ${discrepancy > 0 ? "+" : ""}${fmt(discrepancy)} discrepancy logged`
      );
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Shift handover · count the float" onClose={onClose} testid="petty-handover-modal" onSubmit={submit}>
      <div className="text-xs text-[#5d6068]">
        Count the cash. If the count differs from the running balance ({fmt(balance)}), the difference is logged automatically as a discrepancy on this handover record.
      </div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
        Counted amount (£)
      </label>
      <input
        required
        type="number"
        step="0.01"
        min="0"
        value={f.counted}
        onChange={(e) => setF({ ...f, counted: e.target.value })}
        data-testid="petty-handover-counted"
        className={`${inputCls} text-lg font-bold tabular-nums`}
        autoFocus
      />
      <div
        className="bg-stone-50 border divider-soft rounded-xl px-3 py-2.5 text-xs space-y-1"
        data-testid="petty-handover-preview"
      >
        <div className="flex items-center justify-between">
          <span className="text-[#5d6068]">Running balance</span>
          <span className="font-mono tabular-nums">{fmt(balance)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#5d6068]">Counted</span>
          <span className="font-mono tabular-nums font-bold">{fmt(amt)}</span>
        </div>
        <div className="flex items-center justify-between border-t divider-soft pt-1">
          <span className="text-[#5d6068] font-semibold">Discrepancy</span>
          <span
            className="font-mono tabular-nums font-bold"
            style={{
              color:
                Math.abs(discrepancy) < 0.01
                  ? "#2F6A3A"
                  : discrepancy > 0
                  ? "#B8772F"
                  : "#A8273A",
            }}
          >
            {Math.abs(discrepancy) < 0.01
              ? "Balanced"
              : `${discrepancy > 0 ? "+" : ""}${fmt(discrepancy)}`}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
            Outgoing staff initials
          </label>
          <input
            required
            placeholder="e.g. AS"
            value={f.signed_by_outgoing_initials}
            onChange={(e) => setF({ ...f, signed_by_outgoing_initials: e.target.value })}
            data-testid="petty-handover-out-initials"
            className={inputCls}
            maxLength={6}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
            Incoming staff initials
          </label>
          <input
            required
            placeholder="e.g. DT"
            value={f.signed_by_incoming_initials}
            onChange={(e) => setF({ ...f, signed_by_incoming_initials: e.target.value })}
            data-testid="petty-handover-in-initials"
            className={inputCls}
            maxLength={6}
          />
        </div>
      </div>
      <textarea
        rows={2}
        placeholder="Notes (optional — e.g. observations during count)"
        value={f.notes}
        onChange={(e) => setF({ ...f, notes: e.target.value })}
        className={`${inputCls} resize-none`}
      />
      <SubmitButton busy={busy} testid="petty-handover-submit" label="Sign and complete handover" />
    </ModalShell>
  );
}

function CalculatorPreview({ was, delta, after }) {
  const sign = delta >= 0 ? "+" : "-";
  const color = delta >= 0 ? "#2F6A3A" : "#A8273A";
  return (
    <div
      data-testid="petty-calculator-preview"
      className="bg-stone-50 border divider-soft rounded-xl px-3 py-2.5 text-xs space-y-1"
    >
      <div className="flex items-center justify-between">
        <span className="text-[#5d6068]">Float was</span>
        <span className="font-mono tabular-nums">{fmt(was)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[#5d6068]">Change</span>
        <span className="font-mono tabular-nums font-bold" style={{ color }}>
          {sign}{fmt(Math.abs(delta))}
        </span>
      </div>
      <div className="flex items-center justify-between border-t divider-soft pt-1">
        <span className="text-[#5d6068] font-semibold">New float</span>
        <span
          className={`font-mono tabular-nums font-bold ${
            after < 0 ? "text-[#A8273A]" : "text-[#0F1115]"
          }`}
        >
          {fmt(after)}
        </span>
      </div>
      {after < 0 && (
        <div className="text-[11px] text-[#A8273A] font-semibold pt-1">
          ⚠ This will take the float below zero. Top up first.
        </div>
      )}
    </div>
  );
}

function ModalShell({ title, children, onClose, onSubmit, testid }) {
  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border divider-soft space-y-3"
        data-testid={testid}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            {title}
          </h3>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </form>
    </div>
  );
}

function SubmitButton({ busy, label, testid }) {
  return (
    <button
      type="submit"
      disabled={busy}
      data-testid={testid}
      className="w-full bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 inline-flex items-center justify-center gap-2"
    >
      {busy && <Loader2 size={15} className="animate-spin" />}
      {label}
    </button>
  );
}
