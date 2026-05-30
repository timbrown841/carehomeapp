/* Phase H.2 — Compact Inspection Ready widget for the manager dashboard.
 *
 * One-glance readiness score with the 5 pillars + a one-click evidence pack
 * download. Tier ≥ 3 only — hides itself otherwise.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, FileDown, ChevronRight, Loader2,
} from "lucide-react";

const RAG = {
  red:   { bg: "#FBE3E7", fg: "#7a1a28", line: "#A8273A" },
  amber: { bg: "#FCEFD4", fg: "#7a4d12", line: "#B8772F" },
  green: { bg: "#E7F3EC", fg: "#1f4f2b", line: "#2F6A3A" },
};

function bandFor(pct) {
  if (pct >= 85) return "green";
  if (pct >= 65) return "amber";
  return "red";
}

export default function InspectionReadyWidget() {
  const { isManagerOrAbove } = useAuth();
  const { effectiveMode } = useOrg();
  const [data, setData] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isManagerOrAbove) return;
    const sector = effectiveMode === "adult" ? "adult" : "children";
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/inspection-readiness/score?sector=${sector}`);
        if (!cancelled) setData(r.data);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [isManagerOrAbove, effectiveMode]);

  if (!isManagerOrAbove || !data) return null;

  const sector = effectiveMode === "adult" ? "adult" : "children";
  const overall = RAG[data.rag_status] || RAG.amber;

  const download = async () => {
    setDownloading(true);
    try {
      const r = await api.get(`/inspection-readiness/evidence-pack.pdf?sector=${sector}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inspection-evidence-pack-${sector}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Inspection evidence pack downloaded.");
    } catch { toast.error("Could not generate evidence pack."); }
    finally { setDownloading(false); }
  };

  return (
    <section
      className="bg-white border-2 rounded-2xl p-5"
      style={{ borderColor: overall.line }}
      data-testid="inspection-ready-widget"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="flex items-center gap-2 text-[#0e3b4a]">
            <ShieldCheck size={14} />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
              Inspection Ready · {sector === "adult" ? "Adult Services" : "Children's Services"}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="font-display font-bold text-4xl" style={{ color: overall.fg }}
                  data-testid="ready-widget-score">
              {data.overall_score}
            </span>
            <span className="text-stone-400 text-sm">/ 100</span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ml-2"
                  style={{ background: overall.bg, color: overall.fg }}>
              {data.rag_status}
            </span>
          </div>
          <div className="text-[12px] text-stone-500 mt-0.5">
            5-pillar deterministic mean · evidence-linked
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Link
            to="/policy-intelligence"
            data-testid="ready-widget-open-intel"
            className="text-[12px] font-semibold text-[#0e3b4a] hover:underline inline-flex items-center gap-1"
          >
            Open intelligence <ChevronRight size={12} />
          </Link>
          <Button
            onClick={download}
            disabled={downloading}
            data-testid="ready-widget-download"
            className="bg-[#B8772F] hover:bg-[#a3661f] text-white text-[12px] h-8"
          >
            {downloading ? <Loader2 size={12} className="animate-spin mr-1.5" />
                         : <FileDown size={12} className="mr-1.5" />}
            Evidence pack
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {data.pillars.map((p) => {
          const t = RAG[bandFor(p.score)];
          return (
            <Link
              key={p.key}
              to={p.evidence || "#"}
              data-testid={`ready-pillar-${p.key}`}
              className="rounded-lg border p-2 hover:bg-stone-50 text-center"
              style={{ borderColor: t.line }}
            >
              <div className="font-display font-bold text-base" style={{ color: t.fg }}>
                {p.score}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-stone-500 font-bold mt-0.5 leading-tight">
                {p.label}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
