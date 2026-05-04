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
  ArrowUpRight,
  AlertTriangle,
  Clock3,
  FileWarning,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Lock,
} from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const STATUS_COLORS = {
  red: { bg: "#B23A48", soft: "#B23A4815", text: "#B23A48", label: "Action Required" },
  amber: { bg: "#D4A373", soft: "#D4A37320", text: "#9C6B3D", label: "Watch" },
  green: { bg: "#3A5A40", soft: "#3A5A4015", text: "#3A5A40", label: "All clear" },
};

function rag(value, redAt = 1, amberAt = 1) {
  if (value >= redAt) return STATUS_COLORS.red;
  if (value >= amberAt) return STATUS_COLORS.amber;
  return STATUS_COLORS.green;
}

const RiskTile = ({ label, value, status, icon: Icon, testid, sub }) => (
  <div
    data-testid={testid}
    className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5 flex items-start gap-4 transition-shadow hover:shadow-sm"
    style={{ borderLeftColor: status.bg }}
  >
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: status.soft, color: status.text }}
    >
      <Icon size={22} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 leading-tight">
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
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
      {sub && (
        <div className="text-[11px] text-stone-500 mt-1 leading-snug">{sub}</div>
      )}
    </div>
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
    api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  const high = stats?.high_risk_alerts ?? 0;
  const overdue = stats?.overdue_tasks ?? 0;
  const missing = stats?.missing_records ?? 0;
  const supDue = stats?.supervisions_due ?? 0;
  const appOverdue = stats?.appraisals_overdue ?? 0;
  const trend = stats?.incidents_trend_pct ?? 0;
  const week = stats?.incidents_week ?? 0;
  const prev = stats?.incidents_prev_week ?? 0;

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
    <div className="space-y-7" data-testid="dashboard-page">
      {/* Hero CTA — primary action */}
      <section data-testid="primary-cta">
        <Link
          to="/incidents/new"
          data-testid="primary-log-incident"
          className="group block rounded-2xl bg-gradient-to-br from-[#0F2A47] via-[#1E4D5C] to-[#2D6A4F] text-white p-6 sm:p-8 shadow-md relative overflow-hidden hover:shadow-lg transition-all"
        >
          <div className="absolute -right-24 -top-24 w-64 h-64 rounded-full bg-white/5 blur-2xl pointer-events-none" />
          <div className="absolute -right-10 bottom-0 w-44 h-44 rounded-full bg-[#E57A5D]/15 blur-2xl pointer-events-none" />
          <div className="relative flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition-colors">
              <Mic size={30} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 mb-1.5">
                Reducing risk · Improving care · Empowering staff
              </div>
              <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tight">
                Log Incident in 30 seconds
              </h2>
              <p className="text-sm text-white/80 mt-1">
                Voice-powered. Instant save. Ofsted-ready.
              </p>
            </div>
            <div className="hidden sm:flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-white/15 group-hover:bg-white/25 transition-colors shrink-0">
              <ArrowUpRight size={22} />
            </div>
          </div>
        </Link>

        {/* Trust strip */}
        <div
          data-testid="trust-strip"
          className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          {[
            { icon: Zap, label: "All records saved instantly" },
            { icon: Lock, label: "Time-stamped evidence" },
            { icon: CheckCircle2, label: "No backlog" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border divider-soft text-xs font-semibold text-stone-700"
            >
              <span className="w-6 h-6 rounded-md bg-[#3A5A40]/12 text-[#3A5A40] flex items-center justify-center shrink-0">
                <item.icon size={13} />
              </span>
              {item.label}
            </div>
          ))}
        </div>
      </section>

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

      {/* Risk Overview */}
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
            sub={high > 0 ? "Open safeguarding or high-severity items" : "Nothing to action"}
          />
          <RiskTile
            testid="risk-overdue"
            label="Overdue Tasks"
            value={overdue}
            status={rag(overdue, 3, 1)}
            icon={Clock3}
            sub={overdue > 0 ? "Open >48h, awaiting review" : "Up to date"}
          />
          <RiskTile
            testid="risk-missing"
            label="Missing Records"
            value={missing}
            status={rag(missing, 2, 1)}
            icon={FileWarning}
            sub={
              missing > 0
                ? `Residents without a note in 24h`
                : "Every young person logged"
            }
          />
        </div>
      </section>

      {/* Risk Intelligence + Staff Compliance */}
      <section className="grid lg:grid-cols-2 gap-4">
        {/* Risk Intelligence */}
        <div
          data-testid="risk-intelligence"
          className="bg-white border divider-soft rounded-2xl p-5 sm:p-6"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-7 h-7 rounded-lg bg-[#1E4D5C]/12 text-[#1E4D5C] flex items-center justify-center">
              <Activity size={15} />
            </span>
            <h3 className="font-display font-bold text-base text-stone-900">
              Risk intelligence
            </h3>
          </div>
          <div className="flex items-baseline gap-3 mt-3">
            <span className="font-display text-4xl font-black text-stone-900">
              {week}
            </span>
            <span className="text-sm text-stone-600">incidents this week</span>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-bold ${
              trend > 0
                ? "bg-[#B23A48]/12 text-[#B23A48]"
                : trend < 0
                ? "bg-[#3A5A40]/12 text-[#3A5A40]"
                : "bg-stone-100 text-stone-600"
            }`}
            data-testid="risk-intelligence-trend"
          >
            {trend > 0 ? (
              <TrendingUp size={12} />
            ) : trend < 0 ? (
              <TrendingDown size={12} />
            ) : null}
            {trend > 0 ? `+${trend}%` : `${trend}%`} vs last week (
            {prev} prev)
          </div>

          {(stats?.top_tags || []).length > 0 && (
            <div className="mt-4 pt-4 border-t divider-soft">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">
                Recurring patterns
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stats.top_tags.map((t) => (
                  <span
                    key={t.tag}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-stone-100 text-stone-700"
                  >
                    {t.tag} <span className="text-stone-500">×{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {(stats?.top_types || []).length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {stats.top_types.map((t) => (
                <div
                  key={t.type}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-stone-50 border divider-soft text-xs"
                >
                  <span className="capitalize font-medium text-stone-700">
                    {t.type}
                  </span>
                  <span className="font-display font-bold text-stone-900">
                    {t.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Staff Compliance */}
        <div
          data-testid="staff-compliance"
          className="bg-white border divider-soft rounded-2xl p-5 sm:p-6"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-7 h-7 rounded-lg bg-[#0F2A47]/12 text-[#0F2A47] flex items-center justify-center">
              <UserCog size={15} />
            </span>
            <h3 className="font-display font-bold text-base text-stone-900">
              Staff compliance
            </h3>
          </div>
          <div className="text-xs text-stone-500 mb-3">
            Across {stats?.total_staff ?? 0} staff &amp; managers
          </div>

          <div className="space-y-2.5">
            <div
              data-testid="supervisions-due"
              className={`flex items-center justify-between p-3 rounded-xl border ${
                supDue > 0
                  ? "bg-[#D4A373]/10 border-[#D4A373]/30"
                  : "bg-[#3A5A40]/8 border-[#3A5A40]/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    supDue > 0
                      ? "bg-[#D4A373]/25 text-[#9C6B3D]"
                      : "bg-[#3A5A40]/20 text-[#3A5A40]"
                  }`}
                >
                  <ClipboardCheck size={16} />
                </span>
                <div>
                  <div className="font-display font-semibold text-sm text-stone-900">
                    Supervisions due
                  </div>
                  <div className="text-[11px] text-stone-600">
                    {supDue > 0
                      ? "Schedule a 1:1 within 30 days"
                      : "All staff supervised in last 30 days"}
                  </div>
                </div>
              </div>
              <span className="font-display text-2xl font-black text-stone-900">
                {supDue}
              </span>
            </div>

            <div
              data-testid="appraisals-overdue"
              className={`flex items-center justify-between p-3 rounded-xl border ${
                appOverdue > 0
                  ? "bg-[#B23A48]/8 border-[#B23A48]/25"
                  : "bg-[#3A5A40]/8 border-[#3A5A40]/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    appOverdue > 0
                      ? "bg-[#B23A48]/15 text-[#B23A48]"
                      : "bg-[#3A5A40]/20 text-[#3A5A40]"
                  }`}
                >
                  <BadgeCheck size={16} />
                </span>
                <div>
                  <div className="font-display font-semibold text-sm text-stone-900">
                    Appraisals overdue
                  </div>
                  <div className="text-[11px] text-stone-600">
                    {appOverdue > 0
                      ? "Annual appraisal cycle has lapsed"
                      : "All appraisals current"}
                  </div>
                </div>
              </div>
              <span className="font-display text-2xl font-black text-stone-900">
                {appOverdue}
              </span>
            </div>
          </div>

          <Link
            to="/supervisions"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#1E4D5C] hover:underline"
          >
            Manage supervisions <ArrowUpRight size={12} />
          </Link>
        </div>
      </section>

      {/* Module action cards */}
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
              <Link
                to={`/incidents/${inc.id}`}
                key={inc.id}
                className={`block p-3.5 rounded-xl border-l-4 border-y border-r divider-soft bg-stone-50/60 hover:bg-stone-50 transition-colors ${
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
              </Link>
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
