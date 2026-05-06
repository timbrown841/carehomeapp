import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  FileText,
  Plus,
  X,
  Trash2,
  Loader2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

const CATEGORIES = [
  { id: "care_plan", label: "Care Plan" },
  { id: "placement_plan", label: "Placement Plan" },
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

  const filtered = filter === "all" ? docs : docs.filter((d) => d.category === filter);
  const today = todayIso();

  return (
    <div className="space-y-4" data-testid="resident-documents-tab">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">Documents</h3>
          <p className="text-xs text-[#5d6068] mt-0.5">
            Care plans, court orders, assessments, ID and reviews. {!isSeniorOrAbove && "View-only — speak to a senior to add or edit."}
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
            const tone = expired ? "#A8273A" : expiringSoon ? "#B8772F" : "#0e3b4a";
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
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white"
                      style={{ background: tone }}
                    >
                      {CAT_LABEL[d.category] || d.category}
                    </span>
                    {expired && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-[#A8273A]">
                        <AlertTriangle size={9} /> EXPIRED
                      </span>
                    )}
                    {expiringSoon && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B8772F]">
                        <AlertTriangle size={9} /> Expiring soon
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-[#0F1115]">{d.title}</div>
                  <div className="text-[11px] text-[#5d6068] mt-0.5 flex items-center gap-2 flex-wrap">
                    {d.expiry_date && <span>Expires {d.expiry_date}</span>}
                    <span>Uploaded {(d.created_at || "").slice(0, 10)} by {d.uploaded_by_name}</span>
                  </div>
                  {d.notes && <p className="text-xs text-[#2f3038] mt-1.5">{d.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {d.file_url && (
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
  const [f, setF] = useState({
    title: "",
    category: "care_plan",
    expiry_date: "",
    notes: "",
    file_url: "",
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.title.trim()) return toast.error("Title required");
    setBusy(true);
    try {
      await api.post(`/residents/${residentId}/documents`, {
        ...f,
        expiry_date: f.expiry_date || null,
        notes: f.notes || null,
        file_url: f.file_url || null,
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
          placeholder="Title (e.g. Care Plan v3 — March 2026)"
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
        <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          Expiry date (optional)
        </label>
        <input
          type="date"
          value={f.expiry_date}
          onChange={(e) => setF({ ...f, expiry_date: e.target.value })}
          className={inputCls}
        />
        <input
          placeholder="External link / URL (optional)"
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
        <div className="text-[11px] text-[#5d6068]">
          Note: Document file uploads will arrive in the next iteration. For now, you can paste an external link (Google Drive, SharePoint etc.) and the metadata is tracked here.
        </div>
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
