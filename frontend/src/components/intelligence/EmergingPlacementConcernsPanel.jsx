/* Emerging Placement Concerns panel — Children's Compliance & Oversight only.
 *
 * Manager+ only. Surfaces:
 *  - residents whose placement stability is shifting (in either direction)
 *  - residents quietly stabilising (positive trajectory)
 *
 * Tone: supportive, evidence-led, never punitive. Every flag drills into
 * the full factor chain via the per-resident card.
 */
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  Sparkles, Heart, AlertTriangle, ChevronRight, Loader2, ShieldCheck,
  ArrowUpRight, ArrowDownRight, Minus, Info, X,
} from "lucide-react";
import PlacementStabilityCard from "@/components/intelligence/PlacementStabilityCard";

const STATUS_META = {
  critical:      { label: "Immediate review", fg: "#5A0E1C", bg: "#5A0E1C18", rank: 0 },
  deteriorating: { label: "Support recommended", fg: "#A8273A", bg: "#A8273A18", rank: 1 },
  watch:         { label: "Watching",             fg: "#B8772F", bg: "#B8772F18", rank: 2 },
  stabilising:   { label: "Stabilising",          fg: "#2F6A3A", bg: "#2F6A3A18", rank: 3 },
  steady:        { label: "Steady",               fg: "#5D6068", bg: "#5D606818", rank: 4 },
  new_placement: { label: "Recently admitted",    fg: "#5D6068", bg: "#5D606818", rank: 5 },
};

function TrendIcon({ direction }) {
  if (direction === "improving") return <ArrowUpRight size={11} className="text-[#2F6A3A]" />;
  if (direction === "deteriorating") return <ArrowDownRight size={11} className="text-[#A8273A]" />;
  return <Minus size={11} className="text-stone-500" />;
}

export default function EmergingPlacementConcernsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openResidentId, setOpenResidentId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get("/placement-stability/emerging-concerns");
      setData(r.data);
    } catch (e) {
      setError(e?.response?.status === 403 ? "Manager+ only." : "Could not load placement intelligence.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 flex items-center gap-2 text-stone-600 text-sm"
        data-testid="emerging-concerns-panel">
        <Loader2 size={14} className="animate-spin" /> Loading placement stability intelligence…
      </div>
    );
  }
  if (error) {
    return <div className="bg-white border divider-soft rounded-2xl p-6 text-sm text-stone-700" data-testid="emerging-concerns-panel">{error}</div>;
  }

  const summary = data.summary || {};
  const concerns = data.emerging_concerns || [];
  const stabilising = data.stabilising_trends || [];

  const bannerTint =
    data.overall_status === "support_recommended"
      ? "linear-gradient(135deg, #3d1820 0%, #2a0e15 100%)"
      : data.overall_status === "watch"
      ? "linear-gradient(135deg, #3a2818 0%, #221610 100%)"
      : data.overall_status === "stabilising"
      ? "linear-gradient(135deg, #2F6A3A 0%, #235029 100%)"
      : "linear-gradient(135deg, #0F2A47 0%, #0a1e34 100%)";

  return (
    <div className="space-y-4" data-testid="emerging-concerns-panel">
      {/* Hero summary */}
      <section className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        style={{ background: bannerTint, color: "white" }}
        data-testid="emerging-concerns-hero">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-white/80" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
              Emerging placement concerns
            </span>
          </div>
          <h2 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5" style={{ letterSpacing: "-0.02em" }}>
            {data.overall_label}
          </h2>
          <p className="text-[12px] text-white/70 mt-1 max-w-2xl">
            Deterministic placement stability intelligence across all current children.
            We surface support needs early — and quietly celebrate positive trajectory.
          </p>

          {/* Summary tiles */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4" data-testid="emerging-summary-tiles">
            {[
              ["critical", "Immediate", summary.critical],
              ["deteriorating", "Support", summary.deteriorating],
              ["watch", "Watching", summary.watch],
              ["stabilising", "Stabilising", summary.stabilising],
              ["steady", "Steady", summary.steady],
              ["new_placement", "New", summary.new_placement],
            ].map(([k, l, n]) => (
              <div key={k} className="bg-white/10 backdrop-blur rounded-lg p-2.5" data-testid={`emerging-summary-${k}`}>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/65">{l}</div>
                <div className="text-xl font-display font-semibold mt-0.5">{n ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Concerns list */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="concerns-list-section">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-[#A8273A]" />
          <h3 className="font-semibold text-[#0F1115] text-[15px]">Where support may be needed</h3>
        </div>
        {concerns.length === 0 ? (
          <div className="rounded-lg bg-[#2F6A3A14] p-3 text-[13px] text-[#0F1115] flex items-center gap-2"
            data-testid="concerns-empty">
            <ShieldCheck size={14} className="text-[#2F6A3A]" />
            No emerging concerns across the home. Continue routine key-work.
          </div>
        ) : (
          <ul className="space-y-2" data-testid="concerns-list">
            {concerns.map((r) => (
              <ResidentRow key={r.resident_id} row={r} onOpen={() => setOpenResidentId(r.resident_id)} />
            ))}
          </ul>
        )}
      </section>

      {/* Stabilising list — positive trajectory */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="stabilising-section">
        <div className="flex items-center gap-2 mb-3">
          <Heart size={16} className="text-[#2F6A3A]" />
          <h3 className="font-semibold text-[#0F1115] text-[15px]">Positive trajectory</h3>
          <span className="text-[10px] uppercase tracking-wider text-stone-500 ml-auto">
            Quietly going well
          </span>
        </div>
        {stabilising.length === 0 ? (
          <div className="rounded-lg bg-stone-50 p-3 text-[13px] text-stone-600" data-testid="stabilising-empty">
            No clear stabilisation pattern surfaced this window — look for opportunities to evidence
            progress in supervision notes.
          </div>
        ) : (
          <ul className="space-y-2" data-testid="stabilising-list">
            {stabilising.map((r) => (
              <ResidentRow key={r.resident_id} row={r} onOpen={() => setOpenResidentId(r.resident_id)} />
            ))}
          </ul>
        )}
      </section>

      <div className="bg-stone-50 border divider-soft rounded-2xl p-4 flex items-start gap-3"
        data-testid="emerging-concerns-privacy-note">
        <Info size={14} className="text-stone-500 mt-0.5 shrink-0" />
        <p className="text-[12px] text-stone-700 leading-relaxed">
          {data.explainable_note}
        </p>
      </div>

      {openResidentId && (
        <ResidentDrilldownModal
          residentId={openResidentId}
          onClose={() => setOpenResidentId(null)}
        />
      )}
    </div>
  );
}

function ResidentRow({ row, onOpen }) {
  const s = STATUS_META[row.status] || STATUS_META.steady;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid={`resident-row-${row.resident_id}`}
        className="w-full text-left py-2.5 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors flex items-start gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-[#0F1115] text-[13px]">{row.name}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
              style={{ background: s.bg, color: s.fg }}>{row.status_label}</span>
            <TrendIcon direction={row.trend_direction} />
            <span className="text-[10px] uppercase tracking-wider text-stone-500">
              score {row.score} · {row.days_in_placement}d
            </span>
          </div>
          {row.top_risk && (
            <p className="text-[11px] text-[#A8273A] mt-0.5 flex items-center gap-1">
              <AlertTriangle size={10} /> {row.top_risk}
            </p>
          )}
          {row.top_protective && (
            <p className="text-[11px] text-[#2F6A3A] mt-0.5 flex items-center gap-1">
              <Heart size={10} /> {row.top_protective}
            </p>
          )}
        </div>
        <ChevronRight size={14} className="text-stone-400 mt-1" />
      </button>
    </li>
  );
}

function ResidentDrilldownModal({ residentId, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(11,14,22,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="resident-drilldown-modal">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b divider-soft flex items-center justify-between gap-2">
          <h3 className="font-display font-semibold text-base text-[#0F1115]">Placement stability — drilldown</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-stone-100 text-stone-500"><X size={18} /></button>
        </div>
        <div className="p-4">
          <PlacementStabilityCard residentId={residentId} />
        </div>
      </div>
    </div>
  );
}
