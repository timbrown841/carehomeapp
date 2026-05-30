/* Phase H — Induction & Policy Management Hub
 *
 * Manager-facing entry point. Folder-style library + Induction dashboard +
 * Induction pack manager all live behind a single route.
 *
 * Manager+ (tier >= 3) only. Staff get their own /my-policies route.
 */
import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  BookOpen, FolderOpen, Plus, Upload, ShieldCheck, ClipboardList,
  Loader2, AlertTriangle, CheckCircle2, Clock, FileDown, GraduationCap,
  Users as UsersIcon, RefreshCw, ChevronRight, AlertCircle, FileText,
} from "lucide-react";
import ComplianceDashboard from "./ComplianceDashboard";

const TABS = [
  { id: "library",   label: "Policy library", icon: FolderOpen },
  { id: "dashboard", label: "Compliance dashboard", icon: ShieldCheck },
  { id: "induction", label: "Induction packs", icon: GraduationCap },
];

const RAG_TONE = {
  red:   { bg: "#FBE3E7", fg: "#7a1a28", line: "#A8273A" },
  amber: { bg: "#FCEFD4", fg: "#7a4d12", line: "#B8772F" },
  green: { bg: "#E7F3EC", fg: "#1f4f2b", line: "#2F6A3A" },
  grey:  { bg: "#F1EFEC", fg: "#5d6068", line: "#d4d2cc" },
};

export default function InductionPolicyHub() {
  const { isManagerOrAbove } = useAuth();
  const { mode: legacyMode, effectiveMode } = useOrg();
  const mode = effectiveMode || legacyMode;
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "library";

  if (!isManagerOrAbove) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 text-sm text-stone-700"
           data-testid="policies-hub-blocked">
        Manager+ only — Induction & Policy Management is restricted.
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto" data-testid="policies-hub">
      <header
        className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0E3B4A 0%, #0a2734 60%, #1E4D5C 100%)", color: "white" }}
      >
        <div className="flex items-center gap-2 text-[#FCB960]">
          <BookOpen size={14} />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
            Induction & Policy Management · Inspection-ready evidence
          </span>
        </div>
        <h1 className="font-display font-semibold text-2xl sm:text-3xl mt-1.5"
            style={{ letterSpacing: "-0.02em" }}>
          Every policy. Every signature. Every audit trail.
        </h1>
        <p className="text-[12px] text-white/65 mt-1 max-w-2xl">
          Upload, assign and evidence policy compliance for Ofsted, Reg 44 and CQC.
          Workspace: <strong className="text-white">{mode === "adult" ? "Adult Care" : "Children's Services"}</strong>.
        </p>
      </header>

      <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`policies-tab-${t.id}`}
              onClick={() => setParams({ tab: t.id })}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors inline-flex items-center gap-1.5 ${
                active ? "bg-white text-[#0F2A47] shadow-sm" : "text-stone-600 hover:bg-white/50"
              }`}
            >
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "library"   && <PolicyLibrary  sector={mode === "adult" ? "adult" : "children"} />}
      {tab === "dashboard" && <ComplianceDash sector={mode === "adult" ? "adult" : "children"} />}
      {tab === "induction" && <InductionTab   sector={mode === "adult" ? "adult" : "children"} />}
    </div>
  );
}


// ============= POLICY LIBRARY =============

function PolicyLibrary({ sector }) {
  const [folders, setFolders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/policies/folders?sector=${sector}`);
      setFolders(r.data.folders || []);
    } catch {
      toast.error("Could not load policy folders.");
    } finally {
      setLoading(false);
    }
  }, [sector]);

  useEffect(() => { load(); }, [load]);

  const loadCat = useCallback(async (cat) => {
    setSelected(cat);
    try {
      const r = await api.get(`/policies?sector=${sector}&category=${encodeURIComponent(cat)}`);
      setPolicies(r.data.policies || []);
    } catch {
      toast.error("Could not load policies.");
    }
  }, [sector]);

  if (loading) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 inline-flex items-center gap-2 text-stone-600 text-sm">
        <Loader2 size={14} className="animate-spin" /> Loading library…
      </div>
    );
  }

  if (selected) {
    return (
      <CategoryView
        sector={sector}
        category={selected}
        policies={policies}
        onBack={() => { setSelected(null); load(); }}
        onReload={() => loadCat(selected)}
        onCreate={() => setShowCreate(true)}
        showCreate={showCreate}
        setShowCreate={setShowCreate}
      />
    );
  }

  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="policy-library">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h2 className="font-display font-semibold text-lg text-[#0F1115]">
          {sector === "adult" ? "Adult Services" : "Children's Services"} policies
        </h2>
        <Button
          onClick={load}
          variant="outline"
          className="text-[12px] h-8"
          data-testid="policy-library-refresh"
        >
          <RefreshCw size={12} className="mr-1.5" /> Refresh
        </Button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {folders.map((f) => {
          const tone = RAG_TONE[f.rag_status] || RAG_TONE.grey;
          return (
            <button
              key={f.category}
              onClick={() => loadCat(f.category)}
              data-testid={`policy-folder-${f.category.replace(/\W+/g, '-').toLowerCase()}`}
              className="text-left rounded-xl border p-3.5 transition-colors hover:bg-stone-50 group"
              style={{ borderColor: tone.line }}
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                     style={{ background: tone.bg, color: tone.fg }}>
                  <FolderOpen size={16} />
                </div>
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  {f.rag_status}
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold text-stone-900">
                {f.category}
              </div>
              <div className="text-[11px] text-stone-500 mt-0.5">
                {f.count} policy{f.count === 1 ? "" : "ies"}
                {f.last_updated && <> · last updated {(f.last_updated || "").slice(0, 10)}</>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}


// ============= CATEGORY VIEW =============

function CategoryView({ sector, category, policies, onBack, onReload, showCreate, setShowCreate }) {
  return (
    <section className="space-y-3" data-testid="policy-category-view">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          onClick={onBack}
          data-testid="policy-back-to-library"
          className="text-[12px] font-semibold text-[#0e3b4a] hover:underline inline-flex items-center gap-1"
        >
          ← Back to library
        </button>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-8"
          data-testid="policy-create-btn"
        >
          <Plus size={12} className="mr-1.5" /> Add policy
        </Button>
      </div>

      <div className="bg-white border divider-soft rounded-2xl p-5">
        <h2 className="font-display font-semibold text-lg text-[#0F1115] mb-3">
          {category}
        </h2>
        {policies.length === 0 ? (
          <div className="text-[13px] text-stone-500 py-4">
            No policies in this category yet. Click <strong>Add policy</strong> to create one.
          </div>
        ) : (
          <ul className="divide-y divider-soft">
            {policies.map((p) => (
              <li key={p.id} data-testid={`policy-row-${p.id}`} className="py-3 flex items-start gap-3 flex-wrap">
                <div className="w-9 h-9 rounded-lg bg-stone-100 text-[#0e3b4a] flex items-center justify-center shrink-0">
                  <FileText size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-900">{p.title}</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    {p.current_version
                      ? <>v{p.current_version.version} · effective {(p.current_version.effective_date || "").slice(0, 10)}</>
                      : <span className="text-[#7a1a28] font-bold">NO VERSION UPLOADED</span>}
                    {p.review_date && <> · review {(p.review_date || "").slice(0, 10)}</>}
                  </div>
                </div>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: RAG_TONE[p.rag_status]?.bg, color: RAG_TONE[p.rag_status]?.fg }}
                >
                  {p.rag_status}
                </span>
                <Link
                  to={`/policies/${p.id}`}
                  data-testid={`policy-open-${p.id}`}
                  className="text-[12px] font-semibold text-[#0e3b4a] hover:underline inline-flex items-center gap-0.5"
                >
                  Open <ChevronRight size={11} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <CreatePolicyModal
          sector={sector}
          category={category}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); onReload(); }}
        />
      )}
    </section>
  );
}


function CreatePolicyModal({ sector, category, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/policies", {
        title: title.trim(),
        category,
        sector,
        summary: summary.trim() || undefined,
        review_date: reviewDate ? `${reviewDate}T00:00:00+00:00` : undefined,
      });
      toast.success("Policy created. Now upload a version to make it effective.");
      onCreated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create policy.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
         onClick={onClose}
         data-testid="policy-create-modal">
      <div className="bg-white rounded-2xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-2">
          New policy · {category}
        </h3>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="policy-title-input"
            placeholder="e.g. Safeguarding Children Policy"
            className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm"
          />
        </label>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Summary (optional)</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm"
          />
        </label>
        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Next review date</span>
          <input
            type="date"
            value={reviewDate}
            onChange={(e) => setReviewDate(e.target.value)}
            data-testid="policy-review-date-input"
            className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm font-mono"
          />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="text-[12px] h-8">Cancel</Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-8"
            data-testid="policy-create-submit"
          >
            {saving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Plus size={12} className="mr-1.5" />}
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}


// ============= COMPLIANCE DASHBOARD =============

function ComplianceDash({ sector }) {
  const [assignments, setAssignments] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [evidStaff, setEvidStaff] = useState("");
  const nav = useNavigate();

  const load = useCallback(async () => {
    try {
      const [a, u] = await Promise.all([
        api.get(`/policy-assignments`),
        api.get(`/auth/users/picker`),
      ]);
      setAssignments((a.data.assignments || []).slice(0, 30));
      setStaffOptions(u.data || []);
    } catch { /* */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const downloadEvidence = async () => {
    if (!evidStaff) { toast.error("Pick a staff member first."); return; }
    try {
      const r = await api.get(`/policy-compliance/evidence.pdf?staff_id=${evidStaff}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `induction-evidence-${evidStaff.slice(0, 6)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Evidence pack downloaded.");
    } catch {
      toast.error("Could not download evidence pack.");
    }
  };

  return (
    <div className="space-y-4" data-testid="policies-dashboard">
      {/* === Phase E.3.2 Unified Compliance Dashboard === */}
      <ComplianceDashboard />

      <section className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="font-display font-semibold text-lg text-[#0F1115]">
            Inspection evidence pack
          </h3>
        </div>
        <p className="text-[12px] text-stone-500 mb-3">
          Generate a one-click induction & policy evidence PDF for any staff member.
          Inspection-ready · Ofsted, Reg 44 and CQC compatible.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={evidStaff}
            onChange={(e) => setEvidStaff(e.target.value)}
            data-testid="evidence-staff-select"
            className="px-3 py-2 border divider-soft rounded-lg text-sm flex-1 min-w-[200px]"
          >
            <option value="">Pick a staff member…</option>
            {staffOptions.map((u) => (
              <option key={u.id} value={u.id}>{`${u.name} · ${u.role}`}</option>
            ))}
          </select>
          <Button
            onClick={downloadEvidence}
            disabled={!evidStaff}
            data-testid="evidence-download-btn"
            className="bg-[#B8772F] hover:bg-[#a3661f] text-white text-[12px] h-9"
          >
            <FileDown size={12} className="mr-1.5" /> Download evidence pack
          </Button>
        </div>
      </section>

      <section className="bg-white border divider-soft rounded-2xl p-5">
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-3">
          Recent assignments
        </h3>
        {assignments.length === 0 ? (
          <div className="text-[13px] text-stone-500 py-3">No assignments yet.</div>
        ) : (
          <ul className="divide-y divider-soft">
            {assignments.map((a) => (
              <li
                key={a.id}
                onClick={() => nav(`/policy-assignments/${a.id}`)}
                data-testid={`assignment-row-${a.id}`}
                className="py-3 flex items-start gap-3 cursor-pointer hover:bg-stone-50 -mx-2 px-2 rounded"
              >
                <StatusPill status={a.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-900">{a.policy_title}</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    {a.staff_name} · due {(a.due_date || "").slice(0, 10)}
                    {a.assessment_score !== null && a.assessment_score !== undefined &&
                      <> · score {a.assessment_score}%</>}
                  </div>
                </div>
                <ChevronRight size={14} className="text-stone-300 mt-1 shrink-0" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}


export function StatusPill({ status }) {
  const map = {
    assigned:                  { bg: "#E5F0F7", fg: "#15405d", label: "Assigned" },
    in_progress:               { bg: "#FCEFD4", fg: "#7a4d12", label: "In progress" },
    assessment_pending:        { bg: "#FCEFD4", fg: "#7a4d12", label: "Assessment pending" },
    awaiting_staff_signature:  { bg: "#FCEFD4", fg: "#7a4d12", label: "Awaiting signature" },
    awaiting_manager_sign_off: { bg: "#FCEFD4", fg: "#7a4d12", label: "Awaiting manager" },
    complete:                  { bg: "#E7F3EC", fg: "#1f4f2b", label: "Complete" },
    overdue:                   { bg: "#FBE3E7", fg: "#7a1a28", label: "Overdue" },
  };
  const s = map[status] || map.assigned;
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 inline-flex items-center"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}


// ============= INDUCTION TAB =============

function InductionTab({ sector }) {
  const [packs, setPacks] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [showEnroll, setShowEnroll] = useState(null);
  const [staffOpts, setStaffOpts] = useState([]);
  const [inductions, setInductions] = useState([]);

  const load = useCallback(async () => {
    try {
      const [p, e, u, ind] = await Promise.all([
        api.get(`/induction-packs?sector=${sector}`),
        api.get(`/induction-enrollments?sector=${sector}`),
        api.get(`/auth/users/picker`),
        api.get(`/induction/assignments`),
      ]);
      setPacks(p.data.packs || []);
      setEnrollments(e.data.enrollments || []);
      setStaffOpts(u.data || []);
      setInductions(ind.data.assignments || []);
    } catch { /* */ }
  }, [sector]);

  useEffect(() => { load(); }, [load]);

  const enroll = async (packId, staffId) => {
    try {
      await api.post("/induction-enrollments", { pack_id: packId, staff_id: staffId });
      toast.success("Staff enrolled. Assignments created.");
      setShowEnroll(null);
      load();
    } catch {
      toast.error("Could not enrol staff.");
    }
  };

  return (
    <div className="space-y-4" data-testid="induction-tab">
      {/* === NEW: Staff Induction Checklist (E.3) === */}
      <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="staff-induction-section">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="font-display font-semibold text-lg text-[#0F1115]">
              Staff induction checklists
            </h3>
            <p className="text-[12px] text-stone-500 mt-0.5">
              The 16-section structured induction every new staff member works through —
              welcome, safeguarding, shadow shifts, supervision, mandatory training, final manager sign-off.
            </p>
          </div>
          <Link to="/induction" className="text-xs text-[#0E3B4A] underline inline-flex items-center gap-1"
                       data-testid="open-induction-page">
            Open full Induction Centre →
          </Link>
        </div>
        {inductions.length === 0 ? (
          <div className="text-[13px] text-stone-500 py-3" data-testid="induction-tab-empty">
            No active inductions. Use the Induction Centre to assign one.
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2" data-testid="induction-tab-list">
            {inductions.slice(0, 6).map(a => (
              <li key={a.id}>
                <Link to={`/induction/${a.id}`}
                            className="block border divider-soft rounded-lg p-3 hover:border-stone-400"
                            data-testid={`induction-tab-card-${a.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm text-stone-800">{a.staff_name}</div>
                      <div className="text-[11px] text-stone-500">
                        {a.sector === "adult" ? "Adult Services" : "Children's"} · started {(a.created_at || "").slice(0, 10)}
                      </div>
                    </div>
                    {a.signed_off_at && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Signed off</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-stone-600">{a.progress.complete}/{a.progress.total} sections</span>
                    <span className="font-semibold text-stone-800">{a.progress.completion_pct}%</span>
                  </div>
                  <div className="mt-1 h-1 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full"
                         style={{ width: `${a.progress.completion_pct}%`,
                                  background: a.signed_off_at ? "#2F6A3A" : a.progress.completion_pct === 100 ? "#B8772F" : "#0e3b4a" }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* === Legacy: Policy-week packs (still useful for policy enrolment) === */}
      <section className="bg-white border divider-soft rounded-2xl p-5">
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-3">
          Policy-week packs
        </h3>
        <p className="text-[12px] text-stone-500 mb-3">
          For mass enrolment into policy read-and-sign categories (separate from the 16-section checklist above).
        </p>
        <div className="grid lg:grid-cols-2 gap-3">
          {packs.map((p) => (
            <div key={p.id} className="border divider-soft rounded-xl p-3.5"
                 data-testid={`pack-card-${p.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display font-semibold text-base text-[#0F1115]">{p.name}</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">{p.description}</div>
                </div>
                {p.is_default && (
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E5F0F7] text-[#15405d]">
                    Default
                  </span>
                )}
              </div>
              <ul className="mt-3 space-y-1 text-[12px] text-stone-700">
                {(p.weeks || []).map((w) => (
                  <li key={w.week_no} className="flex items-start gap-1">
                    <span className="font-bold text-[#0e3b4a] shrink-0">W{w.week_no}</span>
                    <span className="text-stone-500">·</span>
                    <span>{w.title} <span className="text-stone-400">({(w.categories || []).length} policies)</span></span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => setShowEnroll(p.id)}
                className="mt-3 bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[11px] h-7"
                data-testid={`enrol-pack-${p.id}`}
              >
                <UsersIcon size={11} className="mr-1.5" /> Enrol a staff member
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border divider-soft rounded-2xl p-5">
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-3">
          Active policy-pack enrolments
        </h3>
        {enrollments.length === 0 ? (
          <div className="text-[13px] text-stone-500 py-3">No staff currently in a policy-week pack.</div>
        ) : (
          <ul className="divide-y divider-soft" data-testid="enrollments-list">
            {enrollments.map((e) => (
              <li key={e.id} className="py-3" data-testid={`enrollment-row-${e.id}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold text-stone-900">{e.staff_name}</div>
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      {e.pack_name} · started {(e.started_at || "").slice(0, 10)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-[11px] text-stone-500">
                      {e.completion_done} / {e.completion_total} complete
                    </div>
                    <div className="font-bold text-lg text-[#0e3b4a]">
                      {e.completion_pct}%
                    </div>
                  </div>
                </div>
                <div className="mt-2 w-full h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full bg-[#2F6A3A] transition-all"
                    style={{ width: `${e.completion_pct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showEnroll && (
        <EnrolModal
          packId={showEnroll}
          staffOpts={staffOpts}
          onClose={() => setShowEnroll(null)}
          onEnrol={(sid) => enroll(showEnroll, sid)}
        />
      )}
    </div>
  );
}


function EnrolModal({ packId, staffOpts, onClose, onEnrol }) {
  const [sid, setSid] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
         onClick={onClose} data-testid="enrol-modal">
      <div className="bg-white rounded-2xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-semibold text-lg text-[#0F1115] mb-2">
          Enrol staff into induction
        </h3>
        <select
          value={sid}
          onChange={(e) => setSid(e.target.value)}
          data-testid="enrol-staff-select"
          className="mt-3 w-full px-3 py-2 border divider-soft rounded-lg text-sm"
        >
          <option value="">Pick a staff member…</option>
          {staffOpts.map((u) => (
            <option key={u.id} value={u.id}>{`${u.name} · ${u.role}`}</option>
          ))}
        </select>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="text-[12px] h-8">Cancel</Button>
          <Button
            disabled={!sid}
            onClick={() => onEnrol(sid)}
            className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-8"
            data-testid="enrol-confirm"
          >
            <GraduationCap size={12} className="mr-1.5" /> Enrol
          </Button>
        </div>
      </div>
    </div>
  );
}
