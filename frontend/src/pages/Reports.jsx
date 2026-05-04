import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Loader2, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const [residents, setResidents] = useState([]);
  const [reports, setReports] = useState([]);
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const [form, setForm] = useState({
    from_date: isoDate(weekAgo),
    to_date: isoDate(today),
    resident_id: "",
  });
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState(null);

  const reload = () =>
    Promise.all([
      api.get("/residents").then((r) => setResidents(r.data)),
      api.get("/reports").then((r) => setReports(r.data)),
    ]);

  useEffect(() => {
    reload();
  }, []);

  const generate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setLatest(null);
    try {
      const { data } = await api.post("/reports/generate", {
        from_date: form.from_date,
        to_date: form.to_date,
        resident_id: form.resident_id || null,
      });
      setLatest(data);
      toast.success("Report ready");
      reload();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div>
        <h1 className="font-display font-black text-4xl tracking-tighter text-stone-900">
          Manager reports
        </h1>
        <p className="text-stone-600 mt-1 max-w-2xl">
          AI-generated safeguarding summaries from your daily notes and incidents. Pick a
          period and let GPT-5.2 do the analysis for you.
        </p>
      </div>

      <form
        onSubmit={generate}
        className="bg-white border divider-soft rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end"
      >
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
            From
          </label>
          <input
            data-testid="report-from-date"
            type="date"
            required
            value={form.from_date}
            onChange={(e) => setForm({ ...form, from_date: e.target.value })}
            className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
            To
          </label>
          <input
            data-testid="report-to-date"
            type="date"
            required
            value={form.to_date}
            onChange={(e) => setForm({ ...form, to_date: e.target.value })}
            className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
            Resident
          </label>
          <select
            value={form.resident_id}
            onChange={(e) => setForm({ ...form, resident_id: e.target.value })}
            className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
          >
            <option value="">All residents</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <button
          data-testid="generate-report-btn"
          type="submit"
          disabled={busy}
          className="w-full bg-[#E57A5D] hover:bg-[#D1664A] text-white font-medium rounded-xl px-6 py-3 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Generate
        </button>
      </form>

      {latest && (
        <div
          data-testid="latest-report"
          className="bg-white border-l-4 border-l-[#E57A5D] border-y border-r divider-soft rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
        >
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#E57A5D]">
                Generated · {new Date(latest.created_at).toLocaleString("en-GB")}
              </div>
              <h3 className="font-display font-bold text-2xl text-stone-900 mt-1">
                {latest.from_date} → {latest.to_date}
              </h3>
            </div>
            <div className="text-xs text-stone-500">
              {latest.incident_count} incidents · {latest.note_count} notes
            </div>
          </div>
          <div className="prose prose-stone max-w-none text-stone-800 whitespace-pre-wrap text-sm leading-relaxed">
            {latest.summary}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-display font-bold text-lg text-stone-900">Past reports</h3>
        {reports.length === 0 && (
          <div className="text-center py-12 text-stone-500 bg-white border divider-soft rounded-2xl">
            <FileText size={28} className="mx-auto mb-3 text-stone-300" />
            No reports yet.
          </div>
        )}
        {reports.map((r) => (
          <details
            key={r.id}
            className="bg-white border divider-soft rounded-2xl group"
          >
            <summary className="cursor-pointer p-5 flex items-center justify-between gap-4 list-none">
              <div>
                <div className="font-display font-semibold text-stone-900">
                  {r.from_date} → {r.to_date}
                </div>
                <div className="text-xs text-stone-500 mt-0.5">
                  by {r.generated_by} · {r.incident_count} incidents · {r.note_count} notes
                </div>
              </div>
              <span className="text-xs text-stone-500 group-open:rotate-180 transition-transform">
                ▾
              </span>
            </summary>
            <div className="p-5 pt-0 text-sm text-stone-800 whitespace-pre-wrap leading-relaxed border-t divider-soft">
              {r.summary}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
