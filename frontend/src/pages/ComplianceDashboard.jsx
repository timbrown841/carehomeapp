/* Phase E.3.2 — Unified Compliance Dashboard.
 *
 * Lives as a tab inside the Policies Hub (/policies). Surfaces the seven
 * named KPI tiles + six widgets the Registered Manager needs before an
 * Ofsted or CQC inspection. Sector-adaptive — title changes from "Ofsted
 * Readiness" (children) to "CQC Readiness" (adult).
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { toast } from "sonner";
import {
  ShieldCheck, GraduationCap, FileText, Award, ClipboardCheck,
  Users, AlertOctagon, AlertTriangle, ChevronRight, Loader2,
  Calendar, TrendingUp, Sparkles,
} from "lucide-react";

const TONE = {
  red: "bg-rose-50 text-rose-800 border-rose-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  grey: "bg-stone-50 text-stone-700 border-stone-200",
};

const HERO_TONE = {
  red: { bg: "#FBE3E7", fg: "#7a1a28", line: "#A8273A" },
  amber: { bg: "#FCEFD4", fg: "#7a4d12", line: "#B8772F" },
  green: { bg: "#E7F3EC", fg: "#1f4f2b", line: "#2F6A3A" },
};

export default function ComplianceDashboard() {
  const { effectiveMode } = useOrg();
  const sector = effectiveMode === "adult" ? "adult" : "children";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/compliance/unified-dashboard?sector=${sector}`);
      setData(r.data);
    } catch (e) {
      if (e?.response?.status !== 403) toast.error("Could not load compliance dashboard");
    } finally { setLoading(false); }
  }, [sector]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return <div className="inline-flex items-center gap-2 text-sm text-stone-600">
      <Loader2 size={14} className="animate-spin" /> Loading compliance…
    </div>;
  }

  const hero = HERO_TONE[data.rag.regulator_readiness] || HERO_TONE.amber;

  return (
    <div className="space-y-5" data-testid="compliance-dashboard">
      {/* === Regulator Readiness hero === */}
      <section className="rounded-2xl border p-5 sm:p-6"
               style={{ background: hero.bg, borderColor: hero.line }}
               data-testid="compliance-regulator-hero">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase font-semibold tracking-[0.14em]"
                 style={{ color: hero.fg }}>
              {sector === "adult" ? "CQC Readiness" : "Ofsted Readiness"} · {sector === "adult" ? "Adult Services" : "Children's Services"}
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="font-display font-semibold text-5xl"
                    style={{ color: hero.fg, lineHeight: 1 }}
                    data-testid="compliance-regulator-score">
                {data.regulator_readiness_pct}
              </span>
              <span className="text-sm" style={{ color: hero.fg }}>/100</span>
            </div>
            <p className="text-sm mt-2 max-w-md" style={{ color: hero.fg }}>
              Weighted score: 30% policy · 25% induction · 20% supervision · 15% training · 10% acknowledgements.
              All metrics deterministic.
            </p>
          </div>
          <div className="text-right text-xs" style={{ color: hero.fg }}>
            Updated {new Date().toLocaleString()}
          </div>
        </div>
      </section>

      {/* === 7 KPI tiles === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="compliance-kpi-row">
        <KPI label="Policy Compliance" value={data.policy_pct} tone={data.rag.policy}
             icon={FileText} testid="kpi-policy" hint={`${data.counts.active_policies} active`}
             link="/policies?tab=library" />
        <KPI label="Staff Acknowledgements" value={data.acknowledgement_pct} tone={data.rag.acknowledgement}
             icon={ClipboardCheck} testid="kpi-acknowledgement"
             hint={`${data.counts.ack_done}/${data.counts.ack_total}`}
             link="/my-policies" />
        <KPI label="Training Compliance" value={data.training_pct} tone={data.rag.training}
             icon={Award} testid="kpi-training"
             link="/training" />
        <KPI label="Supervision Compliance" value={data.supervision_pct} tone={data.rag.supervision}
             icon={Users} testid="kpi-supervision" hint="Within 90 days"
             link="/supervisions" />
        <KPI label="Induction Compliance" value={data.induction_pct} tone={data.rag.induction}
             icon={GraduationCap} testid="kpi-induction"
             hint={`${data.counts.signed_off_inductions}/${data.counts.staff_total} signed off`}
             link="/induction" />
        <KPI label="Workforce Readiness" value={data.workforce_readiness_pct} tone={data.rag.workforce_readiness}
             icon={Sparkles} testid="kpi-workforce" hint="Composite 60/15/10/15"
             link="/training" />
        <KPI label={data.readiness_label} value={data.regulator_readiness_pct} tone={data.rag.regulator_readiness}
             icon={ShieldCheck} testid="kpi-regulator" hint="Inspection ready"
             link="/policy-intelligence" />
        <TrendTile trend={data.widgets.compliance_trend} />
      </div>

      {/* === 6 widgets row === */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="compliance-widgets">
        <WidgetTile w={data.widgets.policies_due_review} icon={Calendar}
                    link="/policies"
                    testid="widget-policies-due" />
        <WidgetTile w={data.widgets.overdue_policies} icon={AlertOctagon}
                    link="/policies"
                    testid="widget-policies-overdue" />
        <WidgetTile w={data.widgets.outstanding_acknowledgements} icon={ClipboardCheck}
                    link="/policies"
                    subValue={data.widgets.outstanding_acknowledgements.overdue ? `${data.widgets.outstanding_acknowledgements.overdue} overdue` : null}
                    testid="widget-ack-outstanding" />
        <WidgetTile w={data.widgets.inductions_at_risk} icon={GraduationCap}
                    link="/induction"
                    subValue={data.widgets.inductions_at_risk.overdue ? `${data.widgets.inductions_at_risk.overdue} overdue` : null}
                    testid="widget-inductions-at-risk" />
        <WidgetTile w={data.widgets.training_cliff_edge} icon={AlertTriangle}
                    link="/training"
                    testid="widget-training-cliff" />
        {/* Compliance trend takes the last slot */}
        <div className="bg-white border divider-soft rounded-xl p-4" data-testid="widget-compliance-trend">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-600 inline-flex items-center gap-1.5">
              <TrendingUp size={12} /> Compliance Trend
            </div>
          </div>
          <MiniTrend points={data.widgets.compliance_trend} />
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, tone, icon: Icon, testid, hint, link }) {
  const body = (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-display font-semibold text-3xl leading-none">{value}%</span>
        <div className="flex items-center gap-1">
          <Icon size={14} className="opacity-70" />
          {link && <ChevronRight size={11} className="opacity-50" />}
        </div>
      </div>
      <div className="text-[11px] font-semibold mt-1.5">{label}</div>
      {hint && <div className="text-[10px] opacity-80 mt-0.5">{hint}</div>}
      {link && <div className="text-[10px] opacity-70 mt-1 underline">View records →</div>}
    </>
  );
  const cls = `rounded-xl border p-4 ${TONE[tone] || TONE.grey} ${link ? "block hover:opacity-90 transition" : ""}`;
  if (link) {
    return <Link to={link} className={cls} data-testid={testid}>{body}</Link>;
  }
  return <div className={cls} data-testid={testid}>{body}</div>;
}

function WidgetTile({ w, icon: Icon, link, subValue, testid }) {
  const cls = TONE[w.rag] || TONE.grey;
  return (
    <Link to={link} className={`block rounded-xl border p-4 hover:opacity-90 transition ${cls}`}
          data-testid={testid}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display font-semibold text-2xl leading-none">{w.count}</div>
          <div className="text-[11px] font-semibold mt-1.5">{w.label}</div>
          {subValue && <div className="text-[10px] mt-0.5">{subValue}</div>}
        </div>
        <div className="flex items-center gap-1">
          <Icon size={14} className="opacity-70" />
          <ChevronRight size={12} className="opacity-50" />
        </div>
      </div>
    </Link>
  );
}

function TrendTile({ trend }) {
  if (!trend || trend.length < 2) {
    return (
      <div className="rounded-xl border bg-stone-50 border-stone-200 p-4" data-testid="kpi-trend">
        <div className="text-[11px] font-semibold mt-1.5 text-stone-700">Trend</div>
        <div className="text-[10px] text-stone-500 mt-0.5">More data needed</div>
      </div>
    );
  }
  const last = trend[trend.length - 1].value;
  const first = trend[0].value;
  const delta = last - first;
  const tone = delta >= 0 ? "green" : "red";
  return (
    <div className={`rounded-xl border p-4 ${TONE[tone]}`} data-testid="kpi-trend">
      <div className="flex items-baseline justify-between">
        <span className="font-display font-semibold text-2xl leading-none">
          {delta > 0 ? "+" : ""}{delta}%
        </span>
        <TrendingUp size={14} className="opacity-70" />
      </div>
      <div className="text-[11px] font-semibold mt-1.5">7-day Trend</div>
      <div className="text-[10px] mt-0.5 opacity-80">From {first}% to {last}%</div>
    </div>
  );
}

function MiniTrend({ points }) {
  if (!points || points.length === 0) {
    return <div className="text-xs text-stone-500">No data yet.</div>;
  }
  const max = Math.max(...points.map(p => p.value), 1);
  return (
    <div className="h-[60px] flex items-end gap-1">
      {points.map((p, i) => (
        <div key={i} className="flex-1 rounded-t"
             style={{ height: `${(p.value / Math.max(max, 1)) * 50 + 8}px`,
                      background: p.value >= 85 ? "#2F6A3A" : p.value >= 65 ? "#B8772F" : "#A8273A",
                      opacity: i === points.length - 1 ? 1 : 0.65 }}
             title={`${p.date}: ${p.value}%`} />
      ))}
    </div>
  );
}
