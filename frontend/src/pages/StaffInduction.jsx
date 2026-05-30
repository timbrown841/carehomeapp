/* Phase E.3 — Staff Induction Checklist
 *
 * 16-section structured induction. List view + detail page in one
 * component. Manager/senior/admin can assign and update; staff can update
 * their own items (except final manager_signoff). Manager+ signs off.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, Plus, CheckCircle2, Clock3, AlertCircle,
  Loader2, Trash2, FileText, Upload, Save, ShieldCheck, ChevronRight,
  ChevronDown, Award, ArrowLeft, ExternalLink,
} from "lucide-react";

const STATUS_TONE = {
  not_started: { bg: "bg-stone-100", fg: "text-stone-700", label: "Not started", line: "border-stone-300" },
  in_progress: { bg: "bg-amber-100", fg: "text-amber-800", label: "In progress", line: "border-amber-400" },
  completed: { bg: "bg-emerald-100", fg: "text-emerald-800", label: "Completed", line: "border-emerald-500" },
};


/* === LIST VIEW (manager+ / senior) === */
export default function StaffInductionList() {
  const { user, isSeniorOrAbove, isManagerOrAbove } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [filter, setFilter] = useState("all"); // all | at_risk | overdue | signed_off
  const navigate = useNavigate();

  // Staff -> redirect to their own assignment
  useEffect(() => {
    if (!isSeniorOrAbove && user?.id) {
      api.get("/induction/assignments/mine").then(r => {
        if (r.data.assignment) {
          navigate(`/induction/${r.data.assignment.id}`, { replace: true });
        } else {
          setLoading(false);
        }
      }).catch(() => setLoading(false));
    }
  }, [isSeniorOrAbove, user, navigate]);

  const load = useCallback(async () => {
    if (!isSeniorOrAbove) return;
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        api.get("/induction/assignments"),
        api.get("/induction/dashboard"),
      ]);
      setAssignments(r.data.assignments || []);
      setDashboard(d.data);
    } catch { toast.error("Could not load inductions"); }
    finally { setLoading(false); }
  }, [isSeniorOrAbove]);

  useEffect(() => { if (isSeniorOrAbove) load(); }, [load, isSeniorOrAbove]);

  const filtered = useMemo(() => {
    if (filter === "all") return assignments;
    if (filter === "signed_off") return assignments.filter(a => a.signed_off_at);
    if (filter === "overdue") return assignments.filter(a => a.risk === "red" && !a.signed_off_at);
    if (filter === "at_risk") return assignments.filter(a => ["amber", "red"].includes(a.risk) && !a.signed_off_at);
    return assignments;
  }, [assignments, filter]);

  // Staff with no assignment
  if (!isSeniorOrAbove) {
    if (loading) {
      return <div className="text-sm text-stone-600 max-w-4xl mx-auto"><Loader2 size={14} className="inline animate-spin" /> Loading…</div>;
    }
    return (
      <div className="max-w-4xl mx-auto bg-white border divider-soft rounded-2xl p-6 text-center" data-testid="induction-empty-staff">
        <GraduationCap size={32} className="mx-auto text-stone-400 mb-2" />
        <div className="text-stone-800 font-semibold">No induction assigned yet</div>
        <p className="text-sm text-stone-500 mt-1">Your manager will create your induction checklist on Day 1.</p>
      </div>
    );
  }

  if (loading) return <div className="text-sm text-stone-600"><Loader2 size={14} className="inline animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-5 max-w-6xl mx-auto" data-testid="induction-list-page">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
            Staff Induction
          </div>
          <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">
            Induction checklists
          </h1>
          <p className="text-[#5d6068] mt-1.5 text-[15px]">
            16-section structured induction with evidence and manager sign-off.
          </p>
        </div>
        {isManagerOrAbove && (
          <div className="flex flex-wrap items-center gap-2">
            <a className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50"
               href={`/api/induction/inspection-pack.pdf?token=${encodeURIComponent(localStorage.getItem("token") || "")}`}
               target="_blank" rel="noreferrer"
               data-testid="induction-evidence-pack-btn">
              <FileText size={12} /> Export Induction Evidence Pack
            </a>
            <Button onClick={() => setShowAssign(true)} data-testid="induction-assign-btn">
              <Plus size={14} className="mr-1" /> Assign induction
            </Button>
          </div>
        )}
      </header>

      {dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="induction-compliance-bar">
          <ComplianceTile label="Compliance" value={`${dashboard.compliance_pct}%`}
                          sub={`${dashboard.signed_off}/${dashboard.total} signed off`}
                          tone={dashboard.compliance_pct >= 85 ? "green" : dashboard.compliance_pct >= 65 ? "amber" : "red"}
                          testid="induction-summary-compliance" />
          <ComplianceTile label="Due this week" value={dashboard.due_this_week.length}
                          tone={dashboard.due_this_week.length > 0 ? "amber" : "green"}
                          testid="induction-summary-due-this-week" />
          <ComplianceTile label="Overdue" value={dashboard.overdue.length}
                          tone={dashboard.overdue.length > 0 ? "red" : "green"}
                          testid="induction-summary-overdue" />
          <ComplianceTile label="Recently completed" value={dashboard.recently_completed.length}
                          sub="last 30 days"
                          tone={dashboard.recently_completed.length > 0 ? "green" : "grey"}
                          testid="induction-summary-recently" />
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5 text-xs" data-testid="induction-filter-chips">
        {[
          { id: "all", label: "All" },
          { id: "at_risk", label: "At risk" },
          { id: "overdue", label: "Overdue" },
          { id: "signed_off", label: "Signed off" },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`px-3 py-1 rounded-full ${filter === f.id ? "bg-[#0F1115] text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
                  data-testid={`induction-filter-${f.id}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-stone-50 border divider-soft rounded-2xl p-10 text-center" data-testid="induction-empty-state">
          <GraduationCap size={32} className="mx-auto text-stone-400 mb-2" />
          <div className="text-stone-800 font-semibold">
            {assignments.length === 0 ? "No active inductions" : `No inductions match "${filter}"`}
          </div>
          <p className="text-sm text-stone-500 mt-1">
            {assignments.length === 0
              ? "Assign an induction to a newly recruited staff member to start their checklist."
              : "Switch filter to see other inductions."}
          </p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {filtered.map(a => (
            <li key={a.id} data-testid={`induction-card-${a.id}`}>
              <Link to={`/induction/${a.id}`}
                    className="block bg-white border divider-soft rounded-xl p-4 hover:border-stone-400 transition">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] uppercase font-semibold tracking-wider text-stone-500">
                      {a.sector === "adult" ? "Adult Services" : "Children's Services"} · {a.staff_role}
                    </div>
                    <div className="font-display font-semibold text-base text-[#0F1115] mt-0.5">
                      {a.staff_name}
                    </div>
                    <div className="text-[11px] text-stone-500 mt-1">
                      Started {(a.created_at || "").slice(0, 10)}
                      {a.target_completion ? ` · target ${a.target_completion}` : ""}
                    </div>
                  </div>
                  {a.signed_off_at ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Signed off</span>
                  ) : a.progress.overall_status === "completed" ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Awaiting sign-off</span>
                  ) : a.progress.overall_status === "in_progress" ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">In progress</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">Not started</span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-[11px] text-stone-600">
                    {a.progress.complete}/{a.progress.total} sections complete
                  </div>
                  <div className="font-display font-semibold text-xl text-[#0F1115]">
                    {a.progress.completion_pct}%
                  </div>
                </div>
                <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                       style={{ width: `${a.progress.completion_pct}%`,
                                background: a.signed_off_at ? "#2F6A3A" : a.progress.completion_pct === 100 ? "#B8772F" : "#0e3b4a" }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showAssign && <AssignModal onClose={() => setShowAssign(false)} onSaved={() => { setShowAssign(false); load(); }} />}
    </div>
  );
}


function AssignModal({ onClose, onSaved }) {
  const [staff, setStaff] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [form, setForm] = useState({ staff_id: "", sector: "children", target_completion: "", template_id: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/auth/users").then(r => {
      const all = Array.isArray(r.data) ? r.data : (r.data.users || []);
      setStaff(all.filter(u => ["staff", "senior", "manager"].includes(u.role)));
    });
    api.get("/induction/templates").then(r => setTemplates(r.data.templates || []));
  }, []);

  // Recompute recommended template whenever staff or sector changes
  useEffect(() => {
    if (!form.staff_id) { setRecommendation(null); return; }
    api.get(`/induction/recommend-template?staff_id=${form.staff_id}&sector=${form.sector}`)
      .then(r => {
        setRecommendation(r.data);
        // Auto-select if user hasn't overridden
        setForm(f => ({ ...f, template_id: r.data.recommended_template_id }));
      })
      .catch(() => setRecommendation(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.staff_id, form.sector]);

  const submit = async () => {
    if (!form.staff_id) { toast.error("Pick a staff member"); return; }
    setSaving(true);
    try {
      const payload = {
        staff_id: form.staff_id,
        sector: form.sector,
        target_completion: form.target_completion || undefined,
        template_id: form.template_id || undefined,
      };
      const r = await api.post("/induction/assignments", payload);
      toast.success("Induction created");
      onSaved(r.data.id);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not create"); }
    finally { setSaving(false); }
  };

  const selectedTemplate = templates.find(t => t.id === form.template_id);
  const isOverridden = recommendation && form.template_id && form.template_id !== recommendation.recommended_template_id;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="induction-assign-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3"
           onClick={e => e.stopPropagation()}>
        <div className="font-display font-semibold text-lg">Assign induction</div>
        <Field label="Staff member">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.staff_id}
                  onChange={e => setForm({...form, staff_id: e.target.value})}
                  data-testid="induction-assign-staff">
            <option value="">—</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
          </select>
        </Field>
        <Field label="Sector">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.sector}
                  onChange={e => setForm({...form, sector: e.target.value})}
                  data-testid="induction-assign-sector">
            <option value="children">Children's Services</option>
            <option value="adult">Adult Services</option>
          </select>
        </Field>

        {/* Phase E.3.2 — Recommended template auto-pick + override */}
        {recommendation && (
          <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-2.5"
               data-testid="induction-recommendation">
            <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-800">
              Recommended for {recommendation.role}
            </div>
            <div className="text-sm font-semibold text-emerald-900 mt-0.5">
              {recommendation.label}
            </div>
            <div className="text-[11px] text-emerald-800/80 mt-0.5">
              {recommendation.section_count} sections · est. {recommendation.estimated_completion}
              {recommendation.estimated_hours ? ` (~${recommendation.estimated_hours}h)` : ""}
            </div>
          </div>
        )}

        <Field label="Induction template">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.template_id}
                  onChange={e => setForm({...form, template_id: e.target.value})}
                  data-testid="induction-assign-template">
            {templates
              .filter(t => t.sector === "both" || t.sector === form.sector)
              .map(t => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.section_count} sections{t.estimated_completion ? ` · ${t.estimated_completion}` : ""})
                </option>
              ))}
          </select>
        </Field>

        {selectedTemplate && (
          <div className="text-[11px] text-stone-600 -mt-1.5" data-testid="induction-template-details">
            {selectedTemplate.section_count} sections · est. {selectedTemplate.estimated_completion}
            {selectedTemplate.estimated_hours ? ` (~${selectedTemplate.estimated_hours}h)` : ""}
            {isOverridden && (
              <span className="ml-1 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                Manager override
              </span>
            )}
          </div>
        )}

        <Field label="Target completion (optional)">
          <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.target_completion}
                 onChange={e => setForm({...form, target_completion: e.target.value})}
                 data-testid="induction-assign-target" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="induction-assign-save">
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}


/* === DETAIL VIEW === */
export function InductionDetailPage() {
  const { aid } = useParams();
  const { user, isSeniorOrAbove, isManagerOrAbove } = useAuth();
  const [a, setA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignOff, setShowSignOff] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/induction/assignments/${aid}`);
      setA(r.data);
    } catch (e) {
      if (e?.response?.status === 404) toast.error("Induction not found");
      else if (e?.response?.status === 403) toast.error("Access denied");
    } finally { setLoading(false); }
  }, [aid]);
  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    if (!confirm("Delete this induction assignment? All progress will be lost.")) return;
    try {
      await api.delete(`/induction/assignments/${aid}`);
      toast.success("Deleted");
      navigate("/induction");
    } catch { toast.error("Could not delete"); }
  };

  if (loading) return <div className="text-sm text-stone-600 max-w-4xl mx-auto"><Loader2 size={14} className="inline animate-spin" /> Loading…</div>;
  if (!a) return <div className="text-sm text-stone-500 max-w-4xl mx-auto">Induction not found.</div>;

  const isOwnInduction = a.staff_id === user?.id;
  const canEdit = isSeniorOrAbove || isOwnInduction;
  const signedOff = !!a.signed_off_at;
  const progress = a.progress;
  const allComplete = progress.overall_status === "completed";

  return (
    <div className="space-y-5 max-w-4xl mx-auto" data-testid="induction-detail-page">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/induction" className="text-xs text-[#0E3B4A] inline-flex items-center gap-1 mb-2" data-testid="induction-back">
            <ArrowLeft size={12} /> All inductions
          </Link>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
            {a.sector === "adult" ? "Adult Services" : "Children's Services"} · {a.staff_role}
          </div>
          <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">
            {a.staff_name}'s induction
          </h1>
          <p className="text-[#5d6068] mt-1.5 text-[15px]">
            16-section structured checklist. Each section needs progress, evidence (notes or file), and a manager sign-off at the end.
          </p>
        </div>
        {isManagerOrAbove && !signedOff && (
          <button onClick={remove} className="text-xs text-stone-500 hover:text-rose-700 inline-flex items-center gap-1" data-testid="induction-delete">
            <Trash2 size={12} /> Delete
          </button>
        )}
      </header>

      {/* Progress hero */}
      <div className={`rounded-2xl border p-5 ${signedOff ? "bg-emerald-50 border-emerald-200" : allComplete ? "bg-amber-50 border-amber-200" : "bg-white divider-soft"}`}
           data-testid="induction-progress">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase font-semibold tracking-wider text-stone-600">Progress</div>
            <div className="font-display font-semibold text-3xl mt-1 text-[#0F1115]">
              {progress.completion_pct}% <span className="text-base text-stone-500 font-normal">· {progress.complete}/{progress.total} complete</span>
            </div>
          </div>
          {signedOff ? (
            <div className="text-right">
              <div className="text-emerald-800 font-semibold inline-flex items-center gap-1.5">
                <ShieldCheck size={16} /> Signed off
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5">
                by {a.signed_off_by_name} · {(a.signed_off_at || "").slice(0, 10)}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <a className="inline-flex items-center gap-1 text-xs text-[#0E3B4A] underline"
                   href={`/api/induction/assignments/${a.id}/certificate.pdf?token=${encodeURIComponent(localStorage.getItem("token") || "")}`}
                   target="_blank" rel="noreferrer"
                   data-testid="induction-cert-preview">
                  <FileText size={11} /> Preview certificate
                </a>
                <a className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                   href={`/api/induction/assignments/${a.id}/certificate.pdf?token=${encodeURIComponent(localStorage.getItem("token") || "")}`}
                   download={`induction-certificate-${a.staff_name?.replace(/\s+/g, "_")}.pdf`}
                   data-testid="induction-cert-download">
                  <Award size={11} /> Download PDF
                </a>
                {a.hr_file_id && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                        data-testid="induction-hr-file-badge">
                    <CheckCircle2 size={10} /> On HR file
                  </span>
                )}
              </div>
            </div>
          ) : allComplete && isManagerOrAbove ? (
            <Button onClick={() => setShowSignOff(true)} className="bg-amber-700 hover:bg-amber-800 text-white" data-testid="induction-signoff-btn">
              <Award size={14} className="mr-1.5" /> Final manager sign-off
            </Button>
          ) : null}
        </div>
        <div className="mt-3 h-2 bg-stone-200 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
               style={{ width: `${progress.completion_pct}%`,
                        background: signedOff ? "#2F6A3A" : progress.completion_pct === 100 ? "#B8772F" : "#0e3b4a" }} />
        </div>
        {signedOff && a.signed_off_declaration && (
          <div className="mt-3 text-sm text-emerald-900 italic">"{a.signed_off_declaration}"</div>
        )}
      </div>

      {/* Sections */}
      <ul className="space-y-2">
        {a.items.map((item, idx) => (
          <InductionItem
            key={item.key}
            item={item}
            index={idx + 1}
            canEdit={canEdit && !signedOff}
            isManager={isManagerOrAbove}
            assignmentId={a.id}
            onChanged={load}
          />
        ))}
      </ul>

      {showSignOff && (
        <SignOffModal
          onClose={() => setShowSignOff(false)}
          onSaved={() => { setShowSignOff(false); load(); }}
          assignmentId={a.id}
          staffName={a.staff_name}
        />
      )}
    </div>
  );
}


function InductionItem({ item, index, canEdit, isManager, assignmentId, onChanged }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(item.notes || "");
  const [saving, setSaving] = useState(false);
  const tone = STATUS_TONE[item.status] || STATUS_TONE.not_started;
  const isFinalSignoff = item.key === "manager_signoff";
  const canPatchThis = canEdit && (!isFinalSignoff || isManager);

  const updateStatus = async (status) => {
    setSaving(true);
    try {
      await api.patch(`/induction/assignments/${assignmentId}/items/${item.key}`,
                      { status, notes });
      toast.success(`Marked ${STATUS_TONE[status].label.toLowerCase()}`);
      onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
    finally { setSaving(false); }
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await api.patch(`/induction/assignments/${assignmentId}/items/${item.key}`,
                      { notes });
      toast.success("Notes saved");
      onChanged();
    } catch { toast.error("Could not save notes"); }
    finally { setSaving(false); }
  };

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "document");
      const up = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await api.patch(`/induction/assignments/${assignmentId}/items/${item.key}`, {
        evidence_file_id: up.data.id,
        evidence_file_name: up.data.original_name || file.name,
      });
      toast.success("Evidence uploaded");
      onChanged();
    } catch (err) { toast.error(err?.response?.data?.detail || "Upload failed"); }
    finally { setSaving(false); }
  };

  return (
    <li className={`bg-white border-l-4 ${tone.line} border-r border-y divider-soft rounded-xl overflow-hidden`}
        data-testid={`induction-item-${item.key}`}>
      <button onClick={() => setOpen(!open)}
              className="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-stone-50">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="text-stone-400 font-mono text-xs mt-0.5 shrink-0">{String(index).padStart(2, "0")}</span>
          <div className="min-w-0">
            <div className="font-semibold text-[#0F1115] text-sm">
              {item.title}
              {isFinalSignoff && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Manager only</span>}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">{item.description}</div>
            {item.completed_at && (
              <div className="text-[10px] text-emerald-700 mt-1">
                ✓ Completed {item.completed_at.slice(0, 10)} by {item.completed_by_name}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${tone.bg} ${tone.fg}`}>{tone.label}</span>
          <ChevronDown size={14} className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-stone-200 p-4 bg-stone-50 space-y-3" data-testid={`induction-item-body-${item.key}`}>
          {canPatchThis ? (
            <>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant={item.status === "not_started" ? "default" : "outline"}
                        onClick={() => updateStatus("not_started")} disabled={saving}
                        data-testid={`induction-status-not_started-${item.key}`}>
                  Not started
                </Button>
                <Button size="sm" variant={item.status === "in_progress" ? "default" : "outline"}
                        onClick={() => updateStatus("in_progress")} disabled={saving}
                        data-testid={`induction-status-in_progress-${item.key}`}>
                  <Clock3 size={12} className="mr-1" /> In progress
                </Button>
                <Button size="sm" variant={item.status === "completed" ? "default" : "outline"}
                        onClick={() => updateStatus("completed")} disabled={saving}
                        className={item.status === "completed" ? "bg-emerald-700 hover:bg-emerald-800" : ""}
                        data-testid={`induction-status-completed-${item.key}`}>
                  <CheckCircle2 size={12} className="mr-1" /> Complete
                </Button>
              </div>

              <div>
                <div className="text-[11px] uppercase font-semibold tracking-wider text-stone-600 mb-1">
                  Evidence / notes
                </div>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm bg-white" rows={3}
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          placeholder="Briefly describe what was covered, where evidence lives, names of staff involved, dates…"
                          data-testid={`induction-notes-${item.key}`} />
                <div className="flex items-center justify-between mt-2 gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
                    <Upload size={12} />
                    <span>Attach file</span>
                    <input type="file" accept="application/pdf,image/*" className="hidden"
                           onChange={uploadFile} disabled={saving}
                           data-testid={`induction-upload-${item.key}`} />
                  </label>
                  <Button size="sm" onClick={saveNotes} disabled={saving} data-testid={`induction-save-notes-${item.key}`}>
                    {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : <Save size={12} className="mr-1" />}
                    Save notes
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-stone-500 italic">
              Read-only · {item.key === "manager_signoff" ? "manager-only item" : "your manager will update this"}
            </div>
          )}

          {item.notes && !canPatchThis && (
            <div className="text-sm text-stone-700 whitespace-pre-wrap" data-testid={`induction-notes-display-${item.key}`}>
              {item.notes}
            </div>
          )}

          {item.evidence_file_id && (
            <div className="flex items-center gap-1.5 text-xs">
              <FileText size={12} className="text-stone-500" />
              <a className="text-[#0E3B4A] underline inline-flex items-center gap-1"
                 href={`/api/files/${item.evidence_file_id}?token=${encodeURIComponent(localStorage.getItem("token") || "")}`}
                 target="_blank" rel="noreferrer"
                 data-testid={`induction-evidence-link-${item.key}`}>
                {item.evidence_file_name || "Evidence file"} <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      )}
    </li>
  );
}


function SignOffModal({ onClose, onSaved, assignmentId, staffName }) {
  const [declaration, setDeclaration] = useState(
    `I confirm that ${staffName} has completed all 16 sections of the induction checklist with appropriate evidence and is ready to operate on independent shifts.`
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!declaration.trim()) { toast.error("Declaration required"); return; }
    setSaving(true);
    try {
      await api.post(`/induction/assignments/${assignmentId}/sign-off`, { declaration });
      toast.success("Induction signed off");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not sign off"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2" data-testid="induction-signoff-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="font-display font-semibold text-lg">Final manager sign-off</div>
        <Field label="Declaration">
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={5}
                    value={declaration} onChange={e => setDeclaration(e.target.value)}
                    data-testid="induction-signoff-declaration" />
        </Field>
        <div className="text-[11px] text-stone-500">
          After sign-off the checklist becomes read-only and forms part of the staff member's HR file.
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-700 hover:bg-emerald-800"
                  data-testid="induction-signoff-save">
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Award size={14} className="mr-1" />}
            Sign off
          </Button>
        </div>
      </div>
    </div>
  );
}


function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase font-semibold tracking-wider text-stone-600 mb-1">{label}</div>
      {children}
    </label>
  );
}

const COMPLIANCE_TONE = {
  red: "bg-rose-50 text-rose-800 border-rose-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  grey: "bg-stone-50 text-stone-700 border-stone-200",
};

function ComplianceTile({ label, value, sub, tone = "grey", testid }) {
  return (
    <div className={`rounded-xl border p-3 ${COMPLIANCE_TONE[tone]}`} data-testid={testid}>
      <div className="font-display font-semibold text-2xl leading-none">{value}</div>
      <div className="text-[11px] font-semibold mt-1.5">{label}</div>
      {sub && <div className="text-[10px] opacity-80 mt-0.5">{sub}</div>}
    </div>
  );
}
