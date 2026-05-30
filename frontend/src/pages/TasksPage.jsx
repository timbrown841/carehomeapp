/* Phase E.2 — Care Task Scheduler — full-page view.
 *
 * Manager/senior CRUD over the home's scheduled tasks. Staff get a
 * "My Tasks" personal view. Lives at /tasks plus embedded in Home Ops +
 * Staff Ops hubs.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CheckSquare, Plus, Clock3, AlertOctagon, Calendar, Filter,
  Loader2, Trash2, CircleCheck, Activity, RefreshCw, ChevronRight,
} from "lucide-react";

const KIND_LABELS = {
  key_work: "Key work session",
  supervision: "Supervision",
  team_meeting: "Team meeting",
  lac_review: "LAC review",
  pep_meeting: "PEP meeting",
  family_time: "Family time / contact",
  health_appointment: "Health appointment",
  independent_living: "Independent living",
  training_renewal: "Training renewal",
  reg44_action: "Reg 44 action",
  ofsted_action: "Ofsted action",
  custom: "Custom",
};

const PRIORITY_TONE = {
  critical: { bg: "bg-rose-100", fg: "text-rose-800", label: "Critical" },
  high: { bg: "bg-amber-100", fg: "text-amber-800", label: "High" },
  medium: { bg: "bg-stone-100", fg: "text-stone-700", label: "Medium" },
  low: { bg: "bg-stone-50", fg: "text-stone-600", label: "Low" },
};

const STATUS_TONE = {
  pending: { bg: "bg-stone-100", fg: "text-stone-700", label: "Pending" },
  in_progress: { bg: "bg-blue-50", fg: "text-blue-800", label: "In progress" },
  completed: { bg: "bg-emerald-50", fg: "text-emerald-800", label: "Completed" },
  cancelled: { bg: "bg-stone-50", fg: "text-stone-500", label: "Cancelled" },
  overdue: { bg: "bg-rose-100", fg: "text-rose-800", label: "Overdue" },
};


export default function TasksPage() {
  const { user, isSeniorOrAbove } = useAuth();
  if (!isSeniorOrAbove) return <StaffTasksView userId={user?.id} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto" data-testid="tasks-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          Care Task Scheduler
        </div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">
          Tasks
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          Recurring and one-off work — key work, supervisions, LAC reviews, Reg 44 actions and more.
        </p>
      </header>
      <TasksHub />
    </div>
  );
}


/* The reusable hub — used at /tasks AND embedded in Home Ops / Staff Ops tabs. */
export function TasksHub() {
  const { isManagerOrAbove } = useAuth();
  const [tab, setTab] = useState("open");
  const [filter, setFilter] = useState({ kind: "", assigned_to_id: "" });
  const [tasks, setTasks] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = tab === "all" ? undefined : tab;
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      if (filter.kind) q.set("kind", filter.kind);
      if (filter.assigned_to_id) q.set("assigned_to_id", filter.assigned_to_id);
      const [t, d] = await Promise.all([
        api.get(`/tasks?${q.toString()}`),
        api.get("/tasks/dashboard"),
      ]);
      setTasks(t.data.tasks || []);
      setDashboard(d.data);
    } catch { toast.error("Could not load tasks"); }
    finally { setLoading(false); }
  }, [tab, filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4" data-testid="tasks-hub">
      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryTile label="Total open" value={dashboard.total_open} />
          <SummaryTile label="Overdue" value={dashboard.overdue.length} tone={dashboard.overdue.length > 0 ? "red" : "green"} testid="tasks-summary-overdue" />
          <SummaryTile label="Due in 7d" value={dashboard.upcoming_7d.length} tone="amber" />
          <SummaryTile label="On-time (30d)"
                       value={`${dashboard.compliance_pct}%`}
                       tone={dashboard.compliance_pct >= 85 ? "green" : dashboard.compliance_pct >= 65 ? "amber" : "red"}
                       testid="tasks-summary-compliance" />
        </div>
      )}

      <div className="bg-white border divider-soft rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-stone-200 bg-stone-50">
          <div className="flex gap-1">
            {[
              { id: "open", label: "Open" },
              { id: "overdue", label: "Overdue" },
              { id: "completed", label: "Completed" },
              { id: "all", label: "All" },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === t.id ? "bg-white text-[#0F1115] shadow-sm" : "text-stone-600 hover:bg-white"}`}
                      data-testid={`tasks-tab-${t.id}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select className="border rounded-lg text-xs px-2 py-1.5" value={filter.kind} onChange={e => setFilter({...filter, kind: e.target.value})} data-testid="tasks-kind-filter">
              <option value="">All kinds</option>
              {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {isManagerOrAbove && (
              <Button size="sm" onClick={() => setShowAdd(true)} data-testid="tasks-add">
                <Plus size={14} className="mr-1" /> New task
              </Button>
            )}
          </div>
        </div>

        <div className="p-3">
          {loading ? (
            <div className="text-sm text-stone-600 inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-10 text-sm text-stone-500">
              No tasks matching the current filters.
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {tasks.map(t => (
                <TaskRow key={t.id} task={t} onChanged={load} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {showAdd && <TaskModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function SummaryTile({ label, value, tone = "grey", testid }) {
  const map = {
    red: "bg-rose-50 text-rose-800 border-rose-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    grey: "bg-stone-50 text-stone-700 border-stone-200",
  };
  return (
    <div className={`rounded-xl border p-3 ${map[tone]}`} data-testid={testid}>
      <div className="font-display font-semibold text-2xl leading-none">{value}</div>
      <div className="text-[11px] font-semibold mt-1.5">{label}</div>
    </div>
  );
}

function TaskRow({ task, onChanged }) {
  const { isManagerOrAbove, user } = useAuth();
  const [showComplete, setShowComplete] = useState(false);
  const status = task.computed_status || task.status;
  const stTone = STATUS_TONE[status] || STATUS_TONE.pending;
  const prTone = PRIORITY_TONE[task.priority] || PRIORITY_TONE.medium;

  const remove = async () => {
    if (!confirm("Delete this task?")) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      toast.success("Deleted"); onChanged();
    } catch { toast.error("Could not delete"); }
  };

  const start = async () => {
    try {
      await api.patch(`/tasks/${task.id}`, { status: "in_progress" });
      toast.success("Marked in progress"); onChanged();
    } catch { toast.error("Could not update"); }
  };

  const isMine = task.assigned_to_id === user?.id;
  const canComplete = isMine || isManagerOrAbove;
  const isFinal = status === "completed" || status === "cancelled";

  return (
    <li className="py-3" data-testid={`task-row-${task.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${stTone.bg} ${stTone.fg}`}>{stTone.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${prTone.bg} ${prTone.fg}`}>{prTone.label}</span>
            <span className="text-[10px] text-stone-500">{KIND_LABELS[task.kind] || task.kind}</span>
            {task.recurrence && task.recurrence.kind !== "none" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 inline-flex items-center gap-0.5">
                <RefreshCw size={9} /> {task.recurrence.kind}
              </span>
            )}
            {task.linked_supervision_id && (
              <span className="text-[10px] text-purple-700">↗ supervision</span>
            )}
          </div>
          <div className="text-sm text-stone-800 mt-1">{task.title}</div>
          {task.description && <div className="text-[11px] text-stone-500 mt-0.5">{task.description}</div>}
          <div className="text-[11px] text-stone-500 mt-1">
            Due {(task.due_at || "").slice(0, 10)}
            {task.assigned_to_name ? ` · ${task.assigned_to_name}` : ""}
          </div>
          {task.evidence && (
            <div className="text-[11px] text-emerald-700 mt-1 italic">✓ {task.evidence}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!isFinal && status === "pending" && canComplete && (
            <button onClick={start} className="text-xs text-blue-700 hover:underline" data-testid={`task-start-${task.id}`}>Start</button>
          )}
          {!isFinal && canComplete && (
            <button onClick={() => setShowComplete(true)} className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                    data-testid={`task-complete-${task.id}`}>
              <CircleCheck size={12} /> Complete
            </button>
          )}
          {isManagerOrAbove && (
            <button onClick={remove} className="text-stone-400 hover:text-rose-700" data-testid={`task-del-${task.id}`}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {showComplete && <CompleteModal task={task} onClose={() => setShowComplete(false)} onSaved={() => { setShowComplete(false); onChanged(); }} />}
    </li>
  );
}


/* === Task creation modal === */
function TaskModal({ onClose, onSaved }) {
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    kind: "custom",
    title: "",
    description: "",
    assigned_to_id: "",
    due_at: "",
    priority: "medium",
    recurrence_kind: "none",
    recurrence_interval: 1,
    recurrence_dow: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/tasks/templates").then(r => setTemplates(r.data.templates || []));
    api.get("/auth/users").then(r => setUsers(Array.isArray(r.data) ? r.data : (r.data.users || [])));
  }, []);

  const applyTemplate = (kind) => {
    const tpl = templates.find(t => t.kind === kind);
    if (!tpl) return;
    const rec = tpl.default_recurrence || { kind: "none" };
    setForm({
      ...form,
      kind,
      title: form.title || tpl.title,
      recurrence_kind: rec.kind || "none",
      recurrence_interval: rec.interval || 1,
    });
  };

  const submit = async () => {
    if (!form.title || !form.due_at) {
      toast.error("Title and due date required"); return;
    }
    setSaving(true);
    const payload = {
      kind: form.kind,
      title: form.title,
      description: form.description || undefined,
      assigned_to_id: form.assigned_to_id || undefined,
      due_at: form.due_at,
      priority: form.priority,
    };
    if (form.recurrence_kind !== "none") {
      payload.recurrence = {
        kind: form.recurrence_kind,
        interval: Number(form.recurrence_interval) || 1,
        day_of_week: form.recurrence_dow !== "" ? Number(form.recurrence_dow) : undefined,
      };
    }
    try {
      await api.post("/tasks", payload);
      toast.success("Task created");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="task-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="font-display font-semibold text-lg">New task</div>

        <Field label="Template (sets defaults)">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.kind}
                  onChange={e => applyTemplate(e.target.value)} data-testid="task-template">
            {templates.map(t => <option key={t.kind} value={t.kind}>{t.title}</option>)}
          </select>
        </Field>

        <Field label="Title">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.title}
                 onChange={e => setForm({...form, title: e.target.value})} data-testid="task-title" />
        </Field>

        <Field label="Description">
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Assignee">
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.assigned_to_id}
                    onChange={e => setForm({...form, assigned_to_id: e.target.value})} data-testid="task-assignee">
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.priority}
                    onChange={e => setForm({...form, priority: e.target.value})}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
        </div>

        <Field label="Due date">
          <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.due_at}
                 onChange={e => setForm({...form, due_at: e.target.value})} data-testid="task-due" />
        </Field>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Recurrence">
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.recurrence_kind}
                    onChange={e => setForm({...form, recurrence_kind: e.target.value})} data-testid="task-recur-kind">
              <option value="none">One-off</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </Field>
          {form.recurrence_kind !== "none" && (
            <>
              <Field label="Every (interval)">
                <input type="number" min="1" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.recurrence_interval}
                       onChange={e => setForm({...form, recurrence_interval: e.target.value})} />
              </Field>
              {(form.recurrence_kind === "weekly" || form.recurrence_kind === "fortnightly") && (
                <Field label="Day of week">
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.recurrence_dow}
                          onChange={e => setForm({...form, recurrence_dow: e.target.value})}>
                    <option value="">Same as due</option>
                    <option value="0">Mon</option><option value="1">Tue</option>
                    <option value="2">Wed</option><option value="3">Thu</option>
                    <option value="4">Fri</option><option value="5">Sat</option>
                    <option value="6">Sun</option>
                  </select>
                </Field>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="task-save">
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null} Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompleteModal({ task, onClose, onSaved }) {
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!evidence.trim()) { toast.error("Evidence required"); return; }
    setSaving(true);
    try {
      const r = await api.post(`/tasks/${task.id}/complete`, { evidence });
      if (r.data.next_task_id) toast.success("Completed — next recurrence scheduled");
      else toast.success("Task completed");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="task-complete-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <div className="font-display font-semibold text-lg">Complete task</div>
        <div className="text-sm text-stone-600">{task.title}</div>
        <Field label="Completion evidence">
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={4} value={evidence}
                    onChange={e => setEvidence(e.target.value)} placeholder="What was done? Outcome, next steps, signatures…"
                    data-testid="task-complete-evidence" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="task-complete-save">
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null} Complete
          </Button>
        </div>
      </div>
    </div>
  );
}


/* === Staff view === */
function StaffTasksView() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/tasks/mine");
      setTasks(r.data.tasks || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5 max-w-4xl mx-auto" data-testid="tasks-page-staff">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          My Tasks
        </div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">
          Tasks assigned to me
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          Open work for the next 30 days.
        </p>
      </header>
      <div className="bg-white border divider-soft rounded-2xl p-4">
        {loading ? (
          <div className="text-sm text-stone-600 inline-flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-sm text-stone-500">
            Nothing on your plate. Have a great shift.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {tasks.map(t => (<TaskRow key={t.id} task={t} onChanged={load} />))}
          </ul>
        )}
      </div>
    </div>
  );
}


function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase font-semibold tracking-wider text-stone-600 mb-1">{label}</div>
      {children}
    </label>
  );
}
