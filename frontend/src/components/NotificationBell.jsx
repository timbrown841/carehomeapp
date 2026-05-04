import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Bell, ShieldAlert, X, CheckCircle2, Mail, MessageSquare } from "lucide-react";
import { formatFullTimestamp, recordRef } from "@/lib/format";

export default function NotificationBell({ testid = "notification-bell" }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const refresh = async () => {
    try {
      const { data } = await api.get("/notifications?unread_only=false");
      setItems(data || []);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, []);

  const unread = items.filter((n) => !n.read_at).length;

  const open_incident = async (n) => {
    if (!n.read_at) {
      try {
        await api.post(`/notifications/${n.id}/read`);
      } catch {
        /* non-fatal */
      }
    }
    setOpen(false);
    nav(`/incidents/${n.incident_id}`);
    refresh();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={testid}
        className="relative w-10 h-10 rounded-xl border divider-soft bg-white hover:bg-stone-50 flex items-center justify-center text-stone-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            data-testid={`${testid}-badge`}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#B23A48] text-white text-[10px] font-bold flex items-center justify-center"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div
            data-testid="notification-panel"
            className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-y-auto bg-white border divider-soft rounded-2xl shadow-xl z-40 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b divider-soft sticky top-0 bg-white">
              <div>
                <div className="font-display font-bold text-sm text-stone-900">
                  Notifications
                </div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500">
                  {unread} unread · {items.length} total
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X size={16} />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center text-sm text-stone-500">
                No notifications yet.
              </div>
            ) : (
              <ul className="divide-y divider-soft">
                {items.slice(0, 30).map((n) => (
                  <li
                key={n.id}
                data-testid={`notification-item-${n.id}`}
                className={`px-4 py-3 cursor-pointer hover:bg-stone-50 ${
                  !n.read_at ? "bg-[#B23A48]/5" : ""
                }`}
                    onClick={() => open_incident(n)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          n.kind === "dsl"
                            ? "bg-[#B23A48]/15 text-[#B23A48]"
                            : "bg-[#1E4D5C]/15 text-[#1E4D5C]"
                        }`}
                      >
                        <ShieldAlert size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                          {n.kind === "dsl" ? "DSL alert" : "Manager alert"}
                          {!n.read_at && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#B23A48]" />
                          )}
                        </div>
                        <div className="text-sm text-stone-800 mt-0.5 line-clamp-2">
                          {n.message}
                        </div>
                        {n.incident_summary && (
                          <div className="mt-1.5 text-[11px] text-stone-600 line-clamp-1">
                            <span className="font-medium">
                              {n.incident_summary.resident_name}
                            </span>{" "}
                            · {n.incident_summary.severity} ·{" "}
                            {n.incident_summary.body_excerpt}
                          </div>
                        )}
                        <div className="text-[10px] text-stone-500 font-mono mt-1.5 flex items-center gap-2">
                          <span>{formatFullTimestamp(n.created_at)}</span>
                          <span className="text-stone-400">
                            ref {recordRef(n.incident_id)}
                          </span>
                        </div>
                        {(n.delivery || []).length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                            {n.delivery.map((d, idx) => (
                              <span
                                key={idx}
                                className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                  d.status === "sent"
                                    ? "bg-[#3A5A40]/12 text-[#3A5A40]"
                                    : d.status === "mocked"
                                    ? "bg-[#D4A373]/20 text-[#9C6B3D]"
                                    : "bg-[#B23A48]/12 text-[#B23A48]"
                                }`}
                                title={
                                  d.status === "mocked"
                                    ? "Demo mode — connect Resend/Twilio keys to send for real"
                                    : d.status
                                }
                              >
                                {d.channel === "email" ? (
                                  <Mail size={9} />
                                ) : (
                                  <MessageSquare size={9} />
                                )}
                                {d.channel}
                                {d.status === "mocked" && " · MOCKED"}
                                {d.status === "sent" && " · sent"}
                                {d.status === "failed" && " · failed"}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {n.read_at && (
                        <CheckCircle2 size={12} className="text-stone-300 shrink-0" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
