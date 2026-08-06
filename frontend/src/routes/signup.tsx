import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { BobLogo } from "@/components/BobLogo";
import { Check, Loader2, Upload, X, XCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up · Bank of Baroda" }] }),
  component: SignupPage,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

const STEP_LABELS = ["Details & Aadhaar", "PAN card", "Selfie"];
const LOADING_LABELS = ["Evaluating behavioral biometrics", "Checking Aadhaar / PAN KYC signals", "Computing risk score"];

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

  const webcamRef = useRef<Webcam>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [aadhaarImage, setAadhaarImage] = useState<string | null>(null);
  const [panImage, setPanImage] = useState<string | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  // ── Behavioral signal capture (real telemetry) ──────────────────
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

    setTimeout(() => setLoadingStep(1), 400);
    setTimeout(() => setLoadingStep(2), 900);

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
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Sign up failed.");
      setLoading(false);
    }
  };

  if (result) {
    const isReject = result.decision === "REJECT";
    const isManual = result.decision === "MANUAL_REVIEW";
    const statusColor = isReject ? "danger" : isManual ? "warning" : "success";
    const Icon = isReject ? XCircle : isManual ? AlertTriangle : CheckCircle2;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-page-bg)] p-6">
        <div className="max-w-[400px] w-full">
          <div className="mb-6"><BobLogo size={26} /></div>
          <div className="surface-card p-7 text-center">
            <div className={`w-11 h-11 mx-auto rounded-full flex items-center justify-center mb-4 chip-${statusColor}`} style={{ background: `var(--color-${statusColor}-bg)`, border: `1px solid var(--color-${statusColor}-border)` }}>
              <Icon size={20} strokeWidth={2} style={{ color: `var(--color-${statusColor})` }} />
            </div>
            <h2 className="text-[18px] font-semibold text-[var(--color-text-main)] mb-1.5">
              {isReject ? "Application declined" : isManual ? "Manual review required" : "Account created"}
            </h2>
            <p className="text-[13.5px] text-[var(--color-text-sub)] mb-6">
              {isReject
                ? "We're unable to approve this application at this time due to security policy."
                : isManual
                ? "Your application has been flagged for review. Our team will follow up shortly."
                : "Your identity has been verified. You can now sign in."}
            </p>
            {!isReject && !isManual && (
              <button onClick={() => navigate({ to: "/login" })} className="btn-primary w-full h-9 mb-6">
                Continue to sign in
              </button>
            )}
            <div className="text-left bg-[var(--color-surface-sunken)] rounded-md p-3.5 border border-[var(--color-border-default)]">
              <div className="label-caps text-[var(--color-text-dim)] mb-2">Evaluation detail</div>
              <div className="font-mono text-[12px] text-[var(--color-text-sub)]">
                Risk score <span className="font-semibold" style={{ color: `var(--color-${statusColor})` }}>{result.risk_score}/100</span>
              </div>
              <div className="font-mono text-[11.5px] text-[var(--color-text-dim)] mt-1.5 leading-relaxed">
                {result.reason_codes.length > 0 ? result.reason_codes.join(", ") : "No risk signals detected"}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-page-bg)]" onMouseMove={onMouseMove}>
      <header className="h-16 flex items-center px-6 border-b border-[var(--color-border-default)]">
        <BobLogo size={26} />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[440px]">
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">Create your account</h1>
            <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1.5">Identity verification is required to open a digital banking account.</p>
          </div>

          {!loading && (
            <div className="flex items-center gap-1 mb-7" aria-label={`Step ${formStep + 1} of ${STEP_LABELS.length}: ${STEP_LABELS[formStep]}`}>
              {STEP_LABELS.map((label, idx) => (
                <div key={label} className="flex-1">
                  <div className="h-[3px] rounded-full mb-2 transition-colors duration-150" style={{ background: idx <= formStep ? "var(--color-accent-brand)" : "var(--color-border-default)" }} />
                  <div className="text-[11px] font-medium" style={{ color: idx === formStep ? "var(--color-text-main)" : "var(--color-text-dim)" }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="py-4" aria-live="polite" aria-busy="true">
              <div className="flex flex-col gap-3">
                {LOADING_LABELS.map((label, i) => (
                  <div key={label} className="flex items-center gap-3 text-[13.5px]">
                    <span className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-150"
                      style={{
                        borderColor: loadingStep > i ? "var(--color-success)" : loadingStep === i ? "var(--color-accent-brand)" : "var(--color-border-default)",
                        background: loadingStep > i ? "var(--color-success-bg)" : "transparent",
                      }}>
                      {loadingStep > i ? <Check size={11} strokeWidth={3} style={{ color: "var(--color-success)" }} />
                        : loadingStep === i ? <Loader2 size={11} strokeWidth={3} className="animate-spin" style={{ color: "var(--color-accent-brand)" }} /> : null}
                    </span>
                    <span style={{ color: loadingStep >= i ? "var(--color-text-main)" : "var(--color-text-dim)" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" onKeyDown={onKeyDown} onKeyUp={onKeyUp} noValidate>
              {formStep === 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Full name</label>
                      <input required name="name" value={formData.name} onChange={handleChange} className="input-field w-full" />
                    </div>
                    <div>
                      <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Date of birth</label>
                      <input type="date" required name="dob" value={formData.dob} onChange={handleChange} className="input-field w-full" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Email address</label>
                    <input type="email" required name="email" value={formData.email} onChange={handleChange} className="input-field w-full" />
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Phone number</label>
                    <input type="tel" required name="phone" value={formData.phone} onChange={handleChange} className="input-field w-full" />
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Password</label>
                    <input type="password" required name="password" value={formData.password} onChange={handleChange} className="input-field w-full" />
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Aadhaar number</label>
                    <input required name="aadhaar_number" maxLength={12} placeholder="12-digit Aadhaar number" value={formData.aadhaar_number} onChange={handleChange} className="input-field w-full" />
                  </div>

                  <FileDropzone label="Aadhaar card (front side)" hint="Image or PDF (e-Aadhaar) accepted." value={aadhaarImage} onChange={setAadhaarImage} id="aadhaar-upload" />

                  {error && <ErrorBanner message={error} />}

                  <button type="button" onClick={goToPan} className="btn-primary w-full h-9 mt-1">Continue to PAN card</button>

                  <p className="text-center text-[13px] text-[var(--color-text-sub)] pt-1">
                    Already have an account? <Link to="/login" className="text-[var(--color-accent-brand)] font-medium hover:underline">Sign in</Link>
                  </p>
                </>
              )}

              {formStep === 1 && (
                <>
                  <div>
                    <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">PAN number</label>
                    <input required name="pan_number" maxLength={10} placeholder="e.g. ABCDE1234F" value={formData.pan_number}
                      onChange={(e) => setFormData(prev => ({ ...prev, pan_number: e.target.value.toUpperCase() }))}
                      className="input-field w-full uppercase" />
                  </div>

                  <FileDropzone label="PAN card" hint="Image or PDF accepted." value={panImage} onChange={setPanImage} id="pan-upload" />

                  {error && <ErrorBanner message={error} />}

                  <div className="flex gap-2.5 pt-1">
                    <button type="button" onClick={goBack} className="btn-secondary flex-1 h-9">Back</button>
                    <button type="button" onClick={goToSelfie} className="btn-primary flex-[2] h-9">Continue to selfie</button>
                  </div>
                </>
              )}

              {formStep === 2 && (
                <>
                  <div>
                    <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Reference selfie</label>
                    {!capturedImage ? (
                      <div className="w-full h-48 bg-[var(--color-surface-sunken)] rounded-md overflow-hidden relative border border-[var(--color-border-default)] flex flex-col items-center justify-center">
                        <Webcam
                          ref={webcamRef}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          videoConstraints={{ facingMode: "user" }}
                          onUserMediaError={(e) => {
                            const name = (e as any)?.name || "";
                            setWebcamError(
                              name === "NotAllowedError" ? "Camera access was blocked. Allow camera access in your browser, then reload." :
                              name === "NotFoundError" ? "No camera was found on this device." :
                              name === "NotReadableError" ? "Camera is already in use by another app." :
                              "Could not access the camera."
                            );
                          }}
                          onUserMedia={() => setWebcamError(null)}
                          className="w-full h-full object-cover absolute inset-0"
                        />
                        {webcamError && (
                          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-[var(--color-page-bg)]/90 text-center">
                            <p className="text-[12.5px] text-[var(--color-danger)] font-medium">{webcamError}</p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const imageSrc = webcamRef.current?.getScreenshot();
                            if (imageSrc) setCapturedImage(imageSrc);
                            else if (!webcamError) setWebcamError("Camera isn't ready yet — wait a moment and try again.");
                          }}
                          className="relative z-10 mt-auto mb-3 btn-primary h-8 px-4 text-[12.5px]"
                        >
                          Capture selfie
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-48 rounded-md overflow-hidden relative border border-[var(--color-border-default)]">
                        <img src={capturedImage} alt="Captured selfie" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setCapturedImage(null)}
                          className="absolute top-2.5 right-2.5 h-7 px-3 rounded-md bg-[var(--color-page-bg)]/90 border border-[var(--color-border-default)] text-[12px] font-medium text-[var(--color-text-main)] hover:bg-[var(--color-surface-hover)] transition-colors">
                          Retake
                        </button>
                      </div>
                    )}
                  </div>

                  {error && <ErrorBanner message={error} />}

                  <div className="flex gap-2.5 pt-1">
                    <button type="button" onClick={goBack} className="btn-secondary flex-1 h-9">Back</button>
                    <button type="submit" disabled={loading} className="btn-primary flex-[2] h-9">Create account</button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </main>
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

function FileDropzone({ label, hint, value, onChange, id }: { label: string; hint: string; value: string | null; onChange: (v: string | null) => void; id: string }) {
  return (
    <div>
      <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">{label}</label>
      {!value ? (
        <div className="w-full border border-dashed border-[var(--color-border-strong)] rounded-md p-5 text-center hover:border-[var(--color-accent-brand)] transition-colors duration-100">
          <input
            type="file" accept="image/*,.pdf" id={id} className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onloadend = () => onChange(reader.result as string);
                reader.readAsDataURL(file);
              }
            }}
          />
          <label htmlFor={id} className="cursor-pointer flex flex-col items-center gap-1.5">
            <Upload size={16} strokeWidth={1.75} className="text-[var(--color-text-dim)]" />
            <span className="text-[13px] font-medium text-[var(--color-accent-brand)]">Click to upload</span>
            <span className="text-[11px] text-[var(--color-text-dim)]">{hint}</span>
          </label>
        </div>
      ) : (
        <div className="w-full border border-[var(--color-border-default)] rounded-md p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[var(--color-success-bg)] border border-[var(--color-success-border)] flex items-center justify-center">
              <Check size={13} strokeWidth={2.5} style={{ color: "var(--color-success)" }} />
            </div>
            <span className="text-[13px] font-medium text-[var(--color-text-main)]">Uploaded</span>
          </div>
          <button type="button" onClick={() => onChange(null)} aria-label="Remove file" className="p-1 rounded text-[var(--color-text-dim)] hover:text-[var(--color-danger)] transition-colors">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
