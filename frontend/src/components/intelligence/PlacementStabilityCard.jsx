/* Placement Stability Card — rendered on the resident profile.
 *
 * Deterministic, evidence-linked, supportive in tone.
 * Surfaces both risk and protective factors, with a "View full analysis"
 * modal that explains every signal in the evidence chain.
 */
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  Sparkles, ChevronRight, X, Loader2, ArrowUpRight, ArrowDownRight, Minus,
  Heart, AlertTriangle, ShieldCheck, ListChecks, Info,
} from "lucide-react";

const STATUS = {
  stabilising:   { fg: "#2F6A3A", bg: "#2F6A3A14", line: "#2F6A3A" },
  steady:        { fg: "#5D6068", bg: "#5D606814", line: "#5D6068" },
  watch:         { fg: "#B8772F", bg: "#B8772F18", line: "#B8772F" },
  deteriorating: { fg: "#A8273A", bg: "#A8273A14", line: "#A8273A" },
  critical:      { fg: "#5A0E1C", bg: "#5A0E1C18", line: "#5A0E1C" },
  new_placement: { fg: "#5D6068", bg: "#5D606814", line: "#5D6068" },
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

export default function PlacementStabilityCard({ residentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/placement-stability/resident/${residentId}`);
      setData(r.data);
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

  return (
    <>
      <section
        className="bg-white border divider-soft rounded-2xl p-4 border-l-4 cursor-pointer hover:bg-stone-50 transition-colors"
        style={{ borderLeftColor: s.line }}
        data-testid="placement-stability-card"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
          <div>
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#0e3b4a]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e3b4a]">
                Placement stability
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
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

        <div className="text-[10px] text-stone-500 mt-2">Click for full evidence chain</div>
      </section>

      {open && <StabilityModal data={data} onClose={() => setOpen(false)} />}
    </>
  );
}

function StabilityModal({ data, onClose }) {
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
