import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { toast } from "sonner";
import { Users, HeartHandshake, Building2, Loader2, ChevronRight } from "lucide-react";

const OPTIONS = [
  {
    id: "children",
    title: "Children's home",
    sub: "Children & Young People · Ofsted regulated · Regulation 44",
    detail: "Missing-from-care · Key work · Pocket money · Education · Statutory visits.",
    icon: Users,
    modes: ["children"],
    accent: "#0F2A47",
  },
  {
    id: "adult",
    title: "Adult care service",
    sub: "Adult Service Users · CQC regulated",
    detail: "Care tasks · Falls · MCA/Capacity · MAR · Wellbeing observations · Support hours.",
    icon: HeartHandshake,
    modes: ["adult"],
    accent: "#3F2E5C",
  },
  {
    id: "both",
    title: "Multi-service provider",
    sub: "We run both children's and adult services",
    detail: "Sidebar shows both. Workflows stay separated. Staffing & oversight remain unified.",
    icon: Building2,
    modes: ["children", "adult"],
    accent: "#0e3b4a",
  },
];

export default function OrgOnboarding() {
  const { user, tier } = useAuth();
  const { needsOnboarding, update } = useOrg();
  const [selected, setSelected] = useState(null);
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);

  // Only Admin sees this, and only when settings haven't been initialised yet.
  if (!needsOnboarding) return null;
  if (tier < 4) return null;

  const finish = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await update({
        service_modes: selected.modes,
        primary_mode: selected.modes[0],
        org_display_name: orgName.trim() || null,
      });
      toast.success("Service mode configured · sidebar updated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save");
    } finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(11, 14, 22, 0.72)", backdropFilter: "blur(6px)" }}
      data-testid="org-onboarding"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 sm:p-8">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0e3b4a]">
          Welcome to Safelyn · One-time setup
        </div>
        <h2 className="font-display font-semibold text-2xl sm:text-3xl text-[#0F1115] mt-2" style={{ letterSpacing: "-0.02em" }}>
          What does your organisation run?
        </h2>
        <p className="text-sm text-stone-600 mt-1.5">
          This shapes the entire experience — sidebar, terminology, compliance views and workflows.
          You can change it later in Admin · Organisation settings.
        </p>

        <div className="grid gap-2.5 mt-5">
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = selected?.id === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelected(o)}
                data-testid={`org-option-${o.id}`}
                className={`text-left border-l-4 rounded-xl p-3.5 transition-all duration-200 flex items-start gap-3 ${
                  active ? "bg-[#0e3b4a]/5 ring-2 ring-[#0e3b4a]" : "bg-stone-50 hover:bg-stone-100"
                }`}
                style={{ borderLeftColor: o.accent }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: o.accent }}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#0F1115]">{o.title}</div>
                  <div className="text-[11px] uppercase tracking-wider font-bold text-stone-500 mt-0.5">{o.sub}</div>
                  <p className="text-xs text-stone-700 mt-1.5">{o.detail}</p>
                </div>
                {active && <ChevronRight className="text-[#0e3b4a] mt-1" size={18} />}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <label className="text-xs font-medium text-stone-700">Organisation / home name <span className="text-stone-400">(optional)</span></label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Maple House"
            data-testid="org-name-input"
            className="w-full border divider-soft rounded-lg p-2 text-sm mt-1"
          />
        </div>

        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={finish}
            disabled={!selected || saving}
            data-testid="org-onboarding-finish"
            className="text-sm font-semibold bg-[#0e3b4a] text-white px-5 py-2.5 rounded-lg hover:bg-[#0a2e3a] disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Continue to Safelyn
          </button>
        </div>
        <p className="text-[10px] text-stone-400 mt-4 text-center">
          Signed in as <span className="font-medium">{user?.name}</span> · admin
        </p>
      </div>
    </div>
  );
}
