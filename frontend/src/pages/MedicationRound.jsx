import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Pill,
  Loader2,
  Calendar,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

const STATUS_COLORS = {
  given: "#3A5A40",
  refused: "#B23A48",
  missed: "#B23A48",
  withheld: "#D4A373",
  "self-administered": "#1E4D5C",
};

export default function MedicationRound() {
  const { user } = useAuth();
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState({ items: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [witnessFor, setWitnessFor] = useState(null);
  const [witnessName, setWitnessName] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get(`/medications/round?date=${date}`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Failed to load round"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const sign = async (row, status, witness = null) => {
    if (status === "given" && row.medication.requires_witness && !witness) {
      setWitnessFor(row);
      return;
    }
    const key = `${row.medication.id}|${row.scheduled_at}`;
    setBusy(key);
    try {
      await api.post(`/medications/${row.medication.id}/administer`, {
        medication_id: row.medication.id,
        scheduled_at: row.scheduled_at,
        status,
        dose_given: row.medication.dose,
        witness_name: witness || undefined,
      });
      toast.success(`${row.medication.name} · ${status}`);
      setWitnessFor(null);
      setWitnessName("");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(null);
    }
  };

  // Group by time slot
  const byTime = {};
  for (const r of data.items || []) {
    byTime[r.time] = byTime[r.time] || [];
    byTime[r.time].push(r);
  }
  const times = Object.keys(byTime).sort();
  const total = data.items?.length || 0;
  const signedCount = (data.items || []).filter((r) => r.admin).length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="medication-round-page">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Medications
          </div>
          <h1 className="font-display font-semibold text-3xl tracking-tight text-stone-900">
            Medication Round
          </h1>
          <p className="text-stone-600 mt-1 text-sm">
            All scheduled doses across the home for the day. One tap to sign.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-stone-400" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="round-date-input"
            className="bg-white border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
          />
        </div>
      </header>

      <div className="bg-white border divider-soft rounded-2xl p-5 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Doses signed today
          </div>
          <div className="font-display font-black text-3xl mt-1">
            <span className="text-[#1E4D5C]">{signedCount}</span>
            <span className="text-stone-300"> / {total}</span>
          </div>
        </div>
        <div className="flex-[2] min-w-[200px] h-3 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#3A5A40] transition-all"
            style={{ width: total ? `${(signedCount / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-stone-500">
          <Loader2 className="animate-spin inline" /> Loading…
        </div>
      ) : times.length === 0 ? (
        <div className="bg-white border divider-soft rounded-2xl p-10 text-center text-stone-500">
          <Pill size={32} className="mx-auto text-stone-300 mb-3" />
          <p className="text-sm">No scheduled doses on this day.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {times.map((t) => (
            <section
              key={t}
              data-testid={`round-slot-${t.replace(":", "")}`}
              className="bg-white border divider-soft rounded-2xl overflow-hidden"
            >
              <header className="flex items-center justify-between px-5 py-3 bg-stone-50 border-b divider-soft">
                <div className="flex items-center gap-2.5">
                  <Clock size={16} className="text-[#1E4D5C]" />
                  <span className="font-display font-bold text-lg text-stone-900">
                    {t}
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  {byTime[t].length} dose{byTime[t].length === 1 ? "" : "s"}
                </span>
              </header>
              <ul className="divide-y divider-soft">
                {byTime[t].map((row) => {
                  const key = `${row.medication.id}|${row.scheduled_at}`;
                  const a = row.admin;
                  return (
                    <li
                      key={key}
                      className="px-5 py-3.5 flex items-center gap-3 flex-wrap"
                      data-testid={`round-row-${row.medication.id}`}
                    >
                      <div className="flex-1 min-w-[200px]">
                        <Link
                          to={`/residents/${row.resident_id}`}
                          className="font-semibold text-sm text-stone-900 hover:text-[#1E4D5C]"
                        >
                          {row.resident_name}
                        </Link>
                        <div className="text-xs text-stone-500 truncate">
                          {row.medication.name} · {row.medication.dose}
                          {row.medication.requires_witness && (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[#D4A373]">
                              · Witness req
                            </span>
                          )}
                        </div>
                        {row.medication.allergy_warning && (
                          <div className="text-[11px] text-[#B23A48] inline-flex items-center gap-1 mt-0.5">
                            <AlertCircle size={10} /> {row.medication.allergy_warning}
                          </div>
                        )}
                      </div>
                      {a ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white"
                          style={{ background: STATUS_COLORS[a.status] || "#8A8A85" }}
                          data-testid={`round-status-${row.medication.id}`}
                        >
                          <CheckCircle2 size={12} />
                          {a.status}
                          <span className="font-medium opacity-90 ml-1 normal-case">
                            · {a.administered_by_name}
                          </span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => sign(row, "given")}
                            disabled={busy === key}
                            data-testid={`sign-given-${row.medication.id}`}
                            className="bg-[#3A5A40] hover:bg-[#2C4A33] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-lg px-3.5 py-2 inline-flex items-center gap-1.5"
                          >
                            {busy === key ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={12} />
                            )}
                            Given
                          </button>
                          <button
                            type="button"
                            onClick={() => sign(row, "refused")}
                            disabled={busy === key}
                            data-testid={`sign-refused-${row.medication.id}`}
                            className="bg-white hover:bg-stone-50 text-[#B23A48] border-2 border-[#B23A48]/30 hover:border-[#B23A48]/60 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2"
                          >
                            Refused
                          </button>
                          <button
                            type="button"
                            onClick={() => sign(row, "withheld")}
                            disabled={busy === key}
                            className="bg-white hover:bg-stone-50 text-stone-600 border-2 border-stone-200 hover:border-stone-400 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2"
                          >
                            Withheld
                          </button>
                        </div>
                      )}
                      <Link
                        to={`/residents/${row.resident_id}`}
                        className="text-stone-300 hover:text-[#1E4D5C]"
                      >
                        <ChevronRight size={16} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {witnessFor && (
        <div
          className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setWitnessFor(null)}
          data-testid="witness-modal"
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border divider-soft space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#D4A373]">
              Witness signature required
            </div>
            <h3 className="font-display font-bold text-lg text-stone-900">
              {witnessFor.medication.name} · {witnessFor.medication.dose}
            </h3>
            <p className="text-sm text-stone-600">
              For <b>{witnessFor.resident_name}</b>. A second member of staff must witness this dose.
            </p>
            <input
              autoFocus
              data-testid="witness-name-input"
              placeholder="Witness staff name"
              value={witnessName}
              onChange={(e) => setWitnessName(e.target.value)}
              className="w-full bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A373]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setWitnessFor(null)}
                className="flex-1 bg-white hover:bg-stone-50 text-stone-700 font-semibold rounded-xl px-4 py-2.5 text-sm border divider-soft"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!witnessName.trim()}
                onClick={() => sign(witnessFor, "given", witnessName.trim())}
                data-testid="witness-confirm-btn"
                className="flex-1 bg-[#3A5A40] hover:bg-[#2C4A33] disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2.5 text-sm"
              >
                Sign as given
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
