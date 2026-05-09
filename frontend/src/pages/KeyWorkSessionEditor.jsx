import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  ArrowLeft,
  Save,
  Loader2,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  X,
  Plus,
  HeartHandshake,
  BookOpen,
  Library,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5a3d8c]";

const sectionCls = "bg-white border divider-soft rounded-2xl p-5 sm:p-6 space-y-3";

const goalStatuses = [
  { value: "open", label: "Open" },
  { value: "progress", label: "In progress" },
  { value: "met", label: "Met" },
  { value: "unmet", label: "Unmet" },
];

export default function KeyWorkSessionEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isEdit = Boolean(id);

  const [residents, setResidents] = useState([]);
  const [topics, setTopics] = useState([]);
  const [frameworks, setFrameworks] = useState([]);
  const [packs, setPacks] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [recs, setRecs] = useState([]);

  const [f, setF] = useState({
    resident_id: searchParams.get("resident_id") || "",
    status: "planned",
    planned_for: "",
    completed_at: "",
    topic_id: searchParams.get("topic_id") || "",
    topic_label: "",
    frameworks_applied: [],
    resource_pack_ids: [],
    goals: [],
    plan: "",
    discussion: "",
    young_person_voice: "",
    staff_reflection: "",
    outcomes: "",
    follow_up_actions: [],
    review_date: "",
    mood_before: null,
    mood_after: null,
    prompt_responses: {},
    safeguarding_flag: false,
    facilitator_id: user?.id || "",
    facilitator_name: user?.name || "",
  });

  // Load reference content
  useEffect(() => {
    Promise.all([
      api.get("/residents"),
      api.get("/key-work/topics"),
      api.get("/frameworks"),
      api.get("/resource-packs"),
      api.get("/guided-prompts"),
    ]).then(([r, t, fw, rp, pr]) => {
      setResidents(r.data || []);
      setTopics(t.data || []);
      setFrameworks(fw.data || []);
      setPacks(rp.data || []);
      setPrompts(pr.data || []);
    });
  }, []);

  // Load existing session in edit mode
  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/key-work/sessions/${id}`)
      .then((r) => {
        const s = r.data;
        setF({
          resident_id: s.resident_id || "",
          status: s.status || "planned",
          planned_for: (s.planned_for || "").slice(0, 16),
          completed_at: (s.completed_at || "").slice(0, 16),
          topic_id: s.topic_id || "",
          topic_label: s.topic_label || "",
          frameworks_applied: s.frameworks_applied || [],
          resource_pack_ids: s.resource_pack_ids || [],
          goals: s.goals || [],
          plan: s.plan || "",
          discussion: s.discussion || "",
          young_person_voice: s.young_person_voice || "",
          staff_reflection: s.staff_reflection || "",
          outcomes: s.outcomes || "",
          follow_up_actions: s.follow_up_actions || [],
          review_date: s.review_date || "",
          mood_before: s.mood_before ?? null,
          mood_after: s.mood_after ?? null,
          prompt_responses: s.prompt_responses || {},
          safeguarding_flag: s.safeguarding_flag || false,
          facilitator_id: s.facilitator_id || "",
          facilitator_name: s.facilitator_name || "",
        });
      })
      .catch(() => {
        toast.error("Could not load session");
        nav("/key-work");
      })
      .finally(() => setLoading(false));
  }, [isEdit, id, nav]);

  // Pre-fill defaults from selected topic
  useEffect(() => {
    if (!f.topic_id) return;
    const t = topics.find((x) => x.id === f.topic_id);
    if (!t) return;
    // Only pre-fill if user hasn't already chosen them
    setF((cur) => ({
      ...cur,
      topic_label: cur.topic_label || t.label,
      frameworks_applied: cur.frameworks_applied.length ? cur.frameworks_applied : t.default_frameworks || [],
      resource_pack_ids: cur.resource_pack_ids.length ? cur.resource_pack_ids : t.default_resource_pack_ids || [],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.topic_id, topics.length]);

  // Pull resident-level recs
  useEffect(() => {
    if (!f.resident_id) {
      setRecs([]);
      return;
    }
    api
      .get(`/residents/${f.resident_id}/key-work/recommendations`)
      .then((r) => setRecs(r.data || []))
      .catch(() => setRecs([]));
  }, [f.resident_id]);

  const relevantPrompts = useMemo(() => {
    const ctx = f.status === "completed" ? "key_work_recording" : "key_work_planning";
    const topic = topics.find((t) => t.id === f.topic_id);
    const defaultIds = new Set(topic?.default_prompt_ids || []);
    const relevant = prompts.filter((p) => p.context.includes(ctx));
    return [...relevant].sort((a, b) => {
      const ad = defaultIds.has(a.id) ? 0 : 1;
      const bd = defaultIds.has(b.id) ? 0 : 1;
      return ad - bd;
    });
  }, [prompts, topics, f.topic_id, f.status]);

  const toggle = (key, id) => {
    setF((cur) => {
      const next = cur[key].includes(id) ? cur[key].filter((x) => x !== id) : [...cur[key], id];
      return { ...cur, [key]: next };
    });
  };

  const addGoal = () =>
    setF((cur) => ({ ...cur, goals: [...cur.goals, { text: "", status: "open" }] }));
  const removeGoal = (i) =>
    setF((cur) => ({ ...cur, goals: cur.goals.filter((_, idx) => idx !== i) }));

  const addAction = () =>
    setF((cur) => ({
      ...cur,
      follow_up_actions: [...cur.follow_up_actions, { text: "", owner_name: "", due_date: "", status: "open" }],
    }));
  const removeAction = (i) =>
    setF((cur) => ({ ...cur, follow_up_actions: cur.follow_up_actions.filter((_, idx) => idx !== i) }));

  const submit = async () => {
    if (!f.resident_id) return toast.error("Choose a young person");
    setSaving(true);
    try {
      const payload = {
        ...f,
        planned_for: f.planned_for ? new Date(f.planned_for).toISOString() : null,
        completed_at: f.completed_at ? new Date(f.completed_at).toISOString() : null,
        // Strip empty goals/actions so they don't trip validators
        goals: f.goals.filter((g) => (g.text || "").trim()),
        follow_up_actions: f.follow_up_actions.filter((a) => (a.text || "").trim()),
      };
      let saved;
      if (isEdit) {
        saved = await api.patch(`/key-work/sessions/${id}`, payload);
      } else {
        saved = await api.post("/key-work/sessions", payload);
      }
      toast.success("Session saved");
      nav(`/key-work/${saved.data.id}`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16 text-stone-500">
        <Loader2 className="animate-spin inline" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto" data-testid="kw-editor">
      <button
        type="button"
        onClick={() => nav(-1)}
        className="text-sm text-[#5d6068] hover:text-[#0F1115] inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a3d8c]">
          {isEdit ? "Edit session" : "Plan a key work session"}
        </div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">
          {f.topic_label || "Untitled session"}
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[14px]">
          Therapeutic frameworks and prompts on the right are <b>guides</b> — your judgement leads.
        </p>
      </header>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        {/* MAIN COLUMN */}
        <div className="space-y-5">
          {/* Setup */}
          <section className={sectionCls} data-testid="kw-setup">
            <h3 className="font-display font-semibold text-base text-[#0F1115]">Setup</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Young person
                </label>
                <select
                  value={f.resident_id}
                  onChange={(e) => setF({ ...f, resident_id: e.target.value })}
                  data-testid="kw-resident"
                  className={inputCls}
                  disabled={isEdit}
                >
                  <option value="">— Select —</option>
                  {residents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Topic
                </label>
                <select
                  value={f.topic_id}
                  onChange={(e) => setF({ ...f, topic_id: e.target.value })}
                  data-testid="kw-topic"
                  className={inputCls}
                >
                  <option value="">— Select —</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Session title
                </label>
                <input
                  value={f.topic_label}
                  onChange={(e) => setF({ ...f, topic_label: e.target.value })}
                  placeholder="e.g. Calm-box co-creation"
                  data-testid="kw-title"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Status
                </label>
                <select
                  value={f.status}
                  onChange={(e) => setF({ ...f, status: e.target.value })}
                  data-testid="kw-status"
                  className={inputCls}
                >
                  <option value="planned">Planned</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Planned for
                </label>
                <input
                  type="datetime-local"
                  value={f.planned_for}
                  onChange={(e) => setF({ ...f, planned_for: e.target.value })}
                  data-testid="kw-planned-for"
                  className={inputCls}
                />
              </div>
              {f.status === "completed" && (
                <>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                      Completed at
                    </label>
                    <input
                      type="datetime-local"
                      value={f.completed_at}
                      onChange={(e) => setF({ ...f, completed_at: e.target.value })}
                      data-testid="kw-completed-at"
                      className={inputCls}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        Mood before (1-5)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={f.mood_before ?? ""}
                        onChange={(e) =>
                          setF({ ...f, mood_before: e.target.value ? Number(e.target.value) : null })
                        }
                        data-testid="kw-mood-before"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        Mood after (1-5)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={f.mood_after ?? ""}
                        onChange={(e) =>
                          setF({ ...f, mood_after: e.target.value ? Number(e.target.value) : null })
                        }
                        data-testid="kw-mood-after"
                        className={inputCls}
                      />
                    </div>
                  </div>
                </>
              )}
              <div className="sm:col-span-2 flex items-center gap-2">
                <label
                  className={`flex items-center gap-2 text-sm cursor-pointer p-2.5 rounded-lg border ${
                    f.safeguarding_flag
                      ? "bg-[#A8273A]/10 border-[#A8273A]/40 text-[#A8273A] font-semibold"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={f.safeguarding_flag}
                    onChange={(e) => setF({ ...f, safeguarding_flag: e.target.checked })}
                    data-testid="kw-safeguarding-flag"
                  />
                  <ShieldAlert size={13} />
                  Flag for safeguarding (manager sign-off required on completion)
                </label>
              </div>
            </div>
          </section>

          {/* Frameworks + Resources */}
          <section className={sectionCls} data-testid="kw-frameworks">
            <h3 className="font-display font-semibold text-base text-[#0F1115] inline-flex items-center gap-1.5">
              <BookOpen size={15} className="text-[#0e3b4a]" /> Frameworks applied
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {frameworks.map((fw) => (
                <button
                  key={fw.id}
                  type="button"
                  onClick={() => toggle("frameworks_applied", fw.id)}
                  data-testid={`kw-fw-${fw.id}`}
                  className={`text-xs rounded-lg px-2.5 py-1 border transition-colors ${
                    f.frameworks_applied.includes(fw.id)
                      ? "bg-[#0e3b4a] text-white border-[#0e3b4a]"
                      : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                  }`}
                >
                  {f.frameworks_applied.includes(fw.id) ? "✓ " : ""}{fw.short_name}
                </button>
              ))}
            </div>

            <h3 className="font-display font-semibold text-base text-[#0F1115] inline-flex items-center gap-1.5 mt-3">
              <Library size={15} className="text-[#5a3d8c]" /> Resource packs to draw on
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {packs.map((rp) => (
                <button
                  key={rp.id}
                  type="button"
                  onClick={() => toggle("resource_pack_ids", rp.id)}
                  data-testid={`kw-rp-${rp.id}`}
                  className={`text-xs rounded-lg px-2.5 py-1 border transition-colors ${
                    f.resource_pack_ids.includes(rp.id)
                      ? "bg-[#5a3d8c] text-white border-[#5a3d8c]"
                      : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                  }`}
                >
                  {f.resource_pack_ids.includes(rp.id) ? "✓ " : ""}{rp.title}
                </button>
              ))}
            </div>
          </section>

          {/* Plan + goals */}
          <section className={sectionCls} data-testid="kw-plan">
            <h3 className="font-display font-semibold text-base text-[#0F1115]">Plan</h3>
            <textarea
              rows={3}
              value={f.plan}
              onChange={(e) => setF({ ...f, plan: e.target.value })}
              placeholder="Outline the structure of this session — opening, activity, reflection, close."
              data-testid="kw-plan-text"
              className={`${inputCls} resize-none`}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                Goals
              </span>
              <button
                type="button"
                onClick={addGoal}
                data-testid="kw-add-goal"
                className="text-xs text-[#5a3d8c] hover:underline inline-flex items-center gap-1"
              >
                <Plus size={11} /> Add goal
              </button>
            </div>
            <div className="space-y-2" data-testid="kw-goals-list">
              {f.goals.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    placeholder="Goal description"
                    value={g.text}
                    onChange={(e) => {
                      const goals = [...f.goals];
                      goals[i] = { ...g, text: e.target.value };
                      setF({ ...f, goals });
                    }}
                    data-testid={`kw-goal-${i}`}
                    className={`${inputCls} flex-1`}
                  />
                  <select
                    value={g.status}
                    onChange={(e) => {
                      const goals = [...f.goals];
                      goals[i] = { ...g, status: e.target.value };
                      setF({ ...f, goals });
                    }}
                    className={inputCls + " w-[130px]"}
                  >
                    {goalStatuses.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeGoal(i)} className="text-stone-400 hover:text-[#A8273A]">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Recording (only when completed) */}
          {f.status === "completed" && (
            <section className={sectionCls} data-testid="kw-record">
              <h3 className="font-display font-semibold text-base text-[#0F1115]">Recording</h3>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  What was discussed
                </label>
                <textarea
                  rows={3}
                  value={f.discussion}
                  onChange={(e) => setF({ ...f, discussion: e.target.value })}
                  data-testid="kw-discussion"
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Young person's voice (their words)
                </label>
                <textarea
                  rows={2}
                  value={f.young_person_voice}
                  onChange={(e) => setF({ ...f, young_person_voice: e.target.value })}
                  data-testid="kw-yp-voice"
                  className={`${inputCls} resize-none italic`}
                  placeholder="Direct quotes — what did they actually say?"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Staff reflection
                </label>
                <textarea
                  rows={3}
                  value={f.staff_reflection}
                  onChange={(e) => setF({ ...f, staff_reflection: e.target.value })}
                  data-testid="kw-staff-reflection"
                  className={`${inputCls} resize-none`}
                  placeholder="What worked? What surprised you? What's next?"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Outcomes
                </label>
                <textarea
                  rows={2}
                  value={f.outcomes}
                  onChange={(e) => setF({ ...f, outcomes: e.target.value })}
                  data-testid="kw-outcomes"
                  className={`${inputCls} resize-none`}
                />
              </div>
            </section>
          )}

          {/* Follow-up + review */}
          <section className={sectionCls} data-testid="kw-followup">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-base text-[#0F1115]">
                Follow-up actions
              </h3>
              <button
                type="button"
                onClick={addAction}
                data-testid="kw-add-action"
                className="text-xs text-[#5a3d8c] hover:underline inline-flex items-center gap-1"
              >
                <Plus size={11} /> Add action
              </button>
            </div>
            <div className="space-y-2" data-testid="kw-actions-list">
              {f.follow_up_actions.map((a, i) => (
                <div key={i} className="grid sm:grid-cols-[1fr_140px_120px_24px] gap-2 items-center">
                  <input
                    placeholder="What needs to happen?"
                    value={a.text}
                    onChange={(e) => {
                      const actions = [...f.follow_up_actions];
                      actions[i] = { ...a, text: e.target.value };
                      setF({ ...f, follow_up_actions: actions });
                    }}
                    data-testid={`kw-action-${i}`}
                    className={inputCls}
                  />
                  <input
                    placeholder="Owner"
                    value={a.owner_name || ""}
                    onChange={(e) => {
                      const actions = [...f.follow_up_actions];
                      actions[i] = { ...a, owner_name: e.target.value };
                      setF({ ...f, follow_up_actions: actions });
                    }}
                    className={inputCls}
                  />
                  <input
                    type="date"
                    value={a.due_date || ""}
                    onChange={(e) => {
                      const actions = [...f.follow_up_actions];
                      actions[i] = { ...a, due_date: e.target.value };
                      setF({ ...f, follow_up_actions: actions });
                    }}
                    className={inputCls}
                  />
                  <button type="button" onClick={() => removeAction(i)} className="text-stone-400 hover:text-[#A8273A]">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                Review date
              </label>
              <input
                type="date"
                value={f.review_date || ""}
                onChange={(e) => setF({ ...f, review_date: e.target.value })}
                data-testid="kw-review-date"
                className={inputCls + " max-w-xs"}
              />
            </div>
          </section>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              data-testid="kw-save-btn"
              className="bg-[#5a3d8c] hover:bg-[#3f2a64] disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2.5 inline-flex items-center gap-2"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {isEdit ? "Update session" : "Save session"}
            </button>
          </div>
        </div>

        {/* SIDEBAR — guided prompts + recs */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start" data-testid="kw-sidebar">
          {recs.length > 0 && (
            <section className="bg-[#FAF7F2] border-l-4 border border-[#5a3d8c]/40 rounded-2xl p-4" style={{ borderLeftColor: "#5a3d8c" }}>
              <h4 className="font-display font-semibold text-sm text-[#5a3d8c] inline-flex items-center gap-1.5">
                <Sparkles size={13} /> Practice recommendations
              </h4>
              <ul className="space-y-1.5 mt-2">
                {recs.slice(0, 4).map((r, i) => (
                  <li key={i} className="text-xs text-[#0F1115]" data-testid={`kw-side-rec-${r.id}`}>
                    <b>{r.title}</b>
                    <p className="text-[#5d6068]">{r.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="bg-white border divider-soft rounded-2xl p-4" data-testid="kw-prompts">
            <h4 className="font-display font-semibold text-sm text-[#0F1115] inline-flex items-center gap-1.5">
              <HeartHandshake size={13} className="text-[#5a3d8c]" /> Guided prompts
            </h4>
            <p className="text-[11px] text-[#5d6068] mt-0.5">
              Reflective prompts for {f.status === "completed" ? "recording" : "planning"}. Tap to capture a response.
            </p>
            <ul className="mt-2 space-y-2">
              {relevantPrompts.map((p) => {
                const responded = (f.prompt_responses[p.id] || "").trim().length > 0;
                return (
                  <li key={p.id} data-testid={`kw-prompt-${p.id}`}>
                    <details className="group">
                      <summary className="cursor-pointer list-none flex items-start gap-1.5 text-xs">
                        <ChevronDown
                          size={11}
                          className="mt-0.5 text-stone-400 group-open:rotate-180 transition-transform"
                        />
                        <span className={responded ? "font-semibold text-[#3A5A40]" : "text-[#0F1115]"}>
                          {responded && <CheckCircle2 size={10} className="inline text-[#3A5A40] mr-1" />}
                          {p.text}
                        </span>
                      </summary>
                      <textarea
                        rows={2}
                        value={f.prompt_responses[p.id] || ""}
                        onChange={(e) =>
                          setF({
                            ...f,
                            prompt_responses: { ...f.prompt_responses, [p.id]: e.target.value },
                          })
                        }
                        data-testid={`kw-prompt-${p.id}-input`}
                        className={`${inputCls} mt-1.5 text-xs resize-none`}
                        placeholder="Capture reflection…"
                      />
                    </details>
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-[#8a8d95] mt-3 italic">
              These prompts support — they don't replace — your professional judgement.{" "}
              <Link to="/frameworks" className="text-[#0e3b4a] underline">Browse frameworks</Link>.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
