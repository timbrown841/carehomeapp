import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatFullTimestamp } from "@/lib/format";
import {
  Plus,
  Loader2,
  X,
  Stethoscope,
  Activity,
  Syringe,
  CalendarClock,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const APPT_KIND_LABEL = {
  gp: "GP",
  dental: "Dental",
  optician: "Optician",
  camhs: "CAMHS",
  lac_nurse: "LAC Nurse",
  immunisation: "Immunisation",
  specialist: "Specialist",
  hospital: "Hospital",
  physio: "Physio",
  other: "Other",
};

const STATUS_TONE = {
  scheduled: { bg: "#1E4D5C", soft: "#1E4D5C12" },
  attended: { bg: "#3A5A40", soft: "#3A5A4012" },
  missed: { bg: "#B23A48", soft: "#B23A4812" },
  cancelled: { bg: "#8A8A85", soft: "#8A8A8512" },
  rescheduled: { bg: "#D4A373", soft: "#D4A37312" },
};

const OBS_LABEL = {
  weight: "Weight",
  height: "Height",
  bmi: "BMI",
  temp: "Temperature",
  bp: "Blood pressure",
  peak_flow: "Peak flow",
  blood_sugar: "Blood sugar",
  pulse: "Pulse",
  other: "Other",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(d) {
  if (!d) return false;
  return d < todayIso();
}

export default function HealthTab({ resident }) {
  const { user } = useAuth();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAppt, setShowAppt] = useState(false);
  const [showObs, setShowObs] = useState(false);
  const [showImmu, setShowImmu] = useState(false);
  const canManage = user?.role === "manager" || user?.role === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/residents/${resident.id}/health`);
      setBundle(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident.id]);

  const remove = async (path, id) => {
    if (!window.confirm("Delete this record?")) return;
    try {
      await api.delete(`/health/${path}/${id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Delete failed");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-10 text-stone-500">
        <Loader2 className="animate-spin inline" />
      </div>
    );
  }
  if (!bundle) return null;

  const m = resident.medical || {};

  return (
    <div className="space-y-6" data-testid="health-content">
      {/* Identity strip */}
      <div className="bg-stone-50 border divider-soft rounded-xl p-3.5 grid sm:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
            NHS number
          </div>
          <div className="font-mono">{m.nhs_number || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
            GP
          </div>
          <div>{m.gp || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#B23A48]">
            Allergies
          </div>
          <div className="font-semibold text-stone-900">{m.allergies || "None recorded"}</div>
        </div>
      </div>

      {/* Upcoming */}
      {bundle.upcoming_appointments.length > 0 && (
        <section
          className="bg-[#1E4D5C]/5 border-l-4 border-[#1E4D5C] rounded-xl p-4"
          data-testid="upcoming-appointments"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#1E4D5C] mb-2 inline-flex items-center gap-1.5">
            <CalendarClock size={13} /> Upcoming · next {bundle.upcoming_appointments.length}
          </div>
          <ul className="space-y-1.5">
            {bundle.upcoming_appointments.map((a) => (
              <li key={a.id} className="text-sm text-stone-800 flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-[11px] text-stone-500 tabular-nums shrink-0">
                  {a.date}
                  {a.time && ` · ${a.time}`}
                </span>
                <span className="font-semibold">
                  {APPT_KIND_LABEL[a.kind]} — {a.title}
                </span>
                {a.with_whom && <span className="text-stone-500">· {a.with_whom}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Overdue immunisations */}
      {bundle.overdue_immunisations.length > 0 && (
        <section
          className="bg-[#B23A48]/5 border-l-4 border-[#B23A48] rounded-xl p-4"
          data-testid="overdue-immunisations"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#B23A48] mb-2 inline-flex items-center gap-1.5">
            <AlertTriangle size={13} /> Overdue immunisations
          </div>
          <ul className="space-y-1 text-sm">
            {bundle.overdue_immunisations.map((i) => (
              <li key={i.id}>
                <b>{i.vaccine}</b> · was due {i.next_due}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Appointments list */}
      <section>
        <header className="flex items-center justify-between mb-2">
          <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#1E4D5C] inline-flex items-center gap-2">
            <Stethoscope size={14} /> Appointments
          </h3>
          <button
            type="button"
            data-testid="add-appointment-btn"
            onClick={() => setShowAppt(true)}
            className="inline-flex items-center gap-1.5 bg-[#1E4D5C] hover:bg-[#163A47] text-white font-semibold rounded-lg px-3 py-1.5 text-xs"
          >
            <Plus size={13} /> Add appointment
          </button>
        </header>
        {bundle.appointments.length === 0 ? (
          <div className="text-sm text-stone-500 italic py-3">No appointments recorded.</div>
        ) : (
          <ul className="space-y-2">
            {bundle.appointments.map((a) => {
              const tone = STATUS_TONE[a.status] || STATUS_TONE.scheduled;
              return (
                <li
                  key={a.id}
                  data-testid={`appt-${a.id}`}
                  className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-3.5 flex items-start gap-3"
                  style={{ borderLeftColor: tone.bg }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white"
                        style={{ background: tone.bg }}
                      >
                        {APPT_KIND_LABEL[a.kind]} · {a.status}
                      </span>
                      <span className="font-mono text-xs text-stone-500 tabular-nums">
                        {a.date}
                        {a.time && ` · ${a.time}`}
                      </span>
                    </div>
                    <div className="font-semibold text-sm text-stone-900 mt-1">
                      {a.title}
                    </div>
                    <div className="text-xs text-stone-500">
                      {a.location}
                      {a.with_whom && ` · ${a.with_whom}`}
                    </div>
                    {a.notes && (
                      <p className="text-xs text-stone-700 mt-1.5">{a.notes}</p>
                    )}
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => remove("appointments", a.id)}
                      className="text-stone-400 hover:text-[#B23A48] p-1 rounded"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Observations */}
      <section>
        <header className="flex items-center justify-between mb-2">
          <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#1E4D5C] inline-flex items-center gap-2">
            <Activity size={14} /> Observations · weight, height, BP, peak flow…
          </h3>
          <button
            type="button"
            data-testid="add-observation-btn"
            onClick={() => setShowObs(true)}
            className="inline-flex items-center gap-1.5 bg-[#1E4D5C] hover:bg-[#163A47] text-white font-semibold rounded-lg px-3 py-1.5 text-xs"
          >
            <Plus size={13} /> Add observation
          </button>
        </header>
        {bundle.observations.length === 0 ? (
          <div className="text-sm text-stone-500 italic py-3">No observations recorded.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {bundle.observations.map((o) => (
              <div
                key={o.id}
                data-testid={`obs-${o.id}`}
                className="bg-white border divider-soft rounded-xl p-3.5"
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  {OBS_LABEL[o.kind] || o.kind}
                </div>
                <div className="font-display font-bold text-2xl text-stone-900 tabular-nums">
                  {o.value}
                  {o.unit && (
                    <span className="text-sm text-stone-400 ml-1 font-normal">{o.unit}</span>
                  )}
                </div>
                <div className="text-xs text-stone-500">
                  {o.recorded_on || formatFullTimestamp(o.recorded_at)?.split(",")[0]}
                  {" · "}
                  {o.recorded_by_name}
                </div>
                {o.notes && <div className="text-xs text-stone-700 mt-1.5">{o.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Immunisations */}
      <section>
        <header className="flex items-center justify-between mb-2">
          <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#1E4D5C] inline-flex items-center gap-2">
            <Syringe size={14} /> Immunisations
          </h3>
          <button
            type="button"
            data-testid="add-immunisation-btn"
            onClick={() => setShowImmu(true)}
            className="inline-flex items-center gap-1.5 bg-[#1E4D5C] hover:bg-[#163A47] text-white font-semibold rounded-lg px-3 py-1.5 text-xs"
          >
            <Plus size={13} /> Add immunisation
          </button>
        </header>
        {bundle.immunisations.length === 0 ? (
          <div className="text-sm text-stone-500 italic py-3">No immunisations recorded.</div>
        ) : (
          <ul className="space-y-2">
            {bundle.immunisations.map((i) => {
              const overdue = isOverdue(i.next_due);
              return (
                <li
                  key={i.id}
                  data-testid={`immu-${i.id}`}
                  className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-3.5 flex items-start gap-3"
                  style={{ borderLeftColor: overdue ? "#B23A48" : "#3A5A40" }}
                >
                  <div className="flex-1">
                    <div className="font-semibold text-sm text-stone-900">{i.vaccine}</div>
                    <div className="text-xs text-stone-500">
                      Given {i.date_given}
                      {i.given_by && ` · ${i.given_by}`}
                      {i.next_due && (
                        <span
                          className={overdue ? "text-[#B23A48] font-bold ml-2" : "ml-2"}
                        >
                          · next due {i.next_due}
                          {overdue && " · OVERDUE"}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showAppt && (
        <ApptModal residentId={resident.id} onClose={() => setShowAppt(false)} onSaved={() => { setShowAppt(false); load(); }} />
      )}
      {showObs && (
        <ObsModal residentId={resident.id} onClose={() => setShowObs(false)} onSaved={() => { setShowObs(false); load(); }} />
      )}
      {showImmu && (
        <ImmuModal residentId={resident.id} onClose={() => setShowImmu(false)} onSaved={() => { setShowImmu(false); load(); }} />
      )}
    </div>
  );
}

// ----- Modals -----
function ModalShell({ title, onClose, onSubmit, busy, children, testid }) {
  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border divider-soft space-y-3"
        data-testid={testid}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-xl text-stone-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-900 p-1 rounded">
            <X size={18} />
          </button>
        </div>
        {children}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-[#1E4D5C] hover:bg-[#163A47] disabled:opacity-50 text-white font-bold rounded-xl px-6 py-3 mt-1 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Save
        </button>
      </form>
    </div>
  );
}

const inputCls =
  "w-full bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]";

function ApptModal({ residentId, onClose, onSaved }) {
  const [f, setF] = useState({
    kind: "gp",
    title: "",
    date: todayIso(),
    time: "",
    location: "",
    with_whom: "",
    status: "scheduled",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/residents/${residentId}/health/appointments`, f);
      toast.success("Appointment added");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="New appointment" onClose={onClose} onSubmit={submit} busy={busy} testid="appt-modal">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value })}
          data-testid="appt-kind"
          className={inputCls}
        >
          {Object.entries(APPT_KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          value={f.status}
          onChange={(e) => setF({ ...f, status: e.target.value })}
          className={inputCls}
        >
          <option value="scheduled">Scheduled</option>
          <option value="attended">Attended</option>
          <option value="missed">Missed</option>
          <option value="cancelled">Cancelled</option>
          <option value="rescheduled">Rescheduled</option>
        </select>
      </div>
      <input required placeholder="Title (e.g. Annual asthma review)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="appt-title" className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <input required type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="appt-date" className={inputCls} />
        <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className={inputCls} />
      </div>
      <input placeholder="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className={inputCls} />
      <input placeholder="With (clinician / staff)" value={f.with_whom} onChange={(e) => setF({ ...f, with_whom: e.target.value })} className={inputCls} />
      <textarea rows={2} placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${inputCls} resize-none`} />
    </ModalShell>
  );
}

function ObsModal({ residentId, onClose, onSaved }) {
  const [f, setF] = useState({ kind: "weight", value: "", unit: "kg", recorded_on: todayIso(), notes: "" });
  const [busy, setBusy] = useState(false);
  const unitFor = { weight: "kg", height: "cm", bmi: "", temp: "°C", bp: "mmHg", peak_flow: "L/min", blood_sugar: "mmol/L", pulse: "bpm", other: "" };
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/residents/${residentId}/health/observations`, f);
      toast.success("Observation added");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="New observation" onClose={onClose} onSubmit={submit} busy={busy} testid="obs-modal">
      <select
        value={f.kind}
        onChange={(e) => setF({ ...f, kind: e.target.value, unit: unitFor[e.target.value] })}
        data-testid="obs-kind"
        className={inputCls}
      >
        {Object.entries(OBS_LABEL).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-2">
        <input required placeholder="Value" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} data-testid="obs-value" className={`${inputCls} col-span-2`} />
        <input placeholder="Unit" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className={inputCls} />
      </div>
      <input type="date" value={f.recorded_on} onChange={(e) => setF({ ...f, recorded_on: e.target.value })} className={inputCls} />
      <textarea rows={2} placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${inputCls} resize-none`} />
    </ModalShell>
  );
}

function ImmuModal({ residentId, onClose, onSaved }) {
  const [f, setF] = useState({ vaccine: "", date_given: todayIso(), next_due: "", given_by: "", batch: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/residents/${residentId}/health/immunisations`, f);
      toast.success("Immunisation added");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="New immunisation" onClose={onClose} onSubmit={submit} busy={busy} testid="immu-modal">
      <input required placeholder="Vaccine name (e.g. HPV)" value={f.vaccine} onChange={(e) => setF({ ...f, vaccine: e.target.value })} data-testid="immu-vaccine" className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Date given</div>
          <input required type="date" value={f.date_given} onChange={(e) => setF({ ...f, date_given: e.target.value })} className={inputCls} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Next due</div>
          <input type="date" value={f.next_due} onChange={(e) => setF({ ...f, next_due: e.target.value })} className={inputCls} />
        </div>
      </div>
      <input placeholder="Given by" value={f.given_by} onChange={(e) => setF({ ...f, given_by: e.target.value })} className={inputCls} />
      <input placeholder="Batch" value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} className={inputCls} />
      <textarea rows={2} placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${inputCls} resize-none`} />
    </ModalShell>
  );
}
