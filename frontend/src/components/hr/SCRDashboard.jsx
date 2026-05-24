/* Single Central Record — Inspection-ready compliance dashboard.
 *
 * Phase F.2 · Manager+ only. Live cross-staff view with one-tap PDF export,
 * smart filters, and Ofsted-ready KPI tiles.
 *
 * Designed to feel like a digital safer-recruitment command centre —
 * something an RI or inspector immediately trusts.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import api, { API as API_BASE } from "@/lib/api";
import {
  Loader2, ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2,
  FileDown, ChevronLeft, Filter, Building2, Eye, Hash,
  Users, FileWarning, CalendarClock, ContactRound, GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const TONE = {
  red:   { fg: "#7a1a28", bg: "#FBE3E7", line: "#A8273A", label: "Action" },
  amber: { fg: "#7a4d12", bg: "#FCEFD4", line: "#B8772F", label: "Soon" },
  green: { fg: "#1f4f2b", bg: "#E7F3EC", line: "#2F6A3A", label: "OK" },
  grey:  { fg: "#5d6068", bg: "#F1EFEC", line: "#5d6068", label: "—" },
};

const ROLE_FILTER_OPTS = [
  { v: "",       label: "All roles" },
  { v: "manager", label: "Manager" },
  { v: "senior",  label: "Senior" },
  { v: "staff",   label: "Support Worker" },
  { v: "admin",   label: "Admin / RI" },
];

const EMP_FILTER_OPTS = [
  { v: "",          label: "All employment" },
  { v: "Permanent", label: "Permanent" },
  { v: "Agency",    label: "Agency" },
];

const STATUS_FILTER_OPTS = [
  { v: "",      label: "All RAG" },
  { v: "red",   label: "Red only" },
  { v: "amber", label: "Amber only" },
  { v: "green", label: "Green only" },
];

export default function SCRDashboard({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nonOnly, setNonOnly] = useState(false);
  const [role, setRole] = useState("");
  const [emp, setEmp] = useState("");
  const [status, setStatus] = useState("");
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({
        sector: "children",
        non_compliant_only: String(nonOnly),
      });
      if (role) qs.set("role", role);
      if (emp) qs.set("employment_type", emp);
      if (status) qs.set("status", status);
      const r = await api.get(`/hr/scr?${qs.toString()}`);
      setData(r.data);
    } catch (e) {
      setError(e?.response?.status === 403 ? "Manager+ only." : "Could not load Single Central Record.");
    } finally { setLoading(false); }
  }, [nonOnly, role, emp, status]);
  useEffect(() => { load(); }, [load]);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const qs = new URLSearchParams({
        sector: "children",
        non_compliant_only: String(nonOnly),
      });
      if (role) qs.set("role", role);
      if (emp) qs.set("employment_type", emp);
      if (status) qs.set("status", status);
      const res = await api.get(`/hr/scr.pdf?${qs.toString()}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `single-central-record-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("SCR PDF downloaded");
    } catch {
      toast.error("Could not download PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 flex items-center gap-2 text-stone-600 text-sm"
        data-testid="scr-dashboard">
        <Loader2 size={14} className="animate-spin" /> Compiling Single Central Record…
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 text-sm text-stone-700"
        data-testid="scr-dashboard">{error}</div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4 max-w-7xl mx-auto" data-testid="scr-dashboard">
      {/* Hero */}
      <header className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0E3B4A 0%, #0a2734 60%, #1E4D5C 100%)", color: "white" }}>
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-[#B8772F]/10 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2">
            {onBack && (
              <button type="button" onClick={onBack}
                className="p-1.5 rounded-md hover:bg-white/10 text-white/80 shrink-0 mr-1"
                data-testid="scr-back-btn">
                <ChevronLeft size={16} />
              </button>
            )}
            <ShieldCheck size={14} className="text-[#FCB960]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
              Single Central Record · Inspection-Ready
            </span>
          </div>
          <h1 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5" style={{ letterSpacing: "-0.02em" }}>
            Live safer-recruitment evidence
          </h1>
          <p className="text-[13px] text-white/70 mt-1 max-w-3xl">
            One row per staff. RAG-coloured. Exportable in one tap. Built for the
            documents Ofsted, Reg 44 visitors and Responsible Individuals ask for first.
          </p>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4" data-testid="scr-kpi-tiles">
            <KPITile Icon={CheckCircle2}    label="Compliant"            value={data.kpis.compliant}             tone="#7BD79A" />
            <KPITile Icon={CalendarClock}   label="DBS expiring (60d)"   value={data.kpis.expiring_dbs_60d}      tone="#FDCC72" />
            <KPITile Icon={FileWarning}     label="Overdue supervisions" value={data.kpis.overdue_supervisions}  tone="#FCA1A6" />
            <KPITile Icon={ContactRound}    label="References gap"       value={data.kpis.missing_references}    tone="#FCA1A6" />
            <KPITile Icon={GraduationCap}   label="Expired training"     value={data.kpis.expired_training}      tone="#FCA1A6" />
          </div>

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button onClick={downloadPdf} disabled={downloading}
              className="bg-[#B8772F] hover:bg-[#a3661f] text-white text-[13px] h-9"
              data-testid="scr-download-pdf-btn">
              {downloading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <FileDown size={14} className="mr-1.5" />}
              Export Inspection-Ready PDF
            </Button>
            <span className="text-[11px] text-white/60 ml-2">
              Generated {new Date(data.generated_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              {" "}· {data.filtered_count ?? data.rows.length} of {data.total_staff} staff shown
            </span>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border divider-soft rounded-xl p-3" data-testid="scr-filters">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0e3b4a]">
            <Filter size={11} /> Filters
          </div>
          <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
            <input
              type="checkbox"
              checked={nonOnly}
              onChange={(e) => setNonOnly(e.target.checked)}
              data-testid="scr-non-compliant-only"
              className="accent-[#0e3b4a]"
            />
            Show only non-compliant
          </label>

          <Select value={role} setValue={setRole} options={ROLE_FILTER_OPTS} testid="scr-filter-role" />
          <Select value={emp} setValue={setEmp} options={EMP_FILTER_OPTS} testid="scr-filter-emp" />
          <Select value={status} setValue={setStatus} options={STATUS_FILTER_OPTS} testid="scr-filter-status" />

          {(nonOnly || role || emp || status) && (
            <button
              type="button"
              onClick={() => { setNonOnly(false); setRole(""); setEmp(""); setStatus(""); }}
              className="text-[11px] text-stone-500 hover:text-[#0e3b4a] underline ml-1"
              data-testid="scr-filter-clear"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* SCR Table */}
      <section className="bg-white border divider-soft rounded-2xl overflow-hidden" data-testid="scr-table-section">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" data-testid="scr-table">
            <thead className="bg-[#0F2A47] text-white">
              <tr>
                <Th>Staff</Th>
                <Th>Role / Employment</Th>
                <Th>Start</Th>
                <Th>DBS</Th>
                <Th>DBS no. / Issue / Expiry</Th>
                <Th>Barred list</Th>
                <Th>RTW</Th>
                <Th>ID</Th>
                <Th>References</Th>
                <Th>Quals</Th>
                <Th>Training</Th>
                <Th>Supervision</Th>
                <Th>Appraisal</Th>
                <Th>Probation</Th>
                <Th>RAG</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr><td colSpan={15} className="text-center py-6 text-stone-500 italic">
                  No staff match the current filters.
                </td></tr>
              ) : data.rows.map((r) => <SCRRow key={r.staff_id} r={r} />)}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-stone-500 px-1 leading-relaxed flex items-start gap-1.5">
        <Hash size={11} className="mt-0.5 shrink-0 text-stone-400" />
        {data.explainable_note}
      </p>
    </div>
  );
}

function KPITile({ Icon, label, value, tone }) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg p-2.5 flex items-center gap-2.5 border border-white/5">
      <Icon size={16} className="text-white/65 shrink-0" />
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/65 truncate">{label}</div>
        <div className="text-xl font-display font-semibold" style={{ color: tone }}>{value ?? 0}</div>
      </div>
    </div>
  );
}

function Th({ children }) {
  return (
    <th className="text-left text-[10px] font-bold uppercase tracking-wider px-2 py-2 border-b border-white/10">
      {children}
    </th>
  );
}

function Cell({ status, children, mono = false }) {
  const t = TONE[status] || TONE.grey;
  return (
    <td className="px-2 py-1.5 align-top" style={{ background: status && status !== "green" ? t.bg : undefined }}>
      <div className={`text-[11px] ${mono ? "font-mono" : ""}`} style={{ color: status && status !== "green" ? t.fg : "#0F1115" }}>
        {children}
      </div>
    </td>
  );
}

function SCRRow({ r }) {
  const overall = TONE[r.overall_status] || TONE.grey;
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50/60" data-testid={`scr-row-${r.staff_id}`}>
      <td className="px-2 py-2 align-top">
        <div className="font-semibold text-[12px] text-[#0F1115]">{r.name}</div>
        <div className="text-[10px] text-stone-400 font-mono">{r.staff_id?.slice(0, 8)}</div>
      </td>
      <td className="px-2 py-2 align-top">
        <div className="text-[11px] text-[#0F1115]">{r.role_label}</div>
        <div className="text-[10px] text-stone-500">
          {r.employment_type}
          {r.is_agency && r.agency_name && <> · {r.agency_name}</>}
        </div>
      </td>
      <Cell>{r.start_date}</Cell>
      <Cell status={r.dbs.status}>{r.dbs.text}</Cell>
      <td className="px-2 py-1.5 align-top">
        <div className="text-[11px] text-[#0F1115] font-mono">{r.dbs.certificate_no || "—"}</div>
        <div className="text-[10px] text-stone-500">Iss: {r.dbs.issued_date || "—"}</div>
        <div className="text-[10px] text-stone-500">Exp: {r.dbs.expiry_date || "—"}</div>
      </td>
      <Cell status={r.barred_list.status}>{r.barred_list.text}</Cell>
      <Cell status={r.right_to_work.status}>{r.right_to_work.text}</Cell>
      <Cell status={r.id_verified.status}>{r.id_verified.text}</Cell>
      <Cell status={r.references.status}>{r.references.text}</Cell>
      <Cell status={r.qualifications.status}>{r.qualifications.text}</Cell>
      <Cell status={r.mandatory_training.status}>{r.mandatory_training.text}</Cell>
      <Cell status={r.last_supervision.status}>{r.last_supervision.text}</Cell>
      <Cell status={r.last_appraisal.status}>{r.last_appraisal.text}</Cell>
      <Cell status={r.probation.status}>{r.probation.text}</Cell>
      <td className="px-2 py-1.5 align-top">
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: overall.bg, color: overall.fg }}>
          {overall.label}
        </span>
      </td>
    </tr>
  );
}

function Select({ value, setValue, options, testid }) {
  return (
    <select
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className="bg-stone-50 border divider-soft rounded-md text-[12px] px-2 py-1 hover:bg-white focus:outline-none focus:ring-1 focus:ring-[#0e3b4a]"
      data-testid={testid}
    >
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}
