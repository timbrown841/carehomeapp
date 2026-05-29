/* Phase H — Staff inbox of assigned policies. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ClipboardList, Loader2, ChevronRight } from "lucide-react";
import { StatusPill } from "@/pages/InductionPolicyHub";

export default function MyPolicies() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/policy-assignments/mine");
        setItems(r.data.assignments || []);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 inline-flex items-center gap-2 text-stone-600 text-sm">
        <Loader2 size={14} className="animate-spin" /> Loading your policies…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4" data-testid="my-policies-page">
      <header className="rounded-2xl p-5"
              style={{ background: "linear-gradient(135deg, #0E3B4A 0%, #0a2734 60%, #1E4D5C 100%)", color: "white" }}>
        <div className="flex items-center gap-2 text-[#FCB960]">
          <ClipboardList size={14} />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
            My policies & induction
          </span>
        </div>
        <h1 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5"
            style={{ letterSpacing: "-0.02em" }}>
          {items.length === 0
            ? "Nothing currently assigned."
            : `${items.filter((i) => i.status !== "complete").length} policy task${items.filter((i) => i.status !== "complete").length === 1 ? "" : "s"} to complete`}
        </h1>
      </header>

      <section className="bg-white border divider-soft rounded-2xl p-3">
        {items.length === 0 ? (
          <div className="text-[13px] text-stone-500 p-4">
            You don't have any policy assignments right now. Your manager will assign induction policies on enrollment.
          </div>
        ) : (
          <ul className="divide-y divider-soft">
            {items.map((a) => (
              <li
                key={a.id}
                data-testid={`my-policy-${a.id}`}
              >
                <Link
                  to={`/policy-assignments/${a.id}`}
                  className="py-3 px-2 flex items-start gap-3 hover:bg-stone-50 rounded-lg"
                >
                  <StatusPill status={a.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-stone-900">{a.policy_title}</div>
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      {a.policy_category} · due {(a.due_date || "").slice(0, 10)}
                      {a.assessment_score !== null && a.assessment_score !== undefined && <> · score {a.assessment_score}%</>}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-stone-300 mt-1 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
