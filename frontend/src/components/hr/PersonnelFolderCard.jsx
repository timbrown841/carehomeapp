/* HR · Personnel Folder Card — Phase F
 *
 * Premium operational folder tile. RAG status, doc count, expiry pill,
 * "last reviewed" footer. Expandable to reveal file list + upload.
 *
 * Designed to feel like opening a secure Ofsted-ready personnel file,
 * NOT a generic HR profile page.
 */
import { useState } from "react";
import {
  Folder, FolderOpen, ChevronDown, ChevronRight, Upload, Loader2,
  AlertTriangle, AlertCircle, CheckCircle2, Circle, Calendar, Pencil,
  Trash2, Download, FileText, History, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api, { API as API_BASE } from "@/lib/api";
import { toast } from "sonner";

const STATUS_TONE = {
  green: { fg: "#1f4f2b", bg: "#E7F3EC", line: "#2F6A3A", Icon: CheckCircle2, label: "Compliant" },
  amber: { fg: "#7a4d12", bg: "#FCEFD4", line: "#B8772F", Icon: AlertCircle,  label: "Action soon" },
  red:   { fg: "#7a1a28", bg: "#FBE3E7", line: "#A8273A", Icon: AlertTriangle, label: "Missing / overdue" },
  grey:  { fg: "#5d6068", bg: "#F1EFEC", line: "#5d6068", Icon: Circle,       label: "Optional" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function daysUntil(iso) {
  if (!iso) return null;
  try {
    const ms = new Date(iso) - new Date();
    return Math.round(ms / 86400000);
  } catch { return null; }
}

export default function PersonnelFolderCard({ folder, staffId, onChange }) {
  const [open, setOpen] = useState(false);
  const tone = STATUS_TONE[folder.status.status] || STATUS_TONE.grey;
  const StatusIcon = tone.Icon;
  const FolderIcon = open ? FolderOpen : Folder;

  return (
    <div
      className="bg-white border divider-soft rounded-xl overflow-hidden"
      style={{ borderLeft: `4px solid ${tone.line}` }}
      data-testid={`hr-folder-${folder.id}`}
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-3.5 py-3 hover:bg-stone-50 transition-colors"
        data-testid={`hr-folder-toggle-${folder.id}`}
      >
        <div className="flex items-start gap-2.5">
          <FolderIcon size={16} className="text-[#0e3b4a] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-[13px] text-[#0F1115]">{folder.label}</span>
              {folder.required && (
                <span className="text-[8px] font-bold uppercase tracking-wider text-[#0e3b4a] bg-[#0e3b4a14] px-1 rounded">
                  Required
                </span>
              )}
              {folder.expiry_tracked && (
                <span className="text-[8px] font-bold uppercase tracking-wider text-[#5d6068] bg-stone-100 px-1 rounded">
                  Expiry tracked
                </span>
              )}
              {folder.review_days && (
                <span className="text-[8px] font-bold uppercase tracking-wider text-[#5d6068] bg-stone-100 px-1 rounded">
                  Review every {folder.review_days >= 365 ? "year" : `${folder.review_days}d`}
                </span>
              )}
            </div>
            {folder.description && (
              <p className="text-[11px] text-stone-500 mt-0.5 leading-snug line-clamp-1">
                {folder.description}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1"
              style={{ background: tone.bg, color: tone.fg }}
              data-testid={`hr-folder-status-${folder.id}`}
            >
              <StatusIcon size={9} /> {folder.status.status === "grey" ? "Optional" : tone.label}
            </span>
            <span className="text-[10px] text-stone-500">
              {folder.status.doc_count} doc{folder.status.doc_count === 1 ? "" : "s"}
            </span>
          </div>
          {open ? (
            <ChevronDown size={14} className="text-stone-400 mt-1 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-stone-400 mt-1 shrink-0" />
          )}
        </div>
        {/* Status reason + expiry pill */}
        {(folder.status.reason && folder.status.status !== "green") && (
          <div className="mt-1.5 ml-6 text-[11px]" style={{ color: tone.fg }}>
            {folder.status.reason}
            {folder.status.earliest_expiry && (
              <span className="text-stone-500 ml-2">
                · earliest expiry {fmtDate(folder.status.earliest_expiry)}
              </span>
            )}
          </div>
        )}
      </button>

      {open && (
        <FolderBody folder={folder} staffId={staffId} onChange={onChange} />
      )}
    </div>
  );
}

function FolderBody({ folder, staffId, onChange }) {
  const [files, setFiles] = useState(folder.files || []);
  const [uploading, setUploading] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [notes, setNotes] = useState("");
  const [pickedFile, setPickedFile] = useState(null);

  const refresh = async () => {
    if (onChange) await onChange();
  };

  const upload = async () => {
    if (!pickedFile) {
      toast.error("Pick a file first");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", pickedFile);
      fd.append("folder_id", folder.id);
      if (expiryDate) fd.append("expiry_date", new Date(expiryDate).toISOString());
      if (reviewDate) fd.append("review_date", new Date(reviewDate).toISOString());
      if (notes) fd.append("notes", notes);
      const res = await api.post(`/hr/staff/${staffId}/files`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFiles((prev) => [res.data, ...prev]);
      setPickedFile(null); setExpiryDate(""); setReviewDate(""); setNotes("");
      toast.success(`${folder.label} uploaded`);
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (fileId, name) => {
    if (!window.confirm(`Delete ${name}? This is logged in the audit trail.`)) return;
    try {
      await api.delete(`/hr/staff/${staffId}/files/${fileId}`);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("Deleted");
      await refresh();
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const patchFile = async (fileId, changes) => {
    try {
      await api.patch(`/hr/staff/${staffId}/files/${fileId}`, changes);
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, ...changes } : f)));
      toast.success("Updated");
      await refresh();
    } catch {
      toast.error("Update failed");
    }
  };

  return (
    <div className="px-3.5 pb-3.5 pt-2 border-t divider-soft bg-stone-50/50">
      {/* Existing files list */}
      {files.length === 0 ? (
        <p className="text-[12px] text-stone-500 italic py-2">No documents on file yet.</p>
      ) : (
        <ul className="space-y-1.5 mb-3" data-testid={`hr-folder-files-${folder.id}`}>
          {files.map((f) => (
            <FileRow key={f.id} file={f} folder={folder}
              onRemove={() => remove(f.id, f.original_filename)}
              onPatch={(c) => patchFile(f.id, c)}
            />
          ))}
        </ul>
      )}

      {/* Upload zone */}
      <div className="bg-white border divider-soft rounded-lg p-3" data-testid={`hr-folder-upload-${folder.id}`}>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#0e3b4a] mb-2">
          <Upload size={11} /> Add document
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          <div className="sm:col-span-3">
            <input
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setPickedFile(e.target.files?.[0] || null)}
              className="text-[12px] file:mr-2 file:rounded-md file:border-0 file:bg-[#0e3b4a] file:text-white file:px-3 file:py-1.5 file:text-[11px] file:cursor-pointer cursor-pointer"
              data-testid={`hr-folder-file-input-${folder.id}`}
            />
          </div>
          {folder.expiry_tracked && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500">Expiry date</label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
                className="text-[12px] h-8 mt-0.5"
                data-testid={`hr-folder-expiry-${folder.id}`} />
            </div>
          )}
          {folder.review_days && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500">Last reviewed</label>
              <Input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)}
                className="text-[12px] h-8 mt-0.5" />
            </div>
          )}
          <div className={folder.expiry_tracked ? "" : "sm:col-span-2"}>
            <label className="text-[10px] uppercase tracking-wider text-stone-500">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="text-[12px] h-8 mt-0.5" placeholder="e.g. DBS cert no., reference" />
          </div>
        </div>
        <div className="mt-2.5 flex justify-end">
          <Button onClick={upload} disabled={!pickedFile || uploading}
            className="bg-[#0e3b4a] hover:bg-[#0a2e3a] text-white text-[12px] h-8"
            data-testid={`hr-folder-upload-btn-${folder.id}`}>
            {uploading ? <Loader2 size={12} className="animate-spin mr-1" /> : <Upload size={12} className="mr-1" />}
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

function FileRow({ file, folder, onRemove, onPatch }) {
  const [editing, setEditing] = useState(false);
  const [expiry, setExpiry] = useState(file.expiry_date ? file.expiry_date.slice(0, 10) : "");
  const [review, setReview] = useState(file.review_date ? file.review_date.slice(0, 10) : "");

  const expDays = daysUntil(file.expiry_date);
  const expTone =
    expDays === null ? null :
    expDays < 0 ? STATUS_TONE.red :
    expDays <= (folder.warn_days || 60) ? STATUS_TONE.amber :
    STATUS_TONE.green;

  const downloadHref = file.storage_id?.startsWith("demo-")
    ? null
    : `${API_BASE}/files/${file.storage_id}`;

  const saveEdit = async () => {
    const changes = {};
    if (expiry) changes.expiry_date = new Date(expiry).toISOString();
    if (review) changes.review_date = new Date(review).toISOString();
    if (Object.keys(changes).length) {
      await onPatch(changes);
    }
    setEditing(false);
  };

  return (
    <li className="bg-white border divider-soft rounded-lg p-2.5">
      <div className="flex items-start gap-2">
        <FileText size={13} className="text-[#0e3b4a] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-[#0F1115] truncate">{file.original_filename}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
              v{file.version || 1}
            </span>
            {expTone && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: expTone.bg, color: expTone.fg }}>
                {expDays < 0 ? `expired ${Math.abs(expDays)}d ago` : `${expDays}d to expiry`}
              </span>
            )}
          </div>
          <div className="text-[10px] text-stone-500 mt-0.5">
            Uploaded {fmtDate(file.uploaded_at)} by {file.uploaded_by_name || "—"}
            {file.signed_off_by && <> · Signed off by {file.signed_off_by} {fmtDate(file.signed_off_at)}</>}
          </div>
          {file.notes && <div className="text-[11px] text-stone-600 mt-1 italic">{file.notes}</div>}

          {editing && (
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {folder.expiry_tracked && (
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-stone-500">Expiry</label>
                  <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="text-[12px] h-7 mt-0.5" />
                </div>
              )}
              {folder.review_days && (
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-stone-500">Last reviewed</label>
                  <Input type="date" value={review} onChange={(e) => setReview(e.target.value)} className="text-[12px] h-7 mt-0.5" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {downloadHref ? (
            <a href={downloadHref} target="_blank" rel="noreferrer"
              className="text-[10px] text-[#0e3b4a] hover:underline flex items-center gap-1">
              <Download size={10} /> Download
            </a>
          ) : (
            <span className="text-[10px] text-stone-400 italic" title="Demo placeholder">demo</span>
          )}
          {editing ? (
            <button type="button" onClick={saveEdit} className="text-[10px] text-[#2F6A3A] hover:underline">Save</button>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="text-[10px] text-stone-500 hover:text-[#0e3b4a] flex items-center gap-1">
              <Pencil size={10} /> Edit
            </button>
          )}
          <button type="button" onClick={onRemove} className="text-[10px] text-[#A8273A] hover:underline flex items-center gap-1">
            <Trash2 size={10} /> Delete
          </button>
        </div>
      </div>
    </li>
  );
}
