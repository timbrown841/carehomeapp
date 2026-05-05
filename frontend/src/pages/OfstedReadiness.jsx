import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import {
  BadgeCheck,
  ShieldAlert,
  Loader2,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const TONE = {
  green: { fg: "#3A5A40", bg: "#3A5A4015", line: "#3A5A40" },
  amber: { fg: "#9C6B3D", bg: "#D4A37322", line: "#D4A373" },
  red: { fg: "#B23A48", bg: "#B23A4815", line: "#B23A48" },
};

function scoreColor(s) {
  if (s >= 90) return TONE.green;
  if (s >= 75) return TONE.green;
  if (s >= 60) return TONE.amber;
  return TONE.red;
}

function ScoreDial({ score, rating }) {
  const tone = scoreColor(score);
  const radius = 64;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative w-[180px] h-[180px] shrink-0">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle
          cx="90"
          cy="90"
          r={radius}
          stroke="#E5E5E0"
          strokeWidth="14"
          fill="none"
        />
        <circle
          cx="90"
          cy="90"
          r={radius}
          stroke={tone.line}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 90 90)"
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="font-display font-black text-5xl tracking-tighter"
          style={{ color: tone.fg }}
          data-testid="ofsted-overall-score"
        >
          {score}
        </div>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.2em] mt-1"
          style={{ color: tone.fg }}
          data-testid="ofsted-rating"
        >
          {rating?.label}
        </div>
      </div>
    </div>
  );
}

function Bar({ score }) {
  const tone = scoreColor(score);
  return (
    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
      <div
        className="h-full transition-all"
        style={{ width: `${score}%`, background: tone.line }}
      />
    </div>
  );
}

export default function OfstedReadiness() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const { data } = await api.get("/ofsted/readiness");
      setData(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-20 text-stone-500" data-testid="ofsted-page">
        <Loader2 className="animate-spin inline" /> Computing readiness…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="ofsted-page">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Ofsted Readiness
          </div>
          <h1 className="font-display font-black text-4xl tracking-tighter text-stone-900">
            Are you inspection-ready?
          </h1>
          <p className="text-stone-600 mt-1 text-sm">
            Live score across the six Ofsted-watched compliance areas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          data-testid="ofsted-refresh"
          className="inline-flex items-center gap-2 bg-white hover:bg-stone-50 text-stone-700 font-semibold rounded-xl px-4 py-2.5 text-sm border divider-soft disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          Refresh
        </button>
      </header>

      <section
        className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-6 sm:p-8 flex items-center gap-6 sm:gap-8 flex-wrap"
        style={{ borderLeftColor: scoreColor(data.overall).line }}
        data-testid="ofsted-overall"
      >
        <ScoreDial score={data.overall} rating={data.rating} />
        <div className="flex-1 min-w-[260px] space-y-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
            Overall readiness · live
          </div>
          <div className="font-display font-bold text-2xl text-stone-900 leading-tight">
            {data.rating.label === "Outstanding"
              ? "Solid — keep it up."
              : data.rating.label === "Good"
              ? "On track. A few things to tidy."
              : data.rating.label === "Requires improvement"
              ? "Focus needed — see action items below."
              : "Urgent — address the red sections immediately."}
          </div>
          <p className="text-sm text-stone-600">
            Inspectors look for <b>medication accuracy</b>, <b>up-to-date risk reviews</b>,
            <b> consistent daily notes</b>, <b>staff supervision</b>, <b>safeguarding response time</b>,
            and <b>missing-from-care handling</b>. Each section below shows what's outstanding and links you straight to the fix.
          </p>
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-4">
        {data.sections.map((s) => {
          const tone = scoreColor(s.score);
          const Icon = s.score >= 75 ? CheckCircle2 : s.score >= 60 ? ShieldAlert : AlertTriangle;
          return (
            <section
              key={s.id}
              data-testid={`ofsted-section-${s.id}`}
              className="bg-white border divider-soft rounded-2xl p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    {s.title}
                  </div>
                  <div
                    className="font-display font-black text-3xl mt-1"
                    style={{ color: tone.fg }}
                  >
                    {s.score}
                    <span className="text-stone-300 text-base font-bold"> /100</span>
                  </div>
                </div>
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  <Icon size={17} />
                </span>
              </div>
              <Bar score={s.score} />
              <div className="text-sm text-stone-600">{s.summary}</div>
              {s.items && s.items.length > 0 && (
                <ul className="text-xs text-stone-700 space-y-1 max-h-32 overflow-y-auto pr-1">
                  {s.items.slice(0, 5).map((it, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-stone-50"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                        style={{ background: tone.line }}
                      />
                      <span className="flex-1 truncate">
                        {it.label}
                        {it.due && it.due !== "Not set" && (
                          <span className="text-stone-400"> · due {it.due}</span>
                        )}
                      </span>
                    </li>
                  ))}
                  {s.items.length > 5 && (
                    <li className="text-stone-400 text-[11px] px-2">
                      +{s.items.length - 5} more
                    </li>
                  )}
                </ul>
              )}
              {s.fix_link && (
                <Link
                  to={s.fix_link}
                  data-testid={`ofsted-fix-${s.id}`}
                  className="self-start text-xs font-semibold text-[#1E4D5C] hover:underline inline-flex items-center gap-1 mt-1"
                >
                  Fix this <ChevronRight size={12} />
                </Link>
              )}
            </section>
          );
        })}
      </div>

      <div className="text-center text-[10px] uppercase tracking-wider text-stone-400 font-mono py-3">
        Safelyn Systems · Inspection-ready scorecard ·{" "}
        {new Date(data.generated_at).toLocaleString("en-GB")}
      </div>
    </div>
  );
}
