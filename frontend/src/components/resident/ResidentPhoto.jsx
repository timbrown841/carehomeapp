import { useRef, useState } from "react";
import api, { API, formatApiError } from "@/lib/api";
import { Camera, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

/**
 * Resident photo block — shows the photo if uploaded, otherwise the persona initials.
 * Senior+ can upload / replace / remove. Photo is auth-protected via token query param
 * (browsers do not send Bearer headers on <img>); we encode the token into the URL.
 */
export default function ResidentPhoto({ resident, persona, initials, onUpdated }) {
  const { isSeniorOrAbove } = useAuth();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0); // bust cache on reupload

  const photoFileId = resident?.photo_file_id;
  const token = typeof window !== "undefined" ? localStorage.getItem("cc_token") : null;
  const photoSrc = photoFileId
    ? `${API}/files/${photoFileId}?_=${stamp}&token=${encodeURIComponent(token || "")}`
    : null;

  const onPick = () => fileRef.current?.click();

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type)) {
      toast.error("Please choose a PNG or JPG photo");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Photo exceeds the 10 MB limit");
      return;
    }
    const fd = new FormData();
    fd.append("file", f);
    setBusy(true);
    try {
      await api.post(`/residents/${resident.id}/photo`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Photo updated");
      setStamp(Date.now());
      onUpdated?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    if (!window.confirm("Remove this photo?")) return;
    setBusy(true);
    try {
      await api.delete(`/residents/${resident.id}/photo`);
      toast.success("Photo removed");
      onUpdated?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0 group"
      style={{ background: persona.soft }}
      data-testid="resident-photo-block"
    >
      {photoSrc ? (
        <img
          key={stamp}
          src={photoSrc}
          alt={resident.name}
          className="w-full h-full object-cover"
          data-testid="resident-photo-img"
          onError={(e) => {
            // graceful fallback to initials if the image fails (e.g. token rejection on <img>)
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center font-display font-black text-2xl sm:text-3xl"
          style={{ color: persona.on }}
        >
          {initials}
        </div>
      )}

      {isSeniorOrAbove && (
        <div className="absolute inset-0 flex items-end justify-center pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/70 via-black/0 to-black/0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPick}
              disabled={busy}
              data-testid="resident-photo-upload-btn"
              className="bg-white/95 hover:bg-white text-[#0F1115] rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 shadow"
              title={photoSrc ? "Replace photo" : "Upload photo"}
            >
              {busy ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
              {photoSrc ? "Replace" : "Photo"}
            </button>
            {photoSrc && (
              <button
                type="button"
                onClick={removePhoto}
                disabled={busy}
                data-testid="resident-photo-remove-btn"
                className="bg-white/95 hover:bg-white text-[#A8273A] rounded-full p-1 shadow"
                title="Remove photo"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={onFile}
        data-testid="resident-photo-input"
      />
    </div>
  );
}
