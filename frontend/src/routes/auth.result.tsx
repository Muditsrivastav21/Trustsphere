import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { TrustRing } from "@/components/TrustRing";
import { BobLogo } from "@/components/BobLogo";
import { CheckCircle2, AlertTriangle, ShieldX, Mail } from "lucide-react";

const API_BASE = "http://localhost:8001";

export const Route = createFileRoute("/auth/result")({
  validateSearch: (s: Record<string, unknown>): { session_id?: string; scenario?: string } => {
    return {
      session_id: s.session_id as string | undefined,
      scenario: s.scenario as string | undefined,
    };
  },
  head: () => ({ meta: [{ title: "Trust score · Bank of Baroda" }] }),
  component: ResultPage,
});

interface TrustResult {
  session_id: string;
  user: { name: string; customer_id: string; city: string; account_type: string };
  trust_score: number;
  risk_level: string;
  auth_action: "ALLOW" | "OTP" | "BLOCK";
  component_scores: { device: number; behavior: number; network: number };
  flags: string[];
  is_known_device: boolean;
  location: { country: string; city: string; ip: string };
  timestamp: string;
  demo_otp?: string;
}

function OtpInputBox({ value, onChange, onComplete, disabled }: {
  value: string; onChange: (val: string) => void; onComplete?: (val: string) => void; disabled?: boolean;
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const focusIdx = Math.min(value.length, 5);
    inputsRef.current[focusIdx]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, i: number) => {
    const rawVal = e.target.value.replace(/\D/g, "");
    if (rawVal.length > 1) {
      const digits = rawVal.slice(0, 6);
      onChange(digits);
      inputsRef.current[Math.min(digits.length, 5)]?.focus();
      if (digits.length === 6 && onComplete) onComplete(digits);
      return;
    }
    const singleDigit = rawVal.slice(-1);
    const currentDigits = value.padEnd(6, " ").split("");
    currentDigits[i] = singleDigit || " ";
    const updated = currentDigits.join("").trimEnd();
    onChange(updated);
    if (singleDigit && i < 5) inputsRef.current[i + 1]?.focus();
    if (updated.length === 6 && onComplete) onComplete(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const currentDigits = value.padEnd(6, " ").split("");
      if (currentDigits[i] && currentDigits[i] !== " ") {
        currentDigits[i] = " ";
        onChange(currentDigits.join("").trimEnd());
      } else if (i > 0) {
        currentDigits[i - 1] = " ";
        onChange(currentDigits.join("").trimEnd());
        inputsRef.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      inputsRef.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      e.preventDefault();
      inputsRef.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      inputsRef.current[Math.min(pasted.length, 5)]?.focus();
      if (pasted.length === 6 && onComplete) onComplete(pasted);
    }
  };

  return (
    <div className="flex gap-2 justify-center mb-5">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          id={`otp-input-${i}`}
          type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={1}
          value={value[i] && value[i] !== " " ? value[i] : ""}
          disabled={disabled}
          onChange={(e) => handleInputChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          aria-label={`Digit ${i + 1} of 6`}
          className="input-field w-11 h-12 text-center font-mono text-[18px] disabled:opacity-50"
        />
      ))}
    </div>
  );
}

function ResultPage() {
  const search = Route.useSearch();
  const [result, setResult] = useState<TrustResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [otp, setOtp] = useState("");
  const [otpStatus, setOtpStatus] = useState<{ verified?: boolean; message?: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleResendOtp = async () => {
    if (isResending || timeLeft > 0 || !result) return;
    setIsResending(true);
    try {
      const resp = await apiFetch(`${API_BASE}/api/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: result.session_id }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setResult(prev => prev ? { ...prev, demo_otp: data.demo_otp } : null);
        setOtp(""); setOtpStatus(null); setTimeLeft(30);
      } else {
        setOtpStatus({ verified: false, message: data.detail || "Resend failed." });
      }
    } catch {
      setOtpStatus({ verified: false, message: "Resend request failed." });
    } finally {
      setIsResending(false);
    }
  };

  useEffect(() => {
    const stored = sessionStorage.getItem("trustsphere_result");
    if (stored) {
      try { setResult(JSON.parse(stored)); setLoading(false); return; } catch {}
    }
    const sid = search.session_id;
    if (sid) {
      apiFetch(`${API_BASE}/api/score/${sid}`)
        .then(r => r.json())
        .then(data => { setResult(data); setLoading(false); })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [search.session_id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-page-bg)] flex items-center justify-center">
        <div className="text-[13.5px] text-[var(--color-text-dim)]">Loading trust evaluation…</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-[var(--color-page-bg)] flex flex-col items-center justify-center gap-4">
        <div className="text-[13.5px] text-[var(--color-text-sub)]">No session data found.</div>
        <Link to="/login" className="btn-primary h-9 px-4 inline-flex items-center">Back to sign in</Link>
      </div>
    );
  }

  const d = result;
  const otpRequiredAndNotVerified = d.auth_action === "OTP" && !otpStatus?.verified;

  const banner =
    d.auth_action === "ALLOW" ? { tone: "success" as const, icon: CheckCircle2, text: `Access granted — welcome, ${d.user.name}` } :
    d.auth_action === "OTP"   ? { tone: "warning" as const, icon: AlertTriangle, text: "Additional verification required — unusual activity detected" } :
                                { tone: "danger" as const, icon: ShieldX, text: "Access blocked — high-risk signals detected" };

  const handleOtpSubmit = async (codeToVerify?: string) => {
    if (isVerifying || otpStatus?.verified || timeLeft <= 0) return;
    const code = codeToVerify || otp;
    if (code.length !== 6) return;
    setIsVerifying(true);
    try {
      const resp = await apiFetch(`${API_BASE}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: d.session_id, otp_code: code }),
      });
      setOtpStatus(await resp.json());
    } catch {
      setOtpStatus({ verified: false, message: "Verification request failed." });
    } finally {
      setIsVerifying(false);
    }
  };

  const formatFlag = (f: string) => {
    const formatMap: Record<string, string> = {
      UNEXPECTED_TIMEZONE: "Unexpected timezone",
      BEHAVIORAL_ANOMALY: "Unusual behavior pattern",
      FOREIGN_IP: "Unrecognized location",
      MULTIPLE_FAILURES: "Multiple failed attempts",
      NEW_DEVICE: "Unrecognized device",
      FAST_TRAVEL: "Impossible travel detected",
      HEADLESS_BROWSER: "Headless browser detected",
      NO_MOUSE_MOVEMENT: "No mouse movement",
    };
    if (formatMap[f]) return formatMap[f];
    return f.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  };

  const reasonText = d.flags.length > 0
    ? d.flags.map(formatFlag).join(" · ")
    : d.is_known_device
      ? "Trusted device · consistent behavior · known IP"
      : "Identity verified";

  const COMPONENTS = [
    { k: "Device", v: d.component_scores.device },
    { k: "Behavior", v: d.component_scores.behavior },
    { k: "Network", v: d.component_scores.network },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-page-bg)] flex flex-col">
      <header className="border-b border-[var(--color-border-default)] px-6 h-16 flex items-center justify-between">
        <Link to="/"><BobLogo size={26} /></Link>
        <Link to="/login" className="text-[13.5px] text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] transition-colors">Sign out</Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[560px]">
          <div className="surface-card p-7 sm:p-9">
            <div className="text-center">
              <div className="label-caps text-[var(--color-text-dim)] mb-2">Identity trust evaluation</div>
              <div className="font-mono text-[11px] text-[var(--color-text-dim)]">
                session <span className="text-[var(--color-text-sub)]">{d.session_id}</span>
              </div>
            </div>

            <div className="flex justify-center my-8">
              <TrustRing score={d.trust_score} size={188} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {COMPONENTS.map(s => (
                <div key={s.k} className="border border-[var(--color-border-default)] rounded-md p-3.5">
                  <div className="label-caps text-[var(--color-text-dim)] mb-1.5">{s.k}</div>
                  <div className="font-mono text-[22px] font-semibold text-[var(--color-text-main)] leading-none">{s.v}</div>
                  <div className="mt-2.5 h-1 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--color-accent-brand)]" style={{ width: `${s.v}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-md px-4 py-3.5 flex items-start gap-3" style={{ background: `var(--color-${banner.tone}-bg)`, border: `1px solid var(--color-${banner.tone}-border)` }}>
              <banner.icon size={18} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: `var(--color-${banner.tone})` }} />
              <div>
                <div className="text-[13.5px] font-medium" style={{ color: `var(--color-${banner.tone})` }}>{banner.text}</div>
                <div className="text-[12.5px] text-[var(--color-text-sub)] mt-0.5">{reasonText}</div>
              </div>
            </div>

            {d.auth_action === "OTP" && !otpStatus?.verified && (
              <div className="mt-5 border border-[var(--color-border-default)] rounded-md p-6">
                <div className="label-caps text-[var(--color-text-dim)] mb-4 text-center">Security verification required</div>
                <div className="text-center mb-4 font-mono text-[11.5px]">
                  {timeLeft > 0
                    ? <span className="text-[var(--color-text-dim)]">Code expires in {timeLeft}s</span>
                    : <span className="text-[var(--color-danger)] font-medium">Code expired — request a new one</span>}
                </div>
                <OtpInputBox value={otp} onChange={setOtp} onComplete={(code) => handleOtpSubmit(code)} disabled={isVerifying || timeLeft <= 0} />
                <button onClick={() => handleOtpSubmit()} disabled={otp.length < 6 || isVerifying || timeLeft <= 0} className="btn-primary w-full h-9">
                  {isVerifying ? "Verifying…" : "Verify code"}
                </button>
                <button type="button" onClick={handleResendOtp} disabled={timeLeft > 0 || isResending} className="btn-secondary w-full h-9 mt-2">
                  {isResending ? "Resending…" : timeLeft > 0 ? `Resend code in ${timeLeft}s` : "Resend code"}
                </button>
                {d.demo_otp ? (
                  <div className="text-[12px] mt-4 text-center font-mono font-medium py-2 rounded-md" style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)", border: "1px solid var(--color-warning-border)" }}>
                    Demo mode code: {d.demo_otp}
                  </div>
                ) : (
                  <div className="text-[12px] text-[var(--color-text-dim)] mt-4 text-center flex items-center justify-center gap-1.5">
                    <Mail size={13} strokeWidth={1.75} />
                    <span>Code sent to your registered email address</span>
                  </div>
                )}
              </div>
            )}

            {otpStatus && (
              <div className="mt-5 text-[13px] rounded-md px-4 py-3 font-medium" style={{
                background: otpStatus.verified ? "var(--color-success-bg)" : "var(--color-danger-bg)",
                border: `1px solid var(--color-${otpStatus.verified ? "success" : "danger"}-border)`,
                color: `var(--color-${otpStatus.verified ? "success" : "danger"})`,
              }}>
                {otpStatus.message}
              </div>
            )}

            {d.flags.length > 0 && (
              <div className="mt-5">
                <div className="label-caps text-[var(--color-text-dim)] mb-2.5">Risk indicators detected</div>
                <div className="flex flex-wrap gap-1.5">
                  {d.flags.map((f: string) => <span key={f} className="chip chip-danger">{formatFlag(f)}</span>)}
                </div>
              </div>
            )}

            <div className="mt-7 flex gap-2.5 justify-center">
              <Link to="/dashboard" aria-disabled={otpRequiredAndNotVerified}
                className={`btn-secondary h-9 px-5 ${otpRequiredAndNotVerified ? "opacity-40 pointer-events-none" : ""}`}>
                View full report
              </Link>
              {d.auth_action !== "BLOCK" ? (
                <Link to="/transfer" aria-disabled={otpRequiredAndNotVerified}
                  className={`btn-primary h-9 px-5 inline-flex items-center ${otpRequiredAndNotVerified ? "opacity-40 pointer-events-none" : ""}`}>
                  Continue to banking
                </Link>
              ) : (
                <Link to="/login" className="h-9 px-5 inline-flex items-center rounded-md text-[13.5px] font-medium text-white" style={{ background: "var(--color-danger)" }}>
                  Back to sign in
                </Link>
              )}
            </div>

            <div className="mt-6 text-center font-mono text-[10.5px] text-[var(--color-text-dim)]">
              /api/score/{d.session_id} · risk level {d.risk_level}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
