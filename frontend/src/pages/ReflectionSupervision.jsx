import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Loader2, ArrowLeft, Heart, BookOpen, Sparkles, ShieldCheck, Lock, Share2,
  AlertTriangle, Users, Lightbulb,
} from "lucide-react";

const KIND_META = {
  shift_reflection: { label: "Shift reflection", icon: BookOpen, tone: "#0e3b4a" },
  win: { label: "Positive practice", icon: Sparkles, tone: "#2F6A3A" },
  guided: { label: "Guided reflection", icon: Lightbulb, tone: "#7A4F8C" },
};

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ReflectionSupervision() {
  const { userId } = useParams();
  const { isManagerOrAbove } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [moodMeta, setMoodMeta] = useState({});
  const [promptSets, setPromptSets] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([
        api.get(`/reflection/supervision/${userId}`),
        api.get("/reflection/prompt-sets"),
      ]);
      setData(d.data);
      setMoodMeta(p.data.mood_meta || {});
      setPromptSets(p.data.prompt_sets || {});
    } catch (e) {
      setErr(e.response?.data?.detail || "Couldn't load supervision view");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (!isManagerOrAbove) {
    return <div className="p-8 text-sm text-stone-700">Manager access required.</div>;
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-600 py-12 justify-center">
        <Loader2 size={18} className="animate-spin" /> Loading supervision view…
      </div>
    );
  }
  if (err) {
    return <div className="p-8 text-sm text-[#A8273A]">{err}</div>;
  }
  if (!data) return null;

  const { staff, checkins, mood_mix_14d, stressed_count_14d, shared_reflections, flag, win_count_shared } = data;

  const total14 = Object.values(mood_mix_14d || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5" data-testid="supervision-view">
      <Link to="/staff-operations" className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft size={16} /> Staff operations
      </Link>

      <header className="bg-white border divider-soft rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={16} className="text-[#0e3b4a]" />
          <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Supervision prep — wellbeing &amp; reflection
          </span>
        </div>
        <h1 className="font-display font-semibold text-[28px] leading-tight text-[#0F1115]" style={{ letterSpacing: "-0.02em" }}>
          {staff.name}
        </h1>
        <p className="text-xs text-stone-500 mt-1">
          {staff.role} · {staff.email}
        </p>
        <div className="text-xs text-stone-600 mt-4 flex items-start gap-2">
          <Lock size={13} className="mt-0.5 shrink-0" />
          <span>
            You can only see reflections this staff member has explicitly shared. Private reflections remain private.
            Wellbeing check-ins are aggregated as trend data — no personal text is shown unless shared.
          </span>
        </div>
      </header>

      {flag && (
        <div className="border-l-4 rounded-xl p-4 bg-[#FFF7E6] border-[#B8772F]" data-testid="supervision-flag">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-[#B8772F] shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-[#0F1115]">{flag.title}</div>
              <p className="text-sm text-stone-700 mt-1">{flag.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mood mix 14d */}
      <div className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[#0F1115]">Wellbeing check-ins · last 14 days</h3>
          <span className="text-xs text-stone-500">{total14} check-ins</span>
        </div>
        {total14 === 0 ? (
          <p className="text-sm text-stone-600">No check-ins recorded recently.</p>
        ) : (
          <div className="space-y-2">
            {["confident", "positive", "okay", "stressed", "overwhelmed"].map((m) => {
              const meta = moodMeta[m] || {};
              const count = mood_mix_14d[m] || 0;
              const pct = total14 ? Math.round((count / total14) * 100) : 0;
              return (
                <div key={m} className="flex items-center gap-3">
                  <span className="w-28 text-xs font-semibold flex items-center gap-1.5">
                    <span className="text-base">{meta.emoji}</span> {meta.label}
                  </span>
                  <div className="flex-1 h-2.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: meta.tone || "#0e3b4a" }}
                    />
                  </div>
                  <span className="text-xs text-stone-600 w-16 text-right">{count} · {pct}%</span>
                </div>
              );
            })}
          </div>
        )}
        {stressed_count_14d >= 3 && (
          <p className="text-xs text-[#B8772F] mt-3 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Pattern: {stressed_count_14d} stretched-feeling check-ins in 14 days.
          </p>
        )}
      </div>

      {/* Shared reflections */}
      <div className="bg-white border divider-soft rounded-2xl p-5" data-testid="shared-reflections-block">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-[#0F1115] flex items-center gap-2">
            <Share2 size={15} /> Shared reflections ({shared_reflections.length})
          </h3>
          {win_count_shared > 0 && (
            <span className="text-xs bg-[#2F6A3A]/10 text-[#2F6A3A] px-2 py-1 rounded-full font-semibold">
              {win_count_shared} win{win_count_shared === 1 ? "" : "s"} shared
            </span>
          )}
        </div>
        {shared_reflections.length === 0 ? (
          <p className="text-sm text-stone-600">
            Nothing shared yet. That's fine — the staff member controls what's visible here.
          </p>
        ) : (
          <ul className="space-y-3">
            {shared_reflections.map((r) => {
              const meta = KIND_META[r.kind] || {};
              const Icon = meta.icon || BookOpen;
              const ps = r.prompt_set ? promptSets[r.prompt_set] : null;
              return (
                <li key={r.id} className="border-l-4 rounded-xl p-4 bg-stone-50" style={{ borderLeftColor: meta.tone }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                    <Icon size={11} style={{ color: meta.tone }} />
                    {meta.label}
                    {ps && <span className="text-stone-400">· {ps.label}</span>}
                  </div>
                  <div className="text-sm font-semibold text-[#0F1115] mt-1">{r.title || "Untitled"}</div>
                  <div className="text-[11px] text-stone-500">{fmt(r.created_at)}</div>
                  {r.responses && ps && Object.keys(r.responses).length > 0 && (
                    <div className="space-y-1.5 mt-2.5">
                      {ps.prompts.filter((p) => r.responses[p.id]).map((p) => (
                        <div key={p.id}>
                          <div className="text-xs font-semibold text-stone-600">{p.label}</div>
                          <div className="text-sm text-stone-800 whitespace-pre-wrap">{r.responses[p.id]}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {r.body && <p className="text-sm text-stone-800 whitespace-pre-wrap mt-2">{r.body}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Team awareness card (used inside Staff Operations hub or Dashboard)
export function TeamWellbeingAwarenessCard() {
  const [d, setD] = useState(null);
  const nav = useNavigate();
  useEffect(() => {
    api.get("/reflection/wellbeing/awareness").then((r) => setD(r.data)).catch(() => setD(null));
  }, []);
  if (!d) return null;
  const total = d.amber_count_total;
  return (
    <div className="bg-white border divider-soft rounded-2xl p-5" data-testid="team-awareness-card">
      <div className="flex items-center gap-2 mb-2">
        <Users size={15} className="text-[#0e3b4a]" />
        <h3 className="font-semibold text-[#0F1115] text-sm">Team wellbeing awareness</h3>
      </div>
      {total === 0 ? (
        <p className="text-sm text-stone-600">All team members are in a steady zone over the last 14 days.</p>
      ) : (
        <>
          <div className="text-3xl font-semibold text-[#B8772F]">{total}</div>
          <p className="text-xs text-stone-600 mt-1">
            team member{total === 1 ? "" : "s"} may benefit from a wellbeing chat
          </p>
          {d.amber_named && d.amber_named.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {d.amber_named.map((p) => (
                <li
                  key={p.user_id}
                  className="flex items-center justify-between text-sm cursor-pointer hover:bg-stone-50 px-2 py-1.5 rounded-lg"
                  onClick={() => nav(`/reflection/supervision/${p.user_id}`)}
                  data-testid={`amber-${p.user_id}`}
                >
                  <div>
                    <span className="font-medium">{p.user_name}</span>
                    <span className="text-xs text-stone-500 ml-2">· {p.stress_count} stretched check-ins (shared)</span>
                  </div>
                  <ArrowLeft size={14} className="text-stone-400 rotate-180" />
                </li>
              ))}
            </ul>
          )}
          {d.amber_anonymous_count > 0 && (
            <p className="text-xs text-stone-500 mt-3 flex items-start gap-1.5">
              <Lock size={11} className="mt-0.5 shrink-0" />
              {d.amber_anonymous_count} additional team member{d.amber_anonymous_count === 1 ? "" : "s"} stretched
              but haven't shared a reflection. Names withheld — please use general wellbeing supervision.
            </p>
          )}
        </>
      )}
    </div>
  );
}
