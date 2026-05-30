/* Phase E.1 — Training & Workforce Development Centre
 *
 * The central place for staff training, certificates, qualifications and
 * annual development plans. Five tabs:
 *   Dashboard · Matrix · Certificates · Qualifications · Development Plans
 *
 * Staff (tier 1) see a "My Training" view instead.
 *
 * All intelligence is deterministic — no AI scoring.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, Award, BookOpen, TrendingUp, Users,
  Loader2, Plus, Calendar, CheckCircle2, AlertTriangle,
  FileText, Upload, ChevronRight, Trash2, FileCheck2, FileX2,
  Activity, ExternalLink, ShieldCheck, Target,
} from "lucide-react";

const RAG = {
  red:   { bg: "#FBE3E7", fg: "#7a1a28", line: "#A8273A" },
  amber: { bg: "#FCEFD4", fg: "#7a4d12", line: "#B8772F" },
  green: { bg: "#E7F3EC", fg: "#1f4f2b", line: "#2F6A3A" },
  grey:  { bg: "#F1EFEC", fg: "#5d6068", line: "#d4d2cc" },
};

const STATUS_TONE = {
  ok: { bg: "#E7F3EC", fg: "#1f4f2b", label: "Current" },
  expiring: { bg: "#FCEFD4", fg: "#7a4d12", label: "Expiring" },
  expired: { bg: "#FBE3E7", fg: "#7a1a28", label: "Expired" },
  missing: { bg: "#F1EFEC", fg: "#5d6068", label: "Missing" },
};

function StatusPill({ status }) {
  const t = STATUS_TONE[status] || STATUS_TONE.missing;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{ background: t.bg, color: t.fg }}
          data-testid={`tc-status-${status}`}>
      {t.label}
    </span>
  );
}

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: TrendingUp },
  { id: "matrix", label: "Training matrix", icon: Users },
  { id: "certificates", label: "Certificates", icon: Award },
  { id: "qualifications", label: "Qualifications", icon: GraduationCap },
  { id: "plans", label: "Development plans", icon: BookOpen },
];

export default function TrainingCentre() {
  const { user, isSeniorOrAbove, isManagerOrAbove, tier } = useAuth();
  const { effectiveMode } = useOrg();
  const sector = effectiveMode === "adult" ? "adult" : "children";
  const [activeTab, setActiveTab] = useState("dashboard");

  // Staff get the simplified personal view
  if (!isSeniorOrAbove) {
    return <StaffSelfView userId={user?.id} />;
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto" data-testid="training-centre-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          Training & Workforce Development
        </div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5"
            style={{ letterSpacing: "-0.02em" }}>
          Training Centre · {sector === "adult" ? "Adult Services" : "Children's Services"}
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          Mandatory training, certificates, qualifications and annual development plans —
          the deterministic single source of truth for workforce compliance.
        </p>
      </header>

      <div className="bg-white border divider-soft rounded-2xl overflow-hidden">
        <div className="flex flex-wrap gap-1 p-1 border-b border-stone-200 bg-stone-50">
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = t.id === activeTab;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                data-testid={`tc-tab-${t.id}`}
                className={`px-3 py-2 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 transition ${
                  isActive
                    ? "bg-white text-[#0F1115] shadow-sm"
                    : "text-stone-600 hover:bg-white hover:text-stone-900"
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="p-4 sm:p-5">
          {activeTab === "dashboard" && <DashboardTab sector={sector} />}
          {activeTab === "matrix" && <MatrixTab sector={sector} canManage={isManagerOrAbove} />}
          {activeTab === "certificates" && <CertificatesTab canManage={isManagerOrAbove} />}
          {activeTab === "qualifications" && <QualificationsTab canManage={isManagerOrAbove} sector={sector} />}
          {activeTab === "plans" && <DevPlansTab canManage={isManagerOrAbove} />}
        </div>
      </div>
    </div>
  );
}


// =========== Dashboard Tab ===========
function DashboardTab({ sector }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/training-centre/dashboard?sector=${sector}`);
      setData(r.data);
    } catch (e) {
      if (e?.response?.status !== 403) toast.error("Could not load dashboard");
    } finally { setLoading(false); }
  }, [sector]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return <div className="inline-flex items-center gap-2 text-sm text-stone-600">
      <Loader2 size={14} className="animate-spin" /> Loading…
    </div>;
  }

  const overall = RAG[data.readiness_rag] || RAG.grey;

  return (
    <div className="space-y-4" data-testid="tc-dashboard">
      {/* Hero readiness score */}
      <div className="rounded-2xl border p-5 sm:p-6"
           style={{ background: overall.bg, borderColor: overall.line }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: overall.fg }}>
              Workforce Readiness · {sector === "adult" ? "Adult" : "Children"}
            </div>
            <div className="mt-2 flex items-end gap-3">
              <span className="font-display font-semibold text-5xl" style={{ color: overall.fg, lineHeight: 1 }}>
                {data.readiness_score}
              </span>
              <span className="text-sm" style={{ color: overall.fg }}>/100</span>
            </div>
            <p className="text-sm mt-2 max-w-md" style={{ color: overall.fg }}>
              {data.readiness_rag === "green"
                ? "Workforce compliance is in a healthy state. Keep certificates fresh and dev plans on track."
                : data.readiness_rag === "amber"
                  ? "Some training is expiring or staff lack active plans. Action this month to avoid red."
                  : "Workforce readiness is critical — multiple mandatory training cells are missing or expired."}
            </p>
          </div>
          <div className="text-right text-xs text-stone-600">
            Updated {new Date().toLocaleString()}
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Mandatory compliance" value={`${data.compliance_pct}%`}
             sub={`${data.counts.ok + data.counts.expiring} of ${data.counts.ok + data.counts.expiring + data.counts.expired + data.counts.missing} cells`}
             tone={data.compliance_pct >= 85 ? "green" : data.compliance_pct >= 65 ? "amber" : "red"}
             testid="tc-kpi-compliance" />
        <KPI label="Expiring (60d)" value={data.counts.expiring}
             sub={`${data.expiring_soon.length} records to renew`}
             tone={data.counts.expiring > 0 ? "amber" : "green"}
             testid="tc-kpi-expiring" />
        <KPI label="Overdue / missing" value={data.counts.expired + data.counts.missing}
             sub={data.counts.expired > 0 ? `${data.counts.expired} expired` : "All recorded"}
             tone={(data.counts.expired + data.counts.missing) > 0 ? "red" : "green"}
             testid="tc-kpi-overdue" />
        <KPI label="Active dev plans" value={`${data.dev_plans.active}`}
             sub={`${data.dev_plans.coverage_pct}% staff coverage`}
             tone={data.dev_plans.coverage_pct >= 80 ? "green" : data.dev_plans.coverage_pct >= 50 ? "amber" : "red"}
             testid="tc-kpi-plans" />
      </div>

      {/* Two-column lists */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border divider-soft rounded-2xl p-4" data-testid="tc-expiring-list">
          <div className="text-sm font-semibold text-[#0F1115] mb-2 inline-flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-amber-600" /> Expiring in next 60 days
          </div>
          {data.expiring_soon.length === 0 ? (
            <div className="text-xs text-stone-500">Nothing expiring — well done.</div>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {data.expiring_soon.slice(0, 10).map((e, i) => (
                <li key={i} className="py-2 flex items-center justify-between gap-2">
                  <span className="text-stone-800">{e.staff_name}</span>
                  <span className="text-stone-500 text-xs">{e.course_code}</span>
                  <span className="text-stone-600 text-xs">{e.expires_on}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border divider-soft rounded-2xl p-4" data-testid="tc-overdue-list">
          <div className="text-sm font-semibold text-[#0F1115] mb-2 inline-flex items-center gap-1.5">
            <FileX2 size={14} className="text-rose-700" /> Overdue or missing
          </div>
          {data.overdue.length === 0 ? (
            <div className="text-xs text-stone-500">No overdue mandatory training.</div>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {data.overdue.slice(0, 10).map((e, i) => (
                <li key={i} className="py-2 flex items-center justify-between gap-2">
                  <span className="text-stone-800">{e.staff_name}</span>
                  <span className="text-stone-500 text-xs">{e.course_code}</span>
                  <span className="text-stone-600 text-xs">{e.expires_on || "Missing"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Certificate / Qualification rollup */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border divider-soft rounded-2xl p-4">
          <div className="text-sm font-semibold text-[#0F1115] mb-2 inline-flex items-center gap-1.5">
            <Award size={14} /> Certificates
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="Total" v={data.certificates.total} />
            <Mini label="Verified" v={data.certificates.verified} tone="green" />
            <Mini label="Pending" v={data.certificates.pending} tone={data.certificates.pending ? "amber" : "grey"} />
          </div>
        </div>
        <div className="bg-white border divider-soft rounded-2xl p-4">
          <div className="text-sm font-semibold text-[#0F1115] mb-2 inline-flex items-center gap-1.5">
            <GraduationCap size={14} /> Qualifications
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Mini label="In progress" v={data.qualifications.counts.in_progress || 0} tone="amber" />
            <Mini label="Completed" v={data.qualifications.counts.completed || 0} tone="green" />
            <Mini label="Not started" v={data.qualifications.counts.not_started || 0} />
            <Mini label="Withdrawn" v={data.qualifications.counts.withdrawn || 0} tone="grey" />
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, sub, tone = "grey", testid }) {
  const t = RAG[tone];
  return (
    <div className="rounded-2xl border p-4" style={{ background: t.bg, borderColor: t.line }} data-testid={testid}>
      <div className="text-[11px] uppercase font-semibold tracking-wider" style={{ color: t.fg }}>{label}</div>
      <div className="font-display font-semibold text-3xl mt-1" style={{ color: t.fg, lineHeight: 1.1 }}>{value}</div>
      <div className="text-[11px] mt-1" style={{ color: t.fg, opacity: 0.85 }}>{sub}</div>
    </div>
  );
}

function Mini({ label, v, tone = "grey" }) {
  const t = RAG[tone];
  return (
    <div className="rounded-lg border px-2 py-2.5" style={{ background: t.bg, borderColor: t.line }}>
      <div className="font-display font-semibold text-xl" style={{ color: t.fg }}>{v}</div>
      <div className="text-[10px] mt-0.5" style={{ color: t.fg, opacity: 0.9 }}>{label}</div>
    </div>
  );
}


// =========== Matrix Tab ===========
function MatrixTab({ sector, canManage }) {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/training-centre/matrix?sector=${sector}`);
      setMatrix(r.data);
    } catch { toast.error("Could not load matrix"); }
    finally { setLoading(false); }
  }, [sector]);

  useEffect(() => { load(); }, [load]);

  if (loading || !matrix) return <div className="text-sm text-stone-600"><Loader2 size={14} className="inline animate-spin" /> Loading matrix…</div>;

  return (
    <div className="space-y-3" data-testid="tc-matrix">
      <div className="flex items-center justify-between">
        <div className="text-sm text-stone-700">
          <strong>{matrix.compliance_pct}%</strong> compliance · {matrix.counts.ok} current · {matrix.counts.expiring} expiring · {matrix.counts.expired} expired · {matrix.counts.missing} missing
        </div>
        {canManage && (
          <Button onClick={() => setShowAdd(true)} size="sm" data-testid="tc-matrix-add">
            <Plus size={14} className="mr-1" /> Record training
          </Button>
        )}
      </div>
      <div className="overflow-auto bg-white border divider-soft rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-[11px] uppercase tracking-wider text-stone-600">
            <tr>
              <th className="text-left px-3 py-2 sticky left-0 bg-stone-50 z-10">Staff</th>
              {matrix.courses.map(c => (
                <th key={c.code} className="px-3 py-2 text-left whitespace-nowrap">
                  <div className="text-[11px] font-semibold text-stone-800">{c.name}</div>
                  <div className="text-[10px] font-normal text-stone-500">{c.category}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {matrix.rows.map(row => (
              <tr key={row.staff.id}>
                <td className="px-3 py-2 sticky left-0 bg-white whitespace-nowrap">
                  <div className="text-stone-800">{row.staff.name}</div>
                  <div className="text-[11px] text-stone-500 capitalize">{row.staff.role}</div>
                </td>
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-3 py-2 align-top">
                    <StatusPill status={cell.status} />
                    {cell.expires_on && (
                      <div className="text-[10px] text-stone-500 mt-1">→ {cell.expires_on}</div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <RecordModal sector={sector} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function RecordModal({ sector, onClose, onSaved }) {
  const [courses, setCourses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ staff_id: "", course_code: "", completed_on: "", expires_on: "", provider: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/training-centre/courses?sector=${sector}`).then(r => setCourses(r.data.courses || []));
    api.get(`/auth/users`).then(r => setStaff(Array.isArray(r.data) ? r.data : (r.data.users || [])));
  }, [sector]);

  const submit = async () => {
    if (!form.staff_id || !form.course_code || !form.completed_on) {
      toast.error("Staff, course and completion date required"); return;
    }
    setSaving(true);
    try {
      await api.post("/training-centre/records", form);
      toast.success("Training record saved");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="tc-record-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <div className="font-display font-semibold text-lg">Record training</div>
        <Field label="Staff member">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} data-testid="tc-record-staff">
            <option value="">—</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
          </select>
        </Field>
        <Field label="Course">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.course_code} onChange={e => setForm({ ...form, course_code: e.target.value })} data-testid="tc-record-course">
            <option value="">—</option>
            {courses.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Completed">
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.completed_on} onChange={e => setForm({ ...form, completed_on: e.target.value })} data-testid="tc-record-completed" />
          </Field>
          <Field label="Expires (auto if blank)">
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.expires_on} onChange={e => setForm({ ...form, expires_on: e.target.value })} data-testid="tc-record-expires" />
          </Field>
        </div>
        <Field label="Provider">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} placeholder="e.g. NSPCC Learning" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="tc-record-save">
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Save
          </Button>
        </div>
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


// =========== Certificates Tab ===========
function CertificatesTab({ canManage }) {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/training-centre/certificates");
      setCerts(r.data.certificates || []);
    } catch { toast.error("Could not load certificates"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const verify = async (id, status) => {
    try {
      await api.patch(`/training-centre/certificates/${id}/verify`, { verification_status: status });
      toast.success(`Marked ${status}`);
      load();
    } catch { toast.error("Could not update"); }
  };

  const remove = async (id) => {
    if (!confirm("Delete this certificate?")) return;
    try {
      await api.delete(`/training-centre/certificates/${id}`);
      toast.success("Deleted"); load();
    } catch { toast.error("Could not delete"); }
  };

  if (loading) return <div className="text-sm text-stone-600"><Loader2 size={14} className="inline animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-3" data-testid="tc-certificates">
      <div className="flex items-center justify-between">
        <div className="text-sm text-stone-700">{certs.length} certificates</div>
        <Button size="sm" onClick={() => setShowAdd(true)} data-testid="tc-cert-add">
          <Upload size={14} className="mr-1" /> Upload certificate
        </Button>
      </div>
      {certs.length === 0 ? (
        <div className="bg-stone-50 border divider-soft rounded-2xl p-8 text-center text-sm text-stone-500">
          No certificates yet. Upload one to start the verified evidence trail.
        </div>
      ) : (
        <div className="bg-white border divider-soft rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wider text-stone-600">
              <tr>
                <th className="text-left px-3 py-2">Course</th>
                <th className="text-left px-3 py-2">Staff</th>
                <th className="text-left px-3 py-2">Issued</th>
                <th className="text-left px-3 py-2">Expires</th>
                <th className="text-left px-3 py-2">Provider</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {certs.map(c => (
                <tr key={c.id} data-testid={`tc-cert-row-${c.id}`}>
                  <td className="px-3 py-2 text-stone-800">{c.course_code} <span className="text-[10px] text-stone-500">v{c.version}</span></td>
                  <td className="px-3 py-2 text-stone-700">{c.staff_id}</td>
                  <td className="px-3 py-2 text-stone-600">{c.issue_date || "—"}</td>
                  <td className="px-3 py-2 text-stone-600">{c.expiry_date || "—"}</td>
                  <td className="px-3 py-2 text-stone-600">{c.provider || "—"}</td>
                  <td className="px-3 py-2">
                    <VerifyPill status={c.verification_status} />
                  </td>
                  <td className="px-3 py-2">
                    {c.file_id ? (
                      <a className="text-[#0E3B4A] inline-flex items-center gap-1 text-xs underline"
                         href={`/api/files/${c.file_id}?token=${encodeURIComponent(localStorage.getItem("token") || "")}`}
                         target="_blank" rel="noreferrer">
                        <FileText size={12} /> File
                      </a>
                    ) : c.external_url ? (
                      <a className="text-[#0E3B4A] inline-flex items-center gap-1 text-xs underline"
                         href={c.external_url} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} /> URL
                      </a>
                    ) : <span className="text-xs text-stone-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {canManage && c.verification_status === "pending" && (
                      <>
                        <button onClick={() => verify(c.id, "verified")} className="text-xs text-emerald-700 hover:underline mr-2" data-testid={`tc-cert-verify-${c.id}`}>Verify</button>
                        <button onClick={() => verify(c.id, "rejected")} className="text-xs text-rose-700 hover:underline mr-2">Reject</button>
                      </>
                    )}
                    {canManage && (
                      <button onClick={() => remove(c.id)} className="text-xs text-stone-500 hover:text-rose-700" data-testid={`tc-cert-del-${c.id}`}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && <CertModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function VerifyPill({ status }) {
  const map = {
    verified: { bg: "#E7F3EC", fg: "#1f4f2b", label: "Verified", icon: FileCheck2 },
    pending: { bg: "#FCEFD4", fg: "#7a4d12", label: "Pending", icon: Loader2 },
    rejected: { bg: "#FBE3E7", fg: "#7a1a28", label: "Rejected", icon: FileX2 },
  };
  const t = map[status] || map.pending;
  const Icon = t.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{ background: t.bg, color: t.fg }}>
      <Icon size={11} /> {t.label}
    </span>
  );
}

function CertModal({ onClose, onSaved }) {
  const [staff, setStaff] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({ staff_id: "", course_code: "", issue_date: "", expiry_date: "", provider: "", external_url: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/auth/users").then(r => setStaff(Array.isArray(r.data) ? r.data : (r.data.users || [])));
    api.get("/training-centre/courses").then(r => setCourses(r.data.courses || []));
  }, []);

  const submit = async () => {
    if (!form.staff_id || !form.course_code) { toast.error("Staff + course required"); return; }
    if (!file && !form.external_url) { toast.error("Provide a file or external URL"); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (file) fd.append("file", file);
      await api.post("/training-centre/certificates", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Certificate uploaded");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Upload failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="tc-cert-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="font-display font-semibold text-lg">Upload certificate</div>
        <Field label="Staff">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} data-testid="tc-cert-staff">
            <option value="">—</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Course">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.course_code} onChange={e => setForm({ ...form, course_code: e.target.value })} data-testid="tc-cert-course">
            <option value="">—</option>
            {courses.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Issue date">
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} />
          </Field>
          <Field label="Expiry date">
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
          </Field>
        </div>
        <Field label="Provider">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} />
        </Field>
        <Field label="File (optional)">
          <input type="file" accept="application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" data-testid="tc-cert-file" />
        </Field>
        <Field label="…or external URL">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.external_url} onChange={e => setForm({ ...form, external_url: e.target.value })} placeholder="https://…" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="tc-cert-save">
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}


// =========== Qualifications Tab ===========
function QualificationsTab({ canManage, sector }) {
  const [quals, setQuals] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        api.get("/training-centre/qualifications"),
        api.get(`/training-centre/qualifications/catalogue?sector=${sector}`),
      ]);
      setQuals(r.data.qualifications || []);
      setCatalogue(c.data.qualifications || []);
    } catch { toast.error("Could not load qualifications"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [sector]);

  if (loading) return <div className="text-sm text-stone-600"><Loader2 size={14} className="inline animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-3" data-testid="tc-qualifications">
      <div className="flex items-center justify-between">
        <div className="text-sm text-stone-700">{quals.length} qualification records</div>
        {canManage && (
          <Button size="sm" onClick={() => setShowAdd(true)} data-testid="tc-qual-add">
            <Plus size={14} className="mr-1" /> Add qualification
          </Button>
        )}
      </div>
      {quals.length === 0 ? (
        <div className="bg-stone-50 border divider-soft rounded-2xl p-8 text-center text-sm text-stone-500">
          No qualification records yet.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {quals.map(q => (
            <div key={q.id} className="bg-white border divider-soft rounded-xl p-4" data-testid={`tc-qual-card-${q.id}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] uppercase font-semibold tracking-wider text-stone-500">Level {q.level}</div>
                  <div className="font-semibold text-stone-800">{q.qualification_name}</div>
                  <div className="text-xs text-stone-600 mt-1">{q.staff_name}</div>
                </div>
                <QualStatusPill status={q.status} />
              </div>
              <div className="text-xs text-stone-600 mt-2 space-y-0.5">
                {q.awarding_body && <div>Awarding body: {q.awarding_body}</div>}
                {q.started_on && <div>Started: {q.started_on}</div>}
                {q.expected_completion && <div>Expected: {q.expected_completion}</div>}
                {q.completed_on && <div>Completed: {q.completed_on}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {showAdd && <QualModal catalogue={catalogue} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function QualStatusPill({ status }) {
  const map = {
    not_started: { bg: "#F1EFEC", fg: "#5d6068", label: "Not started" },
    in_progress: { bg: "#FCEFD4", fg: "#7a4d12", label: "In progress" },
    completed: { bg: "#E7F3EC", fg: "#1f4f2b", label: "Completed" },
    withdrawn: { bg: "#FBE3E7", fg: "#7a1a28", label: "Withdrawn" },
  };
  const t = map[status] || map.not_started;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: t.bg, color: t.fg }}>{t.label}</span>;
}

function QualModal({ catalogue, onClose, onSaved }) {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ staff_id: "", qualification_code: "", awarding_body: "", started_on: "", expected_completion: "", status: "in_progress" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/auth/users").then(r => setStaff(Array.isArray(r.data) ? r.data : (r.data.users || [])));
  }, []);

  const submit = async () => {
    if (!form.staff_id || !form.qualification_code) { toast.error("Staff + qualification required"); return; }
    setSaving(true);
    try {
      await api.post("/training-centre/qualifications", form);
      toast.success("Qualification added");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="tc-qual-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="font-display font-semibold text-lg">Add qualification</div>
        <Field label="Staff">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} data-testid="tc-qual-staff">
            <option value="">—</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Qualification">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.qualification_code} onChange={e => setForm({ ...form, qualification_code: e.target.value })} data-testid="tc-qual-code">
            <option value="">—</option>
            {catalogue.map(q => <option key={q.code} value={q.code}>{q.name} (L{q.level})</option>)}
          </select>
        </Field>
        <Field label="Awarding body">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.awarding_body} onChange={e => setForm({ ...form, awarding_body: e.target.value })} placeholder="e.g. City & Guilds" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Started">
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.started_on} onChange={e => setForm({ ...form, started_on: e.target.value })} />
          </Field>
          <Field label="Expected completion">
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.expected_completion} onChange={e => setForm({ ...form, expected_completion: e.target.value })} />
          </Field>
        </div>
        <Field label="Status">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="tc-qual-save">
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}


// =========== Development Plans Tab ===========
function DevPlansTab({ canManage }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/training-centre/dev-plans");
      setPlans(r.data.dev_plans || []);
    } catch { toast.error("Could not load plans"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="text-sm text-stone-600"><Loader2 size={14} className="inline animate-spin" /> Loading…</div>;

  const selected = plans.find(p => p.id === selectedId);

  return (
    <div className="space-y-3" data-testid="tc-plans">
      <div className="flex items-center justify-between">
        <div className="text-sm text-stone-700">{plans.length} development plans</div>
        {canManage && (
          <Button size="sm" onClick={() => setShowCreate(true)} data-testid="tc-plan-add">
            <Plus size={14} className="mr-1" /> Create annual plan
          </Button>
        )}
      </div>

      {plans.length === 0 ? (
        <div className="bg-stone-50 border divider-soft rounded-2xl p-8 text-center text-sm text-stone-500">
          No development plans yet. Create one to start mapping objectives.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {plans.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`text-left bg-white border divider-soft rounded-xl p-4 hover:border-stone-400 transition ${selectedId === p.id ? "ring-2 ring-[#0E3B4A]" : ""}`}
              data-testid={`tc-plan-card-${p.id}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] uppercase font-semibold tracking-wider text-stone-500">{p.year}</div>
                  <div className="font-semibold text-stone-800">{p.staff_name}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${p.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                  {p.status}
                </span>
              </div>
              <div className="text-xs text-stone-500 mt-2">
                {(p.objectives || []).length} objectives · {Object.keys(p.quarterly_reviews || {}).length}/4 reviews
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && <PlanCreateModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      {selected && <PlanDetailDrawer plan={selected} onClose={() => setSelectedId(null)} canManage={canManage} onChanged={load} />}
    </div>
  );
}

function PlanCreateModal({ onClose, onSaved }) {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ staff_id: "", year: new Date().getFullYear(), focus_area: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/auth/users").then(r => setStaff(Array.isArray(r.data) ? r.data : (r.data.users || [])));
  }, []);

  const submit = async () => {
    if (!form.staff_id) { toast.error("Staff member required"); return; }
    setSaving(true);
    try {
      await api.post("/training-centre/dev-plans", { ...form, year: Number(form.year) });
      toast.success("Annual development plan created");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not create"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="tc-plan-create-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <div className="font-display font-semibold text-lg">New annual development plan</div>
        <Field label="Staff">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} data-testid="tc-plan-staff">
            <option value="">—</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Year">
          <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
        </Field>
        <Field label="Focus area">
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={form.focus_area} onChange={e => setForm({ ...form, focus_area: e.target.value })} placeholder="e.g. Senior practitioner pathway with focus on safeguarding leadership" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="tc-plan-create-save">Create</Button>
        </div>
      </div>
    </div>
  );
}

function PlanDetailDrawer({ plan, onClose, canManage, onChanged }) {
  const [showObj, setShowObj] = useState(false);
  const [showRev, setShowRev] = useState(false);
  const [full, setFull] = useState(plan);

  const reload = async () => {
    try {
      const r = await api.get(`/training-centre/dev-plans/${plan.id}`);
      setFull(r.data);
      onChanged && onChanged();
    } catch {/* ignore */}
  };

  const archive = async () => {
    if (!confirm("Archive this plan? It will be read-only.")) return;
    try {
      await api.post(`/training-centre/dev-plans/${plan.id}/archive`);
      toast.success("Plan archived"); onChanged && onChanged();
    } catch { toast.error("Could not archive"); }
  };

  const completeObj = async (oid) => {
    try {
      await api.patch(`/training-centre/dev-plans/${plan.id}/objectives/${oid}`, { status: "completed" });
      toast.success("Objective completed"); reload();
    } catch { toast.error("Could not update"); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="tc-plan-drawer">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase font-semibold tracking-wider text-stone-500">{full.year} · {full.status}</div>
            <h3 className="font-display font-semibold text-xl">{full.staff_name}</h3>
            {full.focus_area && <p className="text-sm text-stone-600 mt-1">{full.focus_area}</p>}
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">Close</button>
        </div>

        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-[#0F1115] inline-flex items-center gap-1.5"><Target size={14} /> Objectives</div>
            {canManage && full.status === "active" && (
              <Button size="sm" variant="outline" onClick={() => setShowObj(true)} data-testid="tc-plan-add-obj">
                <Plus size={12} className="mr-1" /> Add objective
              </Button>
            )}
          </div>
          {(full.objectives || []).length === 0 ? (
            <div className="text-xs text-stone-500">No objectives yet.</div>
          ) : (
            <ul className="space-y-2">
              {full.objectives.map(o => (
                <li key={o.id} className="bg-stone-50 border divider-soft rounded-lg p-3" data-testid={`tc-obj-${o.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-stone-800 font-medium">{o.title}</div>
                      {o.description && <div className="text-xs text-stone-600 mt-0.5">{o.description}</div>}
                      <div className="text-[11px] text-stone-500 mt-1">
                        Type: {o.type}{o.target_date ? ` · Due ${o.target_date}` : ""}{o.linked_course_code ? ` · Course ${o.linked_course_code}` : ""}{o.linked_supervision_id ? ` · ↗ Supervision` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] ${o.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-700"}`}>
                        {o.status}
                      </span>
                      {canManage && o.status !== "completed" && full.status === "active" && (
                        <button onClick={() => completeObj(o.id)} className="block text-xs text-[#0E3B4A] underline mt-1" data-testid={`tc-obj-complete-${o.id}`}>
                          Mark complete
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-[#0F1115] inline-flex items-center gap-1.5"><Activity size={14} /> Quarterly reviews</div>
            {canManage && full.status === "active" && (
              <Button size="sm" variant="outline" onClick={() => setShowRev(true)} data-testid="tc-plan-add-review">
                <Plus size={12} className="mr-1" /> Add review
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {["q1","q2","q3","q4"].map(q => {
              const rev = (full.quarterly_reviews || {})[q];
              return (
                <div key={q} className={`rounded-lg border p-3 ${rev ? "bg-emerald-50" : "bg-stone-50"}`} data-testid={`tc-quarter-${q}`}>
                  <div className="text-[11px] uppercase font-semibold tracking-wider text-stone-600">{q.toUpperCase()}</div>
                  {rev ? (
                    <>
                      <div className="text-xs text-stone-700 mt-1 line-clamp-3">{rev.notes}</div>
                      <div className="text-[10px] text-stone-500 mt-1">{rev.rag.toUpperCase()} · {rev.completed_by_name}</div>
                    </>
                  ) : (
                    <div className="text-xs text-stone-400 mt-1">Not yet reviewed</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {canManage && full.status === "active" && (
          <div className="pt-2 border-t">
            <Button variant="outline" size="sm" onClick={archive} data-testid="tc-plan-archive">Archive plan</Button>
          </div>
        )}

        {showObj && <ObjectiveModal planId={plan.id} onClose={() => setShowObj(false)} onSaved={() => { setShowObj(false); reload(); }} />}
        {showRev && <ReviewModal planId={plan.id} existing={full.quarterly_reviews || {}} onClose={() => setShowRev(false)} onSaved={() => { setShowRev(false); reload(); }} />}
      </div>
    </div>
  );
}

function ObjectiveModal({ planId, onClose, onSaved }) {
  const [form, setForm] = useState({ title: "", description: "", type: "training", target_date: "", linked_course_code: "" });
  const [courses, setCourses] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/training-centre/courses").then(r => setCourses(r.data.courses || []));
  }, []);

  const submit = async () => {
    if (!form.title) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      await api.post(`/training-centre/dev-plans/${planId}/objectives`, form);
      toast.success("Objective added");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="tc-obj-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <div className="font-display font-semibold text-lg">Add objective</div>
        <Field label="Title">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Complete Advanced Safeguarding by 30/09/26" data-testid="tc-obj-title" />
        </Field>
        <Field label="Description">
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="training">Training</option>
              <option value="qualification">Qualification</option>
              <option value="skill">Skill</option>
              <option value="career">Career</option>
            </select>
          </Field>
          <Field label="Target date">
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} />
          </Field>
        </div>
        <Field label="Link to course (optional)">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.linked_course_code} onChange={e => setForm({ ...form, linked_course_code: e.target.value })}>
            <option value="">—</option>
            {courses.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="tc-obj-save">Save</Button>
        </div>
      </div>
    </div>
  );
}

function ReviewModal({ planId, existing, onClose, onSaved }) {
  const nextQ = useMemo(() => {
    for (const q of ["q1","q2","q3","q4"]) if (!existing[q]) return q;
    return "q4";
  }, [existing]);
  const [form, setForm] = useState({ quarter: nextQ, notes: "", rag: "green" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.notes) { toast.error("Notes required"); return; }
    setSaving(true);
    try {
      await api.post(`/training-centre/dev-plans/${planId}/quarterly-review`, form);
      toast.success("Quarterly review recorded");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="tc-review-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <div className="font-display font-semibold text-lg">Quarterly review</div>
        <Field label="Quarter">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.quarter} onChange={e => setForm({ ...form, quarter: e.target.value })} data-testid="tc-review-quarter">
            {["q1","q2","q3","q4"].map(q => <option key={q} value={q}>{q.toUpperCase()}{existing[q] ? " (overwrite)" : ""}</option>)}
          </select>
        </Field>
        <Field label="Notes">
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={4} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} data-testid="tc-review-notes" />
        </Field>
        <Field label="RAG">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.rag} onChange={e => setForm({ ...form, rag: e.target.value })}>
            <option value="green">Green — on track</option>
            <option value="amber">Amber — needs support</option>
            <option value="red">Red — at risk</option>
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="tc-review-save">Save</Button>
        </div>
      </div>
    </div>
  );
}


// =========== Staff Self View ===========
function StaffSelfView({ userId }) {
  const [records, setRecords] = useState([]);
  const [certs, setCerts] = useState([]);
  const [quals, setQuals] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/training-centre/records/mine"),
      api.get("/training-centre/certificates"),
      api.get("/training-centre/qualifications"),
      api.get("/training-centre/dev-plans"),
    ]).then(([r, c, q, p]) => {
      setRecords(r.data.records || []);
      setCerts(c.data.certificates || []);
      setQuals(q.data.qualifications || []);
      setPlans(p.data.dev_plans || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-stone-600"><Loader2 size={14} className="inline animate-spin" /> Loading…</div>;

  const counts = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, { ok: 0, expiring: 0, expired: 0 });

  return (
    <div className="space-y-5 max-w-5xl mx-auto" data-testid="tc-self-view">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          Training & Development
        </div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">
          My Training Profile
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          Your training, certificates, qualifications and development objectives.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Current" value={counts.ok || 0} sub="trainings up to date" tone="green" testid="tc-self-ok" />
        <KPI label="Expiring" value={counts.expiring || 0} sub="renew within 60 days" tone={counts.expiring ? "amber" : "grey"} testid="tc-self-expiring" />
        <KPI label="Expired" value={counts.expired || 0} sub="needs urgent renewal" tone={counts.expired ? "red" : "grey"} testid="tc-self-expired" />
        <KPI label="Active plan" value={plans.filter(p => p.status === "active").length} sub="annual development" tone={plans.length ? "green" : "grey"} testid="tc-self-plan" />
      </div>

      <div className="bg-white border divider-soft rounded-2xl p-4">
        <div className="text-sm font-semibold text-[#0F1115] mb-3 inline-flex items-center gap-1.5"><GraduationCap size={14} /> My trainings</div>
        {records.length === 0 ? (
          <div className="text-xs text-stone-500">No training records yet. Your manager will record these as you complete courses.</div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {records.map(r => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-stone-800">{r.course_name}</div>
                  <div className="text-[11px] text-stone-500">
                    Completed {r.completed_on || "—"} · Expires {r.expires_on || "—"}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border divider-soft rounded-2xl p-4">
          <div className="text-sm font-semibold text-[#0F1115] mb-2 inline-flex items-center gap-1.5"><Award size={14} /> My certificates</div>
          {certs.length === 0 ? (
            <div className="text-xs text-stone-500">No certificates uploaded.</div>
          ) : (
            <ul className="text-xs space-y-1">
              {certs.slice(0, 8).map(c => (
                <li key={c.id} className="flex items-center justify-between">
                  <span>{c.course_code} v{c.version}</span>
                  <VerifyPill status={c.verification_status} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white border divider-soft rounded-2xl p-4">
          <div className="text-sm font-semibold text-[#0F1115] mb-2 inline-flex items-center gap-1.5"><BookOpen size={14} /> My qualifications</div>
          {quals.length === 0 ? (
            <div className="text-xs text-stone-500">None recorded yet.</div>
          ) : (
            <ul className="text-xs space-y-1">
              {quals.map(q => (
                <li key={q.id} className="flex items-center justify-between">
                  <span>{q.qualification_name} (L{q.level})</span>
                  <QualStatusPill status={q.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {plans.length > 0 && (
        <div className="bg-white border divider-soft rounded-2xl p-4">
          <div className="text-sm font-semibold text-[#0F1115] mb-2 inline-flex items-center gap-1.5"><Target size={14} /> My development plan</div>
          {plans.filter(p => p.status === "active").map(p => (
            <div key={p.id}>
              <div className="text-xs text-stone-600 mb-1">{p.year} · {(p.objectives || []).length} objectives</div>
              <ul className="text-sm space-y-1">
                {(p.objectives || []).map(o => (
                  <li key={o.id} className="flex items-center gap-2">
                    {o.status === "completed" ? <CheckCircle2 size={14} className="text-emerald-600" /> : <span className="w-3.5 h-3.5 rounded-full border border-stone-300" />}
                    <span className={o.status === "completed" ? "text-stone-500 line-through" : "text-stone-800"}>{o.title}</span>
                    {o.target_date && <span className="text-[11px] text-stone-500">· due {o.target_date}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* Compact summary tile for embedding inside StaffOperationsHub. */
export function TrainingCentreSummary() {
  const { isManagerOrAbove } = useAuth();
  const { effectiveMode } = useOrg();
  const sector = effectiveMode === "adult" ? "adult" : "children";
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isManagerOrAbove) return;
    api.get(`/training-centre/dashboard?sector=${sector}`)
      .then(r => setData(r.data))
      .catch(() => {/* ignore */});
  }, [sector, isManagerOrAbove]);

  if (!isManagerOrAbove || !data) return null;
  const overall = RAG[data.readiness_rag] || RAG.grey;
  return (
    <div className="rounded-xl border p-4 mb-3" style={{ background: overall.bg, borderColor: overall.line }} data-testid="tc-summary-tile">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm" style={{ color: overall.fg }}>
          <strong>Workforce Readiness {data.readiness_score}/100</strong> · {data.compliance_pct}% compliance · {data.counts.expiring} expiring · {data.counts.expired + data.counts.missing} overdue
        </div>
        <a href="/training" className="text-xs underline" style={{ color: overall.fg }} data-testid="tc-summary-link">Open Training Centre →</a>
      </div>
    </div>
  );
}
