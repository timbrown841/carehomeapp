import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { downloadIncidentPdf } from "@/lib/pdf";
import VoiceRecorder from "@/components/VoiceRecorder";
import SaveReceipt from "@/components/SaveReceipt";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  X,
  ChevronDown,
  Plus,
  ListChecks,
  Download,
  Zap,
  Clock,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

const TYPES = [
  { v: "behaviour", label: "Behaviour", color: "#D4A373" },
  { v: "safeguarding", label: "Safeguarding", color: "#B23A48" },
  { v: "absconding", label: "Absconding", color: "#0F2A47" },
  { v: "other", label: "Other", color: "#5B6E58" },
];

const TAG_SETS = {
  behaviour: ["aggression", "verbal abuse", "property damage", "refusal", "peer conflict", "self-regulation"],
  safeguarding: ["disclosure", "self-harm", "online safety", "exploitation concern", "neglect concern", "bullying"],
  absconding: ["missing", "returned", "police informed", "planned return", "high-risk location"],
  other: ["medical", "accident", "complaint", "environmental", "visitor"],
};

const SEVERITIES = [
  { v: "low", label: "Low", color: "#3A5A40", desc: "Minor, no harm" },
  { v: "medium", label: "Medium", color: "#D4A373", desc: "Some risk / impact" },
  { v: "high", label: "High", color: "#B23A48", desc: "Serious risk or harm" },
];

/** Parse a "1) Summary: ..." style structured report into section blocks. */
function parseStructured(text) {
  if (!text) return [];
  const blocks = String(text).split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const m = block.match(/^(\d+\))\s*([^:\n]+):\s*([\s\S]*)$/);
    if (m) {
      return { num: m[1], title: m[2].trim(), body: m[3].trim() };
    }
    return { num: null, title: null, body: block };
  });
}

export default function LogIncident() {
  const nav = useNavigate();
  const [residents, setResidents] = useState([]);
  const [structuring, setStructuring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [structured, setStructured] = useState(null);
  const [savedRecord, setSavedRecord] = useState(null);

  const [form, setForm] = useState({
    resident_id: "",
    incident_type: "behaviour",
    transcript: "",
    severity: "medium",
    tags: [],
    safeguarding: false,
    structured_report: "",
    suggested_action: "",
  });

  const tags = useMemo(() => TAG_SETS[form.incident_type] || [], [form.incident_type]);
  const selectedResident = residents.find((r) => r.id === form.resident_id);
  const structuredSections = useMemo(
    () => parseStructured(form.structured_report),
    [form.structured_report]
  );

  useEffect(() => {
    api.get("/residents").then((r) => setResidents(r.data));
  }, []);

  useEffect(() => {
    if (form.incident_type === "safeguarding") {
      setForm((f) => ({ ...f, safeguarding: true }));
    }
    setForm((f) => ({
      ...f,
      tags: f.tags.filter((t) => (TAG_SETS[f.incident_type] || []).includes(t)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.incident_type]);

  const onTranscript = (text) => {
    setForm((f) => ({
      ...f,
      transcript: f.transcript ? `${f.transcript} ${text}` : text,
    }));
  };

  const toggleTag = (t) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
    }));
  };

  const structureWithAI = async () => {
    if (!form.transcript.trim()) return toast.error("Record or type something first");
    if (!form.resident_id) return toast.error("Select a young person first");
    setStructuring(true);
    try {
      const { data } = await api.post("/incidents/structure", {
        resident_id: form.resident_id,
        incident_type: form.incident_type,
        severity: form.severity,
        transcript: form.transcript,
        tags: form.tags,
      });
      setStructured(data);
      setForm((f) => ({
        ...f,
        structured_report: data.structured_report,
        suggested_action: data.suggested_action,
        severity: data.suggested_severity || f.severity,
        safeguarding: data.suggested_safeguarding || f.safeguarding,
      }));
      toast.success("Report structured");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "AI structuring failed");
    } finally {
      setStructuring(false);
    }
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.resident_id) return toast.error("Select a young person");
    if (!form.transcript.trim() && !form.structured_report.trim())
      return toast.error("Add a description or use the mic");
    setSaving(true);
    try {
      const body = form.structured_report.trim() || form.transcript.trim();
      const categoryMap = {
        behaviour: "verbal",
        safeguarding: "self-harm",
        absconding: "missing",
        other: "other",
      };
      const { data } = await api.post("/incidents", {
        resident_id: form.resident_id,
        severity: form.severity,
        category: categoryMap[form.incident_type] || "other",
        incident_type: form.incident_type,
        body,
        safeguarding: form.safeguarding,
        action_taken: form.suggested_action || "",
        voice_used: form.transcript.length > 0,
        tags: form.tags,
        structured_report: form.structured_report || "",
        raw_transcript: form.transcript || "",
      });
      setSavedRecord(data);
      toast.success("Saved instantly · audit-trail recorded");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const logAnother = () => {
    setSavedRecord(null);
    setStructured(null);
    setForm({
      resident_id: "",
      incident_type: "behaviour",
      transcript: "",
      severity: "medium",
      tags: [],
      safeguarding: false,
      structured_report: "",
      suggested_action: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const downloadSavedPdf = async () => {
    if (!savedRecord) return;
    await downloadIncidentPdf(savedRecord, selectedResident?.name);
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-20" data-testid="log-incident-page">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft size={16} /> Back
        </Link>
        <div className="text-[10px] uppercase tracking-wider text-stone-500 inline-flex items-center gap-1">
          <Clock size={11} /> Takes under 60 seconds
        </div>
      </div>

      <div>
        <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter text-stone-900">
          Log Incident
        </h1>
        <p className="text-stone-600 mt-1 text-sm">
          Voice-first. Speak naturally — we'll structure an Ofsted-ready report for you.
        </p>
      </div>

      {/* Trust strip */}
      <div className="grid grid-cols-3 gap-2" data-testid="log-trust-strip">
        {[
          { icon: Clock, label: "Under 60 seconds" },
          { icon: Zap, label: "Saved instantly" },
          { icon: Lock, label: "Time-stamped automatically" },
        ].map((t) => (
          <div
            key={t.label}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border divider-soft text-[11px] font-semibold text-stone-700"
          >
            <span className="w-5 h-5 rounded bg-[#3A5A40]/12 text-[#3A5A40] flex items-center justify-center shrink-0">
              <t.icon size={11} />
            </span>
            <span className="truncate">{t.label}</span>
          </div>
        ))}
      </div>

      {savedRecord && (
        <>
          <SaveReceipt
            record={savedRecord}
            label="Saved instantly"
            testid="incident-save-receipt"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={downloadSavedPdf}
              data-testid="save-receipt-download-pdf"
              className="inline-flex items-center justify-center gap-2 bg-[#1E4D5C] hover:bg-[#163A47] text-white font-semibold rounded-xl px-4 py-3 text-sm transition-colors shadow-sm"
            >
              <Download size={16} /> Download PDF
            </button>
            <button
              type="button"
              onClick={logAnother}
              data-testid="log-another-btn"
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-stone-50 text-stone-800 font-semibold rounded-xl px-4 py-3 text-sm border divider-soft transition-colors"
            >
              <Plus size={16} /> Log another
            </button>
            <button
              type="button"
              onClick={() => nav(`/incidents/${savedRecord.id}`)}
              data-testid="goto-incidents-btn"
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-stone-50 text-stone-800 font-semibold rounded-xl px-4 py-3 text-sm border divider-soft transition-colors"
            >
              <ListChecks size={16} /> View report
            </button>
          </div>
        </>
      )}

      {/* ★ Voice Hero — primary input */}
      <section
        data-testid="voice-hero"
        className="bg-gradient-to-br from-[#1E4D5C] via-[#2D6A4F] to-[#1E4D5C] rounded-2xl p-6 sm:p-8 shadow-md text-white relative overflow-hidden"
      >
        <div className="absolute -right-20 -top-20 w-60 h-60 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-52 h-52 rounded-full bg-[#E57A5D]/15 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col items-center gap-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
            Primary input
          </div>
          <VoiceRecorder size="xl" onTranscript={onTranscript} />
          <div className="text-center">
            <div className="font-display font-bold text-xl sm:text-2xl tracking-tight">
              Tap and speak to log incident
            </div>
            <div className="text-xs text-white/75 mt-1">
              Speak naturally · we'll transcribe and structure it
              {form.transcript && (
                <span className="ml-1 text-[#FFB199]">
                  · transcript captured ✓
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Transcript editor (secondary) */}
      <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Transcript
          </h3>
          <span className="text-[10px] uppercase tracking-wider text-stone-400">
            Auto-filled where possible · edit freely
          </span>
        </div>
        <textarea
          data-testid="transcript-input"
          rows={4}
          value={form.transcript}
          onChange={(e) => setForm({ ...form, transcript: e.target.value })}
          placeholder="Tap the microphone above, or type here…"
          className="w-full bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D5C] resize-none"
        />
        <button
          type="button"
          onClick={structureWithAI}
          disabled={structuring || !form.transcript.trim()}
          data-testid="structure-ai-btn"
          className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-[#E57A5D] hover:bg-[#D1664A] disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-3 transition-colors"
        >
          {structuring ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {structured ? "Re-structure with AI" : "Structure with AI"}
        </button>
      </section>

      {/* Structured report (rendered cleanly with bold sections) */}
      {structuredSections.length > 0 && (
        <section
          data-testid="structured-preview"
          className="bg-white border-l-4 border-l-[#E57A5D] border-y border-r divider-soft rounded-2xl p-5 sm:p-6"
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#E57A5D] inline-flex items-center gap-1.5">
                <Sparkles size={11} /> AI structured report
              </div>
              <div className="text-[10px] text-stone-500 mt-0.5">
                Edit any section before saving
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setStructured(null);
                setForm((f) => ({ ...f, structured_report: "" }));
              }}
              className="text-stone-400 hover:text-stone-700 text-xs inline-flex items-center gap-1"
              title="Clear"
            >
              <X size={12} /> Clear
            </button>
          </div>

          <div className="space-y-4" data-testid="structured-sections">
            {structuredSections.map((s, idx) => (
              <div
                key={idx}
                className="border-l-2 border-l-stone-200 pl-4 py-0.5"
              >
                {s.title ? (
                  <div className="font-display font-bold text-sm text-[#1E4D5C] mb-1.5 inline-flex items-center gap-1.5">
                    <span className="text-stone-400 font-mono text-[11px]">
                      {s.num}
                    </span>
                    {s.title}
                  </div>
                ) : null}
                <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
                  {s.body}
                </p>
              </div>
            ))}
          </div>

          {form.suggested_action && (
            <div className="mt-5 pt-4 border-t divider-soft">
              <div className="font-display font-bold text-sm text-[#1E4D5C] mb-1">
                Suggested action
              </div>
              <p className="text-sm text-stone-800 leading-relaxed">
                {form.suggested_action}
              </p>
            </div>
          )}

          <details className="mt-4 group">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-stone-500 hover:text-stone-700 list-none inline-flex items-center gap-1">
              <ChevronDown
                size={11}
                className="group-open:rotate-180 transition-transform"
              />
              Edit raw structured text
            </summary>
            <textarea
              rows={8}
              value={form.structured_report}
              onChange={(e) =>
                setForm({ ...form, structured_report: e.target.value })
              }
              className="w-full mt-2 bg-stone-50 border divider-soft rounded-lg px-3 py-2 text-xs font-mono whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-[#E57A5D] resize-vertical"
            />
          </details>
        </section>
      )}

      {/* Compact form section — secondary to voice */}
      <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
          Required details
          <span className="ml-1.5 text-[10px] font-medium normal-case text-stone-400">
            (auto-filled where possible)
          </span>
        </div>

        {/* Young person */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">
            Young person
          </label>
          {residents.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {residents.slice(0, 6).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    data-testid={`quick-resident-${r.id}`}
                    onClick={() => setForm({ ...form, resident_id: r.id })}
                    className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      form.resident_id === r.id
                        ? "bg-[#1E4D5C] text-white border-[#1E4D5C]"
                        : "bg-white text-stone-700 border-stone-200 hover:border-stone-400"
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
              {residents.length > 6 && (
                <div className="relative">
                  <select
                    data-testid="resident-select"
                    value={form.resident_id}
                    onChange={(e) => setForm({ ...form, resident_id: e.target.value })}
                    className="w-full bg-white border divider-soft rounded-xl px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C] appearance-none text-sm"
                  >
                    <option value="">More residents…</option>
                    {residents.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-stone-500 italic">
              No residents yet —{" "}
              <Link to="/residents" className="text-[#1E4D5C] underline">
                add one first
              </Link>
              .
            </div>
          )}
        </div>

        {/* Incident type */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">
            Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.v}
                type="button"
                data-testid={`type-${t.v}`}
                onClick={() => setForm({ ...form, incident_type: t.v })}
                className="px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all"
                style={
                  form.incident_type === t.v
                    ? { background: t.color, color: "#fff", borderColor: t.color }
                    : { background: "#fff", borderColor: "#d6d6d0", color: "#1c1c1a" }
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">
            Risk level
            {structured?.suggested_severity &&
              structured.suggested_severity !== form.severity && (
                <span className="ml-2 normal-case font-medium text-[#E57A5D]">
                  · AI suggested {structured.suggested_severity}
                </span>
              )}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s.v}
                type="button"
                data-testid={`severity-${s.v}`}
                onClick={() => setForm({ ...form, severity: s.v })}
                className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border-2 text-left transition-colors"
                style={
                  form.severity === s.v
                    ? { background: s.color, color: "#fff", borderColor: s.color }
                    : { background: "#fff", color: "#1c1c1a", borderColor: "#d6d6d0" }
                }
              >
                <span className="font-bold text-sm">{s.label}</span>
                <span
                  className="text-[10px] leading-tight"
                  style={{ color: form.severity === s.v ? "#ffffffcc" : "#8a8a85" }}
                >
                  {s.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Tags (optional) */}
        {tags.length > 0 && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">
              Quick tags <span className="text-stone-400 normal-case font-medium">· optional</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={`tag-${t.replace(/\s+/g, "-")}`}
                  onClick={() => toggleTag(t)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors ${
                    form.tags.includes(t)
                      ? "bg-[#1E4D5C] text-white border-[#1E4D5C]"
                      : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Safeguarding flag — emphasised */}
        {form.incident_type !== "safeguarding" && (
          <label
            data-testid="safeguarding-flag-row"
            className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              form.safeguarding
                ? "bg-[#B23A48]/10 border-[#B23A48] ring-2 ring-[#B23A48]/15"
                : "bg-[#B23A48]/5 border-[#B23A48]/30 hover:border-[#B23A48]/60"
            }`}
          >
            <span
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                form.safeguarding
                  ? "bg-[#B23A48] text-white"
                  : "bg-[#B23A48]/15 text-[#B23A48]"
              }`}
            >
              <ShieldAlert size={18} />
            </span>
            <div className="flex-1">
              <div className="font-display font-bold text-sm text-[#B23A48] flex items-center gap-2">
                Flag for safeguarding
                {form.safeguarding && (
                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#B23A48] text-white">
                    Flagged
                  </span>
                )}
              </div>
              <div className="text-xs text-stone-700 mt-0.5">
                Notify managers and DSL immediately. Use whenever a child's
                welfare may be at risk.
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="safeguarding-flag"
              checked={form.safeguarding}
              onChange={(e) => setForm({ ...form, safeguarding: e.target.checked })}
              className="w-5 h-5 accent-[#B23A48] mt-1"
            />
          </label>
        )}
        {form.incident_type === "safeguarding" && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#B23A48]/10 border-2 border-[#B23A48]">
            <span className="w-10 h-10 rounded-xl bg-[#B23A48] text-white flex items-center justify-center shrink-0">
              <ShieldAlert size={18} />
            </span>
            <div>
              <div className="font-display font-bold text-sm text-[#B23A48]">
                Auto-flagged for safeguarding
              </div>
              <div className="text-xs text-stone-700 mt-0.5">
                Safeguarding type — DSL and manager will be alerted on save.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Sticky Save bar */}
      <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 pb-4 sm:pb-0 sm:px-0 pt-3 sm:pt-0 bg-canvas/95 backdrop-blur-sm border-t divider-soft sm:border-0 sm:bg-transparent sm:backdrop-blur-0">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !form.resident_id}
          data-testid="save-incident-btn"
          className="w-full inline-flex items-center justify-center gap-3 bg-[#B23A48] hover:bg-[#962F3B] disabled:opacity-50 text-white font-bold rounded-2xl px-6 py-5 text-base shadow-xl shadow-[#B23A48]/20 transition-all active:scale-[0.99]"
        >
          {saving ? (
            <Loader2 size={22} className="animate-spin" />
          ) : (
            <CheckCircle2 size={22} />
          )}
          <div className="flex flex-col items-start leading-tight">
            <span className="font-display text-lg">Log incident</span>
            <span className="text-[11px] font-semibold opacity-90">
              Save instantly with timestamp
            </span>
          </div>
        </button>
        {selectedResident && (
          <div className="text-center text-xs text-stone-500 mt-2.5">
            Logging for <span className="font-semibold">{selectedResident.name}</span>
            {form.safeguarding && (
              <span className="text-[#B23A48] font-bold ml-1.5">
                · safeguarding flagged
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
