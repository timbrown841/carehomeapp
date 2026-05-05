import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import {
  Pill,
  ShieldAlert,
  AlertOctagon,
  ClipboardCheck,
  Siren,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

const SECTION_META = {
  medication: { icon: Pill, link: "/medications", color: "#1E4D5C" },
  risk_reviews: { icon: ShieldAlert, link: "/residents", color: "#9C6B3D" },
  daily_notes: { icon: ClipboardCheck, link: "/notes", color: "#1E4D5C" },
  supervisions: { icon: ClipboardCheck, link: "/supervisions", color: "#9C6B3D" },
  safeguarding: { icon: AlertOctagon, link: "/incidents", color: "#B23A48" },
  missing: { icon: Siren, link: "/residents", color: "#B23A48" },
};

function toneFromScore(s) {
  if (s >= 90) return { label: "Outstanding", fg: "#3A5A40", bg: "#3A5A4012" };
  if (s >= 75) return { label: "Good", fg: "#3A5A40", bg: "#3A5A4012" };
  if (s >= 60) return { label: "Requires improvement", fg: "#9C6B3D", bg: "#D4A37322" };
  return { label: "Inadequate", fg: "#B23A48", bg: "#B23A4815" };
}

export default function AttentionNow() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .get("/ofsted/readiness")
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div
        className="bg-white border divider-soft rounded-2xl p-5 text-stone-500 text-sm flex items-center gap-2"
        data-testid="attention-card-loading"
      >
        <Loader2 size={14} className="animate-spin" /> Computing what needs your attention…
      </div>
    );
  if (!data) return null;

  const tone = toneFromScore(data.overall);

  // Top 3 sections by lowest score (most attention needed)
  const focus = [...data.sections]
    .filter((s) => s.score < 100)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const allClear = focus.length === 0;

  return (
    <section
      className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl overflow-hidden"
      style={{ borderLeftColor: tone.fg }}
      data-testid="attention-now-card"
    >
      <div className="px-5 py-4 sm:px-6 sm:py-5 flex items-start gap-4 flex-wrap">
        <div
          className="px-3 py-2 rounded-xl flex items-center gap-2 shrink-0"
          style={{ background: tone.bg, color: tone.fg }}
        >
          <Sparkles size={14} />
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.2em]">
              Attention now
            </div>
            <div
              className="font-display font-black text-xl leading-none tabular-nums"
              data-testid="attention-overall-score"
            >
              {data.overall}
              <span className="text-xs font-bold ml-0.5">/100</span>
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-[200px] flex items-center flex-wrap gap-2">
          {allClear ? (
            <div className="flex items-center gap-2 text-sm text-[#3A5A40] font-semibold">
              <CheckCircle2 size={16} /> All compliance areas at 100% — nothing needs your attention right now.
            </div>
          ) : (
            focus.map((s) => {
              const meta = SECTION_META[s.id] || { icon: AlertOctagon, link: "/", color: "#9C6B3D" };
              const Icon = meta.icon;
              return (
                <Link
                  key={s.id}
                  to={meta.link}
                  data-testid={`attention-pill-${s.id}`}
                  className="group inline-flex items-center gap-2 bg-stone-50 hover:bg-white border divider-soft rounded-xl pl-2.5 pr-3 py-1.5 text-xs transition-colors"
                >
                  <span
                    className="w-6 h-6 rounded-md flex items-center justify-center"
                    style={{ background: meta.color + "15", color: meta.color }}
                  >
                    <Icon size={12} />
                  </span>
                  <span className="text-stone-900 font-semibold">{s.title}</span>
                  <span className="text-stone-500">·</span>
                  <span className="font-mono tabular-nums" style={{ color: meta.color }}>
                    {s.summary}
                  </span>
                  <ArrowRight
                    size={11}
                    className="text-stone-400 group-hover:text-stone-700 group-hover:translate-x-0.5 transition-all"
                  />
                </Link>
              );
            })
          )}
        </div>
        <Link
          to="/ofsted"
          data-testid="attention-view-all"
          className="text-xs font-bold uppercase tracking-wider text-[#1E4D5C] hover:underline shrink-0 inline-flex items-center gap-1 self-center"
        >
          Full scorecard <ArrowRight size={12} />
        </Link>
      </div>
    </section>
  );
}
