import { useEffect, useState } from "react";
import api from "@/lib/api";

const TONE = {
  red: "bg-[#A8273A]/12 text-[#A8273A] border-[#A8273A]/30",
  amber: "bg-[#B8772F]/14 text-[#B8772F] border-[#B8772F]/30",
  blue: "bg-[#0e3b4a]/10 text-[#0e3b4a] border-[#0e3b4a]/30",
  green: "bg-[#2F6A3A]/12 text-[#2F6A3A] border-[#2F6A3A]/30",
};

export default function ResidentBadges({ residentId, max = 3 }) {
  const [badges, setBadges] = useState([]);
  useEffect(() => {
    let alive = true;
    api
      .get(`/residents/${residentId}/badges`)
      .then((r) => alive && setBadges(r.data?.badges || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [residentId]);
  if (!badges.length) return null;
  const shown = badges.slice(0, max);
  const extra = badges.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1" data-testid={`resident-badges-${residentId}`}>
      {shown.map((b, i) => (
        <span
          key={i}
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
            TONE[b.tone] || TONE.amber
          }`}
        >
          {b.label}
        </span>
      ))}
      {extra > 0 && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-stone-50 text-[#5d6068] border-stone-200">
          +{extra}
        </span>
      )}
    </div>
  );
}
