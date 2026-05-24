/* Safer Recruitment & HR — Phase F · Operational Personnel Files
 *
 * Manager+ only. Org-wide dashboard with per-staff drill-down.
 * Designed to feel like an Ofsted-ready secure HR drive, not generic software.
 */
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  Loader2, ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2,
  FolderOpen, ChevronRight, RefreshCw, Search, Lock, Users,
  TrendingUp, FileWarning, ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StaffPersonnelFile from "@/components/hr/StaffPersonnelFile";
import SCRDashboard from "@/components/hr/SCRDashboard";

const TONE = {
  red:   { fg: "#7a1a28", bg: "#FBE3E7", line: "#A8273A" },
  amber: { fg: "#7a4d12", bg: "#FCEFD4", line: "#B8772F" },
  green: { fg: "#1f4f2b", bg: "#E7F3EC", line: "#2F6A3A" },
};

export default function SaferRecruitment() {
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [scrOpen, setScrOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get("/hr/staff?sector=children");
      setDash(r.data);
    } catch (e) {
      setError(e?.response?.status === 403
        ? "Restricted to managers and admins."
        : "Could not load HR overview.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (scrOpen) {
    return (
      <div className="space-y-3" data-testid="safer-recruitment-page">
        <SCRDashboard onBack={() => setScrOpen(false)} />
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-3" data-testid="safer-recruitment-page">
        <StaffPersonnelFile staffId={selected} onBack={() => { setSelected(null); load(); }} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 flex items-center gap-2 text-stone-600 text-sm"
        data-testid="safer-recruitment-page">
        <Loader2 size={14} className="animate-spin" /> Loading personnel files…
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 text-sm text-stone-700"
        data-testid="safer-recruitment-page">{error}</div>
    );
  }

  const rows = (dash?.rows || []).filter(
    (r) => !search || (r.name || "").toLowerCase().includes(search.toLowerCase()) ||
                       (r.role_label || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4 max-w-6xl mx-auto" data-testid="safer-recruitment-page">
      {/* Hero header */}
      <header className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0E3B4A 0%, #0a2734 100%)", color: "white" }}>
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-white/80" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
              Safer Recruitment · Personnel Files · Manager+ only
            </span>
          </div>
          <h1 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5" style={{ letterSpacing: "-0.02em" }}>
            Ofsted-ready digital personnel files
          </h1>
          <p className="text-[13px] text-white/70 mt-1 max-w-2xl">
            Folder-style records structured exactly how managers organise safer recruitment in real
            children's homes — DBS, RTW, references, training, supervisions, contracts, audit trail.
            One click per staff to drill into the full file.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4" data-testid="hr-hero-tiles">
            <HeroTile Icon={Users}        label="Total staff"     value={dash.total_staff} />
            <HeroTile Icon={AlertTriangle} label="Action required" value={dash.summary.red}   tone="#FCA1A6" />
            <HeroTile Icon={AlertCircle}  label="Action soon"     value={dash.summary.amber} tone="#FDCC72" />
            <HeroTile Icon={FileWarning}  label="Docs expired"    value={dash.total_expired} tone="#FCA1A6" />
          </div>

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button
              onClick={() => setScrOpen(true)}
              className="bg-[#B8772F] hover:bg-[#a3661f] text-white text-[13px] h-9"
              data-testid="open-scr-btn"
            >
              <ScrollText size={14} className="mr-1.5" />
              Open Single Central Record
            </Button>
            <span className="text-[11px] text-white/65">
              The one-tap Ofsted/Reg 44 evidence export
            </span>
          </div>
        </div>
      </header>

      {/* Search + refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Search staff by name or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-[13px] h-9 bg-white"
            data-testid="hr-staff-search"
          />
        </div>
        <button type="button" onClick={load} className="text-[12px] text-stone-600 hover:text-[#0e3b4a] px-2 py-1 rounded hover:bg-stone-100 flex items-center gap-1">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Staff list */}
      <section className="bg-white border divider-soft rounded-2xl p-3" data-testid="hr-staff-list">
        {rows.length === 0 ? (
          <div className="text-center text-stone-500 text-sm p-6">No staff match.</div>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => <StaffRow key={r.staff_id} row={r} onOpen={() => setSelected(r.staff_id)} />)}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-stone-500 px-1 leading-relaxed">
        {dash.explainable_note}
      </p>
    </div>
  );
}

function HeroTile({ Icon, label, value, tone }) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg p-2.5 flex items-center gap-2.5">
      <Icon size={16} className="text-white/70 shrink-0" />
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/65">{label}</div>
        <div className="text-xl font-display font-semibold" style={{ color: tone || "white" }}>{value ?? 0}</div>
      </div>
    </div>
  );
}

function StaffRow({ row, onOpen }) {
  const t = TONE[row.overall_status] || TONE.green;
  const Icon = row.overall_status === "red" ? AlertTriangle :
               row.overall_status === "amber" ? AlertCircle : CheckCircle2;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left px-3 py-2.5 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors flex items-center gap-3"
        style={{ borderLeft: `3px solid ${t.line}` }}
        data-testid={`hr-staff-row-${row.staff_id}`}
      >
        <FolderOpen size={16} className="text-[#0e3b4a] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-[13px] text-[#0F1115]">{row.name}</span>
            <span className="text-[10px] text-stone-500">{row.role_label}</span>
            {row.is_agency && (
              <span className="text-[9px] font-bold uppercase tracking-wider bg-[#7a4d12] text-white px-1 rounded">Agency</span>
            )}
          </div>
          {row.top_missing && row.top_missing.length > 0 && (
            <div className="text-[11px] text-[#A8273A] mt-0.5 truncate">
              Missing: {row.top_missing.map((m) => m.label).join(" · ")}
            </div>
          )}
          {row.last_reviewed_at && (
            <div className="text-[10px] text-stone-500 mt-0.5">
              Last reviewed {new Date(row.last_reviewed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1"
            style={{ background: t.bg, color: t.fg }}>
            <Icon size={10} />
            {row.overall_status === "red" ? `${row.missing_count} missing` :
             row.overall_status === "amber" ? "Action soon" : "Compliant"}
          </span>
          <ChevronRight size={14} className="text-stone-400" />
        </div>
      </button>
    </li>
  );
}
