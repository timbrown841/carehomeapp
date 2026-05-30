import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import {
  Mic,
  Pill,
  CalendarCheck,
  NotebookPen,
  ClipboardList,
  ArrowRight,
  AlertTriangle,
  AlertOctagon,
  Siren,
  ShieldAlert,
  CalendarClock,
  CheckCircle2,
  Footprints,
  HeartPulse,
  Users as UsersI,
  Map,
  Scale,
  ListChecks,
} from "lucide-react";

const CHILDREN_ACTIONS = [
  { label: "Log Incident", to: "/incidents/new", icon: Mic, accent: "#A8273A", testid: "qa-incident", primary: true },
  { label: "Shift Handover", to: "/handover", icon: ClipboardList, accent: "#0e3b4a", testid: "qa-handover" },
  { label: "Tasks", to: "/tasks", icon: ListChecks, accent: "#0e3b4a", testid: "qa-tasks" },
  { label: "Key Work", to: "/key-work", icon: UsersI, accent: "#0e3b4a", testid: "qa-key-work" },
  { label: "Missing Episode", to: "/missing", icon: Map, accent: "#B8772F", testid: "qa-missing" },
  { label: "Body Map", to: "/body-maps", icon: ShieldAlert, accent: "#2F6A3A", testid: "qa-body-map" },
];

const ADULT_ACTIONS = [
  { label: "Log Incident", to: "/incidents/new", icon: Mic, accent: "#A8273A", testid: "qa-incident", primary: true },
  { label: "MAR Round", to: "/medications", icon: Pill, accent: "#3F2E5C", testid: "qa-medication" },
  { label: "Tasks", to: "/tasks", icon: ListChecks, accent: "#0e3b4a", testid: "qa-tasks" },
  { label: "Care Task", to: "/care-tasks", icon: CheckCircle2, accent: "#0e3b4a", testid: "qa-care-task" },
  { label: "Fall / Mobility", to: "/falls", icon: Footprints, accent: "#B8772F", testid: "qa-fall" },
  { label: "Wellbeing", to: "/wellbeing", icon: HeartPulse, accent: "#2F6A3A", testid: "qa-wellbeing" },
];

export function QuickActions() {
  const { isAdultMode } = useOrg();
  const actions = isAdultMode ? ADULT_ACTIONS : CHILDREN_ACTIONS;
  return (
    <section data-testid="quick-actions" className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5d6068] px-1">
        Quick actions
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.to}
              to={a.to}
              data-testid={a.testid}
              className={`group bg-white border divider-soft rounded-xl px-4 py-3.5 flex items-center gap-3 hover:-translate-y-0.5 hover:shadow-card-lg transition-all duration-150 ${
                a.primary ? "ring-1 ring-[#A8273A]/30" : ""
              }`}
            >
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                style={{ background: a.accent + "12", color: a.accent }}
              >
                <Icon size={17} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#0F1115] truncate">
                  {a.label}
                </div>
              </div>
              <ArrowRight
                size={13}
                className="text-[#8a8d95] group-hover:text-[#0e3b4a] group-hover:translate-x-0.5 transition-all"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const URGENCY_TONES = {
  red: { fg: "#A8273A", bg: "#A8273A12", line: "#A8273A" },
  amber: { fg: "#B8772F", bg: "#B8772F12", line: "#B8772F" },
  blue: { fg: "#0e3b4a", bg: "#0e3b4a10", line: "#0e3b4a" },
  green: { fg: "#2F6A3A", bg: "#2F6A3A12", line: "#2F6A3A" },
};

export function UrgencyWidgets() {
  const { isAdultMode } = useOrg();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/dashboard/urgency").then((r) => setData(r.data)).catch(() => setData(null));
  }, []);
  if (!data) return null;

  const childrenWidgets = [
    {
      label: "Open safeguarding",
      value: data.open_safeguarding,
      tone: data.open_safeguarding > 0 ? "red" : "green",
      icon: ShieldAlert,
      to: "/incidents",
      sub: data.open_safeguarding > 0 ? "Need review" : "All clear",
      testid: "u-safeguarding",
    },
    {
      label: "Currently missing",
      value: data.open_missing,
      tone: data.open_missing > 0 ? "red" : "green",
      icon: Siren,
      to: "/residents",
      sub: data.open_missing > 0 ? "Active episode" : "No active episodes",
      testid: "u-missing",
    },
    {
      label: "Risk reviews overdue",
      value: data.risk_reviews_overdue,
      tone: data.risk_reviews_overdue > 0 ? "amber" : "green",
      icon: AlertTriangle,
      to: "/residents",
      sub: data.risk_reviews_overdue > 0 ? "Action needed" : "All up to date",
      testid: "u-reviews",
    },
    {
      label: "Missed doses (24h)",
      value: data.missed_doses_24h,
      tone: data.missed_doses_24h > 0 ? "red" : "green",
      icon: Pill,
      to: "/medications",
      sub: data.missed_doses_24h > 0 ? "Sign or chase" : "100% signed",
      testid: "u-missed",
    },
    {
      label: "Statutory visits overdue",
      value: data.overdue_visits,
      tone: data.overdue_visits > 0 ? "amber" : "green",
      icon: CalendarClock,
      to: "/visits",
      sub: data.overdue_visits > 0 ? "Reschedule" : "On track",
      testid: "u-visits-overdue",
    },
    {
      label: "Visits next 14d",
      value: data.upcoming_visits,
      tone: "blue",
      icon: CalendarCheck,
      to: "/visits",
      sub: "Planned",
      testid: "u-visits-upcoming",
    },
  ];

  // Adult-mode prioritises the operational signals that matter for CQC adult care:
  // overdue care tasks, MAR refusals, mobility/falls signal, wellbeing reviews.
  const adultWidgets = [
    {
      label: "Adult safeguarding",
      value: data.open_safeguarding,
      tone: data.open_safeguarding > 0 ? "red" : "green",
      icon: ShieldAlert,
      to: "/incidents",
      sub: data.open_safeguarding > 0 ? "Need review" : "All clear",
      testid: "u-safeguarding",
    },
    {
      label: "Overdue care tasks",
      value: data.care_tasks_overdue ?? 0,
      tone: (data.care_tasks_overdue ?? 0) > 0 ? "red" : "green",
      icon: CheckCircle2,
      to: "/care-tasks",
      sub: (data.care_tasks_overdue ?? 0) > 0 ? "Coverage gap" : "On schedule",
      testid: "u-care-tasks",
    },
    {
      label: "MAR refusals (14d)",
      value: data.medication_refusals_14d ?? 0,
      tone: (data.medication_refusals_14d ?? 0) >= 3 ? "amber" : "green",
      icon: Pill,
      to: "/medications",
      sub: (data.medication_refusals_14d ?? 0) >= 3 ? "Pattern · review" : "No pattern",
      testid: "u-mar-refusals",
    },
    {
      label: "Falls (30d)",
      value: data.falls_30d ?? 0,
      tone: (data.falls_30d ?? 0) >= 3 ? "amber" : "green",
      icon: Footprints,
      to: "/falls",
      sub: (data.falls_30d ?? 0) >= 3 ? "Cluster forming" : "Stable",
      testid: "u-falls",
    },
    {
      label: "Wellbeing reviews due",
      value: data.wellbeing_reviews_due ?? data.risk_reviews_overdue,
      tone: (data.wellbeing_reviews_due ?? data.risk_reviews_overdue) > 0 ? "amber" : "green",
      icon: HeartPulse,
      to: "/wellbeing",
      sub: "Action needed",
      testid: "u-wellbeing-reviews",
    },
    {
      label: "Missed doses (24h)",
      value: data.missed_doses_24h,
      tone: data.missed_doses_24h > 0 ? "red" : "green",
      icon: Pill,
      to: "/medications",
      sub: data.missed_doses_24h > 0 ? "Sign or chase" : "100% signed",
      testid: "u-missed",
    },
  ];

  const widgets = isAdultMode ? adultWidgets : childrenWidgets;

  return (
    <section data-testid="urgency-widgets" className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5d6068] px-1">
        At a glance
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {widgets.map((w) => {
          const Icon = w.icon;
          const tone = URGENCY_TONES[w.tone];
          const safe = w.tone === "green";
          return (
            <Link
              key={w.label}
              to={w.to}
              data-testid={w.testid}
              className="group bg-white border-l-4 border-y border-r divider-soft rounded-xl p-3.5 hover:-translate-y-0.5 hover:shadow-card-lg transition-all duration-150"
              style={{ borderLeftColor: tone.line }}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068] leading-tight">
                  {w.label}
                </div>
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  {safe ? <CheckCircle2 size={12} /> : <Icon size={12} />}
                </span>
              </div>
              <div
                className="font-display-bold text-3xl tabular-nums leading-none mt-1.5"
                style={{ color: tone.fg }}
              >
                {w.value}
              </div>
              <div className="text-[11px] text-[#5d6068] mt-1 truncate">{w.sub}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
