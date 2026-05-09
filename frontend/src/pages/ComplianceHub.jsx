import { useEffect, useState } from "react";
import api from "@/lib/api";
import HubTabs from "@/components/HubTabs";
import { BadgeCheck, HeartPulse, History, FileText } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

import OfstedReadiness from "@/pages/OfstedReadiness";
import CQCReadiness from "@/pages/CQCReadiness";
import AuditLog from "@/pages/AuditLog";
import Reports from "@/pages/Reports";

export default function ComplianceHub() {
  const { tier, user } = useAuth();
  const [hasAdult, setHasAdult] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get("/service-types/active")
      .then((r) => {
        if (cancelled) return;
        const sectors = r.data?.all_active_sectors || [];
        setHasAdult(sectors.includes("adult"));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const tabs = [
    { id: "ofsted", label: "Ofsted Readiness", icon: BadgeCheck },
    { id: "cqc", label: "CQC Readiness", icon: HeartPulse, hidden: !hasAdult || tier < 2 },
    { id: "audit", label: "Audit Log", icon: History, hidden: tier < 2 },
    { id: "reports", label: "AI Reports", icon: FileText, hidden: tier < 3 },
  ];

  return (
    <div className="space-y-6" data-testid="compliance-hub">
      <div>
        <h1 className="text-3xl font-semibold text-[#0F1115]">Compliance &amp; Oversight</h1>
        <p className="text-[13px] text-[#5d6068] mt-1 max-w-2xl">
          Inspection readiness, safeguarding analytics, audit history and AI summaries —
          the leadership view of how the home is performing.
        </p>
      </div>
      {tabs.filter((t) => !t.hidden).length === 0 ? (
        <div className="rounded-xl border divider-soft bg-white p-8 text-center text-[13px] text-[#5d6068]">
          You don&apos;t have access to any compliance tools. Speak to your manager if you need access.
        </div>
      ) : (
        <HubTabs tabs={tabs} defaultTab="ofsted" testidPrefix="compliance-tab">
          {(active) => {
            if (active === "ofsted") return <OfstedReadiness />;
            if (active === "cqc") return <CQCReadiness />;
            if (active === "audit") return <AuditLog />;
            if (active === "reports") return <Reports />;
            return null;
          }}
        </HubTabs>
      )}
      {!user && null}
    </div>
  );
}
