import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  ArrowLeft,
  Pencil,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  Download,
  HeartHandshake,
  Quote,
} from "lucide-react";
import { toast } from "sonner";

const Section = ({ title, children, testid }) => (
  <section
    className="bg-white border divider-soft rounded-2xl p-5 sm:p-6"
    data-testid={testid}
  >
    <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#5a3d8c] mb-3">
      {title}
    </h3>
    <div>{children}</div>
  </section>
);

export default function KeyWorkSessionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isManagerOrAbove, isSeniorOrAbove } = useAuth();
  const [s, setS] = useState(null);
  const [resident, setResident] = useState(null);
  const [frameworks, setFrameworks] = useState({});
  const [packs, setPacks] = useState({});
  const [prompts, setPrompts] = useState({});
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data }, fw, rp, pr] = await Promise.all([
          api.get(`/key-work/sessions/${id}`),
          api.get("/frameworks"),
          api.get("/resource-packs"),
          api.get("/guided-prompts"),
        ]);
        setS(data);
        setFrameworks(Object.fromEntries((fw.data || []).map((f) => [f.id, f])));
        setPacks(Object.fromEntries((rp.data || []).map((p) => [p.id, p])));
        setPrompts(Object.fromEntries((pr.data || []).map((p) => [p.id, p])));
        const r = await api.get(`/residents/${data.resident_id}`);
        setResident(r.data);
      } catch (e) {
        toast.error("Could not load session");
        nav("/key-work");
      }
    };
    load();
  }, [id, nav]);

  const downloadPdf = async () => {
    try {
      const r = await api.get(`/key-work/sessions/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Safelyn_KeyWork_${(resident?.name || "session").replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not generate PDF");
    }
  };

  const signOff = async () => {
    const note = window.prompt("Optional manager comments:") || "";
    setSigning(true);
    try {
      const r = await api.post(`/key-work/sessions/${id}/sign-off`, { manager_comments: note });
      setS(r.data);
      toast.success("Session signed off");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Sign-off failed");
    } finally {
      setSigning(false);
    }
  };

  if (!s) {
    return (
      <div className="text-center py-16 text-stone-500">
        <Loader2 className="animate-spin inline" />
      </div>
    );
  }

  const requiresSignOff =
    s.safeguarding_flag ||
    s.topic_id === "topic_safeguarding_exploitation" ||
    s.topic_id === "topic_missing_prevention";
  const awaitingSignOff = s.status === "completed" && requiresSignOff && !s.signed_off_at;

  return (
    <div className="space-y-5 max-w-5xl mx-auto" data-testid="kw-session-detail">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="text-sm text-[#5d6068] hover:text-[#0F1115] inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <span className="ml-auto inline-flex gap-2">
          {isSeniorOrAbove && (
            <Link
              to={`/key-work/${id}/edit`}
              data-testid="kw-detail-edit-btn"
              className="bg-white border divider-soft rounded-xl px-3 py-2 text-xs font-semibold inline-flex items-center gap-1 hover:bg-stone-50"
            >
              <Pencil size={12} /> Edit
            </Link>
          )}
          <button
            type="button"
            onClick={downloadPdf}
            data-testid="kw-detail-pdf-btn"
            className="bg-white border divider-soft rounded-xl px-3 py-2 text-xs font-semibold inline-flex items-center gap-1 hover:bg-stone-50"
          >
            <Download size={12} /> PDF
          </button>
          {awaitingSignOff && isManagerOrAbove && (
            <button
              type="button"
              onClick={signOff}
              disabled={signing}
              data-testid="kw-detail-signoff-btn"
              className="bg-[#3A5A40] hover:bg-[#2C4630] disabled:opacity-50 text-white text-xs font-semibold rounded-xl px-3 py-2 inline-flex items-center gap-1"
            >
              {signing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Sign off
            </button>
          )}
        </span>
      </div>

      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a3d8c]">
          Therapeutic practice · Key work session
        </div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">
          {s.topic_label || "Untitled session"}
        </h1>
        <div className="text-sm text-[#5d6068] mt-1.5 flex flex-wrap items-center gap-2">
          {resident && (
            <Link to={`/residents/${resident.id}`} className="font-semibold text-[#0e3b4a] hover:underline">
              {resident.name}
            </Link>
          )}
          {s.facilitator_name && <span>· Facilitated by {s.facilitator_name}</span>}
          {s.status && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-stone-100">
              {s.status}
            </span>
          )}
          {s.safeguarding_flag && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#A8273A]/10 text-[#A8273A] inline-flex items-center gap-1">
              <ShieldAlert size={9} /> Safeguarding
            </span>
          )}
          {s.signed_off_at && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#3A5A40]/15 text-[#3A5A40] inline-flex items-center gap-1">
              <CheckCircle2 size={9} /> Signed off · {s.signed_off_by_name}
            </span>
          )}
        </div>
      </header>

      {(s.frameworks_applied?.length > 0 || s.resource_pack_ids?.length > 0) && (
        <Section title="Frameworks & resources used" testid="kw-detail-frameworks">
          <div className="flex flex-wrap gap-1.5">
            {(s.frameworks_applied || []).map((id) => (
              <Link
                key={id}
                to={`/frameworks/${id}`}
                className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#0e3b4a]/10 text-[#0e3b4a]"
              >
                {frameworks[id]?.short_name || id}
              </Link>
            ))}
            {(s.resource_pack_ids || []).map((id) => (
              <Link
                key={id}
                to={`/resources/${id}`}
                className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#5a3d8c]/10 text-[#5a3d8c]"
              >
                {packs[id]?.title || id}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {s.plan && (
        <Section title="Session plan" testid="kw-detail-plan">
          <p className="text-sm text-stone-800 whitespace-pre-wrap">{s.plan}</p>
        </Section>
      )}

      {s.goals?.length > 0 && (
        <Section title="Goals" testid="kw-detail-goals">
          <ul className="space-y-1.5">
            {s.goals.map((g, i) => {
              const symbol = { met: "✓", progress: "→", open: "○", unmet: "✗" }[g.status] || "○";
              const tone = {
                met: "text-[#3A5A40]",
                progress: "text-[#B8772F]",
                open: "text-[#5d6068]",
                unmet: "text-[#A8273A]",
              }[g.status];
              return (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className={`font-bold ${tone}`}>{symbol}</span>
                  <span className="flex-1">{g.text}</span>
                  <span className="text-[10px] uppercase tracking-wider text-[#5d6068]">
                    {g.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {s.discussion && (
        <Section title="What was discussed" testid="kw-detail-discussion">
          <p className="text-sm text-stone-800 whitespace-pre-wrap">{s.discussion}</p>
        </Section>
      )}

      {s.young_person_voice && (
        <Section title="Young person's voice" testid="kw-detail-yp-voice">
          <blockquote className="border-l-4 border-[#5a3d8c] pl-3 text-sm italic text-stone-800">
            <Quote size={12} className="inline text-[#5a3d8c]" /> {s.young_person_voice}
          </blockquote>
        </Section>
      )}

      {s.staff_reflection && (
        <Section title="Staff reflection" testid="kw-detail-reflection">
          <p className="text-sm text-stone-800 whitespace-pre-wrap">{s.staff_reflection}</p>
        </Section>
      )}

      {s.outcomes && (
        <Section title="Outcomes" testid="kw-detail-outcomes">
          <p className="text-sm text-stone-800 whitespace-pre-wrap">{s.outcomes}</p>
        </Section>
      )}

      {s.follow_up_actions?.length > 0 && (
        <Section title="Follow-up actions" testid="kw-detail-actions">
          <ul className="space-y-1.5">
            {s.follow_up_actions.map((a, i) => (
              <li key={i} className="text-sm flex flex-wrap items-center gap-2">
                <span>• {a.text}</span>
                {a.owner_name && (
                  <span className="text-xs text-[#5d6068]">— {a.owner_name}</span>
                )}
                {a.due_date && (
                  <span className="text-xs text-[#5d6068]">· due {a.due_date}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {Object.keys(s.prompt_responses || {}).length > 0 && (
        <Section title="Guided prompt responses" testid="kw-detail-prompts">
          <ul className="space-y-3">
            {Object.entries(s.prompt_responses).map(([pid, resp]) => (
              <li key={pid}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#5d6068]">
                  {prompts[pid]?.text || pid}
                </div>
                <p className="text-sm text-stone-800 mt-0.5 whitespace-pre-wrap">{resp}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
