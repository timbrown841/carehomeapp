/* Phase H.2 — Policy Intelligence Dashboard
 *
 * Manager-facing intelligence layer: pulls deterministic, evidence-linked
 * insight from the existing policy, induction, SoP and SCR data. Designed
 * for Registered Managers, Responsible Individuals, Reg 44 visitors and
 * Ofsted/CQC inspectors.
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  TrendingDown, AlertTriangle, ShieldCheck, GraduationCap, ScrollText,
  Users, FileDown, Loader2, RefreshCw, ChevronRight, CheckCircle2,
  Activity, Calendar, FileWarning, Sparkles,
} from "lucide-react";

const RAG = {
  red:   { bg: "#FBE3E7", fg: "#7a1a28", line: "#A8273A" },
  amber: { bg: "#FCEFD4", fg: "#7a4d12", line: "#B8772F" },
  green: { bg: "#E7F3EC", fg: "#1f4f2b", line: "#2F6A3A" },
  grey:  { bg: "#F1EFEC", fg: "#5d6068", line: "#d4d2cc" },
};

function bandFor(pct) {
  if (pct >= 85) return "green";
  if (pct >= 65) return "amber";
  return "red";
}

export default function PolicyIntelligence() {
  const { isManagerOrAbove } = useAuth();
  const { effectiveMode } = useOrg();
  const sector = effectiveMode === "adult" ? "adult" : "children";
  const [data, setData] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [intel, score] = await Promise.all([
        api.get(`/policy-intelligence/dashboard?sector=${sector}`),
        api.get(`/inspection-readiness/score?sector=${sector}`),
      ]);
      setData(intel.data);
      setReadiness(score.data);
    } catch (e) {
      if (e?.response?.status !== 403) toast.error("Could not load intelligence data.");
    } finally { setLoading(false); }
  }, [sector]);
  useEffect(() => { load(); }, [load]);

  const downloadPack = async () => {
    setDownloading(true);
    try {
      const r = await api.get(`/inspection-readiness/evidence-pack.pdf?sector=${sector}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inspection-evidence-pack-${sector}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Inspection evidence pack downloaded.");
    } catch { toast.error("Could not generate evidence pack."); }
    finally { setDownloading(false); }
  };

  if (!isManagerOrAbove) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 text-sm text-stone-700"
           data-testid="policy-intel-blocked">
        Manager+ only — intelligence is restricted.
      </div>
    );
  }

  if (loading || !data || !readiness) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 inline-flex items-center gap-2 text-stone-600 text-sm">
        <Loader2 size={14} className="animate-spin" /> Loading intelligence…
      </div>
    );
  }

  const pol = data.policy_compliance;
  const due = data.policies_due_review;
  const ind = data.induction_intelligence;
  const sopState = data.governance;
  const overall = RAG[data.overall_rag] || RAG.grey;

  return (
    <div className="space-y-4 max-w-7xl mx-auto" data-testid="policy-intelligence-page">
      <header className="rounded-2xl p-5 sm:p-6"
              style={{ background: "linear-gradient(135deg, #0E3B4A 0%, #0a2734 60%, #1E4D5C 100%)", color: "white" }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#FCB960]">
              <Activity size={14} />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                Policy Intelligence · Inspection Readiness
              </span>
            </div>
            <h1 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5"
                style={{ letterSpacing: "-0.02em" }}>
              {readiness.overall_score >= 85
                ? "You're inspection-ready."
                : readiness.overall_score >= 65
                ? "Close to inspection-ready — finish the open actions."
                : "Action required before inspection."}
            </h1>
            <p className="text-[12px] text-white/65 mt-1 max-w-2xl">
              Deterministic, evidence-linked — every metric traces back to the audit log.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={downloadPack}
              disabled={downloading}
              data-testid="evidence-pack-btn"
              className="bg-[#B8772F] hover:bg-[#a3661f] text-white text-[12px] h-9"
            >
              {downloading ? <Loader2 size={12} className="animate-spin mr-1.5" />
                           : <FileDown size={12} className="mr-1.5" />}
              Generate Inspection Evidence Pack
            </Button>
            <button onClick={load}
                    className="text-white/70 hover:text-white p-1.5 rounded hover:bg-white/10"
                    data-testid="intel-refresh">
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Inspection Ready in 3 Clicks */}
      <section className="bg-white border-2 rounded-2xl p-5"
               style={{ borderColor: overall.line }}
               data-testid="inspection-ready-card">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
              Inspection Ready · {sector === "adult" ? "Adult Services" : "Children's Services"}
            </div>
            <div className="font-display font-bold text-4xl mt-1" style={{ color: overall.fg }}
                 data-testid="readiness-overall-score">
              {readiness.overall_score}<span className="text-base text-stone-400">/100</span>
            </div>
            <div className="text-[12px] text-stone-500 mt-0.5">
              Updated {(readiness.generated_at || "").slice(11, 16)} UTC · 5-pillar mean
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded shrink-0"
                style={{ background: overall.bg, color: overall.fg }}>
            {readiness.rag_status}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {readiness.pillars.map((p) => {
            const tone = RAG[bandFor(p.score)];
            return (
              <Link
                key={p.key}
                to={p.evidence || "#"}
                data-testid={`pillar-${p.key}`}
                className="block rounded-xl border p-3 hover:bg-stone-50"
                style={{ borderColor: tone.line }}
              >
                <div className="font-display font-bold text-2xl" style={{ color: tone.fg }}>
                  {p.score}<span className="text-xs text-stone-400">/100</span>
                </div>
                <div className="text-[11px] uppercase tracking-wider font-bold text-stone-500 mt-1">
                  {p.label}
                </div>
                <div className="text-[10px] text-[#0e3b4a] mt-1 inline-flex items-center gap-0.5 hover:underline">
                  View evidence <ChevronRight size={10} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Policy Compliance */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="policy-compliance-block">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="font-display font-semibold text-lg text-[#0F1115] flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#0e3b4a]" />
            Policy compliance
          </h2>
          <div className="font-display font-bold text-2xl" style={{ color: RAG[bandFor(pol.overall_pct)].fg }}>
            {pol.overall_pct}%
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat label="Active assignments" value={pol.active_assignments} />
          <Stat label="Complete" value={pol.complete} tone="green" />
          <Stat label="Overdue" value={pol.overdue} tone={pol.overdue ? "red" : "grey"} />
        </div>
        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <div data-testid="by-role-table">
            <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">
              By role
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-stone-500 text-[10px] uppercase tracking-wider">
                  <th className="text-left py-1.5">Role</th>
                  <th className="text-right">Complete</th>
                  <th className="text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {pol.by_role.length === 0 ? (
                  <tr><td colSpan="3" className="text-stone-400 italic py-2">No assignments yet.</td></tr>
                ) : pol.by_role.map((r) => (
                  <tr key={r.role} className="border-t divider-soft"
                      data-testid={`role-${r.role}`}>
                    <td className="py-1.5 font-semibold capitalize">{r.role}</td>
                    <td className="text-right">{r.complete}/{r.total}</td>
                    <td className="text-right font-bold"
                        style={{ color: RAG[bandFor(r.pct)].fg }}>
                      {r.pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div data-testid="by-staff-table">
            <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">
              Staff needing attention
            </div>
            <ul className="space-y-1">
              {pol.by_staff.filter((s) => s.pct < 100).slice(0, 8).map((s) => (
                <li key={s.staff_id}
                    data-testid={`staff-row-${s.staff_id}`}
                    className="text-[12px] flex items-center justify-between border-b divider-soft py-1.5">
                  <span className="font-semibold">{s.staff_name}</span>
                  <span className="flex items-center gap-2">
                    {s.overdue > 0 && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-[#FBE3E7] text-[#7a1a28]">
                        {s.overdue} overdue
                      </span>
                    )}
                    <span className="font-bold" style={{ color: RAG[bandFor(s.pct)].fg }}>
                      {s.pct}%
                    </span>
                  </span>
                </li>
              ))}
              {pol.by_staff.filter((s) => s.pct < 100).length === 0 && (
                <li className="text-stone-400 italic text-[12px] py-2">Everyone is up to date.</li>
              )}
            </ul>
          </div>
        </div>
      </section>

      {/* Most failed policies */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="most-failed-block">
        <h2 className="font-display font-semibold text-lg text-[#0F1115] mb-3 flex items-center gap-2">
          <TrendingDown size={16} className="text-[#0e3b4a]" /> Most failed policies · top 10
        </h2>
        {data.most_failed_policies.length === 0 ? (
          <div className="text-[13px] text-stone-500 py-3">
            No failed assessments yet — staff are passing on first attempt.
          </div>
        ) : (
          <ul className="divide-y divider-soft">
            {data.most_failed_policies.map((p) => (
              <li key={p.policy_id}
                  data-testid={`failed-${p.policy_id}`}
                  className="py-2 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <Link to={`/policies/${p.policy_id}`}
                        className="text-sm font-semibold text-stone-900 hover:underline">
                    {p.policy_title}
                  </Link>
                  <div className="text-[11px] text-stone-500">
                    {p.policy_category} · {p.attempts} attempt{p.attempts === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-[12px]">
                  <span><span className="text-stone-500">Fails:</span> <strong className="text-[#7a1a28]">{p.fails}</strong></span>
                  <span><span className="text-stone-500">Avg:</span> <strong>{p.avg_score_pct}%</strong></span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#FBE3E7] text-[#7a1a28]">
                    {p.fail_rate_pct}% fail rate
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Policies due review */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="due-review-block">
        <h2 className="font-display font-semibold text-lg text-[#0F1115] mb-3 flex items-center gap-2">
          <Calendar size={16} className="text-[#0e3b4a]" /> Policies due review
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <ReviewBucket label="Overdue"   list={due.overdue}            tone="red"   testid="overdue" />
          <ReviewBucket label="Due ≤ 30d" list={due.due_within_30_days} tone="amber" testid="due-30" />
          <ReviewBucket label="Due ≤ 60d" list={due.due_within_60_days} tone="grey"  testid="due-60" />
        </div>
      </section>

      {/* Induction intelligence */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="induction-intel-block">
        <h2 className="font-display font-semibold text-lg text-[#0F1115] mb-3 flex items-center gap-2">
          <GraduationCap size={16} className="text-[#0e3b4a]" /> Induction intelligence
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <Stat label="Not started"   value={ind.not_started} tone={ind.not_started ? "amber" : "green"} />
          <Stat label="In progress"   value={ind.in_progress} tone="amber" />
          <Stat label="Overdue"       value={ind.overdue}     tone={ind.overdue ? "red" : "green"} />
          <Stat label="Completion %"  value={`${ind.completion_pct}%`} tone={bandFor(ind.completion_pct)} />
          <Stat label="Avg days"      value={ind.avg_completion_days ?? "—"} tone="grey" />
        </div>
        {ind.new_starter_attention.length > 0 && (
          <div className="mt-4 p-3 rounded-xl border border-[#B8772F]/30 bg-[#FCEFD4]/40"
               data-testid="new-starter-attention">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#7a4d12] flex items-center gap-1">
              <Sparkles size={12} /> New starters needing attention
            </div>
            <ul className="mt-1 text-[12px] text-stone-700 space-y-0.5">
              {ind.new_starter_attention.map((s) => (
                <li key={s.enrollment_id}>{s.staff_name} · started {(s.started_at || "").slice(0, 10)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Governance */}
      {sopState && (
        <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="gov-intel-block">
          <h2 className="font-display font-semibold text-lg text-[#0F1115] mb-3 flex items-center gap-2">
            <ScrollText size={16} className="text-[#0e3b4a]" /> Governance · Statement of Purpose
          </h2>
          {!sopState.exists ? (
            <div className="text-[13px] text-stone-500">
              No Statement of Purpose uploaded yet. <Link to="/governance" className="text-[#0e3b4a] font-semibold hover:underline">Open Governance Hub →</Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-4 gap-3">
              <Stat label="Compliance"
                    value={`${sopState.compliance_pct}%`}
                    tone={bandFor(sopState.compliance_pct)} />
              <Stat label="Total assigned" value={sopState.total} />
              <Stat label="Outstanding"
                    value={sopState.outstanding.length}
                    tone={sopState.outstanding.length ? "amber" : "green"} />
              <Stat label="Review"
                    value={sopState.days_to_review !== null
                      ? sopState.days_to_review < 0
                        ? `${Math.abs(sopState.days_to_review)}d overdue`
                        : `${sopState.days_to_review}d`
                      : "—"}
                    tone={sopState.review_rag} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}


function Stat({ label, value, tone = "grey" }) {
  const t = RAG[tone] || RAG.grey;
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: t.line }}>
      <div className="font-display font-bold text-2xl" style={{ color: t.fg }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mt-0.5">{label}</div>
    </div>
  );
}


function ReviewBucket({ label, list, tone, testid }) {
  const t = RAG[tone] || RAG.grey;
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: t.line }}
         data-testid={`review-${testid}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500">{label}</div>
      <div className="font-display font-bold text-2xl mt-1" style={{ color: t.fg }}>
        {list.length}
      </div>
      {list.length > 0 && (
        <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
          {list.slice(0, 6).map((p) => (
            <li key={p.policy_id} className="text-[11.5px] truncate">
              <Link to={`/policies/${p.policy_id}`} className="hover:underline">
                {p.policy_title}
              </Link>
              <span className="text-stone-400 ml-1">({p.days_to_review}d)</span>
            </li>
          ))}
          {list.length > 6 && (
            <li className="text-[10px] text-stone-400">+{list.length - 6} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
