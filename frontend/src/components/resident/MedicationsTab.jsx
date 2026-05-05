import { useEffect, useState } from "react";
import api, { formatApiError, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatFullTimestamp } from "@/lib/format";
import {
  Pill,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS = {
  given: "#3A5A40",
  refused: "#B23A48",
  missed: "#B23A48",
  withheld: "#D4A373",
  "self-administered": "#1E4D5C",
};

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function weekAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

export default function MedicationsTab({ resident }) {
  const { user } = useAuth();
  const [meds, setMeds] = useState([]);
  const [mar, setMar] = useState({ items: [] });
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [witnessFor, setWitnessFor] = useState(null);
  const [witnessName, setWitnessName] = useState("");
  const canManage = user?.role === "manager" || user?.role === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const [m, r] = await Promise.all([
        api.get(`/residents/${resident.id}/medications`),
        api.get(`/residents/${resident.id}/mar?date=${date}`),
      ]);
      setMeds(m.data);
      setMar(r.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const sign = async (row, status) => {
    const key = `${row.medication.id}|${row.scheduled_at}`;
    setBusy(key);
    try {
      await api.post(`/medications/${row.medication.id}/administer`, {
        medication_id: row.medication.id,
        scheduled_at: row.scheduled_at,
        status,
        dose_given: row.medication.dose,
      });
      toast.success(`${row.medication.name} · ${status}`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const givePrn = async (med) => {
    setBusy(`prn-${med.id}`);
    try {
      await api.post(`/medications/${med.id}/administer`, {
        medication_id: med.id,
        scheduled_at: new Date().toISOString(),
        status: "given",
        dose_given: med.dose,
      });
      toast.success(`PRN ${med.name} given`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const downloadMar = async () => {
    const token = localStorage.getItem("cc_token");
    try {
      const res = await fetch(
        `${API}/residents/${resident.id}/mar/pdf?from_date=${weekAgoIso()}&to_date=${todayIso()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Safelyn_MAR_${resident.name.replace(/\s+/g, "_")}_${todayIso()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success("MAR PDF downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <div className="space-y-5" data-testid="medications-content">
      {/* Allergies banner */}
      {(resident.medical?.allergies || "").trim() && resident.medical.allergies !== "—" && (
        <div className="bg-[#B23A48]/8 border-l-4 border-[#B23A48] rounded-xl p-3.5 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#B23A48] shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#B23A48]">
              Allergies on file
            </div>
            <div className="text-sm font-semibold text-stone-900 mt-0.5">
              {resident.medical.allergies}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-stone-400" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="med-date-input"
            className="bg-white border divider-soft rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadMar}
            data-testid="download-mar-pdf"
            className="inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 text-stone-700 font-semibold rounded-lg px-3 py-1.5 text-xs border divider-soft"
          >
            <Download size={13} /> Weekly MAR PDF
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              data-testid="add-medication-btn"
              className="inline-flex items-center gap-1.5 bg-[#1E4D5C] hover:bg-[#163A47] text-white font-semibold rounded-lg px-3 py-1.5 text-xs"
            >
              <Plus size={13} /> Add medication
            </button>
          )}
        </div>
      </div>

      {/* Today's MAR rows */}
      {loading ? (
        <div className="text-center py-10 text-stone-500">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : (
        <div className="space-y-2.5">
          {mar.items.length === 0 && (
            <div className="text-sm text-stone-500 italic py-4 text-center">
              No medications scheduled for this date.
            </div>
          )}
          {mar.items
            .filter((r) => r.kind === "scheduled")
            .map((row) => {
              const key = `${row.medication.id}|${row.scheduled_at}`;
              const a = row.admin;
              const time = row.scheduled_at?.slice(11, 16) || "—";
              return (
                <div
                  key={key}
                  data-testid={`mar-row-${row.medication.id}-${time.replace(":", "")}`}
                  className="bg-white border divider-soft rounded-xl p-3.5 flex items-center gap-3 flex-wrap"
                >
                  <div className="font-display font-bold text-base text-[#1E4D5C] w-14 shrink-0">
                    {time}
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold text-sm text-stone-900 inline-flex items-center gap-2">
                      <Pill size={14} className="text-stone-400" />
                      {row.medication.name}
                      {row.medication.requires_witness && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#D4A373] px-1.5 py-0.5 rounded bg-[#D4A373]/10">
                          Witness req
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-500">
                      {row.medication.dose} · {row.medication.route || "Oral"}
                      {row.medication.instructions && (
                        <> · {row.medication.instructions}</>
                      )}
                    </div>
                  </div>
                  {a ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white"
                      style={{ background: STATUS_COLORS[a.status] || "#8A8A85" }}
                    >
                      <CheckCircle2 size={12} />
                      {a.status} · {a.administered_by_name?.split(" ")[0]}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => sign(row, "given")}
                        disabled={busy === key}
                        data-testid={`give-${row.medication.id}`}
                        className="bg-[#3A5A40] hover:bg-[#2C4A33] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-lg px-3.5 py-2 inline-flex items-center gap-1.5"
                      >
                        {busy === key ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        Give
                      </button>
                      <button
                        type="button"
                        onClick={() => sign(row, "refused")}
                        disabled={busy === key}
                        className="bg-white hover:bg-stone-50 text-[#B23A48] border-2 border-[#B23A48]/30 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2"
                      >
                        Refused
                      </button>
                      <button
                        type="button"
                        onClick={() => sign(row, "withheld")}
                        disabled={busy === key}
                        className="bg-white hover:bg-stone-50 text-stone-600 border-2 border-stone-200 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2"
                      >
                        Withheld
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

          {/* PRN rows */}
          {mar.items
            .filter((r) => r.kind === "prn")
            .map((row) => (
              <div
                key={`prn-${row.medication.id}`}
                data-testid={`prn-row-${row.medication.id}`}
                className="bg-[#E57A5D]/5 border-l-4 border-l-[#E57A5D] border-y border-r divider-soft rounded-xl p-3.5"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#E57A5D] bg-[#E57A5D]/15 px-2 py-1 rounded">
                    PRN
                  </span>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold text-sm text-stone-900">
                      {row.medication.name} · {row.medication.dose}
                    </div>
                    <div className="text-xs text-stone-500">
                      {row.medication.indication}
                      {row.medication.allergy_warning && (
                        <span className="text-[#B23A48] block mt-0.5">
                          ⚠ {row.medication.allergy_warning}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => givePrn(row.medication)}
                    disabled={busy === `prn-${row.medication.id}`}
                    data-testid={`prn-give-${row.medication.id}`}
                    className="bg-[#E57A5D] hover:bg-[#D1664A] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-lg px-3.5 py-2 inline-flex items-center gap-1.5"
                  >
                    {busy === `prn-${row.medication.id}` ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Plus size={12} />
                    )}
                    Log PRN dose
                  </button>
                </div>
                {row.prn_admins.length > 0 && (
                  <div className="mt-2.5 pl-4 space-y-1 text-xs text-stone-600">
                    {row.prn_admins.map((a) => (
                      <div key={a.id}>
                        ✓ {formatFullTimestamp(a.administered_at)} · {a.administered_by_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Active medication list (cards) */}
      {meds.length > 0 && (
        <details className="bg-white border divider-soft rounded-2xl group">
          <summary className="cursor-pointer px-5 py-3 list-none text-sm font-bold uppercase tracking-wider text-[#1E4D5C] flex items-center justify-between">
            <span>All active medications · {meds.length}</span>
            <span className="text-xs text-stone-400 group-open:rotate-180 transition-transform">
              ▾
            </span>
          </summary>
          <ul className="border-t divider-soft divide-y divider-soft">
            {meds.map((m) => (
              <li key={m.id} className="px-5 py-3 text-sm">
                <div className="font-semibold text-stone-900">
                  {m.name} · {m.dose}{" "}
                  {m.is_prn && (
                    <span className="text-[10px] uppercase tracking-wider text-[#E57A5D] font-bold ml-1">
                      PRN
                    </span>
                  )}
                </div>
                <div className="text-xs text-stone-500">
                  {m.is_prn
                    ? m.indication || "PRN"
                    : (m.schedule_times || []).join(", ")}
                  {m.prescriber && ` · ${m.prescriber}`}
                  {m.expiry_date && ` · expires ${m.expiry_date}`}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {showAdd && (
        <AddMedicationModal
          residentId={resident.id}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
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
              A second staff member must witness this dose.
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

function AddMedicationModal({ residentId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    dose: "",
    route: "Oral",
    schedule_times_text: "",
    is_prn: false,
    indication: "",
    instructions: "",
    prescriber: "",
    allergy_warning: "",
    requires_witness: false,
    expiry_date: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const schedule_times = form.is_prn
        ? []
        : form.schedule_times_text
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
      await api.post(`/residents/${residentId}/medications`, {
        name: form.name,
        dose: form.dose,
        route: form.route,
        schedule_times,
        is_prn: form.is_prn,
        indication: form.indication || null,
        instructions: form.instructions || null,
        prescriber: form.prescriber || null,
        allergy_warning: form.allergy_warning || null,
        requires_witness: form.requires_witness,
        expiry_date: form.expiry_date || null,
        active: true,
      });
      toast.success("Medication added");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl border divider-soft space-y-3"
        data-testid="add-medication-modal"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-xl text-stone-900">Add medication</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 hover:text-stone-900 p-1 rounded"
          >
            <X size={18} />
          </button>
        </div>
        <input
          required
          placeholder="Medication name (e.g. Sertraline)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          data-testid="med-name-input"
          className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Dose (e.g. 50mg)"
            value={form.dose}
            onChange={(e) => setForm({ ...form, dose: e.target.value })}
            data-testid="med-dose-input"
            className="bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
          />
          <select
            value={form.route}
            onChange={(e) => setForm({ ...form, route: e.target.value })}
            className="bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
          >
            <option>Oral</option>
            <option>Inhaled</option>
            <option>Topical</option>
            <option>Subcutaneous</option>
            <option>Intramuscular</option>
            <option>Other</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_prn}
            onChange={(e) => setForm({ ...form, is_prn: e.target.checked })}
            data-testid="med-prn-checkbox"
            className="accent-[#E57A5D]"
          />
          PRN (as needed)
        </label>
        {form.is_prn ? (
          <input
            placeholder="Indication (when to give PRN)"
            value={form.indication}
            onChange={(e) => setForm({ ...form, indication: e.target.value })}
            className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
          />
        ) : (
          <input
            placeholder="Schedule times (comma-separated, e.g. 08:00, 14:00, 20:00)"
            value={form.schedule_times_text}
            onChange={(e) => setForm({ ...form, schedule_times_text: e.target.value })}
            data-testid="med-schedule-input"
            className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C] font-mono text-sm"
          />
        )}
        <textarea
          rows={2}
          placeholder="Instructions (e.g. Take with food)"
          value={form.instructions}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C] resize-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Prescriber"
            value={form.prescriber}
            onChange={(e) => setForm({ ...form, prescriber: e.target.value })}
            className="bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
          />
          <input
            type="date"
            placeholder="Expiry"
            value={form.expiry_date}
            onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
            className="bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
          />
        </div>
        <input
          placeholder="Allergy warning"
          value={form.allergy_warning}
          onChange={(e) => setForm({ ...form, allergy_warning: e.target.value })}
          className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.requires_witness}
            onChange={(e) => setForm({ ...form, requires_witness: e.target.checked })}
            className="accent-[#1E4D5C]"
          />
          Requires witness signature
        </label>
        <button
          type="submit"
          disabled={busy}
          data-testid="submit-medication-btn"
          className="w-full bg-[#1E4D5C] hover:bg-[#163A47] disabled:opacity-50 text-white font-bold rounded-xl px-6 py-3 mt-2 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Save medication
        </button>
      </form>
    </div>
  );
}
