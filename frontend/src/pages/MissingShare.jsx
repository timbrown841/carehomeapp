import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/lib/api";
import { formatFullTimestamp } from "@/lib/format";
import {
  Siren,
  Phone,
  Download,
  Loader2,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export default function MissingShare() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    axios
      .get(`${API}/missing/share/${token}`)
      .then((r) => alive && setData(r.data))
      .catch(() =>
        alive && setError("This share link is invalid, expired or revoked.")
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API}/missing/share/${token}/pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Safelyn_Missing_Pack_${(data?.resident?.name || "resident").replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-stone-500">
        <Loader2 className="animate-spin" />
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="bg-white border divider-soft rounded-2xl p-8 max-w-md text-center">
          <AlertTriangle className="mx-auto text-[#B23A48]" size={32} />
          <h1 className="font-display font-black text-xl mt-3 text-stone-900">
            Link unavailable
          </h1>
          <p className="text-sm text-stone-600 mt-1">{error}</p>
        </div>
      </div>
    );

  const ep = data.episode;
  const r = data.resident || {};
  const status = ep.returned_at ? "Returned safely" : "STILL MISSING";

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-[#B23A48] text-white px-4 sm:px-8 py-5 sm:py-6">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Siren size={26} />
          <div>
            <div className="font-display font-black text-xl sm:text-2xl tracking-tight">
              Safelyn Systems · Rapid Response Pack
            </div>
            <div className="text-xs sm:text-sm text-white/85">
              Missing-from-Care · Philomena Protocol · POLICE-READY
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-5">
        <section
          className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5 sm:p-6"
          style={{ borderLeftColor: ep.returned_at ? "#3A5A40" : "#B23A48" }}
          data-testid="missing-share-summary"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                Status
              </div>
              <div
                className="font-display font-black text-2xl sm:text-3xl tracking-tight"
                style={{ color: ep.returned_at ? "#3A5A40" : "#B23A48" }}
              >
                {status}
              </div>
              <h1 className="font-display font-bold text-xl text-stone-900 mt-1">
                {r.name}{r.preferred_name && r.preferred_name !== r.name && ` ("${r.preferred_name}")`}
              </h1>
              <div className="text-xs text-stone-600 mt-0.5">
                DOB {r.dob || "—"}
                {r.gender && ` · ${r.gender}`}
                {r.local_authority && ` · ${r.local_authority}`}
              </div>
            </div>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={downloading}
              data-testid="share-download-pdf"
              className="bg-[#1E4D5C] hover:bg-[#163A47] disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2.5 text-sm inline-flex items-center gap-2"
            >
              {downloading ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
              Download PDF
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            <KV label="Reported missing" value={formatFullTimestamp(ep.reported_at)} />
            <KV label="Reporting officer" value={ep.reported_by_name} />
            <KV label="Police notified" value={ep.police_notified_at ? formatFullTimestamp(ep.police_notified_at) : "—"} />
            <KV label="Returned" value={ep.returned_at ? formatFullTimestamp(ep.returned_at) : "—"} />
            <KV label="Last seen" value={ep.last_seen_location || "—"} />
            <KV label="Direction" value={ep.direction_of_travel || "—"} />
            <KV label="Clothing" value={ep.clothing_last_seen || r.usual_clothing || "—"} />
            <KV label="Police reference" value={ep.police_reference || "—"} />
          </div>
        </section>

        <Section title="Physical description">
          <div className="grid sm:grid-cols-2 gap-3">
            <KV label="Height" value={r.height} />
            <KV label="Build" value={r.build} />
            <KV label="Hair" value={r.hair} />
            <KV label="Eyes" value={r.eyes} />
            <KV label="Distinguishing marks" value={r.distinguishing_marks} />
            <KV label="Phone" value={r.phone} />
          </div>
        </Section>

        <Section title="Known places & associates">
          <Tags label="Known locations" items={r.known_locations} />
          <Tags label="Associates" items={r.known_associates} />
          <Tags label="Family contacts" items={r.family_contacts} />
          <Tags label="Triggers" items={r.missing_triggers} red />
          {r.safety_plan && (
            <div className="mt-3 text-sm text-stone-700">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">
                Safety plan
              </div>
              {r.safety_plan}
            </div>
          )}
        </Section>

        {r.medical && (
          <Section title="Medical (critical)" tone="red">
            <div className="grid sm:grid-cols-2 gap-3">
              <KV label="GP" value={r.medical.gp} />
              <KV label="NHS number" value={r.medical.nhs_number} />
              <KV label="Allergies" value={r.medical.allergies} />
              <KV label="Diagnoses" value={r.medical.diagnoses} />
              <KV label="Current medication" value={r.medical.current_medication} />
              <KV label="Emergency notes" value={r.medical.emergency_notes} />
            </div>
          </Section>
        )}

        {r.emergency_contacts && r.emergency_contacts.length > 0 && (
          <Section title="Emergency contacts">
            <div className="grid sm:grid-cols-2 gap-3">
              {r.emergency_contacts.map((c, i) => (
                <div
                  key={i}
                  className="border divider-soft rounded-xl p-3.5 bg-stone-50/60 flex items-start gap-3"
                >
                  <Phone size={15} className="text-[#1E4D5C] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-stone-900">{c.name}</div>
                    <div className="text-xs text-stone-500">{c.relation}</div>
                    {c.phone && (
                      <a
                        href={`tel:${c.phone.replace(/\s/g, "")}`}
                        className="text-xs text-[#1E4D5C] hover:underline font-mono"
                      >
                        {c.phone}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <footer className="text-center text-[10px] uppercase tracking-wider text-stone-400 font-mono py-6">
          Safelyn Systems · Immutable Rapid Response Pack ·{" "}
          {String(ep.id).replace(/-/g, "").slice(-8).toUpperCase()}
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children, tone }) {
  return (
    <section
      className={`bg-white border divider-soft rounded-2xl p-5 sm:p-6 ${
        tone === "red" ? "border-l-4 border-l-[#B23A48]" : ""
      }`}
    >
      <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#1E4D5C] mb-3 inline-flex items-center gap-2">
        {tone === "red" && <ShieldAlert size={14} className="text-[#B23A48]" />}
        {title}
      </h3>
      {children}
    </section>
  );
}

function KV({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-0.5">
        {label}
      </div>
      <div className="text-sm text-stone-800 break-words">
        {value || <span className="text-stone-400 italic">—</span>}
      </div>
    </div>
  );
}

function Tags({ label, items, red }) {
  if (!items || !items.length) return null;
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t, i) => (
          <span
            key={i}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              red
                ? "bg-[#B23A48]/10 text-[#B23A48] border-[#B23A48]/30"
                : "bg-stone-100 text-stone-700 border-stone-200"
            }`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
