import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  ShieldAlert, Siren, Pill, GraduationCap, FileText, Users, Building2,
  HeartHandshake, ShieldCheck, MessageSquare, AlertTriangle, CheckCircle2,
  Loader2, RefreshCw, Download, ChevronRight, ClipboardCheck, CalendarClock,
  Plus, Trash2, Filter, Search, Clock3, Sparkles, ArrowRight, BadgeCheck,
} from "lucide-react";

const ICONS = {
  ShieldAlert, Siren, Pill, GraduationCap, FileText, Users, Building2,
  HeartHandshake, ShieldCheck, MessageSquare, AlertTriangle, ClipboardCheck,
  CalendarClock,
};

const TONE = {
  green: { fg: "#2F6A3A", bg: "#2F6A3A15", line: "#2F6A3A" },
  amber: { fg: "#B8772F", bg: "#B8772F18", line: "#B8772F" },
  red:   { fg: "#A8273A", bg: "#A8273A14", line: "#A8273A" },
};
function tone(s) {
  if (s >= 75) return TONE.green;
  if (s >= 60) return TONE.amber;
  return TONE.red;
}

const SEV_PILL = {
  high:   { bg: "#A8273A14", fg: "#A8273A", label: "HIGH" },
  medium: { bg: "#B8772F18", fg: "#B8772F", label: "MEDIUM" },
  low:    { bg: "#0e3b4a14", fg: "#0e3b4a", label: "LOW" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 36e5);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ---------------------------------------------------------------------------
// Score dial — overall + domain mini-dial
// ---------------------------------------------------------------------------
function ScoreDial({ score, size = 180, rating }) {
  const t = tone(score);
  const r = (size / 2) - 16;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#E8E6DF" strokeWidth="14" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={t.line} strokeWidth="14" fill="none"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 700ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-semibold text-[#0F1115]">{score}<span className="text-lg text-stone-500">%</span></div>
        {rating && (
          <div className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: t.fg }}>
            {rating.label}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain tile (one of 10)
// ---------------------------------------------------------------------------
function DomainTile({ d }) {
  const t = tone(d.score);
  const Icon = ICONS[d.icon] || ShieldCheck;
  return (
    <Link
      to={d.fix_link || "#"}
      data-testid={`domain-${d.id}`}
      className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4 hover:shadow-md transition-all"
      style={{ borderLeftColor: t.line }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 min-w-0">
            <Icon size={14} style={{ color: t.fg }} className="shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 truncate">{d.title}</span>
          </div>
          <div className="text-2xl font-semibold text-[#0F1115]">{d.score}<span className="text-sm text-stone-500">%</span></div>
          <div className="text-[11px] text-stone-600 mt-0.5 line-clamp-2">{d.summary}</div>
        </div>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
          style={{ background: t.bg, color: t.fg }}
        >
          {d.rating?.label || ""}
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Action card — used inside Critical Actions panel
// ---------------------------------------------------------------------------
function ActionRow({ a }) {
  const sev = SEV_PILL[a.severity] || SEV_PILL.low;
  const Icon = ICONS[a.icon] || AlertTriangle;
  return (
    <Link
      to={a.fix_link || "#"}
      data-testid={`action-${a.id}`}
      className="flex items-start gap-3 p-3 rounded-lg hover:bg-stone-50 border-l-4"
      style={{ borderLeftColor: sev.fg }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: sev.bg }}>
        <Icon size={15} style={{ color: sev.fg }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: sev.bg, color: sev.fg }}>
            {sev.label}
          </span>
          <span className="text-sm font-semibold text-[#0F1115] truncate">{a.title}</span>
        </div>
        <div className="text-xs text-stone-600 truncate">{a.subtitle}</div>
        {a.raised_at && <div className="text-[10px] text-stone-500 mt-0.5">{timeAgo(a.raised_at)}</div>}
      </div>
      <ChevronRight size={16} className="text-stone-400 mt-1.5 shrink-0" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Action plan — manager notes / inspection prep
// ---------------------------------------------------------------------------
function ActionPlanPanel({ tier }) {
  const isManager = tier >= 3;
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("active");
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ title: "", detail: "", priority: "medium", due_date: "" });

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get("/inspection-actions");
      setItems(r.data || []);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const active = items.filter((i) => i.status !== "resolved");
  const resolved = items.filter((i) => i.status === "resolved");
  const list = tab === "active" ? active : resolved;

  const save = async () => {
    if (!draft.title.trim()) return;
    try {
      await api.post("/inspection-actions", {
        ...draft, due_date: draft.due_date || null,
      });
      toast.success("Action added");
      setShowNew(false);
      setDraft({ title: "", detail: "", priority: "medium", due_date: "" });
      refresh();
    } catch (e) { toast.error("Couldn't add"); }
  };

  const resolve = async (id) => {
    try {
      await api.patch(`/inspection-actions/${id}`, { status: "resolved" });
      toast.success("Marked as resolved");
      refresh();
    } catch { toast.error("Couldn't update"); }
  };
  const reopen = async (id) => {
    try {
      await api.patch(`/inspection-actions/${id}`, { status: "open" });
      refresh();
    } catch {}
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this action?")) return;
    try {
      await api.delete(`/inspection-actions/${id}`);
      refresh();
    } catch { toast.error("Couldn't delete (manager only)."); }
  };

  return (
    <div className="bg-white border divider-soft rounded-2xl p-5" data-testid="action-plan-panel">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold text-[#0F1115] flex items-center gap-2">
          <ClipboardCheck size={16} /> Manager action plan
        </h3>
        {isManager && (
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            data-testid="action-plan-new-btn"
            className="text-xs font-semibold bg-[#0e3b4a] text-white px-3 py-1.5 rounded-lg hover:bg-[#0a2e3a] flex items-center gap-1"
          >
            <Plus size={12} /> Add action
          </button>
        )}
      </div>
      {showNew && (
        <div className="border divider-soft rounded-xl p-3 mb-3 bg-stone-50 space-y-2" data-testid="action-plan-new-form">
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Action title…"
            className="w-full text-sm border divider-soft rounded-lg p-2 bg-white"
            data-testid="action-plan-new-title"
          />
          <textarea
            value={draft.detail}
            onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
            placeholder="Detail (optional)…"
            rows={2}
            className="w-full text-sm border divider-soft rounded-lg p-2 bg-white resize-none"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
              className="text-sm border divider-soft rounded-lg p-2 bg-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <input
              type="date"
              value={draft.due_date}
              onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
              className="text-sm border divider-soft rounded-lg p-2 bg-white"
            />
            <button onClick={save} data-testid="action-plan-save" className="text-sm font-semibold bg-[#0e3b4a] text-white px-3 py-2 rounded-lg">
              Save
            </button>
            <button onClick={() => setShowNew(false)} className="text-sm px-3 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
          </div>
        </div>
      )}
      <div className="flex gap-2 mb-3 border-b divider-soft">
        <button onClick={() => setTab("active")} data-testid="action-tab-active"
          className={`text-xs font-semibold px-3 py-2 border-b-2 ${tab === "active" ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-600"}`}>
          Active ({active.length})
        </button>
        <button onClick={() => setTab("resolved")} data-testid="action-tab-resolved"
          className={`text-xs font-semibold px-3 py-2 border-b-2 ${tab === "resolved" ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-600"}`}>
          Resolved this week ({resolved.length})
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-stone-600 py-6 text-center">
          {tab === "active" ? "No active actions. Add one as you prepare for inspection." : "Nothing resolved recently."}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => {
            const sev = SEV_PILL[a.priority] || SEV_PILL.low;
            return (
              <li key={a.id} className="border-l-4 rounded-lg bg-stone-50 p-3 flex items-start gap-3" style={{ borderLeftColor: sev.fg }} data-testid={`action-plan-item-${a.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: sev.bg, color: sev.fg }}>
                      {sev.label}
                    </span>
                    <span className="text-sm font-semibold text-[#0F1115]">{a.title}</span>
                    {a.due_date && <span className="text-[10px] text-stone-500">due {a.due_date}</span>}
                  </div>
                  {a.detail && <p className="text-xs text-stone-700 mt-1 whitespace-pre-wrap">{a.detail}</p>}
                  {a.status === "resolved" && (
                    <div className="text-[10px] text-stone-500 mt-1">
                      Resolved by {a.resolved_by_name} · {timeAgo(a.resolved_at)}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {a.status !== "resolved" ? (
                    <button onClick={() => resolve(a.id)} data-testid={`action-plan-resolve-${a.id}`} title="Mark resolved"
                      className="p-1.5 rounded-md hover:bg-white text-[#2F6A3A]">
                      <CheckCircle2 size={15} />
                    </button>
                  ) : (
                    <button onClick={() => reopen(a.id)} data-testid={`action-plan-reopen-${a.id}`} title="Reopen"
                      className="p-1.5 rounded-md hover:bg-white text-stone-600">
                      <RefreshCw size={14} />
                    </button>
                  )}
                  {isManager && (
                    <button onClick={() => remove(a.id)} data-testid={`action-plan-delete-${a.id}`} title="Delete"
                      className="p-1.5 rounded-md hover:bg-[#A8273A]/10 text-stone-500 hover:text-[#A8273A]">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN PAGE
// ---------------------------------------------------------------------------
export default function OfstedReadiness() {
  const { tier } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterSev, setFilterSev] = useState("all");  // all|high|medium
  const [filterDomain, setFilterDomain] = useState("all");
  const [q, setQ] = useState("");
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/ofsted/command-centre");
      setData(r.data);
    } catch (e) {
      toast.error("Couldn't load command centre");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filteredActions = useMemo(() => {
    if (!data) return [];
    return data.critical_actions.filter((a) => {
      if (filterSev !== "all" && a.severity !== filterSev) return false;
      if (filterDomain !== "all" && a.domain !== filterDomain) return false;
      if (q && !`${a.title} ${a.subtitle}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [data, filterSev, filterDomain, q]);

  const downloadBundle = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("cc_token");
      const res = await fetch(`${API}/ofsted/inspection-bundle/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ofsted-inspection-bundle.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Couldn't download bundle (manager only)"); }
    finally { setDownloading(false); }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 text-stone-600 py-12 justify-center">
        <Loader2 size={18} className="animate-spin" /> Loading inspection command centre…
      </div>
    );
  }

  const t = tone(data.overall);
  const sg = data.safeguarding_overview;

  return (
    <div className="space-y-6" data-testid="ofsted-readiness-page">
      {/* ---------- 1. HEADER + OVERALL SCORE ---------- */}
      <header
        className="rounded-2xl p-5 sm:p-7 text-white"
        style={{ background: "linear-gradient(135deg, #0F2F3A 0%, #0e3b4a 60%, #1B4D5F 100%)" }}
      >
        <div className="flex flex-wrap items-start gap-2 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full bg-white/10 text-white/90 backdrop-blur">
            Ofsted regulated · children's services
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full bg-white/10 text-white/90 backdrop-blur">
            {data.children_count} children
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-6 lg:gap-10">
          <ScoreDial score={data.overall} size={200} rating={data.rating} />
          <div className="flex-1 min-w-[240px]">
            <h1 className="font-display font-semibold text-3xl sm:text-4xl leading-tight" style={{ letterSpacing: "-0.02em" }}>
              Inspection command centre
            </h1>
            <p className="text-sm text-white/80 mt-2 max-w-xl">
              "If Ofsted walked in right now — what are we exposed on?" Everything that matters,
              prioritised. Live data refreshed each visit.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={load}
                data-testid="ofsted-refresh"
                className="text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-2 rounded-lg flex items-center gap-1.5 backdrop-blur"
              >
                <RefreshCw size={13} /> Refresh
              </button>
              {tier >= 3 && (
                <button
                  type="button"
                  onClick={downloadBundle}
                  disabled={downloading}
                  data-testid="ofsted-download-bundle"
                  className="text-xs font-semibold bg-white text-[#0e3b4a] hover:bg-stone-100 px-3 py-2 rounded-lg flex items-center gap-1.5"
                >
                  {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Inspection bundle PDF
                </button>
              )}
              <span className="text-[10px] uppercase tracking-wider text-white/60 font-semibold self-center">
                · last updated {timeAgo(data.generated_at)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ---------- 1b. 10 DOMAIN TILES ---------- */}
      <section data-testid="ofsted-domains">
        <h2 className="text-base font-semibold text-[#0F1115] mb-3">Readiness by domain</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {data.domains.map((d) => <DomainTile key={d.id} d={d} />)}
        </div>
      </section>

      {/* ---------- 2. SAFEGUARDING OVERVIEW + PATTERNS ---------- */}
      <section className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5" style={{ borderLeftColor: "#A8273A" }} data-testid="safeguarding-overview">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert size={18} className="text-[#A8273A]" />
          <h2 className="text-base font-semibold text-[#0F1115]">Live safeguarding intelligence</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Open safeguarding", value: sg.open_safeguarding, sub: `${sg.open_over_48h} >48h` },
            { label: "Currently missing", value: sg.currently_missing, sub: `${sg.ri_outstanding} RIs outstanding` },
            { label: "Restraints (30d)", value: sg.restraint_30d, sub: "behaviour management" },
            { label: "Self-harm (30d)", value: sg.self_harm_30d, sub: `${sg.police_30d} police involvement` },
          ].map((m) => (
            <div key={m.label} className="bg-stone-50 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-stone-600">{m.label}</div>
              <div className="text-2xl font-semibold text-[#0F1115] mt-0.5">{m.value}</div>
              <div className="text-[11px] text-stone-600">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Pattern alerts */}
        {sg.pattern_alerts.length > 0 && (
          <div className="space-y-2 mb-4" data-testid="pattern-alerts">
            {sg.pattern_alerts.map((p) => {
              const s = SEV_PILL[p.severity] || SEV_PILL.medium;
              return (
                <div key={p.id} className="border-l-4 rounded-lg p-3" style={{ borderLeftColor: s.fg, background: s.bg }}>
                  <div className="flex items-start gap-2">
                    <Sparkles size={14} style={{ color: s.fg }} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-[#0F1115]">{p.title}</div>
                      <div className="text-xs text-stone-700">{p.message}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent escalations */}
        {sg.recent_escalations.length > 0 && (
          <div data-testid="recent-escalations">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Recent escalations · 7 days</h3>
            <ul className="space-y-1.5">
              {sg.recent_escalations.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-sm">
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mt-0.5" style={{ background: SEV_PILL.high.bg, color: SEV_PILL.high.fg }}>
                    {e.severity || "high"}
                  </span>
                  <Link to={`/incidents/${e.id}`} className="flex-1 hover:underline">
                    <span className="font-medium">{e.resident_name}</span>
                    <span className="text-stone-500"> · {e.category || "incident"} · {timeAgo(e.created_at)}</span>
                    {e.summary && <span className="text-stone-700"> — {e.summary.slice(0, 90)}{e.summary.length > 90 ? "…" : ""}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- 3. CRITICAL ACTIONS PANEL ---------- */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="critical-actions">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-base font-semibold text-[#0F1115] flex items-center gap-2">
              <AlertTriangle size={16} className="text-[#A8273A]" />
              What needs fixing — right now
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              {data.critical_actions_count} live items. Sorted high → medium → low.
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mb-3">
          <div className="flex items-center gap-1 text-xs text-stone-600">
            <Filter size={12} />
          </div>
          {["all", "high", "medium", "low"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterSev(s)}
              data-testid={`filter-sev-${s}`}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                filterSev === s ? "border-[#0e3b4a] bg-[#0e3b4a] text-white" : "border-stone-300 text-stone-700 hover:border-stone-400"
              }`}
            >
              {s === "all" ? "All severities" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <select
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value)}
            data-testid="filter-domain"
            className="text-xs border divider-soft rounded-full px-3 py-1 bg-white"
          >
            <option value="all">All domains</option>
            {data.domains.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <div className="flex items-center gap-1 border divider-soft rounded-full px-2.5 py-1 bg-white flex-1 min-w-[180px] max-w-xs">
            <Search size={12} className="text-stone-500" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search actions…"
              data-testid="filter-q"
              className="text-xs outline-none flex-1 bg-transparent"
            />
          </div>
        </div>
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
          {filteredActions.length === 0 ? (
            <p className="text-sm text-stone-600 py-6 text-center">
              {data.critical_actions_count === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[#2F6A3A]">
                  <BadgeCheck size={14} /> All clear — no critical actions outstanding.
                </span>
              ) : "No actions match the current filters."}
            </p>
          ) : (
            filteredActions.map((a) => <ActionRow key={a.id} a={a} />)
          )}
        </div>
      </section>

      {/* ---------- 4. RESIDENTS REQUIRING ATTENTION ---------- */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="residents-attention">
        <h2 className="text-base font-semibold text-[#0F1115] flex items-center gap-2 mb-3">
          <Users size={16} /> Children requiring attention
        </h2>
        {data.residents_attention.length === 0 ? (
          <p className="text-sm text-stone-600">No specific concerns flagged for any child right now.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {data.residents_attention.map((r) => {
              const sev = SEV_PILL[r.max_severity] || SEV_PILL.low;
              return (
                <li key={r.resident_id} className="border-l-4 rounded-xl p-3 bg-stone-50" style={{ borderLeftColor: sev.fg }} data-testid={`attention-${r.resident_id}`}>
                  <div className="flex items-center justify-between mb-1">
                    <Link to={`/residents/${r.resident_id}`} className="text-sm font-semibold text-[#0F1115] hover:underline">
                      {r.name}
                    </Link>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: sev.bg, color: sev.fg }}>
                      {sev.label}
                    </span>
                  </div>
                  <ul className="text-xs text-stone-700 space-y-0.5">
                    {r.reasons.slice(0, 4).map((rs, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <ArrowRight size={10} className="mt-0.5 shrink-0 text-stone-400" /> {rs.text}
                      </li>
                    ))}
                    {r.reasons.length > 4 && (
                      <li className="text-stone-500">+ {r.reasons.length - 4} more</li>
                    )}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- 5. ACTION PLAN ---------- */}
      <ActionPlanPanel tier={tier} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard tile — managers see "Inspection Readiness" summary on Dashboard
// ---------------------------------------------------------------------------
export function OfstedReadinessDashboardTile() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    api.get("/ofsted/command-centre").then((r) => setD(r.data)).catch(() => setErr(true));
  }, []);
  if (err) return null;
  if (!d) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-5 animate-pulse">
        <div className="h-4 w-32 bg-stone-200 rounded mb-3" />
        <div className="h-12 w-24 bg-stone-200 rounded" />
      </div>
    );
  }
  const t = tone(d.overall);
  const crit = (d.critical_actions || []).filter((a) => a.severity === "high").length;
  return (
    <Link
      to="/ofsted"
      data-testid="dashboard-ofsted-tile"
      className="block bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5 hover:shadow-md transition-all"
      style={{ borderLeftColor: t.line }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
          Ofsted readiness
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: t.bg, color: t.fg }}>
          {d.rating?.label}
        </span>
      </div>
      <div className="text-4xl font-semibold text-[#0F1115]">{d.overall}<span className="text-lg text-stone-500">%</span></div>
      <div className="text-xs text-stone-600 mt-1">
        {crit > 0 ? (
          <span className="text-[#A8273A] font-semibold">{crit} HIGH-priority action{crit === 1 ? "" : "s"}</span>
        ) : (
          <span className="text-[#2F6A3A]">No high-priority actions</span>
        )}
        {" "}· {d.critical_actions_count} total
      </div>
      <div className="text-[10px] text-stone-500 mt-2 flex items-center gap-1">
        Open command centre <ChevronRight size={11} />
      </div>
    </Link>
  );
}
