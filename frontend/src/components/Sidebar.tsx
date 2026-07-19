import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { BobLogo } from "./BobLogo";
import { useAuth } from "@/contexts/AuthContext";

const getItems = (role: string | null) => {
  if (role === "analyst" || role === "admin") {
    const items = [
      { to: "/dashboard", label: "Overview", icon: <path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/> },
      { to: "/dashboard/sessions", label: "All Sessions", icon: <path d="M4 5h16v3H4zm0 6h16v3H4zm0 6h16v3H4z"/> },
      { to: "/dashboard/onboarding", label: "Onboarding Review", icon: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/> },
      { to: "/dashboard/graph", label: "Fraud Graph", icon: <g><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M6 6 L12 18 L18 6" stroke="currentColor" strokeWidth="1.5" fill="none"/></g> },
      { to: "/dashboard/users", label: "Users", icon: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z"/> },
      { to: "/dashboard/settings", label: "Settings", icon: <path d="M19 12c0-.5 0-1-.1-1.5l2.1-1.6-2-3.4-2.5 1a7 7 0 00-2.6-1.5L13.5 2h-3l-.4 2.9a7 7 0 00-2.6 1.5l-2.5-1-2 3.4 2.1 1.6c-.1.5-.1 1-.1 1.5s0 1 .1 1.5L3 14.5l2 3.4 2.5-1c.8.6 1.7 1.1 2.6 1.5l.4 2.9h3l.4-2.9a7 7 0 002.6-1.5l2.5 1 2-3.4-2.1-1.6c.1-.5.1-1 .1-1.5zM12 15a3 3 0 110-6 3 3 0 010 6z"/> },
    ];
    if (role === "admin") {
      items.push({ to: "/dashboard/insider", label: "Insider Threat", icon: <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12v4.7c0 4.67-3.13 8.97-7 10.12-3.87-1.15-7-5.45-7-10.12V6.3l7-3.12z" /> });
    }
    return items;
  }
  return [
    { to: "/dashboard/sessions", label: "My Sessions", icon: <path d="M4 5h16v3H4zm0 6h16v3H4zm0 6h16v3H4z"/> },
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

  return (
    <aside className="w-[260px] shrink-0 h-screen sticky top-0 bg-gradient-to-b from-[var(--color-navy)] to-[var(--color-navy-mid)] border-r border-[var(--color-navy-border)] flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-20">
      <div className="px-6 py-6 border-b border-[var(--color-navy-border)]">
        <Link to="/" className="block hover:opacity-80 transition-opacity"><BobLogo /></Link>
      </div>
      <nav className="flex-1 px-4 py-6 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar">
        <div className="label-caps text-[var(--color-text-muted)] px-3 mb-3 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[var(--color-text-muted)]"></span>
          Workspace
        </div>
        {items.map(it => {
          const active = pathname === it.to || (it.to !== "/dashboard" && pathname.startsWith(it.to));
          const isOverview = it.to === "/dashboard" && pathname === "/dashboard";
          const isActive = active || isOverview;
          return (
            <Link key={it.to} to={it.to}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-300 overflow-hidden ${
                isActive
                  ? "text-[var(--color-bob-orange)] font-semibold shadow-sm"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:translate-x-1"
              }`}>
              {/* Active Background with Gradient */}
              <div className={`absolute inset-0 bg-gradient-to-r from-[var(--color-bob-orange)]/15 to-transparent transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'}`}></div>
              
              {/* Active Indicator Line */}
              <span className={`absolute left-0 top-1/4 bottom-1/4 w-[3px] rounded-r-full bg-[var(--color-bob-orange)] transition-all duration-300 origin-left ${isActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-50'}`} />
              
              <div className={`relative z-10 flex items-center justify-center p-1.5 rounded-lg transition-colors duration-300 ${isActive ? 'bg-[var(--color-bob-orange)]/20 text-[var(--color-bob-orange)] shadow-inner' : 'bg-transparent text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] group-hover:bg-[var(--color-navy-border)]/50'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="transition-transform duration-300 group-hover:scale-110">{it.icon}</svg>
              </div>
              <span className="relative z-10 tracking-wide">{it.label}</span>
            </Link>
          );
        })}
      </nav>
      
      {/* Premium Interactive Logout Card */}
      <div className="p-4 mt-auto border-t border-[var(--color-navy-border)] bg-[var(--color-navy)]/50 backdrop-blur-sm">
        <div className="group relative bg-[var(--color-navy-mid)] border border-[var(--color-navy-border)] rounded-xl p-3 transition-all duration-300 hover:border-[var(--color-bob-orange)]/50 hover:shadow-[0_0_20px_rgba(242,101,34,0.15)] hover:-translate-y-0.5 overflow-hidden cursor-pointer">
          {/* Subtle gradient background on hover */}
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-bob-orange)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
          
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] flex items-center justify-center text-sm font-bold text-white uppercase shadow-lg border border-white/10 shrink-0 relative overflow-hidden">
              <span className="relative z-10">{user?.email?.charAt(0) || "U"}</span>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
            </div>
            
            <div className="flex-1 min-w-0 transition-all duration-300 group-hover:opacity-0 group-hover:-translate-x-2">
              <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{user?.email || "Unknown User"}</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] font-mono uppercase tracking-wider mt-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse"></span>
                {role || "CUSTOMER"}
              </div>
            </div>
            
            {/* Slide-in Logout Button */}
            <button 
              onClick={handleLogout} 
              className="absolute inset-y-0 right-0 left-[3.25rem] flex items-center justify-center gap-2.5 bg-gradient-to-r from-[var(--color-danger)]/90 to-[var(--color-danger)] opacity-0 group-hover:opacity-100 translate-x-8 group-hover:translate-x-0 transition-all duration-300 text-sm font-semibold text-white rounded-r-xl border-l border-white/10"
              title="Logout"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:-translate-x-0.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function DashHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between border-b border-[var(--color-navy-border)] pb-5 mb-8 bg-[var(--color-navy)]/80 backdrop-blur-xl sticky top-0 z-10 pt-8 -mt-7 -mx-8 px-8 shadow-sm">
      <div className="animate-fade-in-up">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="relative flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-[var(--color-bob-orange)] absolute animate-ping opacity-75"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-bob-orange)] relative z-10"></div>
          </div>
          <div className="label-caps text-[var(--color-bob-orange)] tracking-widest">Trustsphere · Live</div>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--color-text-secondary)]">{title}</h1>
        {subtitle && <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 animate-fade-in pb-1">{actions}</div>}
    </header>
  );
}
