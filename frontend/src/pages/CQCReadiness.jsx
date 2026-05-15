import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  ShieldCheck,
  Loader2,
  Pill,
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  Clock,
  Users,
} from "lucide-react";

const KQ_TONE = {
  outstanding: { color: "#2F6A3A", label: "Outstanding" },
  good: { color: "#0e3b4a", label: "Good" },
  requires_improvement: { color: "#B8772F", label: "Requires improvement" },
  inadequate: { color: "#A8273A", label: "Inadequate" },
};

export default function CQCReadiness() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/cqc/readiness").then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5 max-w-5xl mx-auto" data-testid="cqc-readiness-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3F4F8C]">
          Adult Services · Compliance
        </div>
        <h1
          className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5"
          style={{ letterSpacing: "-0.02em" }}
        >
          CQC Readiness
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          &ldquo;If CQC walked in right now — what would they challenge us on?&rdquo; A live read across the five Key Questions: Safe · Effective · Caring · Responsive · Well-led.
        </p>
      </header>

      {loading || !data ? (
        <div className="text-center py-12 text-[#5d6068]">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3" data-testid="cqc-stats">
            <StatCard
              icon={Users}
              tone="#3F4F8C"
              label="Service users"
              value={data.service_users}
              sub="Across adult services"
            />
            <StatCard
              icon={Pill}
              tone={data.overdue_med_reviews > 0 ? "#A8273A" : "#2F6A3A"}
              label="Overdue medication reviews"
              value={data.overdue_med_reviews}
              sub="Past their next-review date"
            />
            <StatCard
              icon={AlertOctagon}
              tone={data.open_adult_safeguarding > 0 ? "#A8273A" : "#2F6A3A"}
              label="Open adult safeguarding"
              value={data.open_adult_safeguarding}
              sub="Mental-health crisis · welfare concern · self-neglect"
            />
          </div>

          <section
            className="bg-white border divider-soft rounded-2xl p-5"
            data-testid="cqc-five-key-questions"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-9 h-9 rounded-lg bg-[#3F4F8C]/10 text-[#3F4F8C] flex items-center justify-center">
                <ShieldCheck size={16} />
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#3F4F8C]">
                  Five Key Questions
                </div>
                <div className="font-display font-semibold text-lg text-[#0F1115]">
                  Current self-rating
                </div>
              </div>
            </div>
            <div className="grid sm:grid-cols-5 gap-2">
              {(data.five_key_questions || []).map((q) => {
                const tone = KQ_TONE[q.status] || KQ_TONE.good;
                return (
                  <div
                    key={q.id}
                    data-testid={`cqc-kq-${q.id}`}
                    className="bg-stone-50 border-l-4 border-y border-r divider-soft rounded-xl p-3"
                    style={{ borderLeftColor: tone.color }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                      {q.label}
                    </div>
                    <div
                      className="font-semibold text-sm mt-1"
                      style={{ color: tone.color }}
                    >
                      {tone.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className="bg-white border divider-soft rounded-2xl p-5"
            data-testid="cqc-audits"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-9 h-9 rounded-lg bg-[#0e3b4a]/10 text-[#0e3b4a] flex items-center justify-center">
                <CalendarClock size={16} />
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#0e3b4a]">
                  Audit schedule
                </div>
                <div className="font-display font-semibold text-lg text-[#0F1115]">
                  Upcoming audits
                </div>
              </div>
            </div>
            <ul className="space-y-2">
              {(data.audits_due || []).map((a) => (
                <li
                  key={a.name}
                  className="bg-stone-50 border-l-4 border-y border-r divider-soft rounded-xl p-3 flex items-start gap-3"
                  style={{ borderLeftColor: a.status === "due" ? "#A8273A" : "#0e3b4a" }}
                  data-testid={`cqc-audit-${a.name.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <span
                    className="w-7 h-7 rounded-md flex items-center justify-center"
                    style={{
                      background: a.status === "due" ? "#A8273A14" : "#0e3b4a14",
                      color: a.status === "due" ? "#A8273A" : "#0e3b4a",
                    }}
                  >
                    {a.status === "due" ? <Clock size={13} /> : <CheckCircle2 size={13} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[#0F1115]">{a.name}</div>
                    <div className="text-[11px] text-[#5d6068]">
                      Due {a.due} · {a.status === "due" ? "DUE NOW" : "Scheduled"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="text-center text-xs text-[#8a8d95]">
            Phase Modular-1 placeholder · expanded CQC analytics, evidence library, and audit workflows arrive in upcoming iterations.
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, tone, label, value, sub }) {
  return (
    <div
      className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4"
      style={{ borderLeftColor: tone }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          {label}
        </div>
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: tone + "14", color: tone }}
        >
          <Icon size={14} />
        </span>
      </div>
      <div
        className="font-display text-3xl font-black tabular-nums mt-1.5"
        style={{ color: tone }}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-[#5d6068] mt-1">{sub}</div>}
    </div>
  );
}
