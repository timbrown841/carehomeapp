/* Phase E.3.1 — Staff Profile induction summary section.
 *
 * Embedded inside the HR Staff Profile (or any staff-detail view).
 * Shows the latest induction assignment for a staff member with progress,
 * risk badge, outstanding sections, and a download link for the certificate.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import {
  GraduationCap, ChevronRight, FileText, Download,
  AlertTriangle, CheckCircle2,
} from "lucide-react";

const TONE = {
  red: "bg-rose-50 text-rose-800 border-rose-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  grey: "bg-stone-50 text-stone-700 border-stone-200",
};

export default function StaffProfileInductionSection({ staffId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staffId) { setLoading(false); return; }
    api.get(`/induction/staff/${staffId}/summary`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [staffId]);

  if (loading) return null;
  if (!data || !data.assignments.length) {
    return (
      <section className="bg-white border divider-soft rounded-xl p-4" data-testid="profile-induction-empty">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="font-semibold text-[#0F1115] inline-flex items-center gap-1.5">
            <GraduationCap size={14} /> Induction
          </h3>
        </div>
        <p className="text-xs text-stone-500">No induction assigned yet.</p>
      </section>
    );
  }

  const latest = data.assignments[0];
  const tone = latest.signed_off_at ? "green" : latest.risk;
  const statusLabel = latest.signed_off_at
    ? "Signed off"
    : latest.overall_status === "completed"
      ? "Awaiting manager sign-off"
      : latest.overall_status === "in_progress" ? "In progress" : "Not started";
  const token = localStorage.getItem("token") || "";

  return (
    <section className="bg-white border divider-soft rounded-xl p-4" data-testid="profile-induction-section">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 className="font-semibold text-[#0F1115] inline-flex items-center gap-1.5">
          <GraduationCap size={14} /> Induction & Training Records
        </h3>
        <Link to={`/induction/${latest.id}`} className="text-xs text-[#0E3B4A] underline inline-flex items-center gap-1"
              data-testid="profile-induction-open">
          Open <ChevronRight size={11} />
        </Link>
      </div>

      <div className={`rounded-lg border p-3 ${TONE[tone] || TONE.grey}`} data-testid="profile-induction-latest">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display font-semibold text-2xl leading-none">
            {latest.completion_pct}%
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/60">
            {statusLabel}
          </span>
        </div>
        <div className="mt-1 text-[11px]">
          {latest.complete}/{latest.total} sections · started {(latest.created_at || "").slice(0, 10)}
          {latest.target_completion ? ` · target ${latest.target_completion}` : ""}
        </div>
        <div className="mt-2 h-1.5 bg-white/50 rounded-full overflow-hidden">
          <div className="h-full"
               style={{ width: `${latest.completion_pct}%`,
                        background: latest.signed_off_at ? "#2F6A3A" : latest.risk === "red" ? "#A8273A" : latest.risk === "amber" ? "#B8772F" : "#0e3b4a" }} />
        </div>
        {latest.signed_off_at && (
          <div className="text-[11px] mt-2 inline-flex items-center gap-1">
            <CheckCircle2 size={11} /> Signed off by {latest.signed_off_by_name} on {latest.signed_off_at.slice(0, 10)}
          </div>
        )}
        {latest.risk === "red" && !latest.signed_off_at && (
          <div className="text-[11px] mt-2 inline-flex items-center gap-1">
            <AlertTriangle size={11} /> Target date passed — action this week
          </div>
        )}
      </div>

      {latest.outstanding && latest.outstanding.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase font-semibold tracking-wider text-stone-500 mb-1">
            Outstanding sections
          </div>
          <ul className="text-xs space-y-0.5 text-stone-700" data-testid="profile-induction-outstanding">
            {latest.outstanding.map(o => (
              <li key={o.key} className="truncate">• {o.title}</li>
            ))}
          </ul>
        </div>
      )}

      {latest.signed_off_at && (
        <div className="mt-3 pt-3 border-t border-stone-200 flex flex-wrap gap-2">
          <a className="text-xs inline-flex items-center gap-1 text-[#0E3B4A] underline"
             href={`/api/induction/assignments/${latest.id}/certificate.pdf?token=${encodeURIComponent(token)}`}
             target="_blank" rel="noreferrer"
             data-testid="profile-induction-cert-preview">
            <FileText size={11} /> Preview certificate
          </a>
          <a className="text-xs inline-flex items-center gap-1 text-[#0E3B4A] underline"
             href={`/api/induction/assignments/${latest.id}/certificate.pdf?token=${encodeURIComponent(token)}`}
             download={`induction-certificate.pdf`}
             data-testid="profile-induction-cert-download">
            <Download size={11} /> Download PDF
          </a>
        </div>
      )}

      {data.assignments.length > 1 && (
        <div className="mt-3 text-[10px] text-stone-500">
          {data.assignments.length - 1} earlier induction{data.assignments.length - 1 === 1 ? "" : "s"} on file.
        </div>
      )}
    </section>
  );
}
