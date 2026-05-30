/* Phase E.2 — Training Cliff Edge widget for Dashboard.
 *
 * Shows 30/60/90 day expiry buckets, overdue count, next-6-month renewal
 * waves and a 30-day workforce-readiness trend line. All deterministic —
 * no AI scoring.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { CalendarClock, TrendingUp, AlertTriangle, GraduationCap, ChevronRight } from "lucide-react";

const TONE = {
  red:   { bg: "#FBE3E7", fg: "#7a1a28", line: "#A8273A" },
  amber: { bg: "#FCEFD4", fg: "#7a4d12", line: "#B8772F" },
  green: { bg: "#E7F3EC", fg: "#1f4f2b", line: "#2F6A3A" },
  grey:  { bg: "#F1EFEC", fg: "#5d6068", line: "#d4d2cc" },
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthLabel(ym) {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

export default function CliffEdgeWidget() {
  const { isSeniorOrAbove } = useAuth();
  const { effectiveMode } = useOrg();
  const sector = effectiveMode === "adult" ? "adult" : "children";
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isSeniorOrAbove) return;
    api.get(`/training-centre/cliff-edge?sector=${sector}`)
      .then(r => setData(r.data))
      .catch(() => {/* ignore */});
  }, [sector, isSeniorOrAbove]);

  if (!isSeniorOrAbove || !data) return null;

  const overdueTone = data.buckets.overdue > 0 ? "red" : "green";

  // Trend bar values
  const trendMax = Math.max(...data.trend.map(t => t.compliance_pct), 1);
  const trendFirst = data.trend[0]?.compliance_pct ?? 0;
  const trendLast = data.trend[data.trend.length - 1]?.compliance_pct ?? 0;
  const trendDelta = trendLast - trendFirst;

  // Cap waves to next 6 months for display
  const waves = (data.renewal_waves || []).slice(0, 6);
  const waveMax = Math.max(...waves.map(w => w.count), 1);

  return (
    <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5"
             data-testid="cliff-edge-widget">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[11px] uppercase font-semibold tracking-[0.14em] text-[#0e3b4a]">
            Training Cliff Edge
          </div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-0.5">
            Workforce renewal horizon
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Deterministic — based on mandatory training expiry dates. Plan now, not in panic.
          </p>
        </div>
        <Link to="/training" className="text-xs text-[#0E3B4A] underline inline-flex items-center gap-1"
              data-testid="cliff-edge-open-link">
          Open Training Centre <ChevronRight size={12} />
        </Link>
      </div>

      {/* Bucket strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Bucket label="Overdue" value={data.buckets.overdue} tone={overdueTone} testid="cliff-overdue" sub="Take action today" />
        <Bucket label="≤ 30 days" value={data.buckets["30"]} tone={data.buckets["30"] > 0 ? "amber" : "green"} testid="cliff-30" sub="Schedule this month" />
        <Bucket label="31–60 days" value={data.buckets["60"]} tone={data.buckets["60"] > 0 ? "amber" : "green"} testid="cliff-60" sub="Book this month" />
        <Bucket label="61–90 days" value={data.buckets["90"]} tone="grey" testid="cliff-90" sub="On the horizon" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Renewal waves */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-600 mb-2 inline-flex items-center gap-1.5">
            <CalendarClock size={12} /> Monthly renewal waves (next 6 mo)
          </div>
          {waves.length === 0 ? (
            <div className="text-xs text-stone-500 py-3">No renewals due in the next 6 months. Calm waters.</div>
          ) : (
            <div className="space-y-1.5" data-testid="cliff-waves">
              {waves.map(w => (
                <div key={w.month} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-stone-700">{monthLabel(w.month)}</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-3 overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${(w.count / waveMax) * 100}%`, background: w.count > 5 ? "#B23A48" : w.count > 2 ? "#B8772F" : "#2F6A3A" }} />
                  </div>
                  <span className="text-stone-800 font-medium w-6 text-right">{w.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trend chart (last 30 days) */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-600 mb-2 inline-flex items-center justify-between w-full">
            <span className="inline-flex items-center gap-1.5"><TrendingUp size={12} /> 30-day readiness trend</span>
            <span className={`text-[11px] font-medium ${trendDelta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {trendDelta > 0 ? "+" : ""}{trendDelta}%
            </span>
          </div>
          <div className="bg-stone-50 rounded-lg p-3 h-[100px] flex items-end gap-[2px]" data-testid="cliff-trend">
            {data.trend.map((p, i) => {
              const h = (p.compliance_pct / Math.max(trendMax, 1)) * 80 + 4;
              const colour = p.compliance_pct >= 85 ? "#2F6A3A" : p.compliance_pct >= 65 ? "#B8772F" : "#A8273A";
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{ height: `${h}px`, background: colour, opacity: i === data.trend.length - 1 ? 1 : 0.65 }}
                  title={`${p.date}: ${p.compliance_pct}% (${p.source})`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-stone-500 mt-1">
            <span>{data.trend[0]?.date}</span>
            <span>Today: {trendLast}%</span>
          </div>
        </div>
      </div>

      {/* Qualification renewals strip */}
      {data.qualification_renewals.length > 0 && (
        <div className="mt-4 pt-3 border-t border-stone-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5 inline-flex items-center gap-1.5">
            <GraduationCap size={12} /> Qualifications completing in 90 days
          </div>
          <ul className="text-xs space-y-0.5">
            {data.qualification_renewals.slice(0, 5).map((q, i) => (
              <li key={i} className="flex justify-between text-stone-700">
                <span>{q.staff_name} · {q.qualification_name}</span>
                <span className="text-stone-500">{q.expected_completion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Bucket({ label, value, tone, testid, sub }) {
  const t = TONE[tone];
  return (
    <div className="rounded-xl border p-3" style={{ background: t.bg, borderColor: t.line }} data-testid={testid}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-display font-semibold text-2xl" style={{ color: t.fg, lineHeight: 1 }}>{value}</span>
        {tone === "red" && <AlertTriangle size={14} style={{ color: t.fg }} />}
      </div>
      <div className="text-[11px] font-semibold mt-1" style={{ color: t.fg }}>{label}</div>
      <div className="text-[10px] mt-0.5" style={{ color: t.fg, opacity: 0.8 }}>{sub}</div>
    </div>
  );
}
