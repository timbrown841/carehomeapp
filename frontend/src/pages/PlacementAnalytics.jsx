/* Placement Analytics — Children's Compliance & Oversight only, Manager+ only.
 *
 * Executive-style conversion analytics derived purely from the placement
 * simulation audit log. NO PII, NO narrative, NO initials in any chart.
 *
 * Audience: Registered Managers, Responsible Individuals, Directors, Quality Leads.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import {
  BarChart3, Loader2, Sparkles, Lock, ArrowUpRight, ArrowDownRight, Minus,
  Moon, Activity, ShieldCheck, AlertTriangle, Calendar, Building2,
} from "lucide-react";

const PERIODS = [[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"]];

const OUTCOME = {
  converted:           { label: "Converted",       fg: "#2F6A3A", bg: "#2F6A3A20", line: "#2F6A3A" },
  more_info_requested: { label: "More info",       fg: "#B8772F", bg: "#B8772F25", line: "#B8772F" },
  under_review:        { label: "Under review",    fg: "#5D6068", bg: "#5D606820", line: "#5D6068" },
  not_progressed:      { label: "Not progressed",  fg: "#A8273A", bg: "#A8273A20", line: "#A8273A" },
};
const RISK = {
  low:      { label: "Low",      fg: "#2F6A3A", bg: "#2F6A3A20" },
  medium:   { label: "Medium",   fg: "#B8772F", bg: "#B8772F25" },
  high:     { label: "High",     fg: "#A8273A", bg: "#A8273A20" },
  critical: { label: "Critical", fg: "#5A0E1C", bg: "#5A0E1C20" },
};
const CONF = {
  strong:          { label: "Strong",         fg: "#2F6A3A", bg: "#2F6A3A20" },
  manageable:      { label: "Manageable",     fg: "#B8772F", bg: "#B8772F25" },
  elevated:        { label: "Elevated",       fg: "#A8273A", bg: "#A8273A20" },
  not_recommended: { label: "Not recommended",fg: "#5A0E1C", bg: "#5A0E1C20" },
};
const READINESS = {
  good:      { label: "Stable",          fg: "#2F6A3A" },
  watch:     { label: "Watching",        fg: "#5D6068" },
  elevated:  { label: "Elevated",        fg: "#B8772F" },
  high_risk: { label: "Unstable",        fg: "#A8273A" },
};

export default function PlacementAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get(`/placement-intelligence/conversion-analytics?days=${days}`);
      setData(r.data);
    } catch (e) {
      setError(e?.response?.status === 403 ? "Manager+ only." : "Could not load placement analytics.");
    } finally { setLoading(false); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 flex items-center gap-2 text-stone-600 text-sm" data-testid="placement-analytics">
        <Loader2 size={14} className="animate-spin" /> Loading placement analytics…
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 text-sm text-stone-700" data-testid="placement-analytics">{error}</div>
    );
  }

  return (
    <div className="space-y-4" data-testid="placement-analytics">
      {/* Hero: period switcher + headline */}
      <HeroCard data={data} days={days} setDays={setDays} />

      {/* 2-column distributions */}
      <div className="grid lg:grid-cols-3 gap-4">
        <DistributionCard
          testid="analytics-outcomes-card"
          title="Simulation outcomes"
          subtitle="What managers decided"
          data={data.outcomes}
          meta={OUTCOME}
          total={data.totals.simulations}
        />
        <DistributionCard
          testid="analytics-risk-card"
          title="Risk distribution"
          subtitle="Across all simulations in the period"
          data={data.risk_distribution}
          meta={RISK}
          total={data.totals.simulations}
        />
        <DistributionCard
          testid="analytics-confidence-card"
          title="Matching confidence"
          subtitle="System's deterministic recommendation"
          data={data.confidence_distribution}
          meta={CONF}
          total={data.totals.simulations}
        />
      </div>

      {/* Referral pressure + home readiness trend */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ReferralPressureCard data={data} />
        <HomeReadinessTrendCard data={data} />
      </div>

      {/* Commissioning & referral trends — per-LA breakdown */}
      <CommissioningInsightsCard data={data} />

      {/* Privacy + Ofsted/RI value */}
      <div className="bg-stone-50 border divider-soft rounded-2xl p-4 flex items-start gap-3" data-testid="analytics-privacy-notice">
        <Lock size={14} className="text-stone-500 mt-0.5 shrink-0" />
        <p className="text-[12px] text-stone-700 leading-relaxed">
          <span className="font-semibold">Privacy boundary:</span> these analytics are aggregated from audit
          metadata only — no referral narrative, uploaded documents or young-person initials appear in any
          chart. Useful for RI oversight, Regulation 44, Ofsted leadership judgement and quality assurance
          governance.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero card — headline + period switcher                              */
/* ------------------------------------------------------------------ */
function HeroCard({ data, days, setDays }) {
  const t = data.totals;
  const delta = t.simulations_delta_pct;
  const avg = data.averages;
  return (
    <section
      className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0F2A47 0%, #0a1e34 100%)", color: "white" }}
      data-testid="analytics-hero"
    >
      <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-white/5 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-white/80" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                Placement decision oversight
              </span>
            </div>
            <h2 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5" style={{ letterSpacing: "-0.02em" }}>
              {t.simulations} simulation{t.simulations === 1 ? "" : "s"} · {data.conversion_rate_pct}% converted
            </h2>
            <p className="text-[12px] text-white/70 mt-1 max-w-2xl">
              Aggregate placement decision intelligence for RIs, Quality Leads and Directors. Updated live from
              the deterministic audit log.
            </p>
          </div>
          {/* Period switcher */}
          <div className="flex gap-1.5 bg-white/10 backdrop-blur rounded-full p-1" data-testid="analytics-period-switcher">
            {PERIODS.map(([d, l]) => (
              <button key={d} type="button" onClick={() => setDays(d)}
                data-testid={`analytics-period-${d}`}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  days === d ? "bg-white text-[#0F2A47]" : "text-white/70 hover:text-white"
                }`}>{l.replace("Last ", "")}</button>
            ))}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Kpi testid="kpi-total" icon={Activity} label="Total simulations"
            value={t.simulations} delta={delta} deltaLabel="vs previous period" />
          <Kpi testid="kpi-conv" icon={ArrowUpRight} label="Conversion"
            value={`${data.conversion_rate_pct}%`} />
          <Kpi testid="kpi-risk" icon={ShieldCheck} label="Avg risk band"
            value={(RISK[avg.avg_risk_band] || {}).label || avg.avg_risk_band}
            valueColor={(RISK[avg.avg_risk_band] || {}).fg || "white"} />
          <Kpi testid="kpi-confidence" icon={Sparkles} label="Modal confidence"
            value={(CONF[avg.avg_confidence] || {}).label || avg.avg_confidence}
            valueColor={(CONF[avg.avg_confidence] || {}).fg || "white"} />
        </div>
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, delta, deltaLabel, valueColor, testid }) {
  const trendIcon = delta == null ? null : delta > 5 ? ArrowUpRight : delta < -5 ? ArrowDownRight : Minus;
  const TrendI = trendIcon;
  return (
    <div className="bg-white/10 backdrop-blur rounded-xl p-3" data-testid={testid}>
      <div className="flex items-center gap-1.5 text-white/65">
        {Icon && <Icon size={12} />}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xl font-display font-semibold" style={{ color: valueColor || "white", letterSpacing: "-0.02em" }}>
          {value}
        </span>
        {delta != null && (
          <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${
            delta > 5 ? "text-emerald-300" : delta < -5 ? "text-rose-300" : "text-white/55"}`}>
            {TrendI && <TrendI size={10} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {deltaLabel && <div className="text-[10px] text-white/45 mt-0.5">{deltaLabel}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Distribution card — stacked bar + legend                            */
/* ------------------------------------------------------------------ */
function DistributionCard({ title, subtitle, data, meta, total, testid }) {
  const items = useMemo(() => {
    return Object.entries(data || {}).map(([k, n]) => ({
      key: k, n, pct: total > 0 ? (n / total) * 100 : 0,
      label: meta[k]?.label || k, fg: meta[k]?.fg || "#5D6068", bg: meta[k]?.bg || "#5D606820",
    }));
  }, [data, meta, total]);
  const nonZero = items.filter((i) => i.n > 0);

  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid={testid}>
      <h3 className="font-semibold text-[#0F1115] text-[14px]">{title}</h3>
      <p className="text-[11px] text-stone-500 mt-0.5">{subtitle}</p>

      {/* Stacked bar */}
      <div className="mt-3 h-2.5 rounded-full bg-stone-100 overflow-hidden flex">
        {nonZero.map((i) => (
          <div key={i.key} title={`${i.label}: ${i.n} (${i.pct.toFixed(0)}%)`}
            style={{ width: `${i.pct}%`, background: i.fg, height: "100%" }} />
        ))}
      </div>

      {/* Legend */}
      <ul className="mt-3 space-y-1.5">
        {items.map((i) => (
          <li key={i.key} className="flex items-center justify-between gap-3 text-[12px]" data-testid={`${testid}-${i.key}`}>
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: i.fg }} />
              <span className="text-[#0F1115] truncate">{i.label}</span>
            </span>
            <span className="text-stone-700 font-semibold">{i.n}</span>
            <span className="text-stone-500 text-[11px] w-10 text-right">{i.pct.toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Referral pressure card — weekly sparkline + spike alerts            */
/* ------------------------------------------------------------------ */
function ReferralPressureCard({ data }) {
  const weeks = data.weekly_pressure || [];
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const ooh = data.out_of_hours;

  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="analytics-pressure-card">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={14} className="text-[#0e3b4a]" />
        <h3 className="font-semibold text-[#0F1115] text-[14px]">Referral pressure</h3>
      </div>
      <p className="text-[11px] text-stone-500">Weekly simulation volume — spot when pressure rises.</p>

      {/* Bar mini-chart */}
      <div className="mt-3 flex items-end gap-1.5 h-20" data-testid="analytics-weekly-bars">
        {weeks.length === 0 ? (
          <div className="text-[12px] text-stone-500">No data yet for this period.</div>
        ) : weeks.map((w) => (
          <div key={w.week_start} className="flex-1 flex flex-col items-center justify-end gap-1"
            title={`${w.week_start} → ${w.week_end}: ${w.count}`}>
            <div className="text-[9px] text-stone-500 font-mono">{w.count}</div>
            <div className="w-full rounded-t" style={{
              height: `${(w.count / max) * 100}%`,
              minHeight: w.count > 0 ? "4px" : "1px",
              background: w.count > 0 ? "#0e3b4a" : "#E5E5E0",
            }} />
            <div className="text-[9px] text-stone-400 truncate w-full text-center">{w.week_start.slice(5)}</div>
          </div>
        ))}
      </div>

      {/* OOH + spike rows */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="bg-stone-50 rounded-lg p-2.5" data-testid="analytics-ooh">
          <div className="flex items-center gap-1.5 text-stone-500">
            <Moon size={11} /><span className="text-[10px] font-bold uppercase tracking-wider">Out-of-hours</span>
          </div>
          <div className="text-[14px] font-semibold text-[#0F1115] mt-0.5">{ooh.count} <span className="text-stone-500 text-[11px] font-normal">({ooh.pct}%)</span></div>
          <div className="text-[10px] text-stone-500 mt-0.5">18:00–08:00 UTC simulations</div>
        </div>
        <div className="bg-stone-50 rounded-lg p-2.5" data-testid="analytics-spikes">
          <div className="flex items-center gap-1.5 text-stone-500">
            <AlertTriangle size={11} /><span className="text-[10px] font-bold uppercase tracking-wider">Weekly spikes</span>
          </div>
          <div className="text-[14px] font-semibold text-[#0F1115] mt-0.5">{(data.weekly_spikes || []).length}</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Weeks ≥ 1.6× rolling-avg</div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Home readiness trend card                                           */
/* ------------------------------------------------------------------ */
function HomeReadinessTrendCard({ data }) {
  const dist = data.home_readiness_distribution || {};
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  const avgScore = data.averages?.avg_home_score ?? 0;
  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="analytics-home-readiness-card">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={14} className="text-[#0e3b4a]" />
        <h3 className="font-semibold text-[#0F1115] text-[14px]">Home readiness</h3>
      </div>
      <p className="text-[11px] text-stone-500">
        How stable the home was each time a placement decision was simulated.
      </p>

      {total === 0 ? (
        <div className="mt-3 bg-stone-50 rounded-lg p-3 text-[12px] text-stone-600">
          Home readiness signals will appear as new simulations are run. Existing
          historical simulations show no snapshot.
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Object.entries(dist).map(([k, n]) => {
              const meta = READINESS[k] || { label: k, fg: "#5D6068" };
              const pct = total > 0 ? (n / total) * 100 : 0;
              return (
                <div key={k} className="bg-stone-50 rounded-lg p-2.5"
                  data-testid={`analytics-home-${k}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: meta.fg }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{meta.label}</span>
                  </div>
                  <div className="text-[14px] font-semibold text-[#0F1115] mt-0.5">{n}</div>
                  <div className="text-[10px] text-stone-500 mt-0.5">{pct.toFixed(0)}% of runs</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 bg-[#0e3b4a08] rounded-lg p-2.5 flex items-center gap-2">
            <Calendar size={12} className="text-[#0e3b4a]" />
            <span className="text-[11px] text-[#0F1115]">
              Average home score at run-time: <span className="font-semibold">{avgScore}</span>
            </span>
          </div>
        </>
      )}
    </section>
  );
}


/* ------------------------------------------------------------------ */
/* Commissioning & referral trends — per-LA breakdown                  */
/* Aggregate-only · neutral tone · NOT a league table                  */
/* ------------------------------------------------------------------ */
function CommissioningInsightsCard({ data }) {
  const las = data.local_authorities || [];
  const max = Math.max(1, ...las.map((l) => l.simulations));

  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="analytics-la-card">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-[#0e3b4a]" />
            <h3 className="font-semibold text-[#0F1115] text-[14px]">Commissioning &amp; referral trends</h3>
          </div>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Aggregate per local authority. Helps surface placement-fit patterns and referral quality signals —
            never a league table. No child-level or narrative data appears here.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-stone-500">{las.length} LA{las.length === 1 ? "" : "s"}</span>
      </div>

      {las.length === 0 ? (
        <div className="mt-3 bg-stone-50 rounded-lg p-3 text-[12px] text-stone-600" data-testid="analytics-la-empty">
          No local authority captured on simulations in this period yet. Once managers run simulations
          where the LA is in the referral text (e.g. "Local Authority: Camden"), trends will appear here.
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200" data-testid="analytics-la-list">
          {las.map((la) => {
            const conf = CONF[la.modal_confidence] || CONF.manageable;
            const risk = RISK[la.avg_risk_band] || RISK.low;
            const volPct = (la.simulations / max) * 100;
            return (
              <li key={la.local_authority}
                  data-testid={`analytics-la-${la.local_authority.toLowerCase().replace(/\s+/g, "-")}`}
                  className="py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#0F1115] text-[13px]">{la.local_authority}</span>
                      <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                        style={{ background: conf.bg, color: conf.fg }}>{conf.label}</span>
                      <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                        style={{ background: risk.bg, color: risk.fg }}>{risk.label} risk</span>
                    </div>

                    {/* Volume bar (proportional to busiest LA) */}
                    <div className="mt-1.5 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                      <div className="h-full" style={{ width: `${volPct}%`, background: "#0e3b4a" }} />
                    </div>

                    {/* Stats row */}
                    <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
                      <Stat label="Simulations" value={la.simulations} />
                      <Stat label="Conversion" value={`${la.conversion_rate_pct}%`}
                        toneFg={la.conversion_rate_pct >= 50 ? "#2F6A3A" : la.conversion_rate_pct < 20 && la.simulations >= 3 ? "#A8273A" : null} />
                      <Stat label="More info" value={`${la.more_info_rate_pct}%`} />
                      <Stat label="OOH" value={`${la.out_of_hours}`} secondary={`${la.out_of_hours_pct}%`} />
                    </div>

                    {/* Reflective insight line */}
                    <p className="text-[11px] text-stone-600 italic mt-1.5">{la.insight}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 bg-stone-50 rounded-lg p-2.5 flex items-start gap-2">
        <Lock size={12} className="text-stone-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-stone-600 leading-relaxed">
          <span className="font-semibold">Reflective &amp; aggregate only:</span> use to support placement
          partnership conversations, commissioning strategy and safeguarding pressure analysis — never as a
          punitive league table. Child-level data is never shown.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, secondary, toneFg }) {
  return (
    <div className="bg-stone-50 rounded p-1.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-stone-500">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-[13px] font-semibold" style={{ color: toneFg || "#0F1115" }}>{value}</span>
        {secondary && <span className="text-[9px] text-stone-500">{secondary}</span>}
      </div>
    </div>
  );
}
