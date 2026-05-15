import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Heart,
  Sparkles,
  BookOpen,
  Lock,
  Share2,
  TrendingUp,
  ChevronRight,
  Pencil,
  Trash2,
  ShieldCheck,
  Lightbulb,
  X,
} from "lucide-react";

const KIND_META = {
  shift_reflection: { label: "Shift reflection", icon: BookOpen, tone: "#0e3b4a" },
  win: { label: "Positive practice", icon: Sparkles, tone: "#2F6A3A" },
  guided: { label: "Guided reflection", icon: Lightbulb, tone: "#7A4F8C" },
};

const SHIFT_CONTEXT_LABEL = {
  start_of_shift: "Start of shift",
  during_shift: "Mid-shift",
  after_shift: "End of shift",
  off_shift: "Off shift",
};

function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const opts = sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" };
  return d.toLocaleString("en-GB", opts);
}

// ===========================================================================
// Quick Check-in Modal — emoji temperature check
// ===========================================================================
function CheckInModal({ open, onClose, moodMeta, onCreated }) {
  const [mood, setMood] = useState("okay");
  const [context, setContext] = useState("after_shift");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/reflection/checkins", {
        mood, shift_context: context, note: note || null,
      });
      toast.success("Wellbeing check-in saved");
      setNote("");
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error("Couldn't save — try again");
    } finally {
      setBusy(false);
    }
  };

  const moods = ["overwhelmed", "stressed", "okay", "positive", "confident"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      data-testid="checkin-modal"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-[#0F1115]">How are you, right now?</h2>
            <p className="text-sm text-stone-600 mt-1">A quick check-in. Just for you.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-md" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-2 mb-5">
          {moods.map((m) => {
            const meta = moodMeta?.[m] || {};
            const active = m === mood;
            return (
              <button
                key={m}
                type="button"
                data-testid={`checkin-mood-${m}`}
                onClick={() => setMood(m)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  active
                    ? "border-[#0e3b4a] bg-[#0e3b4a]/5"
                    : "border-stone-200 hover:border-stone-300"
                }`}
              >
                <span className="text-2xl leading-none">{meta.emoji || "·"}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-700">
                  {meta.label || m}
                </span>
              </button>
            );
          })}
        </div>

        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
          When is this?
        </label>
        <div className="flex gap-2 mb-4 flex-wrap">
          {Object.entries(SHIFT_CONTEXT_LABEL).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setContext(k)}
              data-testid={`checkin-context-${k}`}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                k === context
                  ? "border-[#0e3b4a] bg-[#0e3b4a] text-white"
                  : "border-stone-300 text-stone-700 hover:border-stone-400"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
          Anything else? (optional · private to you)
        </label>
        <textarea
          data-testid="checkin-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          rows={2}
          placeholder="A line for yourself — what's on your mind?"
          className="w-full text-sm border divider-soft rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]/20 resize-none"
        />
        <div className="text-[11px] text-stone-500 mt-1">{note.length}/280</div>

        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg text-stone-700 hover:bg-stone-100"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            data-testid="checkin-submit"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-[#0e3b4a] text-white hover:bg-[#0a2e3a] disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Save check-in
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Reflection editor modal — shift / win / guided
// ===========================================================================
function ReflectionEditor({ open, onClose, promptSets, onSaved, existing }) {
  const [kind, setKind] = useState(existing?.kind || "shift_reflection");
  const [promptSetKey, setPromptSetKey] = useState(
    existing?.prompt_set || (existing?.kind === "win" ? null : "shift_reflection")
  );
  const [title, setTitle] = useState(existing?.title || "");
  const [body, setBody] = useState(existing?.body || "");
  const [responses, setResponses] = useState(existing?.responses || {});
  const [shared, setShared] = useState(!!existing?.shared_with_manager);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && existing) {
      setKind(existing.kind);
      setPromptSetKey(existing.prompt_set || null);
      setTitle(existing.title || "");
      setBody(existing.body || "");
      setResponses(existing.responses || {});
      setShared(!!existing.shared_with_manager);
    } else if (open && !existing) {
      setKind("shift_reflection");
      setPromptSetKey("shift_reflection");
      setTitle("");
      setBody("");
      setResponses({});
      setShared(false);
    }
  }, [open, existing]);

  if (!open) return null;

  const activePromptSet = promptSetKey ? promptSets?.[promptSetKey] : null;

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        kind,
        prompt_set: kind === "win" ? null : promptSetKey,
        title: title || null,
        body: body || null,
        responses: kind === "win" ? null : responses,
        shared_with_manager: shared,
      };
      if (existing?.id) {
        await api.patch(`/reflection/entries/${existing.id}`, payload);
        toast.success("Reflection updated");
      } else {
        await api.post("/reflection/entries", payload);
        toast.success("Reflection saved");
      }
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error("Couldn't save — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      data-testid="reflection-editor"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-[#0F1115]">
              {existing ? "Edit reflection" : "New reflection"}
            </h2>
            <p className="text-sm text-stone-600 mt-1 flex items-center gap-1.5">
              <Lock size={13} />
              Private to you unless you choose to share with your manager.
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-md">
            <X size={18} />
          </button>
        </div>

        {/* Kind */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {Object.entries(KIND_META).map(([k, meta]) => {
            const Icon = meta.icon;
            const active = k === kind;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  if (k === "win") setPromptSetKey(null);
                  else if (k === "shift_reflection") setPromptSetKey("shift_reflection");
                  else if (k === "guided" && !promptSetKey) setPromptSetKey("gibbs");
                }}
                data-testid={`reflection-kind-${k}`}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                  active
                    ? "border-[#0e3b4a] bg-[#0e3b4a]/5"
                    : "border-stone-200 hover:border-stone-300"
                }`}
              >
                <Icon size={18} style={{ color: meta.tone }} />
                <span className="text-xs font-semibold text-stone-800">{meta.label}</span>
              </button>
            );
          })}
        </div>

        {kind === "guided" && (
          <div className="mb-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
              Reflection style
            </label>
            <select
              value={promptSetKey || ""}
              onChange={(e) => setPromptSetKey(e.target.value)}
              data-testid="reflection-prompt-set"
              className="w-full text-sm border divider-soft rounded-lg p-2.5 bg-white"
            >
              {Object.entries(promptSets || {})
                .filter(([k]) => k !== "shift_reflection")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
            </select>
            {activePromptSet?.subtitle && (
              <p className="text-xs text-stone-600 mt-1.5">{activePromptSet.subtitle}</p>
            )}
          </div>
        )}

        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
          Title (optional)
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="reflection-title"
          maxLength={200}
          placeholder={
            kind === "win"
              ? "e.g. Maddy opened up about her day"
              : "e.g. Tough afternoon — incident in lounge"
          }
          className="w-full text-sm border divider-soft rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]/20 mb-4"
        />

        {/* Prompts (shift_reflection or guided) */}
        {kind !== "win" && activePromptSet && (
          <div className="space-y-3 mb-4">
            {activePromptSet.prompts.map((p) => (
              <div key={p.id}>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {p.label}
                </label>
                <textarea
                  value={responses[p.id] || ""}
                  onChange={(e) =>
                    setResponses((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  data-testid={`reflection-prompt-${p.id}`}
                  rows={2}
                  className="w-full text-sm border divider-soft rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]/20 resize-none"
                  placeholder="Whatever feels honest — only what you want to write."
                />
              </div>
            ))}
          </div>
        )}

        {/* Free-form body — wins use this primarily; shift/guided use it as an extra "anything else" */}
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
          {kind === "win" ? "What happened?" : "Anything else? (free-form)"}
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={8000}
          rows={kind === "win" ? 5 : 3}
          data-testid="reflection-body"
          placeholder={
            kind === "win"
              ? "A win, a breakthrough, a small moment that mattered. Write it for yourself."
              : "Anything else on your mind?"
          }
          className="w-full text-sm border divider-soft rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]/20 resize-none mb-4"
        />

        {/* Share toggle */}
        <label className="flex items-start gap-3 p-3 rounded-xl border divider-soft bg-stone-50 cursor-pointer">
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
            data-testid="reflection-share-toggle"
            className="mt-0.5"
          />
          <div className="flex-1">
            <div className="text-sm font-semibold text-[#0F1115] flex items-center gap-1.5">
              <Share2 size={14} />
              Share with my manager for supervision
            </div>
            <div className="text-xs text-stone-600 mt-0.5">
              Optional. Only ticked entries appear in supervision-prep view. You can untick this any time.
            </div>
          </div>
        </label>

        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg text-stone-700 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            data-testid="reflection-save"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-[#0e3b4a] text-white hover:bg-[#0a2e3a] disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {existing ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Main page
// ===========================================================================
export default function Reflection() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("home");
  const [moodMeta, setMoodMeta] = useState({});
  const [promptSets, setPromptSets] = useState({});
  const [checkins, setCheckins] = useState([]);
  const [reflections, setReflections] = useState([]);
  const [pattern, setPattern] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, ci, re, pa] = await Promise.all([
        api.get("/reflection/prompt-sets"),
        api.get("/reflection/checkins/mine"),
        api.get("/reflection/entries/mine"),
        api.get("/reflection/my-pattern"),
      ]);
      setMoodMeta(ps.data.mood_meta || {});
      setPromptSets(ps.data.prompt_sets || {});
      setCheckins(ci.data || []);
      setReflections(re.data || []);
      setPattern(pa.data || null);
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const wins = useMemo(() => reflections.filter((r) => r.kind === "win"), [reflections]);
  const shiftReflections = useMemo(
    () => reflections.filter((r) => r.kind === "shift_reflection" || r.kind === "guided"),
    [reflections]
  );

  // Mood mix over last 14 days for the trend strip
  const mood14 = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const mix = { overwhelmed: 0, stressed: 0, okay: 0, positive: 0, confident: 0 };
    checkins.forEach((c) => {
      const t = new Date(c.created_at).getTime();
      if (t >= cutoff) mix[c.mood] = (mix[c.mood] || 0) + 1;
    });
    return mix;
  }, [checkins]);

  const totalRecent = Object.values(mood14).reduce((a, b) => a + b, 0);

  const deleteEntry = async (id) => {
    if (!window.confirm("Delete this reflection? It's yours and only you can.")) return;
    try {
      await api.delete(`/reflection/entries/${id}`);
      toast.success("Reflection deleted");
      refresh();
    } catch {
      toast.error("Couldn't delete");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-600 py-12 justify-center">
        <Loader2 size={18} className="animate-spin" /> Loading your reflection space…
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="reflection-page">
      {/* Header */}
      <header className="bg-white border divider-soft rounded-2xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2 mb-1.5">
              <Heart size={16} className="text-[#A8273A]" />
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                My Reflection
              </span>
            </div>
            <h1
              className="font-display font-semibold text-[28px] sm:text-[32px] leading-tight text-[#0F1115]"
              style={{ letterSpacing: "-0.02em" }}
            >
              A space that's just yours
            </h1>
            <p className="text-sm text-stone-700 mt-2 max-w-xl">
              Track how you're doing, reflect on shifts, capture wins. Private by default —
              your manager only sees what you choose to share for supervision.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setCheckinOpen(true)}
              data-testid="open-checkin-btn"
              className="text-sm font-semibold bg-[#0e3b4a] text-white px-4 py-2.5 rounded-lg hover:bg-[#0a2e3a] flex items-center gap-2"
            >
              <Heart size={15} /> Quick check-in
            </button>
            <button
              type="button"
              onClick={() => { setEditing(null); setEditorOpen(true); }}
              data-testid="open-reflection-btn"
              className="text-sm font-semibold bg-white border divider-soft text-[#0F1115] px-4 py-2.5 rounded-lg hover:bg-stone-50 flex items-center gap-2"
            >
              <Plus size={15} /> New reflection
            </button>
          </div>
        </div>
      </header>

      {/* Pattern nudge — staff-only, gentle */}
      {pattern?.nudge && (
        <div
          className="border-l-4 rounded-xl p-4 sm:p-5"
          style={{
            background: pattern.nudge.tone === "supportive" ? "#FCEEEA" : "#FFF7E6",
            borderColor: pattern.nudge.tone === "supportive" ? "#A8273A" : "#B8772F",
          }}
          data-testid="pattern-nudge"
        >
          <div className="flex items-start gap-3">
            <Heart size={20} className="shrink-0 mt-0.5" style={{ color: pattern.nudge.tone === "supportive" ? "#A8273A" : "#B8772F" }} />
            <div className="flex-1">
              <div className="font-semibold text-[#0F1115]">{pattern.nudge.title}</div>
              <p className="text-sm text-stone-700 mt-1">{pattern.nudge.message}</p>
              <p className="text-xs text-stone-500 mt-2">
                Only you see this nudge. Your manager sees an aggregate signal — no detail.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab strip */}
      <div className="flex gap-2 flex-wrap border-b divider-soft">
        {[
          { id: "home", label: "Overview", icon: TrendingUp },
          { id: "shift", label: `Shift reflections (${shiftReflections.length})`, icon: BookOpen },
          { id: "wins", label: `Wins (${wins.length})`, icon: Sparkles },
          { id: "checkins", label: `Check-ins (${checkins.length})`, icon: Heart },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={`text-sm font-medium px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === t.id
                ? "border-[#0e3b4a] text-[#0e3b4a]"
                : "border-transparent text-stone-600 hover:text-stone-900"
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "home" && (
        <div className="space-y-5">
          {/* Mood mix strip */}
          <div className="bg-white border divider-soft rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[#0F1115]">Your last 14 days</h3>
              <span className="text-xs text-stone-500">
                {totalRecent} check-in{totalRecent === 1 ? "" : "s"}
              </span>
            </div>
            {totalRecent === 0 ? (
              <p className="text-sm text-stone-600">
                No check-ins yet. Try a quick one — it takes 5 seconds and only you see it.
              </p>
            ) : (
              <div className="space-y-2">
                {["confident", "positive", "okay", "stressed", "overwhelmed"].map((m) => {
                  const meta = moodMeta[m] || {};
                  const count = mood14[m] || 0;
                  const pct = totalRecent ? Math.round((count / totalRecent) * 100) : 0;
                  return (
                    <div key={m} className="flex items-center gap-3">
                      <span className="w-24 text-xs font-semibold flex items-center gap-1.5">
                        <span className="text-base">{meta.emoji}</span>
                        {meta.label}
                      </span>
                      <div className="flex-1 h-2.5 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: meta.tone || "#0e3b4a",
                          }}
                        />
                      </div>
                      <span className="text-xs text-stone-600 w-12 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent items grid */}
          <div className="grid sm:grid-cols-2 gap-4">
            <RecentList
              title="Latest shift reflections"
              icon={BookOpen}
              items={shiftReflections.slice(0, 3)}
              empty="Try a shift reflection at the end of your next shift."
              onOpen={(r) => { setEditing(r); setEditorOpen(true); }}
              kindMeta={KIND_META}
            />
            <RecentList
              title="Recent wins"
              icon={Sparkles}
              items={wins.slice(0, 3)}
              empty="What's gone well lately? Wins matter as much as the hard stuff."
              onOpen={(r) => { setEditing(r); setEditorOpen(true); }}
              kindMeta={KIND_META}
            />
          </div>
        </div>
      )}

      {tab === "shift" && (
        <EntryList
          items={shiftReflections}
          empty="No shift reflections yet. Try one after your next shift."
          kindMeta={KIND_META}
          onEdit={(r) => { setEditing(r); setEditorOpen(true); }}
          onDelete={deleteEntry}
          promptSets={promptSets}
        />
      )}

      {tab === "wins" && (
        <EntryList
          items={wins}
          empty="Capture your first win — a relationship moment, a breakthrough, a quiet success."
          kindMeta={KIND_META}
          onEdit={(r) => { setEditing(r); setEditorOpen(true); }}
          onDelete={deleteEntry}
          promptSets={promptSets}
        />
      )}

      {tab === "checkins" && (
        <CheckinHistory checkins={checkins} moodMeta={moodMeta} onRefresh={refresh} />
      )}

      <CheckInModal
        open={checkinOpen}
        onClose={() => setCheckinOpen(false)}
        moodMeta={moodMeta}
        onCreated={refresh}
      />
      <ReflectionEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        promptSets={promptSets}
        onSaved={refresh}
        existing={editing}
      />
    </div>
  );
}

function RecentList({ title, icon: Icon, items, empty, onOpen, kindMeta }) {
  return (
    <div className="bg-white border divider-soft rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-stone-700" />
        <h3 className="font-semibold text-[#0F1115] text-sm">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-stone-600">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-2 p-2 rounded-lg hover:bg-stone-50 cursor-pointer"
              onClick={() => onOpen(r)}
            >
              <ChevronRight size={14} className="mt-1 text-stone-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#0F1115] truncate">
                  {r.title || (kindMeta[r.kind]?.label || "Reflection")}
                </div>
                <div className="text-xs text-stone-500 flex items-center gap-2">
                  <span>{formatWhen(r.created_at)}</span>
                  {r.shared_with_manager && (
                    <span className="inline-flex items-center gap-0.5 text-[#0e3b4a]">
                      <Share2 size={10} /> shared
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryList({ items, empty, kindMeta, onEdit, onDelete, promptSets }) {
  if (items.length === 0) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-10 text-center">
        <p className="text-sm text-stone-600">{empty}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3" data-testid="entry-list">
      {items.map((r) => {
        const meta = kindMeta[r.kind] || {};
        const Icon = meta.icon || BookOpen;
        const promptSet = r.prompt_set ? promptSets?.[r.prompt_set] : null;
        return (
          <li
            key={r.id}
            className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5"
            style={{ borderLeftColor: meta.tone || "#0e3b4a" }}
            data-testid={`entry-${r.id}`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <Icon size={11} style={{ color: meta.tone }} />
                  {meta.label}
                  {promptSet && <span className="text-stone-400">· {promptSet.label}</span>}
                  {r.shared_with_manager ? (
                    <span className="inline-flex items-center gap-1 text-[#0e3b4a]">
                      <Share2 size={10} /> Shared with manager
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-stone-500">
                      <Lock size={10} /> Private
                    </span>
                  )}
                </div>
                <div className="text-base font-semibold text-[#0F1115] mt-1">
                  {r.title || "Untitled reflection"}
                </div>
                <div className="text-xs text-stone-500">{formatWhen(r.created_at)}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => onEdit(r)}
                  data-testid={`entry-edit-${r.id}`}
                  className="p-1.5 hover:bg-stone-100 rounded-md text-stone-600"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => onDelete(r.id)}
                  data-testid={`entry-delete-${r.id}`}
                  className="p-1.5 hover:bg-[#A8273A]/10 rounded-md text-stone-600 hover:text-[#A8273A]"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {r.responses &&
              Object.keys(r.responses).length > 0 &&
              promptSet && (
                <div className="space-y-2 mt-2">
                  {promptSet.prompts
                    .filter((p) => r.responses[p.id])
                    .map((p) => (
                      <div key={p.id}>
                        <div className="text-xs font-semibold text-stone-600">{p.label}</div>
                        <div className="text-sm text-stone-800 whitespace-pre-wrap">
                          {r.responses[p.id]}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            {r.body && (
              <p className="text-sm text-stone-800 whitespace-pre-wrap mt-2">{r.body}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CheckinHistory({ checkins, moodMeta, onRefresh }) {
  const remove = async (id) => {
    if (!window.confirm("Delete this check-in?")) return;
    try {
      await api.delete(`/reflection/checkins/${id}`);
      toast.success("Check-in deleted");
      onRefresh();
    } catch {
      toast.error("Couldn't delete");
    }
  };
  if (checkins.length === 0) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-10 text-center">
        <p className="text-sm text-stone-600">
          No check-ins yet. Try one — 5 seconds, only you see it.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="checkin-list">
      {checkins.map((c) => {
        const meta = moodMeta[c.mood] || {};
        return (
          <li
            key={c.id}
            className="bg-white border divider-soft rounded-xl p-3 flex items-start gap-3"
            data-testid={`checkin-${c.id}`}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
              style={{ background: `${meta.tone}14` }}
            >
              {meta.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#0F1115]">
                {meta.label}
                <span className="text-xs text-stone-500 font-normal ml-2">
                  · {SHIFT_CONTEXT_LABEL[c.shift_context] || c.shift_context}
                </span>
              </div>
              <div className="text-xs text-stone-500">{formatWhen(c.created_at)}</div>
              {c.note && (
                <p className="text-sm text-stone-700 mt-1.5 whitespace-pre-wrap">{c.note}</p>
              )}
            </div>
            <button
              onClick={() => remove(c.id)}
              data-testid={`checkin-delete-${c.id}`}
              className="p-1.5 hover:bg-[#A8273A]/10 rounded-md text-stone-500 hover:text-[#A8273A] shrink-0"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
