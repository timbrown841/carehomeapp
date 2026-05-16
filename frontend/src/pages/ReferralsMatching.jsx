/* Referrals & Matching — Placement Intelligence Engine UI
 * Children's services only. Manager+ only.
 * Embedded inside Children's Services Hub as the "Referrals & Matching" tab.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Plus, FileDown, ChevronRight, X, Loader2, AlertTriangle,
  Sparkles, ShieldCheck, Users, Activity, Heart, Home,
  CheckCircle2, AlertCircle, Info, Lock, Trash2, BookOpen,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Static option metadata — mirrors backend placement_intelligence.py */
/* ------------------------------------------------------------------ */
const NEED_OPTIONS = [
  ["ebd", "Emotional & behavioural difficulties"],
  ["trauma", "Trauma history"],
  ["attachment", "Attachment difficulties"],
  ["self_harm", "Self-harm"],
  ["missing", "Missing from care"],
  ["cse", "CSE risk"],
  ["ce", "Criminal exploitation"],
  ["aggression", "Aggression / violence"],
  ["substance", "Substance misuse"],
  ["mental_health", "Mental health"],
  ["learning", "Learning needs"],
  ["education", "Education needs"],
  ["health", "Health needs"],
  ["offending", "Offending behaviour"],
  ["gang", "Gang association"],
  ["online_safety", "Online safety risks"],
];

const CONDITION_OPTIONS = [
  ["staffing_actions", "Staffing actions"],
  ["risk_assessment", "Updated risk assessment"],
  ["transition_plan", "Transition / induction plan"],
  ["missing_protocol", "Missing protocol refresh"],
  ["education_plan", "Education plan"],
  ["safeguarding_meeting", "Safeguarding strategy meeting"],
  ["professional_consultation", "Professional consultation"],
  ["location_risk_assessment", "Location risk assessment"],
  ["matching_impact_assessment", "Matching impact assessment"],
  ["separate_bedrooms", "Separate bedrooms"],
  ["waking_night_increase", "Increase waking-night support"],
  ["camhs_input", "Additional CAMHS input"],
  ["phased_admission", "Phased admission / cap"],
];

const RISK_LEVELS = [["low", "Low"], ["medium", "Medium"], ["high", "High"]];

const URGENCY = [["emergency", "Emergency"], ["urgent", "Urgent"], ["planned", "Planned"]];

const CONFIDENCE = {
  strong:          { fg: "#2F6A3A", bg: "#2F6A3A14", line: "#2F6A3A", label: "Strong match" },
  manageable:      { fg: "#B8772F", bg: "#B8772F18", line: "#B8772F", label: "Manageable with safeguards" },
  elevated:        { fg: "#B23A48", bg: "#B23A4814", line: "#B23A48", label: "Elevated placement risk" },
  not_recommended: { fg: "#A8273A", bg: "#A8273A18", line: "#A8273A", label: "Not recommended currently" },
};

const READINESS = {
  good:      { fg: "#2F6A3A", bg: "#2F6A3A14", line: "#2F6A3A" },
  watch:     { fg: "#5D6068", bg: "#5D606818", line: "#5D6068" },
  elevated:  { fg: "#B8772F", bg: "#B8772F18", line: "#B8772F" },
  high_risk: { fg: "#A8273A", bg: "#A8273A18", line: "#A8273A" },
};

const DECISION_LABEL = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  more_info: "More info requested",
  escalated_to_ri: "Escalated to RI",
};

const DOMAIN_LABEL = {
  emotional_climate: "Emotional climate",
  behaviour_pressure: "Behaviour pressure",
  missing_trend: "Missing trend",
  safeguarding_pressure: "Safeguarding pressure",
  staffing_readiness: "Staffing readiness",
  group_dynamics: "Group dynamics",
  exploitation: "Exploitation overlap",
  associates_overlap: "Known associates overlap",
  missing_influence: "Missing-from-care influence",
  behaviour_trigger: "Behaviour trigger risk",
  emotional_contagion: "Emotional contagion",
  capacity: "Capacity",
  home_state: "Home state",
};

/* ------------------------------------------------------------------ */
/* Main export — list ←→ detail switcher                              */
/* ------------------------------------------------------------------ */
export default function ReferralsMatching() {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [seedFromSim, setSeedFromSim] = useState(null);

  return (
    <div className="space-y-5" data-testid="referrals-matching-root">
      {!openId && !creating && !simulating && (
        <ReferralsList
          onOpen={setOpenId}
          onNew={() => { setSeedFromSim(null); setCreating(true); }}
          onSimulate={() => setSimulating(true)}
        />
      )}
      {simulating && (
        <Simulator
          onClose={() => setSimulating(false)}
          onSaveAsReferral={(seed) => { setSimulating(false); setSeedFromSim(seed); setCreating(true); }}
        />
      )}
      {creating && (
        <ReferralEditor
          seed={seedFromSim}
          onClose={(newId) => { setCreating(false); setSeedFromSim(null); if (newId) setOpenId(newId); }}
        />
      )}
      {openId && (
        <ReferralDetail
          referralId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* List view — referrals + always-on Home Readiness panel              */
/* ------------------------------------------------------------------ */
function ReferralsList({ onOpen, onNew, onSimulate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/referrals");
      setItems(r.data);
    } catch (e) {
      toast.error("Could not load referrals.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <HomeReadinessPanel />

      <div className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[#0F1115]">Active referrals</h2>
            <p className="text-[12px] text-[#5d6068]">
              Placement intelligence supports — never replaces — manager judgement.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={onSimulate}
              data-testid="simulator-open-btn"
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white border-2 border-[#0e3b4a] text-[#0e3b4a] hover:bg-[#0e3b4a]/5 px-3 py-2 rounded-lg"
            >
              <Sparkles size={14} /> Run match simulation
            </button>
            <button
              type="button"
              onClick={onNew}
              data-testid="referral-new-btn"
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-[#0e3b4a] hover:bg-[#0a2e3a] text-white px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> New referral
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-stone-600 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-stone-500" data-testid="referrals-empty">
            No referrals recorded yet. Click <em>New referral</em> to start a matching assessment.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200" data-testid="referrals-list">
            {items.map((r) => (
              <ReferralRow key={r.id} ref_={r} onOpen={() => onOpen(r.id)} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ReferralRow({ ref_, onOpen }) {
  const decision = ref_.decision || "pending";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid={`referral-row-${ref_.id}`}
        className="w-full text-left py-3 flex items-start gap-3 hover:bg-stone-50 px-2 rounded-lg transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[#0F1115] text-[14px]">
              {ref_.yp_full_name || ref_.yp_initials}
            </span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
              style={{ background: decision === "accepted" ? "#2F6A3A14" :
                                    decision === "rejected" ? "#A8273A14" :
                                    decision === "escalated_to_ri" ? "#B8772F18" : "#5D606818",
                       color: decision === "accepted" ? "#2F6A3A" :
                              decision === "rejected" ? "#A8273A" :
                              decision === "escalated_to_ri" ? "#B8772F" : "#5D6068" }}>
              {DECISION_LABEL[decision]}
            </span>
            {ref_.urgency_level && (
              <span className="text-[10px] uppercase tracking-wider text-stone-500">{ref_.urgency_level}</span>
            )}
          </div>
          <div className="text-[12px] text-stone-600 mt-0.5">
            {ref_.age != null ? `${ref_.age}y` : "—"} ·{" "}
            {ref_.gender || "—"} · {ref_.local_authority || "no LA"} ·{" "}
            {ref_.social_worker_name || "no SW"}
          </div>
          {ref_.needs?.length > 0 && (
            <div className="text-[11px] text-stone-500 mt-0.5 truncate">
              Needs: {ref_.needs.slice(0, 4).join(", ")}{ref_.needs.length > 4 ? "…" : ""}
            </div>
          )}
        </div>
        <ChevronRight size={16} className="text-stone-400 mt-1" />
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Home Readiness panel — always visible                               */
/* ------------------------------------------------------------------ */
function HomeReadinessPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/placement-intelligence/home-readiness");
      setData(r.data);
    } catch { /* graceful */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="home-readiness-panel">
        <div className="flex items-center gap-2 text-stone-600 text-sm">
          <Loader2 size={14} className="animate-spin" /> Reading live home signals…
        </div>
      </section>
    );
  }

  const r = READINESS[data.overall_readiness] || READINESS.good;
  return (
    <section
      className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
      style={{
        background: data.overall_readiness === "high_risk"
          ? "linear-gradient(135deg, #4a1923 0%, #2a0e15 100%)"
          : data.overall_readiness === "elevated"
          ? "linear-gradient(135deg, #3a2818 0%, #221610 100%)"
          : data.overall_readiness === "watch"
          ? "linear-gradient(135deg, #2A1F3D 0%, #1B1B36 100%)"
          : "linear-gradient(135deg, #2F6A3A 0%, #235029 100%)",
        color: "white",
      }}
      data-testid="home-readiness-panel"
    >
      <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-white/80" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                Live home readiness · placement intelligence
              </span>
            </div>
            <h2 className="font-display font-semibold text-xl sm:text-2xl mt-1.5" style={{ letterSpacing: "-0.02em" }}>
              {data.overall_label}
            </h2>
            <p className="text-[12px] text-white/70 mt-1 max-w-2xl">
              Real operational signals across the current group — incidents, restraints, missing trends,
              safeguarding clusters and staffing pressure. Use this before accepting any new placement.
            </p>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.18)" }}>
            Home score {data.score}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {data.tiles.map((t) => (
            <div key={t.key}
              data-testid={`home-readiness-tile-${t.key}`}
              className="bg-white/10 backdrop-blur rounded-lg p-3 border-l-4"
              style={{ borderLeftColor: (READINESS[t.status] || READINESS.good).line }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/65">{t.label}</div>
              <div className="text-[13px] font-semibold mt-1">{t.status.replace("_", " ").toUpperCase()}</div>
              <div className="text-[10px] text-white/60 mt-0.5">weight {t.score}</div>
            </div>
          ))}
        </div>

        {data.factors?.length > 0 && (
          <div className="mt-3 rounded-lg bg-white/10 backdrop-blur p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/65 mb-1.5">
              Why
            </div>
            <ul className="space-y-1">
              {data.factors.map((f, i) => (
                <li key={i} className="text-[12px] text-white/85 flex items-start gap-2">
                  <span className="text-white/55 shrink-0">·</span>
                  <span className="flex-1">{f.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-white/55 shrink-0">+{f.weight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Editor — create a new referral                                      */
/* ------------------------------------------------------------------ */
const BLANK = {
  yp_initials: "", yp_full_name: "", age: "", gender: "", local_authority: "",
  social_worker_name: "", social_worker_contact: "", referral_date: "",
  reason_for_referral: "", placement_type_requested: "", urgency_level: "",
  legal_status: "", current_placement_situation: "",
  needs: [],
  risk_to_self: "", risk_to_others: "", risk_from_others: "",
  absconding_risk: "", exploitation_risk: "", peer_influence_risk: "",
  known_associates_raw: "",
  police_involvement_history: "", safeguarding_history: "",
  bed_available: null,
  capacity_notes: "", staffing_skills_notes: "",
  transport_education_notes: "", professional_support_notes: "",
  conditions: [], conditions_notes: "",
  group_impact_notes: "",
};

function ReferralEditor({ onClose, seed }) {
  const [form, setForm] = useState(() => {
    if (!seed) return BLANK;
    const base = { ...BLANK };
    for (const [k, v] of Object.entries(seed)) {
      if (k === "known_associates" && Array.isArray(v)) {
        base.known_associates_raw = v.join(", ");
      } else if (k in base) {
        base[k] = v;
      }
    }
    return base;
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k, val) => setForm((f) => {
    const cur = new Set(f[k] || []);
    if (cur.has(val)) cur.delete(val); else cur.add(val);
    return { ...f, [k]: [...cur] };
  });

  const submit = async (e) => {
    e?.preventDefault();
    if (!form.yp_initials.trim()) {
      toast.error("Initials are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        age: form.age === "" ? null : Number(form.age),
        urgency_level: form.urgency_level || null,
        risk_to_self: form.risk_to_self || null,
        risk_to_others: form.risk_to_others || null,
        risk_from_others: form.risk_from_others || null,
        absconding_risk: form.absconding_risk || null,
        exploitation_risk: form.exploitation_risk || null,
        peer_influence_risk: form.peer_influence_risk || null,
        known_associates: (form.known_associates_raw || "")
          .split(",").map((s) => s.trim()).filter(Boolean),
      };
      delete payload.known_associates_raw;
      const r = await api.post("/referrals", payload);
      toast.success("Referral created — running matching analysis.");
      onClose(r.data.id);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not create referral.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="referral-editor">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-[#0F1115]">New referral · matching assessment</h2>
        <button type="button" onClick={() => onClose(null)} className="text-sm text-stone-600 hover:text-stone-900">
          Cancel
        </button>
      </div>

      <Section title="1 · Referral information">
        <Grid>
          <Field label="Initials *"><Inp v={form.yp_initials} onChange={(v) => set("yp_initials", v)} testid="ref-initials" /></Field>
          <Field label="Full name (optional)"><Inp v={form.yp_full_name} onChange={(v) => set("yp_full_name", v)} testid="ref-fullname" /></Field>
          <Field label="Age"><Inp type="number" v={form.age} onChange={(v) => set("age", v)} testid="ref-age" /></Field>
          <Field label="Gender"><Inp v={form.gender} onChange={(v) => set("gender", v)} testid="ref-gender" /></Field>
          <Field label="Local authority"><Inp v={form.local_authority} onChange={(v) => set("local_authority", v)} /></Field>
          <Field label="Social worker"><Inp v={form.social_worker_name} onChange={(v) => set("social_worker_name", v)} /></Field>
          <Field label="SW contact"><Inp v={form.social_worker_contact} onChange={(v) => set("social_worker_contact", v)} /></Field>
          <Field label="Referral date"><Inp type="date" v={form.referral_date} onChange={(v) => set("referral_date", v)} /></Field>
          <Field label="Placement type requested"><Inp v={form.placement_type_requested} onChange={(v) => set("placement_type_requested", v)} placeholder="emergency / short-term / long-term / solo" /></Field>
          <Field label="Urgency">
            <Sel v={form.urgency_level} onChange={(v) => set("urgency_level", v)} options={URGENCY} testid="ref-urgency" />
          </Field>
          <Field label="Legal status"><Inp v={form.legal_status} onChange={(v) => set("legal_status", v)} placeholder="S20 / S31 / Remand / EPO etc." /></Field>
        </Grid>
        <Field label="Reason for referral"><Txt v={form.reason_for_referral} onChange={(v) => set("reason_for_referral", v)} rows={3} /></Field>
        <Field label="Current placement situation"><Txt v={form.current_placement_situation} onChange={(v) => set("current_placement_situation", v)} rows={2} /></Field>
      </Section>

      <Section title="2 · Needs assessment">
        <ChipPicker options={NEED_OPTIONS} value={form.needs} onToggle={(v) => toggle("needs", v)} testidPrefix="need" />
      </Section>

      <Section title="3 · Risk matching">
        <Grid>
          <Field label="Risk to self"><Sel v={form.risk_to_self} onChange={(v) => set("risk_to_self", v)} options={RISK_LEVELS} /></Field>
          <Field label="Risk to others"><Sel v={form.risk_to_others} onChange={(v) => set("risk_to_others", v)} options={RISK_LEVELS} /></Field>
          <Field label="Risk from others"><Sel v={form.risk_from_others} onChange={(v) => set("risk_from_others", v)} options={RISK_LEVELS} /></Field>
          <Field label="Absconding / missing risk"><Sel v={form.absconding_risk} onChange={(v) => set("absconding_risk", v)} options={RISK_LEVELS} /></Field>
          <Field label="Exploitation risk"><Sel v={form.exploitation_risk} onChange={(v) => set("exploitation_risk", v)} options={RISK_LEVELS} /></Field>
          <Field label="Peer influence risk"><Sel v={form.peer_influence_risk} onChange={(v) => set("peer_influence_risk", v)} options={RISK_LEVELS} /></Field>
        </Grid>
        <Field label="Known associates (comma-separated initials)">
          <Inp v={form.known_associates_raw} onChange={(v) => set("known_associates_raw", v)} placeholder="JM, AT, KP" testid="ref-associates" />
        </Field>
        <Field label="Police involvement history"><Txt v={form.police_involvement_history} onChange={(v) => set("police_involvement_history", v)} rows={2} /></Field>
        <Field label="Safeguarding history"><Txt v={form.safeguarding_history} onChange={(v) => set("safeguarding_history", v)} rows={2} /></Field>
      </Section>

      <Section title="4 · Home capacity & staff skills">
        <Grid>
          <Field label="Bed currently available?">
            <Sel
              v={form.bed_available === null || form.bed_available === undefined ? "" : String(form.bed_available)}
              onChange={(v) => set("bed_available", v === "" ? null : v === "true")}
              options={[["true", "Yes"], ["false", "No"]]}
              testid="ref-bed-available"
            />
          </Field>
        </Grid>
        <Field label="Capacity notes"><Txt v={form.capacity_notes} onChange={(v) => set("capacity_notes", v)} rows={2} /></Field>
        <Field label="Staffing skills"><Txt v={form.staffing_skills_notes} onChange={(v) => set("staffing_skills_notes", v)} rows={2} /></Field>
        <Field label="Transport / education access"><Txt v={form.transport_education_notes} onChange={(v) => set("transport_education_notes", v)} rows={2} /></Field>
        <Field label="Professional support availability"><Txt v={form.professional_support_notes} onChange={(v) => set("professional_support_notes", v)} rows={2} /></Field>
      </Section>

      <Section title="5 · Group impact (manager observation)">
        <Field label="Notes on impact to current group">
          <Txt v={form.group_impact_notes} onChange={(v) => set("group_impact_notes", v)} rows={3}
            placeholder="Note any concerns about how this placement may interact with the current group — the matching engine will compute its own group dynamics analysis on top." />
        </Field>
      </Section>

      <Section title="6 · Conditions before acceptance (optional now — can also set on decision)">
        <ChipPicker options={CONDITION_OPTIONS} value={form.conditions} onToggle={(v) => toggle("conditions", v)} testidPrefix="cond" />
        <Field label="Conditions notes"><Txt v={form.conditions_notes} onChange={(v) => set("conditions_notes", v)} rows={2} /></Field>
      </Section>

      <div className="bg-stone-50 border divider-soft rounded-xl p-3 flex items-center gap-3">
        <Info size={14} className="text-stone-500" />
        <p className="text-[12px] text-stone-700">
          On save, Safelyn runs a deterministic placement match against the current home. You'll see the
          confidence, group-dynamics warnings and "what would need to change" — and can record the decision.
        </p>
      </div>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-white py-3">
        <button type="button" onClick={() => onClose(null)} className="text-sm px-4 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
        <button type="submit" disabled={saving} data-testid="referral-save-btn"
          className="text-sm font-semibold bg-[#0e3b4a] hover:bg-[#0a2e3a] text-white px-4 py-2 rounded-lg disabled:opacity-60">
          {saving ? "Saving…" : "Save & run matching"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Detail view — intelligence + decision                               */
/* ------------------------------------------------------------------ */
function ReferralDetail({ referralId, onClose }) {
  const [referral, setReferral] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFactor, setShowFactor] = useState(null);
  const [decisionOpen, setDecisionOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        api.get(`/referrals/${referralId}`),
        api.get(`/referrals/${referralId}/intelligence`),
      ]);
      setReferral(r1.data);
      setAnalysis(r2.data);
    } catch (e) {
      toast.error("Could not load referral.");
    } finally { setLoading(false); }
  }, [referralId]);
  useEffect(() => { load(); }, [load]);

  const downloadPdf = async () => {
    try {
      const r = await api.get(`/referrals/${referralId}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = `referral-${referral?.yp_initials || referralId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download PDF.");
    }
  };

  if (loading || !referral || !analysis) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 flex items-center gap-2 text-stone-600 text-sm">
        <Loader2 size={14} className="animate-spin" /> Computing placement intelligence…
      </div>
    );
  }

  const conf = CONFIDENCE[analysis.matching_confidence] || CONFIDENCE.strong;
  const warnings = analysis.group_warnings || [];

  return (
    <div className="space-y-4" data-testid="referral-detail">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button type="button" onClick={onClose} className="text-sm text-stone-600 hover:text-stone-900">
          ← Back to referrals
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={downloadPdf} data-testid="referral-pdf-btn"
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white border divider-soft text-[#0F1115] px-3 py-2 rounded-lg hover:bg-stone-50">
            <FileDown size={14} /> Matching assessment PDF
          </button>
          <button type="button" onClick={() => setDecisionOpen(true)} data-testid="referral-decide-btn"
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-[#0e3b4a] hover:bg-[#0a2e3a] text-white px-3 py-2 rounded-lg">
            Record decision
          </button>
        </div>
      </div>

      {/* Confidence banner */}
      <section className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${conf.line} 0%, ${conf.line}dd 100%)`, color: "white" }}
        data-testid="matching-confidence-banner">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">Matching confidence</div>
            <h2 className="font-display font-semibold text-2xl mt-1" style={{ letterSpacing: "-0.02em" }}>
              {conf.label}
            </h2>
            <p className="text-[12px] text-white/75 mt-1">Score {analysis.score} · Deterministic · supports manager judgement</p>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.18)" }} data-testid="referral-decision-pill">
            Decision: {DECISION_LABEL[referral.decision || "pending"]}
          </span>
        </div>
      </section>

      {/* Referral summary card */}
      <section className="bg-white border divider-soft rounded-2xl p-5">
        <h3 className="font-semibold text-[#0F1115] text-[15px] mb-2">{referral.yp_full_name || referral.yp_initials}</h3>
        <p className="text-[12px] text-stone-600">
          {referral.age != null ? `${referral.age}y` : "—"} · {referral.gender || "—"} ·{" "}
          {referral.local_authority || "no LA"} · SW: {referral.social_worker_name || "—"} ·{" "}
          {referral.urgency_level && <span className="font-semibold">{referral.urgency_level}</span>}
        </p>
        {referral.reason_for_referral && (
          <p className="text-[13px] text-[#0F1115] mt-2 whitespace-pre-line">{referral.reason_for_referral}</p>
        )}
        {referral.needs?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {referral.needs.map((n) => (
              <span key={n} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-[#0F1115] uppercase tracking-wider">
                {n.replace("_", " ")}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Home Readiness (re-rendered with analysis snapshot) */}
      <HomeReadinessSection data={analysis.home_readiness} />

      {/* Group dynamics warnings */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="group-dynamics-section">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-[#0e3b4a]" />
          <h3 className="font-semibold text-[#0F1115] text-[15px]">Group dynamics & placement impact</h3>
        </div>
        {warnings.length === 0 ? (
          <div className="rounded-lg bg-[#2F6A3A14] p-3 text-[13px] text-[#0F1115] flex items-center gap-2" data-testid="no-group-warnings">
            <CheckCircle2 size={14} className="text-[#2F6A3A]" />
            No group dynamics concerns flagged.
          </div>
        ) : (
          <ul className="space-y-2" data-testid="group-warnings-list">
            {warnings.map((w, i) => (
              <li key={i} className="bg-stone-50 rounded-lg p-3 border-l-4"
                style={{ borderLeftColor: w.weight >= 12 ? "#A8273A" : w.weight >= 6 ? "#B8772F" : "#5D6068" }}>
                <button type="button" onClick={() => setShowFactor(w)}
                  data-testid={`group-warning-${w.domain}`}
                  className="w-full text-left flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0"
                    style={{ color: w.weight >= 12 ? "#A8273A" : w.weight >= 6 ? "#B8772F" : "#5D6068" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                      {DOMAIN_LABEL[w.domain] || w.domain} · weight {w.weight}
                    </div>
                    <div className="text-[13px] text-[#0F1115] mt-0.5">{w.label}</div>
                    {w.residents?.length > 0 && (
                      <div className="text-[11px] text-stone-600 mt-1">
                        Linked residents: {w.residents.map((r) => r.name).join(", ")}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-stone-400 mt-1" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* What would need to change */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="what-needs-to-change">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks /> <h3 className="font-semibold text-[#0F1115] text-[15px]">What would need to change</h3>
        </div>
        <ul className="space-y-1.5">
          {(analysis.what_would_need_to_change || []).map((r, i) => (
            <li key={i} className="bg-[#0e3b4a08] border-l-4 rounded-lg p-2.5 text-[13px] text-[#0F1115] leading-relaxed"
              style={{ borderLeftColor: "#0e3b4a" }}>
              {r}
            </li>
          ))}
        </ul>
      </section>

      {/* Decision & audit trail */}
      <section className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} className="text-[#0e3b4a]" />
          <h3 className="font-semibold text-[#0F1115] text-[15px]">Decision record & audit trail</h3>
        </div>
        <div className="text-[13px] text-[#0F1115]">
          <div><span className="font-semibold">Decision:</span> {DECISION_LABEL[referral.decision || "pending"]}</div>
          {referral.decision_by_name && (
            <div className="text-[12px] text-stone-600 mt-0.5">
              By {referral.decision_by_name} on {referral.decision_at?.slice(0, 16).replace("T", " ")} UTC
            </div>
          )}
          {referral.decision_reason && (
            <div className="text-[12px] text-[#0F1115] mt-1 whitespace-pre-line">{referral.decision_reason}</div>
          )}
        </div>
        {referral.audit_trail?.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-stone-500">
              Audit trail ({referral.audit_trail.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {referral.audit_trail.map((a, i) => (
                <li key={i} className="text-[11px] text-stone-600">
                  <span className="font-semibold">{a.at?.slice(0, 16).replace("T", " ")}</span> ·{" "}
                  {a.by_name} · {a.action} · {a.summary}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {showFactor && <FactorModal factor={showFactor} onClose={() => setShowFactor(null)} />}
      {decisionOpen && (
        <DecisionModal
          referral={referral}
          onClose={() => setDecisionOpen(false)}
          onSaved={() => { setDecisionOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function HomeReadinessSection({ data }) {
  if (!data) return null;
  const r = READINESS[data.overall_readiness] || READINESS.good;
  return (
    <section
      className="rounded-2xl p-5 border-l-4"
      style={{ borderLeftColor: r.line, background: r.bg + "44" }}
      data-testid="referral-home-readiness"
    >
      <div className="flex items-center gap-2 mb-2">
        <Home size={16} style={{ color: r.fg }} />
        <h3 className="font-semibold text-[#0F1115] text-[15px]">Live home readiness</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ml-auto"
          style={{ background: r.bg, color: r.fg }}>
          {data.overall_label} · score {data.score}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {data.tiles.map((t) => (
          <div key={t.key} className="bg-white rounded-lg p-2.5 border divider-soft border-l-4"
            style={{ borderLeftColor: (READINESS[t.status] || READINESS.good).line }}>
            <div className="text-[9px] font-bold uppercase tracking-wider text-stone-500">{t.label}</div>
            <div className="text-[12px] font-semibold text-[#0F1115] mt-0.5">{t.status.replace("_", " ").toUpperCase()}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Factor explanation modal                                            */
/* ------------------------------------------------------------------ */
function FactorModal({ factor, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(11,14,22,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="factor-modal">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b divider-soft flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
              {DOMAIN_LABEL[factor.domain] || factor.domain} · weight {factor.weight}
            </div>
            <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-1">{factor.label}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-stone-100 text-stone-500" data-testid="factor-modal-close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0e3b4a] mb-2 flex items-center gap-1.5">
              <Activity size={12} /> Evidence
            </h4>
            <ul className="space-y-1">
              {Object.entries(factor.evidence || {}).map(([k, v]) => (
                <li key={k} className="bg-stone-50 rounded-lg p-2 text-[12px] text-[#0F1115] flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">{k.replace("_", " ")}</span>
                  <span className="ml-auto font-semibold">{String(v)}</span>
                </li>
              ))}
              {Object.keys(factor.evidence || {}).length === 0 && (
                <li className="text-[12px] text-stone-500">Computed from referral metadata and home state — no quantifiable evidence values for this factor.</li>
              )}
            </ul>
          </div>
          {factor.residents?.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0e3b4a] mb-2">
                Linked current residents
              </h4>
              <ul className="space-y-1.5">
                {factor.residents.map((r, i) => (
                  <li key={i} className="bg-stone-50 rounded-lg p-2.5 text-[12px]">
                    <div className="font-semibold text-[#0F1115]">{r.name}</div>
                    <div className="text-stone-600 text-[11px] mt-0.5">{r.reason}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="bg-stone-50 rounded-lg p-3 flex items-start gap-2">
            <BookOpen size={13} className="text-stone-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-stone-600">
              Every flag in Safelyn's placement intelligence is deterministic and links back to live operational data.
              You can verify each evidence value inside the relevant module.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Decision modal                                                      */
/* ------------------------------------------------------------------ */
function DecisionModal({ referral, onClose, onSaved }) {
  const [decision, setDecision] = useState(referral.decision === "pending" ? "" : referral.decision);
  const [reason, setReason] = useState(referral.decision_reason || "");
  const [conditions, setConditions] = useState(referral.conditions || []);
  const [saving, setSaving] = useState(false);

  const toggleCond = (v) => {
    setConditions((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!decision) { toast.error("Pick a decision."); return; }
    setSaving(true);
    try {
      await api.post(`/referrals/${referral.id}/decision`, {
        decision, decision_reason: reason, conditions,
      });
      toast.success("Decision recorded.");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save decision.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(11,14,22,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="decision-modal">
      <form onSubmit={submit} className="bg-white rounded-t-2xl sm:rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b divider-soft flex items-start justify-between gap-2">
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">Record decision</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-stone-100 text-stone-500"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Decision">
            <Sel
              v={decision}
              onChange={setDecision}
              options={[
                ["accepted", "Accept"],
                ["rejected", "Reject"],
                ["more_info", "Request more information"],
                ["escalated_to_ri", "Escalate to RI"],
              ]}
              testid="decision-select"
            />
          </Field>
          <Field label="Reason / rationale">
            <Txt v={reason} onChange={setReason} rows={3} testid="decision-reason" />
          </Field>
          <Field label="Conditions attached">
            <ChipPicker options={CONDITION_OPTIONS} value={conditions} onToggle={toggleCond} testidPrefix="dec-cond" />
          </Field>
          <div className="bg-stone-50 rounded-lg p-3 flex items-start gap-2">
            <Lock size={13} className="text-stone-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-stone-600">
              The decision and any conditions are written to the audit trail with your name and a UTC timestamp.
              This record is suitable for RI review and Ofsted evidence.
            </p>
          </div>
        </div>
        <div className="p-4 border-t divider-soft bg-stone-50 flex justify-end gap-2 sticky bottom-0">
          <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-white">Cancel</button>
          <button type="submit" disabled={saving} data-testid="decision-save"
            className="text-sm font-semibold bg-[#0e3b4a] hover:bg-[#0a2e3a] text-white px-3 py-2 rounded-lg disabled:opacity-60">
            {saving ? "Saving…" : "Save decision"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local primitives                                                    */
/* ------------------------------------------------------------------ */
function Section({ title, children }) {
  return (
    <section className="bg-white border divider-soft rounded-2xl p-5">
      <h3 className="font-semibold text-[#0F1115] text-[15px] mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function Grid({ children }) { return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>; }
function Field({ label, children }) {
  return (
    <label className="block text-[12px] text-stone-600">
      <span className="block mb-1 font-semibold text-[11px] uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}
function Inp({ v, onChange, type = "text", placeholder, testid }) {
  return (
    <input type={type} value={v ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      data-testid={testid}
      className="w-full text-[13px] border divider-soft rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]/30" />
  );
}
function Txt({ v, onChange, rows = 3, placeholder, testid }) {
  return (
    <textarea value={v ?? ""} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
      data-testid={testid}
      className="w-full text-[13px] border divider-soft rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]/30" />
  );
}
function Sel({ v, onChange, options, testid }) {
  return (
    <select value={v ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={testid}
      className="w-full text-[13px] border divider-soft rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]/30">
      <option value="">—</option>
      {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}
function ChipPicker({ options, value, onToggle, testidPrefix }) {
  const set = useMemo(() => new Set(value || []), [value]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, l]) => {
        const on = set.has(k);
        return (
          <button type="button" key={k} onClick={() => onToggle(k)}
            data-testid={`${testidPrefix}-${k}`}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
              on ? "bg-[#0e3b4a] text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
            }`}>
            {l}
          </button>
        );
      })}
    </div>
  );
}
function ListChecks() { return <Heart size={16} className="text-[#0e3b4a]" />; }


/* ------------------------------------------------------------------ */
/* Instant Match Simulator                                             */
/* ------------------------------------------------------------------ */
function Simulator({ onClose, onSaveAsReferral }) {
  const [mode, setMode] = useState("paste"); // paste | upload | quick
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState(null);
  const [quick, setQuick] = useState({
    yp_initials: "", age: "", gender: "",
    urgency_level: "", legal_status: "",
    needs: [], known_associates_raw: "",
    risk_to_self: "", absconding_risk: "", exploitation_risk: "",
    bed_available: null,
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [showFactor, setShowFactor] = useState(null);

  const toggleNeed = (v) => {
    setQuick((q) => {
      const s = new Set(q.needs || []);
      if (s.has(v)) s.delete(v); else s.add(v);
      return { ...q, needs: [...s] };
    });
  };

  const run = async () => {
    setRunning(true); setResult(null);
    try {
      const fd = new FormData();
      if (mode === "paste" && rawText.trim()) {
        fd.append("raw_text", rawText);
      } else if (mode === "upload" && file) {
        fd.append("file", file);
        if (rawText.trim()) fd.append("raw_text", rawText);
      } else if (mode === "quick") {
        // For quick mode, send overrides only
        const overrides = {
          ...quick,
          age: quick.age === "" ? null : Number(quick.age),
          known_associates: (quick.known_associates_raw || "")
            .split(",").map((s) => s.trim()).filter(Boolean),
        };
        delete overrides.known_associates_raw;
        for (const k of Object.keys(overrides)) {
          if (overrides[k] === "" || overrides[k] === null || (Array.isArray(overrides[k]) && overrides[k].length === 0)) {
            delete overrides[k];
          }
        }
        fd.append("overrides_json", JSON.stringify(overrides));
      } else {
        toast.error("Add some referral information first.");
        setRunning(false); return;
      }
      const r = await api.post("/placement-intelligence/simulate", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(r.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not run simulation.");
    } finally { setRunning(false); }
  };

  const saveAsReferral = () => {
    if (!result?.extracted) return;
    onSaveAsReferral(result.extracted);
  };

  if (result) {
    return <SimulationResult result={result} onBack={() => setResult(null)} onClose={onClose}
                              onSaveAsReferral={saveAsReferral} showFactor={showFactor} setShowFactor={setShowFactor} />;
  }

  return (
    <div className="space-y-4" data-testid="simulator">
      {/* Always-on non-binding banner */}
      <div className="rounded-2xl p-4 border-2"
        style={{ borderColor: "#B8772F", background: "#B8772F12" }}
        data-testid="simulator-non-binding-notice">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-[#B8772F] mt-0.5 shrink-0" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#B8772F]">Non-binding simulation</div>
            <p className="text-[12px] text-[#0F1115] mt-0.5">
              This is a live decision-support sandbox. Nothing is saved. Manager judgement is required for any actual placement decision.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-[#0F1115]">Run match simulation</h2>
        <button type="button" onClick={onClose} className="text-sm text-stone-600 hover:text-stone-900">
          ← Back to referrals
        </button>
      </div>

      <div className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex gap-1.5 mb-4 border-b divider-soft" data-testid="simulator-mode-tabs">
          {[
            ["paste", "Paste text / email", null],
            ["upload", "Upload PDF / TXT", null],
            ["quick", "Quick manual entry", null],
          ].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              data-testid={`sim-mode-${k}`}
              className={`text-[12px] font-semibold px-3 py-2 border-b-2 transition-colors ${
                mode === k ? "border-[#0e3b4a] text-[#0e3b4a]" : "border-transparent text-stone-500 hover:text-stone-800"
              }`}>{l}</button>
          ))}
        </div>

        {mode === "paste" && (
          <div className="space-y-2">
            <Field label="Paste referral text, email body, or phone-call notes">
              <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={10}
                data-testid="sim-paste-textarea"
                className="w-full text-[13px] border divider-soft rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]/30 font-mono"
                placeholder="e.g.&#10;Re: AB, aged 14 male. Local Authority: Camden. Social worker: Sara Khan. URGENT placement needed. History of CSE concerns and grooming. High exploitation risk. Repeat missing episodes. Known associates: JM, AT. S20." />
            </Field>
            <p className="text-[11px] text-stone-500">
              Safelyn detects needs, risks, urgency, legal status and associates using deterministic keyword analysis — no AI inference.
            </p>
          </div>
        )}

        {mode === "upload" && (
          <div className="space-y-3">
            <Field label="Upload referral PDF or text file (max 10MB)">
              <input type="file" accept=".pdf,.txt,application/pdf,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                data-testid="sim-file-input"
                className="text-[13px]" />
            </Field>
            {file && (
              <p className="text-[12px] text-stone-600">Ready: <span className="font-semibold">{file.name}</span> ({Math.round(file.size / 1024)} KB)</p>
            )}
            <Field label="Optional — also paste extra context">
              <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={4}
                data-testid="sim-upload-textarea"
                className="w-full text-[13px] border divider-soft rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]/30"
                placeholder="Any phone-call notes that aren't in the file…" />
            </Field>
          </div>
        )}

        {mode === "quick" && (
          <div className="space-y-3" data-testid="sim-quick-form">
            <Grid>
              <Field label="Initials"><Inp v={quick.yp_initials} onChange={(v) => setQuick({ ...quick, yp_initials: v })} testid="sim-q-initials" /></Field>
              <Field label="Age"><Inp type="number" v={quick.age} onChange={(v) => setQuick({ ...quick, age: v })} testid="sim-q-age" /></Field>
              <Field label="Gender"><Inp v={quick.gender} onChange={(v) => setQuick({ ...quick, gender: v })} /></Field>
              <Field label="Urgency"><Sel v={quick.urgency_level} onChange={(v) => setQuick({ ...quick, urgency_level: v })} options={URGENCY} /></Field>
              <Field label="Legal status"><Inp v={quick.legal_status} onChange={(v) => setQuick({ ...quick, legal_status: v })} /></Field>
              <Field label="Bed available?">
                <Sel
                  v={quick.bed_available === null || quick.bed_available === undefined ? "" : String(quick.bed_available)}
                  onChange={(v) => setQuick({ ...quick, bed_available: v === "" ? null : v === "true" })}
                  options={[["true", "Yes"], ["false", "No"]]}
                />
              </Field>
            </Grid>
            <Field label="Needs (chip-pick)">
              <ChipPicker options={NEED_OPTIONS} value={quick.needs} onToggle={toggleNeed} testidPrefix="sim-q-need" />
            </Field>
            <Grid>
              <Field label="Risk to self"><Sel v={quick.risk_to_self} onChange={(v) => setQuick({ ...quick, risk_to_self: v })} options={RISK_LEVELS} /></Field>
              <Field label="Absconding risk"><Sel v={quick.absconding_risk} onChange={(v) => setQuick({ ...quick, absconding_risk: v })} options={RISK_LEVELS} /></Field>
              <Field label="Exploitation risk"><Sel v={quick.exploitation_risk} onChange={(v) => setQuick({ ...quick, exploitation_risk: v })} options={RISK_LEVELS} /></Field>
            </Grid>
            <Field label="Known associates (comma-separated)">
              <Inp v={quick.known_associates_raw} onChange={(v) => setQuick({ ...quick, known_associates_raw: v })} placeholder="JM, AT" />
            </Field>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4 pt-3 border-t divider-soft">
          <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
          <button type="button" onClick={run} disabled={running}
            data-testid="sim-run-btn"
            className="text-sm font-semibold bg-[#0e3b4a] hover:bg-[#0a2e3a] text-white px-4 py-2 rounded-lg disabled:opacity-60 inline-flex items-center gap-1.5">
            {running ? <><Loader2 size={14} className="animate-spin" /> Analysing…</> : <><Sparkles size={14} /> Run simulation</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function SimulationResult({ result, onBack, onClose, onSaveAsReferral, showFactor, setShowFactor }) {
  const { extracted, analysis, extraction_evidence: evidence = [], source_meta } = result;
  const conf = CONFIDENCE[analysis.matching_confidence] || CONFIDENCE.strong;
  const warnings = analysis.group_warnings || [];

  return (
    <div className="space-y-4" data-testid="simulation-result">
      <div className="rounded-2xl p-4 border-2"
        style={{ borderColor: "#B8772F", background: "#B8772F12" }}
        data-testid="simulator-non-binding-notice">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-[#B8772F] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#B8772F]">Non-binding simulation</div>
            <p className="text-[12px] text-[#0F1115] mt-0.5">{result.non_binding_notice}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button type="button" onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900">← Edit inputs</button>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Close</button>
          <button type="button" onClick={onSaveAsReferral} data-testid="sim-save-as-referral"
            className="text-sm font-semibold bg-[#0e3b4a] hover:bg-[#0a2e3a] text-white px-3 py-2 rounded-lg inline-flex items-center gap-1.5">
            <Plus size={14} /> Save as formal referral
          </button>
        </div>
      </div>

      {/* Confidence banner */}
      <section className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${conf.line} 0%, ${conf.line}dd 100%)`, color: "white" }}
        data-testid="sim-confidence-banner">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">Simulated matching confidence</div>
            <h2 className="font-display font-semibold text-2xl mt-1" style={{ letterSpacing: "-0.02em" }}>
              {conf.label}
            </h2>
            <p className="text-[12px] text-white/75 mt-1">
              Score {analysis.score} · Deterministic · supports manager judgement
            </p>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.18)" }}>
            SIMULATION
          </span>
        </div>
      </section>

      {/* Extracted preview */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="sim-extracted-preview">
        <div className="flex items-center gap-2 mb-3">
          <Info size={16} className="text-[#0e3b4a]" />
          <h3 className="font-semibold text-[#0F1115] text-[15px]">What Safelyn detected</h3>
          {source_meta?.file_kind && (
            <span className="text-[10px] uppercase tracking-wider text-stone-500 ml-auto">
              from {source_meta.file_kind} · {source_meta.extracted_chars} chars
            </span>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
          {[
            ["Initials", extracted.yp_initials],
            ["Age", extracted.age],
            ["Gender", extracted.gender],
            ["Local authority", extracted.local_authority],
            ["Social worker", extracted.social_worker_name],
            ["Urgency", extracted.urgency_level],
            ["Legal status", extracted.legal_status],
            ["Bed available", extracted.bed_available === undefined ? null : (extracted.bed_available ? "yes" : "no")],
          ].map(([l, v]) => (
            <div key={l} className="flex">
              <span className="font-semibold text-stone-500 uppercase tracking-wider text-[10px] w-28 shrink-0">{l}</span>
              <span className="text-[#0F1115]">{v == null || v === "" ? "—" : String(v)}</span>
            </div>
          ))}
        </div>
        {extracted.needs?.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Needs</div>
            <div className="flex flex-wrap gap-1.5">
              {extracted.needs.map((n) => (
                <span key={n} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-[#0F1115] uppercase tracking-wider">
                  {n.replace("_", " ")}
                </span>
              ))}
            </div>
          </div>
        )}
        {evidence.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-stone-500">
              Extraction evidence ({evidence.length})
            </summary>
            <ul className="mt-2 space-y-1" data-testid="sim-extraction-evidence">
              {evidence.map((e, i) => (
                <li key={i} className="text-[11px] text-stone-700 bg-stone-50 rounded p-1.5 flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">{e.field}</span>
                  <span className="text-[#0F1115] font-mono">{e.value}</span>
                  <span className="text-stone-500">·</span>
                  <span className="italic text-stone-600 truncate">"{e.matched_phrase}"</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Live home readiness */}
      <HomeReadinessSection data={analysis.home_readiness} />

      {/* Group dynamics warnings */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="sim-group-dynamics">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-[#0e3b4a]" />
          <h3 className="font-semibold text-[#0F1115] text-[15px]">Group dynamics & placement impact</h3>
        </div>
        {warnings.length === 0 ? (
          <div className="rounded-lg bg-[#2F6A3A14] p-3 text-[13px] text-[#0F1115] flex items-center gap-2">
            <CheckCircle2 size={14} className="text-[#2F6A3A]" /> No group dynamics concerns flagged.
          </div>
        ) : (
          <ul className="space-y-2">
            {warnings.map((w, i) => (
              <li key={i} className="bg-stone-50 rounded-lg p-3 border-l-4"
                style={{ borderLeftColor: w.weight >= 12 ? "#A8273A" : w.weight >= 6 ? "#B8772F" : "#5D6068" }}>
                <button type="button" onClick={() => setShowFactor(w)}
                  data-testid={`sim-warning-${w.domain}`}
                  className="w-full text-left flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0"
                    style={{ color: w.weight >= 12 ? "#A8273A" : w.weight >= 6 ? "#B8772F" : "#5D6068" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                      {DOMAIN_LABEL[w.domain] || w.domain} · weight {w.weight}
                    </div>
                    <div className="text-[13px] text-[#0F1115] mt-0.5">{w.label}</div>
                    {w.residents?.length > 0 && (
                      <div className="text-[11px] text-stone-600 mt-1">
                        Linked residents: {w.residents.map((r) => r.name).join(", ")}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-stone-400 mt-1" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* What would need to change */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="sim-what-needs-to-change">
        <div className="flex items-center gap-2 mb-3">
          <Heart size={16} className="text-[#0e3b4a]" />
          <h3 className="font-semibold text-[#0F1115] text-[15px]">What would need to change</h3>
        </div>
        <ul className="space-y-1.5">
          {(analysis.what_would_need_to_change || []).map((r, i) => (
            <li key={i} className="bg-[#0e3b4a08] border-l-4 rounded-lg p-2.5 text-[13px] text-[#0F1115] leading-relaxed"
              style={{ borderLeftColor: "#0e3b4a" }}>
              {r}
            </li>
          ))}
        </ul>
      </section>

      <div className="bg-stone-50 border divider-soft rounded-xl p-3 flex items-start gap-3" data-testid="sim-footer-reminder">
        <Lock size={14} className="text-stone-500 mt-0.5 shrink-0" />
        <p className="text-[12px] text-stone-700">
          This was a non-binding simulation. Nothing has been saved. To proceed,
          click <strong>Save as formal referral</strong> to record the matching assessment and decision in the audit trail.
        </p>
      </div>

      {showFactor && <FactorModal factor={showFactor} onClose={() => setShowFactor(null)} />}
    </div>
  );
}
