// Service-type registry — mirrors backend SERVICE_TYPE_REGISTRY shape.
// Frontend reads /api/service-types and caches; this is the local fallback.

export const SERVICE_TYPES_FALLBACK = [
  { id: "children", label: "Children's Services", sector: "children", regulator: "Ofsted", tone: "#0e3b4a" },
  { id: "adult_supported_living", label: "Adult Supported Living", sector: "adult", regulator: "CQC", tone: "#3F4F8C" },
  { id: "elderly_residential", label: "Elderly Residential", sector: "adult", regulator: "CQC", tone: "#5B6E58" },
  { id: "dementia", label: "Dementia Care", sector: "adult", regulator: "CQC", tone: "#A5556B" },
  { id: "mental_health", label: "Mental Health", sector: "adult", regulator: "CQC", tone: "#3F4F8C" },
  { id: "veteran", label: "Veteran Support", sector: "adult", regulator: "CQC", tone: "#5B6E58" },
];

export const SERVICE_BY_ID = Object.fromEntries(
  SERVICE_TYPES_FALLBACK.map((s) => [s.id, s])
);

export function isAdultService(serviceType) {
  const meta = SERVICE_BY_ID[serviceType || "children"];
  return meta?.sector === "adult";
}

export function serviceMeta(serviceType) {
  return SERVICE_BY_ID[serviceType || "children"] || SERVICE_BY_ID.children;
}
