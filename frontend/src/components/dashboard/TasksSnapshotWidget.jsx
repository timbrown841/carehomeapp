/* Phase E.2 — Tasks Snapshot dashboard widget. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CheckSquare, AlertOctagon, Clock3, ChevronRight } from "lucide-react";

const KIND_LABELS = {
  key_work: "Key work",
  supervision: "Supervision",
  team_meeting: "Team meeting",
  lac_review: "LAC review",
  pep_meeting: "PEP",
  family_time: "Family time",
  health_appointment: "Health appt",
  independent_living: "Independent living",
  training_renewal: "Training renewal",
  reg44_action: "Reg 44 action",
  ofsted_action: "Ofsted action",
  custom: "Task",
};

export default function TasksSnapshotWidget() {
  const { isSeniorOrAbove } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isSeniorOrAbove) return;
    api.get("/tasks/dashboard")
      .then(r => setData(r.data))
      .catch(() => {/* ignore */});
  }, [isSeniorOrAbove]);

  if (!isSeniorOrAbove || !data) return null;

  const hasUrgent = data.overdue.length > 0;
  const compTone = data.compliance_pct >= 85 ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : data.compliance_pct >= 65 ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-rose-50 text-rose-800 border-rose-200";

  return (
    <section className="bg-white border divider-soft rounded-2xl p-4 sm:p-5" data-testid="tasks-snapshot-widget">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[11px] uppercase font-semibold tracking-[0.14em] text-[#0e3b4a]">
            Tasks · Manager Action Centre
          </div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-0.5">
            {data.total_open} open · {data.overdue.length} overdue
          </h3>
        </div>
        <Link to="/tasks" className="text-xs text-[#0E3B4A] underline inline-flex items-center gap-1"
              data-testid="tasks-snapshot-open">
          Open Tasks <ChevronRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className={`rounded-xl border px-3 py-3 ${hasUrgent ? "bg-rose-50 border-rose-200" : "bg-stone-50 border-stone-200"}`}
             data-testid="tasks-overdue-tile">
          <div className="flex items-baseline justify-between">
            <span className="font-display font-semibold text-2xl text-[#0F1115]">{data.overdue.length}</span>
            {hasUrgent && <AlertOctagon size={14} className="text-rose-700" />}
          </div>
          <div className="text-[11px] font-semibold mt-1 text-stone-700">Overdue</div>
        </div>
        <div className="rounded-xl border bg-amber-50 border-amber-200 px-3 py-3" data-testid="tasks-upcoming-tile">
          <div className="flex items-baseline justify-between">
            <span className="font-display font-semibold text-2xl text-[#0F1115]">{data.upcoming_7d.length}</span>
            <Clock3 size={14} className="text-amber-700" />
          </div>
          <div className="text-[11px] font-semibold mt-1 text-stone-700">Due in 7 days</div>
        </div>
        <div className={`rounded-xl border px-3 py-3 ${compTone}`} data-testid="tasks-compliance-tile">
          <div className="flex items-baseline justify-between">
            <span className="font-display font-semibold text-2xl">{data.compliance_pct}%</span>
            <CheckSquare size={14} />
          </div>
          <div className="text-[11px] font-semibold mt-1">On-time (30d)</div>
        </div>
      </div>

      {data.overdue.length > 0 && (
        <div className="mb-3" data-testid="tasks-overdue-list">
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
            Overdue — action today
          </div>
          <ul className="divide-y divide-stone-100 text-sm">
            {data.overdue.slice(0, 5).map(t => (
              <li key={t.id} className="py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/tasks?id=${t.id}`} className="text-stone-800 hover:underline truncate block">
                    {t.title}
                  </Link>
                  <div className="text-[10px] text-stone-500">
                    {KIND_LABELS[t.kind] || t.kind} · {t.assigned_to_name || "Unassigned"} · due {(t.due_at || "").slice(0, 10)}
                  </div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">Overdue</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.upcoming_7d.length > 0 && (
        <div data-testid="tasks-upcoming-list">
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
            Coming up in 7 days
          </div>
          <ul className="divide-y divide-stone-100 text-sm">
            {data.upcoming_7d.slice(0, 5).map(t => (
              <li key={t.id} className="py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-stone-800 truncate block">{t.title}</span>
                  <div className="text-[10px] text-stone-500">
                    {KIND_LABELS[t.kind] || t.kind} · {t.assigned_to_name || "Unassigned"} · due {(t.due_at || "").slice(0, 10)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.overdue.length === 0 && data.upcoming_7d.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center text-sm text-emerald-800">
          No outstanding tasks. Calm waters.
        </div>
      )}
    </section>
  );
}
