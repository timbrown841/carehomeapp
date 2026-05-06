import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const LEVELS = [
  { id: "not_started", label: "Not started", tone: "#5d6068", pct: 0 },
  { id: "needs_support", label: "Needs support", tone: "#A8273A", pct: 25 },
  { id: "developing", label: "Developing", tone: "#B8772F", pct: 50 },
  { id: "competent", label: "Competent", tone: "#0e3b4a", pct: 75 },
  { id: "mastered", label: "Mastered", tone: "#2F6A3A", pct: 100 },
];
const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

export default function IndependenceTracker({ resident }) {
  const { isSeniorOrAbove } = useAuth();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/residents/${resident.id}/independence`);
      setSkills(r.data?.skills || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (resident?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident?.id]);

  const update = async (skill, payload) => {
    try {
      await api.post(`/residents/${resident.id}/independence`, {
        skill: skill.id,
        level: payload.level ?? skill.level,
        notes: payload.notes ?? skill.notes,
      });
      toast.success("Saved");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const overall = skills.length
    ? Math.round(
        skills.reduce((acc, s) => acc + (LEVEL_BY_ID[s.level]?.pct || 0), 0) / skills.length
      )
    : 0;

  return (
    <div className="space-y-4" data-testid="independence-tracker">
      <div className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4" style={{ borderLeftColor: "#2F6A3A" }}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          Overall independence readiness
        </div>
        <div className="flex items-baseline gap-3 mt-1.5">
          <div className="font-display text-3xl font-black tabular-nums" style={{ color: "#2F6A3A" }}>
            {overall}%
          </div>
          <div className="text-xs text-[#5d6068]">across {skills.length} skill areas</div>
        </div>
        <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div className="h-full" style={{ width: `${overall}%`, background: "#2F6A3A" }} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-[#5d6068]">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : (
        <ul className="space-y-2" data-testid="independence-list">
          {skills.map((s) => {
            const meta = LEVEL_BY_ID[s.level] || LEVELS[0];
            const open = openId === s.id;
            return (
              <li
                key={s.id}
                data-testid={`independence-${s.id}`}
                className="bg-white border-l-4 border-y border-r divider-soft rounded-xl"
                style={{ borderLeftColor: meta.tone }}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : s.id)}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-stone-50/60"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white"
                        style={{ background: meta.tone }}
                      >
                        {meta.label}
                      </span>
                      {s.updated_at && (
                        <span className="text-[10px] text-[#8a8d95]">
                          updated {(s.updated_at || "").slice(0, 10)}
                          {s.updated_by_name ? ` · ${s.updated_by_name}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-sm text-[#0F1115]">{s.label}</div>
                    {s.notes && !open && <div className="text-xs text-[#5d6068] mt-0.5 line-clamp-1">{s.notes}</div>}
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-[#8a8d95] transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {LEVELS.map((lv) => (
                        <button
                          key={lv.id}
                          type="button"
                          disabled={!isSeniorOrAbove}
                          onClick={() => update(s, { level: lv.id })}
                          data-testid={`independence-${s.id}-${lv.id}`}
                          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded transition-colors ${
                            s.level === lv.id ? "text-white" : "bg-white border divider-soft text-[#5d6068] hover:text-[#0F1115]"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                          style={s.level === lv.id ? { background: lv.tone } : {}}
                        >
                          {lv.label}
                        </button>
                      ))}
                    </div>
                    <NotesEditor
                      value={s.notes || ""}
                      disabled={!isSeniorOrAbove}
                      onSave={(notes) => update(s, { notes })}
                      testid={`independence-${s.id}-notes`}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NotesEditor({ value, onSave, disabled, testid }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      rows={2}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onSave(v);
      }}
      disabled={disabled}
      data-testid={testid}
      placeholder="Notes / observations / next steps"
      className="w-full bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a] resize-none disabled:bg-stone-50"
    />
  );
}
