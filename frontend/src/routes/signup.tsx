import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { BobLogo } from "@/components/BobLogo";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up · Bank of Baroda" }] }),
  component: SignupPage,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

// Wizard steps: 0 = personal details + Aadhaar, 1 = PAN, 2 = selfie + submit
const STEP_LABELS = ["Details & Aadhaar", "PAN Card", "Selfie"];

function SignupPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "", email: "", phone: "", dob: "", aadhaar_number: "", pan_number: "", password: ""
  });

  const [formStep, setFormStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const [activeSignal, setActiveSignal] = useState(false);
  const signalTimeoutRef = useRef<number | null>(null);

  const webcamRef = useRef<Webcam>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [aadhaarImage, setAadhaarImage] = useState<string | null>(null);
  const [panImage, setPanImage] = useState<string | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const goToPan = () => {
    if (!formData.name || !formData.dob || !formData.email || !formData.phone || !formData.password || !formData.aadhaar_number) {
      setError("Please fill in all fields before continuing.");
      return;
    }
    if (!aadhaarImage) {
      setError("Please upload your Aadhaar card to continue.");
      return;
    }
    setError("");
    setFormStep(1);
  };

  const goToSelfie = () => {
    if (!formData.pan_number) {
      setError("Please enter your PAN number.");
      return;
    }
    if (!panImage) {
      setError("Please upload your PAN card to continue.");
      return;
    }
    setError("");
    setFormStep(2);
  };

  const goBack = () => {
    setError("");
    setFormStep(prev => Math.max(0, prev - 1));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capturedImage) {
      setError("Please capture a reference selfie to proceed.");
      return;
    }

    setLoading(true);
    setLoadingStep(0);
    setError("");

    // Animate progress steps
    setTimeout(() => setLoadingStep(1), 400);
    setTimeout(() => setLoadingStep(2), 900);

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
      ...formData,
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
      reference_image: capturedImage,
      aadhaar_image: aadhaarImage,
      pan_image: panImage,
    };

    try {
      const resp = await fetch(`${API_BASE}/api/onboarding/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error("Onboarding evaluation failed");
      const data = await resp.json();

      setTimeout(() => {
        setLoading(false);
        setResult(data);
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Sign up failed.");
      setLoading(false);
    }
  };

  if (result) {
    const isReject = result.decision === "REJECT";
    const isManual = result.decision === "MANUAL_REVIEW";

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-navy)] p-6">
        <div className="max-w-md w-full bg-[#0a111a] border border-white/10 rounded-2xl p-8 text-center shadow-2xl">
          <BobLogo className="mx-auto mb-6" />

          {isReject ? (
            <div>
              <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-danger)]/20 flex items-center justify-center mb-4 border border-[var(--color-danger)]/50">
                <svg className="w-8 h-8 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Application Declined</h2>
              <p className="text-[var(--color-text-secondary)] text-sm mb-6">We are unable to approve your account at this time due to security policies.</p>
            </div>
          ) : isManual ? (
            <div>
              <div className="w-16 h-16 mx-auto rounded-full bg-yellow-500/20 flex items-center justify-center mb-4 border border-yellow-500/50">
                <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Manual Review Required</h2>
              <p className="text-[var(--color-text-secondary)] text-sm mb-6">Your application has been flagged for further review. Our team will contact you shortly.</p>
            </div>
          ) : (
            <div>
              <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-success)]/20 flex items-center justify-center mb-4 border border-[var(--color-success)]/50">
                <svg className="w-8 h-8 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome Aboard!</h2>
              <p className="text-[var(--color-text-secondary)] text-sm mb-6">Your account has been securely verified and created.</p>
              <button onClick={() => navigate({ to: "/login" })} className="px-6 py-2 bg-[var(--color-bob-orange)] rounded-lg font-medium hover:bg-orange-600 transition">Proceed to Login</button>
            </div>
          )}

          <div className="mt-8 p-4 bg-black/40 rounded-xl text-left border border-white/5">
            <div className="text-xs text-[var(--color-text-muted)] label-caps mb-2">Diagnostics</div>
            <div className="font-mono text-[11px] text-[var(--color-text-secondary)]">Risk Score: <span className={result.risk_score >= 80 ? 'text-[var(--color-success)]' : result.risk_score >= 50 ? 'text-yellow-400' : 'text-[var(--color-danger)]'}>{result.risk_score}/100</span></div>
            <div className="font-mono text-[11px] text-[var(--color-text-secondary)] mt-1">Reasons: {result.reason_codes.length > 0 ? result.reason_codes.join(', ') : 'None'}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[var(--color-navy)]" onMouseMove={onMouseMove}>
      {/* 3D Visualizer (Left Panel) copied exactly from login.tsx */}
      <div className="hidden md:flex w-3/5 relative overflow-hidden bg-[#0a111a] border-r border-white/5 flex-col justify-center items-center">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a111a] via-[var(--color-navy)] to-[#070b12]"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[var(--color-bob-orange)]/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none"></div>
        <div className="absolute top-[20%] right-[20%] w-2 h-2 bg-blue-400 rounded-full shadow-[0_0_15px_rgba(96,165,250,0.8)] animate-ping"></div>
        <div className="absolute bottom-[30%] left-[25%] w-1.5 h-1.5 bg-[var(--color-bob-orange)] rounded-full shadow-[0_0_15px_rgba(242,101,34,0.8)] animate-pulse" style={{animationDuration: '3s'}}></div>

        <div className="absolute top-10 left-10 z-20 flex items-center gap-4">
          <BobLogo size={36} />
          <div className="h-6 w-px bg-white/20"></div>
          <span className="text-white/60 text-xs tracking-[0.2em] font-bold uppercase">Identity Trust Platform</span>
        </div>

        <div className="relative z-10 w-full max-w-xl mx-auto px-12 flex flex-col items-center">
          <div className="relative w-48 h-56 mb-14 flex items-center justify-center">
            <div className="absolute inset-0 border border-[var(--color-bob-orange)]/20 rounded-full scale-[1.4] animate-pulse" style={{animationDuration: '4s'}}></div>
            <div className="absolute inset-0 border border-blue-500/20 rounded-full scale-[1.1] animate-pulse" style={{animationDuration: '3s', animationDelay: '1s'}}></div>
            <div className="relative z-10 animate-fade-in-up" style={{ animationDuration: '1.5s' }}>
              <svg width="180" height="200" viewBox="0 0 140 160" fill="none" className="drop-shadow-[0_0_30px_rgba(242,101,34,0.3)]">
                <path d="M70 8 L130 30 L130 80 C130 115 105 140 70 152 C35 140 10 115 10 80 L10 30 Z" fill="url(#shield-grad)"/>
                <path d="M70 8 L130 30 L130 80 C130 115 105 140 70 152 C35 140 10 115 10 80 L10 30 Z" stroke="url(#shield-border-grad)" strokeWidth="3"/>
                <path d="M70 8 V152 M10 80 H130 M30 45 L110 115 M30 115 L110 45" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                <defs>
                  <linearGradient id="shield-grad" x1="0" y1="0" x2="140" y2="160" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="rgba(242,101,34,0.15)" />
                    <stop offset="100%" stopColor="rgba(13,27,42,0.8)" />
                  </linearGradient>
                  <linearGradient id="shield-border-grad" x1="0" y1="0" x2="140" y2="160" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#F26522" />
                    <stop offset="50%" stopColor="#FF9E66" />
                    <stop offset="100%" stopColor="#F26522" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div className="absolute -left-16 top-10 bg-[#0a111a]/80 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 text-xs text-white font-mono shadow-[0_4px_20px_rgba(0,0,0,0.5)] animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
              <span className="text-[var(--color-success)] mr-2">●</span> Secure KYC
            </div>
            <div className="absolute -right-14 bottom-16 bg-[#0a111a]/80 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 text-xs text-white font-mono shadow-[0_4px_20px_rgba(0,0,0,0.5)] animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
              <span className="text-[var(--color-bob-orange)] mr-2">●</span> Bot Detection
            </div>
          </div>

          <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 text-center leading-[1.15]">
            Onboard safely with <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-bob-orange)] to-yellow-500">Adaptive AI</span>.
          </h2>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gradient-to-br from-[var(--color-navy-mid)] to-[var(--color-navy)] relative overflow-y-auto">
        <div className="w-full max-w-md animate-fade-in-up relative z-10 my-auto">
          <div className="md:hidden mb-8"><BobLogo /></div>

          <div className="bg-[var(--color-navy)]/60 backdrop-blur-xl border border-white/5 shadow-2xl rounded-2xl p-8 sm:p-10">
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--color-text-secondary)]">Create Account</h1>
              <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
                Sign up to securely access your digital banking.
              </p>
            </div>

            {!loading && (
              <div className="flex items-center gap-2 mb-6">
                {STEP_LABELS.map((label, idx) => (
                  <div key={label} className="flex-1">
                    <div className={`h-1 rounded-full transition-all ${idx <= formStep ? 'bg-[var(--color-bob-orange)]' : 'bg-white/10'}`}></div>
                    <div className={`text-[10px] mt-1.5 font-medium transition-colors ${idx === formStep ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>{label}</div>
                  </div>
                ))}
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
                  <div className={`flex items-center gap-4 transition-all duration-500 ${loadingStep >= 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(242,101,34,0.6)] ${loadingStep > 0 ? 'bg-[var(--color-success)] shadow-none' : 'bg-[var(--color-bob-orange)] animate-pulse'}`}></div>
                    <span className={`text-sm font-medium ${loadingStep > 0 ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]'}`}>Evaluating behavioral biometrics</span>
                  </div>
                  <div className={`flex items-center gap-4 transition-all duration-500 ${loadingStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-20 translate-y-4'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${loadingStep > 1 ? 'bg-[var(--color-success)] shadow-none' : loadingStep === 1 ? 'bg-[var(--color-bob-orange)] shadow-[0_0_8px_rgba(242,101,34,0.6)] animate-pulse' : 'bg-[var(--color-navy-border)]'}`}></div>
                    <span className={`text-sm font-medium ${loadingStep > 1 ? 'text-[var(--color-text-secondary)]' : loadingStep === 1 ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>Checking Aadhaar / PAN KYC signals</span>
                  </div>
                  <div className={`flex items-center gap-4 transition-all duration-500 ${loadingStep >= 2 ? 'opacity-100 translate-y-0' : 'opacity-20 translate-y-4'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${loadingStep > 2 ? 'bg-[var(--color-success)] shadow-none' : loadingStep === 2 ? 'bg-[var(--color-bob-orange)] shadow-[0_0_8px_rgba(242,101,34,0.6)] animate-pulse' : 'bg-[var(--color-navy-border)]'}`}></div>
                    <span className={`text-sm font-medium ${loadingStep === 2 ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>Computing Risk Score</span>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4 animate-fade-in" onKeyDown={onKeyDown} onKeyUp={onKeyUp}>

                {/* ── Step 0: Personal details + Aadhaar ─────────────── */}
                {formStep === 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="group">
                        <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">Full Name</label>
                        <input required name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-bob-orange)] focus:ring-1 focus:ring-[var(--color-bob-orange)]/50 transition-all text-white" />
                      </div>
                      <div className="group">
                        <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">Date of Birth</label>
                        <input type="date" required name="dob" value={formData.dob} onChange={handleChange} className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-bob-orange)] focus:ring-1 focus:ring-[var(--color-bob-orange)]/50 transition-all text-white" />
                      </div>
                    </div>

                    <div className="group">
                      <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">Email Address</label>
                      <input type="email" required name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-bob-orange)] focus:ring-1 focus:ring-[var(--color-bob-orange)]/50 transition-all text-white" />
                    </div>

                    <div className="group">
                      <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">Phone Number</label>
                      <input type="tel" required name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-bob-orange)] focus:ring-1 focus:ring-[var(--color-bob-orange)]/50 transition-all text-white" />
                    </div>

                    <div className="group">
                      <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">Password</label>
                      <input type="password" required name="password" value={formData.password} onChange={handleChange} className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-bob-orange)] focus:ring-1 focus:ring-[var(--color-bob-orange)]/50 transition-all text-white" />
                    </div>

                    <div className="group">
                      <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">Aadhaar Number</label>
                      <input required name="aadhaar_number" maxLength={12} placeholder="12-digit Aadhaar number" value={formData.aadhaar_number} onChange={handleChange} className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-bob-orange)] focus:ring-1 focus:ring-[var(--color-bob-orange)]/50 transition-all text-white" />
                    </div>

                    <div className="group col-span-2 mt-4">
                      <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">Aadhaar Card (front side)</label>
                      {!aadhaarImage ? (
                        <div className="w-full bg-black/40 rounded-xl border border-white/5 border-dashed p-6 text-center">
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            id="aadhaar-upload"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => setAadhaarImage(reader.result as string);
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                          <label htmlFor="aadhaar-upload" className="cursor-pointer text-[var(--color-bob-orange)] hover:text-white transition font-medium text-sm">
                            Click to upload your Aadhaar card
                          </label>
                          <div className="text-[10px] text-[var(--color-text-muted)] mt-2">Image or PDF (e-Aadhaar) accepted.</div>
                        </div>
                      ) : (
                        <div className="w-full bg-black/40 rounded-xl border border-white/5 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[var(--color-success)]/20 rounded-lg flex items-center justify-center border border-[var(--color-success)]/50">
                               <svg className="w-5 h-5 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div className="text-sm text-white font-medium">Aadhaar Uploaded</div>
                          </div>
                          <button type="button" onClick={() => setAadhaarImage(null)} className="text-xs text-[var(--color-danger)] hover:text-white transition">Remove</button>
                        </div>
                      )}
                    </div>

                    {error && <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg px-4 py-3 animate-fade-in-up">{error}</div>}

                    <button type="button" onClick={goToPan} className="w-full mt-2 relative overflow-hidden group bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] text-white font-semibold py-3.5 rounded-xl shadow-[0_4px_14px_rgba(242,101,34,0.4)] hover:shadow-[0_6px_20px_rgba(242,101,34,0.6)] hover:-translate-y-0.5 transition-all">
                      <span className="relative z-10 tracking-wide">Next: PAN Card</span>
                    </button>

                    <div className="text-center pt-2 text-sm text-[var(--color-text-secondary)] font-medium">
                      Already have an account? <Link to="/login" className="text-[var(--color-bob-orange)] hover:underline hover:text-white transition-colors ml-1 font-semibold">Sign in</Link>
                    </div>
                  </>
                )}

                {/* ── Step 1: PAN ──────────────────────────────────────── */}
                {formStep === 1 && (
                  <>
                    <div className="group">
                      <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">PAN Number</label>
                      <input required name="pan_number" maxLength={10} placeholder="e.g. ABCDE1234F" value={formData.pan_number} onChange={(e) => setFormData(prev => ({ ...prev, pan_number: e.target.value.toUpperCase() }))} className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-bob-orange)] focus:ring-1 focus:ring-[var(--color-bob-orange)]/50 transition-all text-white uppercase" />
                    </div>

                    <div className="group col-span-2 mt-4">
                      <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">PAN Card</label>
                      {!panImage ? (
                        <div className="w-full bg-black/40 rounded-xl border border-white/5 border-dashed p-6 text-center">
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            id="pan-upload"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => setPanImage(reader.result as string);
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                          <label htmlFor="pan-upload" className="cursor-pointer text-[var(--color-bob-orange)] hover:text-white transition font-medium text-sm">
                            Click to upload your PAN card
                          </label>
                          <div className="text-[10px] text-[var(--color-text-muted)] mt-2">Image or PDF accepted.</div>
                        </div>
                      ) : (
                        <div className="w-full bg-black/40 rounded-xl border border-white/5 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[var(--color-success)]/20 rounded-lg flex items-center justify-center border border-[var(--color-success)]/50">
                               <svg className="w-5 h-5 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div className="text-sm text-white font-medium">PAN Uploaded</div>
                          </div>
                          <button type="button" onClick={() => setPanImage(null)} className="text-xs text-[var(--color-danger)] hover:text-white transition">Remove</button>
                        </div>
                      )}
                    </div>

                    {error && <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg px-4 py-3 animate-fade-in-up">{error}</div>}

                    <div className="flex gap-3 mt-2">
                      <button type="button" onClick={goBack} className="flex-1 bg-white/5 border border-white/10 text-white font-semibold py-3.5 rounded-xl hover:bg-white/10 transition-all">
                        Back
                      </button>
                      <button type="button" onClick={goToSelfie} className="flex-[2] relative overflow-hidden group bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] text-white font-semibold py-3.5 rounded-xl shadow-[0_4px_14px_rgba(242,101,34,0.4)] hover:shadow-[0_6px_20px_rgba(242,101,34,0.6)] hover:-translate-y-0.5 transition-all">
                        <span className="relative z-10 tracking-wide">Next: Selfie</span>
                      </button>
                    </div>
                  </>
                )}

                {/* ── Step 2: Selfie + submit ──────────────────────────── */}
                {formStep === 2 && (
                  <>
                    <div className="group col-span-2">
                      <label className="label-caps text-[var(--color-text-secondary)] block mb-1.5">Reference Selfie</label>
                      {!capturedImage ? (
                        <div className="w-full h-48 bg-black/40 rounded-xl overflow-hidden relative border border-white/5 flex flex-col items-center justify-center">
                          <Webcam
                            ref={webcamRef}
                            audio={false}
                            screenshotFormat="image/jpeg"
                            videoConstraints={{ facingMode: "user" }}
                            onUserMediaError={(e) => {
                              console.error("Webcam error:", e);
                              const name = (e as any)?.name || "";
                              setWebcamError(
                                name === "NotAllowedError" ? "Camera access was blocked. Click the camera icon in the address bar and allow access, then reload." :
                                name === "NotFoundError" ? "No camera was found on this device." :
                                name === "NotReadableError" ? "Camera is already in use by another app." :
                                "Could not access the camera. " + (typeof e === "string" ? e : (e as any)?.message || "")
                              );
                            }}
                            onUserMedia={() => setWebcamError(null)}
                            className="w-full h-full object-cover absolute inset-0"
                          />
                          {webcamError && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/70 text-center">
                              <p className="text-xs text-[var(--color-danger)] font-medium">{webcamError}</p>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const imageSrc = webcamRef.current?.getScreenshot();
                              if (imageSrc) setCapturedImage(imageSrc);
                              else if (!webcamError) setWebcamError("Camera isn't ready yet — wait a moment and try again.");
                            }}
                            className="relative z-10 mt-auto mb-4 bg-[var(--color-bob-orange)] text-white px-6 py-2 rounded-full text-xs font-bold shadow-lg hover:bg-orange-600 transition"
                          >
                            Capture Selfie
                          </button>
                        </div>
                      ) : (
                        <div className="w-full h-48 rounded-xl overflow-hidden relative border border-white/5">
                          <img src={capturedImage} alt="Selfie" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setCapturedImage(null)}
                            className="absolute top-3 right-3 bg-black/60 hover:bg-black text-white px-4 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm transition"
                          >
                            Retake
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] px-3 py-2 bg-[var(--color-navy)]/60 border border-[var(--color-navy-border)] rounded-lg shadow-inner">
                      <span className={`flex items-center gap-1.5 font-medium transition-colors ${activeSignal ? 'text-[var(--color-bob-orange)]' : 'text-[var(--color-text-muted)]'}`}>
                        <svg className={`w-3.5 h-3.5 transition-transform ${activeSignal ? 'scale-110' : 'scale-100'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        Risk Telemetry Active
                      </span>
                      <div className="flex items-center gap-1 h-3">
                        <div className={`w-1 bg-[var(--color-bob-orange)] rounded-full transition-all ${activeSignal ? 'h-3 animate-pulse opacity-100' : 'h-1.5 opacity-30'}`}></div>
                        <div className={`w-1 bg-[var(--color-bob-orange)] rounded-full transition-all delay-75 ${activeSignal ? 'h-4 animate-pulse opacity-100' : 'h-1 opacity-30'}`}></div>
                        <div className={`w-1 bg-[var(--color-bob-orange)] rounded-full transition-all delay-150 ${activeSignal ? 'h-2 animate-pulse opacity-100' : 'h-1.5 opacity-30'}`}></div>
                      </div>
                    </div>

                    {error && <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg px-4 py-3 animate-fade-in-up">{error}</div>}

                    <div className="flex gap-3 mt-2">
                      <button type="button" onClick={goBack} className="flex-1 bg-white/5 border border-white/10 text-white font-semibold py-3.5 rounded-xl hover:bg-white/10 transition-all">
                        Back
                      </button>
                      <button type="submit" disabled={loading} className="flex-[2] relative overflow-hidden group bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] text-white font-semibold py-3.5 rounded-xl shadow-[0_4px_14px_rgba(242,101,34,0.4)] hover:shadow-[0_6px_20px_rgba(242,101,34,0.6)] hover:-translate-y-0.5 transition-all">
                        <span className="relative z-10 tracking-wide">Sign Up</span>
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
