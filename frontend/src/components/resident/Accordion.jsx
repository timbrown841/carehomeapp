import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function Accordion({ children }) {
  return <div className="space-y-2">{children}</div>;
}

export function AccordionSection({ title, subtitle, defaultOpen = false, badge, tone = "#0e3b4a", children, testid }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      data-testid={testid}
      className="bg-white border-l-4 border-y border-r divider-soft rounded-xl overflow-hidden"
      style={{ borderLeftColor: tone }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50/60"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-base text-[#0F1115]">{title}</span>
            {badge && (
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white"
                style={{ background: tone }}
              >
                {badge}
              </span>
            )}
          </div>
          {subtitle && <div className="text-xs text-[#5d6068] mt-0.5">{subtitle}</div>}
        </div>
        <ChevronDown
          size={18}
          className={`text-[#8a8d95] transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t divider-soft">{children}</div>}
    </div>
  );
}
