import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Sparkles,
  Plus,
  CalendarDays,
  ShieldAlert,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Loader2,
  AlertTriangle,
  HeartHandshake,
} from "lucide-react";

const STATUS_TONE = {
  planned: { fg: "#0e3b4a", bg: "#0e3b4a14", label: "Planned" },
  completed: { fg: "#3A5A40", bg: "#3A5A4014", label: "Completed" },
  cancelled: { fg: "#8A8A85", bg: "#8A8A8514", label: "Cancelled" },
};

const SEVERITY_TONE = {
  high: { fg: "#A8273A", bg: "#A8273A12", icon: AlertTriangle },
  medium: { fg: "#B8772F", bg: "#B8772F14", icon: ShieldAlert },
  low: { fg: "#0e3b4a", bg: "#0e3b4a12", icon: Clock3 },
};

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function KeyWorkHub() {
  const { user, isSeniorOrAbove } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("mine");
  const [sessions, setSessions] = useState([]);
  const [residents, setResidents] = useState([]);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);

  const residentNameById = useMemo(() => {
    const m = {};
    residents.forEach((r) => (m[r.id] = r.name));
    return m;
  }, [residents]);

  useEffect(() => {
    api.get("/residents").then((r) => setResidents(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = tab === "mine" ? "?mine=true" : "";
    Promise.all([
      api.get(`/key-work/sessions${params}`),
      isSeniorOrAbove ? api.get("/key-work/recommendations") : Promise.resolve({ data: [] }),
    ])
      .then(([s, r]) => {
        setSessions(s.data || []);
        setRecs(r.data || []);
      })
      .finally(() => setLoading(false));
  }, [tab, isSeniorOrAbove]);

  const visible = tab === "recs" ? [] : sessions;

  return (
    <div className="space-y-5 max-w-6xl mx-auto" data-testid="key-work-hub">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a3d8c]">
            Therapeutic practice
          </div>
          <h1
            className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5"
            style={{ letterSpacing: "-0.02em" }}
          >
            Key work sessions
          </h1>
          <p className="text-[#5d6068] mt-1.5 text-[15px]">
            Plan, run and reflect on therapeutic sessions. Frameworks and resources are baked in to support — not replace — your professional judgement.
          </p>
        </div>
        {isSeniorOrAbove && (
          <button
            type="button"
            onClick={() => nav("/key-work/new")}
            data-testid="kw-new-session-btn"
            className="inline-flex items-center gap-2 bg-[#5a3d8c] hover:bg-[#3f2a64] text-white font-semibold rounded-xl px-4 py-2.5 text-sm"
          >
            <Plus size={15} /> Plan a session
          </button>
        )}
      </header>

      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b divider-soft" data-testid="kw-tabs">
        {[
          { id: "mine", label: "My sessions" },
          { id: "all", label: "All sessions" },
          ...(isSeniorOrAbove ? [{ id: "recs", label: `Smart recommendations · ${recs.length}` }] : []),
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            data-testid={`kw-tab-${t.id}`}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === t.id
                ? "border-[#5a3d8c] text-[#5a3d8c]"
                : "border-transparent text-[#5d6068] hover:text-[#0F1115]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "recs" ? (
        <SmartRecsList recs={recs} residentNameById={residentNameById} />
      ) : loading ? (
        <div className="text-center py-12 text-[#5d6068]">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : visible.length === 0 ? (
        <div
          className="bg-white border divider-soft rounded-2xl p-10 text-center"
          data-testid="kw-empty"
        >
          <span className="inline-flex w-10 h-10 rounded-xl bg-[#5a3d8c]/10 text-[#5a3d8c] items-center justify-center">
            <HeartHandshake size={18} />
          </span>
          <p className="text-sm text-[#5d6068] mt-2">
            No {tab === "mine" ? "sessions assigned to you" : "key-work sessions"} yet.
          </p>
          {isSeniorOrAbove && (
            <button
              type="button"
              onClick={() => nav("/key-work/new")}
              className="inline-flex items-center gap-1.5 mt-3 bg-[#5a3d8c] hover:bg-[#3f2a64] text-white text-xs font-semibold rounded-lg px-3 py-1.5"
            >
              <Plus size={11} /> Plan one now
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2" data-testid="kw-sessions-list">
          {visible.map((s) => {
            const tone = STATUS_TONE[s.status] || STATUS_TONE.planned;
            const goalsTotal = (s.goals || []).length;
            const goalsMet = (s.goals || []).filter((g) => g.status === "met").length;
            return (
              <li key={s.id} data-testid={`kw-session-${s.id}`}>
                <Link
                  to={`/key-work/${s.id}`}
                  className="block bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4 hover:bg-stone-50 transition-colors"
                  style={{ borderLeftColor: tone.fg }}
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          {tone.label}
                        </span>
                        {s.safeguarding_flag && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#A8273A]/10 text-[#A8273A] inline-flex items-center gap-1">
                            <ShieldAlert size={9} /> Safeguarding
                          </span>
                        )}
                        {s.signed_off_at && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#3A5A40]/15 text-[#3A5A40] inline-flex items-center gap-1">
                            <CheckCircle2 size={9} /> Signed off
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-[#0F1115] mt-1.5">
                        {s.topic_label || "Key work session"}
                      </div>
                      <div className="text-[11px] text-[#5d6068] mt-0.5 inline-flex items-center gap-2 flex-wrap">
                        <span>{residentNameById[s.resident_id] || "Resident"}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={10} />
                          {s.status === "completed"
                            ? `Completed ${formatDate(s.completed_at)}`
                            : `Planned ${formatDate(s.planned_for)}`}
                        </span>
                        {s.facilitator_name && (
                          <>
                            <span>·</span>
                            <span>{s.facilitator_name}</span>
                          </>
                        )}
                        {goalsTotal > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              Goals: <b>{goalsMet}/{goalsTotal} met</b>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-stone-400 mt-1.5" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SmartRecsList({ recs, residentNameById }) {
  const nav = useNavigate();
  if (recs.length === 0) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-10 text-center" data-testid="kw-recs-empty">
        <span className="inline-flex w-10 h-10 rounded-xl bg-[#5a3d8c]/10 text-[#5a3d8c] items-center justify-center">
          <Sparkles size={18} />
        </span>
        <p className="text-sm text-[#5d6068] mt-2">
          No active practice recommendations — risk profiles look stable.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="kw-recs-list">
      {recs.map((r, i) => {
        const tone = SEVERITY_TONE[r.severity] || SEVERITY_TONE.low;
        const Icon = tone.icon;
        return (
          <li
            key={`${r.id}-${r.resident_id}-${i}`}
            data-testid={`kw-rec-${r.id}-${r.resident_id}`}
            className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4"
            style={{ borderLeftColor: tone.fg }}
          >
            <div className="flex items-start gap-3 flex-wrap">
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <Icon size={15} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white"
                    style={{ background: tone.fg }}
                  >
                    {r.severity}
                  </span>
                  <Link
                    to={`/residents/${r.resident_id}`}
                    className="text-[11px] font-semibold text-[#0e3b4a] hover:underline"
                  >
                    {residentNameById[r.resident_id] || r.resident_name}
                  </Link>
                </div>
                <div className="font-semibold text-[#0F1115] mt-1">{r.title}</div>
                <div className="text-xs text-[#5d6068] mt-0.5">{r.body}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(r.suggested_framework_ids || []).map((id) => (
                    <Link
                      key={`fw-${id}`}
                      to={`/frameworks/${id}`}
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#0e3b4a]/10 text-[#0e3b4a]"
                    >
                      {id.replace(/_/g, " ")}
                    </Link>
                  ))}
                  {(r.suggested_resource_pack_ids || []).map((id) => (
                    <Link
                      key={`rp-${id}`}
                      to={`/resources/${id}`}
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#5a3d8c]/10 text-[#5a3d8c]"
                    >
                      {id.replace("rp_", "").replace(/_/g, " ")}
                    </Link>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  nav(
                    `/key-work/new?resident_id=${r.resident_id}&topic_id=${(r.suggested_topic_ids || [])[0] || ""}`
                  )
                }
                data-testid={`kw-rec-plan-btn-${r.resident_id}`}
                className="bg-[#5a3d8c] hover:bg-[#3f2a64] text-white text-xs font-semibold rounded-lg px-3 py-1.5 inline-flex items-center gap-1 shrink-0"
              >
                <Plus size={10} /> Plan session
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
