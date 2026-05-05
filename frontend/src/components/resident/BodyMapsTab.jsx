import { useEffect, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { formatFullTimestamp } from "@/lib/format";
import { Plus, X, Loader2, Activity, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TYPES = [
  { v: "bruise", color: "#7B4B6B" },
  { v: "cut", color: "#B23A48" },
  { v: "scratch", color: "#D4A373" },
  { v: "burn", color: "#E57A5D" },
  { v: "swelling", color: "#9C6B3D" },
  { v: "rash", color: "#3A5A40" },
  { v: "other", color: "#575752" },
];
const SEVERITIES = ["minor", "moderate", "significant"];

function typeColor(t) {
  return (TYPES.find((x) => x.v === t) || TYPES[6]).color;
}

/** Simple anatomical silhouette - inline SVG. front + back */
function Silhouette({ side, marks, onAdd, readOnly }) {
  const ref = useRef(null);
  const click = (e) => {
    if (readOnly) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onAdd?.({ x, y, side });
  };
  return (
    <div className="relative w-full max-w-[180px] mx-auto" ref={ref} onClick={click}>
      <svg
        viewBox="0 0 100 220"
        className={`w-full h-auto select-none ${readOnly ? "" : "cursor-crosshair"}`}
        data-testid={`silhouette-${side}`}
      >
        {/* Head */}
        <ellipse cx="50" cy="18" rx="13" ry="15" fill="#F0EDE5" stroke="#8A8A85" strokeWidth="0.8" />
        {/* Neck */}
        <rect x="44" y="32" width="12" height="6" fill="#F0EDE5" stroke="#8A8A85" strokeWidth="0.8" />
        {/* Torso */}
        <path
          d="M 30 38 Q 28 60 30 100 Q 32 130 38 150 L 62 150 Q 68 130 70 100 Q 72 60 70 38 Z"
          fill="#F0EDE5"
          stroke="#8A8A85"
          strokeWidth="0.8"
        />
        {/* Arms */}
        <path d="M 30 40 Q 18 60 16 100 Q 16 120 22 130 L 28 128 Q 26 110 28 90 Q 30 60 32 42 Z" fill="#F0EDE5" stroke="#8A8A85" strokeWidth="0.8" />
        <path d="M 70 40 Q 82 60 84 100 Q 84 120 78 130 L 72 128 Q 74 110 72 90 Q 70 60 68 42 Z" fill="#F0EDE5" stroke="#8A8A85" strokeWidth="0.8" />
        {/* Legs */}
        <path d="M 38 150 Q 34 180 36 215 L 48 215 Q 49 180 49 150 Z" fill="#F0EDE5" stroke="#8A8A85" strokeWidth="0.8" />
        <path d="M 62 150 Q 66 180 64 215 L 52 215 Q 51 180 51 150 Z" fill="#F0EDE5" stroke="#8A8A85" strokeWidth="0.8" />
        {/* Direction indicator */}
        {side === "front" ? (
          <>
            <circle cx="46" cy="16" r="0.8" fill="#8A8A85" />
            <circle cx="54" cy="16" r="0.8" fill="#8A8A85" />
          </>
        ) : (
          <line x1="42" y1="16" x2="58" y2="16" stroke="#8A8A85" strokeWidth="0.5" />
        )}

        {/* Existing marks */}
        {marks.map((m, i) => (
          <g key={i}>
            <circle
              cx={m.x * 100}
              cy={m.y * 220}
              r="3.4"
              fill={typeColor(m.type)}
              stroke="white"
              strokeWidth="1"
              opacity="0.92"
            />
            <text
              x={m.x * 100}
              y={m.y * 220 + 1}
              fontSize="3.2"
              textAnchor="middle"
              fill="white"
              fontWeight="700"
            >
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <div className="text-[10px] uppercase tracking-wider text-stone-500 text-center font-bold mt-1">
        {side}
      </div>
    </div>
  );
}

export default function BodyMapsTab({ resident }) {
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/residents/${resident.id}/bodymaps`);
      setMaps(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident.id]);

  const remove = async (id) => {
    if (!window.confirm("Delete this body map record?")) return;
    try {
      await api.delete(`/bodymaps/${id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Delete failed");
    }
  };

  return (
    <div className="space-y-5" data-testid="bodymaps-content">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-600">
          Tap the body silhouette to mark injuries. Auto-link to incidents and track healing.
        </p>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          data-testid="new-bodymap-btn"
          className="inline-flex items-center gap-1.5 bg-[#1E4D5C] hover:bg-[#163A47] text-white font-semibold rounded-lg px-3 py-1.5 text-xs"
        >
          <Plus size={13} /> New body map
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-stone-500">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : maps.length === 0 ? (
        <div className="text-center py-10 text-stone-500 italic">
          No body map records yet.
        </div>
      ) : (
        <ul className="space-y-4">
          {maps.map((bm) => (
            <li
              key={bm.id}
              data-testid={`bodymap-${bm.id}`}
              className="bg-white border divider-soft rounded-2xl p-5"
            >
              <header className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Body map · {bm.marks?.length || 0} mark{(bm.marks?.length || 0) === 1 ? "" : "s"}
                  </div>
                  <div className="text-sm font-semibold text-stone-900">
                    {formatFullTimestamp(bm.recorded_at)} · {bm.recorded_by_name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(bm.id)}
                  className="text-stone-400 hover:text-[#B23A48] p-1.5 rounded"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </header>
              <div className="grid grid-cols-2 gap-4">
                <Silhouette
                  side="front"
                  marks={(bm.marks || []).filter((m) => m.side === "front")}
                  readOnly
                />
                <Silhouette
                  side="back"
                  marks={(bm.marks || []).filter((m) => m.side === "back")}
                  readOnly
                />
              </div>
              {bm.notes && (
                <p className="text-sm text-stone-700 mt-3 leading-relaxed">{bm.notes}</p>
              )}
              {bm.marks?.length > 0 && (
                <ol className="mt-3 space-y-1.5 text-sm">
                  {bm.marks.map((m, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-stone-50"
                    >
                      <span
                        className="w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: typeColor(m.type) }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mr-1">
                          {m.type} · {m.severity}
                        </span>
                        <span className="text-stone-900">
                          {m.region ? `${m.region} (${m.side})` : m.side}
                        </span>
                        {m.description && (
                          <div className="text-xs text-stone-600 mt-0.5">{m.description}</div>
                        )}
                        {m.healing_notes && (
                          <div className="text-xs text-[#3A5A40] mt-0.5">
                            ✓ {m.healing_notes}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}

      {showNew && (
        <NewBodyMapModal
          residentId={resident.id}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewBodyMapModal({ residentId, onClose, onSaved }) {
  const [marks, setMarks] = useState([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);

  const addMark = (m) => {
    const next = [...marks, { ...m, type: "bruise", severity: "minor", description: "", region: "" }];
    setMarks(next);
    setEditingIdx(next.length - 1);
  };

  const updateMark = (idx, patch) => {
    setMarks(marks.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const removeMark = (idx) => {
    setMarks(marks.filter((_, i) => i !== idx));
    setEditingIdx(null);
  };

  const submit = async () => {
    if (marks.length === 0) {
      toast.error("Add at least one mark");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/residents/${residentId}/bodymaps`, { marks, notes });
      toast.success("Body map saved");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const editingMark = editingIdx != null ? marks[editingIdx] : null;

  return (
    <div
      className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-xl border divider-soft space-y-4"
        data-testid="new-bodymap-modal"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-xl text-stone-900 inline-flex items-center gap-2">
              <Activity size={20} className="text-[#1E4D5C]" />
              New body map
            </div>
            <div className="text-xs text-stone-500 mt-0.5">
              Tap on the body to add a mark · {marks.length} added
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 hover:text-stone-900 p-1 rounded"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-stone-50 rounded-xl p-3">
          <Silhouette
            side="front"
            marks={marks.filter((m) => m.side === "front")}
            onAdd={addMark}
          />
          <Silhouette
            side="back"
            marks={marks.filter((m) => m.side === "back")}
            onAdd={addMark}
          />
        </div>

        {editingMark && (
          <div
            className="border-2 border-[#1E4D5C]/30 rounded-xl p-3.5 space-y-3 bg-white"
            data-testid="mark-editor"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-[#1E4D5C]">
                Mark {editingIdx + 1} · {editingMark.side}
              </div>
              <button
                type="button"
                onClick={() => removeMark(editingIdx)}
                className="text-xs text-[#B23A48] inline-flex items-center gap-1 hover:underline"
              >
                <Trash2 size={11} /> Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={editingMark.type}
                onChange={(e) => updateMark(editingIdx, { type: e.target.value })}
                data-testid="mark-type"
                className="bg-stone-50 border divider-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
              >
                {TYPES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.v}
                  </option>
                ))}
              </select>
              <select
                value={editingMark.severity}
                onChange={(e) => updateMark(editingIdx, { severity: e.target.value })}
                className="bg-stone-50 border divider-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <input
              placeholder="Region (e.g. Right forearm)"
              value={editingMark.region}
              onChange={(e) => updateMark(editingIdx, { region: e.target.value })}
              data-testid="mark-region"
              className="w-full bg-stone-50 border divider-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D5C]"
            />
            <textarea
              rows={2}
              placeholder="Description / how it occurred"
              value={editingMark.description}
              onChange={(e) => updateMark(editingIdx, { description: e.target.value })}
              data-testid="mark-description"
              className="w-full bg-stone-50 border divider-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D5C] resize-none"
            />
          </div>
        )}

        {marks.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {marks.map((m, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setEditingIdx(i)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border-2 ${
                  editingIdx === i ? "border-[#1E4D5C]" : "border-stone-200"
                }`}
                style={{
                  background: typeColor(m.type) + "20",
                  color: typeColor(m.type),
                }}
              >
                {i + 1} · {m.type}
              </button>
            ))}
          </div>
        )}

        <textarea
          rows={2}
          placeholder="Overall notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full bg-stone-50 border divider-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D5C] resize-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || marks.length === 0}
          data-testid="save-bodymap-btn"
          className="w-full bg-[#1E4D5C] hover:bg-[#163A47] disabled:opacity-50 text-white font-bold rounded-xl px-6 py-3 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Save body map
        </button>
      </div>
    </div>
  );
}
