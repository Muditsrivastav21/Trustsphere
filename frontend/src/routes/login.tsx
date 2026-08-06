import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { BobLogo } from "@/components/BobLogo";
import { supabase } from "@/lib/supabase";
import { ChevronDown, Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · Bank of Baroda" }] }),
  component: LoginPage,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

const DEMO_ACCOUNTS = [
  { name: "Rahul Sharma", email: "rahul.sharma@email.com", role: "Customer" },
  { name: "Priya Mehta", email: "priya.mehta@email.com", role: "Customer" },
  { name: "Arvind Kapoor", email: "arvind.kapoor@email.com", role: "Customer" },
  { name: "System Analyst", email: "analyst@trustsphere.com", role: "Analyst", pwd: "Analyst@123" },
];

const EVAL_STEPS = ["Verifying credentials", "Evaluating device & network", "Computing trust score"];

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);

  // ── Behavioral signal capture (real telemetry, not decorative) ──
  const keyHoldTimesRef = useRef<number[]>([]);
  const flightTimesRef = useRef<number[]>([]);
  const mouseSpeedsRef = useRef<number[]>([]);
  const keystrokeCountRef = useRef(0);
  const mouseEventCountRef = useRef(0);
  const lastKeyDownRef = useRef<number>(0);
  const lastKeyUpRef = useRef<number>(0);
  const lastMouseRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const typingStartRef = useRef<number>(0);

  useEffect(() => {
    if (window.location.search.includes("googleCallback=true")) {
      setLoading(true);
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          evaluateTrust(session.access_token).catch(e => {
            setError("Google sign-in evaluation failed: " + e.message);
            setLoading(false);
          });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (typingStartRef.current === 0) typingStartRef.current = Date.now();
    lastKeyDownRef.current = Date.now();
    if (lastKeyUpRef.current > 0) flightTimesRef.current.push(Date.now() - lastKeyUpRef.current);
  }, []);

  const onKeyUp = useCallback(() => {
    keystrokeCountRef.current++;
    if (lastKeyDownRef.current > 0) keyHoldTimesRef.current.push(Date.now() - lastKeyDownRef.current);
    lastKeyUpRef.current = Date.now();
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    mouseEventCountRef.current++;
    const now = Date.now();
    const prev = lastMouseRef.current;
    if (prev && now - prev.t > 0) {
      const dist = Math.sqrt(Math.pow(e.clientX - prev.x, 2) + Math.pow(e.clientY - prev.y, 2));
      mouseSpeedsRef.current.push(dist / ((now - prev.t) / 1000));
    }
    lastMouseRef.current = { x: e.clientX, y: e.clientY, t: now };
  }, []);

  const computeWpm = () => {
    const elapsed = (Date.now() - typingStartRef.current) / 1000 / 60;
    if (elapsed <= 0) return 0;
    return Math.round((keystrokeCountRef.current / 5) / elapsed);
  };

  const evaluateTrust = async (accessToken: string) => {
    setStep(0);
    setTimeout(() => setStep(1), 350);
    setTimeout(() => setStep(2), 800);

    let clientIp = "127.0.0.1";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const ipRes = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
      clearTimeout(timeoutId);
      if (ipRes.ok) clientIp = (await ipRes.json()).ip;
    } catch (e) {
      console.warn("Could not fetch IP, defaulting to 127.0.0.1", e);
    }

    const payload = {
      customer_id: "JWT_AUTH",
      password: "HIDDEN",
      ip_address: clientIp,
      device: {
        user_agent: navigator.userAgent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screen_res: `${screen.width}x${screen.height}`,
        language: navigator.language,
        platform: navigator.platform,
        color_depth: screen.colorDepth,
        touch_points: navigator.maxTouchPoints || 0,
      },
      behavior: {
        key_hold_times: keyHoldTimesRef.current.slice(0, 50),
        flight_times: flightTimesRef.current.slice(0, 50),
        typing_speed_wpm: computeWpm(),
        mouse_speeds: mouseSpeedsRef.current.slice(0, 50),
        mouse_event_count: mouseEventCountRef.current,
        total_keystrokes: keystrokeCountRef.current,
      },
    };

    const resp = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) throw new Error("Trust evaluation failed");
    const result = await resp.json();

    sessionStorage.setItem("trustsphere_result", JSON.stringify(result));
    navigate({ to: "/auth/result", search: { session_id: result.session_id } });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStep(0);
    setError("");

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (signInError) throw signInError;
      if (data.session) await evaluateTrust(data.session.access_token);
    } catch (err: any) {
      setError(err.message || "Sign-in failed. Check your credentials and try again.");
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login?googleCallback=true` },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-page-bg)]" onMouseMove={onMouseMove}>
      <header className="h-16 flex items-center px-6 border-b border-[var(--color-border-default)]">
        <BobLogo size={26} />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-7">
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">Sign in</h1>
            <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1.5">
              Continue to your Bank of Baroda digital banking account.
            </p>
          </div>

          {loading ? (
            <div className="py-6" aria-live="polite" aria-busy="true">
              <div className="flex flex-col gap-3">
                {EVAL_STEPS.map((label, i) => (
                  <div key={label} className="flex items-center gap-3 text-[13.5px]">
                    <span className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-150"
                      style={{
                        borderColor: step > i ? "var(--color-success)" : step === i ? "var(--color-accent-brand)" : "var(--color-border-default)",
                        background: step > i ? "var(--color-success-bg)" : "transparent",
                      }}>
                      {step > i ? (
                        <Check size={11} strokeWidth={3} style={{ color: "var(--color-success)" }} />
                      ) : step === i ? (
                        <Loader2 size={11} strokeWidth={3} className="animate-spin" style={{ color: "var(--color-accent-brand)" }} />
                      ) : null}
                    </span>
                    <span style={{ color: step >= i ? "var(--color-text-main)" : "var(--color-text-dim)" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-2.5 h-9 border border-[var(--color-border-default)] rounded-md text-[13.5px] font-medium text-[var(--color-text-main)] hover:bg-[var(--color-surface-sunken)] transition-colors duration-100 mb-4"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--color-border-default)]" /></div>
                <div className="relative flex justify-center"><span className="bg-[var(--color-page-bg)] px-3 text-[11px] text-[var(--color-text-dim)] uppercase tracking-wide">or</span></div>
              </div>

              <form onSubmit={submit} className="space-y-4" onKeyDown={onKeyDown} onKeyUp={onKeyUp} noValidate>
                <div>
                  <label htmlFor="email" className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Email address</label>
                  <input
                    id="email" type="email" required autoComplete="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-[12.5px] font-medium text-[var(--color-text-main)]">Password</label>
                    <Link to="/recovery" className="text-[12.5px] text-[var(--color-accent-brand)] hover:underline">Forgot password?</Link>
                  </div>
                  <input
                    id="password" type="password" required autoComplete="current-password" value={pwd}
                    onChange={e => setPwd(e.target.value)}
                    placeholder="••••••••••"
                    className="input-field w-full"
                  />
                </div>

                {error && (
                  <div role="alert" className="text-[13px] text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-md px-3 py-2.5">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full h-9 mt-1">
                  Sign in
                </button>
              </form>

              <p className="text-center text-[13px] text-[var(--color-text-sub)] mt-6">
                Don't have an account? <Link to="/signup" className="text-[var(--color-accent-brand)] font-medium hover:underline">Create one</Link>
              </p>

              <div className="mt-8 pt-5 border-t border-[var(--color-border-default)]">
                <button
                  onClick={() => setDemoOpen(v => !v)}
                  aria-expanded={demoOpen}
                  className="w-full flex items-center justify-between text-[12.5px] text-[var(--color-text-dim)] hover:text-[var(--color-text-sub)] transition-colors"
                >
                  <span>Demo accounts (judges &amp; reviewers)</span>
                  <ChevronDown size={14} className={`transition-transform duration-150 ${demoOpen ? "rotate-180" : ""}`} />
                </button>
                {demoOpen && (
                  <div className="mt-3 space-y-1">
                    {DEMO_ACCOUNTS.map(acc => (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => { setEmail(acc.email); setPwd(acc.pwd || "Password@123"); setDemoOpen(false); }}
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left hover:bg-[var(--color-surface-sunken)] transition-colors duration-100"
                      >
                        <span className="text-[12.5px] text-[var(--color-text-main)]">{acc.name}</span>
                        <span className="chip chip-neutral">{acc.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
