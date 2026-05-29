import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import {
  BellRing, X, CheckCheck, Inbox, ShieldAlert, MapPin, ClipboardCheck,
  Users, Sparkles, FileWarning, ChevronRight,
} from "lucide-react";

const CATEGORY_ICON = {
  safeguarding:           ShieldAlert,
  missing:                MapPin,
  compliance:             ClipboardCheck,
  staffing:               Users,
  placement_intelligence: Sparkles,
  hr:                     FileWarning,
  inspection_readiness:   FileWarning,
};

const SEVERITY_STYLE = {
  critical: { fg: "#7a1a28", bg: "#FBE3E7", line: "#A8273A", label: "Critical" },
  high:     { fg: "#7a4d12", bg: "#FCEFD4", line: "#B8772F", label: "High" },
  medium:   { fg: "#15405d", bg: "#E5F0F7", line: "#2E6FA7", label: "Medium" },
  low:      { fg: "#1f4f2b", bg: "#E7F3EC", line: "#2F6A3A", label: "Low" },
  info:     { fg: "#5d6068", bg: "#F1EFEC", line: "#5d6068", label: "Info" },
};

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationCentreBell({ testid = "notif-centre-bell" }) {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ unread: 0, critical: 0, by_category: {} });
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(null); // category filter
  const nav = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const [list, c] = await Promise.all([
        api.get(`/notif-centre?limit=20${filter ? `&category=${filter}` : ""}`),
        api.get("/notif-centre/counts"),
      ]);
      setItems(list.data.items || []);
      setCounts(c.data || { unread: 0, critical: 0, by_category: {} });
    } catch {
      /* silent */
    }
  }, [filter]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const markRead = async (n) => {
    if (!n.read_at) {
      try {
        await api.patch(`/notif-centre/${n.id}/read`);
      } catch { /* non-fatal */ }
    }
  };

  const onItemClick = async (n) => {
    await markRead(n);
    setOpen(false);
    if (n.link) nav(n.link);
    refresh();
  };

  const dismiss = async (e, n) => {
    e.stopPropagation();
    try {
      await api.delete(`/notif-centre/${n.id}`);
      refresh();
    } catch { /* non-fatal */ }
  };

  const markAllRead = async () => {
    try {
      await api.post("/notif-centre/mark-all-read");
      refresh();
    } catch { /* non-fatal */ }
  };

  const unread = counts.unread || 0;
  const critical = counts.critical || 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={testid}
        className={`relative w-10 h-10 rounded-xl border divider-soft flex items-center justify-center transition-colors ${
          critical > 0
            ? "bg-[#FBE3E7] hover:bg-[#f8d5db] text-[#7a1a28] border-[#A8273A]/30"
            : unread > 0
            ? "bg-[#E7F3EC] hover:bg-[#d8ead0] text-[#1f4f2b]"
            : "bg-white hover:bg-stone-50 text-stone-700"
        }`}
        aria-label="Notification centre"
      >
        <BellRing size={18} />
        {unread > 0 && (
          <span
            data-testid={`${testid}-badge`}
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${
              critical > 0 ? "bg-[#A8273A]" : "bg-[#2F6A3A]"
            }`}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            data-testid="notif-centre-panel"
            className="absolute right-0 mt-2 w-96 sm:w-[420px] max-h-[80vh] overflow-hidden bg-white border divider-soft rounded-2xl shadow-xl z-40 animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b divider-soft bg-white">
              <div className="min-w-0">
                <div className="font-display font-bold text-sm text-stone-900 flex items-center gap-1.5">
                  <Inbox size={14} /> Notification Centre
                </div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 mt-0.5">
                  {unread} unread{critical > 0 && ` · ${critical} critical`}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    data-testid="notif-centre-mark-all-read"
                    className="text-[11px] font-semibold text-[#0e3b4a] hover:bg-stone-100 px-2 py-1 rounded inline-flex items-center gap-1"
                  >
                    <CheckCheck size={12} /> Mark all
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-stone-400 hover:text-stone-700 p-1"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Category filter chips */}
            <div className="flex items-center gap-1 px-3 py-2 border-b divider-soft bg-stone-50 overflow-x-auto">
              <button
                onClick={() => setFilter(null)}
                data-testid="notif-filter-all"
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                  filter === null
                    ? "bg-[#0e3b4a] text-white"
                    : "bg-white border divider-soft text-stone-700 hover:bg-stone-100"
                }`}
              >
                All
              </button>
              {Object.entries(counts.by_category || {})
                .filter(([, n]) => n > 0)
                .map(([cat, n]) => (
                  <button
                    key={cat}
                    onClick={() => setFilter(filter === cat ? null : cat)}
                    data-testid={`notif-filter-${cat}`}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                      filter === cat
                        ? "bg-[#0e3b4a] text-white"
                        : "bg-white border divider-soft text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    {cat.replace(/_/g, " ")} · {n}
                  </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="p-8 text-center text-sm text-stone-500">
                  <Inbox size={28} className="mx-auto mb-2 text-stone-300" />
                  Nothing here right now.
                  <div className="text-[11px] mt-1">Safelyn surfaces only what matters.</div>
                </div>
              ) : (
                <ul className="divide-y divider-soft">
                  {items.map((n) => {
                    const Icon = CATEGORY_ICON[n.category] || BellRing;
                    const sev = SEVERITY_STYLE[n.severity] || SEVERITY_STYLE.medium;
                    return (
                      <li
                        key={n.id}
                        data-testid={`notif-item-${n.id}`}
                        className={`px-3 py-3 cursor-pointer hover:bg-stone-50 border-l-4 ${
                          !n.read_at ? "bg-stone-50/60" : "bg-white"
                        }`}
                        style={{ borderLeftColor: !n.read_at ? sev.line : "transparent" }}
                        onClick={() => onItemClick(n)}
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: sev.bg, color: sev.fg }}
                          >
                            <Icon size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                style={{ background: sev.bg, color: sev.fg }}
                              >
                                {sev.label}
                              </span>
                              <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">
                                {(n.category || "").replace(/_/g, " ")}
                              </span>
                              {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-[#A8273A]" />}
                            </div>
                            <div className="text-sm font-medium text-stone-900 mt-1 line-clamp-2">
                              {n.title}
                            </div>
                            {n.body && (
                              <div className="text-[12px] text-stone-600 mt-0.5 line-clamp-2">
                                {n.body}
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-[10px] text-stone-500">
                                {relativeTime(n.created_at)}
                                {n.actor_name && <> · {n.actor_name}</>}
                              </span>
                              {n.link && (
                                <span className="text-[10px] text-[#0e3b4a] inline-flex items-center gap-0.5">
                                  Open <ChevronRight size={10} />
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => dismiss(e, n)}
                            data-testid={`notif-dismiss-${n.id}`}
                            className="text-stone-300 hover:text-[#A8273A] p-1 shrink-0"
                            title="Dismiss"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t divider-soft px-3 py-2 bg-stone-50 text-center">
              <Link
                to="/notifications-centre"
                onClick={() => setOpen(false)}
                data-testid="notif-centre-view-all"
                className="text-[12px] font-semibold text-[#0e3b4a] hover:underline inline-flex items-center gap-1"
              >
                Open full Notification Centre <ChevronRight size={12} />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
