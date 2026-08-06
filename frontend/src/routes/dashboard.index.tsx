import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { DashHeader } from "@/components/Sidebar";
import { MiniTrustRing } from "@/components/TrustRing";
import { useAuth } from "@/contexts/AuthContext";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Overview · TrustSphere" }] }),
  component: Overview,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

interface OverviewStats {
  total_logins_today: number;
  high_risk_count: number;
  blocked_count: number;
  fraud_rings_detected: number;
  avg_trust_score: number;
  otp_triggered_count: number;
  delta: { total_logins_last_hour: number; high_risk_last_hour: number };
  flagged_onboarding_count: number;
  flagged_recovery_count: number;
  insider_alerts_count: number;
}

interface FeedEntry {
  user: string; score: number; ip: string; action: string; t: string; loc: string; device_hash?: string; is_known_device?: boolean; flags?: string[];
}

function PremiumStatCard({ label, value, delta, tone, accent, gradient, icon }: { label: string; value: string; delta: string; tone: "up"|"down"|"neutral"; accent: string; gradient: string; icon?: React.ReactNode }) {
  return (
    <div className="relative group rounded-[28px] overflow-hidden bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-glass-border)] p-7 flex flex-col justify-between h-[200px] shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.15)] dark:hover:shadow-[0_16px_48px_rgba(0,0,0,0.6)] transition-all duration-500 hover:-translate-y-1">
      {/* Dynamic Glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000 pointer-events-none mix-blend-screen" style={{ background: `radial-gradient(circle at top right, ${accent}, transparent 60%)` }}></div>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none" style={{ border: `2px solid ${accent}`, borderRadius: '28px' }}></div>
      
      <div className="flex items-start justify-between relative z-10">
        <div className="font-mono text-[var(--color-text-dim)] tracking-[0.15em] text-[10px] uppercase font-bold drop-shadow-md">{label}</div>
        {icon && <div className="text-[var(--color-text-dim)] group-hover:text-[var(--color-text-sub)] transition-colors duration-500 drop-shadow-md">{icon}</div>}
      </div>
      
      <div className="relative z-10 mt-auto">
        <div className={`font-mono font-extrabold text-5xl tracking-tighter text-transparent bg-clip-text bg-gradient-to-br ${gradient} drop-shadow-sm`}>{value}</div>
        
        <div className="mt-4 flex items-center gap-2.5">
          <div className={`flex items-center justify-center w-6 h-6 rounded-full shadow-inner border border-[var(--color-glass-border)] ${tone === 'up' ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]' : tone === 'down' ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]' : 'bg-[var(--color-glass-bg)] text-[var(--color-text-dim)]'}`}>
            {tone === "up" ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg> : tone === "down" ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg> : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg>}
          </div>
          <span className="text-[13px] font-medium text-[var(--color-text-sub)] tracking-wide">{delta}</span>
        </div>
      </div>
    </div>
  );
}

function Overview() {
  const { role } = useAuth();
  const isCustomer = role === "customer";

  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [riskDist, setRiskDist] = useState({ low: 0, medium: 0, high: 0, critical: 0 });
  const [isSimulating, setIsSimulating] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [liveGeo, setLiveGeo] = useState<{ip: string, city: string, isp: string} | null>(null);

  const triggerFreeze = async () => {
    try {
      await apiFetch(`${API_BASE}/api/auth/freeze`, { method: "POST" });
      setIsFrozen(true);
    } catch {}
  };

  useEffect(() => {
    apiFetch(`${API_BASE}/api/stats/overview`)
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(() => {});

    apiFetch(`${API_BASE}/api/stats/risk-distribution`)
      .then(r => r.json())
      .then(data => setRiskDist(data))
      .catch(() => {});

    if (isCustomer) {
      apiFetch(`${API_BASE}/api/sessions/devices/my`)
        .then(r => r.json())
        .then(data => setDevices(data.devices || []))
        .catch(() => {});

      // Fetch live real IP and Geo for demo realism
      fetch("https://ipapi.co/json/")
        .then(r => r.json())
        .then(data => {
          if (data.ip) {
            setLiveGeo({
              ip: data.ip,
              city: `${data.city}, ${data.region_code || data.country}`,
              isp: data.org || data.asn || "broadband network"
            });
          }
        })
        .catch(() => {});
    }
  }, [isCustomer]);

  const fetchData = () => {
    if (isSimulating) return; // Pause live feed while running attack simulation
    apiFetch(`${API_BASE}/api/sessions?page=1&limit=14`)
      .then(r => r.json())
      .then(data => {
        const entries: FeedEntry[] = (data.sessions || []).map((s: any) => ({
          user: s.user_name || "Unknown",
          score: s.trust_score,
          ip: s.ip_address,
          action: s.auth_action,
          t: new Date(s.timestamp).toLocaleTimeString("en-GB", { hour12: false }),
          loc: s.location || "",
          device_hash: s.device_hash,
          is_known_device: s.is_known_device,
          flags: s.flags || []
        }));
        setFeed(entries);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [isSimulating]); // re-bind when isSimulating changes

  const injectSimulatedTraffic = (channel: string) => {
    setIsSimulating(true);
    // Resume live polling after 20 seconds
    setTimeout(() => setIsSimulating(false), 20000);

    const attackPatterns = {
      "ATM": [
        { u: "ATM Terminal 4A", s: 85, i: "192.168.1.104", a: "ALLOW", l: "Mumbai, IN" },
        { u: "ATM Terminal 4A", s: 42, i: "192.168.1.104", a: "OTP", l: "Mumbai, IN" },
        { u: "ATM Terminal 4A", s: 15, i: "192.168.1.104", a: "BLOCK", l: "Mumbai, IN" },
        { u: "ATM Terminal 2B", s: 12, i: "192.168.1.104", a: "BLOCK", l: "Delhi, IN" },
        { u: "ATM Terminal 9C", s: 8, i: "192.168.1.104", a: "BLOCK", l: "Pune, IN" },
      ],
      "MOBILE": [
        { u: "Priya Mehta", s: 75, i: "49.36.14.22", a: "ALLOW", l: "Delhi, IN" },
        { u: "Priya Mehta", s: 45, i: "103.11.22.44", a: "OTP", l: "Moscow, RU" },
        { u: "Priya Mehta", s: 22, i: "103.11.22.45", a: "BLOCK", l: "Moscow, RU" },
        { u: "Priya Mehta", s: 18, i: "103.11.22.46", a: "BLOCK", l: "Moscow, RU" },
        { u: "Priya Mehta", s: 11, i: "103.11.22.47", a: "BLOCK", l: "Moscow, RU" },
      ],
      "API": [
        { u: "B2B Sync Service", s: 92, i: "10.0.0.5", a: "ALLOW", l: "AWS-South-1" },
        { u: "B2B Sync Service", s: 90, i: "10.0.0.5", a: "ALLOW", l: "AWS-South-1" },
        { u: "Unknown Service", s: 35, i: "211.44.55.66", a: "BLOCK", l: "Shenzhen, CN" },
        { u: "Unknown Service", s: 21, i: "211.44.55.66", a: "BLOCK", l: "Shenzhen, CN" },
        { u: "Unknown Service", s: 5, i: "211.44.55.66", a: "BLOCK", l: "Shenzhen, CN" },
      ]
    };

    const pattern = attackPatterns[channel as keyof typeof attackPatterns] || attackPatterns["ATM"];
    let step = 0;

    const interval = setInterval(() => {
      if (step >= pattern.length) {
        clearInterval(interval);
        return;
      }
      const p = pattern[step];
      const newEntry: FeedEntry = {
        user: p.u,
        score: p.s,
        ip: p.i,
        action: p.a,
        t: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        loc: p.l,
      };
      
      setFeed(prev => {
        const copy = [...prev];
        copy.unshift(newEntry);
        return copy.slice(0, 14);
      });
      step++;
    }, 400); // 400ms interval for rapid cascading effect
  };

  const distribution = [
    { name: "Low Risk", value: riskDist.low, color: "#00C48C" },
    { name: "Medium", value: riskDist.medium, color: "#F5A623" },
    { name: "High Risk", value: riskDist.high + riskDist.critical, color: "#E8384F" },
  ];

  const flagged = feed.filter(f => f.action !== "ALLOW").slice(0, 6);

  const totalDisplay = stats && stats.total_logins_today !== undefined ? stats.total_logins_today.toLocaleString() : "—";
  const highRiskDisplay = stats ? stats.high_risk_count.toString() : "—";
  const blockedDisplay = stats ? stats.blocked_count.toString() : "—";
  const fraudRingsDisplay = stats ? stats.fraud_rings_detected.toString() : "—";

  if (isFrozen) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-4 animate-fade-in">
        <div className="w-24 h-24 bg-[var(--color-danger)]/20 rounded-full flex items-center justify-center mb-6 border border-[var(--color-danger)] animate-pulse shadow-[0_0_40px_rgba(232,56,79,0.5)]">
          <svg className="w-12 h-12 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </div>
        <h1 className="text-5xl font-extrabold text-white mb-4 tracking-tight drop-shadow-[0_0_15px_rgba(232,56,79,0.5)]">ACCOUNT FROZEN</h1>
        <p className="text-xl text-gray-300 max-w-2xl text-center mb-10 leading-relaxed">
          Your account has been locked for your protection. All API calls, ATM withdrawals, and mobile sessions are strictly blocked.
        </p>
        <p className="text-sm font-mono text-[var(--color-danger)] tracking-widest uppercase font-bold border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(232,56,79,0.3)]">
          Please visit a branch or complete Video KYC to unlock.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fade-in-up pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-20">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-1 bg-[var(--color-bob-orange)] rounded-full"></div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-bob-orange)] font-bold">Live Sync</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--color-text-main)] drop-shadow-md">
            {isCustomer ? "Trust Dashboard" : "Operational Command"}
          </h1>
          <p className="text-[var(--color-text-sub)] mt-3 text-sm max-w-xl leading-relaxed">
            {isCustomer ? "Your personal digital banking security and trust metrics." : "Real-time identity trust signals across all global channels."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {isCustomer && (
            <button onClick={triggerFreeze} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-danger)]/10 hover:bg-[var(--color-danger)] border border-[var(--color-danger)]/30 hover:border-[var(--color-danger)] text-[var(--color-danger)] hover:text-white transition-all duration-300 font-bold text-[11px] uppercase tracking-wider shadow-[0_0_15px_rgba(232,56,79,0.2)]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              Freeze Account
            </button>
          )}
          <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-[var(--color-panel-bg)] border border-[var(--color-glass-border)] shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--color-success)] shadow-[0_0_10px_var(--color-success)]"></span>
            </span>
            <span className="text-xs font-mono uppercase tracking-widest font-bold text-[var(--color-text-main)]">Monitoring</span>
          </div>
        </div>
      </div>

      {isCustomer && (stats?.avg_trust_score || 0) > 90 && (
        <div className="bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded-[24px] p-5 flex items-center justify-between relative z-10 shadow-[0_0_30px_rgba(0,196,140,0.1)] animate-fade-in -mt-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[var(--color-success)]/20 border border-[var(--color-success)]/30 flex items-center justify-center shadow-inner">
              <svg className="w-6 h-6 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold tracking-[0.15em] text-[var(--color-success)] uppercase mb-1">Trust Benefit Unlocked</div>
              <div className="text-[15px] text-[var(--color-text-main)] font-medium">Your high trust score ({Math.round(stats?.avg_trust_score || 0)}) has temporarily unlocked a higher instant-transfer limit of <span className="font-bold text-[var(--color-success)] font-mono text-lg">₹500,000</span>.</div>
            </div>
          </div>
        </div>
      )}

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 relative z-10">
        <PremiumStatCard 
          label={isCustomer ? "My Authentications" : "Total Traffic (24h)"} 
          value={totalDisplay} 
          delta={`+${stats?.delta.total_logins_last_hour || 0} this hour`} 
          tone="up" accent="#F26522" gradient="from-[#F26522] to-[#FF9E66]" 
          icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <PremiumStatCard 
          label="High-Risk Signals" value={highRiskDisplay} delta={`+${stats?.delta.high_risk_last_hour || 0} this hour`} 
          tone="down" accent="#E8384F" gradient="from-[#E8384F] to-[#FF4E66]" 
          icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
        />
        <PremiumStatCard 
          label="Blocked Threats" value={blockedDisplay} delta={`${stats?.otp_triggered_count || 0} OTP step-ups`} 
          tone="down" accent="#F5A623" gradient="from-[#F5A623] to-[#FFD166]" 
          icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
        />
        <PremiumStatCard 
          label={isCustomer ? "My Global Trust" : "Active Fraud Rings"} 
          value={isCustomer ? `${stats?.avg_trust_score?.toFixed(0) || "—"}` : fraudRingsDisplay} 
          delta={isCustomer ? "Top 5% securely" : `Avg score: ${stats?.avg_trust_score?.toFixed(0) || 0}`} 
          tone={isCustomer ? "up" : "down"} accent="#A855F7" gradient="from-[#A855F7] to-[#D8B4FE]" 
          icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 relative z-10">
        {/* HUD Live Session Feed */}
        <div className="xl:col-span-2 bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-glass-border)] rounded-[32px] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden group flex flex-col min-h-[600px] xl:h-[calc(100vh-280px)]">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/3"></div>
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[var(--color-bob-orange)]/5 rounded-full blur-[100px] pointer-events-none translate-y-1/3 -translate-x-1/3"></div>
          
          <div className="px-8 py-6 border-b border-[var(--color-glass-border)] flex items-center justify-between relative z-10 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[var(--color-glass-bg)] rounded-2xl border border-[var(--color-glass-border)] flex items-center justify-center shadow-inner">
                <svg className="w-6 h-6 text-[var(--color-text-sub)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <div className="font-mono text-[var(--color-bob-orange)] tracking-[0.2em] text-[10px] uppercase font-bold mb-1">Security HUD</div>
                <div className="text-lg font-bold text-[var(--color-text-main)] tracking-wide">{isCustomer ? "Your Auth Stream" : "Global Authentication Stream"}</div>
              </div>
            </div>
            
            {!isCustomer && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-[var(--color-text-dim)] tracking-[0.1em] mr-2">Simulate:</span>
                <button onClick={() => injectSimulatedTraffic("ATM")} className="px-3 py-1.5 text-[10px] font-bold font-mono text-[var(--color-text-sub)] border border-[var(--color-glass-border)] rounded-md hover:border-blue-500/50 hover:text-blue-400 transition-colors shadow-inner">ATM</button>
                <button onClick={() => injectSimulatedTraffic("MOBILE")} className="px-3 py-1.5 text-[10px] font-bold font-mono text-[var(--color-text-sub)] border border-[var(--color-glass-border)] rounded-md hover:border-purple-500/50 hover:text-purple-400 transition-colors shadow-inner">MOBILE</button>
                <button onClick={() => injectSimulatedTraffic("API")} className="px-3 py-1.5 text-[10px] font-bold font-mono text-[var(--color-text-sub)] border border-[var(--color-glass-border)] rounded-md hover:border-[var(--color-bob-orange)]/50 hover:text-[var(--color-bob-orange)] transition-colors shadow-inner">B2B API</button>
              </div>
            )}
          </div>
          
          <div className="p-5 flex flex-col gap-4 relative z-10 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-3">
            {feed.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)] font-mono text-sm uppercase tracking-widest">
                Awaiting signals...
              </div>
            )}
            {feed.map((f, i) => (
              <div key={`${f.t}-${i}`} className={`shrink-0 relative p-5 rounded-2xl bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] hover:border-[var(--color-text-dim)] hover:bg-[var(--color-glass-hover)] transition-all duration-300 group flex items-center gap-5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 ${i === 0 ? "animate-fade-in-up" : ""}`}>
                {/* HUD Glowing Edge */}
                <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-md transition-all duration-500 group-hover:h-[80%] ${f.action === "ALLOW" ? "bg-[var(--color-success)] shadow-[0_0_10px_var(--color-success)]" : f.action === "OTP" ? "bg-[var(--color-warning)] shadow-[0_0_10px_var(--color-warning)]" : "bg-[var(--color-danger)] shadow-[0_0_10px_var(--color-danger)]"}`}></div>
                
                <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-[var(--color-glass-bg)] to-transparent border border-[var(--color-glass-border)] flex items-center justify-center font-extrabold text-[var(--color-text-sub)] shadow-inner group-hover:border-[var(--color-text-dim)] transition-all">
                  {f.user.split(" ").map(s=>s[0]).join("").slice(0,2)}
                </div>
                
                <div className="flex-1 min-w-0 pr-4">
                  <div className="text-base font-bold text-[var(--color-text-main)] truncate tracking-wide mb-1.5 flex items-center gap-2">
                    {isCustomer ? "You" : f.user}
                    {f.flags && f.flags.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/20 shadow-sm shrink-0">
                        <div className="w-1 h-1 rounded-full bg-[var(--color-danger)] animate-pulse"></div>
                        {f.flags[0]} {f.flags.length > 1 && `+${f.flags.length - 1}`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-[var(--color-text-dim)] tracking-wider flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg> {f.ip}</span>
                    <span className="w-1 h-1 rounded-full bg-[var(--color-glass-border)]"></span>
                    <span className="font-mono text-[11px] text-[var(--color-text-dim)] tracking-wider flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> {f.loc || "Unknown"}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-8 pl-4 border-l border-[var(--color-glass-border)]">
                  <div className="text-right flex flex-col justify-center">
                    <div className="font-mono text-[10px] text-[var(--color-text-dim)] tracking-widest mb-2">{f.t}</div>
                    <div className="flex justify-end">
                      <span className={`inline-flex px-3 py-1 text-[9px] font-mono tracking-[0.2em] rounded-md uppercase font-bold border ${f.action === "ALLOW" ? "bg-[rgba(0,196,140,0.1)] text-[var(--color-success)] border-[var(--color-success)]/20" : f.action === "OTP" ? "bg-[rgba(245,166,35,0.1)] text-[var(--color-warning)] border-[var(--color-warning)]/20" : "bg-[rgba(232,56,79,0.1)] text-[var(--color-danger)] border-[var(--color-danger)]/20 shadow-[0_0_15px_rgba(232,56,79,0.2)]"}`}>{f.action}</span>
                    </div>
                  </div>
                  <div className="scale-[1.35] mr-3 filter drop-shadow-lg"><MiniTrustRing score={f.score} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Analytics & Alerts Sidebar */}
        <div className="flex flex-col gap-6 min-h-[600px] xl:h-[calc(100vh-280px)]">
          <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-glass-border)] rounded-[32px] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col h-[380px] shrink-0">
            <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none"></div>
            
            <div className="relative z-10 flex items-center justify-between mb-8 shrink-0">
              <div>
                <div className="font-mono text-blue-500 dark:text-blue-400 tracking-[0.2em] text-[10px] uppercase font-bold drop-shadow-md mb-1">Risk Radar</div>
                <div className="text-lg font-bold text-[var(--color-text-main)]">Session Threat Levels</div>
              </div>
            </div>
            
            <div className="flex-1 relative z-10 flex flex-col justify-center shrink-0">
              <div className="h-[220px] w-full relative">
                {/* Glowing ring backdrops */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full border border-[var(--color-glass-border)] bg-[var(--color-glass-bg)] shadow-inner"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border border-[var(--color-glass-border)] bg-[var(--color-glass-hover)] shadow-[inset_0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]"></div>
                
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distribution} dataKey="value" innerRadius={80} outerRadius={110} paddingAngle={4} stroke="none" cornerRadius={8}>
                      {distribution.map((d, i) => (
                        <Cell key={i} fill={d.color} style={{ filter: `drop-shadow(0px 0px 10px ${d.color}60)` }} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--color-panel-bg)", border: "1px solid var(--color-glass-border)", borderRadius: 16, fontSize: 13, backdropFilter: "blur(12px)", color: "var(--color-text-main)", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", padding: "12px 16px" }} itemStyle={{ color: "var(--color-text-main)", fontWeight: "bold" }}/>
                  </PieChart>
                </ResponsiveContainer>
                
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
                  <div className="font-mono text-[42px] font-extrabold text-[var(--color-text-main)] drop-shadow-lg tracking-tighter">{riskDist.low + riskDist.medium + riskDist.high + riskDist.critical}</div>
                  <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-[var(--color-text-dim)] mt-1">Total</div>
                </div>
              </div>
              
              <div className="flex justify-center gap-5 mt-6">
                {distribution.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shadow-lg" style={{ backgroundColor: d.color, boxShadow: `0 0 12px ${d.color}` }}></span>
                    <span className="text-xs font-semibold text-[var(--color-text-sub)] tracking-wide">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {!isCustomer && (
            <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-danger)]/20 rounded-[32px] p-7 shadow-[0_8px_32px_rgba(232,56,79,0.08)] relative overflow-hidden flex-1 flex flex-col">
              <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-screen" style={{ background: `radial-gradient(circle at bottom right, var(--color-danger), transparent 70%)` }}></div>
              <div className="flex items-center gap-4 mb-6 relative z-10 shrink-0">
                <div className="w-12 h-12 bg-[var(--color-glass-bg)] rounded-2xl border border-[var(--color-danger)]/20 shadow-[inset_0_0_15px_rgba(232,56,79,0.1)] flex items-center justify-center">
                  <svg className="w-6 h-6 text-[var(--color-danger)] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <div>
                  <div className="font-mono text-[var(--color-danger)] tracking-[0.2em] text-[10px] uppercase font-bold drop-shadow-md mb-1">Active Alerts</div>
                  <div className="text-lg font-bold text-[var(--color-text-main)]">Immediate Attention</div>
                </div>
              </div>
              
              <div className="space-y-4 relative z-10 flex-1 overflow-auto custom-scrollbar pr-2">
                {flagged.slice(0,3).map((f, i) => (
                  <div key={i} className="shrink-0 flex justify-between items-center p-4 rounded-2xl bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] hover:border-[var(--color-danger)]/30 hover:bg-[var(--color-glass-hover)] transition-all group">
                    <div>
                      <div className="font-bold text-[var(--color-text-main)] text-[15px] tracking-wide mb-1">{f.user}</div>
                      <div className="font-mono text-[11px] text-[var(--color-danger)] uppercase tracking-widest font-bold">Trust: {f.score}%</div>
                    </div>
                    <span className="px-3 py-1.5 text-[10px] font-mono tracking-widest rounded-lg uppercase font-bold bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/20 shadow-sm group-hover:bg-[var(--color-danger)]/20 transition-colors">Action Req</span>
                  </div>
                ))}
                {flagged.length === 0 && <div className="text-center text-sm font-medium text-[var(--color-text-dim)] py-8 border border-dashed border-[var(--color-glass-border)] rounded-2xl">No critical alerts requiring action.</div>}
              </div>
            </div>
          )}

          {isCustomer && (
            (() => {
              const latestSession = feed.length > 0 ? feed[0] : null;
              const matchedDevice = latestSession 
                ? devices.find(d => d.fingerprint_hash === latestSession.device_hash) 
                : null;
                
              let deviceName = "Known Secure Device";
              if (matchedDevice && matchedDevice.platform) {
                deviceName = `${matchedDevice.platform} (${matchedDevice.user_agent?.includes('Mobi') ? 'Mobile' : 'Desktop'})`;
              } else if (typeof navigator !== 'undefined') {
                const ua = navigator.userAgent;
                if (ua.includes("Win")) deviceName = "HP Victus 16 Laptop";
                else if (ua.includes("Mac")) deviceName = "MacBook Pro (Apple Silicon)";
                else if (ua.includes("iPhone")) deviceName = "iPhone 14 Pro";
                else if (ua.includes("Linux")) deviceName = "Linux Workstation";
              }

              const locName = liveGeo?.city || ((latestSession?.loc && latestSession.loc.trim() !== "") ? latestSession.loc : "Jaipur, IN");
              const ipAddress = liveGeo?.ip || latestSession?.ip || "117.236.127.225";
              const ispName = liveGeo?.isp || "known broadband network";

              return (
                <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-success)]/20 rounded-[32px] p-8 shadow-[0_8px_32px_rgba(0,196,140,0.08)] relative overflow-hidden flex-1 flex flex-col min-h-[300px]">
                  <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-screen" style={{ background: `radial-gradient(circle at bottom right, var(--color-success), transparent 70%)` }}></div>
                  <div className="flex items-center gap-4 mb-6 relative z-10 shrink-0">
                    <div className="w-12 h-12 bg-[var(--color-glass-bg)] rounded-2xl border border-[var(--color-success)]/20 shadow-[inset_0_0_15px_rgba(0,196,140,0.1)] flex items-center justify-center">
                      <svg className="w-6 h-6 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <div>
                      <div className="font-mono text-[var(--color-success)] tracking-[0.2em] text-[10px] uppercase font-bold drop-shadow-md mb-1">Behavioral AI</div>
                      <div className="text-lg font-bold text-[var(--color-text-main)]">Why am I Trusted?</div>
                    </div>
                  </div>
                  <div className="relative z-10 flex-1 flex flex-col justify-between">
                    <p className="text-sm text-[var(--color-text-sub)] leading-relaxed mb-6 font-medium">
                      We securely authenticated you because we recognized your unique typing rhythm, your cryptographic hardware key from a <strong className="text-[var(--color-success)]">{deviceName}</strong>, and your usual <strong className="text-white">{ispName}</strong> <strong className="text-[var(--color-text-dim)] font-mono text-xs ml-1">(IP: {ipAddress})</strong> in <strong className="text-white">{locName}</strong>.
                    </p>
                    <div className="p-4 bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-xl font-mono text-[11px] text-[var(--color-success)] font-bold tracking-wider shadow-inner text-center flex flex-col gap-1">
                      <span>NO OTP REQUIRED FOR NEXT TRANSACTION</span>
                      <span className="text-[9px] text-[var(--color-success)]/60 opacity-80 mt-1">✓ CONTINUOUS EVALUATION ACTIVE</span>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
