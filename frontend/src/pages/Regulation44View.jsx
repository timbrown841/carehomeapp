import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Building2, ShieldAlert, Heart, FileText, Sparkles, GraduationCap, Users, ShieldCheck,
  Loader2, ChevronRight, ChevronDown, Search, Filter, AlertTriangle, BadgeCheck,
  BookOpen, Pencil, Plus, Save, X, ClipboardCheck, BarChart3, Clock3,
} from "lucide-react";

const CATEGORY_ICONS = {
  environment: Building2,
  safeguarding: ShieldAlert,
  health: Heart,
  records: FileText,
  practice: Sparkles,
  education: GraduationCap,
  workforce: Users,
  governance: ShieldCheck,
};

const RAG_TONE = {
  green: { bg: "#2F6A3A14", line: "#2F6A3A", fg: "#2F6A3A", label: "GREEN" },
  amber: { bg: "#B8772F18", line: "#B8772F", fg: "#B8772F", label: "AMBER" },
  red:   { bg: "#A8273A14", line: "#A8273A", fg: "#A8273A", label: "RED" },
};

const INDICATOR_TONE = {
  green: { bg: "#2F6A3A12", fg: "#2F6A3A" },
  amber: { bg: "#B8772F14", fg: "#B8772F" },
  red:   { bg: "#A8273A12", fg: "#A8273A" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 36e5);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Manual evidence note editor
// ---------------------------------------------------------------------------
function ManualNoteEditor({ moduleId, existingNote, onSaved, onCancel }) {
  const [text, setText] = useState(existingNote || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post("/ofsted/regulation-44/notes", { module_id: moduleId, note: text });
      toast.success("Evidence note saved");
      onSaved?.();
    } catch { toast.error("Couldn't save (manager+ only)"); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-stone-50 border divider-soft rounded-xl p-3 space-y-2" data-testid={`note-editor-${moduleId}`}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={4000}
        placeholder="Add manager evidence, sample observations, or audit findings…"
        className="w-full text-sm border divider-soft rounded-lg p-2.5 bg-white resize-y focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]/20"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-sm px-3 py-1.5 rounded-lg hover:bg-stone-100">Cancel</button>
        <button onClick={save} disabled={busy} data-testid={`note-save-${moduleId}`}
          className="text-sm font-semibold bg-[#0e3b4a] text-white px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save evidence
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single module card (expandable)
// ---------------------------------------------------------------------------
function ModuleCard({ m, tier, onNoteSaved }) {
  const [open, setOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const rag = RAG_TONE[m.rag] || RAG_TONE.amber;
  const isManager = tier >= 3;

  return (
    <div
      className="bg-white border-l-4 border-y border-r divider-soft rounded-xl overflow-hidden"
      style={{ borderLeftColor: rag.line }}
      data-testid={`reg44-module-${m.id}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`reg44-module-toggle-${m.id}`}
        className="w-full text-left p-3.5 hover:bg-stone-50 flex items-start gap-3"
      >
        <div className="text-[10px] font-bold uppercase tracking-wider w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: rag.bg, color: rag.fg }}>
          {m.n}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-[#0F1115]">{m.title}</span>
            {m.mode === "manual" && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-200 text-stone-700">
                MANUAL
              </span>
            )}
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
              style={{ background: rag.bg, color: rag.fg }}>
              {m.rag.toUpperCase()} · {m.score}%
            </span>
            {m.quality_standards?.map((qs) => (
              <span key={qs} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-stone-300 text-stone-600">
                {qs}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {(m.indicators || []).slice(0, 4).map((ind, idx) => {
              const t = INDICATOR_TONE[ind.tone] || INDICATOR_TONE.green;
              return (
                <span key={idx} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: t.bg, color: t.fg }}>
                  {ind.label}: {ind.value}
                </span>
              );
            })}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-stone-400 mt-1 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t divider-soft p-4 space-y-3 bg-stone-50/50" data-testid={`reg44-module-body-${m.id}`}>
          {/* Regulation refs */}
          <div className="flex flex-wrap gap-1.5">
            {m.regulation_refs?.map((r, idx) => (
              <span key={idx} className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#0e3b4a]/8 text-[#0e3b4a]">
                {r}
              </span>
            ))}
          </div>

          {/* Pattern alerts */}
          {m.pattern_alerts?.length > 0 && (
            <div className="space-y-1.5">
              {m.pattern_alerts.map((p, idx) => {
                const t = RAG_TONE[p.severity === "high" ? "red" : "amber"];
                return (
                  <div key={idx} className="border-l-4 rounded-lg p-2.5"
                    style={{ borderLeftColor: t.line, background: t.bg }}>
                    <div className="flex items-start gap-2">
                      <Sparkles size={13} style={{ color: t.fg }} className="mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-[#0F1115]">{p.title}</div>
                        <div className="text-[11px] text-stone-700">{p.message}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Overdue actions */}
          {m.overdue_actions?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                Outstanding actions ({m.overdue_actions.length})
              </h4>
              <ul className="space-y-1">
                {m.overdue_actions.slice(0, 6).map((a, idx) => (
                  <li key={idx}>
                    <Link to={a.link || "#"} className="flex items-start gap-2 p-2 rounded-md hover:bg-white text-xs">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0 text-[#A8273A]" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[#0F1115]">{a.title}</div>
                        {a.subtitle && <div className="text-stone-600 text-[11px]">{a.subtitle}</div>}
                      </div>
                      <ChevronRight size={11} className="text-stone-400 mt-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Manual evidence note */}
          {m.mode === "manual" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-stone-600">
                  Manager evidence
                </h4>
                {isManager && !editingNote && (
                  <button onClick={() => setEditingNote(true)} data-testid={`note-add-${m.id}`}
                    className="text-[11px] font-semibold text-[#0e3b4a] hover:underline flex items-center gap-1">
                    {m.manual_note ? <><Pencil size={10} /> Update</> : <><Plus size={10} /> Add</>}
                  </button>
                )}
              </div>
              {editingNote ? (
                <ManualNoteEditor
                  moduleId={m.id}
                  existingNote={m.manual_note}
                  onSaved={() => { setEditingNote(false); onNoteSaved?.(); }}
                  onCancel={() => setEditingNote(false)}
                />
              ) : m.manual_note ? (
                <div className="bg-white border divider-soft rounded-lg p-2.5">
                  <p className="text-xs text-stone-800 whitespace-pre-wrap">{m.manual_note}</p>
                  <div className="text-[10px] text-stone-500 mt-1.5">
                    {m.manual_note_by} · {timeAgo(m.manual_note_at)}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-stone-500 italic">
                  No evidence logged. {isManager ? "Click Add to record findings." : "Manager-only entry."}
                </p>
              )}
            </div>
          )}

          {/* Evidence sources */}
          {m.evidence_sources?.length > 0 && (
            <div className="text-[10px] text-stone-500">
              <span className="font-bold uppercase tracking-wider">Live evidence:</span>{" "}
              {m.evidence_sources.join(" · ")}
            </div>
          )}

          {m.fix_link && (
            <Link to={m.fix_link} data-testid={`reg44-open-${m.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0e3b4a] hover:underline">
              Open operational area <ChevronRight size={11} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category accordion
// ---------------------------------------------------------------------------
function CategoryAccordion({ cat, tier, defaultOpen, onNoteSaved, q, ragFilter }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = CATEGORY_ICONS[cat.id] || ShieldCheck;
  const rag = RAG_TONE[cat.rag] || RAG_TONE.amber;

  const filtered = useMemo(() => {
    return cat.modules.filter((m) => {
      if (ragFilter !== "all" && m.rag !== ragFilter) return false;
      if (q && !`${m.title} ${m.regulation_refs?.join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [cat.modules, q, ragFilter]);

  if (filtered.length === 0 && (q || ragFilter !== "all")) return null;

  return (
    <div className="bg-white border divider-soft rounded-2xl overflow-hidden" data-testid={`reg44-cat-${cat.id}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`reg44-cat-toggle-${cat.id}`}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-stone-50"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: rag.bg }}>
          <Icon size={18} style={{ color: rag.fg }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-[#0F1115]">{cat.title}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: rag.bg, color: rag.fg }}>
              {cat.rating.label} · {cat.avg_score}%
            </span>
          </div>
          <div className="text-xs text-stone-600 mt-0.5">
            {cat.module_count} module{cat.module_count === 1 ? "" : "s"}
            {cat.red_count > 0 && <span className="text-[#A8273A] font-semibold"> · {cat.red_count} red</span>}
            {cat.amber_count > 0 && <span className="text-[#B8772F] font-semibold"> · {cat.amber_count} amber</span>}
          </div>
        </div>
        <ChevronDown size={18} className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-3 pt-0 space-y-2" data-testid={`reg44-cat-body-${cat.id}`}>
          {filtered.map((m) => (
            <ModuleCard key={m.id} m={m} tier={tier} onNoteSaved={onNoteSaved} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regulation 44 visit summary editor
// ---------------------------------------------------------------------------
function VisitSummaryPanel({ tier, latest, onSaved }) {
  const isManager = tier >= 3;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    visit_date: latest?.visit_date || new Date().toISOString().slice(0, 10),
    visitor_name: latest?.visitor_name || "",
    overall_judgement: latest?.overall_judgement || "good",
    strengths: latest?.strengths || "",
    areas_for_development: latest?.areas_for_development || "",
    immediate_concerns: latest?.immediate_concerns || "",
    progress_since_last: latest?.progress_since_last || "",
    recommendations: latest?.recommendations || "",
    manager_comments: latest?.manager_comments || "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft({
        visit_date: latest?.visit_date || new Date().toISOString().slice(0, 10),
        visitor_name: latest?.visitor_name || "",
        overall_judgement: latest?.overall_judgement || "good",
        strengths: latest?.strengths || "",
        areas_for_development: latest?.areas_for_development || "",
        immediate_concerns: latest?.immediate_concerns || "",
        progress_since_last: latest?.progress_since_last || "",
        recommendations: latest?.recommendations || "",
        manager_comments: latest?.manager_comments || "",
      });
    }
  }, [latest, editing]);

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/ofsted/regulation-44/visits", draft);
      toast.success("Reg 44 visit summary saved");
      setEditing(false);
      onSaved?.();
    } catch { toast.error("Couldn't save (manager+)"); }
    finally { setBusy(false); }
  };

  const judgementColor = {
    outstanding: "#2F6A3A",
    good: "#0e3b4a",
    requires_improvement: "#B8772F",
    inadequate: "#A8273A",
  }[draft.overall_judgement] || "#0e3b4a";

  const sections = [
    { id: "strengths", label: "Strengths of the home", placeholder: "What is the home doing well?" },
    { id: "areas_for_development", label: "Areas for development", placeholder: "What needs to improve?" },
    { id: "immediate_concerns", label: "Immediate safeguarding concerns", placeholder: "Any urgent issues raised on this visit?" },
    { id: "progress_since_last", label: "Progress since last visit", placeholder: "Completed actions, improvements observed…" },
    { id: "recommendations", label: "Regulation 44 recommendations", placeholder: "Recommendations for the Registered Manager &amp; Provider…" },
    { id: "manager_comments", label: "Manager comments", placeholder: "Manager's response, agreed actions, timeframes…" },
  ];

  return (
    <div className="bg-white border divider-soft rounded-2xl p-5" data-testid="reg44-visit-summary">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="font-semibold text-[#0F1115] flex items-center gap-2">
            <ClipboardCheck size={16} /> Regulation 44 visit summary
          </h3>
          <p className="text-xs text-stone-600 mt-0.5">
            Independent visitor's monthly report — strengths, development, recommendations.
          </p>
        </div>
        {!editing && isManager && (
          <button onClick={() => setEditing(true)} data-testid="reg44-visit-edit"
            className="text-xs font-semibold bg-[#0e3b4a] text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
            {latest ? <><Pencil size={11} /> New visit</> : <><Plus size={11} /> Log visit</>}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">Visit date</label>
              <input type="date" value={draft.visit_date}
                onChange={(e) => setDraft({ ...draft, visit_date: e.target.value })}
                data-testid="reg44-visit-date"
                className="w-full text-sm border divider-soft rounded-lg p-2 bg-white" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">Independent visitor</label>
              <input type="text" value={draft.visitor_name}
                onChange={(e) => setDraft({ ...draft, visitor_name: e.target.value })}
                placeholder="Name"
                data-testid="reg44-visitor-name"
                className="w-full text-sm border divider-soft rounded-lg p-2 bg-white" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">Overall judgement</label>
              <select value={draft.overall_judgement}
                onChange={(e) => setDraft({ ...draft, overall_judgement: e.target.value })}
                data-testid="reg44-judgement"
                className="w-full text-sm border divider-soft rounded-lg p-2 bg-white">
                <option value="outstanding">Outstanding</option>
                <option value="good">Good</option>
                <option value="requires_improvement">Requires improvement</option>
                <option value="inadequate">Inadequate</option>
              </select>
            </div>
          </div>
          {sections.map((s) => (
            <div key={s.id}>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">{s.label}</label>
              <textarea
                value={draft[s.id]}
                onChange={(e) => setDraft({ ...draft, [s.id]: e.target.value })}
                rows={3}
                placeholder={s.placeholder}
                data-testid={`reg44-${s.id}`}
                className="w-full text-sm border divider-soft rounded-lg p-2 bg-white resize-y"
              />
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="text-sm px-3 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
            <button onClick={save} disabled={busy} data-testid="reg44-visit-save"
              className="text-sm font-semibold bg-[#0e3b4a] text-white px-3 py-2 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save visit
            </button>
          </div>
        </div>
      ) : latest ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-600">Last visit</div>
              <div className="text-sm font-semibold">{latest.visit_date} · {latest.visitor_name}</div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full text-white"
              style={{ background: judgementColor }}>
              {(latest.overall_judgement || "good").replace("_", " ")}
            </span>
          </div>
          {sections.map((s) => latest[s.id] && (
            <div key={s.id}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-0.5">{s.label}</div>
              <p className="text-sm text-stone-800 whitespace-pre-wrap">{latest[s.id]}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-600">
          No Regulation 44 visits logged yet.{isManager ? " Click \"Log visit\" to record the first one." : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN — Regulation 44 view (default-exported as section, mounted inside OfstedReadiness)
// ---------------------------------------------------------------------------
export default function Regulation44View() {
  const { tier } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [ragFilter, setRagFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/ofsted/regulation-44");
      setData(r.data);
    } catch { toast.error("Couldn't load Regulation 44 data"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 text-stone-600 py-12 justify-center">
        <Loader2 size={18} className="animate-spin" /> Loading Regulation 44 modules…
      </div>
    );
  }

  const overallRag = RAG_TONE[data.rating?.tone === "green" ? "green" : data.rating?.tone === "amber" ? "amber" : "red"];

  return (
    <div className="space-y-5" data-testid="reg44-view">
      {/* Top summary */}
      <div className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5"
        style={{ borderLeftColor: overallRag.line }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={15} className="text-[#0e3b4a]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">
                Regulation 44 · live operational intelligence
              </span>
            </div>
            <h2 className="text-2xl font-semibold text-[#0F1115]">
              {data.overall_score}<span className="text-base text-stone-500">% · {data.rating.label}</span>
            </h2>
            <p className="text-xs text-stone-600 mt-1">
              40 modules · <span className="font-semibold">{data.live_count} live from platform data</span> · {data.manual_count} manual evidence
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-1 border divider-soft rounded-full px-2.5 py-1 bg-white min-w-[180px]">
              <Search size={12} className="text-stone-500" />
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search modules / regs…" data-testid="reg44-search"
                className="text-xs outline-none flex-1 bg-transparent" />
            </div>
            {["all", "red", "amber", "green"].map((r) => (
              <button key={r} onClick={() => setRagFilter(r)} data-testid={`reg44-filter-${r}`}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                  ragFilter === r ? "border-[#0e3b4a] bg-[#0e3b4a] text-white" : "border-stone-300 text-stone-700"
                }`}>
                {r === "all" ? "All RAG" : r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category accordions */}
      <div className="space-y-3">
        {data.categories.map((cat) => (
          <CategoryAccordion
            key={cat.id}
            cat={cat}
            tier={tier}
            defaultOpen={cat.rag !== "green"}
            onNoteSaved={load}
            q={q}
            ragFilter={ragFilter}
          />
        ))}
      </div>

      {/* Visit summary */}
      <VisitSummaryPanel tier={tier} latest={data.latest_visit} onSaved={load} />

      {/* Quality Standards legend */}
      <details className="bg-white border divider-soft rounded-2xl p-4">
        <summary className="text-xs font-bold uppercase tracking-wider text-stone-600 cursor-pointer flex items-center gap-1.5">
          <BookOpen size={12} /> 9 Children's Home Quality Standards
        </summary>
        <ul className="mt-3 grid sm:grid-cols-2 gap-1.5 text-xs">
          {Object.entries(data.quality_standards_legend || {}).map(([k, v]) => (
            <li key={k} className="text-stone-700">
              <span className="font-bold text-[#0e3b4a]">{k}</span> · {v}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
