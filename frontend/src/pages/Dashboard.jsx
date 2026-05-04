import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Users,
  NotebookPen,
  ShieldAlert,
  AlertTriangle,
  ArrowUpRight,
  Mic,
} from "lucide-react";

const Stat = ({ label, value, icon: Icon, accent = "#2D4A3E", testid }) => (
  <div
    data-testid={testid}
    className="bg-white border divider-soft rounded-2xl p-5 flex flex-col gap-3"
  >
    <div className="flex items-start justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </span>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: `${accent}15`, color: accent }}
      >
        <Icon size={18} />
      </div>
    </div>
    <div className="font-display text-4xl font-black text-stone-900">{value}</div>
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data));
  }, []);

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-sm font-medium uppercase tracking-wider text-[#E57A5D]">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-stone-900 mt-1">
            Hello, {user?.name?.split(" ")[0]}.
          </h1>
          <p className="text-stone-600 mt-2 max-w-xl">
            Here's a calm overview of today. Tap the voice button anywhere to log a note in seconds.
          </p>
        </div>
        <Link
          to="/notes"
          data-testid="quick-note-cta"
          className="inline-flex items-center gap-2 bg-[#E57A5D] hover:bg-[#D1664A] text-white font-medium rounded-xl px-5 py-3 transition-colors shadow-sm"
        >
          <Mic size={18} /> Voice note
        </Link>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          testid="stat-residents"
          label="Residents"
          value={stats?.total_residents ?? "—"}
          icon={Users}
        />
        <Stat
          testid="stat-notes-today"
          label="Notes today"
          value={stats?.notes_today ?? "—"}
          icon={NotebookPen}
          accent="#3A5A40"
        />
        <Stat
          testid="stat-incidents-week"
          label="Incidents · 7d"
          value={stats?.incidents_week ?? "—"}
          icon={AlertTriangle}
          accent="#D4A373"
        />
        <Stat
          testid="stat-safeguarding"
          label="Safeguarding open"
          value={stats?.safeguarding_open ?? "—"}
          icon={ShieldAlert}
          accent="#B23A48"
        />
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border divider-soft rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-lg text-stone-900">
              Recent incidents
            </h3>
            <Link
              to="/incidents"
              className="text-sm text-[#2D4A3E] hover:underline inline-flex items-center gap-1"
            >
              All <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {(stats?.recent_incidents || []).length === 0 && (
              <div className="text-sm text-stone-500 py-8 text-center">
                No incidents logged yet.
              </div>
            )}
            {(stats?.recent_incidents || []).map((inc) => (
              <div
                key={inc.id}
                className={`p-4 rounded-xl border-l-4 border-y border-r divider-soft bg-stone-50/50 ${
                  inc.safeguarding ? "border-l-[#B23A48]" : "border-l-[#D4A373]"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    {inc.category} · {inc.severity}
                    {inc.safeguarding && (
                      <span className="ml-2 text-[#B23A48]">· safeguarding</span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500">
                    {new Date(inc.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <p className="text-sm text-stone-800 leading-relaxed line-clamp-2">
                  {inc.body}
                </p>
                <div className="text-xs text-stone-500 mt-1.5">by {inc.author_name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border divider-soft rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-lg text-stone-900">
              Recent daily notes
            </h3>
            <Link
              to="/notes"
              className="text-sm text-[#2D4A3E] hover:underline inline-flex items-center gap-1"
            >
              All <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {(stats?.recent_notes || []).length === 0 && (
              <div className="text-sm text-stone-500 py-8 text-center">
                No notes yet — tap voice to log your first.
              </div>
            )}
            {(stats?.recent_notes || []).map((n) => (
              <div
                key={n.id}
                className="p-4 rounded-xl border-l-4 border-l-[#3A5A40] border-y border-r divider-soft bg-stone-50/50"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    {n.category}
                    {n.voice_used && <span className="ml-2 text-[#E57A5D]">· voice</span>}
                  </div>
                  <div className="text-xs text-stone-500">
                    {new Date(n.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <p className="text-sm text-stone-800 leading-relaxed line-clamp-2">
                  {n.body}
                </p>
                <div className="text-xs text-stone-500 mt-1.5">by {n.author_name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
