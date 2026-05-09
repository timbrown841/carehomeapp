import HubTabs from "@/components/HubTabs";
import { Users, Pill, ShieldAlert, CalendarCheck, Wallet } from "lucide-react";

import Residents from "@/pages/Residents";
import MedicationRound from "@/pages/MedicationRound";
import Incidents from "@/pages/Incidents";
import Visits from "@/pages/Visits";
import PocketMoney from "@/pages/PocketMoney";

export default function ResidentsHub() {
  const tabs = [
    { id: "all", label: "All Residents", icon: Users },
    { id: "medications", label: "Medication Round", icon: Pill },
    { id: "incidents", label: "Incidents", icon: ShieldAlert },
    { id: "visits", label: "Statutory Visits", icon: CalendarCheck },
    { id: "finance", label: "Cross-home Finance", icon: Wallet },
  ];

  return (
    <div className="space-y-6" data-testid="residents-hub">
      <div>
        <h1 className="text-3xl font-semibold text-[#0F1115]">Residents &amp; Young People</h1>
        <p className="text-[13px] text-[#5d6068] mt-1 max-w-2xl">
          The operational hub for everyone in your care. Open a young person to access
          their full profile — daily care, safeguarding, health, education, finance,
          documents and chronology in one place.
        </p>
      </div>
      <HubTabs tabs={tabs} defaultTab="all" testidPrefix="residents-tab">
        {(active) => {
          if (active === "all") return <Residents />;
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
