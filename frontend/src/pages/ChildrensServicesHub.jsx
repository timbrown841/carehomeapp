import HubTabs from "@/components/HubTabs";
import { Users, Pill, ShieldAlert, CalendarCheck, Wallet } from "lucide-react";

import Residents from "@/pages/Residents";
import MedicationRound from "@/pages/MedicationRound";
import Incidents from "@/pages/Incidents";
import Visits from "@/pages/Visits";
import PocketMoney from "@/pages/PocketMoney";

/**
 * Children's Services hub — Ofsted-regulated children's homes & semi-independent.
 * Pre-filters all embedded views to the children's sector.
 */
export default function ChildrensServicesHub() {
  const tabs = [
    { id: "all", label: "All Children", icon: Users },
    { id: "medications", label: "Medication Round", icon: Pill },
    { id: "incidents", label: "Incidents", icon: ShieldAlert },
    { id: "visits", label: "Statutory Visits", icon: CalendarCheck },
    { id: "finance", label: "Pocket Money", icon: Wallet },
  ];

  return (
    <div className="space-y-6" data-testid="childrens-services-hub" data-sector="children">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 rounded bg-[#0e3b4a]/10 text-[#0e3b4a]">
            Ofsted regulated
          </span>
        </div>
        <h1 className="text-3xl font-semibold text-[#0F1115]">Children&rsquo;s Services</h1>
        <p className="text-[13px] text-[#5d6068] mt-1 max-w-2xl">
          Children&rsquo;s homes &amp; semi-independent placements. Safeguarding-first
          workflows including missing-from-care, body maps, key work and education.
        </p>
      </div>
      <HubTabs tabs={tabs} defaultTab="all" testidPrefix="children-tab">
        {(active) => {
          if (active === "all") return <Residents sector="children" />;
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
