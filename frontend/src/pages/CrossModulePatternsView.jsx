import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, TrendingUp, TrendingDown, Minus, Users, MapPin,
  Clock3, AlertTriangle, EyeOff, Activity, Sparkles, ArrowRight,
} from "lucide-react";

const TONE = {
  green: { fg: "#2F6A3A", bg: "#2F6A3A14" },
  amber: { fg: "#B8772F", bg: "#B8772F18" },
  red: { fg: "#A8273A", bg: "#A8273A14" },
  blue: { fg: "#0e3b4a", bg: "#0e3b4a14" },
};

const SEV = {
  high: TONE.red,
  medium: TONE.amber,
  low: TONE.blue,
};

function TrendChip({ delta }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#A8273A]">
        <TrendingUp size={12} /> +{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#2F6A3A]">
        <TrendingDown size={12} /> {delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500">
      <Minus size={12} /> 0
    </span>
  );
}

function PrettyLabel(s) {
  return (s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export default function CrossModulePatternsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/ofsted/cross-module-patterns");
      setData(r.data);
    } catch (e) {
      if (e?.response?.status !== 403) toast.error("Couldn't load pattern intelligence");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 text-stone-600 py-12 justify-center" data-testid="patterns-loading">
        <Loader2 size={18} className="animate-spin" /> Loading cross-module intelligence…
      </div>
    );
  }

  const trends = data.escalation_trends || {};
  const themes = data.recurring_themes || [];
  const repeats = data.repeat_concern_children || [];
  const unresolved = data.unresolved_risks || [];
  const hotspots = data.safeguarding_hotspots || { locations: [], times_of_day: [], repeat_residents: [] };
  const blindSpots = data.leadership_blind_spots || [];

  const totalSignal = themes.length + repeats.length + unresolved.length + blindSpots.length;

  return (
    <div className="space-y-5" data-testid="cross-module-patterns">
      {/* Header */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: "linear-gradient(135deg, #2A1F3D 0%, #3F2E5C 50%, #1B4D5F 100%)" }}
      >
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full bg-white/10 backdrop-blur">
              Operational intelligence
            </span>
            <h2 className="font-display font-semibold text-2xl sm:text-3xl mt-3" style={{ letterSpacing: "-0.02em" }}>
              Cross-module pattern intelligence
            </h2>
            <p className="text-sm text-white/80 mt-1 max-w-xl">
              Recurring themes, repeat concerns and escalation trends — aggregated across safeguarding,
              incidents, staffing and compliance to surface what would normally hide between modules.
            </p>
          </div>
          <button
            onClick={load}
            data-testid="patterns-refresh"
            className="text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-2 rounded-lg flex items-center gap-1.5 backdrop-blur"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {totalSignal === 0 && (
        <div className="bg-white border divider-soft rounded-2xl p-8 text-center" data-testid="patterns-empty">
          <Sparkles size={28} className="mx-auto text-[#2F6A3A] mb-2" />
          <p className="text-sm font-semibold text-[#0F1115]">No cross-module signal right now.</p>
          <p className="text-xs text-stone-600 mt-1">When trends, repeat concerns or unresolved risks emerge, they'll surface here.</p>
        </div>
      )}

      {/* Escalation trends */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="patterns-trends">
        <h3 className="text-sm font-semibold text-[#0F1115] flex items-center gap-2 mb-3">
          <Activity size={15} /> Escalation trends · this week vs last week
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(trends).map(([k, v]) => (
            <div key={k} className="bg-stone-50 rounded-xl p-3" data-testid={`trend-${k}`}>
              <div className="text-[10px] uppercase tracking-wider font-bold text-stone-600">{PrettyLabel(k)}</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-semibold text-[#0F1115]">{v.this_week}</span>
                <TrendChip delta={v.delta} />
              </div>
              <div className="text-[11px] text-stone-500">last week {v.last_week}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Recurring themes */}
        <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="patterns-themes">
          <h3 className="text-sm font-semibold text-[#0F1115] flex items-center gap-2 mb-3">
            <Sparkles size={15} /> Recurring themes · 30 days
          </h3>
          {themes.length === 0 ? (
            <p className="text-sm text-stone-600">No recurring themes detected.</p>
          ) : (
            <ul className="space-y-2">
              {themes.map((t, idx) => (
                <li key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50" data-testid={`theme-${idx}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#0F1115]">{t.title}</div>
                    <div className="text-[11px] text-stone-500 uppercase tracking-wider">{t.domain}</div>
                  </div>
                  <span className="text-lg font-semibold text-[#0F1115]">{t.count_30d}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Repeat-concern children */}
        <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="patterns-repeats">
          <h3 className="text-sm font-semibold text-[#0F1115] flex items-center gap-2 mb-3">
            <Users size={15} /> Repeat-concern children
          </h3>
          {repeats.length === 0 ? (
            <p className="text-sm text-stone-600">No children showing repeat cross-module concerns.</p>
          ) : (
            <ul className="space-y-2">
              {repeats.map((c) => (
                <li key={c.resident_id} className="border-l-4 rounded-lg p-3 bg-stone-50" style={{ borderLeftColor: c.count >= 3 ? "#A8273A" : "#B8772F" }} data-testid={`repeat-${c.resident_id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <Link to={`/residents/${c.resident_id}`} className="text-sm font-semibold text-[#0F1115] hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-200 text-stone-800">
                      {c.count} domains
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.concern_types.map((t) => (
                      <span key={t} className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white border divider-soft text-stone-700">
                        {PrettyLabel(t)}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Unresolved risks */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="patterns-unresolved">
        <h3 className="text-sm font-semibold text-[#0F1115] flex items-center gap-2 mb-3">
          <AlertTriangle size={15} className="text-[#A8273A]" /> Unresolved risks
        </h3>
        {unresolved.length === 0 ? (
          <p className="text-sm text-stone-600">All flagged risks are within target resolution windows.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2">
            {unresolved.map((u, idx) => {
              const tone = SEV[u.severity] || SEV.low;
              return (
                <li key={idx} className="border-l-4 rounded-lg p-3 bg-stone-50 flex items-start gap-2" style={{ borderLeftColor: tone.fg }} data-testid={`unresolved-${idx}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: tone.bg, color: tone.fg }}>
                        {u.severity}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{u.domain}</span>
                    </div>
                    <div className="text-sm font-medium text-[#0F1115] mt-1">{u.label}</div>
                    <div className="text-xs text-stone-600 mt-0.5">{u.count} item{u.count === 1 ? "" : "s"}</div>
                  </div>
                  {u.link && (
                    <Link to={u.link} className="text-xs text-[#0e3b4a] hover:underline shrink-0 mt-1 flex items-center gap-0.5">
                      Open <ArrowRight size={12} />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Safeguarding hotspots */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="patterns-hotspots">
        <h3 className="text-sm font-semibold text-[#0F1115] flex items-center gap-2 mb-3">
          <MapPin size={15} /> Safeguarding hotspots
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div data-testid="hotspots-locations">
            <div className="text-[10px] uppercase tracking-wider font-bold text-stone-600 mb-1.5">Recurring missing locations</div>
            {hotspots.locations.length === 0 ? (
              <p className="text-xs text-stone-500">None identified.</p>
            ) : (
              <ul className="space-y-1">
                {hotspots.locations.map((l, i) => (
                  <li key={i} className="flex items-center justify-between text-sm bg-stone-50 rounded-lg px-2.5 py-1.5">
                    <span className="truncate" title={l.location}>{l.location}</span>
                    <span className="text-stone-500 font-semibold">{l.count}×</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div data-testid="hotspots-times">
            <div className="text-[10px] uppercase tracking-wider font-bold text-stone-600 mb-1.5">
              <Clock3 size={11} className="inline mr-1" /> Time-of-day clusters
            </div>
            <ul className="space-y-1.5">
              {hotspots.times_of_day.map((b, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-stone-700 w-12">{b.window}</span>
                  <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0e3b4a]" style={{ width: `${b.pct}%` }} />
                  </div>
                  <span className="text-stone-600 w-12 text-right">{b.count} ({b.pct}%)</span>
                </li>
              ))}
            </ul>
          </div>
          <div data-testid="hotspots-repeats">
            <div className="text-[10px] uppercase tracking-wider font-bold text-stone-600 mb-1.5">Highest-volume children · 30d</div>
            {hotspots.repeat_residents.length === 0 ? (
              <p className="text-xs text-stone-500">No child with 3+ incidents in 30 days.</p>
            ) : (
              <ul className="space-y-1">
                {hotspots.repeat_residents.map((r) => (
                  <li key={r.resident_id} className="flex items-center justify-between text-sm bg-stone-50 rounded-lg px-2.5 py-1.5">
                    <Link to={`/residents/${r.resident_id}`} className="hover:underline truncate">{r.name}</Link>
                    <span className="text-stone-500 font-semibold">{r.count} inc.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Leadership blind spots */}
      <section className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5" style={{ borderLeftColor: "#B8772F" }} data-testid="patterns-blindspots">
        <h3 className="text-sm font-semibold text-[#0F1115] flex items-center gap-2 mb-3">
          <EyeOff size={15} className="text-[#B8772F]" /> Leadership blind spots
        </h3>
        {blindSpots.length === 0 ? (
          <p className="text-sm text-stone-600">No oversight gaps detected. Actions are owned and signed off.</p>
        ) : (
          <ul className="space-y-2">
            {blindSpots.map((b, idx) => {
              const tone = SEV[b.severity] || SEV.low;
              return (
                <li key={idx} className="flex items-start gap-2.5" data-testid={`blindspot-${idx}`}>
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: tone.fg }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#0F1115]">{b.title}</div>
                    <div className="text-xs text-stone-700">{b.detail}</div>
                  </div>
                  {b.link && (
                    <Link to={b.link} className="text-xs text-[#0e3b4a] hover:underline shrink-0 mt-0.5 flex items-center gap-0.5">
                      Open <ArrowRight size={11} />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-stone-500 text-center" data-testid="patterns-generated-at">
        Generated {new Date(data.generated_at).toLocaleString()} · deterministic aggregation across 9 collections.
      </p>
    </div>
  );
}
