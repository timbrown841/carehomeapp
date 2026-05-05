import { Link } from "react-router-dom";
import { Mic } from "lucide-react";

/**
 * Sticky "Log Incident" floating action button. Always visible on mobile
 * & tablet viewports — disappears on desktop where the sidebar nav is
 * always available. Designed for one-handed shift use.
 */
export default function LogIncidentFAB() {
  return (
    <Link
      to="/incidents/new"
      data-testid="sticky-log-incident-fab"
      aria-label="Log incident"
      className="lg:hidden fixed z-40 bottom-5 right-4 sm:right-6 inline-flex items-center gap-2.5 bg-[#B23A48] hover:bg-[#962F3B] text-white font-bold rounded-full pl-4 pr-5 py-3.5 shadow-2xl shadow-[#B23A48]/40 ring-2 ring-white active:scale-95 transition-transform"
    >
      <span className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
        <Mic size={18} />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="font-display text-sm">Log Incident</span>
        <span className="text-[10px] font-semibold opacity-80">
          Under 60 seconds
        </span>
      </span>
    </Link>
  );
}
