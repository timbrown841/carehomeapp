import { serviceMeta } from "@/lib/serviceTypes";

export default function ServiceBadge({ serviceType, size = "sm" }) {
  const meta = serviceMeta(serviceType);
  const cls = size === "lg"
    ? "text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
    : "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded";
  return (
    <span
      data-testid={`service-badge-${meta.id}`}
      className={`${cls} text-white inline-flex items-center gap-1`}
      style={{ background: meta.tone }}
      title={`Regulator: ${meta.regulator}`}
    >
      {meta.label}
    </span>
  );
}
