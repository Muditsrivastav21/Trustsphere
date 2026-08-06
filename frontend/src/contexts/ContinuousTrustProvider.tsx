import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthContext";

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
          } else if (data.status === "SUSPICIOUS") {
            console.warn("Suspicious activity detected, trust score dropped.");
          }
        }
      } catch (e) {
        // Handle network failures gracefully without locking out the user
        console.warn("Continuous auth poll failed, retaining last state", e);
      }

      // Reset buffers for next window
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
        } else {
          alert("Invalid OTP");
        }
      } else {
        alert("Verification failed");
      }
    } catch (e) {
      alert("Verification request failed");
    }
  };

  return (
    <ContinuousTrustContext.Provider value={{ trustScore, resetTrust }}>
      {children}
      
      {isLocked && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-2xl animate-fade-in">
          {/* Ominous red glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-danger)]/10 to-transparent pointer-events-none"></div>
          
          <div className="bg-[var(--color-panel-bg)] border border-[var(--color-danger)]/30 rounded-[32px] p-10 max-w-lg w-full shadow-[0_20px_60px_rgba(232,56,79,0.2)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[var(--color-danger)]/5 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="flex flex-col items-center text-center relative z-10">
              <div className="w-20 h-20 bg-[var(--color-danger)]/10 rounded-3xl flex items-center justify-center border border-[var(--color-danger)]/30 mb-6 shadow-[0_0_30px_rgba(232,56,79,0.2)] animate-pulse-shield">
                <svg className="w-10 h-10 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              
              <h2 className="text-3xl font-extrabold text-[var(--color-text-main)] tracking-tight mb-2">Session Hijack Detected</h2>
              <p className="text-[var(--color-text-sub)] text-sm leading-relaxed mb-8">
                Anomalous behavioral patterns (erratic mouse velocity & keystrokes) have caused your Trust Score to drop to <span className="font-bold text-[var(--color-danger)]">{Math.round(trustScore)}%</span>. 
                <br/><br/>Continuous Validation has locked this session.
              </p>
              
              <div className="w-full">
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--color-text-dim)] mb-3 text-left">Step-Up Authentication Required</div>
                <div className="flex gap-3 mb-6">
                  {[1, 2, 3, 4, 5, 6].map((i, idx) => (
                    <input 
                      key={i} 
                      type="text" 
                      maxLength={1} 
                      value={otp[idx] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOtp(prev => {
                          const arr = prev.split("");
                          arr[idx] = val;
                          return arr.join("");
                        });
                        if (val && e.target.nextElementSibling) {
                          (e.target.nextElementSibling as HTMLInputElement).focus();
                        }
                      }}
                      className="w-12 h-14 bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-xl text-center text-xl font-mono text-[var(--color-text-main)] focus:border-[var(--color-danger)] focus:bg-[var(--color-glass-hover)] transition-all outline-none"
                    />
                  ))}
                </div>
                
                <button 
                  onClick={() => {
                    if (otp.length === 6) resetTrust();
                  }}
                  className="w-full py-4 bg-gradient-to-r from-[var(--color-danger)] to-red-600 rounded-xl font-bold tracking-widest text-sm uppercase text-white shadow-[0_4px_20px_rgba(232,56,79,0.3)] hover:shadow-[0_4px_30px_rgba(232,56,79,0.5)] transition-all disabled:opacity-50"
                  disabled={otp.length !== 6}
                >
                  Verify Identity
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ContinuousTrustContext.Provider>
  );
}

export const useContinuousTrust = () => useContext(ContinuousTrustContext);
