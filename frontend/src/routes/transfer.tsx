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
            toast.error("Suspicious behavior detected during transfer!");
          } else {
            toast.success("Identity verified continuously.");
          }
        }
      } catch (e) {
        console.warn("Continuous auth ping failed", e);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-navy)] text-white p-8" onMouseMove={onMouseMove} onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
      <div className="max-w-md mx-auto surface-card p-6 rounded-lg mt-12">
        <div className="flex justify-center mb-6"><BobLogo size={40} /></div>
        <h2 className="text-2xl font-bold mb-2">Fund Transfer</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">Enter transfer details. We are continuously monitoring your typing patterns to keep your account safe.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs mb-1 text-[var(--color-text-muted)] uppercase">Recipient Account</label>
            <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="0000000000" className="w-full bg-[var(--color-navy-mid)] border border-[var(--color-navy-border)] p-2 rounded" />
          </div>
          <div>
            <label className="block text-xs mb-1 text-[var(--color-text-muted)] uppercase">Amount (INR)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000" className="w-full bg-[var(--color-navy-mid)] border border-[var(--color-navy-border)] p-2 rounded" />
          </div>
          <div>
            <label className="block text-xs mb-1 text-[var(--color-text-muted)] uppercase">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Transfer description..." className="w-full bg-[var(--color-navy-mid)] border border-[var(--color-navy-border)] p-2 rounded" rows={3} />
          </div>

          <button className="w-full bg-[var(--color-bob-orange)] text-white p-2 rounded font-bold hover:opacity-90 mt-4">
            Transfer Funds
          </button>
        </div>

        <div className="mt-6 p-3 bg-[var(--color-navy-mid)] rounded border border-[var(--color-navy-border)]">
          <div className="text-xs text-[var(--color-text-muted)] uppercase">Continuous Auth Status</div>
          <div className={`mt-1 font-bold ${status === 'SUSPICIOUS' ? 'text-red-500' : 'text-green-500'}`}>
            {status}
          </div>
        </div>
      </div>
    </div>
  );
}
