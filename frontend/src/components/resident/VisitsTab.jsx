import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Plus,
  X,
  Loader2,
  CalendarCheck,
  CheckCircle2,
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
  scheduled: { line: "#0e3b4a", label: "Scheduled" },
  completed: { line: "#2F6A3A", label: "Completed" },
  missed: { line: "#A8273A", label: "Missed" },
  cancelled: { line: "#5d6068", label: "Cancelled" },
  rescheduled: { line: "#B8772F", label: "Rescheduled" },
};

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function VisitsTab({ resident }) {
  const { user } = useAuth();
  const canManage = user?.role === "manager" || user?.role === "admin";
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/visits", { params: { resident_id: resident.id } });
      setVisits(r.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resident?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident?.id]);

  const counts = useMemo(() => {
    const today = todayIso();
    return {
      upcoming: visits.filter((v) => v.status === "scheduled" && v.scheduled_for >= today).length,
      overdue: visits.filter((v) => v.status === "scheduled" && v.scheduled_for < today).length,
      completed: visits.filter((v) => v.status === "completed").length,
    };
  }, [visits]);

  const setStatus = async (v, status) => {
    try {
      await api.patch(`/visits/${v.id}`, {
        ...v,
        status,
        completed_on: status === "completed" ? todayIso() : null,
      });
      toast.success(`Marked ${STATUS_TONE[status]?.label || status}`);
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

  const sorted = useMemo(
    () =>
      visits
        .slice()
        .sort((a, b) => (a.scheduled_for || "").localeCompare(b.scheduled_for || "")),
    [visits]
  );

  return (
    <div className="space-y-4" data-testid="resident-visits-tab">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            Statutory visits
          </h3>
          <p className="text-xs text-[#5d6068] mt-0.5">
            IRO, social worker, LAC reviews and Reg 44/45 for {resident.name}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          data-testid="add-resident-visit-btn"
          className="inline-flex items-center gap-1.5 bg-[#0e3b4a] hover:bg-[#0a2c38] text-white font-semibold rounded-xl px-3.5 py-2 text-sm"
        >
          <Plus size={14} /> Schedule visit
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Upcoming", value: counts.upcoming, color: "#0e3b4a" },
          { label: "Overdue", value: counts.overdue, color: "#A8273A" },
          { label: "Completed", value: counts.completed, color: "#2F6A3A" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-3"
            style={{ borderLeftColor: s.color }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              {s.label}
            </div>
            <div
              className="font-display text-2xl font-black tabular-nums mt-0.5"
              style={{ color: s.color }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-[#5d6068]">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : sorted.length === 0 ? (
        <div
          className="bg-stone-50 border divider-soft rounded-xl p-8 text-center"
          data-testid="resident-visits-empty"
        >
          <span className="inline-flex w-10 h-10 rounded-xl bg-[#2F6A3A]/10 text-[#2F6A3A] items-center justify-center">
            <CalendarCheck size={18} />
          </span>
          <p className="text-sm text-[#5d6068] mt-2">
            No statutory visits scheduled for {resident.name}.
          </p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="resident-visits-list">
          {sorted.map((v) => {
            const tone = STATUS_TONE[v.status] || STATUS_TONE.scheduled;
            const overdue = v.status === "scheduled" && v.scheduled_for < todayIso();
            return (
              <li
                key={v.id}
                data-testid={`resident-visit-${v.id}`}
                className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-3.5"
                style={{ borderLeftColor: overdue ? "#A8273A" : tone.line }}
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
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
                    <div className="text-sm font-semibold text-[#0F1115]">
                      {v.attended_by || v.visitor_role || "Visitor not specified"}
                    </div>
                    {v.location && (
                      <div className="text-xs text-[#5d6068] mt-0.5">{v.location}</div>
                    )}
                    {v.notes && (
                      <p className="text-xs text-[#2f3038] mt-1.5 leading-relaxed">
                        {v.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {v.status === "scheduled" && (
                      <>
                        <button
                          type="button"
                          onClick={() => setStatus(v, "completed")}
                          data-testid={`resident-visit-complete-${v.id}`}
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
        <AddResidentVisitModal
          residentId={resident.id}
          residentName={resident.name}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddResidentVisitModal({ residentId, residentName, onClose, onSaved }) {
  const [f, setF] = useState({
    kind: "lac_review",
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
      await api.post("/visits", { ...f, resident_id: residentId });
      toast.success("Visit scheduled");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
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
        data-testid="add-resident-visit-modal"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            Schedule visit · {residentName}
          </h3>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <select
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value })}
          data-testid="resident-visit-kind"
          className={inputCls}
        >
          {Object.entries(KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            required
            type="date"
            value={f.scheduled_for}
            onChange={(e) => setF({ ...f, scheduled_for: e.target.value })}
            data-testid="resident-visit-date"
            className={inputCls}
          />
          <input
            type="time"
            value={f.time}
            onChange={(e) => setF({ ...f, time: e.target.value })}
            className={inputCls}
          />
        </div>
        <input
          placeholder="Visitor role (e.g. IRO, Social Worker)"
          value={f.visitor_role}
          onChange={(e) => setF({ ...f, visitor_role: e.target.value })}
          className={inputCls}
        />
        <input
          placeholder="Visitor name"
          value={f.attended_by}
          onChange={(e) => setF({ ...f, attended_by: e.target.value })}
          className={inputCls}
        />
        <input
          placeholder="Location"
          value={f.location}
          onChange={(e) => setF({ ...f, location: e.target.value })}
          className={inputCls}
        />
        <textarea
          rows={2}
          placeholder="Notes"
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
          className={`${inputCls} resize-none`}
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="submit-resident-visit-btn"
          className="w-full bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 mt-1 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Save visit
        </button>
      </form>
    </div>
  );
}
