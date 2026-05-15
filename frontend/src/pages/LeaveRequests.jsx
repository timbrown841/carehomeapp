import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Coffee, Plus, Check, X, Loader2, Clock, AlertCircle, Calendar,
} from "lucide-react";

const KINDS = [
  { value: "annual_leave", label: "Annual leave" },
  { value: "sickness", label: "Sickness" },
  { value: "parental", label: "Parental leave" },
  { value: "compassionate", label: "Compassionate" },
  { value: "training", label: "Training" },
  { value: "unpaid", label: "Unpaid" },
];

const STATUS_TONE = {
  pending:  { bg: "#B8772F18", fg: "#B8772F", label: "PENDING" },
  approved: { bg: "#2F6A3A14", fg: "#2F6A3A", label: "APPROVED" },
  rejected: { bg: "#A8273A14", fg: "#A8273A", label: "REJECTED" },
  cancelled:{ bg: "#5D606818", fg: "#5D6068", label: "CANCELLED" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export default function LeaveRequests() {
  const { tier, user } = useAuth();
  const isManager = tier >= 3;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(isManager ? "all_pending" : "mine");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (tab === "mine") params.mine = true;
      if (tab === "all_pending") params.status = "pending";
      const r = await api.get("/leave-requests", { params });
      setItems(r.data || []);
    } catch { toast.error("Couldn't load leave"); }
    finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    try { await api.post(`/leave-requests/${id}/approve`, {}); toast.success("Approved"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't approve"); }
  };
  const reject = async (id) => {
    const notes = window.prompt("Reason for rejection (optional):");
    try { await api.post(`/leave-requests/${id}/reject`, { decision_notes: notes }); toast.success("Rejected"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't reject"); }
  };
  const cancel = async (id) => {
    if (!window.confirm("Cancel this request?")) return;
    try { await api.post(`/leave-requests/${id}/cancel`, {}); toast.success("Cancelled"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't cancel"); }
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto" data-testid="leave-requests-page">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">Staff Operations</div>
          <h1 className="font-display font-semibold text-3xl text-[#0F1115] mt-1.5" style={{ letterSpacing: "-0.02em" }}>
            Leave &amp; sickness
          </h1>
          <p className="text-stone-600 text-sm mt-1">Annual leave, sickness, parental, training and compassionate requests — request, approve, and track.</p>
        </div>
        <button onClick={() => setShowNew(true)} data-testid="leave-new-btn" className="text-sm font-semibold bg-[#0e3b4a] text-white px-4 py-2 rounded-lg flex items-center gap-1.5">
          <Plus size={14} /> Request
        </button>
      </header>

      <div className="flex gap-1 border-b divider-soft">
        <TabBtn id="mine" cur={tab} onClick={setTab}>My requests</TabBtn>
        {isManager && <TabBtn id="all_pending" cur={tab} onClick={setTab}>Pending approval</TabBtn>}
        {isManager && <TabBtn id="all" cur={tab} onClick={setTab}>All</TabBtn>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-600 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border divider-soft rounded-2xl p-8 text-center" data-testid="leave-empty">
          <Coffee size={28} className="mx-auto text-stone-400 mb-2" />
          <p className="text-sm text-stone-600">No requests yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((l) => {
            const t = STATUS_TONE[l.status] || STATUS_TONE.pending;
            const kindLabel = KINDS.find((k) => k.value === l.kind)?.label || l.kind;
            const mine = l.staff_id === user?.id;
            return (
              <li key={l.id} className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-3 flex items-start gap-3" style={{ borderLeftColor: t.fg }} data-testid={`leave-item-${l.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: t.bg, color: t.fg }}>{t.label}</span>
                    <span className="text-sm font-semibold text-[#0F1115]">{kindLabel}</span>
                    <span className="text-xs text-stone-600">· {l.days} day{l.days === 1 ? "" : "s"}</span>
                  </div>
                  <div className="text-xs text-stone-700 mt-1">
                    {fmtDate(l.start_date)} – {fmtDate(l.end_date)} · <span className="font-medium">{l.staff_name}</span>
                  </div>
                  {l.reason && <p className="text-xs text-stone-600 mt-1 italic">"{l.reason}"</p>}
                  {l.decision_at && (
                    <p className="text-[11px] text-stone-500 mt-1">
                      {l.status === "approved" ? "Approved" : l.status === "rejected" ? "Rejected" : "Decided"} by {l.decision_by_name}
                      {l.decision_notes ? ` · ${l.decision_notes}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {isManager && l.status === "pending" && (
                    <>
                      <button onClick={() => approve(l.id)} data-testid={`leave-approve-${l.id}`} title="Approve" className="p-1.5 rounded hover:bg-stone-50 text-[#2F6A3A]"><Check size={15} /></button>
                      <button onClick={() => reject(l.id)} data-testid={`leave-reject-${l.id}`} title="Reject" className="p-1.5 rounded hover:bg-stone-50 text-[#A8273A]"><X size={15} /></button>
                    </>
                  )}
                  {mine && ["pending", "approved"].includes(l.status) && (
                    <button onClick={() => cancel(l.id)} data-testid={`leave-cancel-${l.id}`} className="text-[10px] font-semibold text-stone-500 hover:text-stone-800 px-2 py-1 rounded hover:bg-stone-100">Cancel</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showNew && <NewLeaveModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function TabBtn({ id, cur, onClick, children }) {
  return (
    <button onClick={() => onClick(id)} data-testid={`leave-tab-${id}`}
      className={`text-xs font-semibold px-3 py-2 border-b-2 ${cur === id ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-600"}`}>
      {children}
    </button>
  );
}

function NewLeaveModal({ onClose, onSaved }) {
  const [kind, setKind] = useState("annual_leave");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const days = (() => {
    if (!start || !end) return 0;
    const s = new Date(start), e = new Date(end);
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
  })();

  const save = async () => {
    if (!start || !end) { toast.error("Date range required"); return; }
    setBusy(true);
    try {
      await api.post("/leave-requests", { kind, start_date: start, end_date: end, days, reason });
      toast.success("Leave request submitted");
      onSaved?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't submit"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4" data-testid="leave-new-modal">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 max-w-md w-full">
        <h3 className="text-base font-semibold text-[#0F1115] mb-3">New leave request</h3>
        <label className="text-xs font-medium text-stone-700">Type</label>
        <select value={kind} onChange={(e) => setKind(e.target.value)} data-testid="leave-new-kind" className="w-full border divider-soft rounded-lg p-2 text-sm mb-2">
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-xs font-medium text-stone-700">From</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} data-testid="leave-new-start" className="w-full border divider-soft rounded-lg p-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-700">To</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="leave-new-end" className="w-full border divider-soft rounded-lg p-2 text-sm" />
          </div>
        </div>
        {days > 0 && <p className="text-xs text-stone-600 mb-2">{days} day{days === 1 ? "" : "s"} requested.</p>}
        <label className="text-xs font-medium text-stone-700">Reason (optional)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} data-testid="leave-new-reason" className="w-full border divider-soft rounded-lg p-2 text-sm resize-none" />
        <div className="flex gap-2 justify-end mt-3">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
          <button onClick={save} disabled={busy} data-testid="leave-new-save" className="text-sm font-semibold bg-[#0e3b4a] text-white px-3 py-2 rounded-lg disabled:opacity-60">{busy ? "Submitting…" : "Submit"}</button>
        </div>
      </div>
    </div>
  );
}
