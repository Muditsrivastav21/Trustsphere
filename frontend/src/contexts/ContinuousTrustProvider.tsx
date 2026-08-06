import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthContext";
import { ShieldAlert, Mail } from "lucide-react";

interface ContinuousTrustContextType {
  trustScore: number;
  resetTrust: () => void;
}

const ContinuousTrustContext = createContext<ContinuousTrustContextType>({ trustScore: 100, resetTrust: () => {} });

export function ContinuousTrustProvider({ children }: { children: React.ReactNode }) {
  const [trustScore, setTrustScore] = useState(100);
  const [isLocked, setIsLocked] = useState(false);
  const { role } = useAuth();
  const [otp, setOtp] = useState("");
  const [demoOtp, setDemoOtp] = useState<string | null>(null);

  const resultStr = typeof window !== "undefined" ? sessionStorage.getItem("trustsphere_result") : null;
  const result = resultStr ? JSON.parse(resultStr) : null;
  const sessionId = result?.session_id;

  const keyHoldTimesRef = useRef<number[]>([]);
  const flightTimesRef = useRef<number[]>([]);
  const mouseSpeedsRef = useRef<number[]>([]);
  const keystrokeCountRef = useRef(0);
  const mouseEventCountRef = useRef(0);
  const lastKeyDownRef = useRef<number>(0);
  const lastKeyUpRef = useRef<number>(0);
  const lastMouseRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const typingStartRef = useRef<number>(0);

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

  const computeWpm = () => {
    const elapsed = (Date.now() - typingStartRef.current) / 1000 / 60;
    if (elapsed <= 0) return 0;
    return Math.round((keystrokeCountRef.current / 5) / elapsed);
  };

  useEffect(() => {
    if (isLocked || !sessionId) return;

    const handleMouseMove = (e: MouseEvent) => {
      mouseEventCountRef.current++;
      const now = Date.now();
      const prev = lastMouseRef.current;
      if (prev && now - prev.t > 0) {
        const dist = Math.sqrt(Math.pow(e.clientX - prev.x, 2) + Math.pow(e.clientY - prev.y, 2));
        mouseSpeedsRef.current.push(dist / ((now - prev.t) / 1000));
      }
      lastMouseRef.current = { x: e.clientX, y: e.clientY, t: now };
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (typingStartRef.current === 0) typingStartRef.current = Date.now();
      lastKeyDownRef.current = Date.now();
      if (lastKeyUpRef.current > 0) flightTimesRef.current.push(Date.now() - lastKeyUpRef.current);
    };

    const handleKeyUp = () => {
      keystrokeCountRef.current++;
      if (lastKeyDownRef.current > 0) keyHoldTimesRef.current.push(Date.now() - lastKeyDownRef.current);
      lastKeyUpRef.current = Date.now();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const interval = setInterval(async () => {
      const payload = {
        session_id: sessionId,
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
        const resp = await fetch(`${API_BASE}/api/auth/continuous`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (resp.ok) {
          const data = await resp.json();
          setTrustScore(data.score);
          if (data.status === "BLOCK") {
            setIsLocked(true);
            setDemoOtp(data.demo_otp || null);
          } else if (data.status === "SUSPICIOUS") {
            console.warn("Suspicious activity detected, trust score dropped.");
          }
        }
      } catch (e) {
        console.warn("Continuous auth poll failed, retaining last state", e);
      }

      keyHoldTimesRef.current = [];
      flightTimesRef.current = [];
      mouseSpeedsRef.current = [];
      mouseEventCountRef.current = 0;
      keystrokeCountRef.current = 0;
      typingStartRef.current = 0;
    }, 5000);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      clearInterval(interval);
    };
  }, [isLocked, sessionId]);

  const resetTrust = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, otp_code: otp })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.verified) {
          setTrustScore(100);
          setIsLocked(false);
          setOtp("");
          setDemoOtp(null);
        } else {
          alert("Invalid code. Please try again.");
        }
      } else {
        alert("Verification failed.");
      }
    } catch (e) {
      alert("Verification request failed.");
    }
  };

  return (
    <ContinuousTrustContext.Provider value={{ trustScore, resetTrust }}>
      {children}

      {isLocked && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="lock-title"
          aria-describedby="lock-desc"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 animate-fade-in"
        >
          <div className="surface-card elevated max-w-[420px] w-full p-7">
            <div className="flex flex-col items-center text-center">
              <div className="w-11 h-11 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
                <ShieldAlert size={20} strokeWidth={2} style={{ color: "var(--color-danger)" }} />
              </div>

              <h2 id="lock-title" className="text-[18px] font-semibold text-[var(--color-text-main)] mb-1.5">Session locked</h2>
              <p id="lock-desc" className="text-[13.5px] text-[var(--color-text-sub)] leading-relaxed mb-6">
                Unusual behavioral patterns dropped your trust score to <span className="font-semibold text-[var(--color-danger)]">{Math.round(trustScore)}</span>. Continuous validation has locked this session pending re-verification.
              </p>

              <div className="w-full">
                <div className="label-caps text-[var(--color-text-dim)] mb-2.5 text-left">Enter verification code</div>
                <div className="flex gap-2 mb-4 justify-center">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <input
                      key={idx}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={otp[idx] || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setOtp(prev => {
                          const arr = prev.padEnd(6, " ").split("");
                          arr[idx] = val || " ";
                          return arr.join("").trimEnd();
                        });
                        if (val && e.target.nextElementSibling) {
                          (e.target.nextElementSibling as HTMLInputElement).focus();
                        }
                      }}
                      aria-label={`Digit ${idx + 1} of 6`}
                      className="input-field w-11 h-12 text-center font-mono text-[18px]"
                    />
                  ))}
                </div>

                <button
                  onClick={() => { if (otp.length === 6) resetTrust(); }}
                  disabled={otp.length !== 6}
                  className="w-full h-9 rounded-md text-[13.5px] font-medium text-white transition-colors duration-120 disabled:opacity-50"
                  style={{ background: "var(--color-danger)" }}
                >
                  Verify identity
                </button>

                {demoOtp ? (
                  <div className="text-[12px] mt-4 text-center font-mono font-medium py-2 rounded-md" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger-border)" }}>
                    Demo mode code: {demoOtp}
                  </div>
                ) : (
                  <div className="text-[12px] text-[var(--color-text-dim)] mt-4 text-center flex items-center justify-center gap-1.5">
                    <Mail size={13} strokeWidth={1.75} />
                    <span>Code sent to your registered email address</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </ContinuousTrustContext.Provider>
  );
}

export const useContinuousTrust = () => useContext(ContinuousTrustContext);
