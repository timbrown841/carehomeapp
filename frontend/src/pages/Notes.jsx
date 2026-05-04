import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import VoiceRecorder from "@/components/VoiceRecorder";
import SaveReceipt from "@/components/SaveReceipt";
import { formatFullTimestamp, recordRef } from "@/lib/format";
import { Loader2, NotebookPen, Hash } from "lucide-react";
import { toast } from "sonner";

const CATS = ["wellbeing", "education", "health", "behaviour", "activity", "other"];

export default function Notes() {
  const [residents, setResidents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [form, setForm] = useState({
    resident_id: "",
    category: "wellbeing",
    body: "",
    voice_used: false,
  });
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const reload = () =>
    Promise.all([
      api.get("/residents").then((r) => setResidents(r.data)),
      api.get("/notes").then((r) => setNotes(r.data)),
    ]);

  useEffect(() => {
    reload();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.resident_id) return toast.error("Pick a resident");
    if (!form.body.trim()) return toast.error("Add some content");
    setBusy(true);
    try {
      const { data } = await api.post("/notes", form);
      setLastSaved(data);
      toast.success("Note saved · audit-trail recorded");
      setForm({ ...form, body: "", voice_used: false });
      reload();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="notes-page">
      <div>
        <h1 className="font-display font-black text-4xl tracking-tighter text-stone-900">
          Daily notes
        </h1>
        <p className="text-stone-600 mt-1">
          Quick observations from the day. Speak or type — your choice.
        </p>
      </div>

      {lastSaved && (
        <SaveReceipt
          record={lastSaved}
          label="Note saved successfully"
          testid="note-save-receipt"
        />
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <form
          onSubmit={submit}
          className="lg:col-span-1 bg-white border divider-soft rounded-2xl p-6 space-y-4 h-fit lg:sticky lg:top-6"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-stone-900">
              New note
            </h3>
            <VoiceRecorder
              size="md"
              onTranscript={(t) =>
                setForm((f) => ({ ...f, body: (f.body ? f.body + " " : "") + t, voice_used: true }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
              Resident
            </label>
            <select
              data-testid="note-resident-select"
              value={form.resident_id}
              onChange={(e) => setForm({ ...form, resident_id: e.target.value })}
              required
              className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
            >
              <option value="">Choose…</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, category: c })}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${
                    form.category === c
                      ? "bg-[#2D4A3E] text-white border-[#2D4A3E]"
                      : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 block">
              What happened?
            </label>
            <textarea
              data-testid="note-body-input"
              rows={6}
              required
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Type or tap the mic above…"
              className="w-full bg-white border divider-soft rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] resize-none"
            />
            {form.voice_used && (
              <div className="text-xs text-[#E57A5D] mt-1.5">
                · voice transcription used
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
            data-testid="submit-note-btn"
            className="w-full bg-[#2D4A3E] hover:bg-[#1E332A] text-white font-medium rounded-xl px-6 py-3 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Save note
          </button>
        </form>

        <div className="lg:col-span-2 space-y-3">
          {notes.length === 0 && (
            <div className="text-center py-16 text-stone-500 bg-white border divider-soft rounded-2xl">
              <NotebookPen size={28} className="mx-auto mb-3 text-stone-300" />
              No notes yet.
            </div>
          )}
          {notes.map((n) => {
            const res = residents.find((r) => r.id === n.resident_id);
            return (
              <div
                key={n.id}
                data-testid={`note-${n.id}`}
                className="bg-white border-l-4 border-l-[#3A5A40] border-y border-r divider-soft p-5 rounded-2xl"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="font-display font-semibold text-stone-900">
                      {res?.name || "Unknown"}
                    </div>
                    <div className="text-xs uppercase tracking-wider text-stone-500 mt-0.5">
                      {n.category}
                      {n.voice_used && <span className="text-[#E57A5D] ml-2">· voice</span>}
                    </div>
                  </div>
                  <div className="text-xs text-stone-500 text-right font-mono">
                    {formatFullTimestamp(n.created_at)}
                    <div className="font-sans font-medium text-stone-700 mt-0.5">
                      {n.author_name}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
                  {n.body}
                </p>
                <div className="mt-3 pt-2.5 border-t divider-soft flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-stone-400 font-mono">
                  <Hash size={10} />
                  <span>ref {recordRef(n.id)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
