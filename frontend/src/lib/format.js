// Trust-building timestamp & reference helpers.
// Every record on Safelyn should display a clear, unambiguous, UK-style
// timestamp + author + a short reference ID so staff trust their entries
// are securely stored and usable for compliance / legal purposes.

export function formatFullTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatShortTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatTimeOnly(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Short, human-friendly record reference (last 8 chars of the UUID, upper-cased)
export function recordRef(id) {
  if (!id) return "—";
  return `#${String(id).replace(/-/g, "").slice(-8).toUpperCase()}`;
}
