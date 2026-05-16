import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  Heart, Loader2, X, Shield, Sparkles, ChevronRight, Info, ListChecks, Lock,
} from "lucide-react";

const RISK = {
  high:   { fg: "#A8273A", bg: "#A8273A14", line: "#A8273A", label: "Support recommended", rank: 0 },
  medium: { fg: "#B8772F", bg: "#B8772F18", line: "#B8772F", label: "Pressure increasing",  rank: 1 },
  low:    { fg: "#2F6A3A", bg: "#2F6A3A14", line: "#2F6A3A", label: "Steady",               rank: 2 },
};

const STATUS_BANNER = {
  high_pressure:        { tint: "linear-gradient(135deg, #3d1820 0%, #2a0e15 100%)", label: "High pressure on the team — support recommended" },
  support_recommended:  { tint: "linear-gradient(135deg, #2A1F3D 0%, #1B1B36 100%)", label: "Multiple colleagues showing rising pressure" },
  watch:                { tint: "linear-gradient(135deg, #2A1F3D 0%, #1B1B36 100%)", label: "Watching one colleague for early signs of pressure" },
  stable:               { tint: "linear-gradient(135deg, #2F6A3A 0%, #235029 100%)", label: "Team wellbeing signals are steady" },
};

function initialsFromName(n) {
  if (!n) return "?";
  const parts = n.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export default function BurnoutForecastPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get("/intelligence/burnout-forecast");
      setData(r.data);
    } catch (e) {
      setError(e?.response?.status === 403 ? "Manager+ only." : "Could not load wellbeing forecast.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="burnout-panel">
        <div className="flex items-center gap-2 text-stone-600 text-sm">
          <Loader2 size={14} className="animate-spin" /> Reading aggregate wellbeing signals…
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="burnout-panel">
        <p className="text-sm text-stone-600">{error}</p>
      </section>
    );
  }

  const banner = STATUS_BANNER[data.overall_status] || STATUS_BANNER.stable;
  const summary = data.summary || { high: 0, medium: 0, low: 0, total_staff: 0 };
  const staff = data.staff || [];

  return (
    <section
      className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
      style={{ background: banner.tint, color: "white" }}
      data-testid="burnout-panel"
    >
      <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-white/80" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                Team wellbeing &amp; burnout risk
              </span>
            </div>
            <h2 className="font-display font-semibold text-xl sm:text-2xl mt-1.5" style={{ letterSpacing: "-0.02em" }}>
              {banner.label}
            </h2>
            <p className="text-[12px] text-white/70 mt-1 max-w-2xl">
              Deterministic, evidence-linked signals across hours, sleep-ins, sickness, shift swaps and self-care
              check-ins. We surface support needs early — never label anyone as "burnt out".
            </p>
          </div>
          <div className="flex gap-1.5" data-testid="burnout-summary">
            {summary.high > 0 && <SummaryPill n={summary.high} label="Support" tone="high" testid="burnout-count-high" />}
            {summary.medium > 0 && <SummaryPill n={summary.medium} label="Watch" tone="medium" testid="burnout-count-medium" />}
            <SummaryPill n={summary.low} label="Steady" tone="low" testid="burnout-count-low" />
          </div>
        </div>

        {/* Privacy notice — always visible */}
        <div className="rounded-xl bg-white/10 backdrop-blur p-3 mb-4 flex items-start gap-2.5" data-testid="burnout-privacy-notice">
          <Lock size={14} className="text-white/80 mt-0.5 shrink-0" />
          <p className="text-[12px] text-white/85 leading-relaxed">
            <span className="font-semibold">Privacy boundary:</span> aggregate signals &amp; metadata only.
            Private reflection content is never read or shown here — only counts and mood labels.
          </p>
        </div>

        {staff.length === 0 ? (
          <div className="rounded-xl bg-white/10 backdrop-blur p-4 text-sm flex items-center gap-3" data-testid="burnout-empty">
            <Shield size={16} className="text-white/80" />
            <span className="text-white/90">No active rota signal in the last 60 days yet.</span>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {staff.map((s) => (
              <StaffCard key={s.staff_id} staff={s} onOpen={() => setOpen(s)} />
            ))}
          </div>
        )}
      </div>
      {open && <BurnoutExplanationModal staff={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function SummaryPill({ n, label, tone, testid }) {
  const styles = {
    high:   "rgba(168, 39, 58, 0.30)",
    medium: "rgba(184, 119, 47, 0.30)",
    low:    "rgba(47, 106, 58, 0.30)",
  };
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
      style={{ background: styles[tone], color: "white" }}
      data-testid={testid}
    >
      {n} {label}
    </span>
  );
}

function StaffCard({ staff, onOpen }) {
  const r = RISK[staff.risk] || RISK.low;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`burnout-staff-${staff.staff_id}`}
      className="text-left bg-white/10 hover:bg-white/15 backdrop-blur rounded-xl p-3 border-l-4 transition-colors group"
      style={{ borderLeftColor: r.line }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-semibold shrink-0"
          style={{ background: "rgba(255,255,255,0.16)", color: "white" }}
          aria-hidden
        >
          {initialsFromName(staff.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,255,255,0.18)", color: "white" }}>
              {r.label}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">{staff.role}</span>
            <span className="text-[9px] text-white/50">Score {staff.score}</span>
          </div>
          <div className="text-sm font-semibold text-white mt-1 truncate">{staff.name}</div>
          {staff.top_factors?.length > 0 ? (
            <ul className="text-[11px] text-white/75 mt-1 space-y-0.5">
              {staff.top_factors.map((f, i) => (
                <li key={i} className="truncate">• {f.label}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-white/60 mt-1">No pressure signals in the rolling windows.</p>
          )}
        </div>
        <ChevronRight size={14} className="text-white/40 group-hover:translate-x-0.5 transition-transform shrink-0 mt-1" />
      </div>
    </button>
  );
}

function BurnoutExplanationModal({ staff, onClose }) {
  const r = RISK[staff.risk] || RISK.low;
  const factors = staff.factors || [];
  const negatives = factors.filter((f) => (f.weight ?? 0) > 0);
  const mitigators = factors.filter((f) => (f.weight ?? 0) < 0);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(11, 14, 22, 0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="burnout-explanation-modal"
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b divider-soft sticky top-0 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: r.bg, color: r.fg }}>{r.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-stone-500">
                  Score {staff.score}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-stone-500">{staff.role}</span>
              </div>
              <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-1.5" style={{ letterSpacing: "-0.01em" }}>
                {staff.name}
              </h3>
              <p className="text-sm text-stone-600 mt-1">
                Why this signal was raised — every factor below comes from operational data, never private reflection content.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="burnout-explanation-close"
              className="p-1.5 rounded-md hover:bg-stone-100 text-stone-500"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0e3b4a] mb-2 flex items-center gap-1.5">
              <Info size={12} /> Why this was flagged
            </h4>
            {negatives.length === 0 ? (
              <div className="bg-stone-50 rounded-lg p-3 text-[13px] text-stone-700">
                No pressure factors crossed a threshold in the rolling windows.
              </div>
            ) : (
              <ul className="space-y-2" data-testid="burnout-factor-chain">
                {negatives.map((f, i) => (
                  <FactorRow key={i} factor={f} positive />
                ))}
              </ul>
            )}
          </div>

          {mitigators.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2F6A3A] mb-2 flex items-center gap-1.5">
                <Heart size={12} /> What's helping
              </h4>
              <ul className="space-y-2" data-testid="burnout-mitigator-chain">
                {mitigators.map((f, i) => (
                  <FactorRow key={i} factor={f} positive={false} />
                ))}
              </ul>
            </div>
          )}

          {staff.recommended_actions?.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0e3b4a] mb-2 flex items-center gap-1.5">
                <ListChecks size={12} /> Supportive actions
              </h4>
              <ul className="space-y-1.5" data-testid="burnout-recommended-actions">
                {staff.recommended_actions.map((a, i) => (
                  <li key={i} className="bg-[#0e3b4a08] border-l-4 rounded-lg p-2.5 text-[13px] text-[#0F1115] leading-relaxed"
                    style={{ borderLeftColor: "#0e3b4a" }}>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-stone-50 rounded-lg p-3 flex items-start gap-2.5">
            <Lock size={13} className="text-stone-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-stone-600 leading-relaxed">
              <span className="font-semibold">Privacy boundary:</span> only aggregate counts and operational metadata
              were used (shift hours, sleep-ins, sickness days, mood labels). The content of any private wellbeing
              reflection is never read. Use this view as a prompt for a supportive conversation — not for performance management.
            </p>
          </div>
        </div>

        <div className="p-4 border-t divider-soft bg-stone-50 flex justify-between items-center gap-2 sticky bottom-0">
          <span className="text-[10px] text-stone-500">Deterministic · evidence-linked · no AI inference</span>
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-white">Close</button>
        </div>
      </div>
    </div>
  );
}

function FactorRow({ factor, positive }) {
  const tone = positive ? "#5D6068" : "#2F6A3A";
  return (
    <li className="bg-stone-50 rounded-lg p-3 flex items-start gap-2.5">
      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5 shrink-0"
        style={{ background: positive ? "#5D606818" : "#2F6A3A18", color: tone }}>
        {factor.domain}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-[#0F1115] leading-relaxed">{factor.label}</div>
        {(factor.evidence || factor.threshold) && (
          <div className="text-[11px] text-stone-500 mt-0.5">
            {factor.evidence}{factor.evidence && factor.threshold ? " · " : ""}{factor.threshold}
          </div>
        )}
        {factor.privacy_note && (
          <div className="text-[10px] text-stone-500 mt-0.5 flex items-center gap-1">
            <Lock size={9} /> {factor.privacy_note}
          </div>
        )}
      </div>
      <span className="text-[11px] font-semibold shrink-0" style={{ color: tone }}>
        {factor.weight > 0 ? `+${factor.weight}` : `${factor.weight}`}
      </span>
    </li>
  );
}
