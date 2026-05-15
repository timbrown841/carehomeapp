import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, Clock, Moon, Sun, Users, UserCheck, UserX,
  Loader2, RefreshCw, LogIn, LogOut, Bed, AlertCircle, ChevronRight,
  Calendar, PlugZap, Coffee, ArrowRightLeft, Heart, ShieldAlert,
} from "lucide-react";

const TONE = {
  ok:       { fg: "#2F6A3A", bg: "#2F6A3A12", line: "#2F6A3A", label: "On track" },
  warn:     { fg: "#B8772F", bg: "#B8772F18", line: "#B8772F", label: "Watch" },
  critical: { fg: "#A8273A", bg: "#A8273A14", line: "#A8273A", label: "Gap" },
};
const SECTOR_LABEL = {
  children: "Children's home",
  adult_supported_living: "Supported living",
  elderly_residential: "Elderly residential",
  dementia: "Dementia care",
  mental_health: "Mental health",
  veteran: "Veteran care",
};

const SHIFT_FILTER_LABEL = {
  all: "All shifts",
  awake: "Awake cover",
  sleep_in: "Sleep-in",
  agency: "Agency only",
};

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return iso; }
}
function fmtDay(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  } catch { return iso; }
}
function initialsOf(name) {
  return (name || "—").split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
}

// ---------------------------------------------------------------------------
// "My Shift" mini-bar — appears at top, shows clock-in/out CTA
// ---------------------------------------------------------------------------
export function MyShiftBar({ onAction }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/staffing/mine");
      setData(r.data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const clockIn = async () => {
    if (!data?.current) return;
    try {
      await api.post(`/shifts/${data.current.id}/clock-in`, { method: "app" });
      toast.success("Clocked in");
      refresh(); onAction?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't clock in"); }
  };
  const clockOut = async () => {
    if (!data?.current) return;
    try {
      await api.post(`/shifts/${data.current.id}/clock-out`, {});
      toast.success("Clocked out");
      refresh(); onAction?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't clock out"); }
  };

  if (loading || !data) {
    return (
      <div className="bg-white border divider-soft rounded-xl p-3 flex items-center gap-2 text-stone-500 text-sm">
        <Loader2 size={14} className="animate-spin" /> Loading your shift…
      </div>
    );
  }

  const cur = data.current;
  const nxt = data.next;

  if (!cur && !nxt) {
    return (
      <div className="bg-white border divider-soft rounded-xl p-3 sm:p-4 flex items-center gap-3" data-testid="my-shift-bar-empty">
        <Coffee size={18} className="text-stone-500" />
        <div className="text-sm text-stone-700">No shift in the next 24 hours.</div>
        <span className="text-xs text-stone-500 ml-auto">This week · {data.week_hours}h</span>
      </div>
    );
  }

  if (cur) {
    const isClockedIn = !!cur.clocked_in_at;
    const isClockedOut = !!cur.clocked_out_at;
    return (
      <div
        className="border-l-4 border-y border-r divider-soft rounded-xl p-3 sm:p-4 flex flex-wrap items-center gap-3"
        style={{ borderLeftColor: isClockedIn ? "#2F6A3A" : "#B8772F", background: isClockedIn ? "#2F6A3A0A" : "#B8772F0A" }}
        data-testid="my-shift-bar"
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: isClockedIn ? "#2F6A3A" : "#B8772F", color: "white" }}>
          {cur.is_sleep_in ? <Moon size={16} /> : <Sun size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500">Your shift now</div>
          <div className="text-sm font-semibold text-[#0F1115]">
            {fmtTime(cur.start_at)} – {fmtTime(cur.end_at)}
            {cur.role ? <span className="text-stone-500 font-normal"> · {cur.role}</span> : null}
            {cur.is_sleep_in && <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded bg-[#3F2E5C18] text-[#3F2E5C] font-bold uppercase tracking-wider">Sleep-in</span>}
          </div>
          <div className="text-xs text-stone-600 mt-0.5">
            {isClockedOut ? `Clocked out at ${fmtTime(cur.clocked_out_at)}` :
             isClockedIn ? `Clocked in at ${fmtTime(cur.clocked_in_at)}${cur.clock_in_variance_minutes ? ` · ${cur.clock_in_variance_minutes > 0 ? "+" : ""}${cur.clock_in_variance_minutes} min` : ""}` :
             "Not clocked in yet"}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-stone-500 hidden sm:inline">This week · <b>{data.week_hours}h</b></span>
          {!isClockedIn && (
            <button onClick={clockIn} data-testid="clock-in-btn" className="text-sm font-semibold bg-[#2F6A3A] text-white px-4 py-2 rounded-lg hover:bg-[#235029] flex items-center gap-1.5">
              <LogIn size={14} /> Clock in
            </button>
          )}
          {isClockedIn && !isClockedOut && (
            <button onClick={clockOut} data-testid="clock-out-btn" className="text-sm font-semibold bg-[#0e3b4a] text-white px-4 py-2 rounded-lg hover:bg-[#0a2e3a] flex items-center gap-1.5">
              <LogOut size={14} /> Clock out
            </button>
          )}
        </div>
      </div>
    );
  }

  // Next-up shift
  return (
    <div className="bg-white border divider-soft rounded-xl p-3 sm:p-4 flex items-center gap-3" data-testid="my-shift-bar-next">
      <Calendar size={18} className="text-[#0e3b4a]" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500">Next shift</div>
        <div className="text-sm font-semibold text-[#0F1115]">
          {fmtDay(nxt.start_at)} · {fmtTime(nxt.start_at)} – {fmtTime(nxt.end_at)}
          {nxt.role ? <span className="text-stone-500 font-normal"> · {nxt.role}</span> : null}
        </div>
      </div>
      <span className="text-xs text-stone-500">This week · <b>{data.week_hours}h</b></span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Staffing Operations dashboard — single screen, manager+staff aware
// ---------------------------------------------------------------------------
export default function LiveStaffingOps() {
  const { tier } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [disturbanceFor, setDisturbanceFor] = useState(null);
  const [sectorFilter, setSectorFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (sectorFilter !== "all") params.sector = sectorFilter;
      if (shiftFilter !== "all") params.shift_filter = shiftFilter;
      const r = await api.get("/staffing/overview", { params });
      setData(r.data);
    } catch (e) {
      toast.error("Couldn't load staffing overview");
    } finally { setLoading(false); }
  }, [sectorFilter, shiftFilter]);
  useEffect(() => { load(); }, [load]);

  const isManager = tier >= 3;

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 text-stone-600 py-10 justify-center">
        <Loader2 size={18} className="animate-spin" /> Loading live staffing…
      </div>
    );
  }

  const onShift = data.on_shift_now || [];
  const gaps = data.coverage_gaps || [];
  const ratios = data.ratios || [];
  const pr = data.pressure || {};

  return (
    <div className="space-y-5" data-testid="live-staffing-ops">
      <MyShiftBar onAction={load} />

      {/* Filter strip — sector + shift mode + active state */}
      <div className="bg-white border divider-soft rounded-2xl p-3 sm:p-4 flex flex-wrap items-center gap-3" data-testid="staffing-filters">
        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">View</span>
        <div className="flex gap-1 flex-wrap" data-testid="filter-sectors">
          <FilterChip
            active={sectorFilter === "all"}
            onClick={() => setSectorFilter("all")}
            testid="sector-all"
          >Organisation-wide</FilterChip>
          {(data?.sectors_available || []).map((s) => (
            <FilterChip
              key={s.sector}
              active={sectorFilter === s.sector}
              onClick={() => setSectorFilter(s.sector)}
              testid={`sector-${s.sector}`}
            >
              {SECTOR_LABEL[s.sector] || s.sector} <span className="opacity-60">· {s.residents}</span>
            </FilterChip>
          ))}
        </div>
        <span className="hidden sm:inline text-stone-300">|</span>
        <div className="flex gap-1 flex-wrap" data-testid="filter-shifts">
          {Object.entries(SHIFT_FILTER_LABEL).map(([k, label]) => (
            <FilterChip
              key={k}
              active={shiftFilter === k}
              onClick={() => setShiftFilter(k)}
              testid={`shift-filter-${k}`}
            >{label}</FilterChip>
          ))}
        </div>
        {(sectorFilter !== "all" || shiftFilter !== "all") && (
          <button
            onClick={() => { setSectorFilter("all"); setShiftFilter("all"); }}
            data-testid="filter-clear"
            className="text-[11px] text-stone-600 hover:text-[#0e3b4a] underline ml-auto"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Header banner — Now / asleep mode / refresh */}
      <div
        className="rounded-2xl p-4 sm:p-5 text-white flex flex-wrap items-center gap-3"
        style={{ background: data.is_asleep_window ?
          "linear-gradient(135deg, #1B1B36 0%, #2A1F3D 100%)" :
          "linear-gradient(135deg, #0F2F3A 0%, #0e3b4a 60%, #1B4D5F 100%)" }}
      >
        {data.is_asleep_window ? <Moon size={20} /> : <Sun size={20} />}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-80">
            {data.is_asleep_window ? "Asleep cover · 22:00–06:00" : "Awake cover · 06:00–22:00"}
            {sectorFilter !== "all" && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-white/15 backdrop-blur">
                {SECTOR_LABEL[sectorFilter] || sectorFilter}
              </span>
            )}
            {shiftFilter !== "all" && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-white/15 backdrop-blur">
                {SHIFT_FILTER_LABEL[shiftFilter]}
              </span>
            )}
          </div>
          <div className="text-base sm:text-lg font-semibold">
            {onShift.filter((s) => s.clocked_in).length}/{onShift.length} on shift now
            {(sectorFilter !== "all" || shiftFilter !== "all") && data.on_shift_total !== onShift.length && (
              <span className="text-[10px] opacity-70 ml-2">of {data.on_shift_total} org-wide</span>
            )}
            {gaps.length > 0 && (
              <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded bg-white/20 backdrop-blur uppercase tracking-wider font-bold">
                {gaps.length} coverage gap{gaps.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <button onClick={load} data-testid="staffing-refresh" className="text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-2 rounded-lg flex items-center gap-1.5 backdrop-blur">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Coverage gaps red banner */}
      {gaps.length > 0 && (
        <section className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-4" style={{ borderLeftColor: "#A8273A" }} data-testid="coverage-gaps">
          <h3 className="text-sm font-semibold text-[#0F1115] flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-[#A8273A]" /> Coverage gaps
          </h3>
          <ul className="space-y-1.5">
            {gaps.map((g) => (
              <li key={g.shift_id} className="flex items-center gap-2 text-sm" data-testid={`gap-${g.shift_id}`}>
                <UserX size={14} className="text-[#A8273A]" />
                <span className="font-medium">{g.staff_name}</span>
                <span className="text-stone-500">·</span>
                <span className="text-stone-700">{g.role || "shift"} started {fmtTime(g.started_at)}</span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#A8273A14] text-[#A8273A]">
                  {g.minutes_late}m late
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* On shift now grid */}
      <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5" data-testid="on-shift-now">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-[#0F1115] flex items-center gap-2">
            <Users size={15} /> On shift now
          </h3>
          {data.next_24h?.length > 0 && (
            <span className="text-[11px] text-stone-500">{data.next_24h.length} more in next 24h</span>
          )}
        </div>
        {onShift.length === 0 ? (
          <p className="text-sm text-stone-600">No one is on shift right now.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {onShift.map((s) => {
              const clocked = s.clocked_in;
              return (
                <li key={s.id} className="border divider-soft rounded-xl p-3 flex items-center gap-3 bg-stone-50" data-testid={`on-shift-${s.id}`}>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-xs"
                    style={{ background: clocked ? "#2F6A3A" : "#B8772F", color: "white" }}
                  >
                    {initialsOf(s.staff_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#0F1115] truncate flex items-center gap-1.5">
                      {s.staff_name}
                      {s.is_sleep_in && <Moon size={11} className="text-[#3F2E5C]" />}
                      {s.is_agency && <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-stone-200 text-stone-700">Agency</span>}
                    </div>
                    <div className="text-[11px] text-stone-600">
                      {fmtTime(s.start_at)}–{fmtTime(s.end_at)}{s.role ? ` · ${s.role}` : ""}
                    </div>
                    {clocked ? (
                      <div className="text-[10px] text-[#2F6A3A] font-semibold mt-0.5 flex items-center gap-1">
                        <UserCheck size={10} /> Clocked in {fmtTime(s.clocked_in_at)}
                        {s.disturbance_count > 0 && <span className="ml-1 px-1 rounded bg-[#3F2E5C18] text-[#3F2E5C]">{s.disturbance_count} dist.</span>}
                      </div>
                    ) : (
                      <div className="text-[10px] text-[#B8772F] font-semibold mt-0.5">
                        Not arrived · {s.minutes_into_shift}m into shift
                      </div>
                    )}
                  </div>
                  {s.is_sleep_in && clocked && isManager && (
                    <button
                      onClick={() => setDisturbanceFor(s)}
                      data-testid={`log-disturbance-${s.id}`}
                      className="text-[10px] font-semibold bg-[#3F2E5C] text-white px-2 py-1 rounded hover:bg-[#2F2147]"
                      title="Log sleep-in disturbance"
                    >
                      Log dist.
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Staffing ratios */}
      <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5" data-testid="staffing-ratios">
        <h3 className="text-sm font-semibold text-[#0F1115] flex items-center gap-2 mb-3">
          <PlugZap size={15} /> Staffing ratios · {data.is_asleep_window ? "asleep" : "awake"}
        </h3>
        {ratios.length === 0 ? (
          <p className="text-sm text-stone-600">No residents in any sector — ratios not computed.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ratios.map((r) => {
              const t = TONE[r.status];
              return (
                <div key={r.sector} className="border-l-4 border-y border-r divider-soft rounded-xl p-3" style={{ borderLeftColor: t.line }} data-testid={`ratio-${r.sector}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-wider font-bold text-stone-600">{SECTOR_LABEL[r.sector] || r.sector}</div>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: t.bg, color: t.fg }}>{t.label}</span>
                  </div>
                  <div className="text-2xl font-semibold text-[#0F1115] mt-1">
                    {r.actual}<span className="text-stone-400">/{r.required}</span>
                    <span className="text-xs text-stone-500 font-normal ml-1.5">{r.mode}</span>
                  </div>
                  <div className="text-[11px] text-stone-600">{r.residents} resident{r.residents === 1 ? "" : "s"}{r.gap > 0 ? ` · short ${r.gap}` : " · target met"}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Pressure indicators */}
      <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5" data-testid="pressure-indicators">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-sm font-semibold text-[#0F1115] flex items-center gap-2">
            <Activity size={15} /> Rota pressure · 7–30 day signals
          </h3>
          <span className="text-[10px] uppercase tracking-wider font-bold text-stone-500" data-testid="pressure-org-wide-note">
            Organisation-wide
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PressureTile
            tone={pr.agency_status} label="Agency cover · 14d"
            value={`${pr.agency_pct_14d}%`}
            sub="of rota minutes"
            testid="pressure-agency"
          />
          <PressureTile
            tone={pr.sickness_status} label="Sickness · 14d"
            value={`${pr.sickness_pct_14d}%`}
            sub={`${pr.sick_days_14d} sick day${pr.sick_days_14d === 1 ? "" : "s"}`}
            testid="pressure-sickness"
          />
          <PressureTile
            tone={pr.overtime_staff_7d?.length > 0 ? "warn" : "ok"} label={`Overtime · >${pr.overtime_threshold_hours}h/wk`}
            value={pr.overtime_staff_7d?.length || 0}
            sub="staff over threshold (7d)"
            testid="pressure-overtime"
          />
          <PressureTile
            tone={pr.disturbance_count_30d >= 5 ? "warn" : "ok"} label="Sleep-in disturbances · 30d"
            value={pr.disturbance_count_30d}
            sub={`${pr.sleep_ins_30d} sleep-ins`}
            testid="pressure-disturbances"
          />
        </div>

        {pr.overtime_staff_7d?.length > 0 && (
          <div className="mt-4" data-testid="overtime-detail">
            <h4 className="text-[11px] uppercase tracking-wider font-bold text-stone-600 mb-1.5">Staff over the working-time threshold (7d)</h4>
            <ul className="space-y-1">
              {pr.overtime_staff_7d.map((o) => (
                <li key={o.staff_id} className="flex items-center gap-2 text-sm">
                  <Heart size={11} className="text-[#A8273A]" />
                  <span className="font-medium">{o.staff_name}</span>
                  <span className="text-stone-500">·</span>
                  <span className="text-stone-700">{o.hours_7d}h this week</span>
                  <span className="ml-auto text-[10px] font-bold text-[#A8273A]">+{o.over_by_hours}h over</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-stone-500 mt-2">
              Sustained pressure here can affect safeguarding focus and feed into burnout signals.
            </p>
          </div>
        )}

        {/* Workflow shortcuts */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 pt-4 border-t divider-soft">
          <Link to="/leave-requests" data-testid="link-leave" className="flex items-center gap-2 text-xs font-semibold text-[#0e3b4a] hover:underline">
            <Coffee size={12} /> Leave &amp; sickness {pr.pending_leave > 0 && <span className="px-1.5 py-0.5 rounded bg-[#B8772F18] text-[#B8772F] text-[9px]">{pr.pending_leave} pending</span>}
          </Link>
          <Link to="/shift-swaps" data-testid="link-swaps" className="flex items-center gap-2 text-xs font-semibold text-[#0e3b4a] hover:underline">
            <ArrowRightLeft size={12} /> Shift swaps {pr.pending_swaps > 0 && <span className="px-1.5 py-0.5 rounded bg-[#B8772F18] text-[#B8772F] text-[9px]">{pr.pending_swaps}</span>}
          </Link>
          {isManager && (
            <Link to="/reflection" data-testid="link-wellbeing" className="flex items-center gap-2 text-xs font-semibold text-[#0e3b4a] hover:underline">
              <Heart size={12} /> Team wellbeing {pr.burnout_check_ins_14d > 0 && <span className="px-1.5 py-0.5 rounded bg-[#A8273A14] text-[#A8273A] text-[9px]">{pr.burnout_check_ins_14d} signals</span>}
            </Link>
          )}
          {isManager && (
            <Link to="/ofsted" data-testid="link-staffing-inspection" className="flex items-center gap-2 text-xs font-semibold text-[#0e3b4a] hover:underline">
              <ShieldAlert size={12} /> Inspection staffing tile
            </Link>
          )}
        </div>
      </section>

      <p className="text-[11px] text-stone-500 text-center" data-testid="staffing-generated-at">
        Generated {new Date(data.generated_at).toLocaleString()} · live operational signal across rota, clock-in, sleep-ins, leave and wellbeing.
      </p>

      {disturbanceFor && (
        <DisturbanceModal
          shift={disturbanceFor}
          onClose={() => setDisturbanceFor(null)}
          onSaved={() => { setDisturbanceFor(null); load(); }}
        />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, testid, children }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? "border-[#0e3b4a] bg-[#0e3b4a] text-white"
          : "border-stone-300 text-stone-700 hover:border-stone-400 bg-white"
      }`}
    >
      {children}
    </button>
  );
}

function PressureTile({ tone, label, value, sub, testid }) {
  const t = TONE[tone] || TONE.ok;
  return (
    <div className="border-l-4 border-y border-r divider-soft rounded-xl p-3 bg-white" style={{ borderLeftColor: t.line }} data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-stone-600">{label}</div>
      <div className="text-2xl font-semibold text-[#0F1115] mt-0.5">{value}</div>
      <div className="text-[11px] text-stone-600">{sub}</div>
    </div>
  );
}

function DisturbanceModal({ shift, onClose, onSaved }) {
  const [minutes, setMinutes] = useState(15);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!reason.trim()) { toast.error("Reason required"); return; }
    setBusy(true);
    try {
      await api.post(`/shifts/${shift.id}/disturbance`, { minutes, reason });
      toast.success("Disturbance logged");
      onSaved?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't log"); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4" data-testid="disturbance-modal">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 max-w-md w-full">
        <h4 className="text-base font-semibold text-[#0F1115]">Log sleep-in disturbance</h4>
        <p className="text-xs text-stone-600 mb-3">{shift.staff_name} · {fmtTime(shift.start_at)}–{fmtTime(shift.end_at)}</p>
        <label className="text-xs font-medium text-stone-700">Minutes awake</label>
        <input type="number" min={1} max={480} value={minutes} onChange={(e) => setMinutes(parseInt(e.target.value || "0"))} data-testid="disturbance-minutes" className="w-full border divider-soft rounded-lg p-2 text-sm mb-2" />
        <label className="text-xs font-medium text-stone-700">Reason</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. supported YP back to bed after distress" data-testid="disturbance-reason" className="w-full border divider-soft rounded-lg p-2 text-sm resize-none" />
        <div className="flex gap-2 justify-end mt-3">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
          <button onClick={save} disabled={busy} data-testid="disturbance-save" className="text-sm font-semibold bg-[#0e3b4a] text-white px-3 py-2 rounded-lg disabled:opacity-60">
            {busy ? "Saving…" : "Log disturbance"}
          </button>
        </div>
      </div>
    </div>
  );
}
