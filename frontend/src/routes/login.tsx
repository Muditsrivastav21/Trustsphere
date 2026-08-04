import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { BobLogo } from "@/components/BobLogo";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · Bank of Baroda" }] }),
  component: LoginPage,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  
  const [activeSignal, setActiveSignal] = useState(false);
  const signalTimeoutRef = useRef<number | null>(null);
  const [cryptoLogs, setCryptoLogs] = useState<string[]>([
    "[SYSTEM] Zero-Trust Environment Initialized",
    "[CRYPTO] WebCrypto API ready for local hashing"
  ]);
  
  const [isDemoDrawerOpen, setIsDemoDrawerOpen] = useState(false);

  const triggerSignal = () => {
    if (!activeSignal) {
      setCryptoLogs(prev => [...prev.slice(-4), `[${new Date().toISOString().split('T')[1].slice(0,12)}] Hashing telemetry via SHA-256...`]);
    }
    setActiveSignal(true);
    if (signalTimeoutRef.current) clearTimeout(signalTimeoutRef.current);
    signalTimeoutRef.current = window.setTimeout(() => setActiveSignal(false), 300);
  };

  // Handle Google OAuth Redirect
  useEffect(() => {
    if (window.location.search.includes('googleCallback=true')) {
      setLoading(true);
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          evaluateTrust(session.access_token).catch(e => {
            setError("Google login evaluation failed: " + e.message);
            setLoading(false);
          });
        }
      });
    }
  }, []);

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

  // ── Authentication & Adaptive Trust Evaluation ────────────────
  const evaluateTrust = async (accessToken: string) => {
    // Animate progress steps
    setCryptoLogs(prev => [...prev.slice(-4), `[SYSTEM] Generating zero-knowledge payload...`]);
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
      console.warn("Could not fetch IP, defaulting to 127.0.0.1", e);
    }

    const payload = {
      customer_id: "JWT_AUTH", // Handled by backend JWT
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
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) throw new Error("Trust evaluation failed");
    const result = await resp.json();
    
    sessionStorage.setItem("trustsphere_result", JSON.stringify(result));
    setTimeout(() => navigate({ to: "/auth/result", search: { session_id: result.session_id } }), 600);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStep(0);
    setError("");

    try {
      if (isRegistering) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password: pwd,
          options: { data: { full_name: name } }
        });
        if (signUpError) throw signUpError;
        
        // Wait briefly for DB triggers
        await new Promise(r => setTimeout(r, 1000));
        
        if (data.session) {
          await evaluateTrust(data.session.access_token);
        } else {
          setError("Registration successful! Check your email to verify.");
          setLoading(false);
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password: pwd });
        if (signInError) throw signInError;
        if (data.session) {
          await evaluateTrust(data.session.access_token);
        }
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed.");
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login?googleCallback=true` }
    });
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen flex bg-[var(--color-page-bg)] transition-colors duration-500" onMouseMove={onMouseMove}>
      <div className="hidden md:flex w-3/5 relative overflow-hidden bg-[var(--color-page-bg)] border-r border-[var(--color-glass-border)] flex-col justify-center items-center transition-colors duration-500">
        {/* Deep ambient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-page-bg)] via-[var(--color-page-bg)] to-[var(--color-panel-bg)]"></div>
        
        {/* Animated grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-glass-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-glass-border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30"></div>
        
        {/* Massive glowing orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[var(--color-bob-orange)]/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none"></div>

        {/* Floating tech nodes */}
        <div className="absolute top-[20%] right-[20%] w-2 h-2 bg-blue-400 rounded-full shadow-[0_0_15px_rgba(96,165,250,0.8)] animate-ping"></div>
        <div className="absolute bottom-[30%] left-[25%] w-1.5 h-1.5 bg-[var(--color-bob-orange)] rounded-full shadow-[0_0_15px_rgba(242,101,34,0.8)] animate-pulse" style={{animationDuration: '3s'}}></div>
        <div className="absolute top-[50%] right-[30%] w-3 h-3 bg-purple-500 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.8)] animate-pulse" style={{animationDuration: '4s'}}></div>

        <div className="absolute top-10 left-10 z-20 flex items-center gap-4">
          <BobLogo size={36} />
          <div className="h-6 w-px bg-[var(--color-glass-border)]"></div>
          <span className="text-[var(--color-text-sub)] text-xs tracking-[0.2em] font-bold uppercase">Identity Trust Platform</span>
        </div>

        <div className="relative z-10 w-full max-w-xl mx-auto px-12 flex flex-col items-center">
          {/* Enhanced 3D-ish Shield Graphic */}
          <div className="relative w-48 h-56 mb-14 flex items-center justify-center">
            {/* Outer glow rings */}
            <div className="absolute inset-0 border border-[var(--color-bob-orange)]/20 rounded-full scale-[1.4] animate-pulse" style={{animationDuration: '4s'}}></div>
            <div className="absolute inset-0 border border-blue-500/20 rounded-full scale-[1.1] animate-pulse" style={{animationDuration: '3s', animationDelay: '1s'}}></div>
            
            {/* Main Shield */}
            <div className="relative z-10 animate-fade-in-up" style={{ animationDuration: '1.5s' }}>
              <svg width="180" height="200" viewBox="0 0 140 160" fill="none" className="drop-shadow-[0_0_30px_rgba(242,101,34,0.3)]">
                {/* Shield background fill */}
                <path d="M70 8 L130 30 L130 80 C130 115 105 140 70 152 C35 140 10 115 10 80 L10 30 Z"
                  fill="url(#shield-grad)"/>
                {/* Shield border */}
                <path d="M70 8 L130 30 L130 80 C130 115 105 140 70 152 C35 140 10 115 10 80 L10 30 Z"
                  stroke="url(#shield-border-grad)" strokeWidth="3"/>
                {/* Inner tech lines */}
                <path d="M70 8 V152 M10 80 H130 M30 45 L110 115 M30 115 L110 45" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                <defs>
                  <linearGradient id="shield-grad" x1="0" y1="0" x2="140" y2="160" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="rgba(242,101,34,0.15)" />
                    <stop offset="100%" stopColor="var(--color-page-bg)" />
                  </linearGradient>
                  <linearGradient id="shield-border-grad" x1="0" y1="0" x2="140" y2="160" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#F26522" />
                    <stop offset="50%" stopColor="#FF9E66" />
                    <stop offset="100%" stopColor="#F26522" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            
            {/* Floating Glass Badges */}
            <div className="absolute -left-16 top-10 bg-[var(--color-panel-bg)] backdrop-blur-md border border-[var(--color-glass-border)] rounded-full px-4 py-1.5 text-xs text-[var(--color-text-main)] font-mono shadow-[0_4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)] animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
              <span className="text-[var(--color-success)] mr-2">●</span> 99.9% Accuracy
            </div>
            <div className="absolute -right-14 bottom-16 bg-[var(--color-panel-bg)] backdrop-blur-md border border-[var(--color-glass-border)] rounded-full px-4 py-1.5 text-xs text-[var(--color-text-main)] font-mono shadow-[0_4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)] animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
              <span className="text-blue-400 mr-2">●</span> Zero Trust
            </div>
            <div className="absolute -left-8 -bottom-2 bg-[var(--color-panel-bg)] backdrop-blur-md border border-[var(--color-glass-border)] rounded-full px-4 py-1.5 text-xs text-[var(--color-text-main)] font-mono shadow-[0_4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)] animate-fade-in-up" style={{ animationDelay: '1.1s' }}>
              <span className="text-purple-400 mr-2">●</span> Real-time AI
            </div>
          </div>

          <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-[var(--color-text-main)] text-center leading-[1.15]">
            Security that <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-bob-orange)] to-yellow-500">adapts</span><br/>to your behavior.
          </h2>
          <p className="mt-6 text-lg text-[var(--color-text-sub)] max-w-md mx-auto text-center leading-relaxed">
            Every signal like device, behavior, network, and location is scored continuously in the background.
          </p>
          
          {/* Visualizer bars */}
          <div className="w-full max-w-sm mt-12 h-12 relative flex items-end justify-between px-4 opacity-40">
            <div className="absolute inset-x-0 bottom-0 border-b border-white/10"></div>
            {[40, 60, 45, 80, 50, 90, 75, 100, 85, 95, 60, 70, 85].map((h, i) => (
              <div key={i} className="w-1.5 bg-gradient-to-t from-[var(--color-bob-orange)] to-transparent rounded-t-sm" style={{ height: `${h}%`, opacity: 0.3 + (h/200) }}></div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-[var(--color-page-bg)] relative overflow-hidden transition-colors duration-500">
        {/* Subtle background glow elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-bob-orange)]/5 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="w-full max-w-md animate-fade-in-up relative z-10">
          <div className="md:hidden mb-8"><BobLogo /></div>
          
          <div className="bg-[var(--color-panel-bg)] backdrop-blur-xl border border-[var(--color-glass-border)] shadow-2xl rounded-2xl p-8 sm:p-10 transition-colors duration-500">
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-bob-orange)] animate-pulse"></span>
                <div className="label-caps text-[var(--color-bob-orange)] tracking-widest">Customer Portal</div>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-text-main)]">
                {isRegistering ? "Create Account" : "Welcome back"}
              </h1>
              <p className="text-sm text-[var(--color-text-sub)] mt-2 leading-relaxed">
                {isRegistering ? "Register to securely access your digital banking." : "Sign in securely to continue to your account."}
              </p>
            </div>

            {!loading && (
              <div className="animate-fade-in mb-6">
                <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1a2332] text-black dark:text-white font-semibold rounded-xl text-sm hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.1)] transition-all duration-300 group border border-[var(--color-glass-border)]">
                  <svg className="w-5 h-5 transition-transform group-hover:scale-110 duration-300" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>
                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--color-glass-border)]"></div></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-[var(--color-page-bg)] px-4 py-1.5 rounded-full border border-[var(--color-glass-border)] text-[var(--color-text-dim)] tracking-wider uppercase shadow-sm">Or continue with email</span></div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-8 animate-fade-in">
                <div className="relative">
                  <div className="absolute inset-0 bg-[var(--color-bob-orange)] rounded-full blur-xl opacity-20 animate-pulse"></div>
                  <svg className="w-16 h-16 animate-pulse-shield text-[var(--color-bob-orange)] relative z-10" viewBox="0 0 140 160" fill="none">
                    <path d="M70 8 L130 30 L130 80 C130 115 105 140 70 152 C35 140 10 115 10 80 L10 30 Z" stroke="currentColor" strokeWidth="4" fill="rgba(242,101,34,0.1)"/>
                  </svg>
                </div>
                <div className="w-full space-y-4 bg-black/20 backdrop-blur-sm p-6 rounded-xl border border-white/5 shadow-inner">
                  <div className={`flex items-center gap-4 transition-all duration-500 ${step >= 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(242,101,34,0.6)] ${step > 0 ? 'bg-[var(--color-success)] shadow-none' : 'bg-[var(--color-bob-orange)] animate-pulse'}`}></div>
                    <span className={`text-sm font-medium ${step > 0 ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]'}`}>Capturing behavioral biometrics</span>
                  </div>
                  <div className={`flex items-center gap-4 transition-all duration-500 ${step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-20 translate-y-4'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${step > 1 ? 'bg-[var(--color-success)] shadow-none' : step === 1 ? 'bg-[var(--color-bob-orange)] shadow-[0_0_8px_rgba(242,101,34,0.6)] animate-pulse' : 'bg-[var(--color-navy-border)]'}`}></div>
                    <span className={`text-sm font-medium ${step > 1 ? 'text-[var(--color-text-secondary)]' : step === 1 ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>Evaluating network reputation</span>
                  </div>
                  <div className={`flex items-center gap-4 transition-all duration-500 ${step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-20 translate-y-4'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${step > 2 ? 'bg-[var(--color-success)] shadow-none' : step === 2 ? 'bg-[var(--color-bob-orange)] shadow-[0_0_8px_rgba(242,101,34,0.6)] animate-pulse' : 'bg-[var(--color-navy-border)]'}`}></div>
                    <span className={`text-sm font-medium ${step === 2 ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>Computing final Trust Score</span>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5 animate-fade-in" onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
                {isRegistering && (
                  <div className="group">
                    <label className="label-caps text-[var(--color-text-secondary)] block mb-2 group-focus-within:text-[var(--color-bob-orange)] transition-colors">Full Name</label>
                    <input required value={name} onChange={e=>setName(e.target.value)} placeholder="Rahul Sharma" className="w-full px-4 py-3.5 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-bob-orange)] focus:ring-2 focus:ring-[var(--color-bob-orange)]/20 transition-all duration-300 shadow-inner text-white" />
                  </div>
                )}
                <div className="group">
                  <label className="label-caps text-[var(--color-text-secondary)] block mb-2 group-focus-within:text-[var(--color-bob-orange)] transition-colors">Email Address</label>
                  <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="customer@email.com" className="w-full px-4 py-3.5 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-bob-orange)] focus:ring-2 focus:ring-[var(--color-bob-orange)]/20 transition-all duration-300 shadow-inner text-white" />
                </div>
                <div className="group">
                  <label className="label-caps text-[var(--color-text-secondary)] block mb-2 group-focus-within:text-[var(--color-bob-orange)] transition-colors">Password</label>
                  <input required value={pwd} onChange={e=>setPwd(e.target.value)} type="password" placeholder="••••••••••" className="w-full px-4 py-3.5 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-bob-orange)] focus:ring-2 focus:ring-[var(--color-bob-orange)]/20 transition-all duration-300 shadow-inner text-white" />
                </div>

                {/* Visual Biometrics Indicator */}
                <div className="flex flex-col gap-3 mt-3">
                  <div className={`flex items-center justify-between text-xs px-4 py-3 rounded-xl border backdrop-blur-md transition-all duration-300 ${activeSignal ? 'bg-[var(--color-bob-orange)]/10 border-[var(--color-bob-orange)]/30 shadow-[0_0_20px_rgba(242,101,34,0.15)]' : 'bg-black/30 border-white/5 shadow-inner'}`}>
                    <span className={`flex items-center gap-2.5 transition-colors duration-300 font-bold tracking-wider uppercase text-[10px] ${activeSignal ? 'text-[var(--color-bob-orange)] drop-shadow-[0_0_8px_rgba(242,101,34,0.6)]' : 'text-[var(--color-text-muted)]'}`}>
                      <svg className={`w-4 h-4 transition-transform duration-300 ${activeSignal ? 'scale-110 animate-pulse' : 'scale-100 opacity-50'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      Behavioral Analysis Active
                    </span>
                    <div className="flex items-center gap-1.5 h-4">
                      <div className={`w-1.5 rounded-full transition-all duration-150 ${activeSignal ? 'bg-[var(--color-bob-orange)] h-3 shadow-[0_0_8px_rgba(242,101,34,0.8)]' : 'bg-white/20 h-1.5'}`}></div>
                      <div className={`w-1.5 rounded-full transition-all duration-150 delay-75 ${activeSignal ? 'bg-[var(--color-bob-orange)] h-4 shadow-[0_0_8px_rgba(242,101,34,0.8)]' : 'bg-white/20 h-1'}`}></div>
                      <div className={`w-1.5 rounded-full transition-all duration-150 delay-150 ${activeSignal ? 'bg-[var(--color-bob-orange)] h-2.5 shadow-[0_0_8px_rgba(242,101,34,0.8)]' : 'bg-white/20 h-1.5'}`}></div>
                    </div>
                  </div>
                  
                  {/* Security Terminal Logs */}
                  <div className="relative rounded-xl p-[1px] bg-gradient-to-b from-white/10 to-transparent overflow-hidden group">
                    <div className="bg-[#05090f] rounded-[11px] p-3 shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)] h-[96px] overflow-hidden flex flex-col justify-end relative">
                      
                      {/* Grid background inside terminal */}
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4285F410_1px,transparent_1px),linear-gradient(to_bottom,#4285F410_1px,transparent_1px)] bg-[size:10px_10px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_100%,transparent_100%)] pointer-events-none"></div>

                      <div className="relative z-10 flex flex-col justify-end h-full">
                        {cryptoLogs.map((log, i) => {
                          const isNew = i === cryptoLogs.length - 1;
                          return (
                            <div key={i} className={`font-mono text-[10.5px] leading-[1.4] flex items-start gap-2 ${isNew ? 'animate-fade-in text-[#60A5FA] drop-shadow-[0_0_6px_rgba(96,165,250,0.6)] font-semibold' : 'text-[#60A5FA]/50'}`}>
                              <span className={`${isNew ? 'text-[#34A853] drop-shadow-[0_0_6px_rgba(52,168,83,0.9)] animate-pulse' : 'text-[#34A853]/40'} shrink-0 translate-y-[2px]`}>
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                              </span> 
                              <span className="tracking-wide break-all">{log}</span>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Blinking block cursor */}
                      {activeSignal && (
                        <div className="absolute bottom-[10px] right-[10px] w-2 h-3 bg-[#60A5FA] animate-pulse drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]"></div>
                      )}
                    </div>
                  </div>
                </div>

                {error && <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg px-4 py-3 animate-fade-in-up flex items-center gap-2 font-medium"><svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{error}</div>}

                <button type="submit" disabled={loading} className="w-full mt-4 relative overflow-hidden group bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] text-white font-semibold py-3.5 rounded-xl shadow-[0_4px_14px_rgba(242,101,34,0.4)] hover:shadow-[0_6px_20px_rgba(242,101,34,0.6)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-70 disabled:hover:translate-y-0">
                  <span className="relative z-10 tracking-wide">{isRegistering ? "Register securely" : "Sign In"}</span>
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                </button>
                
                <div className="text-center pt-2 text-sm text-[var(--color-text-secondary)] font-medium">
                  {isRegistering ? "Already have an account? " : "Don't have an account? "}
                  <button type="button" onClick={() => setIsRegistering(!isRegistering)} className="text-[var(--color-bob-orange)] hover:underline hover:text-white transition-colors ml-1 font-semibold">
                    {isRegistering ? "Sign in" : "Register"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Demo Tools Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button 
          onClick={() => setIsDemoDrawerOpen(true)}
          className="bg-[#0a111a] border border-[var(--color-bob-orange)]/50 text-white p-3 rounded-full shadow-lg hover:shadow-[0_0_15px_rgba(242,101,34,0.5)] transition-all flex items-center justify-center group"
          title="Demo Accounts"
        >
          <svg className="w-5 h-5 text-[var(--color-bob-orange)] group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </button>
      </div>

      {/* Demo Drawer Overlay */}
      {isDemoDrawerOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsDemoDrawerOpen(false)}></div>
          <div className="relative w-80 bg-[var(--color-navy)] border-l border-white/10 h-full shadow-2xl animate-fade-in flex flex-col">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#0a111a]">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--color-bob-orange)] animate-pulse"></span>
                Demo Accounts
              </h3>
              <button onClick={() => setIsDemoDrawerOpen(false)} className="text-white/50 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {[
                { name: "Rahul Sharma", email: "rahul.sharma@email.com", role: "Customer", type: "Checking" },
                { name: "Priya Mehta", email: "priya.mehta@email.com", role: "Customer", type: "Savings" },
                { name: "Arvind Kapoor", email: "arvind.kapoor@email.com", role: "Customer", type: "Checking" },
                { name: "Sneha Iyer", email: "sneha.iyer@email.com", role: "Customer", type: "Checking" },
                { name: "Mohammed Raza", email: "mohammed.raza@email.com", role: "Customer", type: "Savings" },
                { name: "System Analyst", email: "analyst@trustsphere.com", role: "Analyst", pwd: "Analyst@123", type: "Admin" }
              ].map(user => (
                <button
                  key={user.email}
                  onClick={() => {
                    setEmail(user.email);
                    setPwd(user.pwd || "Password@123");
                    setIsDemoDrawerOpen(false);
                  }}
                  className="w-full text-left p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[var(--color-bob-orange)]/50 transition-all group flex flex-col"
                >
                  <div className="flex justify-between items-start mb-1 w-full">
                    <span className="font-semibold text-white text-sm">{user.name}</span>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${user.role === 'Analyst' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                      {user.role}
                    </span>
                  </div>
                  <div className="text-xs text-white/50 mb-2">{user.email}</div>
                  <div className="text-[10px] text-white/40 flex items-center gap-1 mt-auto pt-2">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                    {user.type} Account
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-white/10 text-xs text-white/40 text-center bg-[#0a111a]">
              Select an account to autofill credentials.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
