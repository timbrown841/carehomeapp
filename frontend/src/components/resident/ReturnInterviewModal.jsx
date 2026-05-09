import { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { X, Loader2, ShieldCheck, FileDown } from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

const EXPLOITATION_OPTIONS = [
  "Going missing repeatedly",
  "Unexplained money / new items",
  "Older / unknown associates",
  "Travel to unfamiliar areas",
  "Substance use",
  "Sexualised behaviour or language",
  "Secretive phone / online activity",
  "Self-harm / signs of trauma",
  "Multiple SIM cards / phones",
  "Reluctance to disclose where they were",
];

/**
 * Capture a Return Interview for a missing episode.
 * Triggered by "Mark returned & start return interview" on a still-open episode.
 */
export default function ReturnInterviewModal({ episode, residentName, onClose, onSaved }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    returned_at: new Date().toISOString().slice(0, 16),
    account_of_events: "",
    locations_visited: "",
    who_they_were_with: "",
    safeguarding_concerns: "",
    actions_taken: "",
    follow_up_required: "",
  });
  const [indicators, setIndicators] = useState([]);

  const toggleIndicator = (label) => {
    setIndicators((cur) =>
      cur.includes(label) ? cur.filter((c) => c !== label) : [...cur, label]
    );
  };

  const submit = async () => {
    if (!f.account_of_events.trim()) {
      toast.error("Please capture the young person's account of events");
      return;
    }
    setBusy(true);
    try {
      const split = (s) =>
        s
          ? s
              .split(/\n|,/)
              .map((x) => x.trim())
              .filter(Boolean)
          : [];
      const r = await api.post("/return-interviews", {
        missing_episode_id: episode.id,
        returned_at: f.returned_at ? new Date(f.returned_at).toISOString() : null,
        account_of_events: f.account_of_events,
        locations_visited: split(f.locations_visited),
        who_they_were_with: split(f.who_they_were_with),
        safeguarding_concerns: f.safeguarding_concerns || null,
        exploitation_indicators: indicators,
        actions_taken: f.actions_taken || null,
        follow_up_required: f.follow_up_required || null,
      });
      toast.success("Return interview submitted");
      onSaved?.(r.data);
      onClose?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-xl border divider-soft space-y-3 my-6"
        data-testid="return-interview-modal"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#1E4D5C]">
              Missing From Care · Statutory Follow-up
            </div>
            <h3 className="font-display font-semibold text-xl text-[#0F1115] mt-0.5">
              Return Interview · {residentName}
            </h3>
            <p className="text-xs text-[#5d6068] mt-0.5">
              Capture the young person's account, safeguarding concerns and actions. Manager sign-off applies after submission.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-800">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Date / time returned
            </label>
            <input
              type="datetime-local"
              value={f.returned_at}
              onChange={(e) => setF({ ...f, returned_at: e.target.value })}
              data-testid="ri-returned-at"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Conducted by
            </label>
            <input
              value={user?.name || ""}
              readOnly
              className={`${inputCls} bg-stone-50 cursor-not-allowed`}
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
            Young person's account of events
          </label>
          <textarea
            rows={4}
            placeholder="In their own words: where they went, why they left, how they felt, any pressure or threats…"
            value={f.account_of_events}
            onChange={(e) => setF({ ...f, account_of_events: e.target.value })}
            data-testid="ri-account"
            className={`${inputCls} resize-none`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Locations visited (one per line or comma-separated)
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Piccadilly Gardens, friend's flat (Stretford), park near school"
              value={f.locations_visited}
              onChange={(e) => setF({ ...f, locations_visited: e.target.value })}
              data-testid="ri-locations"
              className={`${inputCls} resize-none`}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Who they were with
            </label>
            <textarea
              rows={3}
              placeholder="Names / first names / descriptions if names unknown"
              value={f.who_they_were_with}
              onChange={(e) => setF({ ...f, who_they_were_with: e.target.value })}
              data-testid="ri-people"
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
            Safeguarding concerns
          </label>
          <textarea
            rows={2}
            placeholder="Any disclosures, observations or staff judgements raising safeguarding concern"
            value={f.safeguarding_concerns}
            onChange={(e) => setF({ ...f, safeguarding_concerns: e.target.value })}
            data-testid="ri-safeguarding"
            className={`${inputCls} resize-none`}
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
            Child / young-person exploitation indicators
          </label>
          <div
            className="grid sm:grid-cols-2 gap-1.5 mt-1"
            data-testid="ri-exploitation-indicators"
          >
            {EXPLOITATION_OPTIONS.map((opt) => {
              const active = indicators.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleIndicator(opt)}
                  className={`text-left text-xs rounded-lg border px-2.5 py-1.5 transition-colors ${
                    active
                      ? "bg-[#A8273A]/10 border-[#A8273A]/40 text-[#A8273A] font-semibold"
                      : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
                  }`}
                  data-testid={`ri-indicator-${opt.toLowerCase().slice(0, 18).replace(/[^a-z]+/g, "-")}`}
                >
                  {active ? "✓ " : ""}{opt}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Actions taken
            </label>
            <textarea
              rows={3}
              placeholder="Actions completed during/after return: medical check, social-worker call, risk-assessment update…"
              value={f.actions_taken}
              onChange={(e) => setF({ ...f, actions_taken: e.target.value })}
              data-testid="ri-actions"
              className={`${inputCls} resize-none`}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              Follow-up required
            </label>
            <textarea
              rows={3}
              placeholder="Open actions for manager / social worker / DSL"
              value={f.follow_up_required}
              onChange={(e) => setF({ ...f, follow_up_required: e.target.value })}
              data-testid="ri-followup"
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            data-testid="ri-submit-btn"
            className="bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2.5 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            Submit interview & close episode
          </button>
          <span className="text-[11px] text-[#5d6068]">
            <FileDown size={11} className="inline" /> PDF will be available immediately for download.
          </span>
        </div>
      </form>
    </div>
  );
}
