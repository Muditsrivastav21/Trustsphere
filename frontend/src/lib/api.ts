import { supabase } from "./supabase";

export async function apiFetch(input: string | URL | globalThis.Request, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  
  const headers = new Headers(init?.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const res = await fetch(input, { ...init, headers });
  if (res.status === 403) {
    const clone = res.clone();
    try {
      const data = await clone.json();
      if (data?.detail && (data.detail.toLowerCase().includes("frozen") || data.detail.toLowerCase().includes("security reasons"))) {
        await supabase.auth.signOut();
        if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
          window.location.href = "/login?frozen=true";
        }
      }
    } catch {}
  }
  return res;
}
