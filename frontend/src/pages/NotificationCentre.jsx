/* Full Notification Centre — Phase G.1
 *
 * Unified per-user inbox with category filters, read/unread, dismiss,
 * mark-all-read, and a Preferences panel for per-category channel control.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Inbox, CheckCheck, X, Settings2, ShieldAlert, MapPin, ClipboardCheck,
  Users, Sparkles, FileWarning, Mail, Smartphone, BellRing, ChevronRight,
  Loader2, RefreshCw,
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

const SEV = {
  critical: { fg: "#7a1a28", bg: "#FBE3E7", line: "#A8273A", label: "Critical" },
  high:     { fg: "#7a4d12", bg: "#FCEFD4", line: "#B8772F", label: "High" },
  medium:   { fg: "#15405d", bg: "#E5F0F7", line: "#2E6FA7", label: "Medium" },
  low:      { fg: "#1f4f2b", bg: "#E7F3EC", line: "#2F6A3A", label: "Low" },
  info:     { fg: "#5d6068", bg: "#F1EFEC", line: "#5d6068", label: "Info" },
};

const CHANNEL_META = {
  in_app:      { label: "In app",     icon: BellRing },
  email:       { label: "Email",      icon: Mail },
  sms:         { label: "SMS",        icon: Smartphone },
  digest_only: { label: "Digest only", icon: Inbox },
};

function relativeTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationCentre() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ unread: 0, critical: 0, by_category: {} });
  const [filter, setFilter] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter) qs.set("category", filter);
      if (unreadOnly) qs.set("unread_only", "true");
      qs.set("limit", "200");
      const [list, c] = await Promise.all([
        api.get(`/notif-centre?${qs}`),
        api.get("/notif-centre/counts"),
      ]);
      setItems(list.data.items || []);
      setCounts(c.data || {});
    } catch {
      toast.error("Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [filter, unreadOnly]);

  useEffect(() => { refresh(); }, [refresh]);

  const loadPrefs = useCallback(async () => {
    try {
      const r = await api.get("/notif-centre/preferences");
      setPrefs(r.data.preferences || []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { if (showPrefs) loadPrefs(); }, [showPrefs, loadPrefs]);

  const onOpen = async (n) => {
    if (!n.read_at) {
      try { await api.patch(`/notif-centre/${n.id}/read`); } catch { /* */ }
    }
    if (n.link) nav(n.link);
    refresh();
  };

  const dismiss = async (e, n) => {
    e.stopPropagation();
    try {
      await api.delete(`/notif-centre/${n.id}`);
      refresh();
    } catch { toast.error("Could not dismiss."); }
  };

  const markAll = async () => {
    try {
      await api.post("/notif-centre/mark-all-read");
      toast.success("All notifications marked as read.");
      refresh();
    } catch { toast.error("Could not mark all read."); }
  };

  const toggleChannel = async (cat, ch) => {
    const p = prefs.find((x) => x.category === cat);
    if (!p) return;
    const exists = p.channels.includes(ch);
    let next;
    if (ch === "digest_only") {
      next = exists ? p.channels.filter((c) => c !== "digest_only") : ["digest_only"];
    } else {
      next = exists ? p.channels.filter((c) => c !== ch) : [...p.channels.filter((c) => c !== "digest_only"), ch];
    }
    try {
      await api.patch("/notif-centre/preferences", { category: cat, channels: next });
      setPrefs((cur) => cur.map((x) => (x.category === cat ? { ...x, channels: next } : x)));
    } catch { toast.error("Could not save preference."); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4" data-testid="notification-centre-page">
      <header
        className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0E3B4A 0%, #0a2734 60%, #1E4D5C 100%)", color: "white" }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#FCB960]">
              <Inbox size={14} />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                Notification Centre · Operational signals
              </span>
            </div>
            <h1 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5"
                style={{ letterSpacing: "-0.02em" }}>
              {counts.unread > 0
                ? `${counts.unread} unread signal${counts.unread === 1 ? "" : "s"}`
                : "You're all caught up."}
            </h1>
            <p className="text-[12px] text-white/65 mt-1 max-w-2xl">
              Safelyn surfaces only what's operationally meaningful — no noise.
              Critical events page you immediately; everything else waits in here or in your digest.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => setShowPrefs((s) => !s)}
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 text-[12px] h-8"
              data-testid="notif-prefs-btn"
            >
              <Settings2 size={12} className="mr-1.5" />
              {showPrefs ? "Hide preferences" : "Preferences"}
            </Button>
            {counts.unread > 0 && (
              <Button
                onClick={markAll}
                className="bg-[#B8772F] hover:bg-[#a3661f] text-white text-[12px] h-8"
                data-testid="notif-mark-all-page"
              >
                <CheckCheck size={12} className="mr-1.5" />
                Mark all read
              </Button>
            )}
            <button
              onClick={refresh}
              className="text-white/70 hover:text-white p-1.5 rounded hover:bg-white/10"
              title="Refresh"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <section className="bg-white border divider-soft rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilter(null)}
            data-testid="notif-page-filter-all"
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              filter === null
                ? "bg-[#0e3b4a] text-white"
                : "bg-white border divider-soft text-stone-700 hover:bg-stone-100"
            }`}
          >
            All categories
          </button>
          {Object.entries(counts.by_category || {}).map(([cat, n]) => {
            const Icon = CATEGORY_ICON[cat] || BellRing;
            return (
              <button
                key={cat}
                onClick={() => setFilter(filter === cat ? null : cat)}
                data-testid={`notif-page-filter-${cat}`}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
                  filter === cat
                    ? "bg-[#0e3b4a] text-white"
                    : "bg-white border divider-soft text-stone-700 hover:bg-stone-100"
                }`}
              >
                <Icon size={11} /> {cat.replace(/_/g, " ")} · {n}
              </button>
            );
          })}
          <label className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              data-testid="notif-unread-only"
              className="accent-[#0e3b4a]"
            />
            Unread only
          </label>
        </div>
      </section>

      {/* Preferences panel */}
      {showPrefs && (
        <section
          data-testid="notif-prefs-panel"
          className="bg-white border divider-soft rounded-2xl p-5"
        >
          <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-1">
            Channel preferences
          </h3>
          <p className="text-[12px] text-stone-500 mb-3">
            Choose how each category reaches you. Critical events always page you in-app and by email,
            regardless of these settings.
          </p>
          <div className="space-y-2">
            {prefs.map((p) => {
              const Icon = CATEGORY_ICON[p.category] || BellRing;
              return (
                <div
                  key={p.category}
                  className="flex items-center gap-3 p-3 border divider-soft rounded-xl flex-wrap"
                  data-testid={`pref-row-${p.category}`}
                >
                  <div className="w-9 h-9 rounded-lg bg-stone-100 text-[#0e3b4a] flex items-center justify-center shrink-0">
                    <Icon size={15} />
                  </div>
                  <div className="font-medium text-sm text-stone-900 min-w-[150px]">
                    {p.label}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap ml-auto">
                    {Object.entries(CHANNEL_META).map(([ch, meta]) => {
                      const active = p.channels.includes(ch);
                      const ChIcon = meta.icon;
                      return (
                        <button
                          key={ch}
                          onClick={() => toggleChannel(p.category, ch)}
                          data-testid={`pref-${p.category}-${ch}`}
                          className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full inline-flex items-center gap-1 border transition-colors ${
                            active
                              ? "bg-[#0e3b4a] text-white border-[#0e3b4a]"
                              : "bg-white border-stone-300 text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          <ChIcon size={11} /> {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-stone-400 mt-3">
            Email and SMS delivery is currently <strong>mocked</strong>. Live integrations (Resend / Twilio)
            arrive in the next phase. Your preferences are saved either way.
          </p>
        </section>
      )}

      {/* List */}
      <section className="bg-white border divider-soft rounded-2xl overflow-hidden" data-testid="notif-list">
        {loading ? (
          <div className="p-8 text-center text-sm text-stone-500 inline-flex items-center justify-center gap-2 w-full">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-stone-500">
            <Inbox size={32} className="mx-auto mb-2 text-stone-300" />
            Nothing in this view.
            <div className="text-[11px] mt-1">
              {filter
                ? "Try another category or clear the filter."
                : "When something operationally meaningful happens, it'll appear here."}
            </div>
          </div>
        ) : (
          <ul className="divide-y divider-soft">
            {items.map((n) => {
              const Icon = CATEGORY_ICON[n.category] || BellRing;
              const sev = SEV[n.severity] || SEV.medium;
              return (
                <li
                  key={n.id}
                  data-testid={`notif-page-item-${n.id}`}
                  className={`px-4 py-3 cursor-pointer hover:bg-stone-50 border-l-4 ${
                    !n.read_at ? "bg-stone-50/60" : "bg-white"
                  }`}
                  style={{ borderLeftColor: !n.read_at ? sev.line : "transparent" }}
                  onClick={() => onOpen(n)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: sev.bg, color: sev.fg }}
                    >
                      <Icon size={15} />
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
                        {n.is_critical && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#7a1a28] text-white">
                            CRITICAL
                          </span>
                        )}
                        {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-[#A8273A]" />}
                      </div>
                      <div className="text-sm font-semibold text-stone-900 mt-1">
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-[13px] text-stone-700 mt-0.5">
                          {n.body}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[11px] text-stone-500">
                          {relativeTime(n.created_at)}
                          {n.actor_name && <> · {n.actor_name}</>}
                          {n.delivered_channels?.length > 0 && (
                            <> · delivered to {n.delivered_channels.join(", ")}</>
                          )}
                          {n.pending_channels?.length > 0 && (
                            <> · pending {n.pending_channels.join(", ")} <span className="text-[#B8772F] font-bold">[MOCKED]</span></>
                          )}
                        </span>
                        {n.link && (
                          <span className="text-[11px] text-[#0e3b4a] inline-flex items-center gap-0.5">
                            Open <ChevronRight size={11} />
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => dismiss(e, n)}
                      data-testid={`notif-page-dismiss-${n.id}`}
                      className="text-stone-300 hover:text-[#A8273A] p-1 shrink-0"
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
