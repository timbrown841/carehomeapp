import { Link } from "react-router-dom";
import {
  Mic, NotebookPen, AlertOctagon, Pill, Wallet, ClipboardList, PhoneCall,
  Users as UsersIcon, MessageSquare, AlertTriangle, CalendarClock,
  Activity, Footprints, ClipboardCheck, Eye,
} from "lucide-react";
import { isAdultService } from "@/lib/serviceTypes";

/**
 * Sector-aware Quick Actions panel.
 *
 * Children's services (safeguarding-first):
 *   Daily note · Incident · Missing · Body map · Key Work · Medication · Pocket money · Handover
 *
 * Adult services (care-task / health-first):
 *   Daily obs · Medication · Care task · Fall · Appointment · Welfare check · MCA · Contact
 */
export default function QuickActionsPanel({ resident, onTabChange, onAddNote, onLogIncident }) {
  if (!resident) return null;
  const adult = isAdultService(resident.service_type);
  const rid = resident.id;

  const children = [
    { label: "Add daily note",   icon: NotebookPen,   tone: "#2F6A3A", onClick: onAddNote,        testid: "qa-resident-note" },
    { label: "Log incident",     icon: Mic,           tone: "#A8273A", onClick: onLogIncident,    testid: "qa-resident-incident" },
    { label: "Missing from care",icon: AlertOctagon,  tone: "#A8273A", to: `/residents/${rid}?tab=safeguarding`, testid: "qa-resident-missing" },
    { label: "Body map",         icon: UsersIcon,     tone: "#7A4F8C", to: `/residents/${rid}?tab=safeguarding`, testid: "qa-resident-bodymap" },
    { label: "Start key work",   icon: MessageSquare, tone: "#0E3B4A", to: `/key-work/new?resident_id=${rid}`,    testid: "qa-resident-keywork" },
    { label: "Medication",       icon: Pill,          tone: "#7A4F8C", to: `/residents/${rid}?tab=health`,       testid: "qa-resident-meds" },
    { label: "Pocket money",     icon: Wallet,        tone: "#0e3b4a", to: `/residents/${rid}?tab=finance`,      testid: "qa-resident-finance" },
    { label: "Handover note",    icon: ClipboardList, tone: "#0e3b4a", to: "/handover",                          testid: "qa-resident-handover" },
  ];

  const adults = [
    { label: "Care task",         icon: ClipboardList,   tone: "#3F4F8C", to: `/residents/${rid}?tab=daily-care`,      testid: "qa-resident-care-task" },
    { label: "Wellbeing obs",     icon: Eye,             tone: "#2F6A3A", to: `/residents/${rid}?tab=daily-care`,      testid: "qa-resident-note" },
    { label: "Log fall",          icon: Footprints,      tone: "#A8273A", to: `/residents/${rid}?tab=health`,          testid: "qa-resident-fall" },
    { label: "Medication",        icon: Pill,            tone: "#7A4F8C", to: `/residents/${rid}?tab=health`,          testid: "qa-resident-meds" },
    { label: "Mobility",          icon: Activity,        tone: "#3F4F8C", to: `/residents/${rid}?tab=health`,          testid: "qa-resident-mobility" },
    { label: "Appointment",       icon: CalendarClock,   tone: "#1C5C8C", to: `/residents/${rid}?tab=health`,          testid: "qa-resident-appointment" },
    { label: "MCA / capacity",    icon: ClipboardCheck,  tone: "#7A4F8C", to: `/residents/${rid}?tab=safeguarding`,    testid: "qa-resident-mca" },
    { label: "Welfare check",     icon: PhoneCall,       tone: "#5d6068", onClick: onAddNote,                          testid: "qa-resident-welfare" },
  ];

  const actions = adult ? adults : children;

  return (
    <div data-testid="quick-actions-panel" data-sector={adult ? "adult" : "children"}>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5d6068]">
          Quick actions
        </div>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded"
          style={{ background: adult ? "#3F4F8C18" : "#0e3b4a18", color: adult ? "#3F4F8C" : "#0e3b4a" }}
        >
          {adult ? "Adult services" : "Children's services"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {actions.map((a) => {
          const Icon = a.icon;
          const inner = (
            <>
              <span
                className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                style={{ background: a.tone + "16", color: a.tone }}
              >
                <Icon size={14} />
              </span>
              <span className="text-xs font-semibold text-[#0F1115] truncate">
                {a.label}
              </span>
            </>
          );
          return a.to ? (
            <Link
              key={a.label}
              to={a.to}
              data-testid={a.testid}
              className="bg-white border divider-soft rounded-xl px-2.5 py-2 flex items-center gap-2 hover:shadow-card-lg transition-shadow"
            >
              {inner}
            </Link>
          ) : (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              data-testid={a.testid}
              className="bg-white border divider-soft rounded-xl px-2.5 py-2 flex items-center gap-2 hover:shadow-card-lg transition-shadow text-left"
            >
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
