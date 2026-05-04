// Stable, deterministic accent colour derived from a name. Same input
// → same output, so a young person always shows the same persona tint
// on cards, avatars, incident headers, etc.
//
// Palette is intentionally muted — this is care work, not branding.

const PALETTE = [
  { hex: "#1E4D5C", soft: "#1E4D5C18", on: "#0F2A47" }, // teal
  { hex: "#2D6A4F", soft: "#2D6A4F18", on: "#1B3F2F" }, // forest
  { hex: "#9C6B3D", soft: "#D4A37325", on: "#6F4D2C" }, // warm clay
  { hex: "#5B6E58", soft: "#5B6E5818", on: "#3F4D3D" }, // sage
  { hex: "#A05A4A", soft: "#A05A4A18", on: "#6F3D31" }, // rust
  { hex: "#3F5A78", soft: "#3F5A7818", on: "#2A3E54" }, // slate blue
  { hex: "#7A5A8B", soft: "#7A5A8B18", on: "#553F61" }, // dusk
  { hex: "#4F7062", soft: "#4F706218", on: "#324A40" }, // moss
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function personaColor(name) {
  return PALETTE[hash(name || "—") % PALETTE.length];
}

export function personaInitials(name) {
  if (!name) return "—";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
