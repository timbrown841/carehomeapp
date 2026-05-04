import { CheckCircle2, Clock, User, Hash } from "lucide-react";
import { formatFullTimestamp, recordRef } from "@/lib/format";

/**
 * Inline confirmation strip shown directly after a note / incident is saved.
 * Designed to build trust by making the audit metadata visible and unambiguous:
 *   ✓ Saved · {full UK timestamp} · by {author} · ref {short id}
 *
 * Pass the freshly-saved record (must include id, created_at, author_name).
 */
export default function SaveReceipt({
  record,
  label = "Saved successfully",
  testid = "save-receipt",
  className = "",
}) {
  if (!record) return null;
  return (
    <div
      data-testid={testid}
      role="status"
      aria-live="polite"
      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border-l-4 border-l-[#3A5A40] border-y border-r divider-soft bg-[#3A5A40]/5 animate-in fade-in slide-in-from-top-2 duration-300 ${className}`}
    >
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-[#3A5A40] text-white flex items-center justify-center">
          <CheckCircle2 size={18} />
        </div>
        <div>
          <div className="font-display font-bold text-sm text-[#3A5A40] uppercase tracking-wider">
            {label}
          </div>
          <div className="text-[10px] text-stone-500 uppercase tracking-wider">
            Securely stored · auditable
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-700 sm:ml-auto sm:justify-end">
        <span className="inline-flex items-center gap-1.5">
          <Clock size={12} className="text-stone-500" />
          <span data-testid={`${testid}-timestamp`} className="font-mono">
            {formatFullTimestamp(record.created_at)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <User size={12} className="text-stone-500" />
          <span data-testid={`${testid}-author`} className="font-medium">
            {record.author_name || "—"}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-stone-500">
          <Hash size={12} />
          <span data-testid={`${testid}-ref`} className="font-mono">
            {recordRef(record.id)}
          </span>
        </span>
      </div>
    </div>
  );
}
