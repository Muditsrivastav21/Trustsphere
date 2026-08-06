import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { BobLogo } from "@/components/BobLogo";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/transfer")({
  head: () => ({ meta: [{ title: "Fund Transfer · TrustSphere" }] }),
  component: TransferPage,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

function TransferPage() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"VERIFIED" | "SUSPICIOUS" | "PENDING">("PENDING");
  const [isTransferring, setIsTransferring] = useState(false);
  const [activeSignal, setActiveSignal] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const signalTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/stats/overview`)
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(() => {});
  }, []);

  const trustScore = stats?.avg_trust_score || 0;
  const isHighTrust = trustScore > 90;
  const maxLimit = isHighTrust ? 500000 : 50000;

  const triggerSignal = () => {
    setActiveSignal(true);
    if (signalTimeoutRef.current) clearTimeout(signalTimeoutRef.current);
    signalTimeoutRef.current = window.setTimeout(() => setActiveSignal(false), 300);
  };

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

  useEffect(() => {
    const interval = setInterval(async () => {
      // only check if there is some activity
      if (keystrokeCountRef.current < 5 && mouseEventCountRef.current < 10) return;

      const payload = {
        session_id: "continuous_session",
        ip_address: "127.0.0.1",
        device: {
          user_agent: navigator.userAgent,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen_res: `${window.screen.width}x${window.screen.height}`,
          language: navigator.language,
          platform: navigator.platform,
          color_depth: window.screen.colorDepth,
          touch_points: navigator.maxTouchPoints || 0
        },
        behavior: {
          key_hold_times: keyHoldTimesRef.current.slice(-50),
          flight_times: flightTimesRef.current.slice(-50),
          typing_speed_wpm: computeWpm(),
          mouse_speeds: mouseSpeedsRef.current.slice(-50),
          mouse_event_count: mouseEventCountRef.current,
          total_keystrokes: keystrokeCountRef.current,
        },
      };

      try {
        const resp = await fetch(`${API_BASE}/api/auth/continuous`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (resp.ok) {
          const result = await resp.json();
          setStatus(result.status);
          if (result.status === "SUSPICIOUS") {
            toast.error("Anomalous behavior pattern detected on this page!", {
              description: "Typing and mouse speeds indicate a potential bot or hijacked session.",
            });
          }
        }
      } catch (e) {
        console.warn("Continuous auth ping failed", e);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !amount) {
      toast.error("Please fill in recipient account and amount.");
      return;
    }

    if (Number(amount) > maxLimit) {
      toast.error("Transfer Declined", {
        description: `Amount exceeds your current dynamic limit of ₹${maxLimit.toLocaleString('en-IN')} based on your trust score.`,
      });
      return;
    }

    setIsTransferring(true);
    toast.info("Evaluating real-time behavioral metrics...", { duration: 2000 });

    setTimeout(() => {
      if (status === "SUSPICIOUS") {
        toast.error("Transaction Declined", {
          description: "High risk behavioral metrics blocked this transaction for security.",
          duration: 6000
        });
        setIsTransferring(false);
      } else {
        toast.success("Fund Transfer Initiated Successfully!", {
          description: `Transferred ₹${Number(amount).toLocaleString('en-IN')} to Account ${recipient}.`,
          duration: 5000
        });
        setRecipient("");
        setAmount("");
        setNotes("");
        setIsTransferring(false);
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a111a] flex flex-col relative overflow-hidden text-white" onMouseMove={onMouseMove}>
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)] pointer-events-none"></div>
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--color-bob-orange)]/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[150px] pointer-events-none"></div>

      <header className="border-b border-white/5 px-8 h-16 flex items-center justify-between relative z-10 bg-[#0a111a]/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <BobLogo size={32} />
          <div className="h-5 w-px bg-white/20"></div>
          <span className="text-white/60 text-[10px] tracking-[0.2em] font-bold uppercase">Customer Banking</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-[480px] animate-fade-in-up">
          <form onSubmit={handleTransferSubmit} className="bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-3xl p-8 sm:p-10 relative overflow-hidden" onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
            
            {/* Header info */}
            <div className="mb-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-bob-orange)] animate-pulse"></span>
                <div className="label-caps text-[var(--color-bob-orange)] tracking-widest text-[10px]">Secure Fund Transfer</div>
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                Initiate Transaction
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
                Enter details below. Your typing biometrics are being evaluated continuously to protect your identity.
              </p>
            </div>

            {/* Input fields */}
            <div className="space-y-5">
              <div className="group">
                <label className="label-caps text-white/50 block mb-2 text-[10px] tracking-widest group-focus-within:text-[var(--color-bob-orange)] transition-colors">Recipient Account Number</label>
                <input 
                  required 
                  type="text" 
                  value={recipient} 
                  onChange={e => setRecipient(e.target.value)} 
                  placeholder="1002325789" 
                  className="w-full px-4 py-3 bg-black/25 border border-white/5 rounded-xl text-sm placeholder:text-white/20 focus:border-[var(--color-bob-orange)] focus:ring-2 focus:ring-[var(--color-bob-orange)]/10 transition-all text-white shadow-inner"
                />
              </div>

              <div className="group">
                <div className="flex justify-between items-center mb-2">
                  <label className="label-caps text-white/50 block text-[10px] tracking-widest group-focus-within:text-[var(--color-bob-orange)] transition-colors">Amount (INR)</label>
                  {stats && (
                    <span className={`text-[10px] font-mono font-bold tracking-widest px-2 py-0.5 rounded uppercase ${isHighTrust ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20 shadow-[0_0_10px_rgba(0,196,140,0.1)]' : 'bg-white/5 text-white/40 border border-white/10'}`}>
                      Limit: ₹{maxLimit.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
                <input 
                  required 
                  type="number" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  placeholder="100000" 
                  className="w-full px-4 py-3 bg-black/25 border border-white/5 rounded-xl text-sm placeholder:text-white/20 focus:border-[var(--color-bob-orange)] focus:ring-2 focus:ring-[var(--color-bob-orange)]/10 transition-all text-white shadow-inner"
                />
              </div>

              <div className="group">
                <label className="label-caps text-white/50 block mb-2 text-[10px] tracking-widest group-focus-within:text-[var(--color-bob-orange)] transition-colors">Notes (Optional)</label>
                <textarea 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  placeholder="Enjoy the money" 
                  rows={2} 
                  className="w-full px-4 py-3 bg-black/25 border border-white/5 rounded-xl text-sm placeholder:text-white/20 focus:border-[var(--color-bob-orange)] focus:ring-2 focus:ring-[var(--color-bob-orange)]/10 transition-all text-white shadow-inner resize-none"
                />
              </div>
            </div>

            {/* Continuous Security Verification Bar */}
            <div className="flex items-center justify-between text-xs px-4 py-3 bg-black/20 border border-white/5 rounded-xl mt-6 shadow-inner">
              <span className={`flex items-center gap-2 transition-colors duration-300 font-medium tracking-wide ${activeSignal ? 'text-[var(--color-bob-orange)]' : 'text-white/40'}`}>
                <svg className={`w-4.5 h-4.5 transition-transform duration-300 ${activeSignal ? 'scale-110' : 'scale-100'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Biometric Analyzer Active
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold font-mono tracking-wider ${status === 'SUSPICIOUS' ? 'text-red-500' : 'text-[var(--color-success)]'}`}>
                  {status}
                </span>
                <div className={`w-2.5 h-2.5 rounded-full ${status === 'SUSPICIOUS' ? 'bg-red-500 animate-pulse' : 'bg-[var(--color-success)]'}`}></div>
              </div>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={isTransferring} 
              className="w-full mt-6 bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] text-white font-bold py-4 rounded-xl shadow-[0_4px_20px_rgba(242,101,34,0.3)] hover:shadow-[0_6px_25px_rgba(242,101,34,0.5)] hover:-translate-y-0.5 transition-all disabled:opacity-75 disabled:hover:translate-y-0 text-sm tracking-wider uppercase"
            >
              {isTransferring ? "Processing Transfer..." : "Transfer Funds"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
