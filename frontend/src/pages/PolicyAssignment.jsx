/* Phase H — Policy Assignment Workflow
 *
 * Single page that hosts the whole Read → Assess → Sign → Manager-sign lifecycle.
 * Same URL for both staff (who own the assignment) and managers (who countersign).
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FileText, CheckCircle2, AlertTriangle, Loader2, ChevronLeft,
  ShieldCheck, PenLine, GraduationCap, Calendar,
} from "lucide-react";
import { StatusPill } from "@/pages/InductionPolicyHub";

const STAFF_DECLARATION =
  "I confirm I have read, understood and will follow this policy in my day-to-day practice.";
const MANAGER_DECLARATION =
  "I have discussed this policy with the employee and am satisfied they understand the contents.";

export default function PolicyAssignment() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, isManagerOrAbove } = useAuth();
  const [a, setA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState("read");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/policy-assignments/${id}`);
      setA(r.data);
      const s = r.data.status;
      if (s === "complete") setStage("complete");
      else if (s === "awaiting_manager_sign_off") setStage("manager_sign");
      else if (s === "awaiting_staff_signature") setStage("staff_sign");
      else if (s === "assessment_pending" || r.data.opened_at) setStage("assess");
      else setStage("read");
    } catch {
      toast.error("Could not load assignment.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const open = async () => {
    if (a.opened_at) return setStage("assess");
    setBusy(true);
    try {
      await api.post(`/policy-assignments/${id}/open`);
      await load();
      setStage("assess");
    } catch { toast.error("Could not start assessment."); }
    finally { setBusy(false); }
  };

  if (loading || !a) {
    return (
      <div className="bg-white border divider-soft rounded-2xl p-6 inline-flex items-center gap-2 text-stone-600 text-sm">
        <Loader2 size={14} className="animate-spin" /> Loading assignment…
      </div>
    );
  }

  const isMine = a.staff_id === user?.id;
  const canSign = isMine && a.assessment_passed_at && !a.staff_sig_at;
  const canCountersign = isManagerOrAbove && a.staff_sig_at && !a.manager_sig_at;

  return (
    <div className="space-y-4 max-w-4xl mx-auto" data-testid="policy-assignment-page">
      <button
        onClick={() => nav(-1)}
        className="text-[12px] font-semibold text-[#0e3b4a] hover:underline inline-flex items-center gap-1"
        data-testid="back-from-assignment"
      >
        <ChevronLeft size={12} /> Back
      </button>

      <header className="bg-white border divider-soft rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500">
              {a.policy_sector === "adult" ? "Adult Services" : "Children's Services"} · {a.policy_category}
            </div>
            <h1 className="font-display font-semibold text-2xl text-[#0F1115] mt-1">
              {a.policy_title}
            </h1>
            <div className="text-[12px] text-stone-600 mt-1.5">
              Assigned to <strong>{a.staff_name}</strong>
              {a.due_date && <> · due {(a.due_date || "").slice(0, 10)}</>}
              {a.version && <> · v{a.version.version}</>}
            </div>
          </div>
          <StatusPill status={a.status} />
        </div>
      </header>

      {/* Stepper */}
      <div className="bg-white border divider-soft rounded-2xl p-3 flex items-center gap-1 flex-wrap text-[11px] font-bold uppercase tracking-wider"
           data-testid="assignment-stepper">
        {[
          { id: "read",         label: "1. Read policy",    done: !!a.opened_at },
          { id: "assess",       label: "2. Assessment",     done: !!a.assessment_passed_at },
          { id: "staff_sign",   label: "3. Staff signature", done: !!a.staff_sig_at },
          { id: "manager_sign", label: "4. Manager sign-off", done: !!a.manager_sig_at },
        ].map((s, i) => (
          <span
            key={s.id}
            data-testid={`step-${s.id}`}
            className={`px-2 py-1 rounded-full ${
              s.done
                ? "bg-[#E7F3EC] text-[#1f4f2b]"
                : stage === s.id
                ? "bg-[#0e3b4a] text-white"
                : "bg-stone-100 text-stone-500"
            }`}
          >
            {s.done && <CheckCircle2 size={10} className="inline mr-1 mb-0.5" />}
            {s.label}
          </span>
        ))}
      </div>

      {/* Stage views */}
      {stage === "read" && (
        <ReadStage a={a} isMine={isMine} onContinue={open} busy={busy} />
      )}
      {stage === "assess" && (
        <AssessStage a={a} isMine={isMine} onSubmitted={load} />
      )}
      {stage === "staff_sign" && (
        <SignStage
          who="staff"
          canSign={canSign}
          declaration={STAFF_DECLARATION}
          existing={a.staff_sig_at ? { at: a.staff_sig_at, name: a.staff_sig_name } : null}
          onSubmit={async (name, signature) => {
            await api.post(`/policy-assignments/${id}/staff-sign`, { name, signature });
            toast.success("Declaration recorded. Manager will countersign.");
            load();
          }}
        />
      )}
      {stage === "manager_sign" && (
        <SignStage
          who="manager"
          canSign={canCountersign}
          declaration={MANAGER_DECLARATION}
          staffSignature={a.staff_sig_at ? { at: a.staff_sig_at, name: a.staff_sig_name } : null}
          existing={a.manager_sig_at ? { at: a.manager_sig_at, name: a.manager_sig_by_name } : null}
          onSubmit={async (name, signature) => {
            await api.post(`/policy-assignments/${id}/manager-sign`, { name, signature });
            toast.success("Countersignature recorded. Complete.");
            load();
          }}
        />
      )}
      {stage === "complete" && <CompleteStage a={a} />}
    </div>
  );
}


function ReadStage({ a, isMine, onContinue, busy }) {
  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="read-stage">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={14} className="text-[#0e3b4a]" />
        <h2 className="font-display font-semibold text-lg text-[#0F1115]">Read the policy</h2>
      </div>
      {a.version?.content_text ? (
        <div className="text-[13px] text-stone-800 whitespace-pre-line bg-stone-50 border divider-soft rounded-lg p-4 max-h-96 overflow-y-auto"
             data-testid="policy-content-text">
          {a.version.content_text}
        </div>
      ) : a.version?.file_id ? (
        <div className="text-[13px] text-stone-700 bg-stone-50 border divider-soft rounded-lg p-4">
          The policy document is attached. Open and read it in full before continuing.
          <div className="mt-2">
            <a
              href={`${process.env.REACT_APP_BACKEND_URL || ""}/api/uploads/${a.version.file_id}/download`}
              target="_blank" rel="noopener noreferrer"
              data-testid="policy-file-link"
              className="text-[#0e3b4a] font-semibold hover:underline"
            >
              Open attached file →
            </a>
          </div>
        </div>
      ) : (
        <div className="text-[13px] text-stone-500 italic py-3">
          No file or text attached. Speak to your manager.
        </div>
      )}
      {isMine && (
        <div className="mt-4">
          <Button
            onClick={onContinue}
            disabled={busy}
            data-testid="start-assessment-btn"
            className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-9"
          >
            {busy ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <GraduationCap size={12} className="mr-1.5" />}
            I've read it — start assessment
          </Button>
        </div>
      )}
    </section>
  );
}


function AssessStage({ a, isMine, onSubmitted }) {
  const [answers, setAnswers] = useState(() => {
    const m = {};
    (a.questions || []).forEach((q) => {
      m[q.id] = q.type === "mcq" ? { question_id: q.id, selected_index: null }
                                 : { question_id: q.id, answer_text: "" };
    });
    return m;
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const allMcqAnswered = (a.questions || []).filter((q) => q.type === "mcq")
    .every((q) => answers[q.id]?.selected_index !== null && answers[q.id]?.selected_index !== undefined);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/policy-assignments/${a.id}/assessment`, {
        answers: Object.values(answers),
      });
      setResult(r.data.result);
      if (r.data.result.passed) {
        toast.success(`Passed! ${r.data.result.score_pct}%`);
        setTimeout(onSubmitted, 1000);
      } else {
        toast.error(`Not passed yet. Score: ${r.data.result.score_pct}% — review and retake.`);
      }
    } catch { toast.error("Could not submit assessment."); }
    finally { setBusy(false); }
  };

  if (!a.questions || a.questions.length === 0) {
    return (
      <section className="bg-white border divider-soft rounded-2xl p-5">
        <div className="text-[13px] text-stone-500 py-3">
          No assessment configured for this policy. Speak to your manager — they may need to add MCQ/reflection questions.
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white border divider-soft rounded-2xl p-5" data-testid="assess-stage">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap size={14} className="text-[#0e3b4a]" />
        <h2 className="font-display font-semibold text-lg text-[#0F1115]">Knowledge assessment</h2>
      </div>
      <p className="text-[12px] text-stone-500 mb-3">
        Score 80% or above on the multiple-choice section to unlock the signature step. Reflection questions are stored for your manager.
      </p>
      <div className="space-y-3">
        {(a.questions || []).map((q, i) => (
          <div key={q.id} className="border divider-soft rounded-xl p-3" data-testid={`assess-q-${i}`}>
            <div className="text-[11px] uppercase tracking-wider font-bold text-stone-500 mb-1">
              Question {i + 1} · {q.type === "mcq" ? "Multiple choice" : "Reflection"}
            </div>
            <div className="text-sm font-semibold text-stone-900 mb-2">{q.question}</div>
            {q.type === "mcq" ? (
              <div className="space-y-1">
                {(q.options || []).map((opt, oi) => (
                  <label key={oi} className="flex items-center gap-2 cursor-pointer hover:bg-stone-50 px-2 py-1 rounded">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={answers[q.id]?.selected_index === oi}
                      onChange={() => setAnswers({ ...answers, [q.id]: { question_id: q.id, selected_index: oi } })}
                      data-testid={`assess-q-${i}-opt-${oi}`}
                      disabled={!isMine}
                      className="accent-[#0e3b4a]"
                    />
                    <span className="text-[13px]">{opt}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                value={answers[q.id]?.answer_text || ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: { question_id: q.id, answer_text: e.target.value } })}
                rows={3}
                placeholder="Your reflection"
                data-testid={`assess-q-${i}-text`}
                disabled={!isMine}
                className="w-full px-3 py-2 border divider-soft rounded-lg text-sm"
              />
            )}
          </div>
        ))}
      </div>

      {result && !result.passed && (
        <div className="mt-3 p-3 rounded-xl border border-[#A8273A]/30 bg-[#FBE3E7] text-[#7a1a28] text-[12px]"
             data-testid="assess-result-fail">
          Not yet — you scored {result.score_pct}% ({result.mcq_correct}/{result.mcq_total}).
          Review the policy and try again.
        </div>
      )}
      {result && result.passed && (
        <div className="mt-3 p-3 rounded-xl border border-[#2F6A3A]/30 bg-[#E7F3EC] text-[#1f4f2b] text-[12px]"
             data-testid="assess-result-pass">
          Passed at {result.score_pct}%. Moving to signature step…
        </div>
      )}

      {isMine && (
        <div className="mt-4">
          <Button
            onClick={submit}
            disabled={busy || !allMcqAnswered}
            data-testid="submit-assessment-btn"
            className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-9"
          >
            {busy ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <CheckCircle2 size={12} className="mr-1.5" />}
            Submit assessment
          </Button>
        </div>
      )}
    </section>
  );
}


function SignStage({ who, canSign, declaration, existing, staffSignature, onSubmit }) {
  const [name, setName] = useState("");
  const [sig, setSig] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !sig.trim()) {
      toast.error("Name and signature are required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(name.trim(), sig.trim());
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not sign.");
    } finally { setBusy(false); }
  };

  return (
    <section className="bg-white border divider-soft rounded-2xl p-5"
             data-testid={`sign-stage-${who}`}>
      <div className="flex items-center gap-2 mb-3">
        {who === "staff" ? <PenLine size={14} className="text-[#0e3b4a]" />
                         : <ShieldCheck size={14} className="text-[#0e3b4a]" />}
        <h2 className="font-display font-semibold text-lg text-[#0F1115]">
          {who === "staff" ? "Staff declaration" : "Manager countersignature"}
        </h2>
      </div>

      {staffSignature && who === "manager" && (
        <div className="mb-3 p-3 rounded-xl border divider-soft bg-stone-50">
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500">Staff declaration</div>
          <div className="text-[13px] text-stone-800 mt-1 italic">"{STAFF_DECLARATION}"</div>
          <div className="text-[11px] text-stone-500 mt-1">
            Signed by <strong>{staffSignature.name}</strong> · {(staffSignature.at || "").slice(0, 16).replace("T", " ")}
          </div>
        </div>
      )}

      <div className="p-3 rounded-xl border-2 border-[#0e3b4a]/20 bg-[#0e3b4a]/5">
        <div className="text-[10px] uppercase tracking-wider font-bold text-[#0e3b4a]">Declaration</div>
        <div className="text-[13px] text-stone-800 mt-1 italic">"{declaration}"</div>
      </div>

      {existing ? (
        <div className="mt-3 p-3 rounded-xl border border-[#2F6A3A]/30 bg-[#E7F3EC] text-[#1f4f2b] text-[12px]">
          Signed by <strong>{existing.name}</strong> · {(existing.at || "").slice(0, 16).replace("T", " ")}
        </div>
      ) : !canSign ? (
        <div className="mt-3 text-[12px] text-stone-500">
          {who === "staff"
            ? "Pass the assessment first to unlock this step."
            : "Waiting for the staff declaration before you can countersign."}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="Your full name"
                   data-testid={`sig-name-${who}`}
                   className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500">Type your signature</span>
            <input value={sig} onChange={(e) => setSig(e.target.value)}
                   placeholder="Type your name to sign"
                   data-testid={`sig-input-${who}`}
                   className="mt-1 w-full px-3 py-2 border divider-soft rounded-lg text-sm font-serif italic" />
          </label>
          <div className="text-[11px] text-stone-500 inline-flex items-center gap-1">
            <Calendar size={11} /> Today's date and your IP will be captured for audit.
          </div>
          <Button
            onClick={submit}
            disabled={busy || !name.trim() || !sig.trim()}
            data-testid={`sig-submit-${who}`}
            className="bg-[#0e3b4a] hover:bg-[#0a2d39] text-white text-[12px] h-9"
          >
            {busy ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <PenLine size={12} className="mr-1.5" />}
            {who === "staff" ? "Sign declaration" : "Countersign"}
          </Button>
        </div>
      )}
    </section>
  );
}


function CompleteStage({ a }) {
  return (
    <section className="bg-white border-2 border-[#2F6A3A]/30 rounded-2xl p-5 bg-gradient-to-br from-[#E7F3EC]/40 to-white"
             data-testid="complete-stage">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 size={18} className="text-[#1f4f2b]" />
        <h2 className="font-display font-semibold text-lg text-[#1f4f2b]">Complete</h2>
      </div>
      <p className="text-[13px] text-stone-700 mb-3">
        This policy assignment is fully signed and audit-logged.
        It will appear on the staff member's inspection evidence pack.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="p-3 border divider-soft rounded-xl bg-white">
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500">Staff</div>
          <div className="text-sm font-semibold mt-1">{a.staff_sig_name}</div>
          <div className="text-[11px] text-stone-500 mt-0.5">{(a.staff_sig_at || "").slice(0, 16).replace("T", " ")}</div>
          <div className="text-[11px] text-stone-500 mt-1">Assessment: {a.assessment_score}%</div>
        </div>
        <div className="p-3 border divider-soft rounded-xl bg-white">
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500">Manager</div>
          <div className="text-sm font-semibold mt-1">{a.manager_sig_by_name}</div>
          <div className="text-[11px] text-stone-500 mt-0.5">{(a.manager_sig_at || "").slice(0, 16).replace("T", " ")}</div>
        </div>
      </div>
    </section>
  );
}
