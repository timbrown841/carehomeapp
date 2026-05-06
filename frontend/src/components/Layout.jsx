import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  NotebookPen,
  ShieldAlert,
  FileText,
  UserCog,
  ClipboardCheck,
  BadgeCheck,
  Pill,
  CalendarCheck,
  Wallet,
  HandCoins,
  ClipboardList,
  GraduationCap,
  ShieldCheck,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import NotificationBell from "@/components/NotificationBell";

const groups = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
    ],
  },
  {
    label: "Care",
    items: [
      { to: "/residents", label: "Residents", icon: Users, testid: "nav-residents" },
      { to: "/notes", label: "Daily Notes", icon: NotebookPen, testid: "nav-notes" },
      { to: "/incidents", label: "Incidents", icon: ShieldAlert, testid: "nav-incidents" },
      { to: "/medications", label: "Medications", icon: Pill, testid: "nav-medications" },
      { to: "/visits", label: "Statutory Visits", icon: CalendarCheck, testid: "nav-visits" },
    ],
  },
  {
    label: "Shift Handover",
    items: [
      { to: "/handover", label: "Shift Handover", icon: ClipboardList, testid: "nav-handover" },
    ],
  },
  {
    label: "Staff Operations",
    items: [
      { to: "/staff", label: "Rota & Shifts", icon: UserCog, testid: "nav-staff" },
    ],
  },
  {
    label: "Training & Development",
    items: [
      { to: "/training", label: "Training Matrix", icon: GraduationCap, testid: "nav-training" },
      { to: "/supervisions", label: "Supervisions", icon: ClipboardCheck, testid: "nav-supervisions" },
    ],
  },
  {
    label: "Safer Recruitment & HR",
    minTier: 3,
    items: [
      { to: "/hr", label: "Safer Recruitment", icon: ShieldCheck, testid: "nav-hr", minTier: 3 },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/pocket-money", label: "Pocket Money", icon: Wallet, testid: "nav-pocket-money" },
      { to: "/petty-cash", label: "Petty Cash", icon: HandCoins, testid: "nav-petty-cash" },
    ],
  },
  {
    label: "Compliance",
    items: [
      { to: "/ofsted", label: "Ofsted Readiness", icon: BadgeCheck, testid: "nav-ofsted" },
      { to: "/reports", label: "Reports", icon: FileText, testid: "nav-reports", minTier: 3 },
    ],
  },
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
        `group flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
          isActive
            ? "bg-[#0e3b4a] text-white shadow-sm"
            : "text-[#2f3038] hover:bg-[#0e3b4a]/8 hover:text-[#0e3b4a]"
        }`
      }
    >
      <Icon size={16} className="shrink-0" />
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
          <nav className="p-3 space-y-4">
            {groups.map((g) => {
              if (g.minTier && tier < g.minTier) return null;
              const items = g.items.filter(
                (l) => (!l.roles || l.roles.includes(user?.role)) && (!l.minTier || tier >= l.minTier)
              );
              if (items.length === 0) return null;
              return (
                <div key={g.label}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a8d95] px-3 mb-1.5">
                    {g.label}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((l) => (
                      <NavItem key={l.to} link={l} onClick={close} />
                    ))}
                  </div>
                </div>
              );
            })}
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
