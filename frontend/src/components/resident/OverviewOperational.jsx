import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import {
  ShieldAlert, AlertOctagon, AlertTriangle, User as UserIcon, MessageCircle,
  MessageSquare, Pill, CalendarClock, ClipboardCheck, NotebookPen, Activity,
  Loader2, ChevronRight,
} from "lucide-react";

const ICONS = {
  ShieldAlert, AlertOctagon, AlertTriangle, MessageCircle, MessageSquare,
  Pill, CalendarClock, ClipboardCheck, NotebookPen, Activity,
  User: UserIcon,
};

const SEVERITY_TONE = {
  urgent: { bg: "#fdecec", fg: "#A8273A", border: "#A8273A", chipBg: "#A8273A", chipFg: "#fff" },
  high:   { bg: "#fdecec", fg: "#A8273A", border: "#A8273A33" },
  medium: { bg: "#fdf3e1", fg: "#B8772F", border: "#B8772F33" },
  low:    { bg: "#f0f3ee", fg: "#2F6A3A", border: "#2F6A3A33" },
};

function Widget({ w, residentId }) {
  const tone = SEVERITY_TONE[w.severity] || SEVERITY_TONE.low;
  const Icon = ICONS[w.icon] || NotebookPen;
  return (
    <Link
      to={`/residents/${residentId}?tab=${w.tab || "overview"}`}
      className="rounded-xl border bg-white p-3 sm:p-3.5 flex flex-col gap-2 hover:shadow-card-lg transition-all hover:-translate-y-px"
      style={{ borderColor: tone.border, borderLeftWidth: 4, borderLeftColor: tone.fg }}
      data-testid={`overview-widget-${w.id}`}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={13} style={{ color: tone.fg }} />
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.fg }}>
          {w.title}
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-2xl font-bold leading-none" style={{ color: tone.fg }}>
          {w.value}
        </div>
        {w.severity === "high" && (
          <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-[#A8273A] text-white">
            Action
          </span>
        )}
      </div>
      <div className="text-[11px] text-[#5d6068]">{w.sublabel}</div>
    </Link>
  );
}

function AlertRow({ a, residentId, onTabChange }) {
  const tone = SEVERITY_TONE[a.severity] || SEVERITY_TONE.high;
  const Icon = a.severity === "urgent" ? AlertOctagon : AlertTriangle;
  const handleClick = () => {
    if (a.tab && onTabChange) onTabChange(a.tab);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-2.5 transition-colors"
      style={{
        background: tone.bg,
        borderColor: tone.border,
        borderLeftWidth: 4,
        borderLeftColor: tone.fg,
      }}
      data-testid={`overview-alert-${a.id}`}
    >
      <Icon size={16} style={{ color: tone.fg }} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.fg }}>
          {a.label}
        </div>
        <div className="text-[12px] text-[#2f3038] mt-0.5">{a.sublabel}</div>
      </div>
      <ChevronRight size={14} style={{ color: tone.fg }} />
    </button>
  );
}

/**
 * Operational Overview — sector-aware "what staff need to know RIGHT NOW".
 * Replaces the previous static demographic-heavy Overview body.
 */
export default function OverviewOperational({ resident, onTabChange }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!resident?.id) return;
    let cancelled = false;
    setLoading(true);
    api.get(`/residents/${resident.id}/operational-summary`)
      .then((r) => { if (!cancelled) setSummary(r.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [resident?.id]);

  if (loading) {
    return (
      <div className="py-6 text-center text-[12px] text-[#5d6068] inline-flex items-center justify-center gap-2 w-full">
        <Loader2 size={14} className="animate-spin" /> Loading operational summary…
      </div>
    );
  }
  if (!summary) return null;

  const sector = summary.sector;
  const sectorLabel = sector === "adult" ? "Adult services" : "Children's services";
  const sectorTone = sector === "adult" ? "#3F4F8C" : "#0e3b4a";

  return (
    <div className="space-y-4" data-testid="overview-operational" data-sector={sector}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5d6068]">
            What staff need to know right now
          </div>
          <h2 className="text-[16px] font-semibold text-[#0F1115] mt-0.5">
            Operational summary
          </h2>
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded"
          style={{ background: sectorTone + "18", color: sectorTone }}
        >
          {sectorLabel}
        </span>
      </div>

      {summary.alerts?.length > 0 && (
        <div className="space-y-2">
          {summary.alerts.map((a) => (
            <AlertRow
              key={a.id}
              a={a}
              residentId={resident.id}
              onTabChange={onTabChange}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2 sm:gap-3">
        {summary.widgets.map((w) => (
          <Widget key={w.id} w={w} residentId={resident.id} />
        ))}
      </div>

      {summary.alerts?.length === 0 && summary.widgets.every((w) => w.severity === "low") && (
        <div className="rounded-xl bg-[#f0f3ee] border border-[#2F6A3A]/20 px-4 py-3 flex items-center gap-2 text-[#2F6A3A]">
          <Activity size={14} />
          <span className="text-[13px] font-medium">All operational signals are calm right now.</span>
        </div>
      )}
    </div>
  );
}
