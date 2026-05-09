import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { API, formatApiError } from "@/lib/api";
import {
  ShieldAlert, AlertTriangle, AlertOctagon, Siren, HeartCrack, User as UserIcon,
  HeartPulse, Pill, GraduationCap, Briefcase, MessageSquare, Sparkles, Trophy,
  ClipboardCheck, NotebookPen, MessageCircle, Home, Search, Filter, Download,
  ChevronDown, ChevronRight, Loader2, X, FileDown, Clock, Activity, Hand,
} from "lucide-react";

const ICON_MAP = {
  ShieldAlert, AlertTriangle, AlertOctagon, Siren, HeartCrack, HandStop: Hand,
  HeartPulse, Pill, GraduationCap, Briefcase, MessageSquare, Sparkles, Trophy,
  ClipboardCheck, NotebookPen, MessageCircle, Home,
  User: UserIcon,
};

const SEVERITY_TONE = {
  high:   { bg: "#fdecec", fg: "#A8273A", label: "High" },
  medium: { bg: "#fdf3e1", fg: "#B8772F", label: "Medium" },
  low:    { bg: "#eef0f3", fg: "#5d6068", label: "Low" },
};

// Quick-toggle filter chips — order matters (most-used first for shifts)
const FILTER_CHIPS = [
  { id: "safeguarding", label: "Safeguarding", category: "safeguarding", safeguarding_only: true },
  { id: "missing",      label: "Missing",      category: "missing" },
  { id: "incident",     label: "Incidents",    category: "incident" },
  { id: "self_harm",    label: "Self-harm",    category: "self_harm" },
  { id: "restraint",    label: "Restraint",    category: "restraint" },
  { id: "police",       label: "Police",       tag: "police" },
  { id: "medication",   label: "Medication",   category: "medication" },
  { id: "health",       label: "Health",       category: "health" },
  { id: "key_work",     label: "Key work",     category: "key_work" },
  { id: "therapeutic",  label: "Therapeutic",  category: "therapeutic" },
  { id: "professional", label: "Professionals",category: "professional" },
  { id: "achievement",  label: "Achievements", category: "achievement" },
];

const PDF_SCOPES = [
  { id: "full",         label: "Full chronology" },
  { id: "safeguarding", label: "Safeguarding only" },
  { id: "missing",      label: "Missing-from-care" },
  { id: "incidents",    label: "Incidents" },
  { id: "police",       label: "Police involvement" },
  { id: "custom",       label: "Use current filters" },
];

function fmt(iso, opts = {}) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (opts.dateOnly) {
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }
    return d.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function relTime(iso) {
  if (!iso) return "—";
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return fmt(iso, { dateOnly: true });
  } catch { return "—"; }
}

function dayKey(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  } catch { return iso; }
}

// ----------- Pattern banner -----------
function PatternsBanner({ patterns, onDismiss }) {
  const [open, setOpen] = useState(true);
  if (!patterns?.length || !open) return null;
  const sevTone = (s) =>
    s === "high" ? { bg: "#fdecec", fg: "#A8273A", border: "#A8273A" }
    : s === "medium" ? { bg: "#fdf3e1", fg: "#B8772F", border: "#B8772F" }
    : { bg: "#eef0f3", fg: "#5d6068", border: "#8a8d95" };
  return (
    <div
      className="rounded-2xl border p-4 sm:p-5 bg-[#fdf6f6]"
      style={{ borderColor: "#A8273A33" }}
      data-testid="chronology-patterns"
    >
      <div className="flex items-start gap-2.5">
        <Activity size={18} className="text-[#A8273A] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-[14px] font-semibold text-[#0F1115]">Patterns detected</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              {patterns.length} insight{patterns.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => { setOpen(false); onDismiss?.(); }}
              className="ml-auto p-1 rounded hover:bg-stone-100 text-[#5d6068]"
              data-testid="patterns-dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {patterns.map((p) => {
              const t = sevTone(p.severity);
              return (
                <div
                  key={p.id}
                  className="rounded-lg border p-3 bg-white"
                  style={{ borderColor: t.border + "55", borderLeftWidth: 4, borderLeftColor: t.border }}
                  data-testid={`pattern-${p.id}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: t.bg, color: t.fg }}
                    >
                      {p.severity}
                    </span>
                    <span className="text-[13px] font-semibold text-[#0F1115]">{p.title}</span>
                  </div>
                  <p className="text-[12px] text-[#2f3038] leading-snug">{p.message}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------- Event card -----------
function EventCard({ ev, expanded, onToggle }) {
  const Icon = ICON_MAP[ev.category_icon] || NotebookPen;
  const colour = ev.category_colour || "#5d6068";
  const sev = SEVERITY_TONE[ev.severity] || SEVERITY_TONE.low;
  const meta = ev.metadata || {};
  return (
    <div
      className="rounded-xl border bg-white transition-all hover:shadow-sm"
      style={{ borderLeftWidth: 4, borderLeftColor: colour, borderColor: "#e8e8e3" }}
      data-testid={`chrono-event-${ev.id}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: colour + "15", color: colour }}
        >
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: colour + "15", color: colour }}
            >
              {ev.category_label}
            </span>
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: sev.bg, color: sev.fg }}
            >
              {sev.label}
            </span>
            {(ev.tags || []).filter((t) => !["incident", "note"].includes(t)).slice(0, 3).map((t) => (
              <span
                key={t}
                className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-[#5d6068]"
              >
                {t.replace("_", " ")}
              </span>
            ))}
          </div>
          <div className="text-[14px] font-semibold text-[#0F1115] leading-snug">{ev.title}</div>
          {ev.summary && (
            <p className={`text-[12.5px] text-[#2f3038] leading-snug mt-0.5 ${expanded ? "" : "line-clamp-2"}`}>
              {ev.summary}
            </p>
          )}
          <div className="text-[11px] text-[#5d6068] mt-1.5 flex items-center gap-2 flex-wrap">
            <Clock size={11} /> {relTime(ev.at)}
            <span>·</span>
            <span>{fmt(ev.at)}</span>
            {ev.actor_name && (<><span>·</span><span>{ev.actor_name}</span></>)}
          </div>
        </div>
        <ChevronDown
          size={16}
          className="shrink-0 mt-1 text-[#5d6068] transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-3 -mt-1 border-t divider-soft pt-3 space-y-2 text-[12px]">
          {meta.location && (
            <div><span className="font-semibold text-[#5d6068]">Location: </span>{meta.location}</div>
          )}
          {meta.associates?.length > 0 && (
            <div><span className="font-semibold text-[#5d6068]">Associates: </span>{meta.associates.join(", ")}</div>
          )}
          {meta.police_reference && (
            <div><span className="font-semibold text-[#5d6068]">Police ref: </span>{meta.police_reference}</div>
          )}
          {meta.exploitation_indicators?.length > 0 && (
            <div><span className="font-semibold text-[#A8273A]">Exploitation indicators: </span>{meta.exploitation_indicators.join(", ")}</div>
          )}
          {meta.frameworks?.length > 0 && (
            <div><span className="font-semibold text-[#5d6068]">Frameworks: </span>{meta.frameworks.join(", ")}</div>
          )}
          {meta.signed_off_by && (
            <div><span className="font-semibold text-[#5d6068]">Signed off: </span>{meta.signed_off_by}</div>
          )}
          {ev.source_collection === "incidents" && (
            <Link
              to={`/incidents/${ev.source_id}`}
              className="inline-flex items-center gap-1 text-[#0e3b4a] font-semibold hover:underline"
              data-testid={`chrono-link-incident-${ev.source_id}`}
            >
              Open incident <ChevronRight size={12} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main component
// ============================================================
export default function ChronologyTab({ residentId }) {
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState({});
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showPdfMenu, setShowPdfMenu] = useState(false);

  // Filters
  const [activeChips, setActiveChips] = useState(new Set()); // ids
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const params = {};
      const cats = [];
      let safeguarding_only = false;
      let policeFilter = false;
      activeChips.forEach((id) => {
        const c = FILTER_CHIPS.find((x) => x.id === id);
        if (!c) return;
        if (c.safeguarding_only) safeguarding_only = true;
        if (c.tag === "police") policeFilter = true;
        if (c.category) cats.push(c.category);
      });
      if (cats.length) params.categories = cats.join(",");
      if (safeguarding_only) params.safeguarding_only = true;
      if (search.trim()) params.q = search.trim();
      if (from) params.from_at = from;
      if (to) params.to_at = to;

      const [t, p] = await Promise.all([
        api.get(`/residents/${residentId}/timeline`, { params }),
        api.get(`/residents/${residentId}/timeline/patterns`),
      ]);
      let items = t.data?.items || [];
      if (policeFilter) items = items.filter((e) => (e.tags || []).includes("police"));
      setEvents(items);
      setCounts(t.data?.counts_by_category || {});
      setPatterns(p.data?.patterns || []);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not load chronology");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [residentId, activeChips, from, to]);

  // Search debounce
  useEffect(() => {
    const id = setTimeout(refresh, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line
  }, [search]);

  const toggleChip = (id) => {
    setActiveChips((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const clearFilters = () => {
    setActiveChips(new Set());
    setSearch("");
    setFrom("");
    setTo("");
  };
  const hasFilters = activeChips.size > 0 || search.trim() || from || to;

  const downloadPdf = async (scope) => {
    setPdfBusy(true);
    setShowPdfMenu(false);
    try {
      const params = new URLSearchParams();
      params.set("scope", scope);
      if (scope === "custom") {
        const cats = [];
        let sg = false, police = false;
        activeChips.forEach((id) => {
          const c = FILTER_CHIPS.find((x) => x.id === id);
          if (c?.category) cats.push(c.category);
          if (c?.safeguarding_only) sg = true;
          if (c?.tag === "police") police = true;
        });
        if (cats.length) params.set("categories", cats.join(","));
        if (sg) params.set("safeguarding_only", "true");
        if (police) params.set("scope", "police");  // best-fit existing scope
        if (search.trim()) params.set("q", search.trim());
        if (from) params.set("from_at", from);
        if (to) params.set("to_at", to);
      }
      const token = localStorage.getItem("cc_token");
      const res = await fetch(
        `${API}/residents/${residentId}/timeline.pdf?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `chronology-${scope}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Chronology downloaded");
    } catch (e) {
      toast.error("Could not generate PDF — senior+ required.");
    } finally {
      setPdfBusy(false);
    }
  };

  // Group events by day
  const grouped = useMemo(() => {
    const m = new Map();
    events.forEach((e) => {
      const k = dayKey(e.at);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    });
    return Array.from(m.entries());
  }, [events]);

  return (
    <div className="space-y-4" data-testid="chronology-tab">
      {/* Sticky filters */}
      <div className="rounded-2xl border divider-soft bg-white p-3 sm:p-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5d6068]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, location, police ref, associates…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border divider-soft text-[13px] focus:ring-2 focus:ring-[#0e3b4a]/20 focus:border-[#0e3b4a] outline-none"
              data-testid="chrono-search"
            />
          </div>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2.5 py-2 rounded-lg border divider-soft text-[12px] focus:ring-2 focus:ring-[#0e3b4a]/20 outline-none bg-white"
            data-testid="chrono-from"
            placeholder="From"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2.5 py-2 rounded-lg border divider-soft text-[12px] focus:ring-2 focus:ring-[#0e3b4a]/20 outline-none bg-white"
            data-testid="chrono-to"
            placeholder="To"
          />
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[12px] text-[#0e3b4a] font-semibold hover:underline px-2 py-1"
              data-testid="chrono-clear"
            >
              Clear
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPdfMenu(!showPdfMenu)}
              disabled={pdfBusy}
              className="px-3 py-2 rounded-lg bg-[#0e3b4a] text-white text-[12px] font-semibold hover:bg-[#0c2f3b] disabled:opacity-60 inline-flex items-center gap-1.5"
              data-testid="chrono-export-btn"
            >
              {pdfBusy ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
              Export
            </button>
            {showPdfMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowPdfMenu(false)} />
                <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg border divider-soft shadow-lg z-20 overflow-hidden" data-testid="chrono-export-menu">
                  {PDF_SCOPES.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => downloadPdf(sc.id)}
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-stone-50 flex items-center gap-2"
                      data-testid={`chrono-export-${sc.id}`}
                    >
                      <Download size={13} className="text-[#5d6068]" /> {sc.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <Filter size={12} className="text-[#5d6068]" />
          {FILTER_CHIPS.map((c) => {
            const isActive = activeChips.has(c.id);
            const n = c.category ? counts[c.category] : null;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleChip(c.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                  isActive
                    ? "bg-[#0e3b4a] text-white"
                    : "bg-stone-100 text-[#2f3038] hover:bg-stone-200"
                }`}
                data-testid={`chrono-chip-${c.id}`}
              >
                {c.label}{n != null ? ` · ${n}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      <PatternsBanner patterns={patterns} />

      {loading ? (
        <div className="py-12 text-center text-[13px] text-[#5d6068] inline-flex items-center justify-center gap-2 w-full">
          <Loader2 size={14} className="animate-spin" /> Loading chronology…
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border divider-soft bg-white p-10 text-center text-[13px] text-[#5d6068]" data-testid="chrono-empty">
          {hasFilters
            ? "No events match the selected filters."
            : "No events recorded yet."}
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, dayEvents]) => (
            <div key={day} data-testid="chrono-day">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5d6068] px-1 mb-2">
                {day} <span className="text-[#8a8d95]">· {dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}</span>
              </div>
              <div className="space-y-2">
                {dayEvents.map((ev) => (
                  <EventCard
                    key={ev.id}
                    ev={ev}
                    expanded={!!expanded[ev.id]}
                    onToggle={() => setExpanded((s) => ({ ...s, [ev.id]: !s[ev.id] }))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
