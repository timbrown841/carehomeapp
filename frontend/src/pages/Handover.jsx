import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  ClipboardList,
  Plus,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Flag,
  Clock,
  ArrowLeft,
  X,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const SHIFT_LABEL = {
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
  sleep_in: "Sleep-in",
  long_day: "Long day",
  other: "Other",
};

const STATUS = {
  draft: { label: "Draft", color: "#5d6068", bg: "#5d606814" },
  awaiting_incoming: { label: "Awaiting incoming", color: "#B8772F", bg: "#B8772F14" },
  locked: { label: "Locked", color: "#0e3b4a", bg: "#0e3b4a14" },
};

const inputCls =
  "w-full bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]";

function initials(name) {
  return (name || "")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export default function Handover() {
  const { user } = useAuth();
  const [view, setView] = useState({ kind: "list" }); // {kind:"list"} | {kind:"detail",id}
  const [list, setList] = useState([]);
  const [sectionsMeta, setSectionsMeta] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([
        api.get("/handovers"),
        api.get("/handovers/sections"),
      ]);
      setList(l.data || []);
      setSectionsMeta(s.data?.sections || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  if (view.kind === "detail") {
    return (
      <HandoverDetail
        id={view.id}
        sectionsMeta={sectionsMeta}
        onBack={() => {
          setView({ kind: "list" });
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto" data-testid="handover-page">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
            Safeguarding · Operational
          </div>
          <h1
            className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5"
            style={{ letterSpacing: "-0.02em" }}
          >
            Shift Handover
          </h1>
          <p className="text-[#5d6068] mt-1.5 text-[15px]">
            Structured shift-to-shift handover with mandatory dual sign-off and a 24-hour manager unlock window if anything needs correcting.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          data-testid="handover-start-btn"
          className="inline-flex items-center gap-1.5 bg-[#0e3b4a] hover:bg-[#0a2c38] text-white font-semibold rounded-xl px-4 py-2.5 text-sm shadow-card"
        >
          <Plus size={14} /> Start handover
        </button>
      </header>

      {loading ? (
        <div className="text-center py-10 text-[#5d6068]">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white border divider-soft rounded-2xl p-10 text-center" data-testid="handover-empty">
          <span className="inline-flex w-12 h-12 rounded-2xl bg-[#0e3b4a]/10 text-[#0e3b4a] items-center justify-center">
            <ClipboardList size={22} />
          </span>
          <p className="text-sm text-[#5d6068] mt-3">
            No handovers yet. Tap "Start handover" at the end of your shift.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5" data-testid="handover-list">
          {list.map((h) => (
            <HandoverRow
              key={h.id}
              h={h}
              onOpen={() => setView({ kind: "detail", id: h.id })}
            />
          ))}
        </ul>
      )}

      {showCreate && (
        <CreateHandoverModal
          defaultInitials={initials(user?.name)}
          onClose={() => setShowCreate(false)}
          onCreated={(h) => {
            setShowCreate(false);
            setView({ kind: "detail", id: h.id });
          }}
        />
      )}
    </div>
  );
}

function HandoverRow({ h, onOpen }) {
  const st = STATUS[h.status] || STATUS.draft;
  const flagged = Number(h.flagged_count || 0);
  return (
    <li
      data-testid={`handover-row-${h.id}`}
      onClick={onOpen}
      className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4 hover:shadow-card-lg transition-shadow cursor-pointer"
      style={{ borderLeftColor: flagged > 0 ? "#A8273A" : st.color }}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white"
              style={{ background: st.color }}
            >
              {st.label}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
              {SHIFT_LABEL[h.shift] || h.shift}
            </span>
            <span className="font-mono text-[11px] text-[#5d6068] tabular-nums">
              {h.shift_date}
            </span>
            {flagged > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#A8273A] text-white">
                <Flag size={9} /> {flagged} flagged
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-[#0F1115]">
            {h.outgoing_user_name || "—"}{" "}
            <span className="text-[#5d6068] font-normal">→</span>{" "}
            {h.incoming_user_name || (
              <span className="text-[#B8772F]">awaiting incoming…</span>
            )}
          </div>
          <div className="text-xs text-[#5d6068] mt-0.5">
            {h.locked_at
              ? `Locked ${(h.locked_at || "").slice(0, 16).replace("T", " ")}`
              : h.outgoing_signed_at
              ? `Submitted ${(h.outgoing_signed_at || "").slice(0, 16).replace("T", " ")}`
              : "Draft — not yet submitted"}
          </div>
        </div>
        <div className="flex items-center gap-1 text-[#8a8d95]">
          {h.status === "locked" ? <Lock size={14} /> : <ChevronRight size={16} />}
        </div>
      </div>
    </li>
  );
}

function HandoverDetail({ id, sectionsMeta, onBack }) {
  const { user } = useAuth();
  const canManage = user?.role === "manager" || user?.role === "admin";
  const [h, setH] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openSection, setOpenSection] = useState(null);
  const [signOutModal, setSignOutModal] = useState(false);
  const [signInModal, setSignInModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/handovers/${id}`);
      setH(r.data);
      // Auto-open the first flagged section if any, else first non-empty
      const sec = r.data?.sections || {};
      const firstFlagged = sectionsMeta.find((s) => sec[s.id]?.flagged);
      if (firstFlagged) setOpenSection(firstFlagged.id);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const editable = useMemo(() => {
    if (!h) return false;
    if (h.status === "draft" || h.status === "awaiting_incoming") return true;
    if (h.status === "locked" && h.unlocked_until) {
      try {
        return new Date(h.unlocked_until).getTime() > Date.now();
      } catch {
        return false;
      }
    }
    return false;
  }, [h]);

  const updateSection = async (sid, patch) => {
    if (!h) return;
    const newSections = { ...(h.sections || {}) };
    newSections[sid] = { ...(newSections[sid] || { body: "", flagged: false }), ...patch };
    setBusy(true);
    try {
      const resp = await api.patch(`/handovers/${id}`, {
        shift: h.shift,
        shift_date: h.shift_date,
        sections: newSections,
      });
      setH(resp.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (initials) => {
    try {
      const resp = await api.post(`/handovers/${id}/sign-out`, { initials });
      setH(resp.data);
      toast.success("Submitted — awaiting incoming staff to sign in");
      setSignOutModal(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const signIn = async (initials) => {
    try {
      const resp = await api.post(`/handovers/${id}/sign-in`, { initials });
      setH(resp.data);
      toast.success(
        h.flagged_count > 0
          ? "Locked. Manager notified about flagged sections."
          : "Locked. Handover complete."
      );
      setSignInModal(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const unlock = async () => {
    if (!window.confirm("Unlock this handover for 24 hours so corrections can be made?")) return;
    try {
      const resp = await api.post(`/handovers/${id}/unlock`);
      setH(resp.data);
      toast.success("Unlocked for 24h. Edits will reset the lock when re-signed.");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this handover? This cannot be undone.")) return;
    try {
      await api.delete(`/handovers/${id}`);
      toast.success("Deleted");
      onBack();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-[#5d6068]">
        <Loader2 className="animate-spin inline" />
      </div>
    );
  }
  if (!h) return null;

  const st = STATUS[h.status] || STATUS.draft;
  const flagged = Number(h.flagged_count || 0);
  const sec = h.sections || {};

  return (
    <div className="space-y-4 max-w-4xl mx-auto" data-testid="handover-detail">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-[#5d6068] hover:text-[#0e3b4a]"
        data-testid="handover-back"
      >
        <ArrowLeft size={14} /> All handovers
      </button>

      <header className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white"
            style={{ background: st.color }}
          >
            {st.label}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
            {SHIFT_LABEL[h.shift] || h.shift} · {h.shift_date}
          </span>
          {flagged > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#A8273A] text-white">
              <Flag size={9} /> {flagged} flagged for manager
            </span>
          )}
          {h.status === "locked" && h.unlocked_until && new Date(h.unlocked_until).getTime() > Date.now() && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#B8772F] text-white">
              <Unlock size={9} /> unlocked till {(h.unlocked_until || "").slice(0, 16).replace("T", " ")}
            </span>
          )}
        </div>
        <h2
          className="font-display font-semibold text-2xl text-[#0F1115]"
          style={{ letterSpacing: "-0.02em" }}
        >
          {h.outgoing_user_name || "—"} → {h.incoming_user_name || "awaiting incoming…"}
        </h2>
        <div className="text-xs text-[#5d6068] mt-1">
          {h.outgoing_signed_at && (
            <span>
              Outgoing signed {h.outgoing_initials} · {(h.outgoing_signed_at || "").slice(0, 16).replace("T", " ")}
            </span>
          )}
          {h.incoming_signed_at && (
            <>
              {" · "}
              <span>
                Incoming signed {h.incoming_initials} · {(h.incoming_signed_at || "").slice(0, 16).replace("T", " ")}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-4">
          {h.status === "draft" && (
            <button
              type="button"
              onClick={() => setSignOutModal(true)}
              data-testid="handover-sign-out-btn"
              className="inline-flex items-center gap-1.5 bg-[#0e3b4a] hover:bg-[#0a2c38] text-white font-semibold rounded-xl px-3.5 py-2 text-sm"
            >
              <CheckCircle2 size={13} /> Submit & sign out (outgoing)
            </button>
          )}
          {h.status === "awaiting_incoming" && (
            <button
              type="button"
              onClick={() => setSignInModal(true)}
              data-testid="handover-sign-in-btn"
              className="inline-flex items-center gap-1.5 bg-[#2F6A3A] hover:bg-[#234d2c] text-white font-semibold rounded-xl px-3.5 py-2 text-sm"
            >
              <Lock size={13} /> Sign in & accept (incoming)
            </button>
          )}
          {h.status === "locked" && canManage && !editable && (
            <button
              type="button"
              onClick={unlock}
              data-testid="handover-unlock-btn"
              className="inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border-2 border-[#B8772F]/40 text-[#B8772F] font-semibold rounded-xl px-3.5 py-2 text-sm"
            >
              <Unlock size={13} /> Unlock for 24h
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={remove}
              className="inline-flex items-center gap-1.5 text-[#8a8d95] hover:text-[#A8273A] text-sm ml-auto"
              data-testid="handover-delete-btn"
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      </header>

      <div className="space-y-2" data-testid="handover-sections">
        {sectionsMeta.map((s) => {
          const content = sec[s.id] || { body: "", flagged: false };
          const open = openSection === s.id;
          const hasContent = !!(content.body || "").trim();
          return (
            <SectionCard
              key={s.id}
              meta={s}
              content={content}
              open={open}
              hasContent={hasContent}
              editable={editable}
              busy={busy}
              onToggle={() => setOpenSection(open ? null : s.id)}
              onChange={(patch) => updateSection(s.id, patch)}
            />
          );
        })}
      </div>

      {signOutModal && (
        <SignModal
          title="Sign out · outgoing staff"
          subtitle="Confirm your initials to submit this handover. Once you sign, the incoming staff member can review and lock it."
          defaultInitials={initials(h.outgoing_user_name) || initials(user?.name)}
          onClose={() => setSignOutModal(false)}
          onConfirm={signOut}
          testid="handover-sign-out-modal"
        />
      )}
      {signInModal && (
        <SignModal
          title="Sign in · incoming staff"
          subtitle={
            flagged > 0
              ? `${flagged} section${flagged === 1 ? "" : "s"} flagged for manager attention. The manager will be notified automatically when you sign in.`
              : "Confirm your initials. The handover will lock immediately."
          }
          defaultInitials={initials(user?.name)}
          onClose={() => setSignInModal(false)}
          onConfirm={signIn}
          testid="handover-sign-in-modal"
        />
      )}
    </div>
  );
}

function SectionCard({ meta, content, open, hasContent, editable, busy, onToggle, onChange }) {
  const [draft, setDraft] = useState(content.body || "");
  useEffect(() => {
    setDraft(content.body || "");
  }, [content.body]);
  const flagColor = content.flagged ? "#A8273A" : "#8a8d95";
  return (
    <div
      className="bg-white border-l-4 border-y border-r divider-soft rounded-xl"
      style={{ borderLeftColor: content.flagged ? "#A8273A" : hasContent ? "#0e3b4a" : "#E6E8EC" }}
      data-testid={`handover-section-${meta.id}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-stone-50/60"
      >
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
          style={{
            background: hasContent ? "#0e3b4a14" : "#E6E8EC30",
            color: hasContent ? "#0e3b4a" : "#8a8d95",
          }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-[#0F1115]">{meta.label}</span>
            {hasContent && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#0e3b4a]">
                · filled
              </span>
            )}
            {content.flagged && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-[#A8273A]">
                <Flag size={9} /> flagged
              </span>
            )}
          </div>
          {!open && hasContent && (
            <p className="text-xs text-[#5d6068] mt-1 line-clamp-1">{content.body}</p>
          )}
          {!open && !hasContent && (
            <p className="text-xs text-[#8a8d95] mt-1 italic">{meta.hint}</p>
          )}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft !== (content.body || "")) onChange({ body: draft });
            }}
            disabled={!editable}
            placeholder={meta.hint}
            data-testid={`handover-section-input-${meta.id}`}
            className={`${inputCls} resize-y disabled:bg-stone-50 disabled:text-[#5d6068]`}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-[#2f3038]">
              <input
                type="checkbox"
                checked={!!content.flagged}
                disabled={!editable || busy}
                onChange={(e) => onChange({ flagged: e.target.checked })}
                data-testid={`handover-flag-${meta.id}`}
              />
              <span style={{ color: flagColor }}>
                Flag for manager attention
              </span>
            </label>
            {!editable && (
              <span className="text-[11px] text-[#8a8d95] inline-flex items-center gap-1">
                <Lock size={10} /> Locked
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateHandoverModal({ defaultInitials, onClose, onCreated }) {
  const [shift, setShift] = useState(() => {
    const h = new Date().getHours();
    if (h < 14) return "morning";
    if (h < 22) return "afternoon";
    return "night";
  });
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [outgoingInitials, setOutgoingInitials] = useState(defaultInitials || "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post("/handovers", {
        shift,
        shift_date: shiftDate,
        outgoing_initials: outgoingInitials || null,
      });
      onCreated(r.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border divider-soft space-y-3"
        data-testid="handover-create-modal"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            Start handover
          </h3>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          Shift
        </label>
        <select
          value={shift}
          onChange={(e) => setShift(e.target.value)}
          data-testid="handover-create-shift"
          className={inputCls}
        >
          {Object.entries(SHIFT_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          Shift date
        </label>
        <input
          required
          type="date"
          value={shiftDate}
          onChange={(e) => setShiftDate(e.target.value)}
          data-testid="handover-create-date"
          className={inputCls}
        />
        <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          Your initials (auto-filled)
        </label>
        <input
          value={outgoingInitials}
          onChange={(e) => setOutgoingInitials(e.target.value.toUpperCase())}
          maxLength={6}
          data-testid="handover-create-initials"
          className={inputCls}
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="handover-create-submit"
          className="w-full bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Open handover
        </button>
      </form>
    </div>
  );
}

function SignModal({ title, subtitle, defaultInitials, onClose, onConfirm, testid }) {
  const [v, setV] = useState(defaultInitials || "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!v.trim()) {
      toast.error("Initials required");
      return;
    }
    setBusy(true);
    try {
      await onConfirm(v.trim().toUpperCase());
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border divider-soft space-y-3"
        data-testid={testid}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">{title}</h3>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[#2f3038]">{subtitle}</p>
        <label className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          Your initials
        </label>
        <input
          required
          value={v}
          onChange={(e) => setV(e.target.value.toUpperCase())}
          maxLength={6}
          autoFocus
          data-testid="handover-sign-initials"
          className={`${inputCls} text-lg font-bold tracking-wider`}
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="handover-sign-confirm"
          className="w-full bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Confirm & sign
        </button>
      </form>
    </div>
  );
}
