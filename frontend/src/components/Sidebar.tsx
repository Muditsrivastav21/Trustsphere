import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  LayoutGrid, ListChecks, UserCheck, Share2, Users, Settings,
  ShieldAlert, LogOut, Sun, Moon,
} from "lucide-react";
import { BobLogo } from "./BobLogo";
import { useAuth } from "@/contexts/AuthContext";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> };

const getItems = (role: string | null): NavItem[] => {
  if (role === "analyst" || role === "admin") {
    const items: NavItem[] = [
      { to: "/dashboard", label: "Overview", icon: LayoutGrid },
      { to: "/dashboard/sessions", label: "Sessions", icon: ListChecks },
      { to: "/dashboard/onboarding", label: "Onboarding review", icon: UserCheck },
      { to: "/dashboard/graph", label: "Fraud graph", icon: Share2 },
      { to: "/dashboard/users", label: "Users", icon: Users },
      { to: "/dashboard/settings", label: "Settings", icon: Settings },
    ];
    if (role === "admin") {
      items.push({ to: "/dashboard/insider", label: "Insider threat", icon: ShieldAlert });
    }
    return items;
  }
  return [
    { to: "/dashboard", label: "Trust dashboard", icon: LayoutGrid },
    { to: "/dashboard/sessions", label: "My sessions", icon: ListChecks },
    { to: "/dashboard/settings", label: "Settings", icon: Settings },
  ];
};

export function Sidebar() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const items = getItems(role);

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    await signOut();
    navigate({ to: "/login" });
  };

  const initial = (user?.email?.charAt(0) || "U").toUpperCase();

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-[var(--color-sidebar-bg)] border-r border-[var(--color-sidebar-border)] flex flex-col">
      <div className="px-5 h-16 flex items-center border-b border-[var(--color-sidebar-border)]">
        <Link to="/" className="block">
          <BobLogo size={28} />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <div className="px-2.5 mb-2 label-caps text-[var(--color-text-dim)]">
          {role === "analyst" || role === "admin" ? "Console" : "Account"}
        </div>
        {items.map(it => {
          const isActive = it.to === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === it.to || pathname.startsWith(it.to + "/");
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] transition-colors duration-100 ${
                isActive
                  ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-brand)] font-medium"
                  : "text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-main)]"
              }`}
            >
              <Icon size={17} strokeWidth={1.75} />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[var(--color-sidebar-border)]">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="label-caps text-[var(--color-text-dim)]">Appearance</span>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[var(--color-surface-sunken)] transition-colors duration-100 group">
          <div className="w-7 h-7 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[12px] font-semibold text-[var(--color-text-sub)] shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium text-[var(--color-text-main)] truncate">{user?.email || "Unknown user"}</div>
            <div className="text-[11px] text-[var(--color-text-dim)] capitalize">{role || "customer"}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="p-1.5 rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors duration-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function DashHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between border-b border-[var(--color-border-default)] pb-5 mb-7 bg-[var(--color-page-bg)] sticky top-0 z-10 pt-7 -mt-7 -mx-8 px-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">{title}</h1>
        {subtitle && <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 pb-0.5">{actions}</div>}
    </header>
  );
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark") ||
             (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return true;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="p-1.5 rounded-md text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface-sunken)] transition-colors duration-100"
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
    </button>
  );
}
