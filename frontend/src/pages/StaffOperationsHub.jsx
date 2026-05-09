import HubTabs from "@/components/HubTabs";
import { CalendarClock, ClipboardList, ClipboardCheck, GraduationCap, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

import Staff, { TrainingPage } from "@/pages/Staff";
import Handover from "@/pages/Handover";
import Supervisions from "@/pages/Supervisions";
import SaferRecruitment from "@/pages/SaferRecruitment";

export default function StaffOperationsHub() {
  const { tier } = useAuth();
  const tabs = [
    { id: "rota", label: "Rota & Shifts", icon: CalendarClock },
    { id: "handover", label: "Shift Handover", icon: ClipboardList },
    { id: "supervisions", label: "Supervisions", icon: ClipboardCheck },
    { id: "training", label: "Training", icon: GraduationCap },
    { id: "recruitment", label: "Safer Recruitment", icon: ShieldCheck, hidden: tier < 3 },
  ];

  return (
    <div className="space-y-6" data-testid="staff-ops-hub">
      <div>
        <h1 className="text-3xl font-semibold text-[#0F1115]">Staff Operations</h1>
        <p className="text-[13px] text-[#5d6068] mt-1 max-w-2xl">
          Rotas, handovers, supervisions, training and recruitment — everything that keeps
          the staff team running well during shifts.
        </p>
      </div>
      <HubTabs tabs={tabs} defaultTab="rota" testidPrefix="staffops-tab">
        {(active) => {
          if (active === "rota") return <Staff />;
          if (active === "handover") return <Handover />;
          if (active === "supervisions") return <Supervisions />;
          if (active === "training") return <TrainingPage />;
          if (active === "recruitment") return <SaferRecruitment />;
          return null;
        }}
      </HubTabs>
    </div>
  );
}
