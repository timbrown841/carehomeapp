/* Phase E.4 — Workforce Planning & Capacity Intelligence
 *
 * Manager-facing predictive-planning view. Lives as a tab inside the
 * Staff Operations Hub (no new sidebar item).
 *
 * 7 sections:
 *   1. Workforce Readiness Forecast (today/30/60/90 RAG)
 *   2. Manager Actions Panel (prioritised)
 *   3. Training Cliff Edge by role + buckets
 *   4. Renewal Wave Planning (next 6 months)
 *   5. Workforce Capacity (today snapshot)
 *   6. Weekly / Monthly Planning Calendar
 *   7. Drill-down list of upcoming cliff records
 *
 * All metrics deterministic — no AI scoring.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, AlertOctagon, AlertTriangle, CheckCircle2, Calendar,
  GraduationCap, ShieldCheck, Users, Clock, Loader2, ChevronRight,
  Sparkles, ArrowRight, CalendarDays, Briefcase,
} from "lucide-react";

const RAG = {
  red:   { bg: "bg-rose-50",     fg: "text-rose-800",     border: "border-rose-200",     hex: "#A8273A" },
  amber: { bg: "bg-amber-50",    fg: "text-amber-800",    border: "border-amber-200",    hex: "#B8772F" },
  green: { bg: "bg-emerald-50",  fg: "text-emerald-800",  border: "border-emerald-200",  hex: "#2F6A3A" },
  blue:  { bg: "bg-sky-50",      fg: "text-sky-800",      border: "border-sky-200",      hex: "#2E6FA7" },
  grey:  { bg: "bg-stone-50",    fg: "text-stone-700",    border: "border-stone-200",    hex: "#5d6068" },
};

export default function WorkforcePlanning() {
  const { isManagerOrAbove } = useAuth();
  const { effectiveMode } = useOrg();
  const sector = effectiveMode === "adult" ? "adult" : "children";

  const [data, setData] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isManagerOrAbove) return;
    setLoading(true);
    try {
      const fromDate = new Date().toISOString().slice(0, 10);
      const to = new Date(); to.setDate(to.getDate() + 30);
      const toDate = to.toISOString().slice(0, 10);
      const [d, c] = await Promise.all([
        api.get(`/workforce-planning/dashboard?sector=${sector}`),
        api.get(`/workforce-planning/calendar?sector=${sector}&from=${fromDate}&to=${toDate}`),
      ]);
      setData(d.data);
      setCalendar(c.data);
    } catch (e) {
      if (e?.response?.status !== 403) toast.error("Could not load workforce planning");
    } finally { setLoading(false); }
  }, [sector, isManagerOrAbove]);

  useEffect(() => { load(); }, [load]);

  if (!isManagerOrAbove) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 text-sm text-stone-700"
           data-testid="workforce-planning-blocked">
        Manager+ only — Workforce Planning is restricted to managers and admins.
      </div>
    );
  }
  if (loading || !data) {
    return <div className="inline-flex items-center gap-2 text-sm text-stone-600">
      <Loader2 size={14} className="animate-spin" /> Loading workforce planning…
    </div>;
  }

  const regulatorLabel = sector === "adult" ? "CQC" : "Ofsted";

  return (
    <div className="space-y-5" data-testid="workforce-planning">
      {/* === Hero — Workforce Readiness Forecast === */}
      <ForecastHero forecast={data.forecast} sector={sector} regulatorLabel={regulatorLabel} />

      {/* === Manager Actions Panel === */}
      <ManagerActions actions={data.manager_actions} />

      {/* === Training Cliff Edge — buckets + by role === */}
      <CliffEdgeSection cliff={data.cliff_edge} />

      {/* === Renewal Wave Planning === */}
      <RenewalWaves waves={data.renewal_waves} />

      {/* === Workforce Capacity === */}
      <CapacityPanel capacity={data.capacity} />

      {/* === Weekly Planning Calendar === */}
      <PlanningCalendar calendar={calendar} sector={sector} />

      {/* === Top cliff list (drill-down) === */}
      <CliffTopList cliffList={data.cliff_edge.top_list} />
    </div>
  );
}


/* ---------- Forecast Hero ---------- */

function ForecastHero({ forecast, sector, regulatorLabel }) {
  const tiles = [
    { key: "today",      label: "Today",      ...forecast.today },
    { key: "in_30_days", label: "In 30 days", ...forecast.in_30_days },
    { key: "in_60_days", label: "In 60 days", ...forecast.in_60_days },
    { key: "in_90_days", label: "In 90 days", ...forecast.in_90_days },
  ];
  return (
    <section className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
             style={{ background: "linear-gradient(135deg, #0E3B4A 0%, #0a2734 60%, #1E4D5C 100%)", color: "white" }}
             data-testid="workforce-forecast-hero">
      <div className="flex items-center gap-2 text-[#FCB960]">
        <Sparkles size={14} />
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
          Workforce Readiness Forecast · {regulatorLabel}-aligned
        </span>
      </div>
      <h2 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5"
          style={{ letterSpacing: "-0.02em" }}>
        Predicting compliance risk before it happens.
      </h2>
      <p className="text-[12px] text-white/65 mt-1 max-w-2xl">
        Forecast assumes no renewals are booked. Each tile shows projected mandatory-training
        compliance if you take no action — and the deterministic RAG status that follows.
      </p>
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(t => {
          const rag = RAG[t.rag] || RAG.grey;
          return (
            <div key={t.key}
                 className="rounded-xl border bg-white/95 p-4"
                 data-testid={`forecast-tile-${t.key}`}
                 style={{ borderColor: rag.hex }}>
              <div className={`text-[10px] font-bold uppercase tracking-wider ${rag.fg}`}>
                {t.label}
              </div>
              <div className="font-display font-bold text-3xl mt-1 text-[#0F1115]">
                {t.projected_compliance_pct}%
              </div>
              <div className={`text-[11px] mt-0.5 ${rag.fg} font-semibold`}>
                Projected · {t.rag.toUpperCase()}
              </div>
              {typeof t.at_risk_renewals === "number" && (
                <div className="text-[10px] text-stone-500 mt-1">
                  {t.at_risk_renewals} renewal{t.at_risk_renewals === 1 ? "" : "s"} at risk
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}


/* ---------- Manager Actions Panel ---------- */

function ManagerActions({ actions }) {
  if (!actions || actions.length === 0) {
    return (
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="manager-actions-empty">
        <div className="inline-flex items-center gap-2 text-emerald-800">
          <CheckCircle2 size={16} />
          <span className="font-display font-semibold text-base">All clear — no priority actions.</span>
        </div>
        <p className="text-[12px] text-stone-500 mt-1">
          Nothing overdue, no DBS expiring in 30 days, no supervisions slipping past 90 days.
        </p>
      </section>
    );
  }
  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="manager-actions">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">Manager Actions</h3>
          <p className="text-[12px] text-stone-500">
            Highest-priority actions first. One click takes you to the underlying records.
          </p>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500">
          {actions.length} action{actions.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="space-y-2" data-testid="manager-actions-list">
        {actions.map(a => {
          const rag = RAG[a.severity] || RAG.grey;
          return (
            <li key={`${a.action_type}-${a.priority}`} data-testid={`action-${a.action_type}`}>
              <Link to={a.deep_link}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 hover:opacity-90 transition ${rag.bg} ${rag.border}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-[11px] ${rag.bg} ${rag.fg} border ${rag.border}`}>
                    {a.priority}
                  </span>
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${rag.fg} truncate`}>{a.label}</div>
                    <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">
                      {a.action_type.replace(/_/g, " ")} · {a.severity}
                    </div>
                  </div>
                </div>
                <ArrowRight size={14} className="opacity-50 shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}


/* ---------- Cliff Edge — buckets + by role ---------- */

function CliffEdgeSection({ cliff }) {
  const { buckets, by_role } = cliff;
  const tiles = [
    { key: "overdue", label: "Overdue", count: buckets.overdue, rag: "red", icon: AlertOctagon },
    { key: "in_30",   label: "Expires in 30 days", count: buckets.in_30, rag: "red", icon: AlertTriangle },
    { key: "in_60",   label: "Expires in 31-60 days", count: buckets.in_60, rag: "amber", icon: Clock },
    { key: "in_90",   label: "Expires in 61-90 days", count: buckets.in_90, rag: "blue", icon: Calendar },
  ];
  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="cliff-edge-section">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">Training Cliff Edge</h3>
          <p className="text-[12px] text-stone-500">Mandatory training expiry buckets and per-role compliance risk.</p>
        </div>
        <Link to="/training" className="text-[11px] text-[#0E3B4A] font-semibold hover:underline inline-flex items-center gap-1"
              data-testid="cliff-edge-open-training">
          Open Training Centre <ChevronRight size={12} />
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4" data-testid="cliff-edge-buckets">
        {tiles.map(t => {
          const rag = RAG[t.rag] || RAG.grey;
          const Icon = t.icon;
          return (
            <Link key={t.key} to="/training"
                  className={`block rounded-xl border p-4 ${rag.bg} ${rag.border} hover:opacity-90 transition`}
                  data-testid={`cliff-bucket-${t.key}`}>
              <div className="flex items-baseline justify-between">
                <span className="font-display font-semibold text-3xl text-stone-900 leading-none">{t.count}</span>
                <Icon size={14} className={rag.fg} />
              </div>
              <div className={`text-[11px] font-semibold mt-1.5 ${rag.fg}`}>{t.label}</div>
            </Link>
          );
        })}
      </div>
      <div data-testid="cliff-edge-by-role">
        <div className="text-[11px] uppercase font-bold tracking-wider text-stone-500 mb-2">Compliance risk by role</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {by_role.map(r => {
            const rag = RAG[r.rag] || RAG.grey;
            return (
              <div key={r.role}
                   className={`rounded-xl border p-3 ${rag.border} ${rag.bg}`}
                   data-testid={`role-row-${r.role}`}>
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-display font-semibold text-stone-900">{r.label}</div>
                  <div className={`text-lg font-bold ${rag.fg}`}>{r.compliance_pct}%</div>
                </div>
                <div className="text-[10px] mt-1 text-stone-600 leading-relaxed">
                  {r.total_cells} cells · {r.expired} expired · {r.in_30} in 30d · {r.in_60} in 60d · {r.in_90} in 90d
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


/* ---------- Renewal Waves ---------- */

function RenewalWaves({ waves }) {
  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="renewal-waves-section">
      <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-1">Renewal Wave Planning</h3>
      <p className="text-[12px] text-stone-500 mb-3">
        Group training expiries by month. Recommended action date = wave month − 30 days.
      </p>
      {waves.length === 0 ? (
        <div className="text-[13px] text-stone-500 py-3" data-testid="renewal-waves-empty">
          No renewal waves in the next 6 months.
        </div>
      ) : (
        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="renewal-waves-list">
          {waves.map(w => (
            <li key={w.month} data-testid={`renewal-wave-${w.month}`}
                className="bg-stone-50 border divider-soft rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display font-semibold text-base text-stone-900">{w.month_label}</div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                  Wave
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-2 text-center">
                <div className="bg-white border rounded p-1.5">
                  <div className="font-bold text-base">{w.course_count}</div>
                  <div className="text-[9px] uppercase text-stone-500 font-semibold tracking-wider">courses</div>
                </div>
                <div className="bg-white border rounded p-1.5">
                  <div className="font-bold text-base">{w.staff_count}</div>
                  <div className="text-[9px] uppercase text-stone-500 font-semibold tracking-wider">staff</div>
                </div>
                <div className="bg-white border rounded p-1.5">
                  <div className="font-bold text-base">{w.estimated_hours}h</div>
                  <div className="text-[9px] uppercase text-stone-500 font-semibold tracking-wider">est. hrs</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-stone-700">
                <span className="text-stone-500">Action by:</span> <strong>{w.recommended_action_date}</strong>
              </div>
              {w.courses && w.courses.length > 0 && (
                <div className="mt-1.5 text-[10px] text-stone-500 line-clamp-2">
                  {w.courses.slice(0, 3).join(" · ")}{w.courses.length > 3 ? ` +${w.courses.length - 3} more` : ""}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


/* ---------- Capacity Panel ---------- */

function CapacityPanel({ capacity }) {
  const safe = capacity.release_for_training_safe;
  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="capacity-panel">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">Workforce Capacity</h3>
          <p className="text-[12px] text-stone-500">
            Can we safely release staff for training today?
          </p>
        </div>
        <div className={`text-[11px] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider ${safe ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
             data-testid="capacity-release-flag">
          {safe ? "Safe to release" : "Hold — capacity low"}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 text-center" data-testid="capacity-tiles">
        <Tile label="Total staff" value={capacity.staff_total} testid="cap-total" tone="grey" />
        <Tile label="On shift now" value={capacity.on_shift_now} testid="cap-shift" tone="blue" />
        <Tile label="On leave" value={capacity.on_leave_today} testid="cap-leave"
              tone={capacity.on_leave_today > 0 ? "amber" : "grey"} />
        <Tile label="Sickness" value={capacity.on_sickness_today} testid="cap-sick"
              tone={capacity.on_sickness_today > 0 ? "red" : "grey"} />
        <Tile label="In training" value={capacity.on_training_today} testid="cap-train" tone="blue" />
        <Tile label="Vacancies" value={capacity.vacancies} testid="cap-vac"
              tone={capacity.vacancies > 0 ? "amber" : "grey"} />
      </div>
      <div className="mt-3 text-[11px] text-stone-600">
        <strong>{capacity.available_today}</strong> of {capacity.staff_total} staff available today
        ({Math.round((capacity.available_today / Math.max(capacity.staff_total, 1)) * 100)}%).
      </div>
    </section>
  );
}

function Tile({ label, value, tone, testid }) {
  const rag = RAG[tone] || RAG.grey;
  return (
    <div className={`rounded-xl border p-2.5 ${rag.bg} ${rag.border}`} data-testid={testid}>
      <div className={`font-display font-bold text-2xl ${rag.fg}`}>{value}</div>
      <div className="text-[10px] uppercase font-semibold tracking-wider text-stone-500 mt-0.5">{label}</div>
    </div>
  );
}


/* ---------- Planning Calendar ---------- */

const EVENT_ICON = {
  training_expiry: GraduationCap,
  supervision_due: ClipboardIcon,
  appraisal_due: ClipboardIcon,
  induction_target: Users,
  dbs_renewal: ShieldCheck,
  probation_review: Briefcase,
  qualification_review: GraduationCap,
};

function ClipboardIcon(props) {
  // Stand-in to keep imports tidy; lucide-react has ClipboardCheck but we want ClipboardList
  // Reuse Clock visually for supervisions.
  return <Clock {...props} />;
}

function PlanningCalendar({ calendar, sector }) {
  const [view, setView] = useState("weekly"); // weekly | monthly
  const events = calendar?.events || [];

  // Compute next 7 / 30 day window groupings
  const grouped = useMemo(() => {
    const days = view === "weekly" ? 7 : 30;
    const map = {};
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      map[key] = { date: key, weekday: d.toLocaleDateString("en-GB", { weekday: "short" }), events: [] };
    }
    events.forEach(e => {
      if (map[e.date]) map[e.date].events.push(e);
    });
    return Object.values(map);
  }, [events, view]);

  const totals = useMemo(() => {
    const byKind = {};
    events.forEach(e => {
      byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    });
    return byKind;
  }, [events]);

  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="planning-calendar">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">Planning Calendar</h3>
          <p className="text-[12px] text-stone-500">
            Training · supervisions · appraisals · inductions · probations · DBS renewals · qualifications.
          </p>
        </div>
        <div className="inline-flex bg-stone-100 rounded-lg p-1 gap-1">
          <button onClick={() => setView("weekly")}
                  data-testid="calendar-view-weekly"
                  className={`px-3 py-1 text-[11px] font-semibold rounded ${view === "weekly" ? "bg-white shadow-sm text-[#0F2A47]" : "text-stone-600"}`}>
            Weekly
          </button>
          <button onClick={() => setView("monthly")}
                  data-testid="calendar-view-monthly"
                  className={`px-3 py-1 text-[11px] font-semibold rounded ${view === "monthly" ? "bg-white shadow-sm text-[#0F2A47]" : "text-stone-600"}`}>
            Monthly (30d)
          </button>
        </div>
      </div>

      {/* Kind totals bar */}
      <div className="flex flex-wrap gap-2 mb-3 text-[10px]" data-testid="calendar-totals">
        {Object.entries(totals).map(([kind, count]) => (
          <span key={kind} className="px-2 py-1 bg-stone-100 rounded-full text-stone-700 font-semibold uppercase tracking-wider"
                data-testid={`total-${kind}`}>
            {kind.replace(/_/g, " ")}: {count}
          </span>
        ))}
        {Object.keys(totals).length === 0 && (
          <span className="text-[12px] text-stone-500">No events in this window.</span>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1.5" data-testid="calendar-grid">
        {grouped.map(d => (
          <div key={d.date}
               className={`min-h-[78px] rounded-lg border ${d.events.length > 0 ? "bg-amber-50 border-amber-200" : "bg-stone-50 border-stone-200"} p-1.5`}
               data-testid={`calendar-day-${d.date}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] uppercase font-bold tracking-wider text-stone-500">{d.weekday}</span>
              <span className="text-[10px] font-mono text-stone-700">{d.date.slice(8, 10)}</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {d.events.slice(0, 3).map(e => {
                const rag = RAG[e.severity] || RAG.grey;
                return (
                  <Link key={e.id} to={e.deep_link}
                        className={`block text-[9px] truncate px-1 py-0.5 rounded font-semibold ${rag.bg} ${rag.fg}`}
                        title={e.label}
                        data-testid={`calendar-event-${e.kind}`}>
                    {e.label}
                  </Link>
                );
              })}
              {d.events.length > 3 && (
                <div className="text-[9px] text-stone-500">+{d.events.length - 3} more</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


/* ---------- Top cliff drill-down list ---------- */

function CliffTopList({ cliffList }) {
  if (!cliffList || cliffList.length === 0) {
    return (
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="cliff-top-list-empty">
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-1">Upcoming renewals</h3>
        <p className="text-[12px] text-stone-500">No mandatory training renewals expiring in the next 90 days.</p>
      </section>
    );
  }
  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="cliff-top-list">
      <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-3">Upcoming renewals (top 50)</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[12px]">
          <thead>
            <tr className="text-left text-stone-500 uppercase tracking-wider text-[10px] border-b divider-soft">
              <th className="py-2 pr-3">Staff</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Course</th>
              <th className="py-2 pr-3">Expires</th>
              <th className="py-2">Bucket</th>
            </tr>
          </thead>
          <tbody>
            {cliffList.slice(0, 20).map((c, idx) => {
              const rag = RAG[c.bucket === "overdue" || c.bucket === "30" ? "red" : c.bucket === "60" ? "amber" : "blue"] || RAG.grey;
              return (
                <tr key={`${c.staff_id}-${c.course_code}-${idx}`} className="border-b divider-soft hover:bg-stone-50"
                    data-testid={`cliff-row-${idx}`}>
                  <td className="py-2 pr-3 text-stone-900 font-semibold">{c.staff_name || "—"}</td>
                  <td className="py-2 pr-3 text-stone-700 uppercase text-[10px] tracking-wider">{c.staff_role || "—"}</td>
                  <td className="py-2 pr-3 text-stone-800">{c.course_name}</td>
                  <td className="py-2 pr-3 text-stone-700 font-mono">{(c.expires_on || "").slice(0, 10)}</td>
                  <td className="py-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${rag.bg} ${rag.fg}`}>
                      {c.bucket === "overdue" ? "Overdue" : `≤${c.bucket}d`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
