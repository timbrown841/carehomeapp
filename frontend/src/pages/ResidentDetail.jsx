import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import api, { formatApiError, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { personaColor, personaInitials } from "@/lib/persona";
import { formatFullTimestamp } from "@/lib/format";
import MedicationsTab from "@/components/resident/MedicationsTab";
import BodyMapsTab from "@/components/resident/BodyMapsTab";
import HealthTab from "@/components/resident/HealthTab";
import EducationTab from "@/components/resident/EducationTab";
import VisitsTab from "@/components/resident/VisitsTab";
import PocketMoneyTab from "@/components/resident/PocketMoneyTab";
import IndependenceTracker from "@/components/resident/IndependenceTracker";
import DocumentsTab from "@/components/resident/DocumentsTab";
import ResidentPhoto from "@/components/resident/ResidentPhoto";
import ReturnInterviewModal from "@/components/resident/ReturnInterviewModal";
import InlineField from "@/components/resident/InlineField";
import AlertsAndRisksBar, { useResidentAlerts } from "@/components/resident/AlertsAndRisksBar";
import QuickActionsPanel from "@/components/resident/QuickActionsPanel";
import { AccordionSection } from "@/components/resident/Accordion";
import ServiceBadge from "@/components/ServiceBadge";
import { isAdultService } from "@/lib/serviceTypes";
import {
  ArrowLeft,
  AlertTriangle,
  Phone,
  ShieldAlert,
  Heart,
  FileText,
  Clock,
  User,
  Hash,
  CheckCircle2,
  Loader2,
  Siren,
  ShieldCheck,
  Sparkles,
  Send,
  Copy,
  Download,
  Plus,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "daily-care", label: "Daily Care" },
  { id: "safeguarding", label: "Safeguarding" },
  { id: "health", label: "Health" },
  { id: "education", label: "Education & Independence" },
  { id: "finance", label: "Finance" },
  { id: "documents", label: "Documents" },
  { id: "timeline", label: "Timeline" },
];

const RISK_THEME = {
  high: { bg: "#B23A48", soft: "#B23A4810", fg: "#B23A48", label: "HIGH" },
  medium: { bg: "#D4A373", soft: "#D4A37310", fg: "#9C6B3D", label: "MEDIUM" },
  low: { bg: "#3A5A40", soft: "#3A5A4010", fg: "#3A5A40", label: "LOW" },
};

function ageFrom(dob) {
  if (!dob) return null;
  try {
    const d = new Date(dob);
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  } catch {
    return null;
  }
}

function isOverdue(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

function FieldRow({ label, value, className = "", inline }) {
  return (
    <div className={`grid grid-cols-3 gap-4 py-2.5 border-b divider-soft last:border-0 ${className}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <div className="col-span-2 text-sm text-stone-800 break-words whitespace-pre-wrap">
        {inline ? inline : (value || <span className="text-stone-400 italic">Not specified</span>)}
      </div>
    </div>
  );
}

function TagList({ items, tone = "stone" }) {
  if (!items || !items.length)
    return <div className="text-sm text-stone-400 italic">None recorded</div>;
  const palette =
    tone === "red"
      ? "bg-[#B23A48]/10 text-[#B23A48] border-[#B23A48]/30"
      : tone === "green"
      ? "bg-[#3A5A40]/10 text-[#3A5A40] border-[#3A5A40]/30"
      : "bg-stone-100 text-stone-700 border-stone-200";
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span
          key={i}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${palette}`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function RagPill({ level }) {
  const t = RISK_THEME[level] || RISK_THEME.medium;
  return (
    <span
      className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full text-white"
      style={{ background: t.bg }}
      data-testid={`risk-pill-${level}`}
    >
      {t.label}
    </span>
  );
}

export default function ResidentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";
  const { user } = useAuth();
  const [resident, setResident] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [missingOpen, setMissingOpen] = useState(false);
  const canManage = user?.role === "manager" || user?.role === "admin";

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [r, t, e] = await Promise.all([
          api.get(`/residents/${id}`),
          api.get(`/residents/${id}/timeline`),
          api.get(`/residents/${id}/missing`),
        ]);
        if (!alive) return;
        setResident(r.data);
        setTimeline(t.data?.items || []);
        setEpisodes(e.data || []);
      } catch (err) {
        toast.error(formatApiError(err.response?.data?.detail) || "Could not load resident");
        nav("/residents");
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [id, nav]);

  const loadResident = async () => {
    try {
      const r = await api.get(`/residents/${id}`);
      setResident(r.data);
    } catch (err) {
      // ignore
    }
  };

  // Refresh episodes when a return interview is submitted (closes the episode)
  useEffect(() => {
    const handler = async () => {
      try {
        const e = await api.get(`/residents/${id}/missing`);
        setEpisodes(e.data || []);
      } catch (err) {
        // ignore
      }
    };
    window.addEventListener("safelyn:missing-refresh", handler);
    return () => window.removeEventListener("safelyn:missing-refresh", handler);
  }, [id]);

  const persona = useMemo(
    () => (resident ? personaColor(resident.name) : { hex: "#1E4D5C", soft: "#1E4D5C10", on: "#1E4D5C" }),
    [resident]
  );
  const age = ageFrom(resident?.dob);
  const risk = (resident?.risk_level || "medium").toLowerCase();
  const riskTheme = RISK_THEME[risk] || RISK_THEME.medium;
  const reviewOverdue = resident?.risk_next_review && isOverdue(resident.risk_next_review);

  if (loading) {
    return (
      <div className="text-center py-20 text-stone-500">
        <Loader2 className="animate-spin inline-block" /> Loading profile…
      </div>
    );
  }
  if (!resident) return null;

  const activeEpisode = episodes.find((e) => !e.returned_at);

  return (
    <div className="space-y-5" data-testid="resident-detail-page">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/residents"
          className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"
          data-testid="resident-back-link"
        >
          <ArrowLeft size={16} /> All residents
        </Link>
        <div className="flex items-center gap-2">
          {activeEpisode ? (
            <Link
              to="#"
              onClick={(e) => {
                e.preventDefault();
                setMissingOpen(true);
              }}
              data-testid="active-missing-banner"
              className="inline-flex items-center gap-2 bg-[#B23A48] text-white font-bold rounded-xl px-3.5 py-2 text-xs uppercase tracking-wider shadow-sm animate-pulse"
            >
              <Siren size={14} /> Missing — open pack
            </Link>
          ) : (
            <button
              type="button"
              data-testid="open-missing-pack-btn"
              onClick={() => setMissingOpen(true)}
              className="inline-flex items-center gap-2 bg-[#B23A48] hover:bg-[#962F3B] text-white font-bold rounded-xl px-4 py-2.5 text-sm shadow-sm transition-colors"
            >
              <Siren size={15} /> Child Missing
            </button>
          )}
        </div>
      </div>

      {/* Header card */}
      <header
        className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5 sm:p-6"
        style={{ borderLeftColor: persona.hex }}
      >
        <div className="flex items-start gap-5 flex-wrap">
          <ResidentPhoto
            resident={resident}
            persona={persona}
            initials={personaInitials(resident.name)}
            onUpdated={loadResident}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Young person
              </span>
              <RagPill level={risk} />
              {reviewOverdue && (
                <span
                  data-testid="review-overdue-pill"
                  className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-[#B23A48]/10 text-[#B23A48] border border-[#B23A48]/30 inline-flex items-center gap-1"
                >
                  <AlertTriangle size={10} /> Risk review overdue
                </span>
              )}
            </div>
            <h1 className="font-display font-semibold text-[28px] sm:text-[32px] leading-tight text-[#0F1115] mt-1.5" style={{ letterSpacing: "-0.02em" }}>
              {resident.name}
            </h1>
            <div className="text-sm text-stone-600 mt-1 flex flex-wrap gap-x-3 gap-y-1 items-center">
              {resident.preferred_name && resident.preferred_name !== resident.name && (
                <span>"{resident.preferred_name}"</span>
              )}
              {resident.dob && <span>· DOB {resident.dob}{age != null && ` (age ${age})`}</span>}
              {resident.gender && <span>· {resident.gender}</span>}
              {resident.room && <span>· Room {resident.room}</span>}
              <ServiceBadge serviceType={resident.service_type} />
            </div>
            {resident.placement_summary && (
              <p className="text-sm text-stone-700 mt-2.5 leading-relaxed">
                {resident.placement_summary}
              </p>
            )}
          </div>
          <div className="text-right text-xs text-stone-600 space-y-1 min-w-[180px]">
            <div className="inline-flex items-center gap-1.5">
              <User size={12} className="text-stone-400" />
              <span className="font-medium">Key worker · </span>
              <InlineField
                resident={resident}
                field="key_worker"
                label="Key worker"
                placeholder="—"
                onSaved={(updated) => setResident(updated)}
                className="font-medium"
              />
            </div>
            <div className="inline-flex items-center gap-1.5">
              <Heart size={12} className="text-stone-400" />
              <span className="font-medium">SW · </span>
              <InlineField
                resident={resident}
                field="social_worker_name"
                label="Social worker"
                placeholder="—"
                onSaved={(updated) => setResident(updated)}
                className="font-medium"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 text-stone-500">
              <Hash size={11} />
              <span className="font-mono uppercase tracking-wider">
                {String(resident.id).replace(/-/g, "").slice(-8).toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Always-visible Alerts & Risks bar */}
      <AlertsAndRisksWithData resident={resident} />

      {/* Quick Actions panel for mobile-first access */}
      <QuickActionsPanel resident={resident} onTabChange={setTab} />

      {/* Tab strip */}
      <nav
        className="flex gap-1 border-b divider-soft overflow-x-auto -mx-1 px-1 scrollbar-thin"
        data-testid="resident-tabs"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-[#1E4D5C] text-[#1E4D5C]"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab body */}
      <section data-testid={`tab-body-${tab}`} className="bg-white border divider-soft rounded-2xl p-5 sm:p-6">
        {tab === "overview" && (
          <div className="space-y-3">
            <OverviewTab resident={resident} age={age} />
            {isAdultService(resident.service_type) && (
              <AccordionSection
                title="Adult service profile"
                subtitle="NHS, GP, mental health, NOK, tenancy, support level"
                tone="#3F4F8C"
                defaultOpen
                testid="acc-adult-profile"
              >
                <AdultProfileSection resident={resident} />
              </AccordionSection>
            )}
            <AccordionSection
              title="Background & referral"
              subtitle="Placement reason, referral source, history"
              testid="acc-background"
            >
              <BackgroundTab resident={resident} />
            </AccordionSection>
            <AccordionSection
              title="Statutory visits"
              subtitle="IRO, social worker, Reg 44/45, LAC reviews"
              testid="acc-visits"
            >
              <VisitsTab resident={resident} />
            </AccordionSection>
          </div>
        )}

        {tab === "daily-care" && (
          <div className="space-y-3">
            <AccordionSection
              title="Care plan & wishes"
              subtitle="Children's views, wishes, feelings, positive relationships"
              defaultOpen
              testid="acc-care"
            >
              <CareTab resident={resident} />
            </AccordionSection>
            <AccordionSection
              title="Therapeutic key work"
              subtitle="Plan, run and reflect — supported by frameworks & resources"
              testid="acc-key-work"
            >
              <KeyWorkPanel resident={resident} />
            </AccordionSection>
            <AccordionSection
              title="Recent daily notes"
              subtitle="Latest staff observations & welfare checks for this young person"
              testid="acc-notes"
            >
              <RecentNotesPanel residentId={resident.id} />
            </AccordionSection>
          </div>
        )}

        {tab === "safeguarding" && (
          <div className="space-y-3">
            <AccordionSection
              title="Risk assessment"
              subtitle="Levels, identified risks, next review, mitigations"
              tone="#A8273A"
              defaultOpen
              testid="acc-risk"
            >
              <RiskTab resident={resident} riskTheme={riskTheme} reviewOverdue={reviewOverdue} />
            </AccordionSection>
            <AccordionSection
              title="Missing from care"
              subtitle="Active and past episodes, return interviews, Philomena pack"
              tone="#A8273A"
              testid="acc-missing"
            >
              <MissingTab
                resident={resident}
                episodes={episodes}
                onOpen={() => setMissingOpen(true)}
              />
            </AccordionSection>
            <AccordionSection
              title="Body maps"
              subtitle="Marks, bruises, injuries — front/back diagram with timeline"
              tone="#A8273A"
              testid="acc-bodymaps"
            >
              <BodyMapsTab resident={resident} />
            </AccordionSection>
            <AccordionSection
              title="Recent incidents"
              subtitle="Linked incidents and safeguarding events for this young person"
              tone="#A8273A"
              testid="acc-incidents"
            >
              <RecentIncidentsPanel residentId={resident.id} />
            </AccordionSection>
          </div>
        )}

        {tab === "health" && (
          <div className="space-y-3">
            <AccordionSection
              title="Medical overview"
              subtitle="GP, dentist, allergies, medical conditions, dietary needs"
              defaultOpen
              testid="acc-medical"
            >
              <MedicalTab resident={resident} />
            </AccordionSection>
            <AccordionSection
              title="Medications (MAR)"
              subtitle="Active medications, schedule, last administered"
              testid="acc-meds"
            >
              <MedicationsTab resident={resident} />
            </AccordionSection>
            <AccordionSection
              title="Health & wellbeing"
              subtitle="Immunisations, CAMHS, therapy, mental health, appointments"
              testid="acc-health"
            >
              <HealthTab resident={resident} />
            </AccordionSection>
          </div>
        )}

        {tab === "education" && (
          <div className="space-y-3">
            <AccordionSection
              title="Education & PEP"
              subtitle="School, attendance, achievements, PEP cycle"
              defaultOpen
              testid="acc-education"
            >
              <EducationTab resident={resident} />
            </AccordionSection>
            <AccordionSection
              title="Independence skills"
              subtitle="Cooking, budgeting, travel, tenancy readiness — semi-independent progression"
              tone="#2F6A3A"
              testid="acc-independence"
            >
              <IndependenceTracker resident={resident} />
            </AccordionSection>
          </div>
        )}

        {tab === "finance" && <PocketMoneyTab resident={resident} />}
        {tab === "documents" && <DocumentsTab resident={resident} />}
        {tab === "timeline" && <TimelineTab items={timeline} />}
      </section>

      {missingOpen && (
        <MissingPackModal
          resident={resident}
          activeEpisode={activeEpisode}
          onClose={() => setMissingOpen(false)}
          onChange={async () => {
            const e = await api.get(`/residents/${id}/missing`);
            setEpisodes(e.data || []);
            const t = await api.get(`/residents/${id}/timeline`);
            setTimeline(t.data?.items || []);
          }}
          canManage={canManage}
        />
      )}
    </div>
  );
}

// ---------------- Overview ----------------
function OverviewTab({ resident, age }) {
  return (
    <div className="space-y-1" data-testid="overview-content">
      <SectionTitle>Identity</SectionTitle>
      <FieldRow label="Full name" value={resident.name} />
      <FieldRow label="Preferred name" value={resident.preferred_name} />
      <FieldRow label="Date of birth" value={`${resident.dob || ""}${age != null ? ` · age ${age}` : ""}`} />
      <FieldRow label="Gender" value={resident.gender} />

      <SectionTitle className="mt-6">Placement & Care</SectionTitle>
      <FieldRow label="Placement start" value={resident.placement_date} />
      <FieldRow label="Legal status" value={resident.legal_status} />
      <FieldRow
        label="Local authority"
        inline={
          <InlineField
            resident={resident}
            field="local_authority"
            label="Local authority"
            onSaved={(u) => setResident(u)}
            placeholder="Not specified"
          />
        }
      />
      <FieldRow
        label="Key worker"
        inline={
          <InlineField
            resident={resident}
            field="key_worker"
            label="Key worker"
            onSaved={(u) => setResident(u)}
            placeholder="Not specified"
          />
        }
      />
      <FieldRow
        label="Risk level"
        inline={
          <InlineField
            resident={resident}
            field="risk_level"
            label="Risk level"
            type="select"
            sensitive
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
            onSaved={(u) => setResident(u)}
          />
        }
      />
      <FieldRow
        label="Risk review due"
        inline={
          <InlineField
            resident={resident}
            field="risk_next_review"
            label="Risk review due"
            type="date"
            onSaved={(u) => setResident(u)}
          />
        }
      />
      <FieldRow label="Placement summary" value={resident.placement_summary || resident.notes} />

      <SectionTitle className="mt-6">Professional contacts</SectionTitle>
      <FieldRow
        label="Social worker"
        inline={
          <InlineField
            resident={resident}
            field="social_worker_name"
            label="Social worker"
            onSaved={(u) => setResident(u)}
            placeholder="Not specified"
          />
        }
      />
      <FieldRow
        label="SW contact"
        inline={
          <InlineField
            resident={resident}
            field="social_worker_contact"
            label="SW contact"
            onSaved={(u) => setResident(u)}
            placeholder="Phone or email"
          />
        }
      />

      <SectionTitle className="mt-6">Quick contact</SectionTitle>
      <FieldRow
        label="Phone"
        inline={
          <InlineField
            resident={resident}
            field="phone"
            label="Phone"
            type="tel"
            onSaved={(u) => setResident(u)}
            placeholder="Mobile / landline"
          />
        }
      />

      <SectionTitle className="mt-6">Emergency contacts</SectionTitle>
      <ContactsList contacts={resident.emergency_contacts} />
    </div>
  );
}

function ContactsList({ contacts }) {
  if (!contacts || !contacts.length)
    return <div className="text-sm text-stone-400 italic py-3">No emergency contacts recorded.</div>;
  return (
    <div className="grid sm:grid-cols-2 gap-3 mt-3" data-testid="emergency-contacts-list">
      {contacts.map((c, i) => (
        <div
          key={i}
          className="border divider-soft rounded-xl p-3.5 bg-stone-50/60 flex items-start gap-3"
        >
          <span className="w-9 h-9 rounded-lg bg-[#1E4D5C]/10 text-[#1E4D5C] flex items-center justify-center shrink-0">
            <Phone size={15} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-stone-900 truncate">{c.name}</div>
            <div className="text-xs text-stone-500">{c.relation}</div>
            {c.phone && (
              <a
                href={`tel:${c.phone.replace(/\s/g, "")}`}
                className="text-xs text-[#1E4D5C] hover:underline font-mono"
              >
                {c.phone}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children, className = "" }) {
  return (
    <h3
      className={`font-display font-bold text-sm uppercase tracking-wider text-[#1E4D5C] ${className}`}
    >
      {children}
    </h3>
  );
}

// ---------------- Background ----------------
function BackgroundTab({ resident }) {
  return (
    <div className="space-y-1" data-testid="background-content">
      <FieldRow label="Referral reason" value={resident.referral_reason} />
      <FieldRow label="Placement history" value={resident.placement_history} />
      <FieldRow label="Family background" value={resident.family_background} />
      <FieldRow label="Education background" value={resident.education_background} />
      <FieldRow label="Trauma history" value={resident.trauma_history} />
      <FieldRow label="Professional involvement" value={resident.professional_involvement} />
      <FieldRow label="Current presenting needs" value={resident.presenting_needs} />
    </div>
  );
}

// ---------------- Risk ----------------
function RiskTab({ resident, riskTheme, reviewOverdue }) {
  const risks = resident.risks || {};
  const RISK_KEYS = [
    ["self_harm", "Self-harm"],
    ["absconding", "Absconding / missing"],
    ["aggression", "Aggression"],
    ["substance", "Substance misuse"],
    ["cse", "CSE / exploitation"],
    ["mental_health", "Mental health"],
    ["medical", "Medical"],
  ];
  return (
    <div className="space-y-5" data-testid="risk-content">
      <div
        className="rounded-xl p-4 border-l-4 flex items-start gap-3"
        style={{ borderLeftColor: riskTheme.bg, background: riskTheme.soft }}
      >
        <ShieldAlert size={20} style={{ color: riskTheme.bg }} className="mt-0.5 shrink-0" />
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Current overall risk level
          </div>
          <div className="font-display font-black text-2xl mt-0.5" style={{ color: riskTheme.fg }}>
            {riskTheme.label}
          </div>
          <div className="text-xs text-stone-600 mt-1">
            Last reviewed: <b>{resident.risk_last_reviewed || "—"}</b> · Next review:{" "}
            <b className={reviewOverdue ? "text-[#B23A48]" : ""}>
              {resident.risk_next_review || "—"}
              {reviewOverdue && " · OVERDUE"}
            </b>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {RISK_KEYS.map(([k, label]) => {
          const v = risks[k];
          const isHigh = String(v || "").toLowerCase().includes("high") || String(v || "").toLowerCase().includes("active");
          const isMed = String(v || "").toLowerCase().includes("medium") || String(v || "").toLowerCase().includes("moderate");
          const tone = isHigh ? "#B23A48" : isMed ? "#D4A373" : "#3A5A40";
          return (
            <div
              key={k}
              className="border divider-soft rounded-xl p-3.5"
              data-testid={`risk-${k}`}
              style={{ borderLeftColor: tone, borderLeftWidth: 3 }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                {label}
              </div>
              <div className="text-sm text-stone-800 mt-1">{v || <span className="text-stone-400 italic">Not assessed</span>}</div>
            </div>
          );
        })}
      </div>

      <div>
        <SectionTitle>Risk triggers</SectionTitle>
        <div className="mt-2"><TagList items={resident.risk_triggers} tone="red" /></div>
      </div>
      <div>
        <SectionTitle>Protective factors</SectionTitle>
        <div className="mt-2"><TagList items={resident.protective_factors} tone="green" /></div>
      </div>
      <FieldRow label="Risk management strategies" value={resident.risk_management} />
    </div>
  );
}

// ---------------- Care plan ----------------
function CareTab({ resident }) {
  return (
    <div className="space-y-1" data-testid="care-content">
      <FieldRow label="Emotional support needs" value={resident.emotional_support} />
      <FieldRow label="Behaviour support strategies" value={resident.behaviour_strategies} />
      <FieldRow label="Education support" value={resident.education_support} />
      <FieldRow label="Health needs" value={resident.health_needs} />
      <FieldRow label="Independence / life skills" value={resident.independence_skills} />
      <FieldRow label="Contact arrangements" value={resident.contact_arrangements} />
      <FieldRow label="Goals & outcomes" value={resident.goals_outcomes} />
      <FieldRow label="Staff guidance" value={resident.staff_guidance} />
    </div>
  );
}

// ---------------- Missing / Philomena ----------------
function MissingTab({ resident, episodes, onOpen }) {
  return (
    <div className="space-y-5" data-testid="missing-content">
      <div className="bg-[#B23A48]/8 border border-[#B23A48]/25 rounded-xl p-4 flex items-start gap-3">
        <Siren size={22} className="text-[#B23A48] shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-display font-bold text-lg text-[#B23A48]">
            Philomena Protocol · Missing From Care
          </div>
          <p className="text-sm text-stone-700 mt-0.5">
            Use the <b>Rapid Response Pack</b> to instantly generate a police-ready PDF and a
            secure share link for police, social workers and managers.
          </p>
          <button
            type="button"
            data-testid="open-missing-pack-cta"
            onClick={onOpen}
            className="inline-flex items-center gap-2 mt-3 bg-[#B23A48] hover:bg-[#962F3B] text-white font-bold rounded-xl px-4 py-2.5 text-sm shadow-sm transition-colors"
          >
            <Siren size={15} /> Generate Missing Pack
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-1">
        <div className="space-y-1">
          <SectionTitle>Physical description</SectionTitle>
          <FieldRow label="Height" value={resident.height} />
          <FieldRow label="Build" value={resident.build} />
          <FieldRow label="Hair" value={resident.hair} />
          <FieldRow label="Eyes" value={resident.eyes} />
          <FieldRow label="Distinguishing marks" value={resident.distinguishing_marks} />
          <FieldRow label="Usual clothing" value={resident.usual_clothing} />
          <FieldRow label="Phone" value={resident.phone} />
        </div>
        <div className="space-y-1">
          <SectionTitle>Known locations & associates</SectionTitle>
          <div className="py-2 border-b divider-soft">
            <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">
              Known places
            </div>
            <TagList items={resident.known_locations} />
          </div>
          <div className="py-2 border-b divider-soft">
            <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">
              Friends / associates
            </div>
            <TagList items={resident.known_associates} />
          </div>
          <div className="py-2 border-b divider-soft">
            <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">
              Family contacts
            </div>
            <TagList items={resident.family_contacts} />
          </div>
          <div className="py-2 border-b divider-soft">
            <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">
              Triggers for going missing
            </div>
            <TagList items={resident.missing_triggers} tone="red" />
          </div>
          <FieldRow label="Safety plan" value={resident.safety_plan} />
        </div>
      </div>

      <div>
        <SectionTitle>Previous missing episodes</SectionTitle>
        {episodes.length === 0 ? (
          <div className="text-sm text-stone-500 italic mt-3">No missing episodes recorded.</div>
        ) : (
          <ul className="mt-3 space-y-2" data-testid="missing-episodes-list">
            {episodes.map((ep) => (
              <MissingEpisodeRow
                key={ep.id}
                episode={ep}
                resident={resident}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KeyWorkPanel({ resident }) {
  const [sessions, setSessions] = useState([]);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isSeniorOrAbove } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get(`/key-work/sessions?resident_id=${resident.id}`),
      isSeniorOrAbove
        ? api.get(`/residents/${resident.id}/key-work/recommendations`)
        : Promise.resolve({ data: [] }),
    ])
      .then(([s, r]) => {
        setSessions(s.data || []);
        setRecs(r.data || []);
      })
      .finally(() => setLoading(false));
  }, [resident.id, isSeniorOrAbove]);

  return (
    <div className="space-y-3" data-testid="resident-key-work-panel">
      {recs.length > 0 && (
        <div
          className="bg-[#FAF7F2] border-l-4 border border-[#5a3d8c]/40 rounded-xl p-3"
          style={{ borderLeftColor: "#5a3d8c" }}
          data-testid="resident-kw-recs"
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#5a3d8c] mb-1">
            Practice recommendations · {recs.length}
          </div>
          <ul className="space-y-1">
            {recs.slice(0, 3).map((r, i) => (
              <li
                key={i}
                data-testid={`resident-kw-rec-${r.id}`}
                className="text-xs"
              >
                <b>{r.title}</b>
                <span className="text-[#5d6068]"> — {r.body}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#5d6068]">
          Recent sessions ({sessions.length})
        </span>
        {isSeniorOrAbove && (
          <button
            type="button"
            onClick={() => nav(`/key-work/new?resident_id=${resident.id}`)}
            data-testid="resident-kw-plan-btn"
            className="text-xs bg-[#5a3d8c] hover:bg-[#3f2a64] text-white font-semibold rounded-lg px-2.5 py-1 inline-flex items-center gap-1"
          >
            <Sparkles size={11} /> Plan a session
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-4 text-stone-500">
          <Loader2 className="animate-spin inline" size={14} />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-[#5d6068] italic">
          No key work sessions yet for this young person.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sessions.slice(0, 5).map((s) => (
            <li key={s.id} data-testid={`resident-kw-session-${s.id}`}>
              <Link
                to={`/key-work/${s.id}`}
                className="block bg-white border divider-soft rounded-lg p-2.5 text-xs hover:bg-stone-50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      s.status === "completed"
                        ? "bg-[#3A5A40]/10 text-[#3A5A40]"
                        : s.status === "cancelled"
                        ? "bg-stone-100 text-stone-500"
                        : "bg-[#5a3d8c]/10 text-[#5a3d8c]"
                    }`}
                  >
                    {s.status}
                  </span>
                  <span className="font-semibold text-stone-800">{s.topic_label || "Session"}</span>
                  <span className="text-stone-500 ml-auto">
                    {(s.completed_at || s.planned_for || "").slice(0, 10)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function MissingEpisodeRow({ episode, resident }) {
  const { isManagerOrAbove } = useAuth();
  const [interview, setInterview] = useState(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [showRI, setShowRI] = useState(false);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!episode.return_interview && !loadedOnce) {
      // No interview reference; still try once via resident-level list to be safe
      api
        .get(`/residents/${resident.id}/return-interviews`)
        .then((r) => {
          if (!alive) return;
          const found = (r.data || []).find((x) => x.missing_episode_id === episode.id);
          setInterview(found || null);
          setLoadedOnce(true);
        })
        .catch(() => setLoadedOnce(true));
    } else if (episode.return_interview) {
      api
        .get(`/return-interviews/${episode.return_interview}`)
        .then((r) => {
          if (alive) setInterview(r.data);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode.id]);

  const downloadRI = () => {
    if (!interview?.id) return;
    const token = localStorage.getItem("cc_token") || "";
    const url = `${api.defaults.baseURL}/return-interviews/${interview.id}/pdf?token=${encodeURIComponent(token)}`;
    // PDF endpoint requires Bearer header — use api.get with blob to handle properly
    api
      .get(`/return-interviews/${interview.id}/pdf`, { responseType: "blob" })
      .then((resp) => {
        const blobUrl = URL.createObjectURL(resp.data);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `Safelyn_Return_Interview_${(resident.name || "").replace(/\s+/g, "_")}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => toast.error("Could not download PDF"));
  };

  const signOff = async () => {
    if (!interview?.id) return;
    const note = window.prompt("Optional manager comments to record on sign-off:") || "";
    setSigning(true);
    try {
      const r = await api.post(`/return-interviews/${interview.id}/sign-off`, {
        manager_comments: note,
      });
      setInterview(r.data);
      toast.success("Return interview signed off");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Sign-off failed");
    } finally {
      setSigning(false);
    }
  };

  const isOpen = !episode.returned_at && episode.status === "open";
  const tone = isOpen ? "#A8273A" : "#3A5A40";
  return (
    <li
      className="border-l-4 border-y border-r divider-soft rounded-xl p-3.5"
      style={{ borderLeftColor: tone }}
      data-testid={`missing-episode-${episode.id}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 mt-2 ${
            episode.returned_at ? "bg-[#3A5A40]" : "bg-[#B23A48] animate-pulse"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-stone-900">
              {episode.returned_at ? "Returned safely" : "OPEN — still missing"}
            </span>
            {interview && (
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  interview.status === "signed_off"
                    ? "bg-[#3A5A40]/15 text-[#3A5A40]"
                    : "bg-[#B8772F]/15 text-[#B8772F]"
                }`}
                data-testid={`ri-status-${episode.id}`}
              >
                {interview.status === "signed_off" ? "RI · Signed off" : "RI · Awaiting sign-off"}
              </span>
            )}
            {!interview && episode.returned_at && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#A8273A] bg-[#A8273A]/10 px-2 py-0.5 rounded">
                RI not yet captured
              </span>
            )}
          </div>
          <div className="text-xs text-stone-500 mt-0.5">
            Reported {formatFullTimestamp(episode.reported_at)} by {episode.reported_by_name}
          </div>
          {episode.last_seen_location && (
            <div className="text-xs text-stone-700 mt-1">
              Last seen: {episode.last_seen_location}
            </div>
          )}
          {interview && (
            <div className="text-xs text-stone-600 mt-1">
              Interview by <b>{interview.conducted_by_name}</b> ·{" "}
              {formatFullTimestamp(interview.conducted_at)}
              {interview.signed_off_at && (
                <>
                  {" "}· Signed off by <b>{interview.signed_off_by_name}</b> at{" "}
                  {formatFullTimestamp(interview.signed_off_at)}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {!interview && (
            <button
              type="button"
              onClick={() => setShowRI(true)}
              data-testid={`ri-start-${episode.id}`}
              className="inline-flex items-center gap-1 bg-[#0e3b4a] hover:bg-[#0a2c38] text-white text-xs font-semibold rounded-lg px-2.5 py-1.5"
            >
              <ShieldCheck size={11} /> Mark returned & start interview
            </button>
          )}
          {interview && (
            <button
              type="button"
              onClick={downloadRI}
              data-testid={`ri-pdf-${episode.id}`}
              className="inline-flex items-center gap-1 border divider-soft hover:bg-stone-50 text-xs font-semibold rounded-lg px-2.5 py-1.5"
            >
              <Download size={11} /> RI PDF
            </button>
          )}
          {interview && interview.status !== "signed_off" && isManagerOrAbove && (
            <button
              type="button"
              onClick={signOff}
              disabled={signing}
              data-testid={`ri-signoff-${episode.id}`}
              className="inline-flex items-center gap-1 bg-[#3A5A40] hover:bg-[#2C4630] text-white text-xs font-semibold rounded-lg px-2.5 py-1.5 disabled:opacity-50"
            >
              {signing ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
              Sign off
            </button>
          )}
        </div>
      </div>
      {showRI && (
        <ReturnInterviewModal
          episode={episode}
          residentName={resident.name}
          onClose={() => setShowRI(false)}
          onSaved={(ri) => {
            setInterview(ri);
            // The episode is now closed server-side; trigger a parent refresh on next mount
            window.dispatchEvent(new CustomEvent("safelyn:missing-refresh"));
          }}
        />
      )}
    </li>
  );
}

// ---------------- Medical ----------------
function MedicalTab({ resident }) {
  const m = resident.medical || {};
  return (
    <div className="space-y-1" data-testid="medical-content">
      <FieldRow label="GP" value={m.gp} />
      <FieldRow label="NHS number" value={m.nhs_number} />
      <FieldRow label="Allergies" value={m.allergies} className="!bg-[#B23A48]/5" />
      <FieldRow label="Diagnoses" value={m.diagnoses} />
      <FieldRow label="Current medication" value={m.current_medication} />
      <FieldRow label="Medication schedule" value={m.schedule} />
      <FieldRow label="PRN medication" value={m.prn} />
      <FieldRow label="Medical appointments" value={m.appointments} />
      <FieldRow label="Health conditions" value={m.conditions} />
      <FieldRow label="Emergency medical notes" value={m.emergency_notes} />
    </div>
  );
}

// ---------------- Adult Profile Section (renders for adult service types) ----------------
function AdultProfileSection({ resident }) {
  const nok = resident.next_of_kin || {};
  return (
    <div className="grid sm:grid-cols-2 gap-3" data-testid="adult-profile-section">
      <FieldRow label="NHS number" value={resident.nhs_number} />
      <FieldRow label="GP" value={resident.gp_details} />
      <FieldRow label="Support level" value={resident.support_level && resident.support_level.toUpperCase()} />
      <FieldRow label="Care provider" value={resident.care_provider} />
      <FieldRow label="Tenancy" value={resident.tenancy_info} fullWidth />
      <FieldRow
        label="Mental health diagnoses"
        value={(resident.mh_diagnoses || []).length ? (resident.mh_diagnoses || []).join(", ") : null}
        fullWidth
      />
      <FieldRow
        label="Next of kin"
        value={
          nok.name
            ? `${nok.name} · ${nok.relation || "—"}${nok.phone ? " · " + nok.phone : ""}${nok.email ? " · " + nok.email : ""}`
            : null
        }
        fullWidth
      />
    </div>
  );
}

// ---------------- Timeline ----------------
function TimelineTab({ items }) {
  if (!items.length)
    return (
      <div className="text-sm text-stone-500 italic py-6 text-center">
        No incidents or notes recorded yet.
      </div>
    );
  return (
    <ul className="space-y-3" data-testid="timeline-content">
      {items.map((it) => {
        const tone =
          it.kind === "missing"
            ? "#B23A48"
            : it.kind === "incident"
            ? it.safeguarding
              ? "#B23A48"
              : it.severity === "high"
              ? "#B23A48"
              : it.severity === "medium"
              ? "#D4A373"
              : "#3A5A40"
            : "#1E4D5C";
        return (
          <li
            key={`${it.kind}-${it.id}`}
            className="border-l-4 border divider-soft rounded-xl p-3.5 bg-white"
            style={{ borderLeftColor: tone }}
            data-testid={`timeline-item-${it.kind}`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  {it.kind} · {it.title}
                  {it.safeguarding && (
                    <span className="ml-2 text-[#B23A48]">SAFEGUARDING</span>
                  )}
                </div>
                <div className="text-sm text-stone-800 mt-1 leading-relaxed line-clamp-3">
                  {it.body}
                </div>
              </div>
              <div className="text-xs text-stone-500 shrink-0">
                <div>{formatFullTimestamp(it.at)}</div>
                <div className="text-stone-400 text-right">{it.author}</div>
              </div>
            </div>
            {it.kind === "incident" && (
              <Link
                to={`/incidents/${it.id}`}
                className="text-xs text-[#1E4D5C] hover:underline mt-2 inline-flex items-center gap-1"
              >
                View incident <ChevronRight size={12} />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------- Missing Pack Modal ----------------
function MissingPackModal({ resident, activeEpisode, onClose, onChange, canManage }) {
  const [form, setForm] = useState({
    last_seen_location: "",
    last_seen_at: "",
    direction_of_travel: "",
    clothing_last_seen: resident?.usual_clothing || "",
    contact_phone: resident?.phone || "",
    police_reference: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [episode, setEpisode] = useState(activeEpisode || null);
  const [downloading, setDownloading] = useState(false);
  const [actBusy, setActBusy] = useState(null);

  const open = async () => {
    if (!canManage && !window.confirm("Open a missing-from-care pack? This will alert managers and create an incident.")) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/residents/${resident.id}/missing`, form);
      setEpisode(data);
      onChange();
      toast.success("Rapid Response Pack opened");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not open pack");
    } finally {
      setBusy(false);
    }
  };

  const updateEpisode = async (patch, label) => {
    if (!episode) return;
    setActBusy(label);
    try {
      const { data } = await api.patch(`/missing/${episode.id}`, patch);
      setEpisode(data);
      onChange();
      toast.success(label + " logged");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Update failed");
    } finally {
      setActBusy(null);
    }
  };

  const sendPack = async (kind) => {
    if (!episode) return;
    // Reuse notifications; attach incident_id link via auto-created incident
    setActBusy(kind);
    try {
      // Find the auto-created incident for this episode
      const { data: incs } = await api.get(`/incidents?resident_id=${resident.id}`);
      const inc = (incs || []).find((i) => i.missing_episode_id === episode.id) || incs[0];
      if (!inc) {
        toast.error("Linked incident not found");
        return;
      }
      await api.post("/notifications", {
        incident_id: inc.id,
        kind,
        message: `Missing-from-care Rapid Response Pack for ${resident.name}. Open the pack to view full details and download the police-ready PDF.`,
      });
      toast.success(kind === "dsl" ? "DSL notified" : "Manager notified");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Notification failed");
    } finally {
      setActBusy(null);
    }
  };

  const downloadPdf = async () => {
    if (!episode) return;
    setDownloading(true);
    const token = localStorage.getItem("cc_token");
    try {
      const res = await fetch(`${API}/missing/${episode.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ref = String(episode.id).replace(/-/g, "").slice(-8).toUpperCase();
      a.href = url;
      a.download = `Safelyn_Missing_Pack_${resident.name.replace(/\s+/g, "_")}_${ref}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success("Pack downloaded");
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const shareUrl = episode?.share_token
    ? `${window.location.origin}/missing/share/${episode.share_token}`
    : null;

  const copyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Secure link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-2 sm:p-6 overflow-y-auto"
      onClick={onClose}
      data-testid="missing-pack-modal"
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#B23A48] text-white px-5 py-4 sm:px-6 sm:py-5 sticky top-0 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Siren size={24} />
              <div>
                <div className="font-display font-black text-lg sm:text-xl">
                  Rapid Response Pack
                </div>
                <div className="text-xs text-white/85">
                  Missing-from-Care · {resident.name}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded"
              data-testid="missing-modal-close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {!episode ? (
            <>
              <p className="text-sm text-stone-700">
                Confirm the last-seen detail. Tapping <b>Generate Pack</b> will instantly:
              </p>
              <ul className="text-sm text-stone-700 space-y-1.5 list-none">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-[#3A5A40] shrink-0 mt-0.5" /> Create a
                  high-severity safeguarding incident on the timeline
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-[#3A5A40] shrink-0 mt-0.5" /> Generate a
                  police-ready PDF with photo, description, risks, contacts and recent incidents
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-[#3A5A40] shrink-0 mt-0.5" /> Provide a
                  secure share link to send to police, social worker and manager
                </li>
              </ul>
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  data-testid="missing-last-seen-location"
                  placeholder="Last seen location"
                  value={form.last_seen_location}
                  onChange={(e) => setForm({ ...form, last_seen_location: e.target.value })}
                  className="bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#B23A48]"
                />
                <input
                  data-testid="missing-last-seen-time"
                  type="datetime-local"
                  value={form.last_seen_at}
                  onChange={(e) => setForm({ ...form, last_seen_at: e.target.value })}
                  className="bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#B23A48]"
                />
                <input
                  placeholder="Direction of travel"
                  value={form.direction_of_travel}
                  onChange={(e) => setForm({ ...form, direction_of_travel: e.target.value })}
                  className="bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#B23A48]"
                />
                <input
                  placeholder="Phone / contact"
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  className="bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#B23A48]"
                />
                <input
                  placeholder="Clothing last seen in"
                  value={form.clothing_last_seen}
                  onChange={(e) => setForm({ ...form, clothing_last_seen: e.target.value })}
                  className="bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#B23A48] sm:col-span-2"
                />
                <textarea
                  rows={2}
                  placeholder="Notes (mood before leaving, conflict, etc.)"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#B23A48] sm:col-span-2 resize-none"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={open}
                data-testid="missing-generate-btn"
                className="w-full bg-[#B23A48] hover:bg-[#962F3B] disabled:opacity-50 text-white font-bold rounded-2xl px-6 py-4 text-base shadow-md inline-flex items-center justify-center gap-3"
              >
                {busy ? <Loader2 className="animate-spin" size={20} /> : <Siren size={20} />}
                Generate Pack & Open Episode
              </button>
            </>
          ) : (
            <>
              {/* Quick actions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <a
                  href="tel:999"
                  data-testid="action-call-police"
                  className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl bg-[#B23A48] hover:bg-[#962F3B] text-white text-xs font-bold uppercase tracking-wider"
                >
                  <Phone size={16} />
                  Call 999
                </a>
                <button
                  type="button"
                  data-testid="action-notify-manager"
                  onClick={() => sendPack("manager")}
                  disabled={actBusy === "manager"}
                  className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl bg-[#1E4D5C] hover:bg-[#163A47] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {actBusy === "manager" ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                  Notify Manager
                </button>
                <button
                  type="button"
                  data-testid="action-notify-dsl"
                  onClick={() => sendPack("dsl")}
                  disabled={actBusy === "dsl"}
                  className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl bg-[#0F2A47] hover:bg-[#091A2D] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {actBusy === "dsl" ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                  Notify DSL
                </button>
                <button
                  type="button"
                  data-testid="action-download-pack"
                  onClick={downloadPdf}
                  disabled={downloading}
                  className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {downloading ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                  Download PDF
                </button>
              </div>

              {/* Share link */}
              <div className="bg-stone-50 border divider-soft rounded-xl p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">
                  Secure share link · police, social worker, manager
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    data-testid="share-link-input"
                    value={shareUrl || ""}
                    className="flex-1 text-xs font-mono bg-white border divider-soft rounded-lg px-3 py-2 truncate"
                  />
                  <button
                    type="button"
                    data-testid="copy-share-link"
                    onClick={copyShare}
                    className="bg-[#1E4D5C] hover:bg-[#163A47] text-white rounded-lg px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Copy size={13} /> Copy
                  </button>
                </div>
              </div>

              {/* Timeline tracking */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Episode timeline
                </div>
                <TimeRow
                  label="Reported missing"
                  ts={episode.reported_at}
                  by={episode.reported_by_name}
                />
                <TimeRow
                  label="Police notified"
                  ts={episode.police_notified_at}
                  action={
                    !episode.police_notified_at && (
                      <button
                        type="button"
                        data-testid="log-police-notified"
                        disabled={actBusy === "police"}
                        onClick={() =>
                          updateEpisode(
                            { police_notified_at: new Date().toISOString() },
                            "Police notified"
                          )
                        }
                        className="text-xs bg-white hover:bg-stone-50 border border-stone-300 rounded-lg px-3 py-1.5 font-semibold inline-flex items-center gap-1"
                      >
                        {actBusy === "Police notified" ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <Plus size={12} />
                        )}
                        Log now
                      </button>
                    )
                  }
                />
                <TimeRow
                  label="Returned"
                  ts={episode.returned_at}
                  action={
                    !episode.returned_at && (
                      <button
                        type="button"
                        data-testid="log-returned"
                        disabled={actBusy === "Returned"}
                        onClick={() =>
                          updateEpisode(
                            { returned_at: new Date().toISOString(), status: "returned" },
                            "Returned"
                          )
                        }
                        className="text-xs bg-[#3A5A40] hover:bg-[#2C4A33] text-white rounded-lg px-3 py-1.5 font-semibold inline-flex items-center gap-1"
                      >
                        {actBusy === "Returned" ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        Mark returned
                      </button>
                    )
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TimeRow({ label, ts, by, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border divider-soft rounded-xl px-3.5 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            ts ? "bg-[#3A5A40]" : "bg-stone-300"
          }`}
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-stone-900">{label}</div>
          <div className="text-xs text-stone-500 truncate">
            {ts ? (
              <>
                {formatFullTimestamp(ts)}
                {by && <> · {by}</>}
              </>
            ) : (
              <span className="italic">Not yet logged</span>
            )}
          </div>
        </div>
      </div>
      {action}
    </div>
  );
}


// ---------------- AlertsAndRisks wrapper that loads its own data ----------------
function AlertsAndRisksWithData({ resident }) {
  const { badges, episodes, medications, loading } = useResidentAlerts(resident?.id);
  if (loading) return null;
  return <AlertsAndRisksBar resident={resident} badges={badges} episodes={episodes} medications={medications} />;
}

// ---------------- Recent notes (last 5 for this resident) ----------------
function RecentNotesPanel({ residentId }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .get("/notes", { params: { resident_id: residentId, limit: 8 } })
      .then((r) => setNotes(r.data || []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [residentId]);
  if (loading) {
    return <div className="text-sm text-[#5d6068]">Loading notes…</div>;
  }
  if (notes.length === 0) {
    return (
      <div className="text-sm text-[#5d6068]">
        No daily notes for this young person yet.{" "}
        <Link to="/notes" className="text-[#0e3b4a] font-semibold hover:underline">
          Add one →
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="recent-notes-panel">
      {notes.map((n) => (
        <div
          key={n.id}
          className="bg-stone-50 border divider-soft rounded-xl p-3"
          data-testid={`recent-note-${n.id}`}
        >
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              {(n.created_at || "").slice(0, 16).replace("T", " ")}
            </span>
            <span className="text-[10px] text-[#8a8d95]">by {n.author_name}</span>
          </div>
          <p className="text-sm text-[#0F1115] line-clamp-3">{n.content}</p>
        </div>
      ))}
      <Link
        to="/notes"
        className="inline-block text-xs text-[#0e3b4a] font-semibold hover:underline"
      >
        See all daily notes →
      </Link>
    </div>
  );
}

// ---------------- Recent incidents (last 5 for this resident) ----------------
function RecentIncidentsPanel({ residentId }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .get("/incidents", { params: { resident_id: residentId, limit: 8 } })
      .then((r) => setIncidents(r.data || []))
      .catch(() => setIncidents([]))
      .finally(() => setLoading(false));
  }, [residentId]);
  if (loading) {
    return <div className="text-sm text-[#5d6068]">Loading incidents…</div>;
  }
  if (incidents.length === 0) {
    return (
      <div className="text-sm text-[#5d6068]">
        No incidents on record for this young person.
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="recent-incidents-panel">
      {incidents.map((inc) => (
        <Link
          key={inc.id}
          to={`/incidents/${inc.id}`}
          className="block bg-stone-50 hover:bg-stone-100 border-l-4 border-y border-r divider-soft rounded-xl p-3"
          style={{ borderLeftColor: inc.severity === "high" ? "#A8273A" : inc.severity === "medium" ? "#B8772F" : "#5d6068" }}
          data-testid={`recent-incident-${inc.id}`}
        >
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white"
              style={{ background: inc.severity === "high" ? "#A8273A" : inc.severity === "medium" ? "#B8772F" : "#5d6068" }}
            >
              {inc.severity || "low"}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              {inc.type}
            </span>
            <span className="text-[10px] text-[#8a8d95]">
              {(inc.occurred_at || inc.created_at || "").slice(0, 16).replace("T", " ")}
            </span>
          </div>
          <div className="font-semibold text-sm text-[#0F1115] truncate">{inc.title || inc.summary}</div>
        </Link>
      ))}
      <Link
        to="/incidents"
        className="inline-block text-xs text-[#0e3b4a] font-semibold hover:underline"
      >
        See all incidents →
      </Link>
    </div>
  );
}
