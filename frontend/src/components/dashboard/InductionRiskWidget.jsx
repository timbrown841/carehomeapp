/* Phase E.3.1 — Induction at-Risk Dashboard Widget */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { GraduationCap, AlertOctagon, Clock3, CheckCircle2, ChevronRight } from "lucide-react";

const TONE = {
  red:   { bg: "#FBE3E7", fg: "#7a1a28", line: "#A8273A" },
  amber: { bg: "#FCEFD4", fg: "#7a4d12", line: "#B8772F" },
  green: { bg: "#E7F3EC", fg: "#1f4f2b", line: "#2F6A3A" },
  grey:  { bg: "#F1EFEC", fg: "#5d6068", line: "#d4d2cc" },
};

export default function InductionRiskWidget() {
  const { isSeniorOrAbove } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isSeniorOrAbove) return;
    api.get("/induction/dashboard")
      .then(r => setData(r.data))
      .catch(() => {/* */});
  }, [isSeniorOrAbove]);

  if (!isSeniorOrAbove || !data) return null;

  const hasRisk = data.at_risk.length > 0;
  const tone = data.overdue.length > 0 ? "red"
              : data.at_risk.length > 0 ? "amber"
              : "green";
  const overall = TONE[tone];

  return (
    <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5" data-testid="induction-risk-widget">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[11px] uppercase font-semibold tracking-[0.14em] text-[#0e3b4a]">
            Staff Induction Compliance
          </div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-0.5">
            {data.signed_off} fully inducted · {data.in_progress} in progress
          </h3>
          {hasRisk && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold"
                 style={{ color: overall.fg }} data-testid="induction-at-risk-banner">
              <AlertOctagon size={14} /> {data.at_risk.length} staff induction{data.at_risk.length === 1 ? "" : "s"} at risk
            </div>
          )}
        </div>
        <Link to="/induction" className="text-xs text-[#0E3B4A] underline inline-flex items-center gap-1"
              data-testid="induction-widget-open">
          Open Induction Centre <ChevronRight size={12} />
        </Link>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        <KPI label="Due this week" value={data.due_this_week.length}
             tone={data.due_this_week.length > 0 ? "amber" : "green"}
             icon={Clock3} testid="induction-kpi-due-this-week" />
        <KPI label="Overdue" value={data.overdue.length}
             tone={data.overdue.length > 0 ? "red" : "green"}
             icon={AlertOctagon} testid="induction-kpi-overdue" />
        <KPI label="At risk" value={data.at_risk.length}
             tone={data.at_risk.length > 0 ? "amber" : "green"}
             icon={GraduationCap} testid="induction-kpi-at-risk" />
        <KPI label="Completed (30d)" value={data.recently_completed.length}
             tone={data.recently_completed.length > 0 ? "green" : "grey"}
             icon={CheckCircle2} testid="induction-kpi-recently-completed" />
      </div>

      {/* Compliance % bar */}
      <div className="rounded-xl border p-3" style={{ background: overall.bg, borderColor: overall.line }}>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[11px] uppercase font-semibold tracking-wider" style={{ color: overall.fg }}>
            Home induction compliance
          </span>
          <span className="font-display font-semibold text-xl" style={{ color: overall.fg }}>
            {data.compliance_pct}%
          </span>
        </div>
        <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${data.compliance_pct}%`, background: overall.line }} />
        </div>
      </div>

      {hasRisk && (
        <div className="mt-3" data-testid="induction-at-risk-list">
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
            At risk — action this week
          </div>
          <ul className="divide-y divide-stone-100">
            {data.at_risk.slice(0, 5).map(r => (
              <li key={r.id} className="py-1.5 flex items-center justify-between gap-2 text-sm">
                <Link to={`/induction/${r.id}`} className="text-stone-800 hover:underline truncate">
                  {r.staff_name}
                  <span className="text-[11px] text-stone-500 ml-2">{r.completion_pct}% · target {r.target_completion}</span>
                </Link>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${TONE[r.risk].bg} text-stone-800`}
                      style={{ color: TONE[r.risk].fg }}>
                  {r.risk.toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function KPI({ label, value, tone, icon: Icon, testid }) {
  const t = TONE[tone];
  return (
    <div className="rounded-xl border p-3" style={{ background: t.bg, borderColor: t.line }} data-testid={testid}>
      <div className="flex items-baseline justify-between">
        <span className="font-display font-semibold text-2xl" style={{ color: t.fg }}>{value}</span>
        <Icon size={14} style={{ color: t.fg, opacity: 0.7 }} />
      </div>
      <div className="text-[11px] font-semibold mt-1" style={{ color: t.fg }}>{label}</div>
    </div>
  );
}
