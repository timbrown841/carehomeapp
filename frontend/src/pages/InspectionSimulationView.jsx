import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Sparkles, ShieldAlert, AlertTriangle, BadgeCheck, ListChecks,
  Loader2, Download, FileText, RefreshCw, ChevronDown, Scale,
} from "lucide-react";

const RAG = {
  green: { bg: "#2F6A3A12", fg: "#2F6A3A", line: "#2F6A3A" },
  amber: { bg: "#B8772F14", fg: "#B8772F", line: "#B8772F" },
  red:   { bg: "#A8273A12", fg: "#A8273A", line: "#A8273A" },
};

const SEV = {
  high:   { bg: "#A8273A14", fg: "#A8273A", label: "HIGH" },
  medium: { bg: "#B8772F18", fg: "#B8772F", label: "MEDIUM" },
  low:    { bg: "#0e3b4a14", fg: "#0e3b4a", label: "LOW" },
};

function tone(rag) { return RAG[rag] || RAG.amber; }

export default function InspectionSimulationView({ onAutoDraftReady }) {
  const { tier } = useAuth();
  const [sim, setSim] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/ofsted/inspection-simulation");
      setSim(r.data);
    } catch (e) {
      if (e?.response?.status !== 403) toast.error("Couldn't load simulation");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const downloadScan = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("cc_token");
      const res = await fetch(`${API}/ofsted/pre-inspection-scan.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pre-inspection-scan.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Couldn't download (manager+ only)"); }
    finally { setDownloading(false); }
  };

  const fetchAutoDraft = async () => {
    setDrafting(true);
    try {
      const r = await api.get("/ofsted/regulation-44/auto-draft");
      onAutoDraftReady?.(r.data);
      toast.success("Reg 44 draft generated from live data — review &amp; edit before signing off.");
    } catch { toast.error("Couldn't generate auto-draft"); }
    finally { setDrafting(false); }
  };

  if (loading || !sim) {
    return (
      <div className="flex items-center gap-2 text-stone-600 py-12 justify-center">
        <Loader2 size={18} className="animate-spin" /> Running inspection simulation…
      </div>
    );
  }

  const pred = sim.predicted_rating || {};
  const predTone = tone(pred.tone);
  const summary = sim.module_summary || {};

  return (
    <div className="space-y-5" data-testid="inspection-simulation-view">
      {/* Header / predicted rating banner */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: `linear-gradient(135deg, #0F2A47 0%, ${predTone.line} 100%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Scale size={14} />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
                Inspection simulation · deterministic
              </span>
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl font-semibold">{sim.overall_score}%</span>
              <span className="text-lg font-medium" data-testid="predicted-rating-label">
                Likely: {pred.label}
              </span>
            </div>
            <p className="text-xs text-white/80 mt-2 max-w-md">
              {summary.green} green · {summary.amber} amber ·{" "}
              <span className="font-semibold">{summary.red} red</span> across {summary.total} modules.
              No AI inference — every finding traces back to live data.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={load}
              data-testid="sim-refresh"
              className="text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-2 rounded-lg flex items-center gap-1.5 backdrop-blur"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            {tier >= 3 && (
              <button
                type="button"
                onClick={downloadScan}
                disabled={downloading}
                data-testid="sim-download-pdf"
                className="text-xs font-semibold bg-white text-[#0F2A47] hover:bg-stone-100 px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Pre-inspection scan PDF
              </button>
            )}
            {tier >= 3 && (
              <button
                type="button"
                onClick={fetchAutoDraft}
                disabled={drafting}
                data-testid="sim-auto-draft"
                className="text-xs font-semibold bg-[#B8772F] text-white hover:bg-[#a16826] px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                {drafting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Auto-draft Reg 44 visit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quality standards judgement strip */}
      <div className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Scale size={14} className="text-stone-700" />
          <h3 className="font-semibold text-[#0F1115] text-sm">Predicted Quality Standards judgement</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {sim.quality_standards_judgement.map((q) => {
            const rag = q.score >= 70 ? "green" : q.score >= 55 ? "amber" : "red";
            const t = tone(rag);
            return (
              <div
                key={q.key}
                className="border-l-4 rounded-lg p-2.5"
                style={{ borderLeftColor: t.line, background: t.bg }}
                data-testid={`qs-${q.key}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: t.fg }}>{q.key}</span>
                  <span className="text-xs font-semibold">{q.score}%</span>
                </div>
                <div className="text-xs text-stone-800 leading-tight mt-0.5">{q.title}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: t.fg }}>
                  {q.judgement}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-column: Strengths vs Weaknesses */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SimList
          title="Likely strengths"
          icon={BadgeCheck}
          colour="#2F6A3A"
          empty="No clear strengths yet — focus on building green modules."
          items={sim.likely_strengths}
          testid="strengths"
          renderItem={(s) => (
            <>
              <div className="text-sm font-semibold text-[#0F1115]">{s.title}</div>
              <div className="text-xs text-stone-600 mt-0.5">{s.evidence}</div>
            </>
          )}
        />
        <SimList
          title="Likely weaknesses"
          icon={AlertTriangle}
          colour="#A8273A"
          empty="No red or amber modules — strong baseline."
          items={sim.likely_weaknesses}
          testid="weaknesses"
          renderItem={(w) => (
            <>
              <div className="text-sm font-semibold text-[#0F1115]">{w.title}</div>
              <div className="text-xs text-stone-600 mt-0.5">{w.evidence}</div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {(w.regulation_refs || []).slice(0, 2).map((r, idx) => (
                  <span key={idx} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#0e3b4a]/8 text-[#0e3b4a]">
                    {r}
                  </span>
                ))}
                {(w.quality_standards || []).map((qs) => (
                  <span key={qs} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-stone-300 text-stone-600">
                    {qs}
                  </span>
                ))}
              </div>
            </>
          )}
        />
      </div>

      {/* Inspection concerns — what they'll ask */}
      <div className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5"
        style={{ borderLeftColor: "#0F2A47" }} data-testid="inspection-concerns">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert size={15} className="text-[#0F2A47]" />
          <h3 className="font-semibold text-[#0F1115] text-sm">
            Likely inspection concerns &amp; the questions you'll be asked
          </h3>
        </div>
        {sim.likely_inspection_concerns.length === 0 ? (
          <p className="text-sm text-stone-600">No active inspection concerns detected.</p>
        ) : (
          <ul className="space-y-2.5">
            {sim.likely_inspection_concerns.map((c, idx) => {
              const s = SEV[c.severity] || SEV.medium;
              return (
                <li key={idx} className="border-l-4 rounded-lg p-2.5 bg-stone-50"
                  style={{ borderLeftColor: s.fg }} data-testid={`concern-${idx}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                    <span className="text-sm font-semibold text-[#0F1115]">{c.title}</span>
                  </div>
                  <div className="text-xs text-stone-700 italic">
                    <span className="font-semibold">Inspector probe:</span> {c.probe}
                  </div>
                  <div className="text-xs text-stone-500 mt-1">Evidence: {c.evidence}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Recommendations */}
      <div className="bg-white border divider-soft rounded-2xl p-5" data-testid="sim-recommendations">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks size={15} />
          <h3 className="font-semibold text-[#0F1115] text-sm">Prioritised recommendations</h3>
        </div>
        {sim.recommendations.length === 0 ? (
          <p className="text-sm text-stone-600">No critical recommendations — maintain current trajectory.</p>
        ) : (
          <ol className="space-y-3">
            {sim.recommendations.map((r, idx) => {
              const isP0 = r.priority === "P0";
              const t = tone(isP0 ? "red" : "amber");
              return (
                <li key={idx} className="border-l-4 rounded-lg p-3 bg-stone-50"
                  style={{ borderLeftColor: t.line }} data-testid={`rec-${idx}`}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: t.bg, color: t.fg }}>{r.priority}</span>
                    <span className="text-sm font-semibold text-[#0F1115]">{r.title}</span>
                  </div>
                  <div className="text-xs text-stone-700 italic">{r.rationale}</div>
                  {(r.concrete_steps || []).length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {r.concrete_steps.slice(0, 3).map((s, i) => (
                        <li key={i} className="text-xs text-stone-800 flex items-start gap-1.5">
                          <span className="text-stone-400 mt-0.5">→</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(r.regulation_refs || []).slice(0, 2).map((reg, i) => (
                      <span key={i} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#0e3b4a]/8 text-[#0e3b4a]">
                        {reg}
                      </span>
                    ))}
                    {(r.quality_standards || []).map((qs) => (
                      <span key={qs} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-stone-300 text-stone-600">
                        {qs}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="text-[10px] text-stone-500 italic text-center">
        This simulation is deterministic — same data in, same findings out. No AI inference.
      </p>
    </div>
  );
}

function SimList({ title, icon: Icon, colour, items, empty, testid, renderItem }) {
  return (
    <div className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5" style={{ borderLeftColor: colour }} data-testid={`sim-${testid}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} style={{ color: colour }} />
        <h3 className="font-semibold text-[#0F1115] text-sm">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-stone-600">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((it, idx) => (
            <li key={idx} className="border-l-2 pl-2.5 py-0.5" style={{ borderLeftColor: colour + "55" }}>
              {renderItem(it)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
