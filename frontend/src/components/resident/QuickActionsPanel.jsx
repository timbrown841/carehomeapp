import { Link } from "react-router-dom";
import {
  Mic,
  NotebookPen,
  AlertOctagon,
  Pill,
  Wallet,
  ClipboardList,
  PhoneCall,
  Users as UsersIcon,
} from "lucide-react";

export default function QuickActionsPanel({ resident, onTabChange, onAddNote, onLogIncident }) {
  if (!resident) return null;
  const actions = [
    { label: "Add daily note", icon: NotebookPen, tone: "#2F6A3A", onClick: onAddNote, testid: "qa-resident-note" },
    { label: "Log incident", icon: Mic, tone: "#A8273A", onClick: onLogIncident, testid: "qa-resident-incident" },
    { label: "Missing from care", icon: AlertOctagon, tone: "#A8273A", to: `/residents/${resident.id}?tab=safeguarding`, testid: "qa-resident-missing" },
    { label: "Body map", icon: UsersIcon, tone: "#5d6068", to: `/residents/${resident.id}?tab=safeguarding`, testid: "qa-resident-bodymap" },
    { label: "Medication", icon: Pill, tone: "#0e3b4a", to: `/residents/${resident.id}?tab=health`, testid: "qa-resident-meds" },
    { label: "Pocket money", icon: Wallet, tone: "#0e3b4a", to: `/residents/${resident.id}?tab=finance`, testid: "qa-resident-finance" },
    { label: "Handover note", icon: ClipboardList, tone: "#0e3b4a", to: "/handover", testid: "qa-resident-handover" },
    { label: "Contact", icon: PhoneCall, tone: "#5d6068", onClick: () => onTabChange?.("overview"), testid: "qa-resident-contact" },
  ];
  return (
    <div data-testid="quick-actions-panel">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5d6068] px-1 mb-2">
        Quick actions
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
