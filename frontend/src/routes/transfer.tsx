import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { BobLogo } from "@/components/BobLogo";
import { toast } from "sonner";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/transfer")({
  head: () => ({ meta: [{ title: "Fund transfer · TrustSphere" }] }),
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
      toast.error("Transfer declined", {
        description: `Amount exceeds your current dynamic limit of ₹${maxLimit.toLocaleString('en-IN')} based on your trust score.`,
      });
      return;
    }

    setIsTransferring(true);
    toast.info("Evaluating real-time behavioral metrics…", { duration: 2000 });

    setTimeout(() => {
      if (status === "SUSPICIOUS") {
        toast.error("Transaction declined", {
          description: "High-risk behavioral metrics blocked this transaction for security.",
          duration: 6000
        });
        setIsTransferring(false);
      } else {
        toast.success("Fund transfer initiated", {
          description: `Transferred ₹${Number(amount).toLocaleString('en-IN')} to account ${recipient}.`,
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
    <div className="min-h-screen bg-[var(--color-page-bg)] flex flex-col" onMouseMove={onMouseMove}>
      <header className="border-b border-[var(--color-border-default)] px-6 h-14 flex items-center justify-between shrink-0">
        <Link to="/dashboard" className="flex items-center gap-3">
          <BobLogo size={26} />
        </Link>
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] transition-colors duration-100">
          <ArrowLeft size={14} strokeWidth={2} /> Back to dashboard
        </Link>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-14">
        <div className="w-full max-w-[440px] animate-fade-in-up">
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">Transfer funds</h1>
            <p className="text-[13px] text-[var(--color-text-sub)] mt-1">Your behavioral signals are evaluated continuously during this session.</p>
          </div>

          <form onSubmit={handleTransferSubmit} className="surface-card p-6 space-y-5" onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
            <div>
              <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Recipient account number</label>
              <input
                required
                type="text"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="1002325789"
                className="input-field w-full font-mono"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[12.5px] font-medium text-[var(--color-text-main)]">Amount (INR)</label>
                {stats && (
                  <span className={`chip ${isHighTrust ? "chip-success" : "chip-neutral"}`}>
                    Limit ₹{maxLimit.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <input
                required
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="100000"
                className="input-field w-full font-mono"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Notes <span className="text-[var(--color-text-dim)] font-normal">(optional)</span></label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="What's this for?"
                rows={2}
                className="input-field w-full resize-none"
              />
            </div>

            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
              <span className={`flex items-center gap-2 text-[12.5px] font-medium transition-colors duration-150 ${activeSignal ? "text-[var(--color-accent-brand)]" : "text-[var(--color-text-dim)]"}`}>
                <ShieldCheck size={14} strokeWidth={2} />
                Biometric analyzer active
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] font-semibold" style={{ color: status === "SUSPICIOUS" ? "var(--color-danger)" : "var(--color-success)" }}>
                  {status}
                </span>
                <span className="status-dot" style={{ background: status === "SUSPICIOUS" ? "var(--color-danger)" : "var(--color-success)" }} />
              </div>
            </div>

            <button type="submit" disabled={isTransferring} className="btn-primary w-full h-10">
              {isTransferring ? "Processing transfer…" : "Transfer funds"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
