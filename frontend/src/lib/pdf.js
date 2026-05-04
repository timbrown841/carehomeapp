// Shared PDF download helper. Used wherever the frontend needs to trigger
// a one-tap PDF download (incident detail, incident list, save receipt,
// manager report). Keeps filename + auth header logic in one place.

import { API } from "@/lib/api";
import { toast } from "sonner";

async function downloadFromUrl(url, fallbackFilename) {
  const token = localStorage.getItem("cc_token");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  // Honour server-provided filename when present.
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || fallbackFilename;

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  return filename;
}

export async function downloadIncidentPdf(incident, residentName) {
  const safe = (residentName || "incident").replace(/\s+/g, "_");
  const ref = String(incident.id).replace(/-/g, "").slice(-8).toUpperCase();
  try {
    await downloadFromUrl(
      `${API}/incidents/${incident.id}/pdf`,
      `Safelyn_Incident_${safe}_${ref}.pdf`
    );
    toast.success("PDF downloaded");
  } catch {
    toast.error("PDF download failed");
  }
}

export async function downloadReportPdf(report) {
  const ref = String(report.id).replace(/-/g, "").slice(-8).toUpperCase();
  try {
    await downloadFromUrl(
      `${API}/reports/${report.id}/pdf`,
      `Safelyn_Manager_Report_${ref}.pdf`
    );
    toast.success("PDF downloaded");
  } catch {
    toast.error("PDF download failed");
  }
}
