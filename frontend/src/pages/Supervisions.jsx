import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatFullTimestamp } from "@/lib/format";
import {
  ClipboardCheck,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";

const KINDS = [
  { v: "supervision", label: "Supervision", desc: "1:1 every 30 days", color: "#1E4D5C" },
  { v: "appraisal", label: "Appraisal", desc: "Annual review", color: "#0F2A47" },
];

export default function Supervisions() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({
    staff_id: "",
    kind: "supervision",
    completed_at: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const canManage = user?.role === "manager" || user?.role === "admin";

  const reload = async () => {
    try {
      const [{ data: list }, { data: users }] = await Promise.all([
        api.get("/supervisions"),
        api.get("/auth/users"),
      ]);
      setItems(list);
      setStaff(users.filter((u) => u.role !== "admin"));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.staff_id) return toast.error("Pick a staff member");
    setBusy(true);
    try {
      await api.post("/supervisions", form);
      toast.success("Supervision logged");
      setOpen(false);
      setForm({ ...form, notes: "" });
      reload();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this record?")) return;
    try {
      await api.delete(`/supervisions/${id}`);
      reload();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const visible = items.filter((i) => filter === "all" || i.kind === filter);

  // Per-staff status (next due, last completed)
  const staffStatus = staff.map((u) => {
    const recs = items
      .filter((i) => i.staff_id === u.id)
      .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1));
    const lastSup = recs.find((r) => r.kind === "supervision");
    const lastApp = recs.find((r) => r.kind === "appraisal");
    const supDays = lastSup
      ? Math.floor(
          (Date.now() - new Date(lastSup.completed_at).getTime()) / 86400000
        )
      : null;
    const appDays = lastApp
      ? Math.floor(
          (Date.now() - new Date(lastApp.completed_at).getTime()) / 86400000
        )
      : null;
    return { u, lastSup, lastApp, supDays, appDays };
  });

  const supDue = staffStatus.filter((s) => s.supDays === null || s.supDays > 30).length;
  const appOverdue = staffStatus.filter(
    (s) => s.appDays === null || s.appDays > 365
  ).length;

  return (
    <div className="space-y-6" data-testid="supervisions-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display font-black text-4xl tracking-tighter text-stone-900">
            Supervisions &amp; Appraisals
          </h1>
          <p className="text-stone-600 mt-1">
            Log 1:1 supervisions and annual appraisals to keep compliance current.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="add-supervision-btn"
            className="inline-flex items-center gap-2 bg-[#1E4D5C] hover:bg-[#163A47] text-white font-medium rounded-xl px-5 py-3 transition-colors"
          >
            <Plus size={18} /> Log session
          </button>
        )}
      </div>

      {/* Compliance overview */}
      <section className="grid sm:grid-cols-2 gap-3">
        <div
          className={`p-4 rounded-2xl border-l-4 border-y border-r divider-soft ${
            supDue > 0 ? "bg-[#D4A373]/10 border-l-[#D4A373]" : "bg-[#3A5A40]/8 border-l-[#3A5A40]"
          }`}
          data-testid="overview-supervisions-due"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                supDue > 0
                  ? "bg-[#D4A373]/25 text-[#9C6B3D]"
                  : "bg-[#3A5A40]/20 text-[#3A5A40]"
              }`}
            >
              <ClipboardCheck size={18} />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-2xl text-stone-900">
                {supDue}
              </div>
              <div className="text-xs uppercase tracking-wider text-stone-500">
                Supervisions due (>30 days)
              </div>
            </div>
          </div>
        </div>
        <div
          className={`p-4 rounded-2xl border-l-4 border-y border-r divider-soft ${
            appOverdue > 0 ? "bg-[#B23A48]/8 border-l-[#B23A48]" : "bg-[#3A5A40]/8 border-l-[#3A5A40]"
          }`}
          data-testid="overview-appraisals-overdue"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                appOverdue > 0
                  ? "bg-[#B23A48]/15 text-[#B23A48]"
                  : "bg-[#3A5A40]/20 text-[#3A5A40]"
              }`}
            >
              <BadgeCheck size={18} />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-2xl text-stone-900">
                {appOverdue}
              </div>
              <div className="text-xs uppercase tracking-wider text-stone-500">
                Appraisals overdue (>365 days)
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Per-staff status */}
      <section className="bg-white border divider-soft rounded-2xl">
        <div className="px-5 py-4 border-b divider-soft">
          <h3 className="font-display font-bold text-base text-stone-900">
            Staff status
          </h3>
        </div>
        {staffStatus.length === 0 ? (
          <div className="text-center text-sm text-stone-500 py-8">No staff users.</div>
        ) : (
          <ul className="divide-y divider-soft">
            {staffStatus.map(({ u, lastSup, lastApp, supDays, appDays }) => (
              <li
                key={u.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
              >
                <div className="flex-1">
                  <div className="font-display font-semibold text-stone-900">
                    {u.name}
                  </div>
                  <div className="text-xs text-stone-500 capitalize">{u.role}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${
                      supDays === null
                        ? "bg-[#B23A48]/12 text-[#B23A48]"
                        : supDays > 30
                        ? "bg-[#D4A373]/20 text-[#9C6B3D]"
                        : "bg-[#3A5A40]/12 text-[#3A5A40]"
                    }`}
                  >
                    {supDays === null ? (
                      <>
                        <AlertTriangle size={11} /> No supervision
                      </>
                    ) : supDays > 30 ? (
                      <>
                        <Clock size={11} /> Sup {supDays}d
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={11} /> Sup {supDays}d ago
                      </>
                    )}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${
                      appDays === null
                        ? "bg-[#B23A48]/12 text-[#B23A48]"
                        : appDays > 365
                        ? "bg-[#B23A48]/12 text-[#B23A48]"
                        : "bg-[#3A5A40]/12 text-[#3A5A40]"
                    }`}
                  >
                    {appDays === null ? (
                      <>
                        <AlertTriangle size={11} /> No appraisal
                      </>
                    ) : appDays > 365 ? (
                      <>
                        <Clock size={11} /> App overdue
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={11} /> App {appDays}d ago
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* History */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-base text-stone-900">
            History
          </h3>
          <div className="flex items-center gap-1 bg-white border divider-soft rounded-lg p-0.5">
            {["all", "supervision", "appraisal"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md ${
                  filter === f ? "bg-[#1E4D5C] text-white" : "text-stone-600"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {visible.length === 0 && (
            <div className="text-center py-12 text-stone-500 bg-white border divider-soft rounded-2xl">
              No records yet.
            </div>
          )}
          {visible.map((it) => {
            const staffName = staff.find((s) => s.id === it.staff_id)?.name || "—";
            const k = KINDS.find((k) => k.v === it.kind);
            return (
              <div
                key={it.id}
                data-testid={`supervision-${it.id}`}
                className="bg-white border divider-soft rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap"
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    {k?.label || it.kind}
                  </div>
                  <div className="font-display font-semibold text-stone-900 mt-0.5">
                    {staffName}
                  </div>
                  {it.notes && (
                    <div className="text-xs text-stone-600 mt-1 max-w-md line-clamp-2">
                      {it.notes}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-stone-500">
                  <span className="font-mono">
                    {formatFullTimestamp(it.completed_at)}
                  </span>
                  <span className="font-medium text-stone-700">
                    by {it.created_by_name}
                  </span>
                  {canManage && (
                    <button
                      onClick={() => remove(it.id)}
                      className="text-stone-400 hover:text-[#B23A48]"
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border divider-soft shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-xl text-stone-900">
                Log session
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-stone-500 hover:text-stone-900 p-1 rounded-lg hover:bg-stone-100"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
                  Staff
                </label>
                <select
                  required
                  value={form.staff_id}
                  onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
                  className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
                >
                  <option value="">Choose…</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.role}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
                  Kind
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.v}
                      type="button"
                      onClick={() => setForm({ ...form, kind: k.v })}
                      className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border-2 text-left transition-colors"
                      style={
                        form.kind === k.v
                          ? { background: k.color, color: "#fff", borderColor: k.color }
                          : { background: "#fff", borderColor: "#d6d6d0", color: "#1c1c1a" }
                      }
                    >
                      <span className="font-bold text-sm">{k.label}</span>
                      <span
                        className="text-[10px]"
                        style={{ color: form.kind === k.v ? "#ffffffcc" : "#8a8a85" }}
                      >
                        {k.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
                  Completed
                </label>
                <input
                  type="date"
                  required
                  value={form.completed_at}
                  onChange={(e) => setForm({ ...form, completed_at: e.target.value })}
                  className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
                  Notes (optional)
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Discussion points, development goals…"
                  className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C] resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                data-testid="submit-supervision-btn"
                className="w-full bg-[#1E4D5C] hover:bg-[#163A47] text-white font-semibold rounded-xl px-6 py-3 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                Save record
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
