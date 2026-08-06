import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { TrustRing } from "@/components/TrustRing";
import { BobLogo } from "@/components/BobLogo";

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

function OtpInputBox({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  onComplete?: (val: string) => void;
  disabled?: boolean;
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first empty slot or slot 0 on mount
  useEffect(() => {
    const focusIdx = Math.min(value.length, 5);
    inputsRef.current[focusIdx]?.focus();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, i: number) => {
    const rawVal = e.target.value.replace(/\D/g, "");

    // Handle paste or multiple digits typed at once
    if (rawVal.length > 1) {
      const digits = rawVal.slice(0, 6);
      onChange(digits);
      const nextIdx = Math.min(digits.length, 5);
      inputsRef.current[nextIdx]?.focus();
      if (digits.length === 6 && onComplete) {
        onComplete(digits);
      }
      return;
    }

    const singleDigit = rawVal.slice(-1);
    const currentDigits = value.padEnd(6, " ").split("");
    currentDigits[i] = singleDigit || " ";
    const updated = currentDigits.join("").trimEnd();
    onChange(updated);

    if (singleDigit && i < 5) {
      inputsRef.current[i + 1]?.focus();
    }

    if (updated.length === 6 && onComplete) {
      onComplete(updated);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const currentDigits = value.padEnd(6, " ").split("");
      if (currentDigits[i] && currentDigits[i] !== " ") {
        currentDigits[i] = " ";
        const updated = currentDigits.join("").trimEnd();
        onChange(updated);
      } else if (i > 0) {
        currentDigits[i - 1] = " ";
        const updated = currentDigits.join("").trimEnd();
        onChange(updated);
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
      const nextIdx = Math.min(pasted.length, 5);
      inputsRef.current[nextIdx]?.focus();
      if (pasted.length === 6 && onComplete) {
        onComplete(pasted);
      }
    }
  };

  return (
    <div className="flex gap-3 justify-center mb-6">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          id={`otp-input-${i}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[i] && value[i] !== " " ? value[i] : ""}
          disabled={disabled}
          onChange={(e) => handleInputChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          className="w-12 h-14 text-center font-mono text-2xl bg-[#0a111a] border border-white/10 rounded-xl focus:border-[var(--color-warning)] focus:ring-2 focus:ring-[var(--color-warning)]/20 focus:outline-none transition-all text-white shadow-inner disabled:opacity-50"
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
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
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
        setOtp("");
        setOtpStatus(null);
        setTimeLeft(30);
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
    // Try to load from sessionStorage first (just set by login page)
    const stored = sessionStorage.getItem("trustsphere_result");
    if (stored) {
      try {
        setResult(JSON.parse(stored));
        setLoading(false);
        return;
      } catch {}
    }

    // Fallback: fetch from API by session_id
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
        <div className="text-[var(--color-text-dim)] animate-pulse">Loading trust evaluation…</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-[var(--color-page-bg)] flex flex-col items-center justify-center gap-4">
        <div className="text-[var(--color-text-sub)]">No session data found.</div>
        <Link to="/login" className="btn-primary">Back to login</Link>
      </div>
    );
  }

  const d = result;
  const otpRequiredAndNotVerified = d.auth_action === "OTP" && !otpStatus?.verified;

  const banner =
    d.auth_action === "ALLOW" ? { cls: "bg-[rgba(0,196,140,0.1)] border-[var(--color-success)]/40 text-[var(--color-success)]", icon: "✓", text: `Access granted — Welcome, ${d.user.name}` } :
    d.auth_action === "OTP"   ? { cls: "bg-[rgba(245,166,35,0.1)] border-[var(--color-warning)]/40 text-[var(--color-warning)]", icon: "!", text: "OTP required — Unusual activity detected" } :
                                { cls: "bg-[rgba(232,56,79,0.1)] border-[var(--color-danger)]/40 text-[var(--color-danger)]", icon: "✕", text: "Access blocked — High-risk signals detected" };

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
      const data = await resp.json();
      setOtpStatus(data);
    } catch {
      setOtpStatus({ verified: false, message: "Verification request failed." });
    } finally {
      setIsVerifying(false);
    }
  };

  const formatFlag = (f: string) => {
    const formatMap: Record<string, string> = {
      'UNEXPECTED_TIMEZONE': 'Unexpected Timezone',
      'BEHAVIORAL_ANOMALY': 'Unusual Behavior Pattern',
      'FOREIGN_IP': 'Unrecognized Location',
      'MULTIPLE_FAILURES': 'Multiple Failed Attempts',
      'NEW_DEVICE': 'Unrecognized Device',
      'FAST_TRAVEL': 'Impossible Travel Detected',
    };
    if (formatMap[f]) return formatMap[f];
    return f.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  const reasonText = d.flags.length > 0
    ? d.flags.map(formatFlag).join(" · ")
    : d.is_known_device
      ? "Trusted device · consistent behavior · known IP"
      : "Identity verified";

  return (
    <div className="min-h-screen bg-[var(--color-page-bg)] flex flex-col relative overflow-hidden transition-colors duration-300">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-glass-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-glass-border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)] pointer-events-none opacity-50 dark:opacity-100"></div>
      <div className="absolute top-[-10%] left-[-10%] w-[800px] h-[800px] bg-[var(--color-bob-orange)]/15 dark:bg-[var(--color-bob-orange)]/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[800px] h-[800px] bg-blue-600/15 dark:bg-blue-600/10 rounded-full blur-[150px] pointer-events-none"></div>

      <header className="border-b border-[var(--color-glass-border)] px-8 h-16 flex items-center justify-between relative z-10 bg-[var(--color-panel-bg)] backdrop-blur-md">
        <Link to="/"><BobLogo /></Link>
        <Link to="/login" className="text-sm text-[var(--color-text-sub)] hover:text-[var(--color-bob-orange)] transition-colors font-medium">Logout</Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-[640px] animate-fade-in-up">
          <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-glass-border)] shadow-[0_15px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_15px_50px_rgba(0,0,0,0.5)] rounded-[2.5rem] p-8 sm:p-12 relative overflow-hidden">
            {/* Subtle glow behind the ring */}
            <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-[100px] pointer-events-none" style={{ background: d.trust_score >= 70 ? 'rgba(0,196,140,0.15)' : d.trust_score >= 40 ? 'rgba(245,166,35,0.15)' : 'rgba(232,56,79,0.15)' }}></div>

            <div className="text-center relative z-10">
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-[var(--color-bob-orange)] animate-pulse shadow-[0_0_10px_rgba(242,101,34,0.8)]"></span>
                <div className="label-caps text-[var(--color-bob-orange)] tracking-widest">Identity Trust Evaluation</div>
              </div>
              <div className="font-mono text-[11px] text-[var(--color-text-sub)] bg-[var(--color-glass-border)] inline-block px-4 py-1.5 rounded-full shadow-inner tracking-wider">
                session_id: <span className="text-[var(--color-text-main)] font-medium">{d.session_id}</span>
              </div>
            </div>

            <div className="flex justify-center my-10 relative z-10 drop-shadow-[0_0_30px_rgba(0,0,0,0.4)]">
              <TrustRing score={d.trust_score} size={240} />
            </div>

            <div className="grid grid-cols-3 gap-4 relative z-10">
              {[
                { k: "Device", v: d.component_scores.device, color: "var(--color-graph-device)", glow: "rgba(242,101,34,0.15)" },
                { k: "Behavior", v: d.component_scores.behavior, color: "var(--color-graph-user)", glow: "rgba(59,130,246,0.15)" },
                { k: "Network", v: d.component_scores.network, color: "var(--color-graph-ip)", glow: "rgba(168,85,247,0.15)" },
              ].map(s => (
                <div key={s.k} className="bg-[var(--color-panel-bg)] backdrop-blur-md border border-[var(--color-glass-border)] rounded-2xl p-5 relative overflow-hidden group hover:border-[var(--color-bob-orange)] transition-all shadow-sm hover:shadow-md dark:shadow-inner">
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ background: `radial-gradient(circle at top right, ${s.glow}, transparent 70%)` }}></div>
                  <div className="label-caps text-[var(--color-text-dim)] mb-1 tracking-widest text-[10px]">{s.k}</div>
                  <div className="font-mono text-4xl font-bold tracking-tight" style={{ color: s.color }}>{s.v}</div>
                  <div className="mt-4 h-1.5 bg-[var(--color-glass-border)] rounded-full overflow-hidden shadow-inner">
                    <div className="h-full rounded-full transition-all duration-1000 relative" style={{ width: `${s.v}%`, background: s.color }}>
                      <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-white/30 rounded-full"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={`mt-8 border backdrop-blur-md rounded-2xl px-6 py-5 flex items-center gap-5 relative z-10 shadow-lg bg-[var(--color-glass-bg)] ${banner.cls}`}>
              <div className="w-12 h-12 rounded-full border-[2px] border-current flex items-center justify-center font-extrabold text-xl shrink-0 shadow-[0_0_20px_currentColor] opacity-90">{banner.icon}</div>
              <div className="flex-1">
                <div className="font-bold text-lg tracking-tight">{banner.text}</div>
                <div className="opacity-80 mt-1 text-sm font-medium">{reasonText}</div>
              </div>
            </div>

            {d.auth_action === "OTP" && !otpStatus?.verified && (
              <div className="mt-6 bg-[var(--color-glass-bg)] backdrop-blur-sm border border-[var(--color-warning)]/30 rounded-2xl p-8 relative z-10 shadow-[0_0_40px_rgba(245,166,35,0.05)]">
                <div className="label-caps text-[var(--color-warning)] mb-5 text-center tracking-widest">Security Verification Required</div>
                <div className="text-center mb-4 font-mono text-xs">
                  {timeLeft > 0 ? (
                    <span className="text-[var(--color-warning)]">OTP expires in {timeLeft} seconds</span>
                  ) : (
                    <span className="text-[var(--color-danger)] font-bold">OTP has expired. Please request a new one.</span>
                  )}
                </div>
                <OtpInputBox value={otp} onChange={setOtp} onComplete={(code) => handleOtpSubmit(code)} disabled={isVerifying || timeLeft <= 0} />
                <button onClick={() => handleOtpSubmit()} className="w-full bg-gradient-to-r from-[var(--color-warning)] to-yellow-600 text-black font-extrabold py-4 rounded-xl shadow-[0_4px_20px_rgba(245,166,35,0.4)] hover:shadow-[0_6px_25px_rgba(245,166,35,0.6)] hover:-translate-y-1 transition-all disabled:opacity-50 disabled:hover:translate-y-0 text-sm tracking-wide" disabled={otp.length < 6 || isVerifying || timeLeft <= 0}>
                  {isVerifying ? "VERIFYING..." : "VERIFY OTP"}
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={timeLeft > 0 || isResending}
                  className="w-full mt-3 bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] hover:bg-[var(--color-glass-hover)] text-[var(--color-text-main)] font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:hover:translate-y-0 text-sm tracking-wide"
                >
                  {isResending ? "RESENDING..." : timeLeft > 0 ? `RESEND OTP IN ${timeLeft}S` : "RESEND OTP"}
                </button>
                {d.demo_otp ? (
                  <div className="text-[12px] text-[var(--color-warning)] mt-5 text-center font-mono font-bold uppercase tracking-widest bg-[var(--color-warning)]/10 py-2.5 rounded-lg border border-[var(--color-warning)]/20 shadow-sm">
                    Demo Mode OTP: {d.demo_otp}
                  </div>
                ) : (
                  <div className="text-[12px] text-[var(--color-warning)]/90 mt-5 text-center font-mono uppercase tracking-widest bg-[var(--color-glass-bg)] py-2.5 px-4 rounded-lg border border-[var(--color-glass-border)] flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 text-[var(--color-warning)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>OTP sent to your registered email address</span>
                  </div>
                )}
              </div>
            )}

            {otpStatus && (
              <div className={`mt-6 text-sm rounded-2xl px-5 py-4 border relative z-10 backdrop-blur-md font-medium ${otpStatus.verified ? "bg-[rgba(0,196,140,0.1)] border-[var(--color-success)]/30 text-[var(--color-success)]" : "bg-[rgba(232,56,79,0.1)] border-[var(--color-danger)]/30 text-[var(--color-danger)]"}`}>
                {otpStatus.message}
              </div>
            )}

            {d.flags.length > 0 && (
              <div className="mt-6 relative z-10 bg-[var(--color-glass-bg)] p-5 rounded-2xl border border-[var(--color-glass-border)] shadow-inner">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <div className="label-caps text-[var(--color-text-sub)] tracking-widest">Risk Indicators Detected</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.flags.map((f: string) => <span key={f} className="bg-red-50 dark:bg-[var(--color-danger)]/10 border border-red-200 dark:border-[var(--color-danger)]/30 text-red-700 dark:text-[var(--color-danger)] px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm">{formatFlag(f)}</span>)}
                </div>
              </div>
            )}

            <div className="mt-10 flex gap-4 justify-center relative z-10">
              <Link 
                to="/dashboard" 
                disabled={otpRequiredAndNotVerified}
                className={`px-8 py-3.5 rounded-xl border border-[var(--color-glass-border)] text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-glass-hover)] transition-all font-semibold shadow-sm backdrop-blur-sm tracking-wide ${otpRequiredAndNotVerified ? 'opacity-40 pointer-events-none' : ''}`}
              >
                View full report
              </Link>
              {d.auth_action !== "BLOCK" && (
                <Link 
                  to="/transfer" 
                  disabled={otpRequiredAndNotVerified}
                  className={`px-10 py-3.5 rounded-xl bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] text-white font-bold shadow-[0_4px_20px_rgba(242,101,34,0.4)] hover:shadow-[0_6px_25px_rgba(242,101,34,0.6)] hover:-translate-y-1 transition-all tracking-wide flex items-center justify-center ${otpRequiredAndNotVerified ? 'opacity-40 pointer-events-none' : ''}`}
                >
                  Continue to banking
                </Link>
              )}
              {d.auth_action === "BLOCK" && (
                <Link 
                  to="/login" 
                  className="px-10 py-3.5 rounded-xl bg-gradient-to-r from-[var(--color-danger)] to-red-800 text-white font-bold shadow-[0_4px_20px_rgba(232,56,79,0.4)] hover:shadow-[0_6px_25px_rgba(232,56,79,0.6)] hover:-translate-y-1 transition-all tracking-wide"
                >
                  Back to login
                </Link>
              )}
            </div>

            <div className="mt-10 text-center font-mono text-[9px] text-white/20 uppercase tracking-[0.25em] relative z-10">
              api/score/{d.session_id} • risk_level: {d.risk_level} • trustsphere-v3.1
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
