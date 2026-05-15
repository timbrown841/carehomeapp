import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  ArrowRightLeft, Plus, Check, X, Loader2, Clock, AlertCircle, Calendar,
} from "lucide-react";

const STATUS_TONE = {
  open:             { bg: "#0e3b4a14", fg: "#0e3b4a", label: "OPEN" },
  pending_target:   { bg: "#B8772F18", fg: "#B8772F", label: "AWAITING ACCEPT" },
  pending_manager:  { bg: "#B8772F18", fg: "#B8772F", label: "AWAITING MGR" },
  approved:         { bg: "#2F6A3A14", fg: "#2F6A3A", label: "APPROVED" },
  rejected:         { bg: "#A8273A14", fg: "#A8273A", label: "REJECTED" },
  cancelled:        { bg: "#5D606818", fg: "#5D6068", label: "CANCELLED" },
};

function fmt(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function ShiftSwaps() {
  const { tier, user } = useAuth();
  const isManager = tier >= 3;
  const [items, setItems] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("mine");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (tab === "mine") params.mine = true;
      const r = await api.get("/shift-swaps", { params });
      setItems(r.data || []);
    } catch { toast.error("Couldn't load swaps"); }
    finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Load shifts and staff once (for the "new" modal)
    const today = new Date().toISOString().slice(0, 10);
    const monthOut = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    api.get(`/shifts?from_date=${today}&to_date=${monthOut}`).then((r) => setShifts(r.data || [])).catch(() => {});
    api.get("/auth/users/picker").then((r) => setStaff(r.data || [])).catch(() => {});
  }, []);

  const accept = async (id) => {
    try { await api.post(`/shift-swaps/${id}/accept`, {}); toast.success("Accepted · awaiting manager"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't accept"); }
  };
  const approve = async (id) => {
    try { await api.post(`/shift-swaps/${id}/approve`, {}); toast.success("Swap approved · shift reassigned"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't approve"); }
  };
  const reject = async (id) => {
    const notes = window.prompt("Reason for rejection (optional):");
    try { await api.post(`/shift-swaps/${id}/reject`, { decision_notes: notes }); toast.success("Rejected"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't reject"); }
  };
  const cancel = async (id) => {
    if (!window.confirm("Cancel this swap request?")) return;
    try { await api.post(`/shift-swaps/${id}/cancel`, {}); toast.success("Cancelled"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't cancel"); }
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto" data-testid="shift-swaps-page">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">Staff Operations</div>
          <h1 className="font-display font-semibold text-3xl text-[#0F1115] mt-1.5" style={{ letterSpacing: "-0.02em" }}>
            Shift swaps
          </h1>
          <p className="text-stone-600 text-sm mt-1">Request a swap · target a colleague or open it up · manager approves the final swap.</p>
        </div>
        <button onClick={() => setShowNew(true)} data-testid="swap-new-btn" className="text-sm font-semibold bg-[#0e3b4a] text-white px-4 py-2 rounded-lg flex items-center gap-1.5">
          <Plus size={14} /> Request swap
        </button>
      </header>

      <div className="flex gap-1 border-b divider-soft">
        <TabBtn id="mine" cur={tab} onClick={setTab}>My swaps</TabBtn>
        {isManager && <TabBtn id="all" cur={tab} onClick={setTab}>All swaps</TabBtn>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-600 py-8 justify-center"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white border divider-soft rounded-2xl p-8 text-center" data-testid="swap-empty">
          <ArrowRightLeft size={28} className="mx-auto text-stone-400 mb-2" />
          <p className="text-sm text-stone-600">No swap requests.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => {
            const t = STATUS_TONE[s.status] || STATUS_TONE.open;
            const isRequester = s.requested_by_id === user?.id;
            const isTarget = s.target_staff_id === user?.id;
            const canAccept = (s.status === "pending_target" && isTarget) || (s.status === "open" && !isRequester);
            return (
              <li key={s.id} className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-3 flex items-start gap-3" style={{ borderLeftColor: t.fg }} data-testid={`swap-item-${s.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: t.bg, color: t.fg }}>{t.label}</span>
                    <span className="text-sm font-semibold text-[#0F1115]">{fmt(s.shift_start_at)} – {fmt(s.shift_end_at)}</span>
                    {s.shift_role && <span className="text-xs text-stone-600">· {s.shift_role}</span>}
                  </div>
                  <div className="text-xs text-stone-700 mt-1">
                    From <b>{s.requested_by_name}</b>
                    {s.target_staff_name ? <> → targeted at <b>{s.target_staff_name}</b></> : <> → open to anyone</>}
                    {s.accepted_by_name && <> · accepted by <b>{s.accepted_by_name}</b></>}
                  </div>
                  {s.reason && <p className="text-xs text-stone-600 mt-1 italic">"{s.reason}"</p>}
                  {s.manager_decision_at && (
                    <p className="text-[11px] text-stone-500 mt-1">
                      {s.status === "approved" ? "Approved" : "Decided"} by {s.manager_decision_by}
                      {s.manager_decision_notes ? ` · ${s.manager_decision_notes}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {canAccept && (
                    <button onClick={() => accept(s.id)} data-testid={`swap-accept-${s.id}`} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-[#0e3b4a] text-white hover:bg-[#0a2e3a]">Accept</button>
                  )}
                  {isManager && s.status === "pending_manager" && (
                    <>
                      <button onClick={() => approve(s.id)} data-testid={`swap-approve-${s.id}`} title="Approve" className="p-1.5 rounded hover:bg-stone-50 text-[#2F6A3A]"><Check size={15} /></button>
                      <button onClick={() => reject(s.id)} data-testid={`swap-reject-${s.id}`} title="Reject" className="p-1.5 rounded hover:bg-stone-50 text-[#A8273A]"><X size={15} /></button>
                    </>
                  )}
                  {(isRequester || isManager) && !["approved", "rejected", "cancelled"].includes(s.status) && (
                    <button onClick={() => cancel(s.id)} data-testid={`swap-cancel-${s.id}`} className="text-[10px] font-semibold text-stone-500 hover:text-stone-800 px-2 py-1 rounded hover:bg-stone-100">Cancel</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showNew && (
        <NewSwapModal
          shifts={shifts.filter((sh) => sh.staff_id === user?.id && !sh.clocked_in_at && new Date(sh.start_at) > new Date())}
          staff={staff.filter((s) => s.id !== user?.id)}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load(); }}
        />
      )}
    </div>
  );
}

function TabBtn({ id, cur, onClick, children }) {
  return (
    <button onClick={() => onClick(id)} data-testid={`swap-tab-${id}`}
      className={`text-xs font-semibold px-3 py-2 border-b-2 ${cur === id ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-600"}`}>
      {children}
    </button>
  );
}

function NewSwapModal({ shifts, staff, onClose, onSaved }) {
  const [shiftId, setShiftId] = useState("");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!shiftId) { toast.error("Pick a shift"); return; }
    setBusy(true);
    try {
      const t = staff.find((s) => s.id === target);
      await api.post("/shift-swaps", {
        shift_id: shiftId,
        target_staff_id: target || null,
        target_staff_name: t?.name || null,
        reason,
      });
      toast.success("Swap requested");
      onSaved?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't request"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4" data-testid="swap-new-modal">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 max-w-md w-full">
        <h3 className="text-base font-semibold text-[#0F1115] mb-3">Request a swap</h3>
        {shifts.length === 0 ? (
          <p className="text-sm text-stone-600">You have no upcoming shifts to swap.</p>
        ) : (
          <>
            <label className="text-xs font-medium text-stone-700">Pick the shift</label>
            <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} data-testid="swap-new-shift" className="w-full border divider-soft rounded-lg p-2 text-sm mb-2">
              <option value="">Choose…</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmt(s.start_at)} – {fmt(s.end_at)}{s.role ? ` · ${s.role}` : ""}
                </option>
              ))}
            </select>
            <label className="text-xs font-medium text-stone-700">Swap with (optional — leave blank to open to anyone)</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="swap-new-target" className="w-full border divider-soft rounded-lg p-2 text-sm mb-2">
              <option value="">Open to anyone</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
            </select>
            <label className="text-xs font-medium text-stone-700">Reason (optional)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} data-testid="swap-new-reason" className="w-full border divider-soft rounded-lg p-2 text-sm resize-none" />
          </>
        )}
        <div className="flex gap-2 justify-end mt-3">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
          {shifts.length > 0 && <button onClick={save} disabled={busy} data-testid="swap-new-save" className="text-sm font-semibold bg-[#0e3b4a] text-white px-3 py-2 rounded-lg disabled:opacity-60">{busy ? "Submitting…" : "Request"}</button>}
        </div>
      </div>
    </div>
  );
}
