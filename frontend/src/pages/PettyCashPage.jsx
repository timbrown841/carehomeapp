import { useAuth } from "@/context/AuthContext";
import PettyCash from "@/components/staff/PettyCash";

export default function PettyCashPage() {
  return (
    <div className="space-y-5 max-w-6xl mx-auto" data-testid="petty-cash-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          Finance · Home float
        </div>
        <h1
          className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5"
          style={{ letterSpacing: "-0.02em" }}
        >
          Petty Cash & Handover
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          Home-wide float for staff use. Both outgoing and incoming staff sign at every shift handover so any discrepancy is caught immediately.
        </p>
      </header>
      <PettyCash />
    </div>
  );
}
