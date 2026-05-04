import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { downloadIncidentPdf } from "@/lib/pdf";
import { useAuth } from "@/context/AuthContext";
import { formatFullTimestamp, recordRef } from "@/lib/format";
import {
  ArrowLeft,
  Download,
  ShieldAlert,
  Loader2,
  Hash,
  Clock,
  User,
  Tag,
  CheckCircle2,
  AlertCircle,
  BellRing,
  Send,
} from "lucide-react";
import { toast } from "sonner";

const SEVERITY_COLOR = {
  low: "#3A5A40",
  medium: "#D4A373",
  high: "#B23A48",
};

const STATUS_COLOR = {
  open: { bg: "#D4A37320", fg: "#9C6B3D" },
  reviewed: { bg: "#3A5A4020", fg: "#3A5A40" },
  closed: { bg: "#8A8A8520", fg: "#575752" },
};

export default function IncidentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [incident, setIncident] = useState(null);
  const [resident, setResident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const canReview = user?.role === "manager" || user?.role === "admin";

  useEffect(() => {
    const load = async () => {
      try {
        const { data: inc } = await api.get(`/incidents/${id}`);
        setIncident(inc);
        if (inc?.resident_id) {
          try {
            const { data: residents } = await api.get("/residents");
            setResident(residents.find((r) => r.id === inc.resident_id) || null);
          } catch {
            /* non-fatal */
          }
        }
      } catch (e) {
        toast.error(formatApiError(e.response?.data?.detail) || "Could not load incident");
        nav("/incidents");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, nav]);

  const downloadPdf = async () => {
    if (!incident) return;
    setDownloading(true);
    try {
      await downloadIncidentPdf(incident, resident?.name);
    } finally {
      setDownloading(false);
    }
  };

  const notify = async (kind) => {
    if (!incident) return;
    setNotifyingKind(kind);
    try {
      await api.post("/notifications", {
        incident_id: incident.id,
        kind,
      });
      toast.success(
        kind === "dsl"
          ? "DSL notified successfully"
          : "Manager notified successfully"
      );
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Notification failed");
    } finally {
      setNotifyingKind(null);
    }
  };

  const updateStatus = async (status) => {
    try {
      const { data } = await api.patch(`/incidents/${incident.id}/status?status=${status}`);
      setIncident(data);
      toast.success(`Marked ${status}`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  if (loading)
    return (
      <div className="text-center py-20 text-stone-500">
        <Loader2 className="animate-spin inline-block" /> Loading…
      </div>
    );
  if (!incident) return null;

  const sevColor = SEVERITY_COLOR[incident.severity] || "#8A8A85";
  const statusStyle = STATUS_COLOR[incident.status] || STATUS_COLOR.open;
  const ref = recordRef(incident.id);

  return (
    <div className="space-y-5 max-w-3xl mx-auto" data-testid="incident-detail-page">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"
          data-testid="incident-detail-back"
        >
          <ArrowLeft size={16} /> All incidents
        </Link>
        <button
          type="button"
          data-testid="download-pdf-btn"
          onClick={downloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-2 bg-[#1E4D5C] hover:bg-[#163A47] disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2.5 text-sm shadow-sm transition-colors"
        >
          {downloading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
          Download PDF
        </button>
      </div>

      {/* Header card */}
      <div
        className="bg-white border-l-4 border-y border-r divider-soft rounded-2xl p-5 sm:p-6"
        style={{ borderLeftColor: incident.safeguarding ? "#B23A48" : sevColor }}
      >
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                {incident.incident_type || incident.category}
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: `${sevColor}20`, color: sevColor }}
              >
                {incident.severity} risk
              </span>
              {incident.safeguarding && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#B23A48]/15 text-[#B23A48] inline-flex items-center gap-1">
                  <ShieldAlert size={10} /> safeguarding
                </span>
              )}
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: statusStyle.bg, color: statusStyle.fg }}
              >
                {incident.status}
              </span>
            </div>
            <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter text-stone-900 mt-2">
              {resident?.name || "Unknown young person"}
            </h1>
            {resident && (
              <div className="text-xs text-stone-500 mt-1">
                {resident.room && <>Room {resident.room} · </>}
                {resident.dob && <>DOB {resident.dob}</>}
              </div>
            )}
          </div>

          <div className="text-right text-xs text-stone-600 space-y-1">
            <div className="inline-flex items-center gap-1.5">
              <Clock size={12} className="text-stone-400" />
              <span className="font-mono" data-testid="detail-timestamp">
                {formatFullTimestamp(incident.created_at)}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <User size={12} className="text-stone-400" />
              <span className="font-medium" data-testid="detail-author">
                {incident.author_name}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-stone-500">
              <Hash size={11} />
              <span className="font-mono uppercase tracking-wider" data-testid="detail-ref">
                {ref}
              </span>
            </div>
          </div>
        </div>

        {(incident.tags || []).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {incident.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-stone-100 text-stone-700"
              >
                <Tag size={10} /> {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Structured report */}
      <section className="bg-white border divider-soft rounded-2xl p-5 sm:p-6">
        <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#1E4D5C] mb-3">
          Structured report
        </h3>
        <div
          className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap"
          data-testid="detail-structured-report"
        >
          {incident.structured_report || incident.body}
        </div>
      </section>

      {incident.action_taken && (
        <section className="bg-white border divider-soft rounded-2xl p-5 sm:p-6">
          <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#1E4D5C] mb-3">
            Action taken
          </h3>
          <div className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
            {incident.action_taken}
          </div>
        </section>
      )}

      {incident.raw_transcript &&
        incident.raw_transcript !== incident.structured_report && (
          <details className="bg-white border divider-soft rounded-2xl group">
            <summary className="cursor-pointer p-5 sm:p-6 list-none flex items-center justify-between gap-3 text-sm font-semibold text-stone-700 hover:text-stone-900">
              <span className="inline-flex items-center gap-2">
                <AlertCircle size={14} /> Original voice transcript
              </span>
              <span className="text-xs text-stone-400 group-open:rotate-180 transition-transform">
                ▾
              </span>
            </summary>
            <div className="px-5 sm:px-6 pb-5 sm:pb-6 text-sm text-stone-700 italic leading-relaxed whitespace-pre-wrap">
              {incident.raw_transcript}
            </div>
          </details>
        )}

      {/* Status actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          data-testid="notify-manager-btn"
          onClick={() => notify("manager")}
          disabled={notifyingKind !== null}
          className="inline-flex items-center gap-2 bg-white hover:bg-stone-50 text-[#1E4D5C] font-semibold rounded-xl px-4 py-2.5 text-sm border-2 border-[#1E4D5C]/30 hover:border-[#1E4D5C]/60 disabled:opacity-50 transition-colors"
        >
          {notifyingKind === "manager" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Send size={15} />
          )}
          Notify Manager
        </button>
        <button
          type="button"
          data-testid="notify-dsl-btn"
          onClick={() => notify("dsl")}
          disabled={notifyingKind !== null}
          className="inline-flex items-center gap-2 bg-[#B23A48] hover:bg-[#962F3B] text-white font-semibold rounded-xl px-4 py-2.5 text-sm disabled:opacity-50 transition-colors shadow-sm"
        >
          {notifyingKind === "dsl" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <BellRing size={15} />
          )}
          Notify DSL
        </button>
        {canReview && incident.status !== "reviewed" && (
          <button
            type="button"
            data-testid="mark-reviewed-btn"
            onClick={() => updateStatus("reviewed")}
            className="inline-flex items-center gap-2 bg-[#3A5A40] hover:bg-[#2C4A33] text-white font-medium rounded-xl px-4 py-2.5 text-sm transition-colors"
          >
            <CheckCircle2 size={16} /> Mark reviewed
          </button>
        )}
      </div>

      {/* Audit footer */}
      <div className="text-center text-[10px] uppercase tracking-wider text-stone-400 font-mono pt-4">
        Safelyn Systems · Immutable audit record · {ref}
      </div>
    </div>
  );
}
