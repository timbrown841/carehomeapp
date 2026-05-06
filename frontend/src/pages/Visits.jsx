import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatFullTimestamp } from "@/lib/format";
import {
  CalendarCheck,
  Plus,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const KIND_LABEL = {
  lac_review: "LAC Review",
  iro_visit: "IRO Visit",
  sw_visit: "Social Worker Visit",
  regulation_44: "Regulation 44",
  regulation_45: "Regulation 45",
  ofsted_visit: "Ofsted Visit",
  other: "Other",
};

const STATUS_TONE = {
  scheduled: { fg: "#0e3b4a", bg: "#0e3b4a12", line: "#0e3b4a", label: "Scheduled" },
  completed: { fg: "#2F6A3A", bg: "#2F6A3A12", line: "#2F6A3A", label: "Completed" },
  missed: { fg: "#A8273A", bg: "#A8273A12", line: "#A8273A", label: "Missed" },
  cancelled: { fg: "#5d6068", bg: "#5d606812", line: "#5d6068", label: "Cancelled" },
  rescheduled: { fg: "#B8772F", bg: "#B8772F12", line: "#B8772F", label: "Rescheduled" },
};

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(d, status) {
  if (status !== "scheduled") return false;
  return d < todayIso();
}

export default function Visits() {
  const { user } = useAuth();
  const [visits, setVisits] = useState([]);
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const canManage = user?.role === "manager" || user?.role === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const [v, r] = await Promise.all([api.get("/visits"), api.get("/residents")]);
      setVisits(v.data || []);
      setResidents(r.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resName = (id) => residents.find((r) => r.id === id)?.name || "Home-wide";

  const filtered = useMemo(() => {
    const today = todayIso();
    let v = visits;
    if (filter === "upcoming")
      v = visits.filter((x) => x.status === "scheduled" && x.scheduled_for >= today);
    if (filter === "overdue")
      v = visits.filter((x) => x.status === "scheduled" && x.scheduled_for < today);
    if (filter === "completed") v = visits.filter((x) => x.status === "completed");
    return v.slice().sort((a, b) => (a.scheduled_for || "").localeCompare(b.scheduled_for || ""));
  }, [visits, filter]);

  const counts = useMemo(() => {
    const today = todayIso();
    return {
      all: visits.length,
      upcoming: visits.filter((x) => x.status === "scheduled" && x.scheduled_for >= today).length,
      overdue: visits.filter((x) => x.status === "scheduled" && x.scheduled_for < today).length,
      completed: visits.filter((x) => x.status === "completed").length,
    };
  }, [visits]);

  const setStatus = async (v, status) => {
    try {
      await api.patch(`/visits/${v.id}`, {
        ...v,
        status,
        completed_on: status === "completed" ? todayIso() : null,
      });
      toast.success(`Marked ${STATUS_TONE[status].label}`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this visit?")) return;
    try {
      await api.delete(`/visits/${id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Delete failed");
    }
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto" data-testid="visits-page">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
            Compliance · Statutory
          </div>
          <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5" style={{ letterSpacing: "-0.02em" }}>
            Statutory Visits & LAC Reviews
          </h1>
          <p className="text-[#5d6068] mt-1.5 text-[15px]">
            IRO and Social Worker visits, LAC review schedule, and Regulation 44/45 visits — all in one schedule.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          data-testid="add-visit-btn"
          className="inline-flex items-center gap-1.5 bg-[#0e3b4a] hover:bg-[#0a2c38] text-white font-semibold rounded-xl px-4 py-2.5 text-sm shadow-card"
        >
          <Plus size={14} /> Schedule visit
        </button>
      </header>

      <nav className="flex gap-1 border-b divider-soft" data-testid="visits-tabs">
        {[
          { id: "all", label: "All" },
          { id: "upcoming", label: "Upcoming" },
          { id: "overdue", label: "Overdue" },
          { id: "completed", label: "Completed" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`visits-filter-${t.id}`}
            onClick={() => setFilter(t.id)}
            className={`px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              filter === t.id ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-[#5d6068] hover:text-[#0F1115]"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-[11px] text-[#8a8d95] font-normal tabular-nums">
              {counts[t.id]}
            </span>
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="text-center py-12 text-[#5d6068]"><Loader2 className="animate-spin inline" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="space-y-2.5" data-testid="visits-list">
          {filtered.map((v) => {
            const tone = STATUS_TONE[v.status] || STATUS_TONE.scheduled;
            const overdue = isOverdue(v.scheduled_for, v.status);
            return (
              <li
                key={v.id}
                data-testid={`visit-${v.id}`}
                className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4 hover:shadow-card-lg transition-shadow"
                style={{ borderLeftColor: overdue ? "#A8273A" : tone.line }}
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white"
                        style={{ background: overdue ? "#A8273A" : tone.line }}
                      >
                        {overdue ? "OVERDUE" : tone.label}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                        {KIND_LABEL[v.kind] || v.kind}
                      </span>
                      <span className="font-mono text-[11px] text-[#5d6068] tabular-nums">
                        {v.scheduled_for}
                        {v.time && ` · ${v.time}`}
                      </span>
                    </div>
                    <Link
                      to={v.resident_id ? `/residents/${v.resident_id}` : "#"}
                      className="font-semibold text-[15px] text-[#0F1115] hover:text-[#0e3b4a]"
                    >
                      {resName(v.resident_id)}
                    </Link>
                    <div className="text-xs text-[#5d6068] mt-0.5">
                      {v.attended_by || v.visitor_role || "—"}
                      {v.location && ` · ${v.location}`}
                    </div>
                    {v.notes && <p className="text-xs text-[#2f3038] mt-2 leading-relaxed">{v.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {v.status === "scheduled" && (
                      <>
                        <button
                          type="button"
                          onClick={() => setStatus(v, "completed")}
                          data-testid={`visit-complete-${v.id}`}
                          className="bg-[#2F6A3A] hover:bg-[#234d2c] text-white text-xs font-semibold uppercase tracking-wider rounded-lg px-3 py-1.5 inline-flex items-center gap-1"
                        >
                          <CheckCircle2 size={12} /> Complete
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(v, "missed")}
                          className="bg-white hover:bg-stone-50 border-2 border-[#A8273A]/30 text-[#A8273A] text-xs font-semibold uppercase tracking-wider rounded-lg px-3 py-1.5"
                        >
                          Missed
                        </button>
                      </>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => remove(v.id)}
                        className="text-[#8a8d95] hover:text-[#A8273A] p-1.5 rounded"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showAdd && (
        <AddVisitModal
          residents={residents}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}

function EmptyState({ filter }) {
  const text =
    filter === "overdue"
      ? "No overdue visits — everything is on track."
      : filter === "upcoming"
      ? "No upcoming visits scheduled."
      : filter === "completed"
      ? "No completed visits yet."
      : "No statutory visits yet. Click 'Schedule visit' to add one.";
  return (
    <div className="bg-white border divider-soft rounded-2xl p-10 text-center" data-testid="visits-empty">
      <span className="inline-flex w-12 h-12 rounded-2xl bg-[#2F6A3A]/10 text-[#2F6A3A] items-center justify-center">
        <CalendarCheck size={22} />
      </span>
      <p className="text-sm text-[#5d6068] mt-3">{text}</p>
    </div>
  );
}

function AddVisitModal({ residents, onClose, onSaved }) {
  const [f, setF] = useState({
    resident_id: "",
    kind: "lac_review",
    title: "",
    scheduled_for: todayIso(),
    time: "",
    attended_by: "",
    visitor_role: "",
    location: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/visits", {
        ...f,
        resident_id: f.resident_id || null,
        title: f.title || null,
      });
      toast.success("Visit scheduled");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border divider-soft space-y-3"
        data-testid="add-visit-modal"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-xl text-[#0F1115]">Schedule visit</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} data-testid="visit-kind" className={inputCls}>
          {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={f.resident_id} onChange={(e) => setF({ ...f, resident_id: e.target.value })} data-testid="visit-resident" className={inputCls}>
          <option value="">Home-wide / not resident-specific</option>
          {residents.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input required type="date" value={f.scheduled_for} onChange={(e) => setF({ ...f, scheduled_for: e.target.value })} data-testid="visit-date" className={inputCls} />
          <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className={inputCls} />
        </div>
        <input placeholder="Visitor role (e.g. IRO, Social Worker)" value={f.visitor_role} onChange={(e) => setF({ ...f, visitor_role: e.target.value })} className={inputCls} />
        <input placeholder="Visitor name" value={f.attended_by} onChange={(e) => setF({ ...f, attended_by: e.target.value })} className={inputCls} />
        <input placeholder="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className={inputCls} />
        <textarea rows={2} placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${inputCls} resize-none`} />
        <button type="submit" disabled={busy} data-testid="submit-visit-btn" className="w-full bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 mt-1 inline-flex items-center justify-center gap-2">
          {busy && <Loader2 size={15} className="animate-spin" />}
          Save visit
        </button>
      </form>
    </div>
  );
}
