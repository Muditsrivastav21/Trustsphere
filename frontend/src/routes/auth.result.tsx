import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
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
}

function ResultPage() {
  const search = Route.useSearch();
  const [result, setResult] = useState<TrustResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [otp, setOtp] = useState("");
  const [otpStatus, setOtpStatus] = useState<{ verified?: boolean; message?: string } | null>(null);

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
      <div className="min-h-screen bg-[var(--color-navy)] flex items-center justify-center">
        <div className="text-[var(--color-text-secondary)] animate-pulse">Loading trust evaluation…</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-[var(--color-navy)] flex flex-col items-center justify-center gap-4">
        <div className="text-[var(--color-text-secondary)]">No session data found.</div>
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

  const handleOtpSubmit = async () => {
    if (otp.length !== 6) return;
    try {
      const resp = await apiFetch(`${API_BASE}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: d.session_id, otp_code: otp }),
      });
      const data = await resp.json();
      setOtpStatus(data);
    } catch {
      setOtpStatus({ verified: false, message: "Verification request failed." });
    }
  };

  const reasonText = d.flags.length > 0
    ? d.flags.map(f => f.replace(/_/g, " ").toLowerCase()).join(" · ")
    : d.is_known_device
      ? "Trusted device · consistent behavior · known IP"
      : "Identity verified";

  return (
    <div className="min-h-screen bg-[#0a111a] flex flex-col relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)] pointer-events-none"></div>
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--color-bob-orange)]/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[150px] pointer-events-none"></div>

      <header className="border-b border-white/5 px-8 h-16 flex items-center justify-between relative z-10 bg-[#0a111a]/50 backdrop-blur-md">
        <Link to="/"><BobLogo /></Link>
        <Link to="/login" className="text-sm text-white/50 hover:text-[var(--color-bob-orange)] transition-colors font-medium">Logout</Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-[640px] animate-fade-in-up">
          <div className="bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-3xl p-8 sm:p-10 relative overflow-hidden">
            {/* Subtle glow behind the ring */}
            <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-[100px] pointer-events-none" style={{ background: d.trust_score >= 70 ? 'rgba(0,196,140,0.15)' : d.trust_score >= 40 ? 'rgba(245,166,35,0.15)' : 'rgba(232,56,79,0.15)' }}></div>

            <div className="text-center relative z-10">
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-[var(--color-bob-orange)] animate-pulse shadow-[0_0_10px_rgba(242,101,34,0.8)]"></span>
                <div className="label-caps text-[var(--color-bob-orange)] tracking-widest">Identity Trust Evaluation</div>
              </div>
              <div className="font-mono text-[11px] text-white/40 bg-white/5 inline-block px-4 py-1.5 rounded-full border border-white/10 shadow-inner tracking-wider">
                session_id: <span className="text-white/80">{d.session_id}</span>
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
                <div key={s.k} className="bg-black/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 relative overflow-hidden group hover:border-white/10 transition-colors shadow-inner">
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ background: `radial-gradient(circle at top right, ${s.glow}, transparent 70%)` }}></div>
                  <div className="label-caps text-white/40 mb-1 tracking-widest text-[10px]">{s.k}</div>
                  <div className="font-mono text-4xl font-bold tracking-tight" style={{ color: s.color }}>{s.v}</div>
                  <div className="mt-4 h-1.5 bg-white/5 rounded-full overflow-hidden shadow-inner">
                    <div className="h-full rounded-full transition-all duration-1000 relative" style={{ width: `${s.v}%`, background: s.color }}>
                      <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-white/30 rounded-full"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={`mt-8 border backdrop-blur-md rounded-2xl px-6 py-5 flex items-center gap-5 relative z-10 shadow-lg ${banner.cls}`}>
              <div className="w-12 h-12 rounded-full border-[2px] border-current flex items-center justify-center font-extrabold text-xl shrink-0 shadow-[0_0_20px_currentColor] opacity-90">{banner.icon}</div>
              <div className="flex-1">
                <div className="font-bold text-lg tracking-tight">{banner.text}</div>
                <div className="opacity-70 mt-1 uppercase tracking-widest text-[10px] font-medium">{reasonText}</div>
              </div>
            </div>

            {d.auth_action === "OTP" && !otpStatus?.verified && (
              <div className="mt-6 bg-black/40 border border-[var(--color-warning)]/30 rounded-2xl p-8 relative z-10 shadow-[0_0_40px_rgba(245,166,35,0.05)]">
                <div className="label-caps text-[var(--color-warning)] mb-5 text-center tracking-widest">Security Verification Required</div>
                <div className="flex gap-3 justify-center mb-6">
                  {[0,1,2,3,4,5].map(i => (
                    <input key={i} maxLength={1} value={otp[i] || ""}
                      onChange={e => setOtp(o => { const arr = o.split(""); arr[i] = e.target.value; return arr.join(""); })}
                      className="w-12 h-14 text-center font-mono text-2xl bg-[#0a111a] border border-white/10 rounded-xl focus:border-[var(--color-warning)] focus:ring-2 focus:ring-[var(--color-warning)]/20 focus:outline-none transition-all text-white shadow-inner"/>
                  ))}
                </div>
                <button onClick={handleOtpSubmit} className="w-full bg-gradient-to-r from-[var(--color-warning)] to-yellow-600 text-black font-extrabold py-4 rounded-xl shadow-[0_4px_20px_rgba(245,166,35,0.4)] hover:shadow-[0_6px_25px_rgba(245,166,35,0.6)] hover:-translate-y-1 transition-all disabled:opacity-50 disabled:hover:translate-y-0 text-sm tracking-wide" disabled={otp.length < 6}>
                  VERIFY OTP
                </button>
                <div className="text-[10px] text-white/30 mt-5 text-center font-mono uppercase tracking-[0.2em]">
                  Check backend console for code (demo)
                </div>
              </div>
            )}

            {otpStatus && (
              <div className={`mt-6 text-sm rounded-2xl px-5 py-4 border relative z-10 backdrop-blur-md font-medium ${otpStatus.verified ? "bg-[rgba(0,196,140,0.1)] border-[var(--color-success)]/30 text-[var(--color-success)]" : "bg-[rgba(232,56,79,0.1)] border-[var(--color-danger)]/30 text-[var(--color-danger)]"}`}>
                {otpStatus.message}
              </div>
            )}

            {d.flags.length > 0 && (
              <div className="mt-6 relative z-10 bg-black/20 p-5 rounded-2xl border border-white/5 shadow-inner">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <div className="label-caps text-white/50 tracking-widest">Risk Indicators Detected</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.flags.map((f: string) => <span key={f} className="bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-[var(--color-danger)] px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-widest shadow-[0_0_15px_rgba(232,56,79,0.15)] uppercase">{f}</span>)}
                </div>
              </div>
            )}

            <div className="mt-10 flex gap-4 justify-center relative z-10">
              <Link 
                to="/dashboard" 
                disabled={otpRequiredAndNotVerified}
                className={`px-8 py-3.5 rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-all font-semibold shadow-sm backdrop-blur-sm tracking-wide ${otpRequiredAndNotVerified ? 'opacity-40 pointer-events-none' : ''}`}
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
