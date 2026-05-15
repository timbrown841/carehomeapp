import { Outlet, NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  HeartHandshake,
  Building2,
  UserCog,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  X,
  Heart,
  ChevronUp,
  Replace,
} from "lucide-react";
import Logo from "@/components/Logo";
import NotificationBell from "@/components/NotificationBell";

// Locked operational areas. The sidebar adapts to the org's service modes:
//   - children-only orgs hide Adult Services
//   - adult-only orgs hide Children's Services
//   - dual-mode orgs see both
// Sub-workflows live inside their hub page. The sidebar must never grow beyond
// these without explicit product approval.
const NAV_ALL = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/children", label: "Children's Services", icon: Users, testid: "nav-children", mode: "children" },
  { to: "/adults", label: "Adult Services", icon: HeartHandshake, testid: "nav-adults", mode: "adult" },
  { to: "/operations", label: "Home Operations", icon: Building2, testid: "nav-operations" },
  { to: "/staff-operations", label: "Staff Operations", icon: UserCog, testid: "nav-staff-operations" },
  { to: "/compliance", label: "Compliance & Oversight", icon: ShieldCheck, testid: "nav-compliance" },
  { to: "/admin", label: "Admin", icon: Settings, testid: "nav-admin", minTier: 3 },
];

function NavItem({ link, onClick }) {
  const Icon = link.icon;
  return (
    <NavLink
      end={link.end}
      to={link.to}
      data-testid={link.testid}
      onClick={onClick}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all duration-150 ${
          isActive
            ? "bg-[#0e3b4a] text-white shadow-sm"
            : "text-[#2f3038] hover:bg-[#0e3b4a]/8 hover:text-[#0e3b4a]"
        }`
      }
    >
      <Icon size={17} className="shrink-0" />
      <span className="truncate">{link.label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout, tier } = useAuth();
  const { effectiveMode, isOrgDual, clearSessionMode, settings } = useOrg();
  const location = useLocation();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the user-menu dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const close = () => setMobileOpen(false);

  const ROLE_BADGE = {
    staff: { label: "Support Worker", tone: "#5d6068" },
    senior: { label: "Senior", tone: "#0e3b4a" },
    manager: { label: "Manager", tone: "#2F6A3A" },
    admin: { label: "Admin", tone: "#A8273A" },
  };
  const badge = ROLE_BADGE[user?.role] || { label: user?.role || "—", tone: "#5d6068" };

  // Sidebar always reflects a SINGLE sector — the user's effective session mode.
  // Sub-workflows live inside their hub page. The sidebar must never grow.
  const visibleNav = NAV_ALL
    .filter((l) => !l.minTier || tier >= l.minTier)
    .filter((l) => !l.mode || l.mode === effectiveMode)
    // Always rename the residents hub to plain "Residents" — sector context is
    // already established by the welcome selector, so no qualifier is needed.
    .map((l) => (l.mode ? { ...l, label: "Residents" } : l));

  return (
    <div className="min-h-screen bg-canvas">
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-white border-b divider-soft px-4 py-3 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg hover:bg-stone-100"
            aria-label="Menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${
            mobileOpen ? "block" : "hidden"
          } lg:block lg:w-64 fixed lg:sticky top-0 left-0 z-20 lg:z-auto h-screen lg:h-screen bg-white border-r divider-soft overflow-y-auto`}
          data-testid="sidebar"
        >
          <div className="px-5 py-5 border-b divider-soft hidden lg:flex items-center justify-between">
            <Logo />
            <NotificationBell />
          </div>
          {effectiveMode && (
            <div
              className="hidden lg:flex items-center gap-2 px-5 py-2.5 border-b divider-soft"
              data-testid="sidebar-sector-badge"
              style={{ background: effectiveMode === "children" ? "#0F2A4708" : "#3F2E5C08" }}
            >
              <span
                className="text-[9px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
                style={{
                  background: effectiveMode === "children" ? "#0F2A47" : "#3F2E5C",
                  color: "white",
                }}
              >
                {effectiveMode === "children" ? "Ofsted" : "CQC"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-[#0F1115] truncate">
                  {effectiveMode === "children" ? "Children's Services" : "Adult Care Services"}
                </div>
                {settings.org_display_name && (
                  <div className="text-[10px] text-stone-500 truncate">{settings.org_display_name}</div>
                )}
              </div>
            </div>
          )}
          <nav className="p-3 space-y-1">
            {visibleNav.map((l) => (
              <NavItem key={l.to} link={l} onClick={close} />
            ))}
          </nav>
          <div className="p-3 mt-auto border-t divider-soft sticky bottom-0 bg-white">
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                data-testid="user-card"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-[#0e3b4a] text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                  {(user?.name || "—")
                    .split(" ")
                    .map((s) => s[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[#0F1115] truncate">
                    {user?.name || "—"}
                  </div>
                  <div
                    className="text-[10px] uppercase tracking-wider font-bold inline-block"
                    style={{ color: badge.tone }}
                    data-testid="user-role-badge"
                  >
                    {badge.label}
                  </div>
                </div>
                <ChevronUp
                  size={14}
                  className={`text-stone-500 transition-transform ${menuOpen ? "rotate-0" : "rotate-180"}`}
                />
              </button>
              {menuOpen && (
                <div
                  className="absolute bottom-full left-0 right-0 mb-2 bg-white border divider-soft rounded-xl shadow-lg py-1.5 z-30"
                  data-testid="user-menu"
                >
                  <Link
                    to="/reflection"
                    onClick={() => { setMenuOpen(false); close(); }}
                    data-testid="user-menu-reflection"
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#0F1115] hover:bg-stone-50"
                  >
                    <Heart size={14} className="text-[#A8273A]" />
                    <span className="flex-1">My Reflection</span>
                    <span className="text-[10px] text-stone-500 uppercase tracking-wider">Wellbeing</span>
                  </Link>
                  {isOrgDual && (
                    <>
                      <div className="border-t divider-soft my-1" />
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          close();
                          clearSessionMode();
                          nav("/welcome", { replace: true });
                        }}
                        data-testid="switch-sector-btn"
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#0F1115] hover:bg-stone-50 text-left"
                      >
                        <Replace size={14} className="text-[#0e3b4a]" />
                        <span className="flex-1">Switch sector</span>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-stone-500">
                          {effectiveMode === "children" ? "Children's" : "Adult"}
                        </span>
                      </button>
                    </>
                  )}
                  <div className="border-t divider-soft my-1" />
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); clearSessionMode(); logout(); }}
                    data-testid="logout-btn"
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#0F1115] hover:bg-stone-50 text-left"
                  >
                    <LogOut size={14} className="text-stone-600" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
          <Outlet key={location.pathname} />
        </main>
      </div>
    </div>
  );
}
