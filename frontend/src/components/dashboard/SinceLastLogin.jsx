import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Clock, ShieldAlert, MapPin, BellRing, FileWarning, ChevronRight } from "lucide-react";

function fmtSince(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function SinceLastLogin() {
  const { isManagerOrAbove } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isManagerOrAbove) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get("/notif-centre/since-last-login");
        if (!cancelled) setData(r.data);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [isManagerOrAbove]);

  if (!isManagerOrAbove || !data) return null;

  const total =
    (data.safeguarding || 0) +
    (data.missing_episodes || 0) +
    (data.critical_notifications || 0);

  const tiles = [
    {
      key: "safeguarding",
      label: "Safeguarding incidents",
      value: data.safeguarding || 0,
      icon: ShieldAlert,
      to: "/incidents",
      tone: data.safeguarding > 0 ? "red" : "grey",
    },
    {
      key: "missing",
      label: "Missing episodes",
      value: data.missing_episodes || 0,
      icon: MapPin,
      to: "/incidents",
      tone: data.missing_episodes > 0 ? "amber" : "grey",
    },
    {
      key: "critical",
      label: "Critical alerts",
      value: data.critical_notifications || 0,
      icon: BellRing,
      to: "/notifications-centre",
      tone: data.critical_notifications > 0 ? "red" : "grey",
    },
    {
      key: "notifications",
      label: "New notifications",
      value: data.notifications || 0,
      icon: FileWarning,
      to: "/notifications-centre",
      tone: data.notifications > 0 ? "blue" : "grey",
    },
  ];

  const toneCls = (t) => {
    if (t === "red")   return { bg: "bg-[#FBE3E7]", fg: "text-[#7a1a28]", line: "border-[#A8273A]/30" };
    if (t === "amber") return { bg: "bg-[#FCEFD4]", fg: "text-[#7a4d12]", line: "border-[#B8772F]/30" };
    if (t === "blue")  return { bg: "bg-[#E5F0F7]", fg: "text-[#15405d]", line: "border-[#2E6FA7]/30" };
    return { bg: "bg-stone-50", fg: "text-stone-500", line: "border-stone-200" };
  };

  return (
    <section
      data-testid="since-last-login"
      className="bg-white border divider-soft rounded-2xl p-5"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-[#0e3b4a]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
              Since your last login
            </span>
          </div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-1">
            {total > 0
              ? "Here's what happened while you were away."
              : "All quiet since you were last in."}
          </h3>
          <p className="text-[12px] text-stone-500 mt-0.5">
            Since {fmtSince(data.since)}
          </p>
        </div>
        <Link
          to="/notifications-centre"
          data-testid="since-last-login-view-all"
          className="text-[12px] font-semibold text-[#0e3b4a] hover:underline inline-flex items-center gap-1 shrink-0"
        >
          Open Notification Centre <ChevronRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {tiles.map((t) => {
          const cls = toneCls(t.tone);
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              to={t.to}
              data-testid={`since-tile-${t.key}`}
              className={`block rounded-xl border p-3 transition-colors hover:bg-stone-50 ${cls.line}`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls.bg} ${cls.fg}`}>
                <Icon size={16} />
              </div>
              <div className={`mt-2 font-display font-bold text-2xl ${cls.fg}`}>{t.value}</div>
              <div className="text-[11px] uppercase tracking-wider text-stone-500 font-bold mt-0.5">
                {t.label}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
