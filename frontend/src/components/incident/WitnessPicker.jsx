import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Users, X, Plus, UserPlus, ChevronDown } from "lucide-react";

/**
 * <WitnessPicker> — collect witnesses on an incident.
 *
 * Props:
 *   value:    Array<{kind, user_id?, resident_id?, name, role?, organisation?, contact?, notes?}>
 *   onChange: (next) => void
 *   notesValue: string
 *   onNotesChange: (s) => void
 */
export default function WitnessPicker({ value = [], onChange, notesValue = "", onNotesChange }) {
  const [staff, setStaff] = useState([]);
  const [residents, setResidents] = useState([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("staff");
  const [external, setExternal] = useState({ name: "", role: "", organisation: "", contact: "" });

  useEffect(() => {
    api.get("/auth/users/picker").then((r) => setStaff(r.data || [])).catch(() => {});
    api.get("/residents").then((r) => setResidents(r.data || [])).catch(() => {});
  }, []);

  const add = (w) => {
    // Avoid duplicates
    if (
      (w.user_id && value.some((x) => x.user_id === w.user_id)) ||
      (w.resident_id && value.some((x) => x.resident_id === w.resident_id)) ||
      (w.kind === "external" &&
        value.some((x) => x.kind === "external" && x.name === w.name && x.organisation === w.organisation))
    ) {
      return;
    }
    onChange([...value, w]);
  };

  const remove = (idx) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const addExternal = () => {
    if (!external.name.trim()) return;
    add({ kind: "external", ...external, name: external.name.trim() });
    setExternal({ name: "", role: "", organisation: "", contact: "" });
  };

  return (
    <div className="space-y-3" data-testid="witness-picker">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 inline-flex items-center gap-1.5">
          <Users size={11} /> Witnesses & people present
        </label>
        <div
          className="bg-white border divider-soft rounded-xl mt-1 p-2 flex flex-wrap items-center gap-1.5 min-h-[44px]"
          data-testid="witness-chip-area"
        >
          {value.length === 0 && (
            <span className="text-xs text-stone-400 italic px-1">
              No witnesses added yet — staff, young people or external professionals.
            </span>
          )}
          {value.map((w, i) => {
            const tone =
              w.kind === "staff"
                ? "bg-[#0e3b4a]/10 text-[#0e3b4a]"
                : w.kind === "resident"
                ? "bg-[#5a3d8c]/10 text-[#5a3d8c]"
                : "bg-[#B8772F]/10 text-[#8C5A20]";
            const subtitle =
              w.kind === "staff"
                ? `Staff · ${w.role || ""}`
                : w.kind === "resident"
                ? "Young person"
                : [w.role, w.organisation].filter(Boolean).join(" · ") || "External";
            return (
              <span
                key={i}
                data-testid={`witness-chip-${i}`}
                className={`inline-flex items-center gap-1.5 ${tone} rounded-lg px-2 py-1 text-xs`}
              >
                <span className="font-semibold">{w.name}</span>
                <span className="opacity-70 text-[10px]">· {subtitle}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  data-testid={`witness-chip-${i}-remove`}
                  className="opacity-60 hover:opacity-100"
                  aria-label="Remove witness"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            data-testid="witness-add-btn"
            className="inline-flex items-center gap-1 text-xs bg-[#0e3b4a] hover:bg-[#0a2c38] text-white rounded-lg px-2.5 py-1 font-semibold"
          >
            <UserPlus size={11} /> Add witness
            <ChevronDown size={11} />
          </button>
        </div>
      </div>

      {open && (
        <div
          className="bg-white border divider-soft rounded-xl p-3 space-y-2"
          data-testid="witness-picker-dropdown"
        >
          <div className="flex items-center gap-1 text-xs">
            {[
              { id: "staff", label: "Staff" },
              { id: "resident", label: "Young people" },
              { id: "external", label: "External professional" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                data-testid={`witness-tab-${t.id}`}
                className={`px-2.5 py-1 rounded-lg font-semibold ${
                  tab === t.id ? "bg-[#0e3b4a] text-white" : "bg-stone-100 text-[#5d6068] hover:bg-stone-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "staff" && (
            <div className="max-h-44 overflow-y-auto" data-testid="witness-staff-list">
              {staff.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() =>
                    add({ kind: "staff", user_id: u.id, name: u.name, role: u.role })
                  }
                  data-testid={`witness-staff-${u.id}`}
                  className="w-full text-left text-xs px-2 py-1.5 hover:bg-stone-50 rounded-lg flex items-center justify-between"
                >
                  <span>{u.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500">{u.role}</span>
                </button>
              ))}
            </div>
          )}

          {tab === "resident" && (
            <div className="max-h-44 overflow-y-auto" data-testid="witness-resident-list">
              {residents.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() =>
                    add({ kind: "resident", resident_id: r.id, name: r.name })
                  }
                  data-testid={`witness-resident-${r.id}`}
                  className="w-full text-left text-xs px-2 py-1.5 hover:bg-stone-50 rounded-lg"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}

          {tab === "external" && (
            <div className="space-y-2" data-testid="witness-external-form">
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Name"
                  value={external.name}
                  onChange={(e) => setExternal({ ...external, name: e.target.value })}
                  data-testid="witness-external-name"
                  className="bg-stone-50 border divider-soft rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
                />
                <input
                  placeholder="Role (e.g. Police Officer)"
                  value={external.role}
                  onChange={(e) => setExternal({ ...external, role: e.target.value })}
                  data-testid="witness-external-role"
                  className="bg-stone-50 border divider-soft rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
                />
                <input
                  placeholder="Organisation"
                  value={external.organisation}
                  onChange={(e) => setExternal({ ...external, organisation: e.target.value })}
                  data-testid="witness-external-org"
                  className="bg-stone-50 border divider-soft rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
                />
                <input
                  placeholder="Contact (phone/email)"
                  value={external.contact}
                  onChange={(e) => setExternal({ ...external, contact: e.target.value })}
                  data-testid="witness-external-contact"
                  className="bg-stone-50 border divider-soft rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
                />
              </div>
              <button
                type="button"
                onClick={addExternal}
                disabled={!external.name.trim()}
                data-testid="witness-external-submit"
                className="inline-flex items-center gap-1 bg-[#0e3b4a] hover:bg-[#0a2c38] disabled:opacity-50 text-white text-xs rounded-lg px-2.5 py-1 font-semibold"
              >
                <Plus size={11} /> Add external witness
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
          Witness notes (optional)
        </label>
        <textarea
          rows={2}
          value={notesValue}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="What did each witness see or hear? Any conflicting accounts?"
          data-testid="witness-notes"
          className="mt-1 w-full bg-stone-50 border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a] resize-none"
        />
      </div>
    </div>
  );
}
