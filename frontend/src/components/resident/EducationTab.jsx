import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  GraduationCap,
  Loader2,
  Trophy,
  AlertOctagon,
  Plus,
  X,
  Pencil,
  Save,
} from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function attendanceTone(pct) {
  if (pct == null) return { fg: "#8A8A85", bg: "#EAEAE5" };
  if (pct >= 95) return { fg: "#3A5A40", bg: "#3A5A4015" };
  if (pct >= 90) return { fg: "#9C6B3D", bg: "#D4A37322" };
  return { fg: "#B23A48", bg: "#B23A4815" };
}

function isOverdue(d) {
  if (!d) return false;
  return d < todayIso();
}

export default function EducationTab({ resident }) {
  const { user } = useAuth();
  const [edu, setEdu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showExc, setShowExc] = useState(false);
  const [showAch, setShowAch] = useState(false);
  const canManage = user?.role === "manager" || user?.role === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/residents/${resident.id}/education`);
      setEdu(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident.id]);

  if (loading) {
    return (
      <div className="text-center py-10 text-stone-500">
        <Loader2 className="animate-spin inline" />
      </div>
    );
  }

  const a = edu?.attendance_pct;
  const tone = attendanceTone(a);
  const pepOverdue = isOverdue(edu?.next_pep_date);

  return (
    <div className="space-y-5" data-testid="education-content">
      {/* Header card */}
      <section
        className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5 flex items-start gap-5 flex-wrap"
        style={{ borderLeftColor: tone.fg }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: tone.bg, color: tone.fg }}
        >
          <GraduationCap size={28} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
            Education
          </div>
          <div className="font-display font-black text-2xl tracking-tight text-stone-900">
            {edu?.school || "School not set"}
          </div>
          <div className="text-sm text-stone-600">
            {edu?.year_group || "Year group —"}
            {edu?.designated_teacher && ` · DT ${edu.designated_teacher}`}
            {edu?.school_contact && ` · ${edu.school_contact}`}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
              Attendance
            </div>
            <div
              className="font-display font-black text-3xl tabular-nums leading-none"
              style={{ color: tone.fg }}
              data-testid="attendance-pct"
            >
              {a != null ? a.toFixed(1) : "—"}
              <span className="text-sm font-bold ml-0.5">%</span>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              data-testid="edit-education-btn"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 text-stone-700 font-semibold rounded-lg px-3 py-1.5 text-xs border divider-soft"
            >
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>
      </section>

      {/* PEP banner */}
      <section
        className={`rounded-xl p-4 border-l-4 ${
          pepOverdue
            ? "bg-[#B23A48]/8 border-[#B23A48]"
            : "bg-[#1E4D5C]/5 border-[#1E4D5C]"
        }`}
        data-testid="pep-banner"
      >
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
              Last PEP
            </div>
            <div className="font-mono text-sm text-stone-900 tabular-nums">
              {edu?.pep_date || "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
              Next PEP due
            </div>
            <div
              className="font-mono text-sm tabular-nums"
              style={{ color: pepOverdue ? "#B23A48" : "#1C1C1A" }}
            >
              {edu?.next_pep_date || "—"}
              {pepOverdue && <span className="font-display font-bold ml-2">OVERDUE</span>}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
              SENCo
            </div>
            <div className="text-sm">{edu?.senco || "—"}</div>
          </div>
        </div>
      </section>

      {/* Targets / current */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-white border divider-soft rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">
            Target grades
          </div>
          <div className="text-sm text-stone-800 whitespace-pre-wrap">
            {edu?.target_grades || <span className="text-stone-400 italic">Not set</span>}
          </div>
        </div>
        <div className="bg-white border divider-soft rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">
            Current performance
          </div>
          <div className="text-sm text-stone-800 whitespace-pre-wrap">
            {edu?.current_grades || <span className="text-stone-400 italic">Not set</span>}
          </div>
        </div>
        <div className="bg-white border divider-soft rounded-xl p-4 sm:col-span-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">
            Additional support
          </div>
          <div className="text-sm text-stone-800 whitespace-pre-wrap">
            {edu?.additional_support || <span className="text-stone-400 italic">None recorded</span>}
          </div>
        </div>
        {edu?.notes && (
          <div className="bg-stone-50 border divider-soft rounded-xl p-4 sm:col-span-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">
              Notes
            </div>
            <div className="text-sm text-stone-800 whitespace-pre-wrap">{edu.notes}</div>
          </div>
        )}
      </div>

      {/* Achievements */}
      <section>
        <header className="flex items-center justify-between mb-2">
          <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#3A5A40] inline-flex items-center gap-2">
            <Trophy size={14} /> Achievements ({edu?.achievements?.length || 0})
          </h3>
          <button
            type="button"
            onClick={() => setShowAch(true)}
            data-testid="add-achievement-btn"
            className="inline-flex items-center gap-1.5 bg-[#3A5A40] hover:bg-[#2C4A33] text-white font-semibold rounded-lg px-3 py-1.5 text-xs"
          >
            <Plus size={13} /> Add
          </button>
        </header>
        {!edu?.achievements?.length ? (
          <div className="text-sm text-stone-500 italic">None recorded yet.</div>
        ) : (
          <ul className="space-y-2">
            {edu.achievements
              .slice()
              .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
              .map((ach, i) => (
                <li
                  key={i}
                  className="bg-white border-l-4 border-l-[#3A5A40] border-y border-r divider-soft rounded-xl p-3.5"
                >
                  <div className="font-mono text-[11px] text-stone-500 tabular-nums">
                    {ach.date}
                  </div>
                  <div className="font-semibold text-sm text-stone-900">{ach.title}</div>
                  {ach.notes && <div className="text-xs text-stone-600 mt-0.5">{ach.notes}</div>}
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* Exclusions */}
      <section>
        <header className="flex items-center justify-between mb-2">
          <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#B23A48] inline-flex items-center gap-2">
            <AlertOctagon size={14} /> Exclusions ({edu?.exclusions?.length || 0})
          </h3>
          <button
            type="button"
            onClick={() => setShowExc(true)}
            data-testid="add-exclusion-btn"
            className="inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 text-[#B23A48] border-2 border-[#B23A48]/30 font-semibold rounded-lg px-3 py-1.5 text-xs"
          >
            <Plus size={13} /> Add
          </button>
        </header>
        {!edu?.exclusions?.length ? (
          <div className="text-sm text-stone-500 italic">None recorded.</div>
        ) : (
          <ul className="space-y-2">
            {edu.exclusions
              .slice()
              .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
              .map((ex, i) => (
                <li
                  key={i}
                  className="bg-white border-l-4 border-l-[#B23A48] border-y border-r divider-soft rounded-xl p-3.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white bg-[#B23A48]"
                    >
                      {ex.type?.replace("_", " ") || "fixed-term"}
                      {ex.days && ` · ${ex.days} day${ex.days === 1 ? "" : "s"}`}
                    </span>
                    <span className="font-mono text-[11px] text-stone-500 tabular-nums">{ex.date}</span>
                  </div>
                  <div className="text-sm text-stone-800 mt-1.5">{ex.reason}</div>
                </li>
              ))}
          </ul>
        )}
      </section>

      {editing && (
        <EditModal edu={edu || {}} residentId={resident.id} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
      )}
      {showAch && (
        <AddAchievementModal residentId={resident.id} onClose={() => setShowAch(false)} onSaved={() => { setShowAch(false); load(); }} />
      )}
      {showExc && (
        <AddExclusionModal residentId={resident.id} onClose={() => setShowExc(false)} onSaved={() => { setShowExc(false); load(); }} />
      )}
    </div>
  );
}

function ModalShell({ title, onClose, onSubmit, busy, children, testid, submitLabel = "Save" }) {
  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl border divider-soft space-y-3"
        data-testid={testid}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-xl text-stone-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-900 p-1 rounded">
            <X size={18} />
          </button>
        </div>
        {children}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-[#1E4D5C] hover:bg-[#163A47] disabled:opacity-50 text-white font-bold rounded-xl px-6 py-3 mt-1 inline-flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {submitLabel}
        </button>
      </form>
    </div>
  );
}

function EditModal({ edu, residentId, onClose, onSaved }) {
  const [f, setF] = useState({
    school: edu.school || "",
    school_contact: edu.school_contact || "",
    year_group: edu.year_group || "",
    senco: edu.senco || "",
    designated_teacher: edu.designated_teacher || "",
    pep_date: edu.pep_date || "",
    next_pep_date: edu.next_pep_date || "",
    attendance_pct: edu.attendance_pct ?? "",
    target_grades: edu.target_grades || "",
    current_grades: edu.current_grades || "",
    additional_support: edu.additional_support || "",
    notes: edu.notes || "",
    exclusions: edu.exclusions || [],
    achievements: edu.achievements || [],
    has_ehcp: edu.has_ehcp || false,
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        ...f,
        attendance_pct: f.attendance_pct === "" ? null : Number(f.attendance_pct),
      };
      await api.put(`/residents/${residentId}/education`, payload);
      toast.success("Education record saved");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Edit education" onClose={onClose} onSubmit={submit} busy={busy} testid="edit-education-modal">
      <input placeholder="School" value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} data-testid="edu-school" className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Year group" value={f.year_group} onChange={(e) => setF({ ...f, year_group: e.target.value })} className={inputCls} />
        <input placeholder="Attendance %" type="number" step="0.1" value={f.attendance_pct} onChange={(e) => setF({ ...f, attendance_pct: e.target.value })} data-testid="edu-attendance" className={inputCls} />
      </div>
      <input placeholder="School contact" value={f.school_contact} onChange={(e) => setF({ ...f, school_contact: e.target.value })} className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="SENCo" value={f.senco} onChange={(e) => setF({ ...f, senco: e.target.value })} className={inputCls} />
        <input placeholder="Designated teacher" value={f.designated_teacher} onChange={(e) => setF({ ...f, designated_teacher: e.target.value })} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Last PEP</div>
          <input type="date" value={f.pep_date} onChange={(e) => setF({ ...f, pep_date: e.target.value })} className={inputCls} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Next PEP</div>
          <input type="date" value={f.next_pep_date} onChange={(e) => setF({ ...f, next_pep_date: e.target.value })} data-testid="edu-next-pep" className={inputCls} />
        </div>
      </div>
      <textarea rows={2} placeholder="Target grades / outcomes" value={f.target_grades} onChange={(e) => setF({ ...f, target_grades: e.target.value })} className={`${inputCls} resize-none`} />
      <textarea rows={2} placeholder="Current grades / performance" value={f.current_grades} onChange={(e) => setF({ ...f, current_grades: e.target.value })} className={`${inputCls} resize-none`} />
      <textarea rows={2} placeholder="Additional support" value={f.additional_support} onChange={(e) => setF({ ...f, additional_support: e.target.value })} className={`${inputCls} resize-none`} />
      <textarea rows={2} placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${inputCls} resize-none`} />
    </ModalShell>
  );
}

function AddAchievementModal({ residentId, onClose, onSaved }) {
  const [f, setF] = useState({ date: todayIso(), title: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/residents/${residentId}/education/achievements`, f);
      toast.success("Achievement added");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="New achievement" onClose={onClose} onSubmit={submit} busy={busy} testid="add-achievement-modal">
      <input required type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} />
      <input required placeholder="Title (e.g. Top of class in Maths)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="ach-title" className={inputCls} />
      <textarea rows={2} placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${inputCls} resize-none`} />
    </ModalShell>
  );
}

function AddExclusionModal({ residentId, onClose, onSaved }) {
  const [f, setF] = useState({ date: todayIso(), reason: "", days: 1, type: "fixed_term" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/residents/${residentId}/education/exclusions`, {
        ...f,
        days: Number(f.days) || null,
      });
      toast.success("Exclusion added");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Record exclusion" onClose={onClose} onSubmit={submit} busy={busy} testid="add-exclusion-modal">
      <div className="grid grid-cols-2 gap-2">
        <input required type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} />
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inputCls}>
          <option value="fixed_term">Fixed-term</option>
          <option value="permanent">Permanent</option>
          <option value="internal">Internal</option>
        </select>
      </div>
      <input type="number" placeholder="Days (if fixed-term)" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} className={inputCls} />
      <textarea required rows={3} placeholder="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} data-testid="exc-reason" className={`${inputCls} resize-none`} />
    </ModalShell>
  );
}
