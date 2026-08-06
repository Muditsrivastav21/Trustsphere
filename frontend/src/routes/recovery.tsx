import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { BobLogo } from "@/components/BobLogo";
import { AlertTriangle, ShieldX, CheckCircle2, KeyRound, Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/recovery")({
  head: () => ({ meta: [{ title: "Account recovery · TrustSphere" }] }),
  component: RecoveryPage,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";
const EVAL_STEPS = ["Evaluating context", "Verifying device reputation", "Computing risk score"];

function RecoveryPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState("EMAIL");

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!result || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, result]);

  const handleResendOtp = async () => {
    if (isResending || timeLeft > 0 || !result) return;
    setIsResending(true);
    try {
      const resp = await fetch(`${API_BASE}/api/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: result.session_id }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setOtp(""); setError(""); setTimeLeft(30);
      } else {
        setError(data.detail || "Resend failed.");
      }
    } catch {
      setError("Resend request failed.");
    } finally {
      setIsResending(false);
    }
  };

  const [otpVerified, setOtpVerified] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState("");

  // ── Behavioral signal capture ──────────────────────────────
  const keyHoldTimesRef = useRef<number[]>([]);
  const flightTimesRef = useRef<number[]>([]);
  const mouseSpeedsRef = useRef<number[]>([]);
  const keystrokeCountRef = useRef(0);
  const mouseEventCountRef = useRef(0);
  const lastKeyDownRef = useRef<number>(0);
  const lastKeyUpRef = useRef<number>(0);
  const lastMouseRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const typingStartRef = useRef<number>(0);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStep(0);
    setError("");
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
      console.warn("Could not fetch IP", e);
    }

    const payload = {
      email,
      recovery_channel: channel,
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

    try {
      const resp = await fetch(`${API_BASE}/api/recovery/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error("Failed to initiate recovery");
      const data = await resp.json();
      setTimeout(() => { setLoading(false); setResult(data); }, 1000);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError("");
    try {
      const resp = await fetch(`${API_BASE}/api/recovery/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: result.session_id, otp_code: otp }),
      });
      const data = await resp.json();
      if (data.verified) { setOtpVerified(true); setVerifying(false); }
      else throw new Error(data.message || "Invalid OTP");
    } catch (err: any) {
      setError(err.message);
      setVerifying(false);
    }
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    if (newPassword.length < 8) { setResetError("Password must be at least 8 characters long."); return; }
    if (newPassword !== confirmPassword) { setResetError("Passwords do not match."); return; }
    setResetting(true);

    let clientIp = "127.0.0.1";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const ipRes = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
      clearTimeout(timeoutId);
      if (ipRes.ok) clientIp = (await ipRes.json()).ip;
    } catch (e) {
      console.warn("Could not fetch IP", e);
    }

    try {
      const resp = await fetch(`${API_BASE}/api/recovery/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: result.session_id, new_password: newPassword, ip_address: clientIp }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || "Could not reset your password.");
      setResetting(false);
      setResetSuccess(true);
      setTimeout(() => navigate({ to: "/login" }), 1800);
    } catch (err: any) {
      setResetError(err.message);
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-page-bg)]" onMouseMove={onMouseMove}>
      <header className="h-16 flex items-center px-6 border-b border-[var(--color-border-default)]">
        <BobLogo size={26} />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          {result ? (
            result.decision === "BLOCK" ? (
              <div className="text-center">
                <StatusIcon tone="danger" icon={ShieldX} />
                <h1 className="text-[19px] font-semibold text-[var(--color-text-main)] mb-1.5">Attempt flagged</h1>
                <p className="text-[13.5px] text-[var(--color-text-sub)] mb-6">{result.message}</p>
                <Link to="/" className="text-[13.5px] text-[var(--color-accent-brand)] font-medium hover:underline">Return home</Link>
              </div>
            ) : resetSuccess ? (
              <div className="text-center">
                <StatusIcon tone="success" icon={CheckCircle2} />
                <h1 className="text-[19px] font-semibold text-[var(--color-text-main)] mb-1.5">Password updated</h1>
                <p className="text-[13.5px] text-[var(--color-text-sub)]">Redirecting you to sign in…</p>
              </div>
            ) : otpVerified ? (
              <div>
                <div className="text-center mb-6">
                  <StatusIcon tone="warning" icon={KeyRound} />
                  <h1 className="text-[19px] font-semibold text-[var(--color-text-main)] mb-1.5">Set a new password</h1>
                  <p className="text-[13.5px] text-[var(--color-text-sub)]">Identity confirmed. Choose a new password for your account.</p>
                </div>
                <form onSubmit={submitNewPassword} className="space-y-4">
                  <div>
                    <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">New password</label>
                    <input required type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••••" className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Confirm password</label>
                    <input required type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••••" className="input-field w-full" />
                  </div>
                  {resetError && <ErrorBanner message={resetError} />}
                  <button type="submit" disabled={resetting} className="btn-primary w-full h-9">
                    {resetting ? "Updating…" : "Update password"}
                  </button>
                </form>
              </div>
            ) : (
              <div>
                <div className="text-center mb-6">
                  {result.decision === "STEP_UP" ? (
                    <div className="mb-5 p-3.5 rounded-md bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] text-[13px] text-[var(--color-warning)] text-left">
                      {result.message}
                    </div>
                  ) : (
                    <StatusIcon tone="info" icon={KeyRound} />
                  )}
                  <h1 className="text-[19px] font-semibold text-[var(--color-text-main)] mb-1.5">Enter recovery code</h1>
                  <p className="text-[13.5px] text-[var(--color-text-sub)]">A 6-digit code has been sent to your email.</p>
                </div>

                <form onSubmit={verifyOtp} className="space-y-4">
                  <div className="text-center font-mono text-[12px]">
                    {timeLeft > 0
                      ? <span className="text-[var(--color-text-dim)]">Code expires in {timeLeft}s</span>
                      : <span className="text-[var(--color-danger)] font-medium">Code expired — request a new one</span>}
                  </div>
                  <input
                    required type="text" inputMode="numeric" maxLength={6} value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000" disabled={verifying || timeLeft <= 0}
                    className="input-field w-full text-center tracking-[0.5em] font-mono text-[18px]"
                  />
                  {error && <ErrorBanner message={error} />}
                  <button type="submit" disabled={verifying || otp.length !== 6 || timeLeft <= 0} className="btn-primary w-full h-9">
                    {verifying ? "Verifying…" : "Confirm identity"}
                  </button>
                  <button
                    type="button" onClick={handleResendOtp} disabled={timeLeft > 0 || isResending}
                    className="btn-secondary w-full h-9"
                  >
                    {isResending ? "Resending…" : timeLeft > 0 ? `Resend code in ${timeLeft}s` : "Resend code"}
                  </button>
                </form>
              </div>
            )
          ) : loading ? (
            <div className="py-4" aria-live="polite" aria-busy="true">
              <div className="flex flex-col gap-3">
                {EVAL_STEPS.map((label, i) => (
                  <div key={label} className="flex items-center gap-3 text-[13.5px]">
                    <span className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-150"
                      style={{
                        borderColor: step > i ? "var(--color-success)" : step === i ? "var(--color-accent-brand)" : "var(--color-border-default)",
                        background: step > i ? "var(--color-success-bg)" : "transparent",
                      }}>
                      {step > i ? <Check size={11} strokeWidth={3} style={{ color: "var(--color-success)" }} />
                        : step === i ? <Loader2 size={11} strokeWidth={3} className="animate-spin" style={{ color: "var(--color-accent-brand)" }} /> : null}
                    </span>
                    <span style={{ color: step >= i ? "var(--color-text-main)" : "var(--color-text-dim)" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="mb-7">
                <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">Account recovery</h1>
                <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1.5">Enter your email to securely reset your password.</p>
              </div>
              <form onSubmit={submit} className="space-y-4" onKeyDown={onKeyDown} onKeyUp={onKeyUp} noValidate>
                <div>
                  <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Email address</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Recovery channel</label>
                  <select value={channel} onChange={e => setChannel(e.target.value)} className="input-field w-full">
                    <option value="EMAIL">Email</option>
                    <option value="SMS">SMS / text message</option>
                    <option value="SECURITY_QUESTIONS">Security questions</option>
                  </select>
                </div>

                {error && <ErrorBanner message={error} />}

                <button type="submit" disabled={loading} className="btn-primary w-full h-9">Initiate recovery</button>

                <p className="text-center text-[13px] text-[var(--color-text-sub)] pt-1">
                  <Link to="/login" className="text-[var(--color-accent-brand)] font-medium hover:underline">Back to sign in</Link>
                </p>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatusIcon({ tone, icon: Icon }: { tone: "success" | "warning" | "danger" | "info"; icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> }) {
  return (
    <div
      className="w-11 h-11 mx-auto rounded-full flex items-center justify-center mb-4"
      style={{ background: `var(--color-${tone}-bg)`, border: `1px solid var(--color-${tone}-border)` }}
    >
      <Icon size={19} strokeWidth={2} style={{ color: `var(--color-${tone})` }} />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="text-[13px] text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-md px-3 py-2.5">
      {message}
    </div>
  );
}
