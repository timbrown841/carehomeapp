/* Placement Stability Card — rendered on the resident profile.
 *
 * Deterministic, evidence-linked, supportive in tone.
 * Surfaces both risk and protective factors.
 *
 * Iteration 42b adds a longitudinal sparkline + trajectory label on the
 * card surface, and a week-by-week timeline ("what changed around this
 * time?") inside the full-analysis modal — events deep-link to chronology.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import {
  Sparkles, ChevronRight, X, Loader2, ArrowUpRight, ArrowDownRight, Minus,
  Heart, AlertTriangle, ListChecks, Info, TrendingDown, TrendingUp, Activity,
  Waves, Clock, ExternalLink,
} from "lucide-react";
import StabilitySparkline from "./StabilitySparkline";

const STATUS = {
  stabilising:   { fg: "#2F6A3A", bg: "#2F6A3A14", line: "#2F6A3A" },
  steady:        { fg: "#5D6068", bg: "#5D606814", line: "#5D6068" },
  watch:         { fg: "#B8772F", bg: "#B8772F18", line: "#B8772F" },
  deteriorating: { fg: "#A8273A", bg: "#A8273A14", line: "#A8273A" },
  critical:      { fg: "#5A0E1C", bg: "#5A0E1C18", line: "#5A0E1C" },
  new_placement: { fg: "#5D6068", bg: "#5D606814", line: "#5D6068" },
};

const TRAJECTORY_STYLE = {
  stabilising:       { fg: "#2F6A3A", bg: "#2F6A3A14", Icon: TrendingDown },
  improving:         { fg: "#2F6A3A", bg: "#2F6A3A12", Icon: TrendingDown },
  steady:            { fg: "#5D6068", bg: "#5D606814", Icon: Activity },
  fluctuating:       { fg: "#B8772F", bg: "#B8772F16", Icon: Waves },
  deteriorating:     { fg: "#A8273A", bg: "#A8273A14", Icon: TrendingUp },
  insufficient_data: { fg: "#5D6068", bg: "#5D606810", Icon: Clock },
  no_admission:      { fg: "#5D6068", bg: "#5D606810", Icon: Clock },
};

const DOMAIN_LABEL = {
  emotional_climate:    "Emotional climate",
  missing_trend:        "Missing-from-care",
  behaviour_pressure:   "Behaviour pressure",
  safeguarding_pressure:"Safeguarding pressure",
  group_dynamics:       "Group dynamics",
  emotional_stability:  "Emotional stability",
  missing_stability:    "Missing-from-care stability",
  engagement:           "Engagement",
  education:            "Education",
};

function TrendIcon({ direction }) {
  if (direction === "improving") return <ArrowUpRight size={12} className="text-[#2F6A3A]" />;
  if (direction === "deteriorating") return <ArrowDownRight size={12} className="text-[#A8273A]" />;
  return <Minus size={12} className="text-stone-500" />;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch { return ""; }
}

export default function PlacementStabilityCard({ residentId }) {
  const [data, setData] = useState(null);
  const [traj, setTraj] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [snap, trajRes] = await Promise.all([
        api.get(`/placement-stability/resident/${residentId}`),
        api.get(`/placement-stability/trajectory/${residentId}?weeks=10`).catch(() => null),
      ]);
      setData(snap.data);
      setTraj(trajRes?.data || null);
    } catch { /* graceful */ }
    finally { setLoading(false); }
  }, [residentId]);
  useEffect(() => { if (residentId) load(); }, [residentId, load]);

  if (loading) {
    return (
      <section className="bg-white border divider-soft rounded-2xl p-4" data-testid="placement-stability-card">
        <div className="flex items-center gap-2 text-stone-600 text-sm">
          <Loader2 size={14} className="animate-spin" /> Reading placement stability signals…
        </div>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="bg-white border divider-soft rounded-2xl p-4 text-sm text-stone-500" data-testid="placement-stability-card">
        Stability intelligence unavailable.
      </section>
    );
  }

  const s = STATUS[data.status] || STATUS.steady;
  const topRisk = data.risk_factors?.[0];
  const topProtective = data.protective_factors?.[0];
  const trajStyle = TRAJECTORY_STYLE[traj?.trajectory_label] || TRAJECTORY_STYLE.steady;
  const TrajIcon = trajStyle.Icon;
  const showSparkline = traj && traj.points && traj.points.length >= 2;

  return (
    <>
      <section
        className="bg-white border divider-soft rounded-2xl p-4 border-l-4 cursor-pointer hover:bg-stone-50 transition-colors"
        style={{ borderLeftColor: s.line }}
        data-testid="placement-stability-card"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#0e3b4a]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e3b4a]">
                Placement stability
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{ background: s.bg, color: s.fg }} data-testid="placement-stability-status">
                {data.status_label}
              </span>
              <TrendIcon direction={data.trend_direction} />
              <span className="text-[10px] uppercase tracking-wider text-stone-500">
                {data.days_in_placement}d in placement · score {data.score}
              </span>
            </div>
          </div>
          <ChevronRight size={14} className="text-stone-400 mt-1" />
        </div>

        {/* Trajectory — Iteration 42b */}
        {traj && (
          <div
            className="mt-2 mb-3 rounded-lg border divider-soft p-2.5 flex items-center gap-3 flex-wrap"
            style={{ background: trajStyle.bg }}
            data-testid="placement-stability-trajectory"
          >
            <div className="flex items-center gap-1.5 shrink-0">
              <TrajIcon size={14} style={{ color: trajStyle.fg }} />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: trajStyle.fg }}
                data-testid="placement-stability-trajectory-label"
              >
                {traj.trajectory_label_text}
              </span>
            </div>
            {showSparkline ? (
              <>
                <StabilitySparkline
                  points={traj.points}
                  trajectoryLabel={traj.trajectory_label}
                  width={150}
                  height={40}
                  testid="card-sparkline"
                />
                <div className="text-[10px] text-stone-600 leading-tight min-w-0 flex-1">
                  <div className="font-semibold">
                    {traj.weeks_returned}-week journey · {traj.score_earliest} → {traj.score_current}
                  </div>
                  <div className="text-stone-500 truncate">{traj.trajectory_summary}</div>
                </div>
              </>
            ) : (
              <div className="text-[11px] text-stone-500">
                {traj.trajectory_summary || "Building longitudinal trajectory…"}
              </div>
            )}
          </div>
        )}

        {/* Top signals — one risk, one protective */}
        <div className="grid sm:grid-cols-2 gap-2 mt-2">
          {topRisk ? (
            <div className="bg-stone-50 rounded-lg p-2.5 border-l-2" style={{ borderLeftColor: "#A8273A" }} data-testid="top-risk-factor">
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={11} className="text-[#A8273A]" />
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#A8273A]">Top concern</span>
              </div>
              <p className="text-[12px] text-[#0F1115] mt-0.5">{topRisk.label}</p>
            </div>
          ) : (
            <div className="bg-stone-50 rounded-lg p-2.5 text-[12px] text-stone-500">No risk signals.</div>
          )}
          {topProtective ? (
            <div className="bg-stone-50 rounded-lg p-2.5 border-l-2" style={{ borderLeftColor: "#2F6A3A" }} data-testid="top-protective-factor">
              <div className="flex items-center gap-1.5">
                <Heart size={11} className="text-[#2F6A3A]" />
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#2F6A3A]">Top protective factor</span>
              </div>
              <p className="text-[12px] text-[#0F1115] mt-0.5">{topProtective.label}</p>
            </div>
          ) : (
            <div className="bg-stone-50 rounded-lg p-2.5 text-[12px] text-stone-500">No protective signals yet.</div>
          )}
        </div>

        <div className="text-[10px] text-stone-500 mt-2">Click for full evidence chain + week-by-week trajectory</div>
      </section>

      {open && <StabilityModal data={data} traj={traj} onClose={() => setOpen(false)} />}
    </>
  );
}

function StabilityModal({ data, traj, onClose }) {
  const s = STATUS[data.status] || STATUS.steady;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(11,14,22,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="placement-stability-modal">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b divider-soft sticky top-0 bg-white">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{ background: s.bg, color: s.fg }}>{data.status_label}</span>
                <TrendIcon direction={data.trend_direction} />
                <span className="text-[10px] uppercase tracking-wider text-stone-500">
                  {data.days_in_placement}d in placement · score {data.score}
                </span>
              </div>
              <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-1">
                {data.name} — placement stability analysis
              </h3>
              <p className="text-[12px] text-stone-600 mt-1">
                Comparing <strong>first 14 days post-admission</strong> against <strong>latest 14 days</strong>.
                Same data → same status. Use as supportive intelligence — never as a label.
              </p>
            </div>
            <button type="button" onClick={onClose}
              data-testid="placement-stability-modal-close"
              className="p-1.5 rounded-md hover:bg-stone-100 text-stone-500"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {traj && traj.points && traj.points.length > 0 && (
            <TrajectorySection traj={traj} residentId={data.resident_id} />
          )}

          <ScoreSplitBar risk={data.risk_score} protective={data.protective_score} />

          <FactorList
            title="Risk signals (current trend)" icon={AlertTriangle} testid="modal-risk-list"
            tone="#A8273A" tonebg="#A8273A12" items={data.risk_factors}
          />
          <FactorList
            title="Protective factors" icon={Heart} testid="modal-protective-list"
            tone="#2F6A3A" tonebg="#2F6A3A12" items={data.protective_factors}
          />

          {data.suggested_actions?.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0e3b4a] mb-2 flex items-center gap-1.5">
                <ListChecks size={12} /> Suggested supportive actions
              </h4>
              <ul className="space-y-1.5" data-testid="modal-suggested-actions">
                {data.suggested_actions.map((a, i) => (
                  <li key={i} className="bg-[#0e3b4a08] border-l-4 rounded-lg p-2.5 text-[13px] text-[#0F1115]"
                    style={{ borderLeftColor: "#0e3b4a" }}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-stone-50 rounded-lg p-3 flex items-start gap-2">
            <Info size={13} className="text-stone-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-stone-600 leading-relaxed">
              {data.explainable_note}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrajectorySection({ traj, residentId }) {
  const navigate = useNavigate();
  const trajStyle = TRAJECTORY_STYLE[traj.trajectory_label] || TRAJECTORY_STYLE.steady;
  const TrajIcon = trajStyle.Icon;
  const [activeIdx, setActiveIdx] = useState(traj.points.length - 1);
  const activePoint = traj.points[activeIdx] || null;
  const reversedPoints = useMemo(() => [...traj.points].reverse(), [traj.points]);

  const openChronologyAt = (iso) => {
    if (!residentId || !iso) return;
    const fromAt = new Date(new Date(iso).getTime() - 7 * 86400000).toISOString();
    const toAt = new Date(new Date(iso).getTime() + 86400000).toISOString();
    navigate(
      `/residents/${residentId}?tab=timeline&from_at=${encodeURIComponent(fromAt)}&to_at=${encodeURIComponent(toAt)}`,
    );
  };

  return (
    <div data-testid="trajectory-section">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0e3b4a] flex items-center gap-1.5">
          <TrajIcon size={12} style={{ color: trajStyle.fg }} />
          Placement journey · {traj.weeks_returned}-week trajectory
        </h4>
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
          style={{ background: trajStyle.bg, color: trajStyle.fg }}
          data-testid="modal-trajectory-label"
        >
          {traj.trajectory_label_text}
        </span>
      </div>

      <div
        className="rounded-lg border divider-soft p-3 flex items-center gap-3 flex-wrap"
        style={{ background: trajStyle.bg }}
      >
        <StabilitySparkline
          points={traj.points}
          trajectoryLabel={traj.trajectory_label}
          width={220}
          height={56}
          testid="modal-sparkline"
        />
        <div className="text-[11px] text-stone-700 leading-snug min-w-0 flex-1">
          <div className="font-semibold text-[#0F1115]">
            {traj.score_earliest} → {traj.score_current}
          </div>
          <div className="text-stone-600">{traj.trajectory_summary}</div>
          <div className="text-[10px] text-stone-500 mt-1">
            Range across window: {traj.score_min}–{traj.score_max}
          </div>
        </div>
      </div>

      {/* Week selector */}
      <div className="mt-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500 mb-1.5">
          Week-by-week — tap a week to see what changed
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1" data-testid="trajectory-week-list">
          {reversedPoints.map((p, displayIdx) => {
            const realIdx = traj.points.length - 1 - displayIdx;
            const isActive = realIdx === activeIdx;
            const dotStyle = STATUS[p.status] || STATUS.steady;
            return (
              <button
                key={p.week_index}
                type="button"
                onClick={() => setActiveIdx(realIdx)}
                className={`shrink-0 rounded-md px-2 py-1 border text-left transition-colors ${isActive ? "border-[#0e3b4a] bg-white" : "border-stone-200 bg-stone-50 hover:bg-white"}`}
                data-testid={`trajectory-week-btn-${realIdx}`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: dotStyle.line }}
                  />
                  <span className="text-[10px] font-semibold text-[#0F1115]">
                    {fmtDate(p.week_ending_at)}
                  </span>
                </div>
                <div className="text-[10px] text-stone-500">
                  score {p.score}{p.key_event_count > 0 ? ` · ${p.key_event_count} event${p.key_event_count === 1 ? "" : "s"}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active week detail */}
      {activePoint && (
        <div className="mt-2 rounded-lg border divider-soft p-3 bg-white" data-testid="trajectory-week-detail">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div>
              <div className="text-[11px] font-semibold text-[#0F1115]">
                Week ending {fmtDate(activePoint.week_ending_at)}
              </div>
              <div className="text-[10px] text-stone-500">
                {activePoint.status_label} · score {activePoint.score} ·{" "}
                {activePoint.days_in_placement_at_week}d in placement
              </div>
            </div>
            <button
              type="button"
              onClick={() => openChronologyAt(activePoint.week_ending_at)}
              className="text-[10px] uppercase tracking-wider text-[#0e3b4a] hover:underline flex items-center gap-1"
              data-testid="trajectory-week-open-chronology"
            >
              Open chronology <ExternalLink size={10} />
            </button>
          </div>

          {activePoint.top_risk && (
            <div className="text-[11px] text-[#A8273A] mb-1">
              <strong>Concern:</strong> {activePoint.top_risk}
            </div>
          )}
          {activePoint.top_protective && (
            <div className="text-[11px] text-[#2F6A3A] mb-1">
              <strong>Protective:</strong> {activePoint.top_protective}
            </div>
          )}

          {activePoint.key_events && activePoint.key_events.length > 0 ? (
            <ul className="mt-1.5 space-y-1" data-testid="trajectory-week-events">
              {activePoint.key_events.slice(0, 8).map((ev, i) => {
                const colour =
                  ev.severity === "high" ? "#A8273A" :
                  ev.severity === "protective" ? "#2F6A3A" : "#B8772F";
                return (
                  <li
                    key={i}
                    className="text-[11px] flex items-center gap-2 px-2 py-1 rounded border-l-2"
                    style={{ borderLeftColor: colour, background: `${colour}0a` }}
                  >
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider"
                      style={{ color: colour }}
                    >
                      {ev.kind}
                    </span>
                    <span className="text-[#0F1115]">{ev.label}</span>
                    <span className="text-stone-400 ml-auto text-[10px]">
                      {fmtDate(ev.at)}
                    </span>
                  </li>
                );
              })}
              {activePoint.key_events.length > 8 && (
                <li className="text-[10px] text-stone-500 px-2">
                  + {activePoint.key_events.length - 8} more event{activePoint.key_events.length - 8 === 1 ? "" : "s"} in this week
                </li>
              )}
            </ul>
          ) : (
            <div className="text-[11px] text-stone-500 italic mt-1">
              No notable events recorded for this week — placement quietly going well.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreSplitBar({ risk, protective }) {
  const total = Math.max(risk + protective, 1);
  return (
    <div data-testid="modal-score-split">
      <div className="flex justify-between text-[11px] text-stone-500 mb-1">
        <span>Risk weights: <span className="font-semibold text-[#A8273A]">{risk}</span></span>
        <span>Protective weights: <span className="font-semibold text-[#2F6A3A]">{protective}</span></span>
      </div>
      <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden flex">
        <div style={{ width: `${(risk / total) * 100}%`, background: "#A8273A" }} />
        <div style={{ width: `${(protective / total) * 100}%`, background: "#2F6A3A" }} />
      </div>
    </div>
  );
}

function FactorList({ title, icon: Icon, tone, tonebg, items, testid }) {
  if (!items || items.length === 0) {
    return (
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] mb-2 flex items-center gap-1.5" style={{ color: tone }}>
          <Icon size={12} /> {title}
        </h4>
        <div className="bg-stone-50 rounded-lg p-3 text-[12px] text-stone-600">None in this window.</div>
      </div>
    );
  }
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] mb-2 flex items-center gap-1.5" style={{ color: tone }}>
        <Icon size={12} /> {title}
      </h4>
      <ul className="space-y-2" data-testid={testid}>
        {items.map((f, i) => (
          <li key={i} className="rounded-lg p-2.5 border-l-4" style={{ borderLeftColor: tone, background: tonebg }}>
            <div className="flex items-start gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5 shrink-0"
                style={{ background: "white", color: tone }}>
                {DOMAIN_LABEL[f.domain] || f.domain}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-[#0F1115] leading-relaxed">{f.label}</div>
                {f.evidence && Object.keys(f.evidence).length > 0 && (
                  <div className="text-[10px] text-stone-500 mt-0.5 flex flex-wrap gap-2">
                    {Object.entries(f.evidence).map(([k, v]) => (
                      <span key={k}>
                        <span className="uppercase tracking-wider">{k.replace(/_/g, " ")}</span>:{" "}
                        <span className="font-mono">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-semibold shrink-0" style={{ color: tone }}>
                {f.weight > 0 ? `+${f.weight}` : `${f.weight}`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
