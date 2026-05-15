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
  LayoutDashboard, BookOpen, Network, ShieldQuestion, UserCheck, Clock,
} from "lucide-react";
import Regulation44View from "@/pages/Regulation44View";
import InspectionSimulationView from "@/pages/InspectionSimulationView";
import CrossModulePatternsView from "@/pages/CrossModulePatternsView";

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
// Action plan — accountable, assignable, escalatable, signed-off
// ---------------------------------------------------------------------------
function ActionPlanPanel({ tier }) {
  const isManager = tier >= 3;
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [tab, setTab] = useState("active");
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({
    title: "", detail: "", priority: "medium", due_date: "",
    assigned_to_id: "", assigned_to_name: "",
  });
  const [escalateFor, setEscalateFor] = useState(null);
  const [escalateDraft, setEscalateDraft] = useState({ escalated_to_id: "", escalated_to_name: "", reason: "" });
  const [signOffFor, setSignOffFor] = useState(null);
  const [signOffNotes, setSignOffNotes] = useState("");
  const [filter, setFilter] = useState("all"); // all | overdue | unowned | escalated

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get("/inspection-actions");
      setItems(r.data || []);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Load staff picker once
  useEffect(() => {
    api.get("/auth/users/picker").then((r) => setStaff(r.data || [])).catch(() => {});
  }, []);

  const active = items.filter((i) => i.status !== "resolved");
  const resolved = items.filter((i) => i.status === "resolved");
  const overdueCount = active.filter((i) => i.is_overdue).length;
  const unownedCount = active.filter((i) => !i.assigned_to_id && !i.assigned_to_name).length;
  const escalatedCount = active.filter((i) => i.escalated_at).length;
  const awaitingSignOff = resolved.filter((i) => !i.signed_off_at).length;

  let listSource = tab === "active" ? active : resolved;
  if (tab === "active") {
    if (filter === "overdue") listSource = listSource.filter((i) => i.is_overdue);
    else if (filter === "unowned") listSource = listSource.filter((i) => !i.assigned_to_id && !i.assigned_to_name);
    else if (filter === "escalated") listSource = listSource.filter((i) => i.escalated_at);
  }
  const list = listSource;

  const save = async () => {
    if (!draft.title.trim()) return;
    try {
      await api.post("/inspection-actions", {
        ...draft,
        due_date: draft.due_date || null,
        assigned_to_id: draft.assigned_to_id || null,
        assigned_to_name: draft.assigned_to_name || null,
      });
      toast.success("Action added");
      setShowNew(false);
      setDraft({ title: "", detail: "", priority: "medium", due_date: "", assigned_to_id: "", assigned_to_name: "" });
      refresh();
    } catch { toast.error("Couldn't add"); }
  };

  const assign = async (id, staffMember) => {
    try {
      await api.patch(`/inspection-actions/${id}`, {
        assigned_to_id: staffMember?.id || null,
        assigned_to_name: staffMember?.name || null,
      });
      toast.success(staffMember ? `Assigned to ${staffMember.name}` : "Unassigned");
      refresh();
    } catch { toast.error("Couldn't update assignee"); }
  };

  const setDueDate = async (id, due_date) => {
    try {
      await api.patch(`/inspection-actions/${id}`, { due_date: due_date || null });
      refresh();
    } catch { toast.error("Couldn't update due date"); }
  };

  const resolve = async (id) => {
    try {
      await api.patch(`/inspection-actions/${id}`, { status: "resolved" });
      toast.success("Marked as resolved · awaiting manager sign-off");
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

  const submitEscalation = async () => {
    if (!escalateFor) return;
    if (!escalateDraft.escalated_to_name.trim() || !escalateDraft.reason.trim()) {
      toast.error("Name and reason are required");
      return;
    }
    try {
      await api.post(`/inspection-actions/${escalateFor.id}/escalate`, escalateDraft);
      toast.success("Escalated");
      setEscalateFor(null);
      setEscalateDraft({ escalated_to_id: "", escalated_to_name: "", reason: "" });
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't escalate");
    }
  };

  const submitSignOff = async () => {
    if (!signOffFor) return;
    try {
      await api.post(`/inspection-actions/${signOffFor.id}/sign-off`, { notes: signOffNotes });
      toast.success("Action signed off");
      setSignOffFor(null);
      setSignOffNotes("");
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't sign off");
    }
  };

  return (
    <div className="bg-white border divider-soft rounded-2xl p-5" data-testid="action-plan-panel">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-[#0F1115] flex items-center gap-2">
            <ClipboardCheck size={16} /> Manager action plan · accountability
          </h3>
          <p className="text-xs text-stone-600 mt-0.5">
            Owned · due-tracked · escalatable · signed-off. Full audit trail per action.
          </p>
        </div>
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

      {/* Accountability summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3" data-testid="accountability-summary">
        <button onClick={() => { setTab("active"); setFilter("overdue"); }} className="text-left bg-stone-50 hover:bg-stone-100 rounded-lg p-2.5 border-l-4" style={{ borderLeftColor: overdueCount > 0 ? "#A8273A" : "#D6D6D0" }}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-600">Overdue</div>
          <div className="text-xl font-semibold text-[#0F1115]">{overdueCount}</div>
        </button>
        <button onClick={() => { setTab("active"); setFilter("unowned"); }} className="text-left bg-stone-50 hover:bg-stone-100 rounded-lg p-2.5 border-l-4" style={{ borderLeftColor: unownedCount > 0 ? "#B8772F" : "#D6D6D0" }}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-600">Unowned</div>
          <div className="text-xl font-semibold text-[#0F1115]">{unownedCount}</div>
        </button>
        <button onClick={() => { setTab("active"); setFilter("escalated"); }} className="text-left bg-stone-50 hover:bg-stone-100 rounded-lg p-2.5 border-l-4" style={{ borderLeftColor: escalatedCount > 0 ? "#7A4F8C" : "#D6D6D0" }}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-600">Escalated</div>
          <div className="text-xl font-semibold text-[#0F1115]">{escalatedCount}</div>
        </button>
        <button onClick={() => setTab("resolved")} className="text-left bg-stone-50 hover:bg-stone-100 rounded-lg p-2.5 border-l-4" style={{ borderLeftColor: awaitingSignOff > 0 ? "#0e3b4a" : "#2F6A3A" }}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-600">Awaiting sign-off</div>
          <div className="text-xl font-semibold text-[#0F1115]">{awaitingSignOff}</div>
        </button>
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
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
              className="text-sm border divider-soft rounded-lg p-2 bg-white"
              data-testid="action-plan-new-priority"
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
              data-testid="action-plan-new-due"
            />
            <select
              value={draft.assigned_to_id}
              onChange={(e) => {
                const sm = staff.find((s) => s.id === e.target.value);
                setDraft({ ...draft, assigned_to_id: e.target.value, assigned_to_name: sm?.name || "" });
              }}
              className="text-sm border divider-soft rounded-lg p-2 bg-white"
              data-testid="action-plan-new-assignee"
            >
              <option value="">Assign to…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {s.role}</option>
              ))}
            </select>
            <button onClick={save} data-testid="action-plan-save" className="text-sm font-semibold bg-[#0e3b4a] text-white px-3 py-2 rounded-lg">
              Save
            </button>
            <button onClick={() => setShowNew(false)} className="text-sm px-3 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
          </div>
        </div>
      )}
      <div className="flex gap-2 mb-3 border-b divider-soft flex-wrap items-center">
        <button onClick={() => { setTab("active"); setFilter("all"); }} data-testid="action-tab-active"
          className={`text-xs font-semibold px-3 py-2 border-b-2 ${tab === "active" ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-600"}`}>
          Active ({active.length})
        </button>
        <button onClick={() => setTab("resolved")} data-testid="action-tab-resolved"
          className={`text-xs font-semibold px-3 py-2 border-b-2 ${tab === "resolved" ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-600"}`}>
          Resolved ({resolved.length})
        </button>
        {tab === "active" && filter !== "all" && (
          <button onClick={() => setFilter("all")} className="ml-auto text-[11px] text-stone-600 hover:text-[#0e3b4a] flex items-center gap-1" data-testid="action-filter-clear">
            Clear filter: {filter} ×
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-stone-600 py-6 text-center">
          {tab === "active" ? (filter !== "all" ? `No actions match the ${filter} filter.` : "No active actions. Add one as you prepare for inspection.") : "Nothing resolved yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => {
            const sev = SEV_PILL[a.priority] || SEV_PILL.low;
            const overdue = a.is_overdue;
            const escalated = !!a.escalated_at;
            const signedOff = !!a.signed_off_at;
            return (
              <li key={a.id} className="border-l-4 rounded-lg bg-stone-50 p-3" style={{ borderLeftColor: overdue ? "#A8273A" : sev.fg }} data-testid={`action-plan-item-${a.id}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: sev.bg, color: sev.fg }}>
                        {sev.label}
                      </span>
                      {overdue && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#A8273A14] text-[#A8273A]" data-testid={`badge-overdue-${a.id}`}>
                          Overdue
                        </span>
                      )}
                      {escalated && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#7A4F8C18] text-[#7A4F8C]" data-testid={`badge-escalated-${a.id}`} title={a.escalation_reason || ""}>
                          Escalated
                        </span>
                      )}
                      {signedOff && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#2F6A3A14] text-[#2F6A3A]" data-testid={`badge-signedoff-${a.id}`}>
                          Signed off
                        </span>
                      )}
                      <span className="text-sm font-semibold text-[#0F1115]">{a.title}</span>
                    </div>
                    {a.detail && <p className="text-xs text-stone-700 mt-1 whitespace-pre-wrap">{a.detail}</p>}

                    {/* Ownership row */}
                    <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px] text-stone-600">
                      <span className="inline-flex items-center gap-1">
                        <UserCheck size={11} />
                        {a.status !== "resolved" && isManager ? (
                          <select
                            value={a.assigned_to_id || ""}
                            onChange={(e) => {
                              const sm = staff.find((s) => s.id === e.target.value);
                              assign(a.id, sm || null);
                            }}
                            data-testid={`action-assign-${a.id}`}
                            className="text-[11px] border divider-soft rounded px-1.5 py-0.5 bg-white"
                          >
                            <option value="">Unassigned</option>
                            {staff.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-medium">{a.assigned_to_name || "Unassigned"}</span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {a.status !== "resolved" && isManager ? (
                          <input
                            type="date"
                            value={a.due_date || ""}
                            onChange={(e) => setDueDate(a.id, e.target.value)}
                            data-testid={`action-due-${a.id}`}
                            className="text-[11px] border divider-soft rounded px-1.5 py-0.5 bg-white"
                          />
                        ) : (
                          <span className="font-medium">{a.due_date || "no due date"}</span>
                        )}
                      </span>
                    </div>

                    {/* Resolution / sign-off / escalation footer */}
                    {(a.status === "resolved" || escalated) && (
                      <div className="text-[10px] text-stone-500 mt-2 space-y-0.5">
                        {a.status === "resolved" && (
                          <div>Resolved by {a.resolved_by_name} · {timeAgo(a.resolved_at)}</div>
                        )}
                        {signedOff && (
                          <div className="text-[#2F6A3A]">Signed off by {a.signed_off_by_name} · {timeAgo(a.signed_off_at)}</div>
                        )}
                        {escalated && (
                          <div className="text-[#7A4F8C]">Escalated to {a.escalated_to_name} · {timeAgo(a.escalated_at)}{a.escalation_reason ? ` — ${a.escalation_reason}` : ""}</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1 shrink-0 flex-col items-end">
                    {a.status !== "resolved" ? (
                      <>
                        <button onClick={() => resolve(a.id)} data-testid={`action-plan-resolve-${a.id}`} title="Mark resolved"
                          className="p-1.5 rounded-md hover:bg-white text-[#2F6A3A]">
                          <CheckCircle2 size={15} />
                        </button>
                        {isManager && !escalated && (
                          <button onClick={() => setEscalateFor(a)} data-testid={`action-escalate-${a.id}`} title="Escalate"
                            className="p-1.5 rounded-md hover:bg-white text-[#7A4F8C]">
                            <ShieldQuestion size={15} />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {!signedOff && isManager && (
                          <button onClick={() => setSignOffFor(a)} data-testid={`action-signoff-${a.id}`} title="Manager sign-off"
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-[#0e3b4a] text-white hover:bg-[#0a2e3a]">
                            Sign off
                          </button>
                        )}
                        <button onClick={() => reopen(a.id)} data-testid={`action-plan-reopen-${a.id}`} title="Reopen"
                          className="p-1.5 rounded-md hover:bg-white text-stone-600">
                          <RefreshCw size={14} />
                        </button>
                      </>
                    )}
                    {isManager && (
                      <button onClick={() => remove(a.id)} data-testid={`action-plan-delete-${a.id}`} title="Delete"
                        className="p-1.5 rounded-md hover:bg-[#A8273A]/10 text-stone-500 hover:text-[#A8273A]">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Escalation modal */}
      {escalateFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="escalate-modal">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full">
            <h4 className="text-base font-semibold text-[#0F1115] mb-1">Escalate action</h4>
            <p className="text-xs text-stone-600 mb-3">{escalateFor.title}</p>
            <div className="space-y-2">
              <select
                value={escalateDraft.escalated_to_id}
                onChange={(e) => {
                  const sm = staff.find((s) => s.id === e.target.value);
                  setEscalateDraft({
                    ...escalateDraft,
                    escalated_to_id: e.target.value,
                    escalated_to_name: sm?.name || escalateDraft.escalated_to_name,
                  });
                }}
                data-testid="escalate-to-select"
                className="w-full text-sm border divider-soft rounded-lg p-2 bg-white"
              >
                <option value="">Escalate to staff member…</option>
                {staff.filter((s) => ["manager", "admin", "senior"].includes(s.role)).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.role}</option>
                ))}
              </select>
              <input
                type="text"
                value={escalateDraft.escalated_to_name}
                onChange={(e) => setEscalateDraft({ ...escalateDraft, escalated_to_name: e.target.value })}
                placeholder="Or escalate to (free text)…"
                data-testid="escalate-to-name"
                className="w-full text-sm border divider-soft rounded-lg p-2"
              />
              <textarea
                value={escalateDraft.reason}
                onChange={(e) => setEscalateDraft({ ...escalateDraft, reason: e.target.value })}
                placeholder="Reason for escalation (audit-logged)…"
                rows={3}
                data-testid="escalate-reason"
                className="w-full text-sm border divider-soft rounded-lg p-2 resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => { setEscalateFor(null); setEscalateDraft({ escalated_to_id: "", escalated_to_name: "", reason: "" }); }}
                className="text-sm px-3 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
              <button onClick={submitEscalation} data-testid="escalate-submit"
                className="text-sm font-semibold bg-[#7A4F8C] text-white px-3 py-2 rounded-lg hover:bg-[#5e3d6e]">
                Escalate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign-off modal */}
      {signOffFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="signoff-modal">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full">
            <h4 className="text-base font-semibold text-[#0F1115] mb-1">Manager sign-off</h4>
            <p className="text-xs text-stone-600 mb-3">{signOffFor.title}</p>
            <textarea
              value={signOffNotes}
              onChange={(e) => setSignOffNotes(e.target.value)}
              placeholder="Evidence / sign-off notes (optional, audit-logged)…"
              rows={4}
              data-testid="signoff-notes"
              className="w-full text-sm border divider-soft rounded-lg p-2 resize-none"
            />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => { setSignOffFor(null); setSignOffNotes(""); }}
                className="text-sm px-3 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
              <button onClick={submitSignOff} data-testid="signoff-submit"
                className="text-sm font-semibold bg-[#0e3b4a] text-white px-3 py-2 rounded-lg hover:bg-[#0a2e3a]">
                Sign off
              </button>
            </div>
          </div>
        </div>
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
  const [tab, setTab] = useState("command");  // command | regulation_44 | simulation
  const [accessDenied, setAccessDenied] = useState(false);
  const [autoDraftPayload, setAutoDraftPayload] = useState(null);

  const handleAutoDraftReady = (payload) => {
    setAutoDraftPayload(payload);
    setTab("regulation_44");
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/ofsted/command-centre");
      setData(r.data);
      setAccessDenied(false);
    } catch (e) {
      if (e?.response?.status === 403) {
        setAccessDenied(true);
      } else {
        toast.error("Couldn't load command centre");
      }
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

  if (accessDenied) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-10 text-center max-w-xl mx-auto" data-testid="ofsted-access-denied">
        <ShieldCheck size={36} className="mx-auto text-stone-400 mb-3" />
        <h2 className="text-lg font-semibold text-[#0F1115]">Manager-level access required</h2>
        <p className="text-sm text-stone-600 mt-2">
          The Ofsted Inspection Command Centre is available to senior, manager and admin roles.
          Please ask your registered manager if you need access for inspection prep.
        </p>
      </div>
    );
  }

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

      {/* ---------- TAB STRIP ---------- */}
      <div className="flex gap-1 border-b divider-soft overflow-x-auto -mt-2">
        <button
          type="button"
          onClick={() => setTab("command")}
          data-testid="ofsted-tab-command"
          className={`text-sm font-semibold px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            tab === "command" ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-600 hover:text-stone-900"
          }`}
        >
          <LayoutDashboard size={14} /> Command centre
        </button>
        <button
          type="button"
          onClick={() => setTab("regulation_44")}
          data-testid="ofsted-tab-regulation_44"
          className={`text-sm font-semibold px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            tab === "regulation_44" ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-600 hover:text-stone-900"
          }`}
        >
          <BookOpen size={14} /> Regulation 44 modules
        </button>
        <button
          type="button"
          onClick={() => setTab("simulation")}
          data-testid="ofsted-tab-simulation"
          className={`text-sm font-semibold px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            tab === "simulation" ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-600 hover:text-stone-900"
          }`}
        >
          <Sparkles size={14} /> Inspection simulation
        </button>
        <button
          type="button"
          onClick={() => setTab("patterns")}
          data-testid="ofsted-tab-patterns"
          className={`text-sm font-semibold px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            tab === "patterns" ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-600 hover:text-stone-900"
          }`}
        >
          <Network size={14} /> Cross-module intelligence
        </button>
      </div>

      {tab === "regulation_44" && (
        <Regulation44View
          autoDraftPayload={autoDraftPayload}
          onConsumeDraft={() => setAutoDraftPayload(null)}
        />
      )}
      {tab === "simulation" && (
        <InspectionSimulationView onAutoDraftReady={handleAutoDraftReady} />
      )}
      {tab === "patterns" && <CrossModulePatternsView />}

      {tab === "command" && <>

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
      </>}
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
