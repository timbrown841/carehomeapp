import HubTabs from "@/components/HubTabs";
import { Users, Pill, Activity, CalendarCheck, Wallet } from "lucide-react";

import Residents from "@/pages/Residents";
import MedicationRound from "@/pages/MedicationRound";
import Incidents from "@/pages/Incidents";
import Visits from "@/pages/Visits";
import PocketMoney from "@/pages/PocketMoney";

/**
 * Adult Services hub — CQC-regulated adult residential, supported living,
 * elderly, dementia, mental health and veteran care. Pre-filters embedded
 * views to the adult sector.
 *
 * Tabs adapt to adult terminology:
 *   - "All Residents"  (vs "All Children")
 *   - "Medication Round" (kept — same operational concept)
 *   - "Wellbeing & Incidents" (vs "Incidents only")
 *   - "Appointments & Visits"
 *   - "Cross-home Finance"
 */
export default function AdultServicesHub() {
  const tabs = [
    { id: "all", label: "All Residents", icon: Users },
    { id: "medications", label: "Medication Round", icon: Pill },
    { id: "incidents", label: "Wellbeing &  Incidents", icon: Activity },
    { id: "visits", label: "Appointments & Visits", icon: CalendarCheck },
    { id: "finance", label: "Finance", icon: Wallet },
  ];

  return (
    <div className="space-y-6" data-testid="adult-services-hub" data-sector="adult">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 rounded bg-[#3F4F8C]/10 text-[#3F4F8C]">
            CQC regulated
          </span>
        </div>
        <h1 className="text-3xl font-semibold text-[#0F1115]">Adult Services</h1>
        <p className="text-[13px] text-[#5d6068] mt-1 max-w-2xl">
          Adult residential, supported living, elderly residential, dementia,
          mental health and veteran care. Care-task &amp; health-led workflows
          including medication, mobility, falls, appointments, MCA &amp; wellbeing.
        </p>
      </div>
      <HubTabs tabs={tabs} defaultTab="all" testidPrefix="adult-tab">
        {(active) => {
          if (active === "all") return <Residents sector="adult" />;
          if (active === "medications") return <MedicationRound />;
          if (active === "incidents") return <Incidents />;
          if (active === "visits") return <Visits />;
          if (active === "finance") return <PocketMoney />;
          return null;
        }}
      </HubTabs>
    </div>
  );
}
