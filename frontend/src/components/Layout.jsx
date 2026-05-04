import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Logo, { WordMark } from "@/components/Logo";
import NotificationBell from "@/components/NotificationBell";
import {
  LayoutDashboard,
  Users,
  NotebookPen,
  ShieldAlert,
  FileText,
  UserCog,
  ClipboardCheck,
  BadgeCheck,
  LogOut,
} from "lucide-react";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/residents", label: "Residents", icon: Users, testid: "nav-residents" },
  { to: "/notes", label: "Daily Notes", icon: NotebookPen, testid: "nav-notes" },
  { to: "/incidents", label: "Incidents", icon: ShieldAlert, testid: "nav-incidents" },
  { to: "/staff", label: "Staff Management", icon: UserCog, testid: "nav-staff" },
  {
    to: "/supervisions",
    label: "Supervisions",
    icon: ClipboardCheck,
    testid: "nav-supervisions",
  },
  {
    to: "/reports",
    label: "Reports",
    icon: FileText,
    testid: "nav-reports",
    roles: ["manager", "admin"],
  },
  { to: "/ofsted", label: "Ofsted Readiness", icon: BadgeCheck, testid: "nav-ofsted" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const handleLogout = () => {
    logout();
    nav("/login");
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-canvas">
      {/* Sidebar */}
      <aside className="md:w-64 md:fixed md:inset-y-0 md:left-0 flex md:flex-col bg-paper border-b md:border-b-0 md:border-r divider-soft px-4 md:px-5 py-3 md:py-7 z-10">
        <div className="flex items-center gap-3 mb-0 md:mb-8">
          <Logo size={40} />
          <div className="hidden md:block">
            <WordMark size="md" />
          </div>
          <div className="ml-auto md:hidden">
            <NotificationBell testid="notification-bell-mobile" />
          </div>
        </div>

        <nav className="flex md:flex-col gap-1 ml-auto md:ml-0 overflow-x-auto md:overflow-visible">
          {links
            .filter((l) => !l.roles || l.roles.includes(user?.role))
            .map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                data-testid={l.testid}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-[#1E4D5C] text-white"
                      : "text-stone-700 hover:bg-stone-100"
                  }`
                }
              >
                <l.icon size={17} />
                <span>{l.label}</span>
              </NavLink>
            ))}
        </nav>

        <div className="mt-auto pt-6 hidden md:block">
          <div className="rounded-xl bg-stone-50 border divider-soft p-3.5 mb-3">
            <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">
              Signed in as
            </div>
            <div className="font-medium text-stone-900 text-sm truncate">
              {user?.name}
            </div>
            <div className="text-xs text-stone-500 capitalize">{user?.role}</div>
          </div>
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-stone-700 hover:bg-stone-100 border divider-soft"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 md:ml-64">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
          <div className="hidden md:flex items-center justify-end mb-4">
            <NotificationBell testid="notification-bell-desktop" />
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
