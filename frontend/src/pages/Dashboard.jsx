import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatFullTimestamp } from "@/lib/format";
import LogIncidentFAB from "@/components/LogIncidentFAB";
import AttentionNow from "@/components/AttentionNow";
import { QuickActions, UrgencyWidgets } from "@/components/dashboard/QuickWidgets";
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
  AlertOctagon,
  Clock3,
  FileWarning,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Lock,
  Sparkles,
} from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const SEVERITY_TAG = {
  high: { bg: "#B23A48", text: "#fff", label: "HIGH RISK" },
  medium: { bg: "#D4A373", text: "#5A3A1F", label: "MEDIUM" },
  low: { bg: "#3A5A40", text: "#fff", label: "LOW" },
};

function rag(value, redAt = 1, amberAt = 1) {
  if (value >= redAt) return "red";
  if (value >= amberAt) return "amber";
  return "green";
}

const RISK_COPY = {
  high: {
    red: { label: "Action Required NOW", icon: AlertOctagon, color: "#B23A48", bg: "#B23A48" },
    amber: { label: "Action Required", icon: AlertTriangle, color: "#9C6B3D", bg: "#D4A373" },
    green: { label: "All clear", icon: CheckCircle2, color: "#3A5A40", bg: "#3A5A40" },
  },
  overdue: {
    red: { label: "Immediate Attention", icon: AlertOctagon, color: "#B23A48", bg: "#B23A48" },
    amber: { label: "Watch", icon: Clock3, color: "#9C6B3D", bg: "#D4A373" },
    green: { label: "Up to date", icon: CheckCircle2, color: "#3A5A40", bg: "#3A5A40" },
  },
  missing: {
    red: { label: "Must Complete Today", icon: AlertOctagon, color: "#B23A48", bg: "#B23A48" },
    amber: { label: "Catch up", icon: AlertTriangle, color: "#9C6B3D", bg: "#D4A373" },
    green: { label: "All logged", icon: CheckCircle2, color: "#3A5A40", bg: "#3A5A40" },
  },
};

const RiskTile = ({ label, value, status, icon: Icon, testid, sub, urgent, kind }) => {
  const copy = RISK_COPY[kind][status];
  const StatusIcon = copy.icon;
  const isRed = status === "red";
  return (
    <div
      data-testid={testid}
      className={`bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5 flex items-start gap-4 transition-all hover:shadow-md ${
        isRed ? "ring-2 ring-[#B23A48]/15" : ""
      }`}
      style={{ borderLeftColor: copy.bg }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 relative"
        style={{ background: `${copy.bg}18`, color: copy.color }}
      >
        <Icon size={22} />
        {isRed && (
          <span
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#B23A48] ring-2 ring-white animate-pulse"
            aria-hidden
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 leading-tight">
          {label}
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="font-display text-3xl font-black text-stone-900">
            {value}
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1"
            style={{ background: `${copy.bg}18`, color: copy.color }}
          >
            <StatusIcon size={10} />
            {copy.label}
          </span>
        </div>
        {sub && (
          <div className="text-[11px] text-stone-500 mt-1 leading-snug">{sub}</div>
        )}
      </div>
    </div>
  );
};

const ActionCard = ({ to, label, sub, icon: Icon, accent, testid }) => (
  <Link
    to={to}
    data-testid={testid}
    className="group bg-white border divider-soft rounded-2xl p-5 hover:shadow-lg hover:border-stone-300 hover:-translate-y-1 transition-all flex flex-col gap-3 relative overflow-hidden"
  >
    <div
      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      style={{
        background: `radial-gradient(circle at top right, ${accent}10, transparent 60%)`,
      }}
    />
    <div className="flex items-center justify-between relative">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors group-hover:scale-105"
        style={{ background: `${accent}15`, color: accent }}
      >
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <ArrowUpRight
        size={16}
        className="text-stone-400 group-hover:text-stone-700 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
      />
    </div>
    <div className="relative">
      <div className="font-display font-semibold text-base text-stone-900">
        {label}
      </div>
      <div className="text-xs text-stone-500 mt-1 leading-relaxed">{sub}</div>
    </div>
  </Link>
);

const SeverityBadge = ({ severity, safeguarding }) => {
  const s = SEVERITY_TAG[severity] || SEVERITY_TAG.low;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
        style={{ background: s.bg, color: s.text }}
      >
        {s.label}
      </span>
      {safeguarding && (
        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#B23A48]/15 text-[#B23A48] inline-flex items-center gap-1">
          <ShieldAlert size={10} /> Safeguarding
        </span>
      )}
    </div>
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api
      .get("/dashboard/stats")
      .then((r) => setStats(r.data))
      .catch(() => {});
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
    { to: "/residents", label: "Residents / Young People", sub: "Profiles & background", icon: Users, accent: "#1E4D5C", testid: "card-residents" },
    { to: "/notes", label: "Daily Notes", sub: "Wellbeing & shift logs", icon: NotebookPen, accent: "#2D6A4F", testid: "card-notes" },
    { to: "/incidents/new", label: "Incident Reports", sub: "Safeguarding & escalations", icon: ShieldAlert, accent: "#B23A48", testid: "card-incidents" },
    { to: "/staff", label: "Staff Management", sub: "Team, rotas & roles", icon: UserCog, accent: "#0F2A47", testid: "card-staff" },
    { to: "/supervisions", label: "Supervisions & Appraisals", sub: "1:1s & development", icon: ClipboardCheck, accent: "#5B6E58", testid: "card-supervisions" },
    { to: "/reports", label: "Reports", sub: "AI-generated summaries", icon: FileText, accent: "#E57A5D", testid: "card-reports" },
    { to: "/ofsted", label: "Ofsted Readiness", sub: "Inspection checklist", icon: BadgeCheck, accent: "#1E4D5C", testid: "card-ofsted" },
  ];

  return (
    <div className="space-y-7" data-testid="dashboard-page">
      {/* Hero CTA — primary action */}
      <section data-testid="primary-cta">
        <Link
          to="/incidents/new"
          data-testid="primary-log-incident"
          className="group block rounded-2xl bg-gradient-to-br from-[#0F2A47] via-[#1E4D5C] to-[#2D6A4F] text-white p-6 sm:p-8 shadow-md relative overflow-hidden hover:shadow-xl transition-all"
        >
          <div className="absolute -right-24 -top-24 w-64 h-64 rounded-full bg-white/5 blur-2xl pointer-events-none" />
          <div className="absolute -right-10 bottom-0 w-44 h-44 rounded-full bg-[#E57A5D]/15 blur-2xl pointer-events-none" />
          <div className="relative flex items-start sm:items-center gap-5 flex-col sm:flex-row">
            <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 group-hover:bg-white/25 transition-colors">
              <Mic size={30} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 mb-1.5">
                Reducing risk · Improving care · Empowering staff
              </div>
              <h2 className="font-display font-semibold text-2xl sm:text-[28px] tracking-tight">
                Log Incident in 30 seconds
              </h2>
              <p className="text-sm text-white/80 mt-1">
                Voice-powered. Instant save. Ofsted-ready.
              </p>
            </div>
            <div
              data-testid="hero-cta-button"
              className="hidden lg:flex bg-[#B23A48] group-hover:bg-[#962F3B] rounded-2xl pl-4 pr-5 py-3 items-center gap-2.5 shadow-lg shadow-[#B23A48]/30 transition-colors"
            >
              <Mic size={20} />
              <div className="flex flex-col items-start">
                <span className="font-display font-bold text-base leading-tight">
                  Log Incident
                </span>
                <span className="text-[10px] font-semibold opacity-90 leading-tight">
                  Log in under 60 seconds
                </span>
              </div>
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
            { icon: CheckCircle2, label: "No backlog or delays" },
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

      {/* Personalised greeting — clean SaaS hierarchy */}
      <header data-testid="dashboard-greeting">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>
        <h1
          className="font-display font-semibold text-3xl sm:text-[34px] leading-tight text-[#0F1115] mt-1.5"
          style={{ letterSpacing: "-0.02em" }}
        >
          {greeting()}, {user?.name?.split(" ")[0] || "there"}.
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          Here's your current risk and activity overview.
        </p>
      </header>

      {/* Live attention strip — pulled from Ofsted readiness */}
      <AttentionNow />

      {/* Urgency widgets — operational at-a-glance */}
      <UrgencyWidgets />

      {/* Quick actions */}
      <QuickActions />

      {/* Risk Overview */}
      <section data-testid="risk-overview">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-lg text-stone-900">
            Risk overview
          </h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3A5A40] animate-pulse" />
            Live · auto-refreshed
          </span>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <RiskTile
            testid="risk-high-alerts"
            kind="high"
            label="High Risk Alerts"
            value={high}
            status={rag(high, 1, 1)}
            icon={AlertTriangle}
            sub={
              high > 0
                ? "Open safeguarding or high-severity items"
                : "Nothing to action right now"
            }
          />
          <RiskTile
            testid="risk-overdue"
            kind="overdue"
            label="Overdue Tasks"
            value={overdue}
            status={rag(overdue, 3, 1)}
            icon={Clock3}
            sub={
              overdue > 0
                ? "Open >48h, awaiting review"
                : "All open items reviewed within SLA"
            }
          />
          <RiskTile
            testid="risk-missing"
            kind="missing"
            label="Missing Records"
            value={missing}
            status={rag(missing, 2, 1)}
            icon={FileWarning}
            sub={
              missing > 0
                ? "Residents without a note in the last 24h"
                : "Every young person logged today"
            }
          />
        </div>
      </section>

      {/* Risk Intelligence + Staff Compliance */}
      <section className="grid lg:grid-cols-2 gap-4">
        {/* Risk Intelligence */}
        <div
          data-testid="risk-intelligence"
          className="bg-white border divider-soft rounded-2xl p-5 sm:p-6 flex flex-col"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#1E4D5C]/12 text-[#1E4D5C] flex items-center justify-center">
                <Activity size={15} />
              </span>
              <h3 className="font-display font-bold text-base text-stone-900">
                Risk intelligence
              </h3>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-stone-400 inline-flex items-center gap-1">
              <Sparkles size={10} /> Pattern detection
            </span>
          </div>

          <div className="mt-4 flex items-baseline gap-2.5 flex-wrap">
            <span
              className="font-display text-5xl font-black text-stone-900"
              data-testid="risk-intelligence-week-count"
            >
              {week}
            </span>
            <span className="font-display font-semibold text-base text-stone-600">
              {week === 1 ? "incident" : "incidents"} this week
            </span>
          </div>
          <div
            className={`inline-flex w-fit items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-full text-xs font-bold ${
              trend > 0
                ? "bg-[#B23A48]/12 text-[#B23A48]"
                : trend < 0
                ? "bg-[#3A5A40]/12 text-[#3A5A40]"
                : "bg-stone-100 text-stone-600"
            }`}
            data-testid="risk-intelligence-trend"
          >
            {trend > 0 ? (
              <>
                <TrendingUp size={12} /> ↑ {trend}% vs last week
              </>
            ) : trend < 0 ? (
              <>
                <TrendingDown size={12} /> ↓ {Math.abs(trend)}% vs last week
              </>
            ) : (
              "No change vs last week"
            )}
            <span className="text-stone-400 font-semibold">
              · {prev} prev
            </span>
          </div>

          {(stats?.top_tags || []).length > 0 && (
            <div className="mt-5 pt-4 border-t divider-soft">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2 inline-flex items-center gap-1.5">
                <AlertTriangle size={11} className="text-[#9C6B3D]" />
                Recurring patterns detected
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stats.top_tags.map((t) => (
                  <span
                    key={t.tag}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#D4A373]/15 text-[#9C6B3D] border border-[#D4A373]/25"
                  >
                    {t.tag}{" "}
                    <span className="text-[#9C6B3D]/70 font-mono">
                      ×{t.count}
                    </span>
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
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#0F2A47]/12 text-[#0F2A47] flex items-center justify-center">
                <UserCog size={15} />
              </span>
              <h3 className="font-display font-bold text-base text-stone-900">
                Staff compliance
              </h3>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-stone-400">
              {stats?.total_staff ?? 0} staff
            </span>
          </div>
          <div className="text-xs text-stone-500 mt-1">
            Equal weight to safeguarding — overdue staff actions are an Ofsted risk.
          </div>

          <div className="space-y-2.5 mt-4">
            <div
              data-testid="supervisions-due"
              className={`flex items-center justify-between p-3.5 rounded-xl border-l-4 ${
                supDue > 0
                  ? "bg-[#D4A373]/12 border-y border-r border-[#D4A373]/30 border-l-[#D4A373]"
                  : "bg-[#3A5A40]/8 border-y border-r border-[#3A5A40]/20 border-l-[#3A5A40]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    supDue > 0
                      ? "bg-[#D4A373]/30 text-[#9C6B3D]"
                      : "bg-[#3A5A40]/20 text-[#3A5A40]"
                  }`}
                >
                  <ClipboardCheck size={17} />
                </span>
                <div>
                  <div className="font-display font-bold text-sm text-stone-900">
                    Supervisions due
                  </div>
                  <div className="text-[11px] text-stone-700 font-medium">
                    {supDue > 0
                      ? "Schedule a 1:1 within 30 days"
                      : "All staff supervised in last 30 days"}
                  </div>
                </div>
              </div>
              <span
                className="font-display text-3xl font-black"
                style={{ color: supDue > 0 ? "#9C6B3D" : "#3A5A40" }}
              >
                {supDue}
              </span>
            </div>

            <div
              data-testid="appraisals-overdue"
              className={`flex items-center justify-between p-3.5 rounded-xl border-l-4 ${
                appOverdue > 0
                  ? "bg-[#B23A48]/8 border-y border-r border-[#B23A48]/25 border-l-[#B23A48]"
                  : "bg-[#3A5A40]/8 border-y border-r border-[#3A5A40]/20 border-l-[#3A5A40]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    appOverdue > 0
                      ? "bg-[#B23A48]/15 text-[#B23A48]"
                      : "bg-[#3A5A40]/20 text-[#3A5A40]"
                  }`}
                >
                  <BadgeCheck size={17} />
                </span>
                <div>
                  <div className="font-display font-bold text-sm text-stone-900">
                    Appraisals overdue
                  </div>
                  <div className="text-[11px] text-stone-700 font-medium">
                    {appOverdue > 0
                      ? "Annual appraisal cycle has lapsed"
                      : "All appraisals current"}
                  </div>
                </div>
              </div>
              <span
                className="font-display text-3xl font-black"
                style={{ color: appOverdue > 0 ? "#B23A48" : "#3A5A40" }}
              >
                {appOverdue}
              </span>
            </div>
          </div>

          <Link
            to="/supervisions"
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1E4D5C] hover:underline"
          >
            Manage supervisions <ArrowUpRight size={12} />
          </Link>
        </div>
      </section>

      {/* Module action cards */}
      <section data-testid="action-cards">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-lg text-stone-900">
            Modules
          </h3>
          <span className="text-[10px] uppercase tracking-wider text-stone-400">
            One tap. Always saved instantly.
          </span>
        </div>
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
          <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-3 inline-flex items-center gap-1.5">
            <Zap size={10} /> Saved instantly · time-stamped automatically
          </div>
          <div className="space-y-3">
            {(stats?.recent_incidents || []).length === 0 && (
              <div className="text-sm text-stone-500 py-6 text-center">
                No incidents logged yet.
              </div>
            )}
            {(stats?.recent_incidents || []).slice(0, 3).map((inc) => (
              <Link
                to={`/incidents/${inc.id}`}
                key={inc.id}
                className="block p-4 rounded-xl border-l-4 border-y border-r divider-soft bg-stone-50/60 hover:bg-stone-50 hover:shadow-sm transition-all"
                style={{
                  borderLeftColor:
                    inc.safeguarding || inc.severity === "high"
                      ? "#B23A48"
                      : inc.severity === "medium"
                      ? "#D4A373"
                      : "#3A5A40",
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-display font-bold text-sm text-stone-900 capitalize">
                      {inc.incident_type || inc.category}
                    </span>
                    <SeverityBadge
                      severity={inc.severity}
                      safeguarding={inc.safeguarding}
                    />
                  </div>
                  <div className="text-[10px] text-stone-500 shrink-0 font-mono text-right">
                    {formatFullTimestamp(inc.created_at)}
                  </div>
                </div>
                <p className="text-sm text-stone-800 leading-snug line-clamp-2">
                  {inc.body}
                </p>
                <div className="text-[10px] text-stone-500 mt-2 font-medium">
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
          <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-3 inline-flex items-center gap-1.5">
            <Lock size={10} /> Auto-signed by author · no backlog
          </div>
          <div className="space-y-3">
            {(stats?.recent_notes || []).length === 0 && (
              <div className="text-sm text-stone-500 py-6 text-center">
                No notes yet — tap voice to log your first.
              </div>
            )}
            {(stats?.recent_notes || []).slice(0, 3).map((n) => (
              <div
                key={n.id}
                className="p-4 rounded-xl border-l-4 border-l-[#2D6A4F] border-y border-r divider-soft bg-stone-50/60"
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <span className="font-display font-bold text-sm text-stone-900 capitalize">
                    {n.category}
                    {n.voice_used && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[#E57A5D]">
                        · voice
                      </span>
                    )}
                  </span>
                  <div className="text-[10px] text-stone-500 shrink-0 font-mono text-right">
                    {formatFullTimestamp(n.created_at)}
                  </div>
                </div>
                <p className="text-sm text-stone-800 leading-snug line-clamp-2">
                  {n.body}
                </p>
                <div className="text-[10px] text-stone-500 mt-2 font-medium">
                  by {n.author_name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sticky FAB for mobile/tablet */}
      <LogIncidentFAB />
    </div>
  );
}
