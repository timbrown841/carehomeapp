/* HR · Staff Personnel File — Phase F
 *
 * Opens the digital personnel file for one staff member.
 * Sticky header (RAG · profile · missing-items CTA · PDF export).
 * Tabbed folder view: Recruitment · Compliance · Supervisions · Training · HR · Audit.
 *
 * Designed to feel like an Ofsted-ready secure file, premium and operational.
 */
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  Loader2, FileCheck2, AlertTriangle, ShieldCheck, ChevronLeft,
  FolderOpen, Download, RefreshCw, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PersonnelFolderCard from "@/components/hr/PersonnelFolderCard";
import HRAuditTab from "@/components/hr/HRAuditTab";

const TAB_LABELS = {
  Recruitment:  "Recruitment",
  Compliance:   "Compliance",
  Supervisions: "Supervisions",
  Training:     "Training",
  HR:           "HR",
  Audit:        "Audit",
};

const TAB_QUESTIONS = {
  Recruitment:  "Can this person legally and safely work here?",
  Compliance:   "Is this staff member currently compliant?",
  Supervisions: "Are supervisions happening with the right frequency?",
  Training:     "Is mandatory + specialist training current?",
  HR:           "Ongoing employment management.",
  Audit:        "Every upload, change and deletion — fully traceable.",
};

const STATUS_BAR = {
  red:   { fg: "#7a1a28", bg: "#FBE3E7", line: "#A8273A", label: "Action required" },
  amber: { fg: "#7a4d12", bg: "#FCEFD4", line: "#B8772F", label: "Action soon" },
  green: { fg: "#1f4f2b", bg: "#E7F3EC", line: "#2F6A3A", label: "Compliant" },
};

export default function StaffPersonnelFile({ staffId, onBack }) {
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("Recruitment");
  const [missingOpen, setMissingOpen] = useState(false);
  const [missing, setMissing] = useState(null);

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true); setError(null);
    try {
      const r = await api.get(`/hr/staff/${staffId}?sector=children`);
      setView(r.data);
    } catch (e) {
      setError(e?.response?.status === 403
        ? "Manager+ only — Safer Recruitment is restricted."
        : "Could not load personnel file.");
    } finally { setLoading(false); }
  }, [staffId]);

  useEffect(() => { load(); }, [load]);

  const loadMissing = async () => {
    try {
      const r = await api.get(`/hr/staff/${staffId}/missing-items?sector=children`);
      setMissing(r.data);
      setMissingOpen(true);
    } catch { /* graceful */ }
  };

  if (!staffId) {
    return <div className="text-stone-500 text-sm p-6">Select a staff member.</div>;
  }
  if (loading) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 flex items-center gap-2 text-stone-600 text-sm">
        <Loader2 size={14} className="animate-spin" /> Opening personnel file…
      </div>
    );
  }
  if (error) {
    return <div className="bg-white border divider-soft rounded-2xl p-6 text-sm text-stone-700">{error}</div>;
  }
  if (!view) return null;

  const tone = STATUS_BAR[view.overall_status] || STATUS_BAR.green;
  const activeTabData = view.tabs.find((t) => t.id === activeTab);

  return (
    <div className="space-y-3" data-testid="staff-personnel-file">
      {/* Sticky header */}
      <header
        className="rounded-2xl p-4 sm:p-5 border divider-soft"
        style={{ background: `linear-gradient(135deg, ${tone.line}11 0%, transparent 60%)`, borderLeft: `5px solid ${tone.line}` }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {onBack && (
              <button type="button" onClick={onBack}
                className="p-1.5 rounded-md hover:bg-white/60 text-stone-600 shrink-0"
                data-testid="personnel-file-back">
                <ChevronLeft size={16} />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e3b4a]">
                  Personnel File · Ofsted-ready
                </span>
                {view.profile.is_agency && (
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-[#7a4d12] text-white px-1.5 py-0.5 rounded">
                    Agency
                  </span>
                )}
              </div>
              <h2 className="font-display font-semibold text-xl sm:text-2xl text-[#0F1115] mt-0.5"
                style={{ letterSpacing: "-0.02em" }}>
                {view.staff.name}
              </h2>
              <p className="text-[12px] text-stone-600 mt-0.5">
                {view.profile.role_label}
                {view.profile.start_date && <> · Started {new Date(view.profile.start_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</>}
                {view.profile.last_reviewed_at && <> · Last reviewed {new Date(view.profile.last_reviewed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}{view.profile.last_reviewed_by ? ` by ${view.profile.last_reviewed_by}` : ""}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
              style={{ background: tone.bg, color: tone.fg }}
              data-testid="personnel-file-overall-status"
            >
              {tone.label}
            </span>
            <Button variant="outline" size="sm" onClick={loadMissing}
              className="text-[12px] h-8 border-[#A8273A] text-[#A8273A] hover:bg-[#A8273A0a]"
              data-testid="personnel-file-missing-btn">
              <AlertTriangle size={12} className="mr-1" />
              Open all missing items
            </Button>
            <Button variant="outline" size="sm" onClick={load}
              className="text-[12px] h-8" title="Refresh">
              <RefreshCw size={12} />
            </Button>
          </div>
        </div>

        {/* Overall counts strip */}
        <div className="grid grid-cols-4 gap-2 mt-3" data-testid="personnel-counts">
          <Stat label="Compliant"     value={view.overall_counts.green}  tone="#2F6A3A" />
          <Stat label="Action soon"   value={view.overall_counts.amber}  tone="#B8772F" />
          <Stat label="Missing"       value={view.overall_counts.red}    tone="#A8273A" />
          <Stat label="Optional"      value={view.overall_counts.grey}   tone="#5D6068" />
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-white border divider-soft rounded-xl p-1 flex gap-1 overflow-x-auto" data-testid="personnel-file-tabs">
        {Object.keys(TAB_LABELS).map((t) => {
          const tabData = view.tabs.find((x) => x.id === t);
          const hasReds = tabData && tabData.folders.some((f) => f.status.status === "red");
          const isActive = t === activeTab;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                isActive
                  ? "bg-[#0e3b4a] text-white"
                  : "text-stone-700 hover:bg-stone-100"
              }`}
              data-testid={`personnel-tab-${t}`}
            >
              <span className="flex items-center gap-1.5">
                {TAB_LABELS[t]}
                {hasReds && !isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A8273A]" />
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Tab body */}
      <p className="text-[11px] uppercase tracking-[0.16em] text-stone-500 px-2">
        {TAB_QUESTIONS[activeTab]}
      </p>

      {activeTab === "Audit" ? (
        <HRAuditTab staffId={staffId} />
      ) : activeTabData ? (
        <div className="grid sm:grid-cols-2 gap-2" data-testid={`personnel-folder-grid-${activeTab}`}>
          {activeTabData.folders.length === 0 ? (
            <div className="bg-stone-50 rounded-xl p-6 text-center text-stone-500 text-[13px] col-span-2">
              No folders configured for this tab.
            </div>
          ) : activeTabData.folders.map((f) => (
            <PersonnelFolderCard key={f.id} folder={f} staffId={staffId} onChange={load} />
          ))}
        </div>
      ) : null}

      {/* Missing items drawer */}
      {missingOpen && missing && (
        <MissingItemsDrawer
          missing={missing}
          onClose={() => setMissingOpen(false)}
          onJump={(folderId, tab) => {
            setActiveTab(tab);
            setMissingOpen(false);
            setTimeout(() => {
              const el = document.querySelector(`[data-testid="hr-folder-${folderId}"]`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              const tg = document.querySelector(`[data-testid="hr-folder-toggle-${folderId}"]`);
              if (tg) tg.click();
            }, 250);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="bg-white border divider-soft rounded-lg px-2.5 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-stone-500">{label}</div>
      <div className="font-display font-semibold text-lg" style={{ color: tone }}>{value}</div>
    </div>
  );
}

function MissingItemsDrawer({ missing, onClose, onJump }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(11,14,22,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="missing-items-drawer">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-xl w-full max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b divider-soft sticky top-0 bg-white">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-semibold text-base text-[#0F1115]">
                Missing & expiring items
              </h3>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {missing.staff_name} — <span className="text-[#A8273A] font-semibold">{missing.count_red} missing</span> · <span className="text-[#B8772F] font-semibold">{missing.count_amber} action soon</span>
              </p>
            </div>
            <button type="button" onClick={onClose}
              className="text-[12px] text-stone-500 hover:text-[#0e3b4a]">Close</button>
          </div>
        </div>
        <div className="p-4">
          {missing.items.length === 0 ? (
            <div className="bg-[#2F6A3A14] rounded-lg p-3 text-[13px] text-[#0F1115] flex items-center gap-2">
              <ShieldCheck size={14} className="text-[#2F6A3A]" />
              All required items present and in-date. Personnel file is Ofsted-ready.
            </div>
          ) : (
            <ul className="space-y-1.5" data-testid="missing-items-list">
              {missing.items.map((i) => {
                const tone = STATUS_BAR[i.status] || STATUS_BAR.amber;
                return (
                  <li key={i.folder_id}>
                    <button type="button" onClick={() => onJump(i.folder_id, i.tab)}
                      className="w-full text-left bg-stone-50 hover:bg-stone-100 rounded-lg p-2.5"
                      data-testid={`missing-item-${i.folder_id}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: tone.bg, color: tone.fg }}>{i.status === "red" ? "Missing" : "Action soon"}</span>
                        <span className="text-[12px] font-semibold text-[#0F1115]">{i.label}</span>
                        <span className="text-[10px] uppercase tracking-wider text-stone-500 ml-auto">{i.tab}</span>
                      </div>
                      <div className="text-[11px] text-stone-600 mt-0.5">{i.reason}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
