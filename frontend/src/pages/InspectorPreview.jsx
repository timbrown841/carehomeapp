/* Public Inspector Preview — Phase F.3
 *
 * No auth. Token-gated. Read-only SCR view for inspectors, RIs, Reg 44 visitors.
 * Scope-locked: only the SCR + KPIs are visible. No drill-down, no downloads.
 *
 * Renders an "Access expired" page for invalid/expired/revoked tokens.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import {
  ShieldCheck, AlertTriangle, Clock, Lock, Hash,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TONE = {
  red:   { fg: "#7a1a28", bg: "#FBE3E7", line: "#A8273A", label: "Action" },
  amber: { fg: "#7a4d12", bg: "#FCEFD4", line: "#B8772F", label: "Soon" },
  green: { fg: "#1f4f2b", bg: "#E7F3EC", line: "#2F6A3A", label: "OK" },
  grey:  { fg: "#5d6068", bg: "#F1EFEC", line: "#5d6068", label: "—" },
};

function fmtExpiry(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function InspectorPreview() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await axios.get(`${API}/hr/scr/inspector-preview/${token}`);
        if (!cancelled) setData(r.data);
      } catch (e) {
        if (!cancelled) {
          setError(
            e?.response?.status === 404
              ? "expired"
              : "error",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center"
        data-testid="inspector-preview-loading">
        <div className="text-stone-500 text-sm">Loading inspector preview…</div>
      </div>
    );
  }

  if (error === "expired") {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center px-4"
        data-testid="inspector-preview-expired">
        <div className="max-w-md bg-white rounded-2xl shadow-sm border divider-soft p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-[#FBE3E7] flex items-center justify-center">
            <AlertTriangle size={20} className="text-[#A8273A]" />
          </div>
          <h1 className="font-display font-semibold text-xl mt-3 text-[#0F1115]">Access expired</h1>
          <p className="text-[13px] text-stone-600 mt-2 leading-relaxed">
            This inspector preview link is no longer valid. It may have expired,
            been revoked by the home manager, or never existed.
          </p>
          <p className="text-[11px] text-stone-500 mt-3">
            Please ask the home manager to share a new preview link.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center"
        data-testid="inspector-preview-error">
        <div className="text-stone-500 text-sm">Unable to load inspector preview.</div>
      </div>
    );
  }

  const preview = data.preview;
  return (
    <div className="min-h-screen bg-stone-50" data-testid="inspector-preview-page">
      {/* Read-only banner */}
      <div
        className="text-white px-4 py-2.5 flex items-center gap-2 flex-wrap"
        style={{ background: "linear-gradient(90deg, #0F2A47 0%, #1E4D5C 100%)" }}
        data-testid="inspector-preview-banner"
      >
        <Lock size={13} className="text-[#FCB960] shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/90">
          Read-only inspector preview
        </span>
        <span className="text-[11px] text-white/70">
          Expires {fmtExpiry(data.expires_at)}
        </span>
        <span className="text-[11px] text-white/50 ml-auto">
          Shared by {data.created_by_name || "the home manager"}
        </span>
      </div>

      {/* Hero */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
        <div className="rounded-2xl p-5 sm:p-6 mb-4 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0E3B4A 0%, #0a2734 60%, #1E4D5C 100%)", color: "white" }}>
          <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-[#B8772F]/10 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-[#FCB960]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                Single Central Record · {data.home_name || "Children's Services"}
              </span>
            </div>
            <h1 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5"
              style={{ letterSpacing: "-0.02em" }}>
              Inspection-ready compliance evidence
            </h1>
            <p className="text-[12px] text-white/65 mt-1 max-w-2xl">
              {data.banner_text}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
              <KPI label="Compliant"            value={preview.kpis.compliant}            tone="#7BD79A" />
              <KPI label="DBS expiring (60d)"   value={preview.kpis.expiring_dbs_60d}     tone="#FDCC72" />
              <KPI label="Overdue supervisions" value={preview.kpis.overdue_supervisions} tone="#FCA1A6" />
              <KPI label="References gap"       value={preview.kpis.missing_references}   tone="#FCA1A6" />
              <KPI label="Expired training"     value={preview.kpis.expired_training}     tone="#FCA1A6" />
            </div>

            <div className="flex gap-2 mt-4 flex-wrap text-[10px] text-white/55">
              <span>{preview.total_staff} staff in this view</span>
              <span>·</span>
              <span>Generated {fmtExpiry(preview.generated_at)}</span>
            </div>
          </div>
        </div>

        {/* Privacy notice */}
        <div className="bg-white border divider-soft rounded-xl p-3 mb-3 flex items-start gap-2"
          data-testid="inspector-preview-privacy">
          <ShieldCheck size={14} className="text-[#0e3b4a] mt-0.5 shrink-0" />
          <div className="text-[11px] text-stone-600 leading-relaxed">
            <strong className="text-[#0F1115]">Scope of access:</strong> this view shows
            only the Single Central Record summary. No personnel files, uploaded
            documents, HR notes, sickness records, disciplinary detail, reflective
            diaries or narrative records are accessible via this link. All access is
            audit-logged with timestamp, IP and user agent.
          </div>
        </div>

        {/* SCR table */}
        <section className="bg-white border divider-soft rounded-2xl overflow-hidden"
          data-testid="inspector-preview-table-section">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" data-testid="inspector-preview-table">
              <thead className="bg-[#0F2A47] text-white">
                <tr>
                  <Th>#</Th>
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
                {preview.rows.length === 0 ? (
                  <tr><td colSpan={16} className="text-center py-6 text-stone-500 italic">
                    No staff in this view.
                  </td></tr>
                ) : preview.rows.map((r) => <Row key={r.display_idx} r={r} />)}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-[10px] text-stone-500 px-1 mt-3 leading-relaxed flex items-start gap-1.5"
          data-testid="inspector-preview-footer">
          <Hash size={10} className="mt-0.5 shrink-0 text-stone-400" />
          Safelyn Systems · Deterministic operational compliance · Same data in → same SCR out.
          Inspector preview is read-only and audit-logged.
        </p>
      </div>
    </div>
  );
}

function KPI({ label, value, tone }) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg p-2.5 flex items-center gap-2.5 border border-white/5">
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

function Cell({ status, mono = false, children }) {
  const t = TONE[status] || TONE.grey;
  const isNonGreen = status && status !== "green";
  return (
    <td className="px-2 py-1.5 align-top" style={{ background: isNonGreen ? t.bg : undefined }}>
      <div className={`text-[11px] ${mono ? "font-mono" : ""}`} style={{ color: isNonGreen ? t.fg : "#0F1115" }}>
        {children}
      </div>
    </td>
  );
}

function Row({ r }) {
  const overall = TONE[r.overall_status] || TONE.grey;
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50/60">
      <td className="px-2 py-2 align-top text-[10px] text-stone-400 font-mono">{r.display_idx}</td>
      <td className="px-2 py-2 align-top">
        <div className="font-semibold text-[12px] text-[#0F1115]">{r.name}</div>
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
