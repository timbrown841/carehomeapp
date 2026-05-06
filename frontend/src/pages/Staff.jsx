import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatFullTimestamp } from "@/lib/format";
import {
  UserCog,
  Loader2,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Trash2,
  Clock,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function weekStart() {
  const d = new Date();
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

const STATUS_TONE = {
  ok: { label: "Current", bg: "#2F6A3A", soft: "#2F6A3A12", fg: "#2F6A3A" },
  expiring: { label: "Expiring", bg: "#B8772F", soft: "#B8772F22", fg: "#B8772F" },
  expired: { label: "Expired", bg: "#A8273A", soft: "#A8273A18", fg: "#A8273A" },
  missing: { label: "Missing", bg: "#5D6068", soft: "#5D606818", fg: "#5D6068" },
};

export default function Staff() {
  const { user } = useAuth();
  const [tab, setTab] = useState("rota");
  const canManage = user?.role === "manager" || user?.role === "admin";
  return (
    <div className="space-y-5 max-w-6xl mx-auto" data-testid="staff-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          People & Compliance
        </div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5" style={{ letterSpacing: "-0.02em" }}>
          Staff Rotas & Training
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          See who's on shift right now, plan the week ahead, and keep every certificate current.
        </p>
      </header>

      <nav
        className="flex gap-1 border-b divider-soft"
        data-testid="staff-tabs"
      >
        {[
          { id: "rota", label: "Rota & On-shift now" },
          { id: "training", label: "Training matrix" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`staff-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-[#5d6068] hover:text-[#0F1115]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "rota" && <RotaPanel canManage={canManage} />}
      {tab === "training" && <TrainingMatrix canManage={canManage} />}
    </div>
  );
}

// ---------------- Rota ----------------
function RotaPanel({ canManage }) {
  const [now, setNow] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(weekStart());
  const [to, setTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [n, s] = await Promise.all([
        api.get("/shifts/now"),
        api.get(`/shifts?from_date=${from}&to_date=${to}`),
      ]);
      setNow(n.data || []);
      setShifts(s.data || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const remove = async (id) => {
    if (!window.confirm("Delete this shift?")) return;
    try {
      await api.delete(`/shifts/${id}`);
      toast.success("Shift removed");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Delete failed");
    }
  };

  // Group by date
  const byDate = useMemo(() => {
    const m = {};
    for (const s of shifts) {
      const d = (s.start_at || "").slice(0, 10);
      m[d] = m[d] || [];
      m[d].push(s);
    }
    return m;
  }, [shifts]);
  const dates = Object.keys(byDate).sort();

  return (
    <div className="space-y-5">
      <section
        className="bg-white border divider-soft rounded-2xl p-5"
        data-testid="on-shift-now-panel"
      >
        <header className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e3b4a] inline-flex items-center gap-1.5">
              <Clock size={12} /> On shift now
            </div>
            <div className="font-display font-semibold text-xl text-[#0F1115] mt-0.5">
              {now.length} member{now.length === 1 ? "" : "s"} currently on duty
            </div>
          </div>
          <div className="text-xs text-[#5d6068] tabular-nums">
            {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
          </div>
        </header>
        {now.length === 0 ? (
          <div className="text-sm text-[#5d6068] italic py-2">
            No staff scheduled for this moment. Add a shift to populate the rota.
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {now.map((s) => (
              <li
                key={s.id}
                className="bg-[#2F6A3A]/5 border-l-4 border-l-[#2F6A3A] border-y border-r divider-soft rounded-xl p-3.5"
                data-testid={`on-shift-${s.id}`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#2F6A3A]">
                  {s.role || "Shift"}
                </div>
                <div className="font-semibold text-[15px] text-[#0F1115] mt-0.5">{s.staff_name}</div>
                <div className="text-xs text-[#5d6068] tabular-nums">
                  {(s.start_at || "").slice(11, 16)} → {(s.end_at || "").slice(11, 16)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border divider-soft rounded-2xl p-5">
        <header className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e3b4a] inline-flex items-center gap-1.5">
              <Calendar size={12} /> Rota
            </div>
            <div className="font-display font-semibold text-xl text-[#0F1115] mt-0.5">
              Schedule
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              data-testid="rota-from-date"
              className="bg-white border divider-soft rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
            />
            <span className="text-[#8a8d95]">→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="rota-to-date"
              className="bg-white border divider-soft rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
            />
            {canManage && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                data-testid="add-shift-btn"
                className="inline-flex items-center gap-1.5 bg-[#0e3b4a] hover:bg-[#0a2c38] text-white font-semibold rounded-lg px-3 py-1.5 text-xs"
              >
                <Plus size={13} /> Add shift
              </button>
            )}
          </div>
        </header>
        {loading ? (
          <div className="text-center py-10 text-[#5d6068]">
            <Loader2 className="animate-spin inline" />
          </div>
        ) : dates.length === 0 ? (
          <div className="text-sm text-[#5d6068] italic py-3">No shifts in this period.</div>
        ) : (
          <div className="space-y-3">
            {dates.map((d) => (
              <div key={d}>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5d6068] mb-1.5 tabular-nums">
                  {new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                </div>
                <ul className="grid sm:grid-cols-3 gap-2">
                  {byDate[d].map((s) => (
                    <li
                      key={s.id}
                      data-testid={`shift-${s.id}`}
                      className="bg-white border-l-4 border-l-[#0e3b4a] border-y border-r divider-soft rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                            {s.role || "Shift"}
                          </div>
                          <div className="font-semibold text-sm text-[#0F1115] truncate">
                            {s.staff_name}
                          </div>
                          <div className="text-xs text-[#5d6068] tabular-nums">
                            {(s.start_at || "").slice(11, 16)} → {(s.end_at || "").slice(11, 16)}
                          </div>
                        </div>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => remove(s.id)}
                            className="text-[#8a8d95] hover:text-[#A8273A] p-1 rounded"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {showAdd && <AddShiftModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddShiftModal({ onClose, onSaved }) {
  const [staffList, setStaffList] = useState([]);
  const [f, setF] = useState({
    staff_id: "",
    role: "Day shift",
    date: todayIso(),
    start_time: "08:00",
    end_time: "16:00",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/staff").then((r) => {
      setStaffList(r.data || []);
      if (r.data?.[0]) setF((p) => ({ ...p, staff_id: r.data[0].id }));
    });
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      const start_at = `${f.date}T${f.start_time}:00+00:00`;
      const end_at = `${f.date}T${f.end_time}:00+00:00`;
      await api.post("/shifts", {
        staff_id: f.staff_id,
        role: f.role,
        start_at,
        end_at,
        notes: f.notes || null,
      });
      toast.success("Shift added");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border divider-soft space-y-3"
        data-testid="add-shift-modal"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-xl text-[#0F1115]">Add shift</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <select
          value={f.staff_id}
          onChange={(e) => setF({ ...f, staff_id: e.target.value })}
          required
          data-testid="shift-staff"
          className={inputCls}
        >
          {staffList.map((u) => (
            <option key={u.id} value={u.id}>{u.name} · {u.role}</option>
          ))}
        </select>
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={inputCls}>
          <option>Day shift</option>
          <option>Late shift</option>
          <option>Night shift</option>
          <option>Sleep-in</option>
          <option>Lead</option>
          <option>Support</option>
        </select>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required data-testid="shift-date" className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} className={inputCls} />
          <input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} className={inputCls} />
        </div>
        <button
          type="submit"
          disabled={busy}
          data-testid="submit-shift-btn"
          className="w-full bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 mt-1 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Save shift
        </button>
      </form>
    </div>
  );
}

// ---------------- Training Matrix ----------------
function TrainingMatrix({ canManage }) {
  const [data, setData] = useState({ courses: [], rows: [] });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/trainings/matrix");
      setData(r.data || { courses: [], rows: [] });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const t = { ok: 0, expiring: 0, expired: 0, missing: 0 };
    for (const r of data.rows) for (const c of r.cells) t[c.status] = (t[c.status] || 0) + 1;
    return t;
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(STATUS_TONE).map(([k, v]) => (
          <div
            key={k}
            data-testid={`training-summary-${k}`}
            className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4"
            style={{ borderLeftColor: v.bg }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">{v.label}</div>
            <div className="font-display-bold text-3xl tabular-nums" style={{ color: v.fg }}>
              {totals[k] || 0}
            </div>
          </div>
        ))}
      </div>

      <section className="bg-white border divider-soft rounded-2xl p-5">
        <header className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e3b4a]">
              Training matrix
            </div>
            <div className="font-display font-semibold text-xl text-[#0F1115] mt-0.5">
              Live RAG status across the team
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              data-testid="add-training-btn"
              className="inline-flex items-center gap-1.5 bg-[#0e3b4a] hover:bg-[#0a2c38] text-white font-semibold rounded-lg px-3 py-1.5 text-xs"
            >
              <Plus size={13} /> Record training
            </button>
          )}
        </header>
        {loading ? (
          <div className="text-center py-10 text-[#5d6068]">
            <Loader2 className="animate-spin inline" />
          </div>
        ) : data.courses.length === 0 ? (
          <div className="text-sm text-[#5d6068] italic py-3">No training records yet. Record one to start the matrix.</div>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full border-collapse text-sm" data-testid="training-table">
              <thead>
                <tr>
                  <th className="text-left text-[10px] font-bold uppercase tracking-wider text-[#5d6068] py-2.5 pr-3 sticky left-0 bg-white">
                    Staff
                  </th>
                  {data.courses.map((c) => (
                    <th
                      key={c}
                      className="text-left text-[10px] font-bold uppercase tracking-wider text-[#5d6068] py-2.5 px-2 whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.staff.id} className="border-t divider-soft" data-testid={`training-row-${r.staff.id}`}>
                    <td className="py-3 pr-3 sticky left-0 bg-white">
                      <div className="font-semibold text-[#0F1115]">{r.staff.name}</div>
                      <div className="text-[10px] uppercase tracking-wider text-[#8a8d95]">{r.staff.role}</div>
                    </td>
                    {r.cells.map((c, i) => {
                      const t = STATUS_TONE[c.status] || STATUS_TONE.missing;
                      return (
                        <td key={i} className="py-2 px-2 align-top">
                          <div
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
                            style={{ background: t.soft, color: t.fg }}
                          >
                            {c.status === "ok" ? <CheckCircle2 size={10} /> :
                             c.status === "expiring" ? <AlertTriangle size={10} /> :
                             c.status === "expired" ? <AlertOctagon size={10} /> : null}
                            {t.label}
                          </div>
                          {c.expires_on && (
                            <div className="text-[10px] text-[#8a8d95] mt-0.5 font-mono tabular-nums">
                              {c.expires_on}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAdd && <AddTrainingModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddTrainingModal({ onClose, onSaved }) {
  const [staffList, setStaffList] = useState([]);
  const [f, setF] = useState({
    staff_id: "",
    course: "Safeguarding L3",
    completed_on: todayIso(),
    expires_on: "",
    certificate_no: "",
    provider: "",
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/staff").then((r) => {
      setStaffList(r.data || []);
      if (r.data?.[0]) setF((p) => ({ ...p, staff_id: r.data[0].id }));
    });
  }, []);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/trainings", { ...f, expires_on: f.expires_on || null });
      toast.success("Training recorded");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border divider-soft space-y-3"
        data-testid="add-training-modal"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-xl text-[#0F1115]">Record training</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <select required value={f.staff_id} onChange={(e) => setF({ ...f, staff_id: e.target.value })} data-testid="training-staff" className={inputCls}>
          {staffList.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <input required placeholder="Course (e.g. Safeguarding L3)" value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} data-testid="training-course" className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068] mb-1">Completed</div>
            <input required type="date" value={f.completed_on} onChange={(e) => setF({ ...f, completed_on: e.target.value })} className={inputCls} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068] mb-1">Expires</div>
            <input type="date" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} data-testid="training-expires" className={inputCls} />
          </div>
        </div>
        <input placeholder="Certificate / reference no." value={f.certificate_no} onChange={(e) => setF({ ...f, certificate_no: e.target.value })} className={inputCls} />
        <input placeholder="Provider" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} className={inputCls} />
        <button
          type="submit"
          disabled={busy}
          data-testid="submit-training-btn"
          className="w-full bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 mt-1 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Save training
        </button>
      </form>
    </div>
  );
}
