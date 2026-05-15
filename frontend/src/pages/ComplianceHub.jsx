import { useState } from "react";
import HubTabs from "@/components/HubTabs";
import {
  BadgeCheck, HeartPulse, History, FileText, ShieldCheck,
  AlertTriangle, Sparkles, Network, Pill,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { useSectorCopy } from "@/lib/sectorCopy";

import OfstedReadiness from "@/pages/OfstedReadiness";
import CQCReadiness from "@/pages/CQCReadiness";
import AuditLog from "@/pages/AuditLog";
import Reports from "@/pages/Reports";
import Regulation44View from "@/pages/Regulation44View";
import InspectionSimulationView from "@/pages/InspectionSimulationView";
import CrossModulePatternsView from "@/pages/CrossModulePatternsView";

const ICONS = {
  BadgeCheck, HeartPulse, History, FileText, ShieldCheck,
  AlertTriangle, Sparkles, Network, Pill,
};

export default function ComplianceHub() {
  const { tier, user } = useAuth();
  const { isChildrenMode, isAdultMode } = useOrg();
  const copy = useSectorCopy();

  // Render the same tab structure the sector defines — single source of truth.
  const tabs = copy.complianceTabs
    .filter((t) => tier >= (t.minTier ?? 0))
    .map((t) => ({ ...t, icon: ICONS[t.icon] || BadgeCheck }));

  const render = (active) => {
    // Shared
    if (active === "audit") return <AuditLog />;
    if (active === "reports") return <Reports />;
    // Children
    if (active === "ofsted") return <OfstedReadiness />;
    if (active === "reg44") return <Regulation44View />;
    if (active === "simulation") return <InspectionSimulationView />;
    if (active === "patterns") return <CrossModulePatternsView />;
    if (active === "safeguarding") return <SafeguardingIntelligencePlaceholder mode="children" />;
    // Adult
    if (active === "cqc") return <CQCReadiness />;
    if (active === "kloe") return <KLOEMonitoringPlaceholder />;
    if (active === "care_quality") return <CareQualitySimulationPlaceholder />;
    if (active === "falls") return <FallsWellbeingPlaceholder />;
    if (active === "mca") return <MCAComplianceePlaceholder />;
    if (active === "med_care") return <MedicationCarePlaceholder />;
    return null;
  };

  return (
    <div className="space-y-6" data-testid="compliance-hub">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-semibold text-[#0F1115]">Compliance &amp; Oversight</h1>
            <span
              className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 rounded-full"
              style={{ background: copy.accent, color: "white" }}
              data-testid="sector-badge-compliance"
            >
              {copy.badgeLabel}
            </span>
          </div>
          <p className="text-[13px] text-[#5d6068] mt-1.5 max-w-2xl">
            {isChildrenMode &&
              "Inspection readiness, Reg 44 oversight, safeguarding intelligence and audit history — the leadership view of how your home is performing against Ofsted."}
            {isAdultMode &&
              "CQC readiness, KLOE monitoring, falls and wellbeing oversight, MCA/DoLS compliance and medication & care-task assurance — the leadership view of how your service is performing against CQC."}
          </p>
        </div>
      </div>
      {tabs.length === 0 ? (
        <div className="rounded-xl border divider-soft bg-white p-8 text-center text-[13px] text-[#5d6068]">
          You don&apos;t have access to any compliance tools. Speak to your manager if you need access.
        </div>
      ) : (
        <HubTabs tabs={tabs} defaultTab={tabs[0].id} testidPrefix="compliance-tab">
          {render}
        </HubTabs>
      )}
      {!user && null}
    </div>
  );
}

// ---- Placeholders for sub-areas not yet built ----
// These ship the IA correctly today; their content can be filled in next session.

function ComingSoon({ title, body, icon: Icon = Sparkles, accent = "#0e3b4a", testid }) {
  return (
    <div className="bg-white border divider-soft rounded-2xl p-8 text-center" data-testid={testid}>
      <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3" style={{ background: `${accent}18`, color: accent }}>
        <Icon size={20} />
      </div>
      <h3 className="text-base font-semibold text-[#0F1115]">{title}</h3>
      <p className="text-sm text-stone-600 max-w-md mx-auto mt-1">{body}</p>
      <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-stone-100 text-stone-600 mt-3">
        Phase next
      </span>
    </div>
  );
}

function SafeguardingIntelligencePlaceholder({ mode }) {
  return (
    <ComingSoon
      icon={AlertTriangle}
      accent="#A8273A"
      title="Safeguarding intelligence"
      body={`Patterns across ${mode === "children" ? "missing episodes, allegations, restraints and behaviour incidents" : "adult safeguarding alerts, capacity concerns and welfare incidents"}. The Cross-module intelligence panel on Ofsted/CQC already surfaces these — a dedicated drill-down view will live here.`}
      testid="safeguarding-placeholder"
    />
  );
}

function KLOEMonitoringPlaceholder() {
  return (
    <ComingSoon
      icon={ShieldCheck}
      accent="#3F2E5C"
      title="KLOE monitoring"
      body="Key Lines of Enquiry — Safe · Effective · Caring · Responsive · Well-led — auto-scored from real operational signals (care plans, MAR, MCA, complaints, supervisions). Mirrors the children's Reg 44 engine."
      testid="kloe-placeholder"
    />
  );
}

function CareQualitySimulationPlaceholder() {
  return (
    <ComingSoon
      icon={Sparkles}
      accent="#3F2E5C"
      title="Care quality simulation"
      body="Deterministic CQC inspection rehearsal. Picks 5 random service users, surfaces gaps in their records, generates a likely inspector path, and produces a pre-inspection scan PDF — the adult-care counterpart to the Ofsted simulation."
      testid="care-quality-sim-placeholder"
    />
  );
}

function FallsWellbeingPlaceholder() {
  return (
    <ComingSoon
      icon={AlertTriangle}
      accent="#B8772F"
      title="Falls & wellbeing oversight"
      body="Falls clusters by time-of-day, mobility deterioration patterns, weight/wellbeing trends. Live signals already flow into the wellbeing module — this is the leadership-level aggregation."
      testid="falls-wellbeing-placeholder"
    />
  );
}

function MCAComplianceePlaceholder() {
  return (
    <ComingSoon
      icon={BadgeCheck}
      accent="#0e3b4a"
      title="MCA / DoLS compliance"
      body="Capacity assessments due, DoLS authorisations expiring, best-interest decisions outstanding, advocacy involvement. One screen for the registered manager."
      testid="mca-placeholder"
    />
  );
}

function MedicationCarePlaceholder() {
  return (
    <ComingSoon
      icon={Pill}
      accent="#2F6A3A"
      title="Medication & care-task compliance"
      body="MAR completeness, refusals, PRN pattern intelligence and care-task coverage gaps across the service. Built on the existing MAR engine."
      testid="med-care-placeholder"
    />
  );
}
