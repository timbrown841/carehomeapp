import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useSectorCopy } from "@/lib/sectorCopy";
import {
  TrendingUp, TrendingDown, Minus, X, ChevronRight, BookOpen,
  AlertCircle, Activity, Loader2, Sparkles, Shield,
} from "lucide-react";

const SEV = {
  critical: { fg: "#A8273A", bg: "#A8273A14", line: "#A8273A", label: "Critical", weight: 0 },
  high:     { fg: "#B23A48", bg: "#B23A4814", line: "#B23A48", label: "High",     weight: 1 },
  medium:   { fg: "#B8772F", bg: "#B8772F18", line: "#B8772F", label: "Medium",   weight: 2 },
  low:      { fg: "#5D6068", bg: "#5D606818", line: "#5D6068", label: "Low",      weight: 3 },
};
const TREND_ICON = { rising: TrendingUp, falling: TrendingDown, stable: Minus };

export default function EmergingRisksPanel() {
  const { effectiveMode } = useOrg();
  const copy = useSectorCopy();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openRisk, setOpenRisk] = useState(null);

  const load = useCallback(async () => {
    if (!effectiveMode) return;
    setLoading(true);
    try {
      const r = await api.get("/intelligence/forecast", { params: { mode: effectiveMode } });
      setData(r.data);
    } catch { /* graceful */ }
    finally { setLoading(false); }
  }, [effectiveMode]);
  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="emerging-risks-panel">
        <div className="flex items-center gap-2 text-stone-600 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading operational intelligence…
        </div>
      </section>
    );
  }

  const risks = data.emerging_risks || [];

  return (
    <section
      className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
      style={{
        background: risks.length === 0
          ? "linear-gradient(135deg, #2F6A3A 0%, #235029 100%)"
          : data.overall_status === "critical"
          ? "linear-gradient(135deg, #4a1923 0%, #2a0e15 100%)"
          : data.overall_status === "high"
          ? "linear-gradient(135deg, #3d1820 0%, #2a0e15 100%)"
          : "linear-gradient(135deg, #2A1F3D 0%, #1B1B36 100%)",
        color: "white",
      }}
      data-testid="emerging-risks-panel"
    >
      <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-white/80" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                Operational intelligence · {copy.regulatorName}
              </span>
            </div>
            <h2 className="font-display font-semibold text-xl sm:text-2xl mt-1.5" style={{ letterSpacing: "-0.02em" }}>
              {risks.length === 0
                ? "No emerging risks. Operational signal is stable."
                : `${risks.length} emerging risk${risks.length === 1 ? "" : "s"} need oversight`}
            </h2>
            <p className="text-[12px] text-white/70 mt-1">
              Deterministic patterns across 7 / 14 / 30 / 90-day rolling windows. Every flag is evidence-linked — click any card to see why.
            </p>
          </div>
          {risks.length > 0 && (
            <div className="flex gap-1.5" data-testid="risk-severity-summary">
              {["critical", "high", "medium", "low"].map((sev) => {
                const c = data.counts_by_severity[sev] || 0;
                if (c === 0) return null;
                const t = SEV[sev];
                return (
                  <span key={sev} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
                    style={{ background: "rgba(255,255,255,0.12)", color: "white" }} data-testid={`severity-count-${sev}`}>
                    {c} {t.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {risks.length === 0 ? (
          <div className="rounded-xl bg-white/10 backdrop-blur p-4 text-sm flex items-center gap-3" data-testid="risks-empty">
            <Shield size={16} className="text-white/80" />
            <span className="text-white/90">
              Safelyn continuously analyses safeguarding, behaviour, medication, wellbeing and staffing signals. Nothing has crossed an escalation threshold in the rolling windows.
            </span>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {risks.map((r) => (
              <RiskCard key={r.id} risk={r} onOpen={() => setOpenRisk(r)} />
            ))}
          </div>
        )}
      </div>
      {openRisk && <ExplanationModal risk={openRisk} onClose={() => setOpenRisk(null)} />}
    </section>
  );
}

function RiskCard({ risk, onOpen }) {
  const sev = SEV[risk.severity] || SEV.low;
  const Trend = TREND_ICON[risk.trend] || Minus;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`risk-card-${risk.id}`}
      className="text-left bg-white/10 hover:bg-white/15 backdrop-blur rounded-xl p-3 border-l-4 transition-colors group"
      style={{ borderLeftColor: sev.line }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,255,255,0.18)", color: "white" }}>
              {sev.label}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">{risk.domain}</span>
            <span className="text-[9px] text-white/60 flex items-center gap-0.5">
              <Trend size={10} /> {risk.trend}
            </span>
          </div>
          <div className="text-sm font-semibold text-white mt-1">{risk.title}</div>
          <div className="text-[11px] text-white/70 mt-0.5">{risk.summary}</div>
          <div className="text-[10px] text-white/50 mt-1.5 flex items-center gap-2">
            <span>{risk.timeframe}</span>
            <span>·</span>
            <span>{risk.confidence}% confidence</span>
            {risk.affected_subjects?.length > 0 && (
              <>
                <span>·</span>
                <span>{risk.affected_subjects.length} affected</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight size={14} className="text-white/40 group-hover:translate-x-0.5 transition-transform shrink-0 mt-1" />
      </div>
    </button>
  );
}

function ExplanationModal({ risk, onClose }) {
  const sev = SEV[risk.severity] || SEV.low;
  const Trend = TREND_ICON[risk.trend] || Minus;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(11, 14, 22, 0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="risk-explanation-modal"
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b divider-soft sticky top-0 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: sev.bg, color: sev.fg }}>{sev.label} severity</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                  <Trend size={11} /> {risk.trend}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-stone-500">
                  {risk.confidence}% confidence
                </span>
              </div>
              <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-1.5" style={{ letterSpacing: "-0.01em" }}>
                {risk.title}
              </h3>
              <p className="text-sm text-stone-600 mt-1">{risk.summary}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="risk-explanation-close"
              className="p-1.5 rounded-md hover:bg-stone-100 text-stone-500"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Why we flagged this */}
        <div className="p-5">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0e3b4a] mb-2 flex items-center gap-1.5">
            <Activity size={12} /> Why Safelyn flagged this
          </h4>
          <ul className="space-y-2" data-testid="risk-evidence-chain">
            {risk.evidence.map((e, idx) => (
              <li key={idx} className="bg-stone-50 rounded-lg p-2.5 flex items-start gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5 shrink-0"
                  style={{ background: e.type === "threshold" ? "#0e3b4a18" : "#5D606818", color: e.type === "threshold" ? "#0e3b4a" : "#0F1115" }}>
                  {e.type}
                </span>
                <span className="text-[13px] text-[#0F1115] leading-relaxed">{e.label}</span>
              </li>
            ))}
          </ul>

          {risk.affected_subjects?.length > 0 && (
            <div className="mt-4">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0e3b4a] mb-2">
                Affected
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {risk.affected_subjects.map((s) => (
                  <Link
                    key={s.id}
                    to={`/residents/${s.id}`}
                    data-testid={`risk-subject-${s.id}`}
                    className="text-[11px] font-semibold px-2 py-1 rounded-full bg-stone-100 hover:bg-stone-200 text-[#0F1115]"
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {risk.recommended_action && (
            <div className="mt-4 bg-[#0e3b4a08] border-l-4 rounded-lg p-3" style={{ borderLeftColor: "#0e3b4a" }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0e3b4a] mb-1">
                Recommended action
              </div>
              <p className="text-[13px] text-[#0F1115] leading-relaxed">{risk.recommended_action}</p>
            </div>
          )}

          {risk.linked_regulation && (
            <div className="mt-3 flex items-start gap-2 text-[12px] text-stone-700" data-testid="risk-regulation">
              <BookOpen size={13} className="text-[#0e3b4a] mt-0.5 shrink-0" />
              <span><span className="font-semibold">Linked regulation:</span> {risk.linked_regulation}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t divider-soft bg-stone-50 flex justify-between items-center gap-2 sticky bottom-0">
          <span className="text-[10px] text-stone-500">Deterministic · evidence-linked · no AI inference</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-white">Close</button>
            {risk.deep_link && (
              <Link
                to={risk.deep_link}
                onClick={onClose}
                data-testid="risk-deep-link"
                className="text-sm font-semibold bg-[#0e3b4a] text-white px-3 py-2 rounded-lg hover:bg-[#0a2e3a] inline-flex items-center gap-1"
              >
                Open evidence <ChevronRight size={14} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-usable stability badge for resident profile/list
const STABILITY = {
  critical:   { bg: "#A8273A14", fg: "#A8273A", label: "Critical oversight" },
  escalating: { bg: "#B23A4814", fg: "#B23A48", label: "Escalating" },
  emerging:   { bg: "#B8772F18", fg: "#B8772F", label: "Emerging concern" },
  stable:     { bg: "#2F6A3A14", fg: "#2F6A3A", label: "Stable" },
};

export function StabilityBadge({ status, label, score, small = false }) {
  const s = STABILITY[status] || STABILITY.stable;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider rounded-full ${
        small ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-1"
      }`}
      style={{ background: s.bg, color: s.fg }}
      data-testid={`stability-badge-${status}`}
      title={`Score ${score}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.fg }} />
      {label || s.label}
    </span>
  );
}

export function ResidentStabilityCard({ residentId, mode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get(`/intelligence/resident-stability/${residentId}`, { params: { mode } })
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [residentId, mode]);

  if (loading) return null;
  if (!data || data.status === "stable") {
    return (
      <div
        className="rounded-xl border-l-4 border-y border-r divider-soft bg-white p-3 flex items-center gap-3"
        style={{ borderLeftColor: "#2F6A3A" }}
        data-testid="resident-stability-card"
      >
        <Shield size={16} className="text-[#2F6A3A]" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#2F6A3A]">Stable · operational intelligence</div>
          <div className="text-[12px] text-stone-700">No emerging concerns in the rolling windows.</div>
        </div>
      </div>
    );
  }

  const s = STABILITY[data.status] || STABILITY.stable;
  return (
    <div
      className="rounded-xl border-l-4 border-y border-r divider-soft bg-white p-4"
      style={{ borderLeftColor: s.fg }}
      data-testid="resident-stability-card"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StabilityBadge status={data.status} label={data.label} score={data.score} />
            <span className="text-[10px] uppercase tracking-wider font-bold text-stone-500">Score {data.score}</span>
          </div>
          <h4 className="text-[15px] font-semibold text-[#0F1115] mt-1.5">Stability oversight</h4>
          <p className="text-[12px] text-stone-600 mt-0.5">
            Deterministic score across safeguarding, behaviour, medication and review signals.
          </p>
        </div>
      </div>
      {data.factors?.length > 0 && (
        <ul className="mt-3 space-y-1.5" data-testid="stability-factor-chain">
          {data.factors.map((f, idx) => (
            <li key={idx} className="flex items-center gap-2 text-[12px]">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.fg }} />
              <span className="flex-1 text-[#0F1115]">{f.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-stone-500">{f.domain}</span>
              <span className="text-[11px] font-semibold text-stone-700">+{f.weight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
