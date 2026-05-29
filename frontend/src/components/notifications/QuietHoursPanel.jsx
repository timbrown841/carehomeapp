/* Quiet Hours panel — Phase G.1b
 *
 * Supportive UI for setting evening / overnight notification quiet hours.
 * Non-critical alerts are bundled into the next morning digest;
 * critical safeguarding events always break through.
 */
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Moon, Sunrise, ShieldAlert, Inbox, Loader2, BellOff, CheckCircle2,
  Sparkles, Mail, Smartphone, BellRing,
} from "lucide-react";

const DAYS = [
  { key: 0, short: "Mon", long: "Monday" },
  { key: 1, short: "Tue", long: "Tuesday" },
  { key: 2, short: "Wed", long: "Wednesday" },
  { key: 3, short: "Thu", long: "Thursday" },
  { key: 4, short: "Fri", long: "Friday" },
  { key: 5, short: "Sat", long: "Saturday" },
  { key: 6, short: "Sun", long: "Sunday" },
];

export default function QuietHoursPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qh, setQh] = useState(null);
  const [inQuiet, setInQuiet] = useState(false);
  const [criticalEvents, setCriticalEvents] = useState([]);
  const [bundledExamples, setBundledExamples] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/notif-centre/quiet-hours");
      setQh(r.data.quiet_hours);
      setInQuiet(r.data.is_in_quiet_hours);
      setCriticalEvents(r.data.critical_breakthrough_events || []);
      setBundledExamples(r.data.bundled_examples || []);
    } catch {
      toast.error("Could not load quiet hours.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (next) => {
    setSaving(true);
    try {
      const r = await api.patch("/notif-centre/quiet-hours", next);
      setQh(r.data.quiet_hours);
      // Reload to refresh is_in_quiet_hours
      const fresh = await api.get("/notif-centre/quiet-hours");
      setInQuiet(fresh.data.is_in_quiet_hours);
      toast.success("Quiet hours saved.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save quiet hours.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !qh) {
    return (
      <div
        data-testid="quiet-hours-panel"
        className="bg-white border divider-soft rounded-2xl p-5 inline-flex items-center gap-2 text-stone-600 text-sm w-full"
      >
        <Loader2 size={14} className="animate-spin" /> Loading quiet hours…
      </div>
    );
  }

  const toggleEnabled = () => save({ enabled: !qh.enabled });
  const toggleDay = (d) => {
    const days = (qh.days || []).includes(d)
      ? qh.days.filter((x) => x !== d)
      : [...(qh.days || []), d].sort((a, b) => a - b);
    save({ days });
  };
  const setStart = (v) => save({ start: v });
  const setEnd = (v) => save({ end: v });
  const toggleChannel = (key) => save({ [key]: !qh[key] });

  return (
    <section
      data-testid="quiet-hours-panel"
      className={`bg-white border-2 rounded-2xl p-5 transition-colors ${
        qh.enabled && inQuiet
          ? "border-[#7a4d12]/40 bg-gradient-to-br from-[#FCEFD4]/40 to-white"
          : qh.enabled
          ? "border-[#0e3b4a]/30"
          : "border-stone-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[#0e3b4a]">
            <Moon size={14} />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
              Quiet hours · Protect your downtime
            </span>
            {qh.enabled && inQuiet && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#7a4d12] text-white"
                data-testid="quiet-hours-active-now"
              >
                Active now
              </span>
            )}
          </div>
          <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-1">
            Protect your downtime while keeping critical safeguarding alerts active.
          </h3>
          <p className="text-[12px] text-stone-500 mt-0.5 max-w-2xl">
            During quiet hours, non-urgent notifications bundle into your next morning digest.
            Critical events — missing children, serious safeguarding concerns, police involvement —
            still break through immediately.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleEnabled}
          disabled={saving}
          data-testid="quiet-hours-toggle"
          className={`shrink-0 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-colors ${
            qh.enabled
              ? "bg-[#0e3b4a] text-white border-[#0e3b4a]"
              : "bg-white text-stone-500 border-stone-300"
          }`}
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <BellOff size={11} />}
          {qh.enabled ? "On" : "Off"}
        </button>
      </div>

      {qh.enabled && (
        <>
          {/* Time range */}
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500 flex items-center gap-1.5">
                <Moon size={11} /> Quiet starts
              </span>
              <input
                type="time"
                value={qh.start}
                onChange={(e) => setStart(e.target.value)}
                disabled={saving}
                data-testid="quiet-hours-start"
                className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm font-mono"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500 flex items-center gap-1.5">
                <Sunrise size={11} /> Quiet ends
              </span>
              <input
                type="time"
                value={qh.end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={saving}
                data-testid="quiet-hours-end"
                className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm font-mono"
              />
            </label>
          </div>

          {/* Days */}
          <div className="mt-4">
            <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">
              Days active
            </span>
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {DAYS.map((d) => {
                const active = (qh.days || []).includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDay(d.key)}
                    disabled={saving}
                    data-testid={`quiet-hours-day-${d.key}`}
                    title={d.long}
                    className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition-colors min-w-[44px] ${
                      active
                        ? "bg-[#0e3b4a] text-white border-[#0e3b4a]"
                        : "bg-white text-stone-500 border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Apply to channels */}
          <div className="mt-4">
            <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">
              Apply quiet hours to
            </span>
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {[
                { key: "apply_to_in_app", label: "In-app push", icon: BellRing },
                { key: "apply_to_email",  label: "Email",       icon: Mail },
                { key: "apply_to_sms",    label: "SMS",         icon: Smartphone },
              ].map(({ key, label, icon: Icon }) => {
                const active = !!qh[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleChannel(key)}
                    disabled={saving}
                    data-testid={`quiet-hours-${key}`}
                    className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full border inline-flex items-center gap-1 transition-colors ${
                      active
                        ? "bg-[#0e3b4a] text-white border-[#0e3b4a]"
                        : "bg-white text-stone-500 border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    <Icon size={11} /> {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Breakthrough explanation */}
          <div
            className="mt-5 grid lg:grid-cols-2 gap-3"
            data-testid="quiet-hours-preview"
          >
            <div className="rounded-xl border border-[#A8273A]/30 bg-[#FBE3E7]/40 p-3.5">
              <div className="flex items-center gap-1.5 text-[#7a1a28]">
                <ShieldAlert size={13} />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Always breaks through
                </span>
              </div>
              <div className="text-[12px] font-semibold text-[#7a1a28] mt-1 mb-1.5">
                Critical events still page you immediately
              </div>
              <ul className="text-[11.5px] text-stone-700 space-y-0.5 list-disc list-inside">
                {criticalEvents.slice(0, 7).map((c) => (
                  <li key={c.key} data-testid={`quiet-hours-critical-${c.key}`}>
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-[#0e3b4a]/20 bg-[#E5F0F7]/40 p-3.5">
              <div className="flex items-center gap-1.5 text-[#15405d]">
                <Inbox size={13} />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Held for your morning digest
                </span>
              </div>
              <div className="text-[12px] font-semibold text-[#15405d] mt-1 mb-1.5">
                Routine reminders won't disturb you
              </div>
              <ul className="text-[11.5px] text-stone-700 space-y-0.5 list-disc list-inside">
                {bundledExamples.slice(0, 6).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          </div>

          {qh.enabled && inQuiet && (
            <div
              data-testid="quiet-hours-active-banner"
              className="mt-4 rounded-xl border border-[#7a4d12]/30 bg-[#FCEFD4]/60 p-3 inline-flex items-start gap-2 text-[12px] text-[#7a4d12]"
            >
              <Sparkles size={13} className="shrink-0 mt-0.5" />
              <span>
                <strong>Quiet hours active right now.</strong>
                {" "}Non-urgent updates will bundle into your next morning digest.
                Critical safeguarding alerts will still reach you.
              </span>
            </div>
          )}
        </>
      )}

      {!qh.enabled && (
        <div className="mt-2 inline-flex items-center gap-2 text-[12px] text-stone-500">
          <CheckCircle2 size={12} className="text-stone-400" />
          Quiet hours off — every notification reaches you on your selected channels.
        </div>
      )}
    </section>
  );
}
