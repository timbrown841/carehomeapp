/* Phase H — Policy Detail (manager+) — versions, upload, assignments. */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FileText, History, Upload, Plus, X, Loader2, Users as UsersIcon,
  CheckCircle2, ChevronLeft, ListChecks, Save,
} from "lucide-react";
import { StatusPill } from "@/pages/InductionPolicyHub";

export default function PolicyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isManagerOrAbove } = useAuth();
  const [data, setData] = useState(null);
  const [assigns, setAssigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/policies/${id}`);
      setData(r.data);
      const a = await api.get(`/policy-assignments?policy_id=${id}`);
      setAssigns(a.data.assignments || []);
    } catch {
      toast.error("Could not load policy.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!isManagerOrAbove) {
    return <div className="bg-white border divider-soft rounded-2xl p-6 text-sm">Manager+ only.</div>;
  }
  if (loading || !data) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 inline-flex items-center gap-2 text-stone-600 text-sm">
        <Loader2 size={14} className="animate-spin" /> Loading policy…
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto" data-testid="policy-detail-page">
      <button
        onClick={() => nav("/policies?tab=library")}
        className="text-[12px] font-semibold text-[#0e3b4a] hover:underline inline-flex items-center gap-1"
        data-testid="back-to-library"
      >
        <ChevronLeft size={12} /> Back to library
      </button>

      <header className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500">
              {data.sector === "adult" ? "Adult Services" : "Children's Services"} · {data.category}
            </div>
            <h1 className="font-display font-semibold text-2xl text-[#0F1115] mt-1">
              {data.title}
            </h1>
            {data.summary && (
              <p className="text-[13px] text-stone-700 mt-2 max-w-2xl">{data.summary}</p>
            )}
            <div className="text-[11px] text-stone-500 mt-2 space-x-3">
              {data.current_version && (
                <span>v{data.current_version.version} · effective {(data.current_version.effective_date || "").slice(0, 10)}</span>
              )}
              {data.review_date && <span>Next review {(data.review_date || "").slice(0, 10)}</span>}
            </div>
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
            style={{
              background: data.rag_status === "red" ? "#FBE3E7"
                : data.rag_status === "amber" ? "#FCEFD4" : "#E7F3EC",
              color: data.rag_status === "red" ? "#7a1a28"
                : data.rag_status === "amber" ? "#7a4d12" : "#1f4f2b",
            }}
          >
            {data.rag_status}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setShowUpload(true)}
            className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-8"
            data-testid="policy-upload-version-btn"
          >
            <Upload size={12} className="mr-1.5" /> Upload new version
          </Button>
          <Button
            onClick={() => setShowQuestions(true)}
            variant="outline"
            className="text-[12px] h-8"
            data-testid="policy-edit-questions-btn"
          >
            <ListChecks size={12} className="mr-1.5" /> Edit assessment ({(data.questions || []).length})
          </Button>
          <Button
            onClick={() => setShowAssign(true)}
            variant="outline"
            className="text-[12px] h-8"
            data-testid="policy-assign-btn"
          >
            <UsersIcon size={12} className="mr-1.5" /> Assign to staff
          </Button>
        </div>
      </header>

      <section className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <History size={14} className="text-[#0e3b4a]" />
          <h2 className="font-display font-semibold text-lg text-[#0F1115]">Version history</h2>
        </div>
        {(data.versions || []).length === 0 ? (
          <div className="text-[13px] text-stone-500 py-3">
            No versions uploaded yet. Upload a version to make this policy effective.
          </div>
        ) : (
          <ul className="divide-y divider-soft" data-testid="versions-list">
            {data.versions.map((v) => (
              <li key={v.id} className="py-3 flex items-start gap-3" data-testid={`version-row-${v.id}`}>
                <div className="w-9 h-9 rounded-lg bg-stone-100 text-[#0e3b4a] flex items-center justify-center shrink-0">
                  <FileText size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-900">v{v.version}
                    {!v.archived_at && (
                      <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E7F3EC] text-[#1f4f2b]">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    Uploaded {(v.created_at || "").slice(0, 10)} by {v.uploaded_by_name || "—"}
                    {v.archived_at && <> · archived {(v.archived_at || "").slice(0, 10)}</>}
                  </div>
                  {v.change_summary && (
                    <div className="text-[12px] text-stone-700 mt-1 italic">"{v.change_summary}"</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border divider-soft rounded-2xl p-5">
        <h2 className="font-display font-semibold text-lg text-[#0F1115] mb-3">
          Assignments ({assigns.length})
        </h2>
        {assigns.length === 0 ? (
          <div className="text-[13px] text-stone-500 py-3">
            No staff assigned yet. Click <strong>Assign to staff</strong> above.
          </div>
        ) : (
          <ul className="divide-y divider-soft">
            {assigns.map((a) => (
              <li key={a.id} className="py-3 flex items-start gap-3 flex-wrap"
                  data-testid={`policy-assignment-${a.id}`}>
                <StatusPill status={a.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-900">{a.staff_name}</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    Assigned {(a.assigned_at || "").slice(0, 10)} · due {(a.due_date || "").slice(0, 10)}
                    {a.assessment_score !== null && a.assessment_score !== undefined &&
                      <> · score {a.assessment_score}%</>}
                  </div>
                </div>
                <Link
                  to={`/policy-assignments/${a.id}`}
                  className="text-[12px] font-semibold text-[#0e3b4a] hover:underline"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showUpload && (
        <UploadVersionModal pid={id} onClose={() => setShowUpload(false)} onUploaded={() => { setShowUpload(false); load(); }} />
      )}
      {showQuestions && (
        <QuestionsModal
          pid={id}
          initial={data.questions || []}
          onClose={() => setShowQuestions(false)}
          onSaved={() => { setShowQuestions(false); load(); }}
        />
      )}
      {showAssign && (
        <AssignModal pid={id} onClose={() => setShowAssign(false)} onAssigned={() => { setShowAssign(false); load(); }} />
      )}
    </div>
  );
}


function UploadVersionModal({ pid, onClose, onUploaded }) {
  const [version, setVersion] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [contentText, setContentText] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!version.trim()) { toast.error("Version number required."); return; }
    setSaving(true);
    try {
      let file_id = undefined;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", "document");
        const r = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
        file_id = r.data.id;
      }
      await api.post(`/policies/${pid}/versions`, {
        version: version.trim(),
        change_summary: changeSummary.trim() || undefined,
        effective_date: effectiveDate ? `${effectiveDate}T00:00:00+00:00` : undefined,
        file_id,
        content_text: contentText.trim() || undefined,
      });
      toast.success("New version uploaded.");
      onUploaded();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
         onClick={onClose} data-testid="upload-version-modal">
      <div className="bg-white rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-2">Upload new policy version</h3>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Version *</span>
          <input value={version} onChange={(e) => setVersion(e.target.value)}
                 placeholder="e.g. 2.0"
                 data-testid="version-input"
                 className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm" />
        </label>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Change summary</span>
          <textarea value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)}
                    rows={2}
                    className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm" />
        </label>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Effective date</span>
          <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)}
                 className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm font-mono" />
        </label>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">File (PDF / DOCX / PPTX / MP4)</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
                 data-testid="version-file-input"
                 className="mt-1 w-full text-sm" />
        </label>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Or paste policy text</span>
          <textarea value={contentText} onChange={(e) => setContentText(e.target.value)}
                    rows={4}
                    placeholder="Optional plain-text fallback for staff to read in-app"
                    className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm" />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="text-[12px] h-8">Cancel</Button>
          <Button onClick={save} disabled={saving}
                  data-testid="upload-version-submit"
                  className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-8">
            {saving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Upload size={12} className="mr-1.5" />}
            Upload version
          </Button>
        </div>
      </div>
    </div>
  );
}


function QuestionsModal({ pid, initial, onClose, onSaved }) {
  const [items, setItems] = useState(
    initial && initial.length ? initial : [
      { type: "mcq", question: "", options: ["", "", ""], correct_index: 0, order: 0 },
    ]
  );
  const [saving, setSaving] = useState(false);

  const add = (type) => setItems([...items, {
    type, question: "",
    options: type === "mcq" ? ["", "", ""] : undefined,
    correct_index: type === "mcq" ? 0 : undefined,
    order: items.length,
  }]);
  const remove = (i) => setItems(items.filter((_, idx) => idx !== i));
  const update = (i, patch) => setItems(items.map((x, idx) => idx === i ? { ...x, ...patch } : x));

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/policies/${pid}/questions`, { questions: items.map((q, i) => ({ ...q, order: i })) });
      toast.success("Assessment saved.");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save assessment.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
         onClick={onClose} data-testid="questions-modal">
      <div className="bg-white rounded-2xl p-5 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-1">
          Knowledge assessment
        </h3>
        <p className="text-[12px] text-stone-500 mb-3">
          Add MCQs (auto-graded; staff must score ≥80% to sign) and reflection prompts.
        </p>
        <div className="space-y-3">
          {items.map((q, i) => (
            <div key={i} className="border divider-soft rounded-xl p-3" data-testid={`question-${i}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-stone-500">
                  Question {i + 1} · {q.type === "mcq" ? "Multiple choice" : "Reflection"}
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
                data-testid={`question-text-${i}`}
                className="w-full px-3 py-2 border divider-soft rounded-lg text-sm"
              />
              {q.type === "mcq" && (
                <div className="mt-2 space-y-1">
                  {(q.options || []).map((opt, oi) => (
                    <label key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${i}`}
                        checked={q.correct_index === oi}
                        onChange={() => update(i, { correct_index: oi })}
                        data-testid={`question-${i}-correct-${oi}`}
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
          <Button variant="outline" onClick={() => add("mcq")} className="text-[12px] h-8" data-testid="add-mcq">
            <Plus size={12} className="mr-1.5" /> Add MCQ
          </Button>
          <Button variant="outline" onClick={() => add("reflection")} className="text-[12px] h-8" data-testid="add-reflection">
            <Plus size={12} className="mr-1.5" /> Add reflection
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose} className="text-[12px] h-8">Cancel</Button>
          <Button onClick={save} disabled={saving}
                  data-testid="save-questions"
                  className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-8">
            {saving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Save size={12} className="mr-1.5" />}
            Save assessment
          </Button>
        </div>
      </div>
    </div>
  );
}


function AssignModal({ pid, onClose, onAssigned }) {
  const [staff, setStaff] = useState([]);
  const [sid, setSid] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/auth/users/picker");
        setStaff(r.data || []);
      } catch { /* */ }
    })();
  }, []);

  const save = async () => {
    if (!sid) { toast.error("Pick a staff member."); return; }
    setSaving(true);
    try {
      await api.post("/policy-assignments", {
        policy_id: pid,
        staff_id: sid,
        due_date: due ? `${due}T00:00:00+00:00` : undefined,
      });
      toast.success("Policy assigned.");
      onAssigned();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not assign.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
         onClick={onClose} data-testid="assign-modal">
      <div className="bg-white rounded-2xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-3">
          Assign to staff
        </h3>
        <select
          value={sid}
          onChange={(e) => setSid(e.target.value)}
          data-testid="assign-staff-select"
          className="w-full px-3 py-2 border divider-soft rounded-lg text-sm"
        >
          <option value="">Pick a staff member…</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>{u.name} · {u.role}</option>
          ))}
        </select>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Due date (optional · defaults to 14d)</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
                 className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm font-mono" />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="text-[12px] h-8">Cancel</Button>
          <Button onClick={save} disabled={saving}
                  data-testid="assign-confirm"
                  className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-8">
            <UsersIcon size={12} className="mr-1.5" /> Assign
          </Button>
        </div>
      </div>
    </div>
  );
}
