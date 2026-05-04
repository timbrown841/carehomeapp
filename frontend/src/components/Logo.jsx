import { ShieldCheck } from "lucide-react";

export default function Logo({ size = 40, mono = false }) {
  // Deep blue → green gradient shield evoking safeguarding & trust
  return (
    <div
      className={`relative flex items-center justify-center rounded-xl shadow-sm overflow-hidden ${
        mono ? "bg-white/15" : ""
      }`}
      style={{
        width: size,
        height: size,
        background: mono
          ? undefined
          : "linear-gradient(135deg, #0F2A47 0%, #1E4D5C 55%, #2D6A4F 100%)",
      }}
      aria-label="Safelyn Systems logo"
    >
      <ShieldCheck
        size={Math.round(size * 0.55)}
        strokeWidth={2.2}
        className="text-white relative z-10"
      />
      {/* Subtle inner gleam */}
      {!mono && (
        <span
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.45), transparent 55%)",
          }}
        />
      )}
    </div>
  );
}

export function WordMark({ size = "md" }) {
  const text =
    size === "sm"
      ? "text-base"
      : size === "lg"
      ? "text-2xl"
      : "text-lg";
  return (
    <div className="leading-tight">
      <div className={`font-display font-bold ${text} text-stone-900 tracking-tight`}>
        Safelyn <span className="text-[#1E4D5C]">Systems</span>
      </div>
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">
        Care · Safeguarding · Compliance
      </div>
    </div>
  );
}
