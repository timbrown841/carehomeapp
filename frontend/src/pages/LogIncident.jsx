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
  Mic,
  X,
  ChevronDown,
  Plus,
  ListChecks,
  Download,
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

export default function LogIncident() {
  const nav = useNavigate();
  const [residents, setResidents] = useState([]);
  const [step, setStep] = useState({}); // visual progress
  const [busy, setBusy] = useState(false);
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

  useEffect(() => {
    api.get("/residents").then((r) => setResidents(r.data));
  }, []);

  // Auto-flag safeguarding when type is safeguarding
  useEffect(() => {
    if (form.incident_type === "safeguarding") {
      setForm((f) => ({ ...f, safeguarding: true }));
    }
    // Reset tags when type changes (keep ones still valid)
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
      toast.success("Incident saved · audit-trail recorded");
      // Scroll to top so the receipt is visible
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
    <div className="space-y-5 max-w-2xl mx-auto" data-testid="log-incident-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft size={16} /> Back
        </Link>
        <div className="text-xs uppercase tracking-wider text-stone-500">
          New incident · &lt;60s
        </div>
      </div>

      <div>
        <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter text-stone-900">
          Log Incident
        </h1>
        <p className="text-stone-600 mt-1 text-sm">
          Speak naturally. We'll structure an Ofsted-ready report for you.
        </p>
      </div>

      {savedRecord && (
        <>
          <SaveReceipt
            record={savedRecord}
            label="Incident saved successfully"
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

      {/* Step 1: Young Person */}
      <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-[#1E4D5C] text-white text-xs font-bold flex items-center justify-center">
            1
          </span>
          <h3 className="font-display font-semibold text-stone-900">Young person</h3>
          {form.resident_id && (
            <CheckCircle2 size={16} className="ml-auto text-[#3A5A40]" />
          )}
        </div>

        {/* Quick chips for first 4, dropdown for rest */}
        {residents.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {residents.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  data-testid={`quick-resident-${r.id}`}
                  onClick={() => setForm({ ...form, resident_id: r.id })}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
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
                  className="w-full bg-white border divider-soft rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C] appearance-none"
                >
                  <option value="">More residents…</option>
                  {residents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
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
      </section>

      {/* Step 2: Incident Type */}
      <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-[#1E4D5C] text-white text-xs font-bold flex items-center justify-center">
            2
          </span>
          <h3 className="font-display font-semibold text-stone-900">Incident type</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.v}
              type="button"
              data-testid={`type-${t.v}`}
              onClick={() => setForm({ ...form, incident_type: t.v })}
              className="px-4 py-3 rounded-xl text-sm font-semibold border transition-all"
              style={
                form.incident_type === t.v
                  ? {
                      background: t.color,
                      color: "#fff",
                      borderColor: t.color,
                    }
                  : { background: "#fff", borderColor: "#d6d6d0", color: "#1c1c1a" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* Step 3: Voice / text capture */}
      <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-[#1E4D5C] text-white text-xs font-bold flex items-center justify-center">
            3
          </span>
          <h3 className="font-display font-semibold text-stone-900">
            Speak what happened
          </h3>
          {form.transcript && (
            <CheckCircle2 size={16} className="ml-auto text-[#3A5A40]" />
          )}
        </div>

        <div className="flex flex-col items-center gap-3 py-3">
          <VoiceRecorder size="xl" onTranscript={onTranscript} />
          <div className="text-xs text-stone-500 text-center">
            Tap mic · speak naturally · tap again to stop
          </div>
        </div>

        <textarea
          data-testid="transcript-input"
          rows={4}
          value={form.transcript}
          onChange={(e) => setForm({ ...form, transcript: e.target.value })}
          placeholder="Or type… your transcript will appear here. Edit freely."
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

        {structured && (
          <div
            data-testid="structured-preview"
            className="mt-3 p-4 rounded-xl border-l-4 border-l-[#E57A5D] border-y border-r divider-soft bg-stone-50/60"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[#E57A5D]">
                AI structured report
              </div>
              <button
                type="button"
                onClick={() => {
                  setStructured(null);
                  setForm((f) => ({ ...f, structured_report: "" }));
                }}
                className="text-stone-400 hover:text-stone-700"
                title="Clear"
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              rows={8}
              value={form.structured_report}
              onChange={(e) =>
                setForm({ ...form, structured_report: e.target.value })
              }
              className="w-full bg-white border divider-soft rounded-lg px-3 py-2 text-sm whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-[#E57A5D] resize-vertical"
            />
            {form.suggested_action && (
              <div className="mt-2 text-xs text-stone-700">
                <span className="font-semibold uppercase tracking-wider text-stone-500">
                  Suggested action:{" "}
                </span>
                {form.suggested_action}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Step 4: Risk Level */}
      <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-[#1E4D5C] text-white text-xs font-bold flex items-center justify-center">
            4
          </span>
          <h3 className="font-display font-semibold text-stone-900">Risk level</h3>
          {structured?.suggested_severity &&
            structured.suggested_severity !== form.severity && (
              <span className="ml-auto text-xs text-[#E57A5D]">
                AI suggested: {structured.suggested_severity}
              </span>
            )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s.v}
              type="button"
              data-testid={`severity-${s.v}`}
              onClick={() => setForm({ ...form, severity: s.v })}
              className="flex flex-col items-start gap-0.5 px-3 py-3 rounded-xl border-2 text-left transition-colors"
              style={
                form.severity === s.v
                  ? {
                      background: s.color,
                      color: "#fff",
                      borderColor: s.color,
                    }
                  : {
                      background: "#fff",
                      color: "#1c1c1a",
                      borderColor: "#d6d6d0",
                    }
              }
            >
              <span className="font-bold text-sm">{s.label}</span>
              <span
                className="text-[10px] leading-tight opacity-80"
                style={{ color: form.severity === s.v ? "#ffffffcc" : "#8a8a85" }}
              >
                {s.desc}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Step 5: Quick Tags */}
      <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-[#1E4D5C] text-white text-xs font-bold flex items-center justify-center">
            5
          </span>
          <h3 className="font-display font-semibold text-stone-900">Tags</h3>
          <span className="text-xs text-stone-500 ml-auto">Optional</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`tag-${t.replace(/\s+/g, "-")}`}
              onClick={() => toggleTag(t)}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${
                form.tags.includes(t)
                  ? "bg-[#1E4D5C] text-white border-[#1E4D5C]"
                  : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {form.incident_type !== "safeguarding" && (
          <label className="flex items-center gap-2.5 mt-4 p-3 rounded-xl border-2 border-[#B23A48]/20 bg-[#B23A48]/5 cursor-pointer">
            <input
              type="checkbox"
              data-testid="safeguarding-flag"
              checked={form.safeguarding}
              onChange={(e) =>
                setForm({ ...form, safeguarding: e.target.checked })
              }
              className="w-4 h-4 accent-[#B23A48]"
            />
            <div className="flex-1">
              <div className="font-semibold text-xs text-[#B23A48] flex items-center gap-1.5">
                <ShieldAlert size={12} /> Also flag for safeguarding
              </div>
            </div>
          </label>
        )}
      </section>

      {/* Sticky Save bar */}
      <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 pb-4 sm:pb-0 sm:px-0 pt-3 sm:pt-0 bg-canvas/95 backdrop-blur-sm border-t divider-soft sm:border-0 sm:bg-transparent sm:backdrop-blur-0">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !form.resident_id}
          data-testid="save-incident-btn"
          className="w-full inline-flex items-center justify-center gap-2 bg-[#1E4D5C] hover:bg-[#163A47] disabled:opacity-50 text-white font-bold rounded-2xl px-6 py-4 sm:py-4 text-base shadow-lg transition-all active:scale-[0.99]"
        >
          {saving ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <CheckCircle2 size={18} />
          )}
          Save incident
        </button>
        {selectedResident && (
          <div className="text-center text-xs text-stone-500 mt-2">
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
