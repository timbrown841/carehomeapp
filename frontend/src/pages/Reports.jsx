import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { downloadReportPdf } from "@/lib/pdf";
import { formatFullTimestamp, recordRef } from "@/lib/format";
import { Loader2, Sparkles, FileText, Clock, User, Hash, ChevronDown, Download } from "lucide-react";
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
        <h1 className="font-display font-semibold text-3xl tracking-tight text-stone-900">
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
              <div className="text-xs font-semibold uppercase tracking-wider text-[#E57A5D] flex items-center gap-1.5">
                <Sparkles size={12} />
                Generated · {formatFullTimestamp(latest.created_at)}
              </div>
              <h3 className="font-display font-bold text-2xl text-stone-900 mt-1">
                {latest.from_date} → {latest.to_date}
              </h3>
              <div className="text-xs text-stone-500 mt-1 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <User size={12} /> {latest.generated_by}
                </span>
                <span className="inline-flex items-center gap-1 font-mono uppercase tracking-wider">
                  <Hash size={11} /> {recordRef(latest.id)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-xs text-stone-500">
                {latest.incident_count} incidents · {latest.note_count} notes
              </div>
              <button
                type="button"
                data-testid="download-latest-report-pdf"
                onClick={() => downloadReportPdf(latest)}
                className="inline-flex items-center gap-2 bg-[#1E4D5C] hover:bg-[#163A47] text-white font-semibold rounded-xl px-3.5 py-2 text-xs transition-colors shadow-sm"
              >
                <Download size={14} /> Download PDF
              </button>
            </div>
          </div>
          <div className="prose prose-stone max-w-none text-stone-800 whitespace-pre-wrap text-sm leading-relaxed">
            {latest.summary}
          </div>

          {(latest.records?.length || 0) > 0 && (
            <details className="mt-5 group" data-testid="latest-audit-trail">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-stone-50 border divider-soft text-sm font-semibold text-stone-700 hover:bg-stone-100">
                <span className="inline-flex items-center gap-2">
                  <Clock size={14} /> Audit trail ·{" "}
                  {latest.records.length} entries
                </span>
                <ChevronDown
                  size={14}
                  className="text-stone-400 group-open:rotate-180 transition-transform"
                />
              </summary>
              <ol className="mt-3 space-y-2">
                {latest.records.map((rec) => (
                  <li
                    key={`${rec.kind}-${rec.id}`}
                    className={`p-3 rounded-xl border-l-4 border-y border-r divider-soft bg-stone-50/60 ${
                      rec.kind === "incident"
                        ? rec.safeguarding
                          ? "border-l-[#B23A48]"
                          : "border-l-[#D4A373]"
                        : "border-l-[#3A5A40]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        {rec.kind === "incident" ? "Incident" : "Note"} ·{" "}
                        {rec.resident_name}
                        {rec.kind === "incident" && (
                          <>
                            {" "}
                            · {rec.severity}
                            {rec.safeguarding && (
                              <span className="text-[#B23A48]"> · safeguarding</span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="text-[10px] text-stone-500 font-mono">
                        {formatFullTimestamp(rec.created_at)}
                      </div>
                    </div>
                    <div className="text-sm text-stone-800 leading-snug line-clamp-2">
                      {rec.body}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-stone-500">
                      <span className="font-medium text-stone-700">
                        {rec.author_name}
                      </span>
                      <span className="font-mono uppercase tracking-wider text-stone-400">
                        ref {recordRef(rec.id)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}
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
              <div className="min-w-0">
                <div className="font-display font-semibold text-stone-900">
                  {r.from_date} → {r.to_date}
                </div>
                <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <User size={11} />
                    {r.generated_by}
                  </span>
                  <span>·</span>
                  <span className="font-mono">
                    {formatFullTimestamp(r.created_at)}
                  </span>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden sm:inline">
                    {r.incident_count} incidents · {r.note_count} notes
                  </span>
                </div>
              </div>
              <ChevronDown
                size={16}
                className="text-stone-400 group-open:rotate-180 transition-transform shrink-0"
              />
            </summary>
            <div className="p-5 pt-0 text-sm text-stone-800 whitespace-pre-wrap leading-relaxed border-t divider-soft">
              <div className="flex justify-end mb-3 not-prose">
                <button
                  type="button"
                  data-testid={`download-report-pdf-${r.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    downloadReportPdf(r);
                  }}
                  className="inline-flex items-center gap-2 bg-[#1E4D5C] hover:bg-[#163A47] text-white font-semibold rounded-lg px-3 py-1.5 text-xs transition-colors"
                >
                  <Download size={12} /> Download PDF
                </button>
              </div>
              {r.summary}
              {(r.records?.length || 0) > 0 && (
                <ol className="mt-4 space-y-2">
                  {r.records.map((rec) => (
                    <li
                      key={`${rec.kind}-${rec.id}`}
                      className={`p-3 rounded-xl border-l-4 border-y border-r divider-soft bg-stone-50/60 not-prose ${
                        rec.kind === "incident"
                          ? rec.safeguarding
                            ? "border-l-[#B23A48]"
                            : "border-l-[#D4A373]"
                          : "border-l-[#3A5A40]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                          {rec.kind} · {rec.resident_name}
                        </div>
                        <div className="text-[10px] text-stone-500 font-mono">
                          {formatFullTimestamp(rec.created_at)}
                        </div>
                      </div>
                      <div className="text-sm leading-snug line-clamp-2">
                        {rec.body}
                      </div>
                      <div className="mt-1 text-[10px] text-stone-500 flex gap-2">
                        <span className="font-medium text-stone-700">
                          {rec.author_name}
                        </span>
                        <span className="font-mono uppercase tracking-wider text-stone-400">
                          ref {recordRef(rec.id)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
