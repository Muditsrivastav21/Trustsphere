import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, role, isLoading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: s => s.location.pathname });
  useEffect(() => {
    const channel = supabase
      .channel("public:login_events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "login_events" },
        (payload) => {
          if (payload.new && payload.new.risk_level === "HIGH") {
            toast.error(`High-risk login detected for ${payload.new.customer_id || "User"}!`, {
              description: `Score: ${payload.new.trust_score} • IP: ${payload.new.ip_address}`,
              duration: 8000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 1. Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      navigate({ to: "/login", replace: true });
    }
  }, [user, isLoading, navigate]);

  // 2. RBAC Redirection: Customers shouldn't access the analyst overview
  useEffect(() => {
    if (!isLoading && user && role) {
      if (role === "customer" && pathname === "/dashboard") {
        navigate({ to: "/dashboard/sessions", replace: true });
      }
    }
  }, [role, user, isLoading, navigate, pathname]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-navy)]">
        <div className="relative flex items-center justify-center mb-4">
          <div className="absolute inset-0 bg-[var(--color-bob-orange)] rounded-full blur-xl opacity-20 animate-pulse"></div>
          <svg className="w-12 h-12 animate-pulse-shield text-[var(--color-bob-orange)] relative z-10" viewBox="0 0 140 160" fill="none">
            <path d="M70 8 L130 30 L130 80 C130 115 105 140 70 152 C35 140 10 115 10 80 L10 30 Z" stroke="currentColor" strokeWidth="4" fill="rgba(242,101,34,0.1)"/>
          </svg>
        </div>
        <div className="text-[var(--color-text-secondary)] text-sm font-medium animate-pulse">Verifying access...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-navy)]">
      <Sidebar />
      <main className="flex-1 min-w-0 px-8 py-7">
        <Outlet />
      </main>
    </div>
  );
}
