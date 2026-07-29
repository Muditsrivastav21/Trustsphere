import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-page-bg)] px-4">
      <div className="max-w-md text-center">
        <div className="font-mono text-[11px] label-caps text-[var(--color-bob-orange)]">Error 404</div>
        <h1 className="mt-3 text-6xl font-bold tracking-tight text-[var(--color-text-primary)]">Page not found</h1>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          The route you requested isn't registered in TrustSphere.
        </p>
        <div className="mt-6">
          <Link to="/" className="btn-primary inline-flex">Return home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-page-bg)] px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">An unexpected error interrupted this view.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="btn-primary">Try again</button>
          <a href="/" className="btn-ghost">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TrustSphere AI — Identity Trust for Bank of Baroda" },
      { name: "description", content: "Real-time identity trust scoring and adaptive authentication for Bank of Baroda digital banking." },
      { name: "theme-color", content: "#0D1B2A" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark')
            } else {
              document.documentElement.classList.remove('dark')
            }
          } catch (_) {}
        `}} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { AuthProvider } from "@/contexts/AuthContext";
import { ContinuousTrustProvider } from "@/contexts/ContinuousTrustProvider";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ContinuousTrustProvider>
          <Outlet />
        </ContinuousTrustProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
