import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
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
} from "lucide-react";
import Logo from "@/components/Logo";
import NotificationBell from "@/components/NotificationBell";

// Seven locked operational areas. Sidebar must NEVER grow beyond these without
// explicit product approval. Sub-workflows live inside their hub page.
const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/children", label: "Children's Services", icon: Users, testid: "nav-children" },
  { to: "/adults", label: "Adult Services", icon: HeartHandshake, testid: "nav-adults" },
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
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const close = () => setMobileOpen(false);

  const ROLE_BADGE = {
    staff: { label: "Support Worker", tone: "#5d6068" },
    senior: { label: "Senior", tone: "#0e3b4a" },
    manager: { label: "Manager", tone: "#2F6A3A" },
    admin: { label: "Admin", tone: "#A8273A" },
  };
  const badge = ROLE_BADGE[user?.role] || { label: user?.role || "—", tone: "#5d6068" };

  const visibleNav = NAV.filter((l) => !l.minTier || tier >= l.minTier);

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
          <nav className="p-3 space-y-1">
            {visibleNav.map((l) => (
              <NavItem key={l.to} link={l} onClick={close} />
            ))}
          </nav>
          <div className="p-3 mt-auto border-t divider-soft sticky bottom-0 bg-white">
            <div
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-stone-50"
              data-testid="user-card"
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
              <button
                type="button"
                onClick={logout}
                data-testid="logout-btn"
                className="text-[#5d6068] hover:text-[#A8273A] p-1.5 rounded-md hover:bg-white transition-colors"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
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
