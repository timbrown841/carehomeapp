import { useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function VoiceRecorder({ onTranscript, size = "lg" }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 500) {
          toast.error("Recording too short");
          return;
        }
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "note.webm");
          const { data } = await api.post("/voice/transcribe", fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          onTranscript?.(data.text || "");
          toast.success("Transcribed");
        } catch (e) {
          toast.error(formatApiError(e.response?.data?.detail) || "Transcription failed");
        } finally {
          setBusy(false);
        }
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (e) {
      toast.error("Microphone access denied");
    }
  };

  const stop = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const dim =
    size === "xl" ? "w-24 h-24" : size === "lg" ? "w-16 h-16" : "w-12 h-12";
  const iconSize = size === "xl" ? 36 : size === "lg" ? 26 : 20;

  return (
    <button
      type="button"
      data-testid="voice-record-btn"
      onClick={recording ? stop : start}
      disabled={busy}
      className={`${dim} rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95 ${
        recording
          ? "bg-[#B23A48] voice-recording"
          : busy
          ? "bg-[#8A8A85]"
          : "bg-[#E57A5D] hover:bg-[#D1664A]"
      }`}
      aria-label={recording ? "Stop recording" : "Start recording"}
    >
      {busy ? (
        <Loader2 size={iconSize} className="animate-spin" />
      ) : recording ? (
        <Square size={iconSize} fill="white" />
      ) : (
        <Mic size={iconSize} />
      )}
    </button>
  );
}
