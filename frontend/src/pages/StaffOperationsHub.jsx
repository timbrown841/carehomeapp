import HubTabs from "@/components/HubTabs";
import { CalendarClock, ClipboardList, ClipboardCheck, GraduationCap, ShieldCheck, Heart, Activity, BookOpen, ScrollText, TrendingUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

import Staff, { TrainingPage } from "@/pages/Staff";
import Handover from "@/pages/Handover";
import Supervisions from "@/pages/Supervisions";
import SaferRecruitment from "@/pages/SaferRecruitment";
import HandoverDigest from "@/pages/HandoverDigest";
import InductionPolicyHub from "@/pages/InductionPolicyHub";
import MyPolicies from "@/pages/MyPolicies";
import GovernanceHub from "@/pages/GovernanceHub";
import PolicyIntelligence from "@/pages/PolicyIntelligence";
import { TeamWellbeingAwarenessCard } from "@/pages/ReflectionSupervision";
import BurnoutForecastPanel from "@/components/intelligence/BurnoutForecastPanel";

export default function StaffOperationsHub() {
  const { tier } = useAuth();
  const tabs = [
    { id: "rota", label: "Rota & Shifts", icon: CalendarClock },
    { id: "handover", label: "Shift Handover", icon: ClipboardList },
    { id: "digest", label: "Manager Digest", icon: Activity, hidden: tier < 3 },
    { id: "supervisions", label: "Supervisions", icon: ClipboardCheck },
    { id: "wellbeing", label: "Team Wellbeing", icon: Heart, hidden: tier < 3 },
    { id: "training", label: "Training", icon: GraduationCap },
    { id: "recruitment", label: "Safer Recruitment", icon: ShieldCheck, hidden: tier < 3 },
    { id: "policies", label: "Induction & Policy", icon: BookOpen },
    { id: "governance", label: "Governance", icon: ScrollText, hidden: tier < 3 },
    { id: "intelligence", label: "Intelligence", icon: TrendingUp, hidden: tier < 3 },
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
          if (active === "digest") return <HandoverDigest />;
          if (active === "supervisions") return <Supervisions />;
          if (active === "wellbeing") return <TeamWellbeingPanel />;
          if (active === "training") return <TrainingPage />;
          if (active === "recruitment") return <SaferRecruitment />;
          if (active === "policies") return (tier >= 3 ? <InductionPolicyHub /> : <MyPolicies />);
          if (active === "governance") return <GovernanceHub />;
          if (active === "intelligence") return <PolicyIntelligence />;
          return null;
        }}
      </HubTabs>
    </div>
  );
}

function TeamWellbeingPanel() {
  return (
    <div className="space-y-4" data-testid="team-wellbeing-panel">
      <BurnoutForecastPanel />
      <div className="bg-stone-50 border divider-soft rounded-2xl p-5">
        <p className="text-sm text-stone-700 leading-relaxed">
          A non-punitive, aggregate view of team wellbeing. Names appear only for staff who have
          explicitly shared a reflection for supervision; otherwise you'll see anonymised counts.
          Use this to <strong>open a conversation</strong>, not for monitoring.
        </p>
      </div>
      <TeamWellbeingAwarenessCard />
    </div>
  );
}

