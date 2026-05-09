import { useEffect, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  FileText,
  Plus,
  X,
  Trash2,
  Loader2,
  Upload,
  Download,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

// User-prioritised categories first, then existing legacy ones
const CATEGORIES = [
  { id: "risk_assessment", label: "Risk Assessments" },
  { id: "support_plan", label: "Support Plans" },
  { id: "placement_plan", label: "Placement Plans" },
  { id: "education_document", label: "Education Documents" },
  { id: "medical_document", label: "Medical Documents" },
  { id: "referral_document", label: "Referral Documents" },
  { id: "safeguarding_document", label: "Safeguarding Documents" },
  { id: "care_plan", label: "Care Plan" },
  { id: "pathway_plan", label: "Pathway Plan" },
  { id: "court_order", label: "Court Order" },
  { id: "ehcp", label: "EHCP" },
  { id: "assessment", label: "Assessment" },
  { id: "consent_form", label: "Consent Form" },
  { id: "review", label: "Review" },
  { id: "id_document", label: "ID Document" },
  { id: "placement_agreement", label: "Placement Agreement" },
  { id: "delegated_authority", label: "Delegated Authority" },
  { id: "other", label: "Other" },
];

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

const todayIso = () => new Date().toISOString().slice(0, 10);

const ACCEPT_MIME = "application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsTab({ resident }) {
  const { isSeniorOrAbove } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/residents/${resident.id}/documents`);
      setDocs(r.data || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (resident?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident?.id]);

  const remove = async (d) => {
    if (!window.confirm(`Delete document: ${d.title}?`)) return;
    try {
      await api.delete(`/residents/documents/${d.id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const downloadDoc = (d) => {
    if (!d.file_id) return;
    const token = localStorage.getItem("cc_token") || "";
    const url = `${api.defaults.baseURL}/files/${d.file_id}?token=${encodeURIComponent(token)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const filtered = filter === "all" ? docs : docs.filter((d) => d.category === filter);
  const today = todayIso();

  // Top-level review/expiry summary banner
  const overdueCount = docs.filter((d) =>
    (d.expiry_date && d.expiry_date < today) ||
    (d.review_date && d.review_date < today)
  ).length;

  return (
    <div className="space-y-4" data-testid="resident-documents-tab">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">Documents</h3>
          <p className="text-xs text-[#5d6068] mt-0.5">
            Risk assessments, plans, court orders, ID and reviews. Files up to 10 MB · PDF, DOCX, PNG or JPG.
            {!isSeniorOrAbove && " View-only — speak to a senior to add or edit."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            data-testid="documents-filter"
            className="bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          {isSeniorOrAbove && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              data-testid="documents-add-btn"
              className="inline-flex items-center gap-1.5 bg-[#0e3b4a] hover:bg-[#0a2c38] text-white font-semibold rounded-xl px-3.5 py-2 text-sm"
            >
              <Plus size={14} /> Add document
            </button>
          )}
        </div>
      </div>

      {overdueCount > 0 && (
        <div
          data-testid="documents-overdue-banner"
          className="bg-[#A8273A]/8 border-l-4 border border-[#A8273A]/30 rounded-xl px-4 py-2.5 text-sm text-[#A8273A] inline-flex items-center gap-2"
          style={{ borderLeftColor: "#A8273A" }}
        >
          <AlertTriangle size={14} />
          <span>
            <b>{overdueCount}</b> document{overdueCount === 1 ? "" : "s"} overdue review or expired — please action.
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-[#5d6068]">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-stone-50 border divider-soft rounded-xl p-10 text-center" data-testid="documents-empty">
          <span className="inline-flex w-10 h-10 rounded-xl bg-[#0e3b4a]/10 text-[#0e3b4a] items-center justify-center">
            <FileText size={18} />
          </span>
          <p className="text-sm text-[#5d6068] mt-2">No documents in this category yet.</p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="documents-list">
          {filtered.map((d) => {
            const expired = d.expiry_date && d.expiry_date < today;
            const expiringSoon =
              d.expiry_date &&
              !expired &&
              new Date(d.expiry_date).getTime() - Date.now() < 30 * 86_400_000;
            const reviewOverdue = d.review_date && d.review_date < today;
            const reviewSoon =
              d.review_date &&
              !reviewOverdue &&
              new Date(d.review_date).getTime() - Date.now() < 30 * 86_400_000;
            const tone =
              expired || reviewOverdue
                ? "#A8273A"
                : expiringSoon || reviewSoon
                ? "#B8772F"
                : "#0e3b4a";
            return (
              <li
                key={d.id}
                data-testid={`document-${d.id}`}
                className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4 flex items-start gap-3 flex-wrap"
                style={{ borderLeftColor: tone }}
              >
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: tone + "14", color: tone }}
                >
                  <FileText size={15} />
                </span>
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white"
                      style={{ background: tone }}
                    >
                      {CAT_LABEL[d.category] || d.category}
                    </span>
                    {expired && (
                      <span
                        data-testid={`document-${d.id}-expired`}
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-[#A8273A]"
                      >
                        <AlertTriangle size={9} /> EXPIRED
                      </span>
                    )}
                    {!expired && expiringSoon && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B8772F]">
                        <AlertTriangle size={9} /> Expiring soon
                      </span>
                    )}
                    {reviewOverdue && (
                      <span
                        data-testid={`document-${d.id}-review-overdue`}
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-[#A8273A]"
                      >
                        <AlertTriangle size={9} /> Review overdue
                      </span>
                    )}
                    {!reviewOverdue && reviewSoon && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B8772F]">
                        <AlertTriangle size={9} /> Review due soon
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-[#0F1115]">{d.title}</div>
                  <div className="text-[11px] text-[#5d6068] mt-0.5 flex items-center gap-2 flex-wrap">
                    {d.expiry_date && <span>Expires {d.expiry_date}</span>}
                    {d.review_date && <span>· Review {d.review_date}</span>}
                    {d.file_size && <span>· {formatBytes(d.file_size)}</span>}
                    <span>
                      · Uploaded {(d.created_at || "").slice(0, 10)} by {d.uploaded_by_name}
                    </span>
                  </div>
                  {d.notes && <p className="text-xs text-[#2f3038] mt-1.5">{d.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {d.file_id && (
                    <button
                      type="button"
                      onClick={() => downloadDoc(d)}
                      data-testid={`document-${d.id}-download`}
                      className="inline-flex items-center gap-1 text-xs text-[#0e3b4a] hover:underline px-2"
                    >
                      <Download size={12} /> Download
                    </button>
                  )}
                  {!d.file_id && d.file_url && (
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#0e3b4a] hover:underline px-2"
                    >
                      <ExternalLink size={12} /> Open
                    </a>
                  )}
                  {isSeniorOrAbove && (
                    <button
                      type="button"
                      onClick={() => remove(d)}
                      className="text-[#8a8d95] hover:text-[#A8273A] p-1 rounded"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showAdd && (
        <AddDocumentModal
          residentId={resident.id}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddDocumentModal({ residentId, onClose, onSaved }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [f, setF] = useState({
    title: "",
    category: "risk_assessment",
    expiry_date: "",
    review_date: "",
    notes: "",
    file_url: "",
  });
  const [busy, setBusy] = useState(false);

  const onFile = (e) => {
    const f0 = e.target.files?.[0];
    if (!f0) return;
    const ok = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
    ].includes(f0.type);
    if (!ok) {
      toast.error("Only PDF, DOCX, PNG or JPG files are allowed");
      return;
    }
    if (f0.size > 10 * 1024 * 1024) {
      toast.error("File exceeds the 10 MB limit");
      return;
    }
    setFile(f0);
    if (!f.title) {
      // Auto-fill title from filename if blank
      const baseName = f0.name.replace(/\.[^.]+$/, "");
      setF((s) => ({ ...s, title: baseName }));
    }
  };

  const submit = async () => {
    if (!f.title.trim()) return toast.error("Title required");
    setBusy(true);
    try {
      let file_id = null;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", "document");
        const up = await api.post("/uploads", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        file_id = up.data?.id || null;
      }
      await api.post(`/residents/${residentId}/documents`, {
        ...f,
        expiry_date: f.expiry_date || null,
        review_date: f.review_date || null,
        notes: f.notes || null,
        file_url: f.file_url || null,
        file_id,
      });
      toast.success("Document added");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border divider-soft space-y-3"
        data-testid="add-document-modal"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">Add document</h3>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <input
          required
          placeholder="Title (e.g. Risk Assessment v3 — March 2026)"
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          data-testid="document-title"
          className={inputCls}
        />
        <select
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value })}
          data-testid="document-category"
          className={inputCls}
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        {/* File upload */}
        <div
          className="border divider-soft rounded-xl p-3 bg-stone-50"
          data-testid="document-upload-block"
        >
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_MIME}
            className="hidden"
            onChange={onFile}
            data-testid="document-file-input"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              data-testid="document-pick-file-btn"
              className="inline-flex items-center gap-1.5 bg-white border divider-soft rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-stone-100"
            >
              <Upload size={12} /> {file ? "Replace file" : "Choose file"}
            </button>
            <span className="text-[11px] text-[#5d6068]">
              {file ? `${file.name} · ${formatBytes(file.size)}` : "PDF, DOCX, PNG or JPG · 10 MB max"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Expiry date
            </label>
            <input
              type="date"
              value={f.expiry_date}
              onChange={(e) => setF({ ...f, expiry_date: e.target.value })}
              data-testid="document-expiry"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Next review date
            </label>
            <input
              type="date"
              value={f.review_date}
              onChange={(e) => setF({ ...f, review_date: e.target.value })}
              data-testid="document-review-date"
              className={inputCls}
            />
          </div>
        </div>

        <input
          placeholder="External link / URL (optional fallback)"
          value={f.file_url}
          onChange={(e) => setF({ ...f, file_url: e.target.value })}
          className={inputCls}
        />
        <textarea
          rows={2}
          placeholder="Notes"
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
          className={`${inputCls} resize-none`}
        />

        <button
          type="submit"
          disabled={busy}
          data-testid="document-submit-btn"
          className="w-full bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Save document
        </button>
      </form>
    </div>
  );
}
