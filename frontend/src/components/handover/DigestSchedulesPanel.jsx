/* Digest Schedules Panel — Phase G.1
 *
 * Manager+ controls for Morning / Weekly / Monthly handover digest delivery.
 * Email dispatch is MOCKED — toggles, recipients, and "Send now" still write
 * audit records and persist deliveries in db.digest_deliveries.
 */
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CalendarClock, Send, Power, Users as UsersIcon, Mail, CheckCircle2,
  Loader2, RefreshCw, History, AlertCircle,
} from "lucide-react";

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function DigestSchedulesPanel() {
  const [schedules, setSchedules] = useState([]);
  const [users, setUsers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, u, d] = await Promise.all([
        api.get("/handover/digest-schedules"),
        api.get("/auth/users/picker"),
        api.get("/handover/digest-deliveries?limit=15"),
      ]);
      setSchedules(s.data.schedules || []);
      setUsers((u.data || []).filter((x) => ["manager", "admin"].includes(x.role)));
      setDeliveries(d.data.deliveries || []);
    } catch (e) {
      setError(e?.response?.status === 403
        ? "Manager+ only — digest schedules are restricted."
        : "Could not load schedules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = async (sid, update) => {
    setPendingId(sid);
    try {
      await api.patch(`/handover/digest-schedules/${sid}`, update);
      await load();
    } catch {
      toast.error("Could not update schedule.");
    } finally {
      setPendingId(null);
    }
  };

  const sendNow = async (sid) => {
    setPendingId(sid);
    try {
      await api.post(`/handover/digest-schedules/${sid}/send-now`);
      toast.success("Digest dispatched.");
      await load();
    } catch {
      toast.error("Could not send digest.");
    } finally {
      setPendingId(null);
    }
  };

  if (loading) {
    return (
      <div
        className="bg-white border divider-soft rounded-2xl p-6 flex items-center gap-2 text-stone-600 text-sm"
        data-testid="digest-schedules-panel"
      >
        <Loader2 size={14} className="animate-spin" /> Loading schedules…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="bg-white border divider-soft rounded-2xl p-6 text-sm text-stone-700"
        data-testid="digest-schedules-panel"
      >
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="digest-schedules-panel">
      <section className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-start justify-between gap-2 flex-wrap mb-4">
          <div>
            <div className="flex items-center gap-2 text-[#0e3b4a]">
              <CalendarClock size={14} />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
                Scheduled deliveries
              </span>
            </div>
            <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-1">
              Keep leadership in the loop, automatically.
            </h3>
            <p className="text-[12px] text-stone-500 mt-0.5 max-w-2xl">
              Toggle the digests you want delivered. Email is currently <strong>mocked</strong> —
              deliveries still log in the audit trail and surface here for verification.
            </p>
          </div>
          <button
            onClick={load}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded hover:bg-stone-50"
            title="Refresh"
            data-testid="digest-schedules-refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-3">
          {schedules.map((s) => (
            <ScheduleCard
              key={s.id}
              s={s}
              users={users}
              pending={pendingId === s.id}
              onToggle={() => patch(s.id, { enabled: !s.enabled })}
              onChangeRecipients={(recipients) => patch(s.id, { recipients })}
              onSendNow={() => sendNow(s.id)}
            />
          ))}
        </div>
      </section>

      {/* Recent deliveries */}
      <section className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <History size={14} className="text-[#0e3b4a]" />
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            Recent deliveries
          </h3>
        </div>
        {deliveries.length === 0 ? (
          <div className="text-[13px] text-stone-500 py-4">
            No digests have been delivered yet. Enable a schedule above or click
            "Send now" to trigger one.
          </div>
        ) : (
          <ul className="divide-y divider-soft" data-testid="digest-deliveries-list">
            {deliveries.map((d) => (
              <li key={d.id} className="py-3 flex items-start gap-3 flex-wrap" data-testid={`digest-delivery-${d.id}`}>
                <div className="w-9 h-9 rounded-lg bg-[#E7F3EC] text-[#1f4f2b] flex items-center justify-center shrink-0">
                  <CheckCircle2 size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-900">
                    {d.schedule_label || d.schedule_key}
                    {d.manual_trigger && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-[#15405d] bg-[#E5F0F7] px-1.5 py-0.5 rounded">
                        Manual
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-stone-600 mt-0.5">
                    {d.period_label} · delivered {fmt(d.delivered_at)}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <UsersIcon size={10} /> {d.recipients?.length || 0} recipient{(d.recipients?.length || 0) === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      Channels: {(d.delivery_channels || []).join(", ") || "in-app"}
                    </span>
                    {(d.delivery_status || "").includes("queued") && (
                      <span className="text-[#B8772F] font-bold">[EMAIL MOCKED]</span>
                    )}
                  </div>
                  {d.snapshot && (
                    <div className="text-[11px] text-stone-500 mt-1">
                      Snapshot · safeguarding {d.snapshot.safeguarding_new || 0} ·
                      missing {d.snapshot.missing_episodes || 0} ·
                      improving {d.snapshot.improving || 0} ·
                      support needed {d.snapshot.deteriorating || 0} ·
                      manager actions {d.snapshot.manager_actions_total || 0}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ScheduleCard({ s, users, pending, onToggle, onChangeRecipients, onSendNow }) {
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const selectedNames = (s.recipients || []).map((id) => {
    const u = users.find((x) => x.id === id);
    return u ? u.name : id.slice(0, 6);
  });

  const toggleRecipient = (uid) => {
    const current = s.recipients || [];
    const next = current.includes(uid)
      ? current.filter((x) => x !== uid)
      : [...current, uid];
    onChangeRecipients(next);
  };

  return (
    <div
      className={`border-2 rounded-xl p-4 transition-colors ${
        s.enabled ? "border-[#2F6A3A]/50 bg-[#E7F3EC]/30" : "border-stone-200 bg-stone-50"
      }`}
      data-testid={`schedule-card-${s.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display font-semibold text-base text-[#0F1115]">{s.label}</div>
          <div className="text-[11px] text-stone-500 uppercase tracking-wider font-bold mt-0.5">
            {s.description}
          </div>
        </div>
        <button
          onClick={onToggle}
          disabled={pending}
          data-testid={`schedule-toggle-${s.id}`}
          className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border transition-colors ${
            s.enabled
              ? "bg-[#2F6A3A] text-white border-[#2F6A3A]"
              : "bg-white text-stone-500 border-stone-300"
          }`}
        >
          <Power size={10} /> {s.enabled ? "On" : "Off"}
        </button>
      </div>

      <div className="text-[11px] text-stone-600 mt-3 space-y-0.5">
        <div>Next run: <strong>{fmt(s.next_run_at)}</strong></div>
        <div>Last run: {fmt(s.last_run_at)}</div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setRecipientPickerOpen((o) => !o)}
          data-testid={`schedule-recipients-${s.id}`}
          className="text-[11px] font-semibold text-[#0e3b4a] hover:underline inline-flex items-center gap-1"
        >
          <UsersIcon size={11} />
          {selectedNames.length === 0
            ? "Add recipients"
            : `${selectedNames.length} recipient${selectedNames.length === 1 ? "" : "s"}`}
        </button>
        {selectedNames.length > 0 && (
          <div className="text-[11px] text-stone-500 mt-1">
            {selectedNames.slice(0, 3).join(", ")}
            {selectedNames.length > 3 && ` +${selectedNames.length - 3}`}
          </div>
        )}
        {recipientPickerOpen && (
          <div
            className="mt-2 p-2 border divider-soft rounded-lg bg-white max-h-44 overflow-y-auto"
            data-testid={`schedule-recipient-list-${s.id}`}
          >
            {users.length === 0 ? (
              <div className="text-[11px] text-stone-400">No managers found.</div>
            ) : (
              users.map((u) => {
                const sel = (s.recipients || []).includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 py-1 cursor-pointer hover:bg-stone-50 px-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleRecipient(u.id)}
                      data-testid={`schedule-recipient-${s.id}-${u.id}`}
                      className="accent-[#0e3b4a]"
                    />
                    <span className="text-[12px] text-stone-800 flex-1">{u.name}</span>
                    <span className="text-[10px] text-stone-400 uppercase tracking-wider">{u.role}</span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Button
          onClick={onSendNow}
          disabled={pending}
          className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[11px] h-7"
          data-testid={`schedule-send-now-${s.id}`}
        >
          {pending ? <Loader2 size={11} className="animate-spin mr-1" /> : <Send size={11} className="mr-1" />}
          Send now
        </Button>
        <span className="inline-flex items-center gap-1 text-[10px] text-stone-400">
          <Mail size={10} /> Email mocked
        </span>
      </div>

      {s.enabled && (s.recipients || []).length === 0 && (
        <div className="mt-2 inline-flex items-start gap-1 text-[10px] text-[#7a4d12]">
          <AlertCircle size={10} className="shrink-0 mt-0.5" />
          No recipients — digest will run in-app only.
        </div>
      )}
    </div>
  );
}
