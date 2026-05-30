/* Phase H.3 — Statement of Purpose & Governance Hub
 *
 * SoP elevated from "document upload" to first-class governance workflow.
 * Manager / RM / RI / HR only.
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ScrollText, Upload, FileDown, Loader2, History, ShieldCheck,
  Users as UsersIcon, AlertTriangle, CheckCircle2, Calendar,
  ChevronRight, X, Plus, RefreshCw, AlertCircle, GraduationCap,
  ListChecks, Save,
} from "lucide-react";

const RAG_TONE = {
  red:   { bg: "#FBE3E7", fg: "#7a1a28", line: "#A8273A", label: "Action needed" },
  amber: { bg: "#FCEFD4", fg: "#7a4d12", line: "#B8772F", label: "Review soon" },
  green: { bg: "#E7F3EC", fg: "#1f4f2b", line: "#2F6A3A", label: "On track" },
  grey:  { bg: "#F1EFEC", fg: "#5d6068", line: "#d4d2cc", label: "Not yet uploaded" },
};

const BUCKET_META = {
  not_started: { label: "Not started", tone: "amber", icon: AlertCircle },
  in_progress: { label: "In progress", tone: "amber", icon: Loader2 },
  complete:    { label: "Complete",    tone: "green", icon: CheckCircle2 },
  failed:      { label: "Failed assessment", tone: "red", icon: AlertTriangle },
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
};

export default function GovernanceHub() {
  const { isManagerOrAbove } = useAuth();
  const { mode: legacyMode, effectiveMode } = useOrg();
  const mode = effectiveMode || legacyMode;
  const sector = mode === "adult" ? "adult" : "children";
  const [data, setData] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        api.get(`/governance/sop/dashboard?sector=${sector}`),
        api.get(`/governance/sop/compliance?sector=${sector}`),
      ]);
      setData(d.data);
      setCompliance(c.data);
    } catch (e) {
      if (e?.response?.status !== 403) toast.error("Could not load governance data.");
    } finally { setLoading(false); }
  }, [sector]);

  useEffect(() => { load(); }, [load]);

  const downloadEvidence = async () => {
    setDownloading(true);
    try {
      const r = await api.get(`/governance/sop/evidence.pdf?sector=${sector}`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `statement-of-purpose-evidence-${sector}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Evidence pack downloaded.");
    } catch (e) {
      toast.error(e?.response?.status === 404
        ? "Upload a Statement of Purpose first."
        : "Could not download evidence pack.");
    } finally { setDownloading(false); }
  };

  if (!isManagerOrAbove) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 text-sm text-stone-700"
           data-testid="governance-hub-blocked">
        Governance is restricted to Registered Manager, RI and HR.
      </div>
    );
  }

  if (loading || !data || !compliance) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 inline-flex items-center gap-2 text-stone-600 text-sm">
        <Loader2 size={14} className="animate-spin" /> Loading governance hub…
      </div>
    );
  }

  const sectorLabel = sector === "adult" ? "Adult Services" : "Children's Services";
  const exists = data.exists;
  const rag = RAG_TONE[data.rag_status] || RAG_TONE.grey;

  return (
    <div className="space-y-4 max-w-7xl mx-auto" data-testid="governance-hub">
      <header
        className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0E3B4A 0%, #0a2734 60%, #1E4D5C 100%)", color: "white" }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#FCB960]">
              <ScrollText size={14} />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                Governance Hub · Statement of Purpose
              </span>
            </div>
            <h1 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5"
                style={{ letterSpacing: "-0.02em" }}>
              {exists
                ? `${sectorLabel} · v${data.current_version?.version || "?"}`
                : `No Statement of Purpose yet for ${sectorLabel}`}
            </h1>
            <p className="text-[12px] text-white/65 mt-1 max-w-2xl">
              {exists
                ? <>Effective {fmtDate(data.current_version?.effective_date)} · review {fmtDate(data.review_date)} · {data.compliance_pct}% staff complete</>
                : "Upload the first version to start the governance trail."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              onClick={() => setShowUpload(true)}
              className="bg-[#B8772F] hover:bg-[#a3661f] text-white text-[12px] h-8"
              data-testid="sop-upload-btn"
            >
              <Upload size={12} className="mr-1.5" />
              {exists ? "Publish new version" : "Upload SoP"}
            </Button>
            {exists && (
              <Button
                onClick={downloadEvidence}
                disabled={downloading}
                variant="outline"
                className="bg-white/10 border-white/30 text-white hover:bg-white/20 text-[12px] h-8"
                data-testid="sop-evidence-btn"
              >
                {downloading
                  ? <Loader2 size={12} className="animate-spin mr-1.5" />
                  : <FileDown size={12} className="mr-1.5" />}
                Evidence pack
              </Button>
            )}
            <button
              onClick={load}
              className="text-white/70 hover:text-white p-1.5 rounded hover:bg-white/10"
              data-testid="governance-refresh"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Governance dashboard tiles */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="governance-tiles">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <Tile
            label="Overall status"
            value={rag.label}
            icon={ShieldCheck}
            tone={data.rag_status}
            testid="tile-overall"
          />
          <Tile
            label="Compliance"
            value={`${data.compliance_pct}%`}
            icon={CheckCircle2}
            tone={data.compliance_pct >= 80 ? "green" : data.compliance_pct >= 50 ? "amber" : "red"}
            testid="tile-compliance"
          />
          <Tile
            label="Review due"
            value={data.review_date
              ? (data.days_to_review >= 0
                  ? `${data.days_to_review}d`
                  : `${Math.abs(data.days_to_review)}d overdue`)
              : "Not set"}
            icon={Calendar}
            tone={data.review_rag}
            testid="tile-review"
          />
          <Tile
            label="Outstanding"
            value={(compliance.counts.not_started || 0) + (compliance.counts.in_progress || 0) + (compliance.counts.failed || 0)}
            icon={AlertTriangle}
            tone={(compliance.counts.not_started || 0) + (compliance.counts.in_progress || 0) + (compliance.counts.failed || 0) > 0 ? "amber" : "green"}
            testid="tile-outstanding"
          />
          <Tile
            label="Versions"
            value={data.version_count || 0}
            icon={History}
            tone="grey"
            testid="tile-versions"
          />
        </div>
      </section>

      {exists ? (
        <>
          {/* Outstanding staff */}
          <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="governance-outstanding">
            <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-3">
              Staff compliance
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {["not_started", "in_progress", "complete", "failed"].map((b) => {
                const meta = BUCKET_META[b];
                const list = compliance.buckets?.[b] || [];
                const tone = RAG_TONE[meta.tone] || RAG_TONE.grey;
                const Icon = meta.icon;
                return (
                  <div
                    key={b}
                    className="border rounded-xl p-3"
                    style={{ borderColor: tone.line }}
                    data-testid={`bucket-${b}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                           style={{ background: tone.bg, color: tone.fg }}>
                        <Icon size={13} />
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        {meta.label}
                      </div>
                    </div>
                    <div className="mt-2 font-display font-bold text-2xl" style={{ color: tone.fg }}>
                      {list.length}
                    </div>
                    {list.length > 0 && (
                      <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                        {list.slice(0, 8).map((s) => (
                          <li key={s.assignment_id} className="text-[11.5px] text-stone-700 flex items-center justify-between gap-1">
                            <Link
                              to={`/policy-assignments/${s.assignment_id}`}
                              className="hover:underline truncate"
                              data-testid={`outstanding-${b}-${s.assignment_id}`}
                            >
                              {s.staff_name}
                            </Link>
                            {s.is_overdue && (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-[#FBE3E7] text-[#7a1a28]">
                                Overdue
                              </span>
                            )}
                          </li>
                        ))}
                        {list.length > 8 && (
                          <li className="text-[10px] text-stone-400">+{list.length - 8} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Version history */}
          <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="governance-versions">
            <div className="flex items-center gap-2 mb-3">
              <History size={14} className="text-[#0e3b4a]" />
              <h3 className="font-display font-semibold text-lg text-[#0F1115]">Version history</h3>
            </div>
            <ul className="divide-y divider-soft">
              {(data.versions || []).map((v) => {
                const isCurrent = v.id === data.policy?.current_version_id;
                return (
                  <li key={v.id} data-testid={`gov-version-${v.id}`} className="py-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-stone-100 text-[#0e3b4a] flex items-center justify-center shrink-0">
                      <ScrollText size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-stone-900 flex items-center gap-2 flex-wrap">
                        v{v.version}
                        {isCurrent && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E7F3EC] text-[#1f4f2b]">
                            Current
                          </span>
                        )}
                        {v.archived_at && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
                            Archived
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        {v.author_name || v.uploaded_by_name} · uploaded {fmtDate(v.created_at)} · effective {fmtDate(v.effective_date)}
                        {v.archived_at && <> · archived {fmtDate(v.archived_at)}</>}
                      </div>
                      {v.change_summary && (
                        <div className="text-[12px] text-stone-700 mt-1 italic">"{v.change_summary}"</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : (
        <section className="bg-white border-2 border-[#B8772F]/30 bg-gradient-to-br from-[#FCEFD4]/30 to-white rounded-2xl p-6 text-center"
                 data-testid="governance-empty-state">
          <ScrollText size={32} className="mx-auto mb-3 text-[#B8772F]" />
          <h3 className="font-display font-semibold text-xl text-[#0F1115]">
            Start the governance trail
          </h3>
          <p className="text-[12px] text-stone-600 mt-1.5 max-w-md mx-auto">
            Upload your first Statement of Purpose. Safelyn will auto-assign read-and-sign
            tasks to every staff member, track compliance, and keep an inspection-ready audit trail.
          </p>
          <Button
            onClick={() => setShowUpload(true)}
            className="mt-4 bg-[#B8772F] hover:bg-[#a3661f] text-white text-[12px] h-9"
          >
            <Upload size={12} className="mr-1.5" /> Upload first version
          </Button>
        </section>
      )}

      {showUpload && (
        <UploadSopModal
          sector={sector}
          existingVersion={data.current_version?.version}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); load(); }}
        />
      )}
    </div>
  );
}


function Tile({ label, value, icon: Icon, tone, testid }) {
  const t = RAG_TONE[tone] || RAG_TONE.grey;
  return (
    <div
      data-testid={testid}
      className="rounded-xl border p-3"
      style={{ borderColor: t.line }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center"
           style={{ background: t.bg, color: t.fg }}>
        <Icon size={15} />
      </div>
      <div className="mt-2 font-display font-bold text-2xl" style={{ color: t.fg }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-stone-500 font-bold mt-0.5">
        {label}
      </div>
    </div>
  );
}


function UploadSopModal({ sector, existingVersion, onClose, onUploaded }) {
  const [version, setVersion] = useState("");
  const [author, setAuthor] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [contentText, setContentText] = useState("");
  const [file, setFile] = useState(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const [questions, setQuestions] = useState(null); // null = use defaults
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!version.trim()) { toast.error("Version is required."); return; }
    setSaving(true);
    try {
      let file_id = undefined;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", "document");
        const r = await api.post("/uploads", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        file_id = r.data.id;
      }
      const payload = {
        sector,
        version: version.trim(),
        content_text: contentText.trim() || undefined,
        change_summary: changeSummary.trim() || undefined,
        effective_date: effectiveDate ? `${effectiveDate}T00:00:00+00:00` : undefined,
        review_date: reviewDate ? `${reviewDate}T00:00:00+00:00` : undefined,
        author_name: author.trim() || undefined,
        file_id,
        ...(questions ? { questions } : {}),
      };
      const r = await api.post("/governance/sop/upload-version", payload);
      toast.success(`Published. ${r.data.assignments_created} staff auto-assigned.`);
      onUploaded();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not publish SoP version.");
    } finally { setSaving(false); }
  };

  if (showQuestions) {
    return (
      <SopQuestionsEditor
        initial={questions || []}
        onClose={() => setShowQuestions(false)}
        onSave={(qs) => { setQuestions(qs); setShowQuestions(false); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
         onClick={onClose} data-testid="sop-upload-modal">
      <div className="bg-white rounded-2xl p-5 max-w-lg w-full max-h-[92vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-1">
          {existingVersion ? `Publish new SoP version (currently v${existingVersion})` : "Publish Statement of Purpose"}
        </h3>
        <p className="text-[12px] text-stone-500 mb-3">
          On publish, the previous version is archived, all incomplete assignments are
          superseded, and a fresh read-and-sign task is created for every staff member.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Version *</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)}
                   placeholder="e.g. 3.0"
                   data-testid="sop-version-input"
                   className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Author</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)}
                   placeholder="Sarah Manager"
                   data-testid="sop-author-input"
                   className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Effective date</span>
            <input type="date" value={effectiveDate}
                   onChange={(e) => setEffectiveDate(e.target.value)}
                   data-testid="sop-effective-date"
                   className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm font-mono" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Next review date</span>
            <input type="date" value={reviewDate}
                   onChange={(e) => setReviewDate(e.target.value)}
                   data-testid="sop-review-date"
                   className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm font-mono" />
          </label>
        </div>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Change summary</span>
          <textarea value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)}
                    rows={2}
                    placeholder="What changed in this version?"
                    data-testid="sop-change-summary"
                    className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm" />
        </label>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">
            Attach file (PDF / DOCX / PPTX / MP4)
          </span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
                 data-testid="sop-file-input"
                 className="mt-1 w-full text-sm" />
        </label>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">
            Or paste SoP text (optional in-app reading)
          </span>
          <textarea value={contentText} onChange={(e) => setContentText(e.target.value)}
                    rows={5}
                    placeholder="Full Statement of Purpose text — staff will read this in-app"
                    data-testid="sop-content-text"
                    className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm" />
        </label>
        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowQuestions(true)}
            data-testid="sop-edit-questions-btn"
            className="text-[12px] font-semibold text-[#0e3b4a] hover:underline inline-flex items-center gap-1"
          >
            <ListChecks size={11} />
            {questions
              ? `Custom assessment · ${questions.length} question${questions.length === 1 ? "" : "s"}`
              : "Customise assessment (default 4 Qs)"}
          </button>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="text-[12px] h-8">Cancel</Button>
          <Button
            onClick={save}
            disabled={saving}
            data-testid="sop-upload-submit"
            className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-8"
          >
            {saving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Upload size={12} className="mr-1.5" />}
            Publish & auto-assign
          </Button>
        </div>
      </div>
    </div>
  );
}


function SopQuestionsEditor({ initial, onClose, onSave }) {
  const [items, setItems] = useState(
    initial.length ? initial : [
      { type: "mcq", question: "", options: ["", "", ""], correct_index: 0, order: 0 },
    ],
  );
  const add = (type) => setItems([...items, {
    type, question: "",
    options: type === "mcq" ? ["", "", ""] : undefined,
    correct_index: type === "mcq" ? 0 : undefined,
    order: items.length,
  }]);
  const remove = (i) => setItems(items.filter((_, idx) => idx !== i));
  const update = (i, patch) => setItems(items.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
         onClick={onClose} data-testid="sop-questions-modal">
      <div className="bg-white rounded-2xl p-5 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-2">SoP assessment questions</h3>
        <p className="text-[12px] text-stone-500 mb-3">
          MCQs are auto-graded (80% pass). Reflection prompts are stored for managers.
          Leave empty to use the default 4 questions.
        </p>
        <div className="space-y-3">
          {items.map((q, i) => (
            <div key={i} className="border divider-soft rounded-xl p-3" data-testid={`sop-q-${i}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-stone-500">
                  Q{i + 1} · {q.type === "mcq" ? "Multiple choice" : "Reflection"}
                </span>
                <button onClick={() => remove(i)} className="text-stone-400 hover:text-[#A8273A]">
                  <X size={12} />
                </button>
              </div>
              <textarea
                value={q.question}
                onChange={(e) => update(i, { question: e.target.value })}
                rows={2}
                placeholder="Question text"
                className="w-full px-3 py-2 border divider-soft rounded-lg text-sm"
              />
              {q.type === "mcq" && (
                <div className="mt-2 space-y-1">
                  {(q.options || []).map((opt, oi) => (
                    <label key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`c-${i}`}
                        checked={q.correct_index === oi}
                        onChange={() => update(i, { correct_index: oi })}
                        className="accent-[#0e3b4a]"
                      />
                      <input
                        value={opt}
                        onChange={(e) => {
                          const opts = [...(q.options || [])];
                          opts[oi] = e.target.value;
                          update(i, { options: opts });
                        }}
                        placeholder={`Option ${oi + 1}${q.correct_index === oi ? " (correct)" : ""}`}
                        className="flex-1 px-2 py-1 border divider-soft rounded text-sm"
                      />
                    </label>
                  ))}
                  <button
                    onClick={() => update(i, { options: [...(q.options || []), ""] })}
                    className="text-[11px] text-[#0e3b4a] hover:underline"
                  >+ Add option</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => add("mcq")} className="text-[12px] h-8">
            <Plus size={12} className="mr-1.5" /> Add MCQ
          </Button>
          <Button variant="outline" onClick={() => add("reflection")} className="text-[12px] h-8">
            <Plus size={12} className="mr-1.5" /> Add reflection
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose} className="text-[12px] h-8">Cancel</Button>
          <Button
            onClick={() => onSave(items.filter((q) => q.question.trim()))}
            data-testid="sop-questions-save"
            className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-8"
          >
            <Save size={12} className="mr-1.5" /> Use these questions
          </Button>
        </div>
      </div>
    </div>
  );
}
