import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { API, formatApiError } from "@/lib/api";
import VoiceRecorder from "@/components/VoiceRecorder";
import SaveReceipt from "@/components/SaveReceipt";
import { formatFullTimestamp, recordRef } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ShieldAlert, Hash, Download, Eye } from "lucide-react";
import { toast } from "sonner";

const CATS = ["physical", "verbal", "self-harm", "missing", "medical", "other"];
const SEVS = [
  { v: "low", label: "Low", color: "#3A5A40" },
  { v: "medium", label: "Medium", color: "#D4A373" },
  { v: "high", label: "High", color: "#B23A48" },
];

export default function Incidents() {
  const { user } = useAuth();
  const [residents, setResidents] = useState([]);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState({ safeguarding_only: false });
  const [form, setForm] = useState({
    resident_id: "",
    category: "other",
    severity: "low",
    body: "",
    safeguarding: false,
    action_taken: "",
    voice_used: false,
  });
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const canReview = user?.role === "manager" || user?.role === "admin";

  const reload = () =>
    Promise.all([
      api.get("/residents").then((r) => setResidents(r.data)),
      api
        .get(`/incidents?safeguarding_only=${filter.safeguarding_only}`)
        .then((r) => setItems(r.data)),
    ]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.safeguarding_only]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.resident_id) return toast.error("Pick a resident");
    if (!form.body.trim()) return toast.error("Describe the incident");
    setBusy(true);
    try {
      const { data } = await api.post("/incidents", form);
      setLastSaved(data);
      toast.success("Incident saved · audit-trail recorded");
      setForm({ ...form, body: "", action_taken: "", voice_used: false });
      reload();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/incidents/${id}/status?status=${status}`);
      toast.success(`Marked ${status}`);
      reload();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const downloadPdf = async (incident, residentName) => {
    try {
      const token = localStorage.getItem("cc_token");
      const r = await fetch(`${API}/incidents/${incident.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const safeName = (residentName || "incident").replace(/\s+/g, "_");
      const shortRef = String(incident.id).replace(/-/g, "").slice(-8).toUpperCase();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Safelyn_Incident_${safeName}_${shortRef}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error("PDF download failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="incidents-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-black text-4xl tracking-tighter text-stone-900">
            Incidents
          </h1>
          <p className="text-stone-600 mt-1">
            Log clearly. Flag safeguarding. Keep everyone safe.
          </p>
        </div>
        <div className="flex items-center gap-3 ml-auto sm:ml-0">
          <Link
            to="/incidents/new"
            data-testid="quick-log-incident-btn"
            className="inline-flex items-center gap-2 bg-[#B23A48] hover:bg-[#962F3B] text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors shadow-sm"
          >
            <ShieldAlert size={16} /> Quick log
          </Link>
          <label className="flex items-center gap-2 text-sm font-medium text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              data-testid="safeguarding-only-toggle"
              checked={filter.safeguarding_only}
              onChange={(e) =>
                setFilter({ ...filter, safeguarding_only: e.target.checked })
              }
              className="w-4 h-4 accent-[#B23A48]"
            />
            Safeguarding only
          </label>
        </div>
      </div>

      {lastSaved && (
        <SaveReceipt
          record={lastSaved}
          label="Incident saved successfully"
          testid="incident-quick-save-receipt"
        />
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <form
          onSubmit={submit}
          className="lg:col-span-1 bg-white border divider-soft rounded-2xl p-6 space-y-4 h-fit lg:sticky lg:top-6"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-stone-900">
              New incident
            </h3>
            <VoiceRecorder
              size="md"
              onTranscript={(t) =>
                setForm((f) => ({
                  ...f,
                  body: (f.body ? f.body + " " : "") + t,
                  voice_used: true,
                }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
              Resident
            </label>
            <select
              data-testid="incident-resident-select"
              value={form.resident_id}
              onChange={(e) => setForm({ ...form, resident_id: e.target.value })}
              required
              className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
            >
              <option value="">Choose…</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
              Severity
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SEVS.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  onClick={() => setForm({ ...form, severity: s.v })}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors`}
                  style={
                    form.severity === s.v
                      ? { background: s.color, color: "#fff", borderColor: s.color }
                      : {}
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
              Category
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
            >
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <textarea
              data-testid="incident-body-input"
              rows={4}
              required
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="What happened?"
              className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] resize-none"
            />
          </div>

          <div>
            <textarea
              rows={2}
              value={form.action_taken}
              onChange={(e) => setForm({ ...form, action_taken: e.target.value })}
              placeholder="Action taken (optional)"
              className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] resize-none"
            />
          </div>

          <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-[#B23A48]/20 bg-[#B23A48]/5 cursor-pointer">
            <input
              type="checkbox"
              data-testid="safeguarding-flag"
              checked={form.safeguarding}
              onChange={(e) => setForm({ ...form, safeguarding: e.target.checked })}
              className="w-5 h-5 accent-[#B23A48]"
            />
            <div>
              <div className="font-semibold text-sm text-[#B23A48] flex items-center gap-1.5">
                <ShieldAlert size={14} /> Flag for safeguarding
              </div>
              <div className="text-xs text-stone-600">
                Notify managers immediately for review.
              </div>
            </div>
          </label>

          <button
            type="submit"
            disabled={busy}
            data-testid="submit-incident-btn"
            className="w-full bg-[#2D4A3E] hover:bg-[#1E332A] text-white font-medium rounded-xl px-6 py-3 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Log incident
          </button>
        </form>

        <div className="lg:col-span-2 space-y-3">
          {items.length === 0 && (
            <div className="text-center py-16 text-stone-500 bg-white border divider-soft rounded-2xl">
              <ShieldAlert size={28} className="mx-auto mb-3 text-stone-300" />
              No incidents found.
            </div>
          )}
          {items.map((i) => {
            const res = residents.find((r) => r.id === i.resident_id);
            const accent = i.safeguarding
              ? "border-l-[#B23A48]"
              : i.severity === "high"
              ? "border-l-[#B23A48]"
              : i.severity === "medium"
              ? "border-l-[#D4A373]"
              : "border-l-[#3A5A40]";
            return (
              <div
                key={i.id}
                data-testid={`incident-${i.id}`}
                className={`bg-white border-l-4 ${accent} border-y border-r divider-soft p-5 rounded-2xl`}
              >
                <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                  <div>
                    <div className="font-display font-semibold text-stone-900">
                      {res?.name || "Unknown"}
                    </div>
                    <div className="text-xs uppercase tracking-wider text-stone-500 mt-0.5 space-x-2">
                      <span>{i.category}</span>
                      <span>· {i.severity}</span>
                      {i.safeguarding && (
                        <span className="text-[#B23A48] font-bold">· safeguarding</span>
                      )}
                      {i.voice_used && <span className="text-[#E57A5D]">· voice</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        i.status === "open"
                          ? "bg-[#D4A373]/15 text-[#9C6B3D]"
                          : i.status === "reviewed"
                          ? "bg-[#3A5A40]/15 text-[#3A5A40]"
                          : "bg-stone-200 text-stone-600"
                      }`}
                    >
                      {i.status}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
                  {i.body}
                </p>
                {i.action_taken && (
                  <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                    <span className="font-semibold uppercase tracking-wider">Action: </span>
                    {i.action_taken}
                  </p>
                )}
                <div className="flex items-center justify-between mt-3 pt-3 border-t divider-soft">
                  <div className="text-xs text-stone-500 flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-stone-700">{i.author_name}</span>
                    <span>·</span>
                    <span className="font-mono">{formatFullTimestamp(i.created_at)}</span>
                    <span className="hidden sm:inline">·</span>
                    <span className="hidden sm:inline-flex items-center gap-1 font-mono uppercase tracking-wider text-stone-400">
                      <Hash size={10} />
                      ref {recordRef(i.id)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      to={`/incidents/${i.id}`}
                      data-testid={`view-incident-${i.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600 hover:text-stone-900 px-2 py-1 rounded-lg hover:bg-stone-100"
                      title="View detail"
                    >
                      <Eye size={13} />
                      <span className="hidden sm:inline">View</span>
                    </Link>
                    <button
                      type="button"
                      data-testid={`download-pdf-${i.id}`}
                      onClick={() => downloadPdf(i, res?.name)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E4D5C] hover:text-[#0F2A47] px-2 py-1 rounded-lg hover:bg-[#1E4D5C]/10"
                      title="Download PDF"
                    >
                      <Download size={13} />
                      <span className="hidden sm:inline">PDF</span>
                    </button>
                    {canReview && i.status !== "reviewed" && (
                      <button
                        data-testid={`review-${i.id}`}
                        onClick={() => updateStatus(i.id, "reviewed")}
                        className="text-xs font-semibold text-[#3A5A40] hover:text-[#2C4A33] px-2 py-1 rounded-lg hover:bg-[#3A5A40]/10"
                      >
                        Mark reviewed
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
