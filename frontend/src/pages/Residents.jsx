import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { personaColor, personaInitials } from "@/lib/persona";
import { Plus, X, Loader2, ChevronRight, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import ResidentBadges from "@/components/ResidentBadges";
import ServiceBadge from "@/components/ServiceBadge";

const RISK_LABEL = {
  high: { bg: "#B23A48", label: "HIGH" },
  medium: { bg: "#D4A373", label: "MED" },
  low: { bg: "#3A5A40", label: "LOW" },
};

export default function Residents({ sector }) {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const defaultServiceType = sector === "adult" ? "adult_supported_living" : "children";
  const [form, setForm] = useState({ name: "", dob: "", room: "", notes: "", service_type: defaultServiceType });
  const [busy, setBusy] = useState(false);
  const canManage = user?.role === "manager" || user?.role === "admin";

  const load = () =>
    api.get("/residents", { params: sector ? { sector } : {} }).then((r) => setList(r.data));
  useEffect(() => {
    load();
  }, [sector]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/residents", form);
      setOpen(false);
      setForm({ name: "", dob: "", room: "", notes: "", service_type: defaultServiceType });
      toast.success("Resident added");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="residents-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-semibold text-3xl tracking-tight text-stone-900">
            Residents
          </h1>
          <p className="text-stone-600 mt-1">
            Children and young people in your care.
          </p>
        </div>
        {canManage && (
          <button
            data-testid="add-resident-btn"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 bg-[#2D4A3E] hover:bg-[#1E332A] text-white font-medium rounded-xl px-5 py-3 transition-colors"
          >
            <Plus size={18} /> Add resident
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.length === 0 && (
          <div className="col-span-full text-center py-16 text-stone-500 bg-white border divider-soft rounded-2xl">
            No residents yet.
          </div>
        )}
        {list.map((r) => {
          const persona = personaColor(r.name);
          const risk = RISK_LABEL[(r.risk_level || "medium").toLowerCase()] || RISK_LABEL.medium;
          return (
          <Link
            key={r.id}
            to={`/residents/${r.id}`}
            data-testid={`resident-card-${r.id}`}
            className="group bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all block"
            style={{ borderLeftColor: persona.hex }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-base shrink-0"
                style={{ background: persona.soft, color: persona.on }}
              >
                {personaInitials(r.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    data-testid={`risk-pill-${(r.risk_level || "medium").toLowerCase()}`}
                    className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: risk.bg }}
                  >
                    {risk.label}
                  </span>
                  {r.legal_status && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-stone-500 truncate">
                      {r.legal_status}
                    </span>
                  )}
                </div>
                <div className="font-display font-bold text-lg text-stone-900 truncate mt-0.5 group-hover:text-[#1E4D5C] transition-colors">
                  {r.name}
                </div>
                <div className="text-xs text-stone-500 space-x-2">
                  {r.preferred_name && r.preferred_name !== r.name && (
                    <span>"{r.preferred_name}"</span>
                  )}
                  {r.dob && <span>· DOB {r.dob}</span>}
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-stone-300 group-hover:text-[#1E4D5C] transition-colors mt-1 shrink-0"
              />
            </div>
            {(r.placement_summary || r.notes) && (
              <p className="text-sm text-stone-700 mt-4 leading-relaxed line-clamp-2">
                {r.placement_summary || r.notes}
              </p>
            )}
            <div className="mt-3">
              <ResidentBadges residentId={r.id} max={3} />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-stone-400 mt-3 inline-flex items-center gap-1">
              <ShieldAlert size={11} /> Open profile · risk · missing pack
            </div>
            <div className="mt-2">
              <ServiceBadge serviceType={r.service_type} />
            </div>
          </Link>
        );})}
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border divider-soft shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-xl text-stone-900">
                Add resident
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-stone-500 hover:text-stone-900 p-1 rounded-lg hover:bg-stone-100"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <select
                value={form.service_type}
                onChange={(e) => setForm({ ...form, service_type: e.target.value })}
                data-testid="resident-service-type"
                className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
              >
                {sector !== "adult" && <option value="children">Children's Services</option>}
                {sector !== "children" && <option value="adult_supported_living">Adult Supported Living</option>}
                {sector !== "children" && <option value="elderly_residential">Elderly Residential</option>}
                {sector !== "children" && <option value="dementia">Dementia Care</option>}
                {sector !== "children" && <option value="mental_health">Mental Health Services</option>}
                {sector !== "children" && <option value="veteran">Veteran / Ex-Military</option>}
              </select>
              <input
                data-testid="resident-name-input"
                required
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  placeholder="DOB"
                  value={form.dob}
                  onChange={(e) => setForm({ ...form, dob: e.target.value })}
                  className="bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
                />
                <input
                  placeholder="Room"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  className="bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
                />
              </div>
              <textarea
                rows={3}
                placeholder="Background notes (optional)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] resize-none"
              />
              <button
                type="submit"
                disabled={busy}
                data-testid="submit-resident-btn"
                className="w-full bg-[#2D4A3E] hover:bg-[#1E332A] text-white font-medium rounded-xl px-6 py-3 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                Save resident
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
