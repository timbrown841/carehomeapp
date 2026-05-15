import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import Logo from "@/components/Logo";
import { Users, HeartHandshake, ChevronRight, ShieldCheck, Clock, Sparkles } from "lucide-react";

const SECTOR_TILES = {
  children: {
    title: "Children's Services",
    sub: "Ofsted-regulated residential care · Reg 44 · safeguarding-first",
    detail: "Missing-from-care · Key work · Pocket money · Education · Chronology · Statutory visits",
    accent: "#0F2A47",
    gradient: "linear-gradient(135deg, #0F2A47 0%, #1B4D5F 60%, #2D6A4F 100%)",
    icon: Users,
    badge: "Children & Young People",
  },
  adult: {
    title: "Adult Care Services",
    sub: "CQC-regulated supported living, residential & specialist care",
    detail: "Care tasks · Falls · MCA & DoLS · MAR · Mobility · Wellbeing observations · Support hours",
    accent: "#3F2E5C",
    gradient: "linear-gradient(135deg, #2A1F3D 0%, #3F2E5C 50%, #1B4D5F 100%)",
    icon: HeartHandshake,
    badge: "Adult Service Users",
  },
};

export default function WelcomeSelector() {
  const nav = useNavigate();
  const { orgModes, setSessionMode, effectiveMode, isOrgDual } = useOrg();
  const { user } = useAuth();

  // If we somehow land here while a mode is already chosen, jump straight in
  useEffect(() => {
    if (effectiveMode) {
      nav(user ? "/" : "/login", { replace: true });
    }
  }, [effectiveMode, user, nav]);

  const choose = (mode) => {
    setSessionMode(mode);
    nav(user ? "/" : "/login", { replace: true });
  };

  const tilesToShow = orgModes; // org may have one or two

  return (
    <div className="min-h-screen relative overflow-hidden" data-testid="welcome-selector">
      {/* Ambient background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(15,42,71,0.18), transparent 55%), " +
            "radial-gradient(circle at 80% 80%, rgba(63,46,92,0.18), transparent 55%), " +
            "linear-gradient(180deg, #F7F4ED 0%, #EFEBE3 100%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="px-6 sm:px-10 py-6 flex items-center gap-3">
          <Logo size={36} />
          <div>
            <div className="font-display font-semibold text-lg text-[#0F1115]">
              Safelyn <span className="text-stone-500 font-normal">Systems</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-stone-500">
              Care · Safeguarding · Compliance
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-6 sm:py-12">
          <div className="w-full max-w-5xl">
            <div className="text-center mb-10 sm:mb-14">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#0e3b4a] mb-3">
                Welcome
              </div>
              <h1
                className="font-display font-semibold text-4xl sm:text-5xl lg:text-6xl text-[#0F1115]"
                style={{ letterSpacing: "-0.025em" }}
              >
                Choose your service
              </h1>
              <p className="text-stone-600 mt-3 max-w-xl mx-auto text-[15px] leading-relaxed">
                Safelyn adapts to the way <em>your</em> service works.
                Pick your sector to enter a workspace built around its language, workflows and inspection regime.
              </p>
            </div>

            <div className={`grid gap-4 sm:gap-5 ${tilesToShow.length === 1 ? "max-w-md mx-auto" : "md:grid-cols-2"}`}>
              {tilesToShow.map((mode) => (
                <SectorTile key={mode} mode={mode} onChoose={() => choose(mode)} />
              ))}
            </div>

            {/* Trust strip */}
            <div className="mt-12 sm:mt-16 grid grid-cols-3 gap-3 sm:gap-4 max-w-3xl mx-auto">
              {[
                { icon: Sparkles, k: "Voice-first", v: "Log in seconds, hands-free" },
                { icon: ShieldCheck, k: "Inspection-ready", v: "Ofsted · CQC · auditable" },
                { icon: Clock, k: "Calmer shifts", v: "Less admin, more care" },
              ].map((f) => {
                const I = f.icon;
                return (
                  <div key={f.k} className="text-center px-2">
                    <div className="w-9 h-9 rounded-full bg-white border divider-soft mx-auto flex items-center justify-center mb-2 shadow-sm">
                      <I size={15} className="text-[#0e3b4a]" />
                    </div>
                    <div className="text-xs font-semibold text-[#0F1115]">{f.k}</div>
                    <div className="text-[11px] text-stone-600">{f.v}</div>
                  </div>
                );
              })}
            </div>

            {isOrgDual && (
              <p className="text-center mt-10 text-[11px] text-stone-500" data-testid="dual-org-note">
                Multi-service provider · you can switch sector from your avatar menu any time.
              </p>
            )}
          </div>
        </main>

        <footer className="text-center text-[11px] text-stone-500 py-5">
          © {new Date().getFullYear()} Safelyn Systems · Built with care.
        </footer>
      </div>
    </div>
  );
}

function SectorTile({ mode, onChoose }) {
  const t = SECTOR_TILES[mode];
  if (!t) return null;
  const Icon = t.icon;
  return (
    <button
      type="button"
      onClick={onChoose}
      data-testid={`sector-tile-${mode}`}
      className="group text-left relative overflow-hidden rounded-2xl p-6 sm:p-7 transition-all duration-300 hover:scale-[1.015] hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0e3b4a]"
      style={{ background: t.gradient, color: "white" }}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
            <Icon size={22} className="text-white" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] px-2 py-1 rounded-full bg-white/15 backdrop-blur">
            {t.badge}
          </span>
        </div>
        <h2 className="font-display font-semibold text-2xl sm:text-3xl mt-5" style={{ letterSpacing: "-0.02em" }}>
          {t.title}
        </h2>
        <p className="text-sm text-white/80 mt-1.5">{t.sub}</p>
        <p className="text-xs text-white/70 mt-4 leading-relaxed">{t.detail}</p>

        <div className="mt-6 flex items-center text-sm font-semibold">
          Enter workspace
          <ChevronRight size={16} className="ml-1 transition-transform duration-200 group-hover:translate-x-1" />
        </div>
      </div>

      {/* Decorative blob */}
      <div className="absolute -right-12 -bottom-12 w-56 h-56 rounded-full bg-white/10 blur-3xl" aria-hidden />
    </button>
  );
}
