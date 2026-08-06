import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ContinuousTrustProvider } from "@/contexts/ContinuousTrustProvider";

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
  // Removed because we built a specific Customer Dashboard on /dashboard
  useEffect(() => {
    // If you need other redirects, put them here
  }, [role, user, isLoading, navigate, pathname]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[var(--color-page-bg)]">
        <Loader2 size={20} strokeWidth={2} className="animate-spin text-[var(--color-accent-brand)]" />
        <div className="text-[13px] font-medium text-[var(--color-text-sub)]">Verifying access…</div>
      </div>
    );
  }

  return (
    <ContinuousTrustProvider>
      <div className="flex min-h-screen bg-[var(--color-page-bg)]">
        <Sidebar />
        <main className="flex-1 min-w-0 px-8 py-7">
          <Outlet />
        </main>
      </div>
    </ContinuousTrustProvider>
  );
}
