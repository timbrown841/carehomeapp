import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { ArrowLeft, BookOpen, Loader2 } from "lucide-react";

export function FrameworksList() {
  const [frameworks, setFrameworks] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .get("/frameworks")
      .then((r) => setFrameworks(r.data || []))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="space-y-5 max-w-5xl mx-auto" data-testid="frameworks-list">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          Therapeutic practice · Frameworks
        </div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">
          Frameworks library
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          Evidence-informed frameworks to draw on in key work, risk assessments and support plans. They guide
          practice — they don't replace your professional judgement.
        </p>
      </header>
      {loading ? (
        <div className="text-center py-12 text-stone-500">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3" data-testid="frameworks-grid">
          {frameworks.map((f) => (
            <li key={f.id}>
              <Link
                to={`/frameworks/${f.id}`}
                data-testid={`framework-card-${f.id}`}
                className="block bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4 hover:bg-stone-50 transition-colors"
                style={{ borderLeftColor: "#0e3b4a" }}
              >
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-[#0e3b4a]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                    {f.theorist}
                  </span>
                </div>
                <div className="font-display font-semibold text-base text-[#0F1115] mt-1">
                  {f.name}
                </div>
                <p className="text-xs text-[#5d6068] mt-1.5 line-clamp-3">{f.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FrameworkDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [fw, setFw] = useState(null);
  useEffect(() => {
    api.get(`/frameworks/${id}`).then((r) => setFw(r.data)).catch(() => nav("/frameworks"));
  }, [id, nav]);
  if (!fw) {
    return (
      <div className="text-center py-12 text-stone-500">
        <Loader2 className="animate-spin inline" />
      </div>
    );
  }
  return (
    <div className="space-y-5 max-w-3xl mx-auto" data-testid="framework-detail">
      <button
        type="button"
        onClick={() => nav(-1)}
        className="text-sm text-[#5d6068] hover:text-[#0F1115] inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> Back
      </button>
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">{fw.theorist}</div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">{fw.name}</h1>
        <p className="text-[#0F1115] mt-3 text-[15px] leading-relaxed">{fw.summary}</p>
      </header>

      <Section title="Key concepts">
        <ul className="space-y-3">
          {(fw.key_concepts || []).map((c, i) => (
            <li key={i}>
              <div className="text-sm font-semibold text-[#0F1115]">{c.label}</div>
              <p className="text-sm text-[#5d6068]">{c.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="When to use">
        <ul className="space-y-1.5">
          {(fw.when_to_use || []).map((t, i) => (
            <li key={i} className="text-sm">• {t}</li>
          ))}
        </ul>
      </Section>

      {(fw.cautions || []).length > 0 && (
        <Section title="Cautions" tone="#A8273A">
          <ul className="space-y-1.5">
            {fw.cautions.map((t, i) => (
              <li key={i} className="text-sm">• {t}</li>
            ))}
          </ul>
        </Section>
      )}

      {(fw.references || []).length > 0 && (
        <Section title="References">
          <ul className="text-xs text-[#5d6068] space-y-1">
            {fw.references.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, tone = "#5a3d8c", children }) {
  return (
    <section
      className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5"
      style={{ borderLeftColor: tone }}
    >
      <h3 className="font-display font-bold text-sm uppercase tracking-wider mb-3" style={{ color: tone }}>
        {title}
      </h3>
      {children}
    </section>
  );
}
