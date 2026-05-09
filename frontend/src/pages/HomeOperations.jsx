import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api, { API, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Building2,
  Thermometer,
  Snowflake,
  Droplets,
  BellRing,
  Flame,
  Lightbulb,
  Siren,
  Syringe,
  Square,
  Car,
  Sparkles,
  ShieldCheck,
  DoorOpen,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CircleSlash,
  Plus,
  X,
  FileDown,
  Loader2,
  ChevronRight,
  ListChecks,
  History as HistoryIcon,
  CalendarClock,
} from "lucide-react";

const ICON_MAP = {
  Thermometer, Snowflake, Droplets, BellRing, Flame, Lightbulb, Siren,
  Syringe, Square, Car, Sparkles, ShieldCheck, DoorOpen,
};

const STATUS_TONE = {
  overdue:   { label: "Overdue",   bg: "#fdecec", fg: "#A8273A", border: "#A8273A" },
  due_soon:  { label: "Due soon",  bg: "#fdf3e1", fg: "#B8772F", border: "#B8772F" },
  ok:        { label: "Up to date",bg: "#e7f1eb", fg: "#2F6A3A", border: "#2F6A3A" },
  never:     { label: "Never logged", bg: "#eef0f3", fg: "#5d6068", border: "#8a8d95" },
};

const SEVERITY_TONE = {
  low: { bg: "#eef0f3", fg: "#5d6068" },
  medium: { bg: "#e3edf2", fg: "#0e3b4a" },
  high: { bg: "#fdf3e1", fg: "#B8772F" },
  urgent: { bg: "#fdecec", fg: "#A8273A" },
};

const LOG_RESULT_TONE = {
  ok: { label: "OK", bg: "#e7f1eb", fg: "#2F6A3A" },
  action_needed: { label: "Action", bg: "#fdf3e1", fg: "#B8772F" },
  fail: { label: "Fail", bg: "#fdecec", fg: "#A8273A" },
};

function StatusPill({ status }) {
  const t = STATUS_TONE[status] || STATUS_TONE.never;
  return (
    <span
      className="inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: t.bg, color: t.fg }}
      data-testid={`pill-${status}`}
    >
      {t.label}
    </span>
  );
}

function fmt(iso, opts = {}) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (opts.dateOnly) {
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }
    return d.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function relTime(iso) {
  if (!iso) return "Never";
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
    return fmt(iso, { dateOnly: true });
  } catch {
    return "—";
  }
}

// ------------------------------ Quick-entry modal ------------------------------
function QuickLogModal({ checkType, onClose, onSaved }) {
  const [values, setValues] = useState(() => {
    const v = {};
    (checkType.fields || []).forEach((f) => {
      v[f.key] = f.type === "checkbox" ? false : "";
    });
    return v;
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const setField = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    // Client-side required check
    for (const f of checkType.fields || []) {
      if (f.required) {
        const v = values[f.key];
        if (v === "" || v === null || v === undefined || (f.type === "checkbox" && !v)) {
          toast.error(`${f.label} is required`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      // Coerce numbers
      const payloadValues = { ...values };
      for (const f of checkType.fields || []) {
        if (f.type === "number" && payloadValues[f.key] !== "" && payloadValues[f.key] !== null) {
          payloadValues[f.key] = Number(payloadValues[f.key]);
        }
      }
      const { data } = await api.post("/compliance/logs", {
        check_type_id: checkType.id,
        values: payloadValues,
        notes: notes.trim() || null,
      });
      const tone = LOG_RESULT_TONE[data.status];
      toast.success(`Logged · ${tone?.label || data.status}`);
      onSaved && onSaved(data);
      onClose();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const Icon = ICON_MAP[checkType.icon] || ListChecks;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl border divider-soft max-h-[92vh] overflow-y-auto"
        data-testid="quick-log-modal"
      >
        <div className="px-5 py-4 border-b divider-soft flex items-center gap-3 sticky top-0 bg-white">
          <div className="w-9 h-9 rounded-lg bg-[#0e3b4a] text-white flex items-center justify-center shrink-0">
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-[#0F1115] truncate">{checkType.name}</div>
            <div className="text-[11px] text-[#5d6068] truncate">{checkType.description}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-stone-100"
            data-testid="quick-log-close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {(checkType.fields || []).map((f) => (
            <div key={f.key}>
              <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">
                {f.label}{f.required && <span className="text-[#A8273A]"> *</span>}
              </label>
              {f.type === "checkbox" ? (
                <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border divider-soft bg-stone-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!values[f.key]}
                    onChange={(e) => setField(f.key, e.target.checked)}
                    data-testid={`field-${f.key}`}
                    className="w-4 h-4"
                  />
                  <span className="text-[13px] text-[#2f3038]">Yes</span>
                </label>
              ) : f.type === "number" ? (
                <input
                  type="number"
                  inputMode="decimal"
                  step={f.step || 1}
                  min={f.min}
                  max={f.max}
                  value={values[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder || ""}
                  className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[14px] focus:ring-2 focus:ring-[#0e3b4a]/20 focus:border-[#0e3b4a] outline-none"
                  data-testid={`field-${f.key}`}
                />
              ) : (
                <input
                  type="text"
                  value={values[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder || ""}
                  className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[14px] focus:ring-2 focus:ring-[#0e3b4a]/20 focus:border-[#0e3b4a] outline-none"
                  data-testid={`field-${f.key}`}
                />
              )}
            </div>
          ))}

          <div>
            <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[13px] focus:ring-2 focus:ring-[#0e3b4a]/20 focus:border-[#0e3b4a] outline-none resize-none"
              placeholder="Anything to flag for the manager…"
              data-testid="field-notes"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t divider-soft flex items-center gap-2 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-[13px] font-medium text-[#2f3038] hover:bg-stone-100"
            data-testid="quick-log-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="ml-auto px-4 py-2 rounded-lg bg-[#0e3b4a] text-white text-[13px] font-semibold hover:bg-[#0c2f3b] disabled:opacity-60 inline-flex items-center gap-2"
            data-testid="quick-log-save"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Log check
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------ Maintenance modal ------------------------------
function MaintenanceModal({ initial, onClose, onSaved }) {
  const editing = !!initial?.id;
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "repair");
  const [severity, setSeverity] = useState(initial?.severity || "medium");
  const [status, setStatus] = useState(initial?.status || "reported");
  const [resolutionNotes, setResolutionNotes] = useState(initial?.resolution_notes || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { data } = await api.patch(`/maintenance/${initial.id}`, {
          title: title.trim(),
          description: description.trim() || null,
          category,
          severity,
          status,
          resolution_notes: resolutionNotes.trim() || null,
        });
        toast.success("Issue updated");
        onSaved && onSaved(data);
      } else {
        const { data } = await api.post("/maintenance", {
          title: title.trim(),
          description: description.trim() || null,
          category,
          severity,
        });
        toast.success("Issue logged");
        onSaved && onSaved(data);
      }
      onClose();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl border divider-soft max-h-[92vh] overflow-y-auto"
        data-testid="maintenance-modal"
      >
        <div className="px-5 py-4 border-b divider-soft flex items-center gap-3 sticky top-0 bg-white">
          <div className="w-9 h-9 rounded-lg bg-[#B8772F] text-white flex items-center justify-center shrink-0">
            <Wrench size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-[#0F1115]">
              {editing ? "Update issue" : "Report an issue"}
            </div>
            <div className="text-[11px] text-[#5d6068]">Maintenance · property · hazards</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-stone-100"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Leaky tap in bathroom 1"
              className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[14px] focus:ring-2 focus:ring-[#0e3b4a]/20 focus:border-[#0e3b4a] outline-none"
              data-testid="maint-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[13px] focus:ring-2 focus:ring-[#0e3b4a]/20 outline-none bg-white"
                data-testid="maint-category"
              >
                <option value="repair">Repair</option>
                <option value="hazard">Hazard</option>
                <option value="cleaning">Cleaning</option>
                <option value="vehicle">Vehicle</option>
                <option value="room">Room</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[13px] focus:ring-2 focus:ring-[#0e3b4a]/20 outline-none bg-white"
                data-testid="maint-severity"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's going on? Any access notes for the contractor?"
              className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[13px] focus:ring-2 focus:ring-[#0e3b4a]/20 outline-none resize-none"
              data-testid="maint-description"
            />
          </div>

          {editing && (
            <>
              <div>
                <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[13px] focus:ring-2 focus:ring-[#0e3b4a]/20 outline-none bg-white"
                  data-testid="maint-status"
                >
                  <option value="reported">Reported</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              {status === "resolved" && (
                <div>
                  <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Resolution notes</label>
                  <textarea
                    rows={2}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[13px] focus:ring-2 focus:ring-[#0e3b4a]/20 outline-none resize-none"
                    data-testid="maint-resolution"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t divider-soft flex items-center gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-[13px] font-medium text-[#2f3038] hover:bg-stone-100">Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="ml-auto px-4 py-2 rounded-lg bg-[#0e3b4a] text-white text-[13px] font-semibold hover:bg-[#0c2f3b] disabled:opacity-60 inline-flex items-center gap-2"
            data-testid="maint-save"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {editing ? "Save" : "Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------ Stat tile ------------------------------
function StatTile({ label, value, tone, icon: Icon, testid }) {
  return (
    <div
      className="rounded-xl border divider-soft bg-white p-3 sm:p-4"
      style={{ borderColor: tone?.border || "#e8e8e3" }}
      data-testid={testid}
    >
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={14} style={{ color: tone?.fg || "#5d6068" }} />}
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: tone?.fg || "#5d6068" }}>
          {label}
        </div>
      </div>
      <div className="text-2xl font-bold" style={{ color: tone?.fg || "#0F1115" }}>{value}</div>
    </div>
  );
}

// ------------------------------ Main page ------------------------------
export default function HomeOperations() {
  const { user, tier } = useAuth();
  const isManager = tier >= 3;

  const [tab, setTab] = useState("dashboard");
  const [checkTypes, setCheckTypes] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [logs, setLogs] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);

  const [openCheck, setOpenCheck] = useState(null);
  const [openMaint, setOpenMaint] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [t, d, l, i] = await Promise.all([
        api.get("/compliance/check-types"),
        api.get("/compliance/dashboard"),
        api.get("/compliance/logs", { params: { limit: 100 } }),
        api.get("/maintenance"),
      ]);
      setCheckTypes(t.data || []);
      setDashboard(d.data);
      setLogs(l.data || []);
      setIssues(i.data || []);
    } catch (e) {
      toast.error("Could not load Home Operations data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshAll(); /* eslint-disable-next-line */ }, []);

  const checkTypeById = useMemo(() => {
    const m = {};
    (checkTypes || []).forEach((c) => { m[c.id] = c; });
    return m;
  }, [checkTypes]);

  const groupedRows = useMemo(() => {
    if (!dashboard) return [];
    const map = new Map();
    dashboard.rows.forEach((r) => {
      const g = r.group || "Other";
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(r);
    });
    return Array.from(map.entries()); // [[group, rows[]]]
  }, [dashboard]);

  const downloadSnapshot = async () => {
    if (!isManager) return;
    setPdfBusy(true);
    try {
      const token = localStorage.getItem("cc_token");
      const url = `${API}/compliance/snapshot.pdf?token=${encodeURIComponent(token)}`;
      // Use direct GET via fetch to allow filename header
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `compliance-snapshot-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Snapshot downloaded");
    } catch (e) {
      toast.error("Could not generate PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  const onCheckSaved = async () => { await refreshAll(); };
  const onMaintSaved = async () => { await refreshAll(); };

  const deleteIssue = async (iid) => {
    if (!isManager) return;
    if (!window.confirm("Delete this maintenance issue? This cannot be undone.")) return;
    try {
      await api.delete(`/maintenance/${iid}`);
      toast.success("Deleted");
      await refreshAll();
    } catch (e) {
      toast.error("Could not delete");
    }
  };

  const counts = dashboard?.counts || { overdue: 0, due_soon: 0, ok: 0, never: 0, total: 0 };

  return (
    <div className="space-y-6" data-testid="home-operations-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#0e3b4a] text-white flex items-center justify-center">
              <Building2 size={16} />
            </div>
            <h1 className="text-3xl font-semibold text-[#0F1115]">Home Operations</h1>
          </div>
          <p className="text-[13px] text-[#5d6068] max-w-2xl">
            Daily safety checks, maintenance and compliance for the home environment.
            Resident-specific workflows live inside each Resident Profile.
          </p>
        </div>
        {isManager && (
          <button
            type="button"
            onClick={downloadSnapshot}
            disabled={pdfBusy}
            className="px-3 py-2 rounded-lg bg-[#0e3b4a] text-white text-[13px] font-semibold hover:bg-[#0c2f3b] disabled:opacity-60 inline-flex items-center gap-2"
            data-testid="ops-snapshot-pdf"
          >
            {pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            Compliance snapshot PDF
          </button>
        )}
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <StatTile label="Overdue" value={counts.overdue} tone={STATUS_TONE.overdue} icon={AlertTriangle} testid="stat-overdue" />
        <StatTile label="Due soon" value={counts.due_soon} tone={STATUS_TONE.due_soon} icon={Clock} testid="stat-due-soon" />
        <StatTile label="Up to date" value={counts.ok} tone={STATUS_TONE.ok} icon={CheckCircle2} testid="stat-ok" />
        <StatTile label="Never logged" value={counts.never} tone={STATUS_TONE.never} icon={CircleSlash} testid="stat-never" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b divider-soft overflow-x-auto" data-testid="ops-tabs">
        {[
          { id: "dashboard", label: "Compliance", icon: ListChecks },
          { id: "checks", label: "Safety checks", icon: ShieldCheck },
          { id: "maintenance", label: `Maintenance${issues.length ? ` (${issues.filter(i=>i.status!=="resolved").length})` : ""}`, icon: Wrench },
          { id: "history", label: "History", icon: HistoryIcon },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 -mb-px border-b-2 text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${
                active ? "text-[#0e3b4a] border-[#0e3b4a]" : "text-[#5d6068] border-transparent hover:text-[#0F1115]"
              }`}
              data-testid={`ops-tab-${t.id}`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="py-16 text-center text-[13px] text-[#5d6068] inline-flex items-center justify-center gap-2 w-full">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}

      {!loading && tab === "dashboard" && (
        <DashboardView
          groupedRows={groupedRows}
          onLog={(ct) => setOpenCheck(ct)}
          checkTypeById={checkTypeById}
        />
      )}

      {!loading && tab === "checks" && (
        <ChecksView
          checkTypes={checkTypes}
          dashboardRowsById={Object.fromEntries((dashboard?.rows || []).map((r) => [r.check_type_id, r]))}
          onLog={(ct) => setOpenCheck(ct)}
        />
      )}

      {!loading && tab === "maintenance" && (
        <MaintenanceView
          issues={issues}
          isManager={isManager}
          onAdd={() => setOpenMaint({})}
          onEdit={(i) => setOpenMaint(i)}
          onDelete={deleteIssue}
        />
      )}

      {!loading && tab === "history" && (
        <HistoryView
          logs={logs}
          checkTypeById={checkTypeById}
          isManager={isManager}
          onSignOff={async (id) => {
            try {
              await api.post(`/compliance/logs/${id}/sign-off`);
              toast.success("Signed off");
              await refreshAll();
            } catch (e) { toast.error("Could not sign off"); }
          }}
          onDelete={async (id) => {
            if (!window.confirm("Delete this log entry?")) return;
            try {
              await api.delete(`/compliance/logs/${id}`);
              toast.success("Deleted");
              await refreshAll();
            } catch (e) { toast.error("Could not delete"); }
          }}
        />
      )}

      {openCheck && (
        <QuickLogModal
          checkType={openCheck}
          onClose={() => setOpenCheck(null)}
          onSaved={onCheckSaved}
        />
      )}

      {openMaint !== null && (
        <MaintenanceModal
          initial={openMaint}
          onClose={() => setOpenMaint(null)}
          onSaved={onMaintSaved}
        />
      )}
    </div>
  );
}

// ------------------------------ Dashboard view ------------------------------
function DashboardView({ groupedRows, onLog, checkTypeById }) {
  const overdueRows = useMemo(() => {
    const all = [];
    groupedRows.forEach(([_g, rows]) => rows.forEach((r) => {
      if (r.status === "overdue" || r.status === "due_soon") all.push(r);
    }));
    return all.sort((a, b) => (a.days_until_due ?? 9999) - (b.days_until_due ?? 9999));
  }, [groupedRows]);

  return (
    <div className="space-y-6">
      {overdueRows.length > 0 && (
        <section className="rounded-2xl border divider-soft bg-white p-4 sm:p-5" data-testid="overdue-panel">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-[#A8273A]" />
            <h2 className="text-[15px] font-semibold text-[#0F1115]">Needs attention</h2>
            <span className="text-[11px] text-[#5d6068]">({overdueRows.length})</span>
          </div>
          <div className="space-y-2">
            {overdueRows.map((r) => {
              const ct = checkTypeById[r.check_type_id];
              const Icon = ICON_MAP[r.icon] || ListChecks;
              return (
                <button
                  key={r.check_type_id}
                  type="button"
                  onClick={() => ct && onLog(ct)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border divider-soft hover:bg-stone-50 text-left"
                  data-testid={`overdue-row-${r.check_type_id}`}
                >
                  <Icon size={16} className="text-[#0e3b4a] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#0F1115] truncate">{r.name}</div>
                    <div className="text-[11px] text-[#5d6068]">
                      {r.last_done ? `Last: ${relTime(r.last_done)}` : "Never logged"}
                      {r.next_due && ` · Due: ${fmt(r.next_due, { dateOnly: true })}`}
                    </div>
                  </div>
                  <StatusPill status={r.status} />
                  <ChevronRight size={14} className="text-[#8a8d95]" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* By group */}
      {groupedRows.map(([group, rows]) => (
        <section key={group} className="rounded-2xl border divider-soft bg-white p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold text-[#0F1115] mb-3">{group}</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {rows.map((r) => {
              const ct = checkTypeById[r.check_type_id];
              const Icon = ICON_MAP[r.icon] || ListChecks;
              return (
                <button
                  key={r.check_type_id}
                  type="button"
                  onClick={() => ct && onLog(ct)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border divider-soft hover:border-[#0e3b4a]/40 hover:bg-stone-50 text-left transition-colors"
                  data-testid={`check-tile-${r.check_type_id}`}
                >
                  <Icon size={16} className="text-[#0e3b4a] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#0F1115] truncate">{r.name}</div>
                    <div className="text-[11px] text-[#5d6068]">
                      {r.last_done ? `Last ${relTime(r.last_done)}` : "Not yet logged"}
                      {" · "}every {r.frequency_days}d
                    </div>
                  </div>
                  <StatusPill status={r.status} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ------------------------------ Checks view ------------------------------
function ChecksView({ checkTypes, dashboardRowsById, onLog }) {
  const groups = useMemo(() => {
    const m = new Map();
    (checkTypes || []).forEach((ct) => {
      const g = ct.group || "Other";
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(ct);
    });
    return Array.from(m.entries());
  }, [checkTypes]);

  return (
    <div className="space-y-6" data-testid="checks-view">
      {groups.map(([g, items]) => (
        <section key={g} className="rounded-2xl border divider-soft bg-white p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold text-[#0F1115] mb-3">{g}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((ct) => {
              const row = dashboardRowsById[ct.id];
              const Icon = ICON_MAP[ct.icon] || ListChecks;
              return (
                <div key={ct.id} className="rounded-xl border divider-soft p-4 flex flex-col gap-2">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#0e3b4a]/10 text-[#0e3b4a] flex items-center justify-center shrink-0">
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold text-[#0F1115] leading-tight">{ct.name}</div>
                      <div className="text-[11px] text-[#5d6068]">every {ct.frequency_days}d</div>
                    </div>
                    {row && <StatusPill status={row.status} />}
                  </div>
                  <p className="text-[12px] text-[#5d6068] leading-snug">{ct.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => onLog(ct)}
                      className="flex-1 px-3 py-2 rounded-lg bg-[#0e3b4a] text-white text-[12px] font-semibold hover:bg-[#0c2f3b] inline-flex items-center justify-center gap-1.5"
                      data-testid={`log-${ct.id}`}
                    >
                      <Plus size={13} /> Log check
                    </button>
                  </div>
                  {row?.last_done && (
                    <div className="text-[11px] text-[#5d6068]">
                      Last: {relTime(row.last_done)} · {row.last_performed_by || "—"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ------------------------------ Maintenance view ------------------------------
function MaintenanceView({ issues, isManager, onAdd, onEdit, onDelete }) {
  const [filter, setFilter] = useState("open"); // open | resolved | all

  const filtered = useMemo(() => {
    if (filter === "open") return issues.filter((i) => i.status !== "resolved");
    if (filter === "resolved") return issues.filter((i) => i.status === "resolved");
    return issues;
  }, [issues, filter]);

  const counts = {
    open: issues.filter((i) => i.status !== "resolved").length,
    resolved: issues.filter((i) => i.status === "resolved").length,
    urgent: issues.filter((i) => i.severity === "urgent" && i.status !== "resolved").length,
  };

  return (
    <div className="space-y-4" data-testid="maintenance-view">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
          {[
            { id: "open", label: `Open (${counts.open})` },
            { id: "resolved", label: `Resolved (${counts.resolved})` },
            { id: "all", label: `All (${issues.length})` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                filter === f.id ? "bg-white text-[#0e3b4a] shadow-sm" : "text-[#5d6068] hover:text-[#0F1115]"
              }`}
              data-testid={`maint-filter-${f.id}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="px-3 py-2 rounded-lg bg-[#B8772F] text-white text-[13px] font-semibold hover:bg-[#9c6328] inline-flex items-center gap-1.5"
          data-testid="maint-add"
        >
          <Plus size={14} /> Report issue
        </button>
      </div>

      {counts.urgent > 0 && (
        <div className="rounded-xl bg-[#fdecec] border border-[#A8273A]/30 px-4 py-3 flex items-center gap-2 text-[#A8273A]">
          <AlertTriangle size={16} />
          <span className="text-[13px] font-semibold">
            {counts.urgent} urgent issue{counts.urgent === 1 ? "" : "s"} require attention.
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border divider-soft bg-white p-8 text-center text-[13px] text-[#5d6068]">
          No {filter === "all" ? "" : filter} issues to show.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => {
            const sev = SEVERITY_TONE[i.severity] || SEVERITY_TONE.medium;
            return (
              <div
                key={i.id}
                className="rounded-xl border divider-soft bg-white p-4 flex items-start gap-3"
                data-testid={`maint-row-${i.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[14px] font-semibold text-[#0F1115]">{i.title}</span>
                    <span
                      className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: sev.bg, color: sev.fg }}
                    >
                      {i.severity}
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-[#5d6068]">
                      {i.status.replace("_", " ")}
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-[#5d6068]">
                      {i.category}
                    </span>
                  </div>
                  {i.description && (
                    <p className="text-[12px] text-[#2f3038] mb-1">{i.description}</p>
                  )}
                  <div className="text-[11px] text-[#5d6068]">
                    Reported {relTime(i.reported_at)} by {i.reported_by_name || "—"}
                    {i.resolved_at && ` · Resolved ${relTime(i.resolved_at)} by ${i.resolved_by_name || "—"}`}
                  </div>
                  {i.resolution_notes && (
                    <p className="text-[12px] text-[#2F6A3A] mt-1">↳ {i.resolution_notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEdit(i)}
                    className="px-2.5 py-1.5 rounded-md text-[12px] font-medium text-[#0e3b4a] hover:bg-stone-100"
                    data-testid={`maint-edit-${i.id}`}
                  >
                    Edit
                  </button>
                  {isManager && (
                    <button
                      type="button"
                      onClick={() => onDelete(i.id)}
                      className="px-2.5 py-1.5 rounded-md text-[12px] font-medium text-[#A8273A] hover:bg-[#A8273A]/10"
                      data-testid={`maint-delete-${i.id}`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------ History view ------------------------------
function HistoryView({ logs, checkTypeById, isManager, onSignOff, onDelete }) {
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(() => {
    if (typeFilter === "all") return logs;
    return logs.filter((l) => l.check_type_id === typeFilter);
  }, [logs, typeFilter]);

  return (
    <div className="space-y-3" data-testid="history-view">
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarClock size={14} className="text-[#5d6068]" />
        <span className="text-[12px] text-[#5d6068]">Filter:</span>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-md border divider-soft text-[12px] bg-white"
          data-testid="history-filter"
        >
          <option value="all">All check types</option>
          {Object.values(checkTypeById).map((ct) => (
            <option key={ct.id} value={ct.id}>{ct.name}</option>
          ))}
        </select>
        <span className="text-[11px] text-[#8a8d95] ml-auto">{filtered.length} entries</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border divider-soft bg-white p-8 text-center text-[13px] text-[#5d6068]">
          No history yet.
        </div>
      ) : (
        <div className="rounded-2xl border divider-soft bg-white overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-stone-50 text-[10px] uppercase font-bold tracking-wider text-[#5d6068]">
              <tr>
                <th className="text-left px-4 py-2.5">When</th>
                <th className="text-left px-4 py-2.5">Check</th>
                <th className="text-left px-4 py-2.5">By</th>
                <th className="text-left px-4 py-2.5">Result</th>
                <th className="text-left px-4 py-2.5">Notes</th>
                <th className="text-right px-4 py-2.5"> </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const ct = checkTypeById[l.check_type_id];
                const tone = LOG_RESULT_TONE[l.status] || LOG_RESULT_TONE.ok;
                return (
                  <tr key={l.id} className="border-t divider-soft" data-testid={`history-row-${l.id}`}>
                    <td className="px-4 py-2.5 text-[#2f3038] whitespace-nowrap">{fmt(l.performed_at)}</td>
                    <td className="px-4 py-2.5 text-[#0F1115] font-medium">{ct?.name || l.check_type_id}</td>
                    <td className="px-4 py-2.5 text-[#5d6068] whitespace-nowrap">{l.performed_by_name || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {tone.label}
                      </span>
                      {l.manager_signed_off_by && (
                        <span className="ml-1.5 text-[10px] text-[#2F6A3A] font-semibold">✓ {l.manager_signed_off_by}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[#5d6068] max-w-[280px]">
                      <div className="truncate">
                        {Object.entries(l.values || {}).map(([k, v]) => `${k}=${v}`).join("; ")}
                        {l.notes && ` · ${l.notes}`}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {isManager && !l.manager_signed_off_by && (
                        <button
                          type="button"
                          onClick={() => onSignOff(l.id)}
                          className="px-2 py-1 rounded text-[11px] font-semibold text-[#2F6A3A] hover:bg-[#2F6A3A]/10"
                          data-testid={`history-signoff-${l.id}`}
                        >
                          Sign off
                        </button>
                      )}
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => onDelete(l.id)}
                          className="px-2 py-1 rounded text-[11px] font-semibold text-[#A8273A] hover:bg-[#A8273A]/10"
                          data-testid={`history-delete-${l.id}`}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
