/* HR · Audit Trail for a single staff member.
 * Read-only timeline of every upload / change / delete / profile update.
 */
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Loader2, History, UserCheck, Trash2, Upload, Pencil } from "lucide-react";

const ACTION_META = {
  hr_file_upload:    { Icon: Upload,    color: "#2F6A3A", label: "Uploaded" },
  hr_file_update:    { Icon: Pencil,    color: "#0e3b4a", label: "Updated" },
  hr_file_delete:    { Icon: Trash2,    color: "#A8273A", label: "Deleted" },
  hr_profile_update: { Icon: UserCheck, color: "#5d6068", label: "Profile" },
};

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

export default function HRAuditTab({ staffId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/hr/staff/${staffId}/audit?limit=200`);
      setItems(r.data.items || []);
    } catch { /* graceful */ }
    finally { setLoading(false); }
  }, [staffId]);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-white border divider-soft rounded-xl p-4 flex items-center gap-2 text-stone-600 text-sm">
        <Loader2 size={14} className="animate-spin" /> Loading audit trail…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white border divider-soft rounded-xl p-6 text-center text-stone-500 text-[13px]"
        data-testid="hr-audit-empty">
        No audit events recorded for this personnel file yet.
      </div>
    );
  }

  return (
    <div className="bg-white border divider-soft rounded-xl p-3" data-testid="hr-audit-tab">
      <ul className="space-y-1.5">
        {items.map((it, idx) => {
          const meta = ACTION_META[it.action] || { Icon: History, color: "#5d6068", label: it.action };
          const Icon = meta.Icon;
          return (
            <li key={idx} className="border-l-2 pl-3 py-2" style={{ borderLeftColor: meta.color }}>
              <div className="flex items-start gap-2 flex-wrap">
                <Icon size={12} style={{ color: meta.color }} className="mt-0.5 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                  {meta.label}
                </span>
                <span className="text-[12px] text-[#0F1115] flex-1 min-w-0">{it.summary || it.action}</span>
                <span className="text-[10px] text-stone-500 shrink-0">{fmt(it.at)}</span>
              </div>
              <div className="text-[10px] text-stone-500 ml-5 mt-0.5">
                by {it.actor_name || it.actor_id || "system"}
                {it.metadata?.folder_id && <> · {it.metadata.folder_id.replace(/_/g, " ")}</>}
                {it.metadata?.filename && <> · {it.metadata.filename}</>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
