import { useEffect, useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { ArrowLeft, Library, Loader2, Filter } from "lucide-react";

const SECTION_ICON = {
  session_idea: "🎯",
  worksheet: "📝",
  activity: "🤸",
  reflection_prompt: "🪞",
  discussion_prompt: "💬",
};

const SECTION_LABEL = {
  session_idea: "Session idea",
  worksheet: "Worksheet",
  activity: "Activity",
  reflection_prompt: "Reflection prompt",
  discussion_prompt: "Discussion prompt",
};

export function ResourcesList() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState("");

  useEffect(() => {
    api
      .get(theme ? `/resource-packs?theme=${theme}` : "/resource-packs")
      .then((r) => setPacks(r.data || []))
      .finally(() => setLoading(false));
  }, [theme]);

  const themes = useMemo(() => {
    const s = new Set(packs.map((p) => p.theme));
    return Array.from(s).sort();
  }, [packs]);

  return (
    <div className="space-y-5 max-w-5xl mx-auto" data-testid="resources-list">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a3d8c]">
          Therapeutic practice · Resources
        </div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">
          Resource packs
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          Practical session ideas, worksheets, activities and prompts — themed by need. Use as a starting point.
        </p>
      </header>

      <div className="flex items-center gap-2 flex-wrap" data-testid="resources-filter-bar">
        <Filter size={13} className="text-[#5d6068]" />
        <button
          type="button"
          onClick={() => setTheme("")}
          className={`text-xs rounded-full px-3 py-1 font-semibold ${
            theme === "" ? "bg-[#5a3d8c] text-white" : "bg-stone-100 text-[#5d6068] hover:bg-stone-200"
          }`}
        >
          All
        </button>
        {themes.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTheme(t)}
            className={`text-xs rounded-full px-3 py-1 font-semibold ${
              theme === t ? "bg-[#5a3d8c] text-white" : "bg-stone-100 text-[#5d6068] hover:bg-stone-200"
            }`}
          >
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-stone-500">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3" data-testid="resources-grid">
          {packs.map((p) => (
            <li key={p.id}>
              <Link
                to={`/resources/${p.id}`}
                data-testid={`resource-card-${p.id}`}
                className="block bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4 hover:bg-stone-50 transition-colors"
                style={{ borderLeftColor: "#5a3d8c" }}
              >
                <div className="flex items-center gap-2">
                  <Library size={14} className="text-[#5a3d8c]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                    {p.theme.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="font-display font-semibold text-base text-[#0F1115] mt-1">
                  {p.title}
                </div>
                <p className="text-xs text-[#5d6068] mt-1.5">{p.summary}</p>
                <div className="text-[10px] uppercase tracking-wider text-[#5d6068] mt-2">
                  Ages {p.age_range} · {(p.sections || []).length} resources
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ResourcePackDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [pack, setPack] = useState(null);
  useEffect(() => {
    api.get(`/resource-packs/${id}`).then((r) => setPack(r.data)).catch(() => nav("/resources"));
  }, [id, nav]);
  if (!pack) {
    return (
      <div className="text-center py-12 text-stone-500">
        <Loader2 className="animate-spin inline" />
      </div>
    );
  }
  return (
    <div className="space-y-5 max-w-3xl mx-auto" data-testid="resource-pack-detail">
      <button
        type="button"
        onClick={() => nav(-1)}
        className="text-sm text-[#5d6068] hover:text-[#0F1115] inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> Back
      </button>
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a3d8c]">
          {pack.theme.replace(/_/g, " ")} · Ages {pack.age_range}
        </div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5">
          {pack.title}
        </h1>
        <p className="text-[#0F1115] mt-3 text-[15px]">{pack.summary}</p>
        {pack.evidence_base && (
          <p className="text-xs text-[#5d6068] mt-1 italic">Evidence base: {pack.evidence_base}</p>
        )}
      </header>

      {(pack.related_framework_ids || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pack.related_framework_ids.map((fid) => (
            <Link
              key={fid}
              to={`/frameworks/${fid}`}
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#0e3b4a]/10 text-[#0e3b4a]"
            >
              {fid.replace(/_/g, " ")}
            </Link>
          ))}
        </div>
      )}

      <ul className="space-y-3" data-testid="resource-sections">
        {(pack.sections || []).map((sec, i) => (
          <li
            key={i}
            data-testid={`resource-section-${i}`}
            className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4"
            style={{ borderLeftColor: "#5a3d8c" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{SECTION_ICON[sec.type] || "•"}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5a3d8c]">
                {SECTION_LABEL[sec.type] || sec.type}
              </span>
            </div>
            <div className="font-semibold text-[#0F1115] mt-1.5">{sec.title}</div>
            <p className="text-sm text-stone-700 mt-1 whitespace-pre-wrap">{sec.body}</p>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-[#8a8d95] italic mt-3">
        These resources support — they don't replace — your professional judgement and any specialist clinical input.
      </p>
    </div>
  );
}
