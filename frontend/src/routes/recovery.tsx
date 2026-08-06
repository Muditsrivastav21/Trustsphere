import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { BobLogo } from "@/components/BobLogo";

export const Route = createFileRoute("/recovery")({
  head: () => ({ meta: [{ title: "Account Recovery · TrustSphere" }] }),
  component: RecoveryPage,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

function RecoveryPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState("EMAIL");
  
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  
  // OTP state
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!result || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
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
        setOtp("");
        setError("");
        setTimeLeft(30);
      } else {
        setError(data.detail || "Resend failed.");
      }
    } catch {
      setError("Resend request failed.");
    } finally {
      setIsResending(false);
    }
  };
  
  const [activeSignal, setActiveSignal] = useState(false);
  const signalTimeoutRef = useRef<number | null>(null);

  const triggerSignal = () => {
    setActiveSignal(true);
    if (signalTimeoutRef.current) clearTimeout(signalTimeoutRef.current);
    signalTimeoutRef.current = window.setTimeout(() => setActiveSignal(false), 300);
  };

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
    triggerSignal();
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

    setTimeout(() => setStep(1), 400);
    setTimeout(() => setStep(2), 900);

    let clientIp = "127.0.0.1";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const ipRes = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
      clearTimeout(timeoutId);
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        clientIp = ipData.ip;
      }
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
      
      setTimeout(() => {
        setLoading(false);
        setResult(data);
      }, 1500);
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
      if (data.verified) {
        navigate({ to: "/login" });
      } else {
        throw new Error(data.message || "Invalid OTP");
      }
    } catch (err: any) {
      setError(err.message);
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--color-navy)]" onMouseMove={onMouseMove}>
      <div className="hidden md:flex w-3/5 relative overflow-hidden bg-[#0a111a] border-r border-white/5 flex-col justify-center items-center">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a111a] via-[var(--color-navy)] to-[#070b12]"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
        
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-yellow-500/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[var(--color-bob-orange)]/10 rounded-full blur-[150px] pointer-events-none"></div>

        <div className="absolute top-10 left-10 z-20 flex items-center gap-4">
          <BobLogo size={36} />
          <div className="h-6 w-px bg-white/20"></div>
          <span className="text-white/60 text-xs tracking-[0.2em] font-bold uppercase">Identity Trust Platform</span>
        </div>

        <div className="relative z-10 w-full max-w-xl mx-auto px-12 flex flex-col items-center">
          <div className="relative w-48 h-56 mb-14 flex items-center justify-center">
            <div className="absolute inset-0 border border-yellow-500/20 rounded-full scale-[1.4] animate-pulse" style={{animationDuration: '4s'}}></div>
            <div className="absolute inset-0 border border-[var(--color-bob-orange)]/20 rounded-full scale-[1.1] animate-pulse" style={{animationDuration: '3s', animationDelay: '1s'}}></div>
            <div className="relative z-10 animate-fade-in-up" style={{ animationDuration: '1.5s' }}>
              <svg width="180" height="200" viewBox="0 0 140 160" fill="none" className="drop-shadow-[0_0_30px_rgba(242,101,34,0.3)]">
                <path d="M70 8 L130 30 L130 80 C130 115 105 140 70 152 C35 140 10 115 10 80 L10 30 Z" fill="url(#shield-grad)"/>
                <path d="M70 8 L130 30 L130 80 C130 115 105 140 70 152 C35 140 10 115 10 80 L10 30 Z" stroke="url(#shield-border-grad)" strokeWidth="3"/>
                <path d="M70 8 V152 M10 80 H130 M30 45 L110 115 M30 115 L110 45" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                <circle cx="70" cy="80" r="15" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-500" />
                <path d="M70 65 V80 L80 90" stroke="currentColor" strokeWidth="2" className="text-yellow-500" />
                <defs>
                  <linearGradient id="shield-grad" x1="0" y1="0" x2="140" y2="160" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="rgba(234,179,8,0.15)" />
                    <stop offset="100%" stopColor="rgba(13,27,42,0.8)" />
                  </linearGradient>
                  <linearGradient id="shield-border-grad" x1="0" y1="0" x2="140" y2="160" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#EAB308" />
                    <stop offset="50%" stopColor="#F26522" />
                    <stop offset="100%" stopColor="#EAB308" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            
            <div className="absolute -left-16 top-10 bg-[#0a111a]/80 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 text-xs text-white font-mono shadow-[0_4px_20px_rgba(0,0,0,0.5)] animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
              <span className="text-yellow-400 mr-2">●</span> ATO Defense
            </div>
            <div className="absolute -right-14 bottom-16 bg-[#0a111a]/80 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 text-xs text-white font-mono shadow-[0_4px_20px_rgba(0,0,0,0.5)] animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
              <span className="text-[var(--color-bob-orange)] mr-2">●</span> Identity Proofing
            </div>
          </div>

          <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 text-center leading-[1.15]">
            Recover access with <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-[var(--color-bob-orange)]">confidence</span>.
          </h2>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gradient-to-br from-[var(--color-navy-mid)] to-[var(--color-navy)] relative overflow-y-auto">
        <div className="w-full max-w-md animate-fade-in-up relative z-10 my-auto">
          <div className="md:hidden mb-8"><BobLogo /></div>
          
          <div className="bg-[var(--color-navy)]/60 backdrop-blur-xl border border-white/5 shadow-2xl rounded-2xl p-8 sm:p-10">
            {result ? (
              <div className="animate-fade-in">
                {result.decision === "BLOCK" ? (
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-danger)]/20 flex items-center justify-center mb-4 border border-[var(--color-danger)]/50">
                      <svg className="w-8 h-8 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Attempt Flagged</h2>
                    <p className="text-[var(--color-text-secondary)] text-sm mb-6">{result.message}</p>
                    <Link to="/" className="text-[var(--color-bob-orange)] hover:underline text-sm font-semibold">Return Home</Link>
                  </div>
                ) : (
                  <div className="text-center">
                    {result.decision === "STEP_UP" ? (
                      <div className="mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-medium text-left">
                        {result.message}
                      </div>
                    ) : (
                      <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center mb-4 border border-blue-500/50">
                        <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" /></svg>
                      </div>
                    )}
                    
                    <h2 className="text-2xl font-bold text-white mb-2">Enter Recovery Code</h2>
                    <p className="text-[var(--color-text-secondary)] text-sm mb-6">A 6-digit code has been sent to your email.</p>
                    
                    <form onSubmit={verifyOtp} className="space-y-4">
                      <div className="text-center mb-2 font-mono text-xs">
                        {timeLeft > 0 ? (
                          <span className="text-[var(--color-warning)]">OTP expires in {timeLeft} seconds</span>
                        ) : (
                          <span className="text-[var(--color-danger)] font-bold">OTP has expired. Please request a new one.</span>
                        )}
                      </div>
                      <input required type="text" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" disabled={verifying || timeLeft <= 0} className="w-full text-center tracking-[0.5em] font-mono text-2xl px-4 py-3 bg-black/20 border border-white/5 rounded-xl placeholder:text-white/20 focus:border-[var(--color-bob-orange)] focus:ring-1 focus:ring-[var(--color-bob-orange)]/50 transition-all text-white disabled:opacity-50" />
                      {error && <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg px-4 py-2">{error}</div>}
                      <button type="submit" disabled={verifying || otp.length !== 6 || timeLeft <= 0} className="w-full py-3.5 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50">
                        {verifying ? "Verifying..." : "Confirm Identity"}
                      </button>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={timeLeft > 0 || isResending}
                        className="w-full mt-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 disabled:hover:translate-y-0 text-xs tracking-wide"
                      >
                        {isResending ? "Resending..." : timeLeft > 0 ? `Resend OTP in ${timeLeft}s` : "Resend OTP"}
                      </button>
                    </form>
                  </div>
                )}
                
                {/* Diagnostics */}
                <div className="mt-8 p-4 bg-black/40 rounded-xl text-left border border-white/5">
                  <div className="text-xs text-[var(--color-text-muted)] label-caps mb-2">Diagnostics</div>
                  <div className="font-mono text-[11px] text-[var(--color-text-secondary)]">Decision: <span className={result.decision === 'ALLOW' ? 'text-[var(--color-success)]' : result.decision === 'STEP_UP' ? 'text-yellow-400' : 'text-[var(--color-danger)]'}>{result.decision}</span></div>
                  <div className="font-mono text-[11px] text-[var(--color-text-secondary)] mt-1">Risk Score: <span className={result.risk_score >= 80 ? 'text-[var(--color-success)]' : result.risk_score >= 50 ? 'text-yellow-400' : 'text-[var(--color-danger)]'}>{result.risk_score}/100</span></div>
                  <div className="font-mono text-[11px] text-[var(--color-text-secondary)] mt-1">Reasons: {result.reason_codes.length > 0 ? result.reason_codes.join(', ') : 'None'}</div>
                </div>
              </div>
            ) : loading ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-8 animate-fade-in">
                <div className="relative">
                  <div className="absolute inset-0 bg-yellow-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
                  <svg className="w-16 h-16 animate-pulse-shield text-yellow-500 relative z-10" viewBox="0 0 140 160" fill="none">
                    <path d="M70 8 L130 30 L130 80 C130 115 105 140 70 152 C35 140 10 115 10 80 L10 30 Z" stroke="currentColor" strokeWidth="4" fill="rgba(234,179,8,0.1)"/>
                  </svg>
                </div>
                <div className="w-full space-y-4 bg-black/20 backdrop-blur-sm p-6 rounded-xl border border-white/5 shadow-inner">
                  <div className={`flex items-center gap-4 transition-all duration-500 ${step >= 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(234,179,8,0.6)] ${step > 0 ? 'bg-[var(--color-success)] shadow-none' : 'bg-yellow-500 animate-pulse'}`}></div>
                    <span className={`text-sm font-medium ${step > 0 ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]'}`}>Evaluating context</span>
                  </div>
                  <div className={`flex items-center gap-4 transition-all duration-500 ${step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-20 translate-y-4'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${step > 1 ? 'bg-[var(--color-success)] shadow-none' : step === 1 ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)] animate-pulse' : 'bg-[var(--color-navy-border)]'}`}></div>
                    <span className={`text-sm font-medium ${step > 1 ? 'text-[var(--color-text-secondary)]' : step === 1 ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>Verifying device reputation</span>
                  </div>
                  <div className={`flex items-center gap-4 transition-all duration-500 ${step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-20 translate-y-4'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${step > 2 ? 'bg-[var(--color-success)] shadow-none' : step === 2 ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)] animate-pulse' : 'bg-[var(--color-navy-border)]'}`}></div>
                    <span className={`text-sm font-medium ${step === 2 ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>Computing Risk Score</span>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4 animate-fade-in" onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
                <div className="mb-8">
                  <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--color-text-secondary)]">Account Recovery</h1>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
                    Enter your email to securely reset your password.
                  </p>
                </div>
                
                <div className="group">
                  <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">Email Address</label>
                  <input type="email" required name="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/50 transition-all text-white" />
                </div>
                
                <div className="group">
                  <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">Recovery Channel</label>
                  <select value={channel} onChange={e=>setChannel(e.target.value)} className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/50 transition-all">
                    <option value="EMAIL">Email</option>
                    <option value="SMS">SMS / Text Message</option>
                    <option value="SECURITY_QUESTIONS">Security Questions</option>
                  </select>
                </div>

                <div className="flex items-center justify-between text-[11px] px-3 py-2 bg-[var(--color-navy)]/60 border border-[var(--color-navy-border)] rounded-lg shadow-inner">
                  <span className={`flex items-center gap-1.5 font-medium transition-colors ${activeSignal ? 'text-yellow-500' : 'text-[var(--color-text-muted)]'}`}>
                    <svg className={`w-3.5 h-3.5 transition-transform ${activeSignal ? 'scale-110' : 'scale-100'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Risk Telemetry Active
                  </span>
                  <div className="flex items-center gap-1 h-3">
                    <div className={`w-1 bg-yellow-500 rounded-full transition-all ${activeSignal ? 'h-3 animate-pulse opacity-100' : 'h-1.5 opacity-30'}`}></div>
                    <div className={`w-1 bg-yellow-500 rounded-full transition-all delay-75 ${activeSignal ? 'h-4 animate-pulse opacity-100' : 'h-1 opacity-30'}`}></div>
                    <div className={`w-1 bg-yellow-500 rounded-full transition-all delay-150 ${activeSignal ? 'h-2 animate-pulse opacity-100' : 'h-1.5 opacity-30'}`}></div>
                  </div>
                </div>

                {error && <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg px-4 py-3 animate-fade-in-up">{error}</div>}

                <button type="submit" disabled={loading} className="w-full mt-2 relative overflow-hidden group bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-semibold py-3.5 rounded-xl shadow-[0_4px_14px_rgba(234,179,8,0.3)] hover:shadow-[0_6px_20px_rgba(234,179,8,0.5)] hover:-translate-y-0.5 transition-all">
                  <span className="relative z-10 tracking-wide">Initiate Recovery</span>
                </button>
                
                <div className="text-center pt-4 text-sm text-[var(--color-text-secondary)] font-medium">
                  <Link to="/login" className="text-yellow-500 hover:underline hover:text-yellow-400 transition-colors font-semibold">Back to Login</Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
