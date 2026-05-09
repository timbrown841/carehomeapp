import { useEffect, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * <InlineField> — fast, low-risk inline edit on the resident profile.
 *
 * Required props:
 *   resident       The full resident object (used for id and current value)
 *   field          The DB field name to PATCH (e.g. "key_worker", "risk_level")
 *   label          Human label rendered when not editing
 *   onSaved(updated) callback after successful PATCH
 *
 * Optional:
 *   type           "text" (default) | "textarea" | "select" | "date" | "tel"
 *   options        Array<{value,label}> for select
 *   placeholder    Placeholder for empty value
 *   sensitive      If true, requires a confirm() before save (used for risk levels etc.)
 *   minTier        Minimum tier required to edit (default 2 — Senior+)
 *   testIdPrefix   Override test id prefix (default `inline-${field}`)
 */
export default function InlineField({
  resident,
  field,
  label,
  type = "text",
  options,
  placeholder = "—",
  sensitive = false,
  minTier = 2,
  onSaved,
  testIdPrefix,
  className = "",
}) {
  const { tier } = useAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(resident?.[field] ?? "");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const tid = testIdPrefix || `inline-${field}`;
  const canEdit = tier >= minTier;

  useEffect(() => {
    setValue(resident?.[field] ?? "");
  }, [resident?.[field], field, resident]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) inputRef.current.select();
    }
  }, [editing]);

  const cancel = () => {
    setValue(resident?.[field] ?? "");
    setEditing(false);
  };

  const save = async () => {
    const original = resident?.[field] ?? "";
    if (value === original) {
      setEditing(false);
      return;
    }
    if (sensitive) {
      const ok = window.confirm(
        `Update '${label}' from "${original || "—"}" to "${value || "—"}"? This is recorded in the audit log.`
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await api.patch(`/residents/${resident.id}`, { [field]: value === "" ? null : value });
      onSaved?.(r.data);
      toast.success(`${label} updated`);
      setEditing(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => {
    if (type !== "textarea" && e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      cancel();
    }
  };

  if (!editing) {
    const displayed =
      type === "select" && options
        ? (options.find((o) => o.value === resident?.[field])?.label) || resident?.[field] || placeholder
        : resident?.[field] || placeholder;
    return (
      <div
        className={`group inline-flex items-center gap-1.5 ${className}`}
        data-testid={`${tid}-display`}
      >
        <span className="truncate">{displayed}</span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            data-testid={`${tid}-edit-btn`}
            className="opacity-0 group-hover:opacity-100 text-[#5d6068] hover:text-[#0e3b4a] transition-opacity"
            aria-label={`Edit ${label}`}
            title={`Edit ${label}`}
          >
            <Pencil size={11} />
          </button>
        )}
      </div>
    );
  }

  const inputCls =
    "bg-white border divider-soft rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      data-testid={`${tid}-edit`}
    >
      {type === "textarea" ? (
        <textarea
          ref={inputRef}
          rows={2}
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          data-testid={`${tid}-input`}
          className={`${inputCls} min-w-[220px] resize-y`}
        />
      ) : type === "select" ? (
        <select
          ref={inputRef}
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          data-testid={`${tid}-input`}
          className={inputCls}
        >
          <option value="">—</option>
          {(options || []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          ref={inputRef}
          type={type}
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          data-testid={`${tid}-input`}
          className={`${inputCls} min-w-[140px]`}
          placeholder={placeholder}
        />
      )}
      <button
        type="button"
        onClick={save}
        disabled={busy}
        data-testid={`${tid}-save-btn`}
        className="text-[#2F6A3A] hover:text-[#1F4F2A] disabled:opacity-50 p-0.5"
        title="Save (Enter)"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
      </button>
      <button
        type="button"
        onClick={cancel}
        data-testid={`${tid}-cancel-btn`}
        className="text-[#A8273A] hover:text-[#7a1929] p-0.5"
        title="Cancel (Esc)"
      >
        <X size={13} />
      </button>
    </div>
  );
}
