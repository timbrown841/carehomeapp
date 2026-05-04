import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatFullTimestamp } from "@/lib/format";
import {
  Users,
  NotebookPen,
  ShieldAlert,
  FileText,
  UserCog,
  ClipboardCheck,
  BadgeCheck,
  Mic,
  PlusCircle,
  ArrowUpRight,
  AlertTriangle,
  Clock3,
  FileWarning,
} from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const STATUS_COLORS = {
  red: { bg: "#B23A48", soft: "#B23A4815", text: "#B23A48", label: "High" },
  amber: { bg: "#D4A373", soft: "#D4A37320", text: "#9C6B3D", label: "Watch" },
  green: { bg: "#3A5A40", soft: "#3A5A4015", text: "#3A5A40", label: "Clear" },
};

function rag(value, redAt = 1, amberAt = 1) {
  if (value >= redAt) return STATUS_COLORS.red;
  if (value >= amberAt) return STATUS_COLORS.amber;
  return STATUS_COLORS.green;
}

const RiskTile = ({ label, value, status, icon: Icon, testid }) => (
  <div
    data-testid={testid}
    className="bg-white border divider-soft rounded-2xl p-5 flex items-center gap-4"
  >
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: status.soft, color: status.text }}
    >
      <Icon size={22} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-black text-stone-900">
          {value}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: status.soft, color: status.text }}
        >
          {status.label}
        </span>
      </div>
      <div className="text-sm font-medium text-stone-600 mt-0.5">{label}</div>
    </div>
    <span
      className="w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: status.bg }}
      aria-hidden
    />
  </div>
);

const ActionCard = ({ to, label, sub, icon: Icon, accent, testid }) => (
  <Link
    to={to}
    data-testid={testid}
    className="group bg-white border divider-soft rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col gap-3"
  >
    <div className="flex items-center justify-between">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ background: `${accent}15`, color: accent }}
      >
        <Icon size={20} />
      </div>
      <ArrowUpRight
        size={16}
        className="text-stone-400 group-hover:text-stone-700 transition-colors"
      />
    </div>
    <div>
      <div className="font-display font-semibold text-base text-stone-900">
        {label}
      </div>
      <div className="text-xs text-stone-500 mt-1 leading-relaxed">{sub}</div>
    </div>
  </Link>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data));
  }, []);

  const high = stats?.high_risk_alerts ?? 0;
  const overdue = stats?.overdue_tasks ?? 0;
  const missing = stats?.missing_records ?? 0;

  const cards = [
    {
      to: "/residents",
      label: "Residents / Young People",
      sub: "Profiles & background",
      icon: Users,
      accent: "#1E4D5C",
      testid: "card-residents",
    },
    {
      to: "/notes",
      label: "Daily Notes",
      sub: "Wellbeing & shift logs",
      icon: NotebookPen,
      accent: "#2D6A4F",
      testid: "card-notes",
    },
    {
      to: "/incidents/new",
      label: "Incident Reports",
      sub: "Safeguarding & escalations",
      icon: ShieldAlert,
      accent: "#B23A48",
      testid: "card-incidents",
    },
    {
      to: "/staff",
      label: "Staff Management",
      sub: "Team, rotas & roles",
      icon: UserCog,
      accent: "#0F2A47",
      testid: "card-staff",
    },
    {
      to: "/supervisions",
      label: "Supervisions & Appraisals",
      sub: "1:1s & development",
      icon: ClipboardCheck,
      accent: "#5B6E58",
      testid: "card-supervisions",
    },
    {
      to: "/reports",
      label: "Reports",
      sub: "AI-generated summaries",
      icon: FileText,
      accent: "#E57A5D",
      testid: "card-reports",
    },
    {
      to: "/ofsted",
      label: "Ofsted Readiness",
      sub: "Inspection checklist",
      icon: BadgeCheck,
      accent: "#1E4D5C",
      testid: "card-ofsted",
    },
  ];

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {/* Brand banner */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0F2A47] via-[#1E4D5C] to-[#2D6A4F] text-white p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-64 h-64 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute -right-10 bottom-0 w-40 h-40 rounded-full bg-[#E57A5D]/15 blur-2xl" />
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 mb-2">
            Safelyn Systems
          </div>
          <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tight max-w-2xl">
            Reducing risk. Improving care. Empowering staff.
          </h2>
        </div>
      </div>

      {/* Personalised greeting */}
      <header data-testid="dashboard-greeting">
        <div className="text-sm font-medium uppercase tracking-wider text-[#E57A5D]">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>
        <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter text-stone-900 mt-1">
          {greeting()}, {user?.name?.split(" ")[0] || "there"}.
        </h1>
        <p className="text-stone-600 mt-1.5">
          Here's your current risk and activity overview.
        </p>
      </header>

      {/* Hero quick actions */}
      <section className="grid sm:grid-cols-2 gap-3 sm:gap-4" data-testid="hero-actions">
        <Link
          to="/incidents/new"
          data-testid="hero-log-incident"
          className="group flex items-center gap-4 bg-[#B23A48] hover:bg-[#962F3B] text-white rounded-2xl p-5 sm:p-6 shadow-sm transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <ShieldAlert size={24} />
          </div>
          <div className="flex-1">
            <div className="font-display font-bold text-lg sm:text-xl">
              Log Incident
            </div>
            <div className="text-xs sm:text-sm text-white/80">
              Record concerns & safeguarding flags
            </div>
          </div>
          <PlusCircle
            size={22}
            className="opacity-70 group-hover:opacity-100 transition-opacity"
          />
        </Link>
        <Link
          to="/notes"
          data-testid="hero-add-note"
          className="group flex items-center gap-4 bg-[#2D6A4F] hover:bg-[#22513C] text-white rounded-2xl p-5 sm:p-6 shadow-sm transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Mic size={24} />
          </div>
          <div className="flex-1">
            <div className="font-display font-bold text-lg sm:text-xl">
              Add Daily Note
            </div>
            <div className="text-xs sm:text-sm text-white/80">
              Voice or text — log in seconds
            </div>
          </div>
          <PlusCircle
            size={22}
            className="opacity-70 group-hover:opacity-100 transition-opacity"
          />
        </Link>
      </section>

      {/* Risk overview */}
      <section data-testid="risk-overview">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-lg text-stone-900">
            Risk overview
          </h3>
          <span className="text-xs uppercase tracking-wider text-stone-500">
            Live status
          </span>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <RiskTile
            testid="risk-high-alerts"
            label="High Risk Alerts"
            value={high}
            status={rag(high, 1, 1)}
            icon={AlertTriangle}
          />
          <RiskTile
            testid="risk-overdue"
            label="Overdue Tasks"
            value={overdue}
            status={rag(overdue, 3, 1)}
            icon={Clock3}
          />
          <RiskTile
            testid="risk-missing"
            label="Missing Records"
            value={missing}
            status={rag(missing, 2, 1)}
            icon={FileWarning}
          />
        </div>
      </section>

      {/* Action cards */}
      <section data-testid="action-cards">
        <h3 className="font-display font-bold text-lg text-stone-900 mb-3">
          Modules
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {cards.map((c) => (
            <ActionCard key={c.to} {...c} />
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white border divider-soft rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-base text-stone-900">
              Recent incidents
            </h3>
            <Link
              to="/incidents"
              className="text-xs font-semibold text-[#1E4D5C] hover:underline inline-flex items-center gap-1"
            >
              All <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="space-y-2.5">
            {(stats?.recent_incidents || []).length === 0 && (
              <div className="text-sm text-stone-500 py-6 text-center">
                No incidents logged yet.
              </div>
            )}
            {(stats?.recent_incidents || []).slice(0, 3).map((inc) => (
              <div
                key={inc.id}
                className={`p-3.5 rounded-xl border-l-4 border-y border-r divider-soft bg-stone-50/60 ${
                  inc.safeguarding ? "border-l-[#B23A48]" : "border-l-[#D4A373]"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    {inc.category} · {inc.severity}
                    {inc.safeguarding && (
                      <span className="ml-1.5 text-[#B23A48]">· safeguarding</span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500 shrink-0 font-mono">
                    {formatFullTimestamp(inc.created_at)}
                  </div>
                </div>
                <p className="text-sm text-stone-800 leading-snug line-clamp-2">
                  {inc.body}
                </p>
                <div className="text-[10px] text-stone-500 mt-1.5 font-medium">
                  by {inc.author_name}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border divider-soft rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-base text-stone-900">
              Recent daily notes
            </h3>
            <Link
              to="/notes"
              className="text-xs font-semibold text-[#1E4D5C] hover:underline inline-flex items-center gap-1"
            >
              All <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="space-y-2.5">
            {(stats?.recent_notes || []).length === 0 && (
              <div className="text-sm text-stone-500 py-6 text-center">
                No notes yet — tap voice to log your first.
              </div>
            )}
            {(stats?.recent_notes || []).slice(0, 3).map((n) => (
              <div
                key={n.id}
                className="p-3.5 rounded-xl border-l-4 border-l-[#2D6A4F] border-y border-r divider-soft bg-stone-50/60"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    {n.category}
                    {n.voice_used && (
                      <span className="ml-1.5 text-[#E57A5D]">· voice</span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500 shrink-0 font-mono">
                    {formatFullTimestamp(n.created_at)}
                  </div>
                </div>
                <p className="text-sm text-stone-800 leading-snug line-clamp-2">
                  {n.body}
                </p>
                <div className="text-[10px] text-stone-500 mt-1.5 font-medium">
                  by {n.author_name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
