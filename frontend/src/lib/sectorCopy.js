/**
 * useSectorCopy — Centralised, sector-aware terminology so the entire workspace
 * speaks the right language for the active session mode. Single source of truth
 * for "young people" vs "service users", "Ofsted" vs "CQC", etc.
 */
import { useOrg } from "@/context/OrgContext";

const CHILDREN = {
  // Identity
  sectorName: "Children's Services",
  sectorShort: "Children's",
  regulatorName: "Ofsted",
  regulationLong: "Ofsted-regulated children's home",
  // People
  residentSingular: "young person",
  residentPlural: "young people",
  residentTitleCase: "Young people",
  residentPossessive: "young person's",
  // Workflow nouns
  keyWorkLabel: "Key work",
  behaviourLabel: "Behaviour support",
  missingLabel: "Missing-from-care",
  // Compliance vocabulary
  complianceFramework: "Ofsted",
  complianceTabs: [
    { id: "ofsted",      label: "Ofsted Readiness",         icon: "BadgeCheck", minTier: 0 },
    { id: "reg44",       label: "Regulation 44",            icon: "ShieldCheck", minTier: 1 },
    { id: "safeguarding",label: "Safeguarding Intelligence",icon: "AlertTriangle", minTier: 1 },
    { id: "simulation",  label: "Inspection Simulation",    icon: "Sparkles", minTier: 2 },
    { id: "patterns",    label: "Cross-Module Intelligence",icon: "Network", minTier: 1 },
    { id: "audit",       label: "Audit Log",                icon: "History", minTier: 2 },
    { id: "reports",     label: "AI Reports",               icon: "FileText", minTier: 3 },
  ],
  // Theme
  accent: "#0F2A47",
  accentSoft: "#0F2A4715",
  badgeLabel: "OFSTED",
};

const ADULT = {
  // Identity
  sectorName: "Adult Care Services",
  sectorShort: "Adult Care",
  regulatorName: "CQC",
  regulationLong: "CQC-regulated adult care",
  // People
  residentSingular: "service user",
  residentPlural: "service users",
  residentTitleCase: "Service users",
  residentPossessive: "service user's",
  // Workflow nouns
  keyWorkLabel: "Support hours",
  behaviourLabel: "Wellbeing support",
  missingLabel: "Whereabouts log",
  // Compliance vocabulary
  complianceFramework: "CQC",
  complianceTabs: [
    { id: "cqc",         label: "CQC Readiness",            icon: "HeartPulse", minTier: 0 },
    { id: "kloe",        label: "KLOE Monitoring",          icon: "ShieldCheck", minTier: 1 },
    { id: "care_quality",label: "Care Quality Simulation",  icon: "Sparkles", minTier: 2 },
    { id: "falls",       label: "Falls & Wellbeing Oversight", icon: "AlertTriangle", minTier: 1 },
    { id: "mca",         label: "MCA / DoLS Compliance",    icon: "BadgeCheck", minTier: 1 },
    { id: "med_care",    label: "Medication & Care Tasks",  icon: "Pill", minTier: 1 },
    { id: "audit",       label: "Audit Log",                icon: "History", minTier: 2 },
    { id: "reports",     label: "AI Reports",               icon: "FileText", minTier: 3 },
  ],
  // Theme
  accent: "#3F2E5C",
  accentSoft: "#3F2E5C15",
  badgeLabel: "CQC",
};

export function useSectorCopy() {
  const { effectiveMode } = useOrg();
  return effectiveMode === "adult" ? ADULT : CHILDREN;
}

// Standalone helper for non-React contexts (PDF builders etc.)
export function getSectorCopy(mode) {
  return mode === "adult" ? ADULT : CHILDREN;
}
