import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import {
  ClipboardList, Footprints, ClipboardCheck, Activity, Plus, X, Loader2,
  CheckCircle2, AlertOctagon, AlertTriangle, Clock,
} from "lucide-react";

// ============================================================
// Shared modal shell
// ============================================================
function ModalShell({ title, subtitle, icon: Icon, tone, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl border divider-soft max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 border-b divider-soft flex items-center gap-3 sticky top-0 bg-white">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: tone || "#3F4F8C" }}>
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-[#0F1115]">{title}</div>
            {subtitle && <div className="text-[11px] text-[#5d6068]">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-stone-100"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
        <div className="px-5 py-3 border-t divider-soft sticky bottom-0 bg-white flex items-center gap-2">{footer}</div>
      </div>
    </div>
  );
}

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">
      {label}{required && <span className="text-[#A8273A]"> *</span>}
    </label>
    {children}
  </div>
);

const inputCls = "w-full px-3 py-2.5 rounded-lg border divider-soft text-[14px] focus:ring-2 focus:ring-[#3F4F8C]/20 focus:border-[#3F4F8C] outline-none";
const selectCls = inputCls + " bg-white";

// ============================================================
// Care Tasks
// ============================================================
const CARE_TASK_KINDS = [
  ["morning_routine", "Morning routine"], ["afternoon_routine", "Afternoon routine"],
  ["evening_routine", "Evening routine"], ["personal_care", "Personal care"],
  ["hygiene_support", "Hygiene support"], ["meal_support", "Meal support"],
  ["medication_prompt", "Medication prompt"], ["domestic_support", "Domestic support"],
  ["community_access", "Community access"], ["appointment_support", "Appointment support"],
  ["welfare_check", "Welfare check"],
];

const STATUS_TONE = {
  pending:   { bg: "#eef0f3", fg: "#5d6068", label: "Pending" },
  completed: { bg: "#e7f1eb", fg: "#2F6A3A", label: "Completed" },
  refused:   { bg: "#fdf3e1", fg: "#B8772F", label: "Refused" },
  missed:    { bg: "#fdecec", fg: "#A8273A", label: "Missed" },
};

function CareTaskModal({ residentId, onClose, onSaved }) {
  const [kind, setKind] = useState("personal_care");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(new Date().toISOString().slice(0, 16));
  const [supportMinutes, setSupportMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/residents/${residentId}/care-tasks`, {
        resident_id: residentId, kind, title: title.trim(),
        due_at: new Date(dueAt).toISOString(),
        support_minutes: supportMinutes ? Number(supportMinutes) : null,
        notes: notes.trim() || null,
      });
      toast.success("Care task added");
      onSaved?.(data); onClose();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not save");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell
      title="Add care task" subtitle="Schedule support or routine task"
      icon={ClipboardList} tone="#3F4F8C" onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-[13px] font-medium text-[#2f3038] hover:bg-stone-100">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="ml-auto px-4 py-2 rounded-lg bg-[#3F4F8C] text-white text-[13px] font-semibold hover:bg-[#34416f] disabled:opacity-60 inline-flex items-center gap-2"
            data-testid="care-task-save">
            {busy && <Loader2 size={14} className="animate-spin" />} Add task
          </button>
        </>
      }
    >
      <Field label="Type" required>
        <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)} data-testid="care-task-kind">
          {CARE_TASK_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </Field>
      <Field label="Title" required>
        <input type="text" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder="e.g. Help with breakfast" data-testid="care-task-title" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Due">
          <input type="datetime-local" className={inputCls} value={dueAt} onChange={(e) => setDueAt(e.target.value)}
                 data-testid="care-task-due" />
        </Field>
        <Field label="Support minutes">
          <input type="number" min="0" max="480" className={inputCls} value={supportMinutes}
                 onChange={(e) => setSupportMinutes(e.target.value)} data-testid="care-task-minutes" />
        </Field>
      </div>
      <Field label="Notes">
        <textarea rows={2} className={inputCls + " resize-none"} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </ModalShell>
  );
}

export function CareTasksPanel({ residentId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/residents/${residentId}/care-tasks`, { params: { limit: 100 } });
      setTasks(data || []);
    } catch (e) { toast.error("Could not load care tasks"); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [residentId]);

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/care-tasks/${id}`, { status });
      toast.success(`Marked ${status}`);
      refresh();
    } catch { toast.error("Could not update"); }
  };

  return (
    <div className="space-y-3" data-testid="care-tasks-panel">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[#5d6068]">{tasks.length} task{tasks.length === 1 ? "" : "s"}</span>
        <button onClick={() => setShowAdd(true)}
          className="ml-auto px-3 py-1.5 rounded-lg bg-[#3F4F8C] text-white text-[12px] font-semibold hover:bg-[#34416f] inline-flex items-center gap-1.5"
          data-testid="care-task-add">
          <Plus size={13} /> Add care task
        </button>
      </div>
      {loading ? (
        <div className="py-6 text-center text-[12px] text-[#5d6068] inline-flex items-center justify-center gap-2 w-full"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border divider-soft bg-white p-6 text-center text-[13px] text-[#5d6068]">No care tasks yet.</div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const tone = STATUS_TONE[t.status] || STATUS_TONE.pending;
            return (
              <div key={t.id} className="rounded-xl border divider-soft bg-white p-3" data-testid={`care-task-row-${t.id}`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-[#3F4F8C]">{(t.kind || "").replace(/_/g, " ")}</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
                  {t.support_minutes && <span className="text-[11px] text-[#5d6068]">{t.support_minutes}m</span>}
                </div>
                <div className="text-[13.5px] font-semibold text-[#0F1115]">{t.title}</div>
                <div className="text-[11px] text-[#5d6068] mt-0.5">
                  Due {t.due_at ? new Date(t.due_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                  {t.completed_by_name && ` · ${t.status} by ${t.completed_by_name}`}
                </div>
                {t.notes && <p className="text-[12px] text-[#2f3038] mt-1">{t.notes}</p>}
                {t.status === "pending" && (
                  <div className="flex items-center gap-1 mt-2">
                    <button onClick={() => updateStatus(t.id, "completed")}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#2F6A3A] hover:bg-[#2F6A3A]/10 inline-flex items-center gap-1"
                      data-testid={`care-task-complete-${t.id}`}>
                      <CheckCircle2 size={12} /> Complete
                    </button>
                    <button onClick={() => {
                        const reason = window.prompt("Reason for refusal? (optional)");
                        api.patch(`/care-tasks/${t.id}`, { status: "refused", refused_reason: reason || null }).then(refresh);
                      }}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#B8772F] hover:bg-[#B8772F]/10"
                      data-testid={`care-task-refuse-${t.id}`}>
                      Refused
                    </button>
                    <button onClick={() => updateStatus(t.id, "missed")}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#A8273A] hover:bg-[#A8273A]/10"
                      data-testid={`care-task-miss-${t.id}`}>
                      Missed
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showAdd && <CareTaskModal residentId={residentId} onClose={() => setShowAdd(false)} onSaved={refresh} />}
    </div>
  );
}

// ============================================================
// Falls Register
// ============================================================
function FallModal({ residentId, onClose, onSaved }) {
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [location, setLocation] = useState("");
  const [witnessed, setWitnessed] = useState(false);
  const [witnessName, setWitnessName] = useState("");
  const [injury, setInjury] = useState("none");
  const [injuryDescription, setInjuryDescription] = useState("");
  const [hospital, setHospital] = useState("none");
  const [equipment, setEquipment] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!location.trim()) { toast.error("Location is required"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/residents/${residentId}/falls`, {
        resident_id: residentId,
        occurred_at: new Date(occurredAt).toISOString(),
        location: location.trim(), witnessed,
        witness_name: witnessName.trim() || null,
        injury, injury_description: injuryDescription.trim() || null,
        hospital_involvement: hospital,
        equipment_involved: equipment.trim() || null,
        action_taken: actionTaken.trim() || null,
        follow_up: followUp.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Fall recorded");
      onSaved?.(data); onClose();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not save");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="Log a fall" subtitle="Falls register · CQC notifiable"
      icon={Footprints} tone="#A8273A" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-[13px] font-medium text-[#2f3038] hover:bg-stone-100">Cancel</button>
        <button onClick={submit} disabled={busy}
          className="ml-auto px-4 py-2 rounded-lg bg-[#A8273A] text-white text-[13px] font-semibold hover:bg-[#8e2030] disabled:opacity-60 inline-flex items-center gap-2"
          data-testid="fall-save">
          {busy && <Loader2 size={14} className="animate-spin" />} Record fall
        </button>
      </>}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date / time" required>
          <input type="datetime-local" className={inputCls} value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} data-testid="fall-occurred" />
        </Field>
        <Field label="Location" required>
          <input type="text" className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)}
                 placeholder="e.g. Bathroom" data-testid="fall-location" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Injury">
          <select className={selectCls} value={injury} onChange={(e) => setInjury(e.target.value)} data-testid="fall-injury">
            <option value="none">None</option><option value="minor">Minor</option>
            <option value="moderate">Moderate</option><option value="serious">Serious</option>
          </select>
        </Field>
        <Field label="Hospital involvement">
          <select className={selectCls} value={hospital} onChange={(e) => setHospital(e.target.value)} data-testid="fall-hospital">
            <option value="none">None</option><option value="ambulance_called">Ambulance called</option>
            <option value="a_and_e">A &amp; E</option><option value="admitted">Admitted</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={witnessed} onChange={(e) => setWitnessed(e.target.checked)} data-testid="fall-witnessed" />
        Witnessed
      </label>
      {witnessed && (
        <Field label="Witness name">
          <input type="text" className={inputCls} value={witnessName} onChange={(e) => setWitnessName(e.target.value)} />
        </Field>
      )}
      {injury !== "none" && (
        <Field label="Injury description">
          <textarea rows={2} className={inputCls + " resize-none"} value={injuryDescription} onChange={(e) => setInjuryDescription(e.target.value)} />
        </Field>
      )}
      <Field label="Equipment involved (if any)">
        <input type="text" className={inputCls} value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="e.g. walking frame" />
      </Field>
      <Field label="Action taken">
        <textarea rows={2} className={inputCls + " resize-none"} value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} data-testid="fall-action" />
      </Field>
      <Field label="Follow-up / mobility review">
        <textarea rows={2} className={inputCls + " resize-none"} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea rows={2} className={inputCls + " resize-none"} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </ModalShell>
  );
}

const INJURY_TONE = {
  none: { bg: "#eef0f3", fg: "#5d6068" },
  minor: { bg: "#fdf3e1", fg: "#B8772F" },
  moderate: { bg: "#fdecec", fg: "#A8273A" },
  serious: { bg: "#A8273A", fg: "#fff" },
};

export function FallsPanel({ residentId, isManager }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/residents/${residentId}/falls`);
      setList(data || []);
    } catch { toast.error("Could not load falls"); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [residentId]);

  const signOff = async (id) => {
    try { await api.post(`/falls/${id}/sign-off`); toast.success("Signed off"); refresh(); }
    catch { toast.error("Could not sign off"); }
  };

  return (
    <div className="space-y-3" data-testid="falls-panel">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[#5d6068]">{list.length} fall{list.length === 1 ? "" : "s"} on record</span>
        <button onClick={() => setShowAdd(true)}
          className="ml-auto px-3 py-1.5 rounded-lg bg-[#A8273A] text-white text-[12px] font-semibold hover:bg-[#8e2030] inline-flex items-center gap-1.5"
          data-testid="fall-add">
          <Plus size={13} /> Log fall
        </button>
      </div>
      {loading ? (
        <div className="py-6 text-center text-[12px] text-[#5d6068]">Loading…</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border divider-soft bg-white p-6 text-center text-[13px] text-[#5d6068]">No falls recorded.</div>
      ) : (
        <div className="space-y-2">
          {list.map((f) => {
            const inj = INJURY_TONE[f.injury] || INJURY_TONE.none;
            return (
              <div key={f.id} className="rounded-xl border divider-soft bg-white p-3" style={{ borderLeftColor: "#A8273A", borderLeftWidth: 4 }} data-testid={`fall-row-${f.id}`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Footprints size={14} className="text-[#A8273A]" />
                  <span className="text-[14px] font-semibold text-[#0F1115]">Fall · {f.location}</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: inj.bg, color: inj.fg }}>{f.injury}</span>
                  {f.hospital_involvement && f.hospital_involvement !== "none" && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#A8273A] text-white">{f.hospital_involvement.replace(/_/g, " ")}</span>
                  )}
                  {f.manager_signed_off_by && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#2F6A3A]/15 text-[#2F6A3A]">✓ {f.manager_signed_off_by}</span>
                  )}
                </div>
                <div className="text-[11px] text-[#5d6068]">
                  {new Date(f.occurred_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  · {f.witnessed ? "Witnessed" : "Unwitnessed"}
                  {f.reported_by_name && ` · by ${f.reported_by_name}`}
                </div>
                {f.action_taken && <p className="text-[12px] text-[#2f3038] mt-1"><span className="font-semibold">Action: </span>{f.action_taken}</p>}
                {f.follow_up && <p className="text-[12px] text-[#2f3038]"><span className="font-semibold">Follow-up: </span>{f.follow_up}</p>}
                {isManager && !f.manager_signed_off_by && (
                  <button onClick={() => signOff(f.id)}
                    className="mt-2 px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#2F6A3A] hover:bg-[#2F6A3A]/10"
                    data-testid={`fall-signoff-${f.id}`}>
                    Manager sign-off
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showAdd && <FallModal residentId={residentId} onClose={() => setShowAdd(false)} onSaved={refresh} />}
    </div>
  );
}

// ============================================================
// Mobility
// ============================================================
function MobilityModal({ residentId, onClose, onSaved }) {
  const [mobilityLevel, setMobilityLevel] = useState("independent");
  const [fallsRisk, setFallsRisk] = useState("low");
  const [walkingAids, setWalkingAids] = useState("");
  const [transferSupport, setTransferSupport] = useState("");
  const [movingHandlingNeeds, setMovingHandlingNeeds] = useState("");
  const [equipmentRequired, setEquipmentRequired] = useState("");
  const [environmentalRisks, setEnvironmentalRisks] = useState("");
  const [staffGuidance, setStaffGuidance] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/residents/${residentId}/mobility`, {
        resident_id: residentId,
        mobility_level: mobilityLevel,
        falls_risk: fallsRisk,
        walking_aids: walkingAids.trim() ? walkingAids.split(",").map((s) => s.trim()) : null,
        transfer_support: transferSupport.trim() || null,
        moving_handling_needs: movingHandlingNeeds.trim() || null,
        equipment_required: equipmentRequired.trim() ? equipmentRequired.split(",").map((s) => s.trim()) : null,
        environmental_risks: environmentalRisks.trim() || null,
        staff_guidance: staffGuidance.trim() || null,
        review_date: reviewDate || null,
      });
      toast.success("Mobility assessment saved");
      onSaved?.(data); onClose();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not save");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="Mobility assessment" subtitle="Falls risk &amp; moving / handling"
      icon={Footprints} tone="#3F4F8C" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-[13px] font-medium text-[#2f3038] hover:bg-stone-100">Cancel</button>
        <button onClick={submit} disabled={busy}
          className="ml-auto px-4 py-2 rounded-lg bg-[#3F4F8C] text-white text-[13px] font-semibold hover:bg-[#34416f] disabled:opacity-60 inline-flex items-center gap-2"
          data-testid="mobility-save">
          {busy && <Loader2 size={14} className="animate-spin" />} Save
        </button>
      </>}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Mobility level">
          <select className={selectCls} value={mobilityLevel} onChange={(e) => setMobilityLevel(e.target.value)} data-testid="mobility-level">
            <option value="independent">Independent</option><option value="walking_aid">Walking aid</option>
            <option value="wheelchair">Wheelchair</option><option value="hoist_required">Hoist required</option>
            <option value="bedbound">Bedbound</option>
          </select>
        </Field>
        <Field label="Falls risk">
          <select className={selectCls} value={fallsRisk} onChange={(e) => setFallsRisk(e.target.value)} data-testid="mobility-falls-risk">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </Field>
      </div>
      <Field label="Walking aids (comma separated)">
        <input type="text" className={inputCls} value={walkingAids} onChange={(e) => setWalkingAids(e.target.value)} placeholder="zimmer frame, walking stick" />
      </Field>
      <Field label="Transfer support">
        <textarea rows={2} className={inputCls + " resize-none"} value={transferSupport} onChange={(e) => setTransferSupport(e.target.value)} />
      </Field>
      <Field label="Moving &amp; handling needs">
        <textarea rows={2} className={inputCls + " resize-none"} value={movingHandlingNeeds} onChange={(e) => setMovingHandlingNeeds(e.target.value)} />
      </Field>
      <Field label="Equipment required (comma separated)">
        <input type="text" className={inputCls} value={equipmentRequired} onChange={(e) => setEquipmentRequired(e.target.value)} placeholder="hoist, slide sheet" />
      </Field>
      <Field label="Environmental risks">
        <textarea rows={2} className={inputCls + " resize-none"} value={environmentalRisks} onChange={(e) => setEnvironmentalRisks(e.target.value)} />
      </Field>
      <Field label="Staff guidance">
        <textarea rows={3} className={inputCls + " resize-none"} value={staffGuidance} onChange={(e) => setStaffGuidance(e.target.value)} />
      </Field>
      <Field label="Review date">
        <input type="date" className={inputCls} value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
      </Field>
    </ModalShell>
  );
}

const RISK_TONE = { low: "#2F6A3A", medium: "#B8772F", high: "#A8273A" };

export function MobilityPanel({ residentId }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try { const { data } = await api.get(`/residents/${residentId}/mobility`); setList(data || []); }
    catch { toast.error("Could not load mobility"); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [residentId]);

  const latest = list[0];
  return (
    <div className="space-y-3" data-testid="mobility-panel">
      <div className="flex items-center gap-2">
        {latest && (
          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: (RISK_TONE[latest.falls_risk] || "#5d6068") + "18", color: RISK_TONE[latest.falls_risk] || "#5d6068" }}>
            Falls risk: {latest.falls_risk}
          </span>
        )}
        <button onClick={() => setShowAdd(true)}
          className="ml-auto px-3 py-1.5 rounded-lg bg-[#3F4F8C] text-white text-[12px] font-semibold hover:bg-[#34416f] inline-flex items-center gap-1.5"
          data-testid="mobility-add">
          <Plus size={13} /> New assessment
        </button>
      </div>
      {loading ? <div className="py-6 text-center text-[12px] text-[#5d6068]">Loading…</div>
        : list.length === 0 ? <div className="rounded-xl border divider-soft bg-white p-6 text-center text-[13px] text-[#5d6068]">No mobility assessments yet.</div>
        : <div className="space-y-2">
            {list.map((m) => (
              <div key={m.id} className="rounded-xl border divider-soft bg-white p-3" data-testid={`mobility-row-${m.id}`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[13.5px] font-semibold text-[#0F1115]">{(m.mobility_level || "—").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded text-white" style={{ background: RISK_TONE[m.falls_risk] || "#5d6068" }}>Falls: {m.falls_risk}</span>
                </div>
                <div className="text-[11px] text-[#5d6068]">
                  {new Date(m.assessed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  · {m.assessor_name}
                  {m.review_date && ` · review ${new Date(m.review_date).toLocaleDateString("en-GB")}`}
                </div>
                {m.staff_guidance && <p className="text-[12px] text-[#2f3038] mt-1">{m.staff_guidance}</p>}
                {(m.walking_aids?.length || m.equipment_required?.length) && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[...(m.walking_aids || []), ...(m.equipment_required || [])].map((item, i) => (
                      <span key={i} className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-[#5d6068]">{item}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>}
      {showAdd && <MobilityModal residentId={residentId} onClose={() => setShowAdd(false)} onSaved={refresh} />}
    </div>
  );
}

// ============================================================
// MCA / Capacity
// ============================================================
function MCAModal({ residentId, onClose, onSaved }) {
  const [topic, setTopic] = useState("");
  const [outcome, setOutcome] = useState("has_capacity");
  const [communicationNeeds, setCommunicationNeeds] = useState("");
  const [understand, setUnderstand] = useState(true);
  const [retain, setRetain] = useState(true);
  const [weigh, setWeigh] = useState(true);
  const [communicate, setCommunicate] = useState(true);
  const [bestInterest, setBestInterest] = useState("");
  const [advocate, setAdvocate] = useState(false);
  const [advocateName, setAdvocateName] = useState("");
  const [family, setFamily] = useState(false);
  const [familyNotes, setFamilyNotes] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!topic.trim()) { toast.error("Decision topic is required"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/residents/${residentId}/mca`, {
        resident_id: residentId, decision_topic: topic.trim(),
        capacity_outcome: outcome,
        communication_needs: communicationNeeds.trim() || null,
        can_understand: understand, can_retain: retain, can_weigh: weigh, can_communicate: communicate,
        best_interest_decision: outcome !== "has_capacity" ? (bestInterest.trim() || null) : null,
        advocate_involved: advocate, advocate_name: advocate ? (advocateName.trim() || null) : null,
        family_involved: family, family_notes: family ? (familyNotes.trim() || null) : null,
        review_date: reviewDate || null,
      });
      toast.success("MCA assessment saved");
      onSaved?.(data); onClose();
    } catch (e) {
      const msg = formatApiError(e?.response?.data?.detail);
      toast.error(msg?.includes("403") || e?.response?.status === 403
        ? "Senior+ required for MCA assessments"
        : (msg || "Could not save"));
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="MCA / Capacity assessment" subtitle="Decision-specific capacity"
      icon={ClipboardCheck} tone="#7A4F8C" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-[13px] font-medium text-[#2f3038] hover:bg-stone-100">Cancel</button>
        <button onClick={submit} disabled={busy}
          className="ml-auto px-4 py-2 rounded-lg bg-[#7A4F8C] text-white text-[13px] font-semibold hover:bg-[#623f70] disabled:opacity-60 inline-flex items-center gap-2"
          data-testid="mca-save">
          {busy && <Loader2 size={14} className="animate-spin" />} Save
        </button>
      </>}>
      <Field label="Decision topic" required>
        <input type="text" className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)}
               placeholder="e.g. Choosing where to live" data-testid="mca-topic" />
      </Field>
      <Field label="Communication needs">
        <textarea rows={2} className={inputCls + " resize-none"} value={communicationNeeds} onChange={(e) => setCommunicationNeeds(e.target.value)} />
      </Field>
      <Field label="Capacity to:">
        <div className="grid grid-cols-2 gap-1.5 text-[12px]">
          {[
            ["understand", understand, setUnderstand, "Understand"],
            ["retain", retain, setRetain, "Retain"],
            ["weigh", weigh, setWeigh, "Weigh up"],
            ["communicate", communicate, setCommunicate, "Communicate"],
          ].map(([k, v, set, label]) => (
            <label key={k} className="flex items-center gap-2 px-3 py-2 rounded-lg border divider-soft bg-stone-50 cursor-pointer">
              <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Outcome">
        <select className={selectCls} value={outcome} onChange={(e) => setOutcome(e.target.value)} data-testid="mca-outcome">
          <option value="has_capacity">Has capacity</option>
          <option value="lacks_capacity">Lacks capacity</option>
          <option value="fluctuating">Fluctuating</option>
        </select>
      </Field>
      {outcome !== "has_capacity" && (
        <Field label="Best interest decision">
          <textarea rows={3} className={inputCls + " resize-none"} value={bestInterest} onChange={(e) => setBestInterest(e.target.value)} />
        </Field>
      )}
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={advocate} onChange={(e) => setAdvocate(e.target.checked)} /> Advocate involved
      </label>
      {advocate && (
        <Field label="Advocate name"><input type="text" className={inputCls} value={advocateName} onChange={(e) => setAdvocateName(e.target.value)} /></Field>
      )}
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={family} onChange={(e) => setFamily(e.target.checked)} /> Family involved
      </label>
      {family && (
        <Field label="Family notes"><textarea rows={2} className={inputCls + " resize-none"} value={familyNotes} onChange={(e) => setFamilyNotes(e.target.value)} /></Field>
      )}
      <Field label="Review date">
        <input type="date" className={inputCls} value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
      </Field>
    </ModalShell>
  );
}

const OUTCOME_TONE = {
  has_capacity: { bg: "#e7f1eb", fg: "#2F6A3A", label: "Has capacity" },
  lacks_capacity: { bg: "#fdecec", fg: "#A8273A", label: "Lacks capacity" },
  fluctuating: { bg: "#fdf3e1", fg: "#B8772F", label: "Fluctuating" },
};

export function MCAPanel({ residentId, isSenior, isManager }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try { const { data } = await api.get(`/residents/${residentId}/mca`); setList(data || []); }
    catch { toast.error("Could not load MCA"); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [residentId]);

  const signOff = async (id) => {
    try { await api.post(`/mca/${id}/sign-off`); toast.success("Signed off"); refresh(); }
    catch { toast.error("Could not sign off"); }
  };

  return (
    <div className="space-y-3" data-testid="mca-panel">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[#5d6068]">{list.length} assessment{list.length === 1 ? "" : "s"}</span>
        {isSenior && (
          <button onClick={() => setShowAdd(true)}
            className="ml-auto px-3 py-1.5 rounded-lg bg-[#7A4F8C] text-white text-[12px] font-semibold hover:bg-[#623f70] inline-flex items-center gap-1.5"
            data-testid="mca-add">
            <Plus size={13} /> New MCA
          </button>
        )}
      </div>
      {loading ? <div className="py-6 text-center text-[12px] text-[#5d6068]">Loading…</div>
        : list.length === 0 ? <div className="rounded-xl border divider-soft bg-white p-6 text-center text-[13px] text-[#5d6068]">No MCA assessments yet.</div>
        : <div className="space-y-2">
            {list.map((m) => {
              const tone = OUTCOME_TONE[m.capacity_outcome] || OUTCOME_TONE.has_capacity;
              return (
                <div key={m.id} className="rounded-xl border divider-soft bg-white p-3" data-testid={`mca-row-${m.id}`}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <ClipboardCheck size={14} style={{ color: tone.fg }} />
                    <span className="text-[13.5px] font-semibold text-[#0F1115]">{m.decision_topic}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
                    {m.manager_signed_off_by && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#2F6A3A]/15 text-[#2F6A3A]">✓ {m.manager_signed_off_by}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#5d6068]">
                    {new Date(m.assessed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    · {m.assessor_name}
                    {m.review_date && ` · review ${new Date(m.review_date).toLocaleDateString("en-GB")}`}
                  </div>
                  {m.best_interest_decision && (
                    <p className="text-[12px] text-[#2f3038] mt-1"><span className="font-semibold">Best interest: </span>{m.best_interest_decision}</p>
                  )}
                  {isManager && !m.manager_signed_off_by && (
                    <button onClick={() => signOff(m.id)}
                      className="mt-2 px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#2F6A3A] hover:bg-[#2F6A3A]/10"
                      data-testid={`mca-signoff-${m.id}`}>
                      Manager sign-off
                    </button>
                  )}
                </div>
              );
            })}
          </div>}
      {showAdd && <MCAModal residentId={residentId} onClose={() => setShowAdd(false)} onSaved={refresh} />}
    </div>
  );
}

// ============================================================
// Wellbeing observations
// ============================================================
function WellbeingModal({ residentId, onClose, onSaved }) {
  const [mood, setMood] = useState("stable");
  const [hydration, setHydration] = useState("adequate");
  const [nutrition, setNutrition] = useState("adequate");
  const [sleep, setSleep] = useState("adequate");
  const [engagement, setEngagement] = useState("");
  const [presentation, setPresentation] = useState("");
  const [mhConcerns, setMhConcerns] = useState("");
  const [snConcerns, setSnConcerns] = useState("");
  const [socialInteraction, setSocialInteraction] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/residents/${residentId}/wellbeing`, {
        resident_id: residentId, mood,
        hydration_level: hydration, nutrition_intake: nutrition, sleep_quality: sleep,
        engagement: engagement.trim() || null, presentation: presentation.trim() || null,
        mental_health_concerns: mhConcerns.trim() || null,
        self_neglect_concerns: snConcerns.trim() || null,
        social_interaction: socialInteraction.trim() || null,
        notes: notes.trim() || null,
      });
      if (data.deterioration_flag) toast.warning("Deterioration flagged — escalate to senior staff");
      else toast.success("Observation recorded");
      onSaved?.(data); onClose();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Could not save"); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell title="Wellbeing observation" subtitle="Mood · hydration · nutrition · sleep"
      icon={Activity} tone="#2F6A3A" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-[13px] font-medium text-[#2f3038] hover:bg-stone-100">Cancel</button>
        <button onClick={submit} disabled={busy}
          className="ml-auto px-4 py-2 rounded-lg bg-[#2F6A3A] text-white text-[13px] font-semibold hover:bg-[#264f2c] disabled:opacity-60 inline-flex items-center gap-2"
          data-testid="wellbeing-save">
          {busy && <Loader2 size={14} className="animate-spin" />} Record
        </button>
      </>}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Mood">
          <select className={selectCls} value={mood} onChange={(e) => setMood(e.target.value)} data-testid="wellbeing-mood">
            <option value="positive">Positive</option><option value="stable">Stable</option>
            <option value="flat">Flat</option><option value="low">Low</option>
            <option value="agitated">Agitated</option><option value="withdrawn">Withdrawn</option>
          </select>
        </Field>
        <Field label="Hydration">
          <select className={selectCls} value={hydration} onChange={(e) => setHydration(e.target.value)} data-testid="wellbeing-hydration">
            <option value="good">Good</option><option value="adequate">Adequate</option>
            <option value="poor">Poor</option><option value="none">None</option>
          </select>
        </Field>
        <Field label="Nutrition">
          <select className={selectCls} value={nutrition} onChange={(e) => setNutrition(e.target.value)}>
            <option value="good">Good</option><option value="adequate">Adequate</option>
            <option value="poor">Poor</option><option value="none">None</option>
          </select>
        </Field>
        <Field label="Sleep">
          <select className={selectCls} value={sleep} onChange={(e) => setSleep(e.target.value)}>
            <option value="good">Good</option><option value="adequate">Adequate</option>
            <option value="poor">Poor</option><option value="disturbed">Disturbed</option>
          </select>
        </Field>
      </div>
      <Field label="Engagement"><input type="text" className={inputCls} value={engagement} onChange={(e) => setEngagement(e.target.value)} placeholder="e.g. Joined activity, refused TV" /></Field>
      <Field label="Presentation"><input type="text" className={inputCls} value={presentation} onChange={(e) => setPresentation(e.target.value)} placeholder="e.g. Tidy, clean, dressed" /></Field>
      <Field label="Mental health concerns"><textarea rows={2} className={inputCls + " resize-none"} value={mhConcerns} onChange={(e) => setMhConcerns(e.target.value)} /></Field>
      <Field label="Self-neglect concerns"><textarea rows={2} className={inputCls + " resize-none"} value={snConcerns} onChange={(e) => setSnConcerns(e.target.value)} /></Field>
      <Field label="Notes"><textarea rows={2} className={inputCls + " resize-none"} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </ModalShell>
  );
}

const MOOD_TONE = {
  positive: "#2F6A3A", stable: "#5d6068", flat: "#5d6068",
  low: "#A8273A", agitated: "#A8273A", withdrawn: "#A8273A",
};

export function WellbeingPanel({ residentId }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try { const { data } = await api.get(`/residents/${residentId}/wellbeing`); setList(data || []); }
    catch { toast.error("Could not load wellbeing"); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [residentId]);

  return (
    <div className="space-y-3" data-testid="wellbeing-panel">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[#5d6068]">{list.length} observation{list.length === 1 ? "" : "s"}</span>
        <button onClick={() => setShowAdd(true)}
          className="ml-auto px-3 py-1.5 rounded-lg bg-[#2F6A3A] text-white text-[12px] font-semibold hover:bg-[#264f2c] inline-flex items-center gap-1.5"
          data-testid="wellbeing-add">
          <Plus size={13} /> Record observation
        </button>
      </div>
      {loading ? <div className="py-6 text-center text-[12px] text-[#5d6068]">Loading…</div>
        : list.length === 0 ? <div className="rounded-xl border divider-soft bg-white p-6 text-center text-[13px] text-[#5d6068]">No observations yet.</div>
        : <div className="space-y-2">
            {list.map((w) => (
              <div key={w.id}
                className="rounded-xl border divider-soft bg-white p-3"
                style={{ borderLeftColor: w.deterioration_flag ? "#A8273A" : "#2F6A3A", borderLeftWidth: 4 }}
                data-testid={`wellbeing-row-${w.id}`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Activity size={13} style={{ color: w.deterioration_flag ? "#A8273A" : "#2F6A3A" }} />
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded text-white" style={{ background: MOOD_TONE[w.mood] || "#5d6068" }}>Mood: {w.mood}</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-[#5d6068]">Hydration: {w.hydration_level}</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-[#5d6068]">Sleep: {w.sleep_quality}</span>
                  {w.deterioration_flag && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#A8273A] text-white">Deterioration</span>
                  )}
                </div>
                <div className="text-[11px] text-[#5d6068]">
                  {new Date(w.observed_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  · {w.observer_name}
                </div>
                {w.notes && <p className="text-[12px] text-[#2f3038] mt-1">{w.notes}</p>}
                {w.mental_health_concerns && <p className="text-[12px] text-[#A8273A] mt-1"><span className="font-semibold">MH: </span>{w.mental_health_concerns}</p>}
              </div>
            ))}
          </div>}
      {showAdd && <WellbeingModal residentId={residentId} onClose={() => setShowAdd(false)} onSaved={refresh} />}
    </div>
  );
}
