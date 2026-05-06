import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  AlertOctagon,
  Skull,
  Pill,
  ShieldAlert,
  Flame,
  Users as UsersIcon,
  Eye,
  Loader2,
} from "lucide-react";

const ICON_BY_KEY = {
  high_risk: Skull,
  missing: AlertOctagon,
  self_harm: Flame,
  exploitation: Eye,
  gang: UsersIcon,
  violence: ShieldAlert,
  ligature: ShieldAlert,
  allergy: Pill,
  medication: Pill,
  immunisation: Pill,
  default: ShieldAlert,
};

export default function AlertsAndRisksBar({ resident, badges, episodes, medications }) {
  const [open, setOpen] = useState(true);
  if (!resident) return null;

  const items = [];

  // Active missing episode
  const activeMissing = (episodes || []).find((e) => e.status === "open");
  if (activeMissing) {
    items.push({
      key: "missing",
      tone: "#A8273A",
      label: "CURRENTLY MISSING",
      desc: `Reported ${(activeMissing.reported_at || "").slice(0, 16).replace("T", " ")}`,
    });
  }

  // Risk level from resident
  const rl = (resident.risk_level || "").toLowerCase();
  if (rl === "high" || rl === "critical") {
    items.push({
      key: "high_risk",
      tone: "#A8273A",
      label: "HIGH RISK",
      desc: resident.risk_summary || "See risk plan",
    });
  } else if (rl === "amber" || rl === "medium") {
    items.push({
      key: "high_risk",
      tone: "#B8772F",
      label: "AMBER RISK",
      desc: resident.risk_summary || "Monitor closely",
    });
  }

  // From badges API (already computed server-side)
  for (const b of badges || []) {
    const tone = b.tone === "red" ? "#A8273A" : b.tone === "amber" ? "#B8772F" : "#0e3b4a";
    if (b.label === "Currently Missing") continue; // already shown
    if (b.label === "High Risk") continue; // already shown
    if (
      b.label === "Risk Review Overdue" ||
      b.label === "PEP Overdue" ||
      b.label === "Immunisation Overdue"
    ) {
      items.push({
        key: "compliance",
        tone,
        label: b.label.toUpperCase(),
        desc: "Action required",
      });
    } else {
      items.push({
        key: b.label.toLowerCase().replace(/\s+/g, "_"),
        tone,
        label: b.label.toUpperCase(),
        desc: "",
      });
    }
  }

  // Allergies
  if ((resident.allergies || []).length) {
    items.push({
      key: "allergy",
      tone: "#A8273A",
      label: "ALLERGIES",
      desc: (resident.allergies || []).slice(0, 3).join(", "),
    });
  }

  // Active medications count
  const active = (medications || []).filter((m) => !m.discontinued_at).length;
  if (active > 0) {
    items.push({
      key: "medication",
      tone: "#0e3b4a",
      label: "ACTIVE MEDS",
      desc: `${active} ${active === 1 ? "medication" : "medications"}`,
    });
  }

  if (items.length === 0) {
    return (
      <div
        data-testid="alerts-bar-empty"
        className="bg-[#2F6A3A]/8 border-l-4 border-[#2F6A3A] divider-soft border-y border-r rounded-2xl px-4 py-3 flex items-center gap-3"
      >
        <span className="w-8 h-8 rounded-lg bg-[#2F6A3A]/15 text-[#2F6A3A] flex items-center justify-center shrink-0">
          <ShieldAlert size={14} />
        </span>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#2F6A3A]">
            All clear
          </div>
          <div className="text-xs text-[#2f3038] mt-0.5">
            No active alerts or risks for {resident.name} right now.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="alerts-and-risks-bar"
      className="bg-[#A8273A]/5 border-l-4 border-[#A8273A] divider-soft border-y border-r rounded-2xl px-4 py-3"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 text-left"
        data-testid="alerts-bar-toggle"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="w-8 h-8 rounded-lg bg-[#A8273A] text-white flex items-center justify-center shrink-0">
            <AlertOctagon size={14} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A8273A]">
            Alerts & Risks · {items.length}
          </span>
        </div>
        <span className="text-[11px] text-[#5d6068]">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3" data-testid="alerts-list">
          {items.map((it, i) => {
            const Icon = ICON_BY_KEY[it.key] || ICON_BY_KEY.default;
            return (
              <div
                key={`${it.key}-${i}`}
                data-testid={`alert-${it.key}`}
                className="bg-white border-l-4 border-y border-r divider-soft rounded-xl px-3 py-2 flex items-start gap-2.5"
                style={{ borderLeftColor: it.tone }}
              >
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: it.tone + "16", color: it.tone }}
                >
                  <Icon size={13} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: it.tone }}>
                    {it.label}
                  </div>
                  {it.desc && (
                    <div className="text-xs text-[#2f3038] mt-0.5 truncate">
                      {it.desc}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Hook to load badges + episodes + medications for the alerts bar.
export function useResidentAlerts(residentId) {
  const [data, setData] = useState({ badges: [], episodes: [], medications: [], loading: true });
  useEffect(() => {
    if (!residentId) return;
    Promise.allSettled([
      api.get(`/residents/${residentId}/badges`),
      api.get(`/residents/${residentId}/missing`),
      api.get(`/residents/${residentId}/medications`),
    ]).then(([b, e, m]) => {
      setData({
        badges: b.status === "fulfilled" ? b.value.data?.badges || [] : [],
        episodes: e.status === "fulfilled" ? e.value.data || [] : [],
        medications: m.status === "fulfilled" ? m.value.data || [] : [],
        loading: false,
      });
    });
  }, [residentId]);
  return data;
}
