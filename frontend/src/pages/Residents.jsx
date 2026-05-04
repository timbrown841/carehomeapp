import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { personaColor, personaInitials } from "@/lib/persona";
import { Plus, X, User, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Residents() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", dob: "", room: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const canManage = user?.role === "manager" || user?.role === "admin";

  const load = () => api.get("/residents").then((r) => setList(r.data));
  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/residents", form);
      setOpen(false);
      setForm({ name: "", dob: "", room: "", notes: "" });
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
          <h1 className="font-display font-black text-4xl tracking-tighter text-stone-900">
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
          return (
          <div
            key={r.id}
            data-testid={`resident-card-${r.id}`}
            className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5 hover:shadow-sm transition-shadow"
            style={{ borderLeftColor: persona.hex }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-base"
                style={{ background: persona.soft, color: persona.on }}
              >
                {personaInitials(r.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-lg text-stone-900 truncate">
                  {r.name}
                </div>
                <div className="text-xs text-stone-500 space-x-2">
                  {r.room && <span>Room {r.room}</span>}
                  {r.dob && <span>· DOB {r.dob}</span>}
                </div>
              </div>
            </div>
            {r.notes && (
              <p className="text-sm text-stone-700 mt-4 leading-relaxed line-clamp-3">
                {r.notes}
              </p>
            )}
          </div>
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
