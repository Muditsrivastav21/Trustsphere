import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { DashHeader } from "@/components/Sidebar";
import { MiniTrustRing } from "@/components/TrustRing";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Overview · TrustSphere" }] }),
  component: Overview,
});

const API_BASE = "http://localhost:8001";

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
  user: string; score: number; ip: string; action: string; t: string; loc: string;
}

function StatCard({ label, value, delta, tone, accent, gradient }: { label: string; value: string; delta: string; tone: "up"|"down"; accent: string; gradient: string }) {
  return (
    <div className="relative group rounded-2xl overflow-hidden bg-black/20 backdrop-blur-xl border border-white/5 p-6 shadow-lg hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-1">
      {/* Ambient background glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 pointer-events-none" style={{ background: `radial-gradient(circle at top right, ${accent}, transparent 60%)` }}></div>
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: accent }}></div>
      
      <div className="label-caps text-white/40 tracking-wider text-[10px] uppercase mb-3">{label}</div>
      <div className={`font-mono font-extrabold text-4xl tracking-tight text-transparent bg-clip-text bg-gradient-to-br ${gradient}`}>{value}</div>
      
      <div className={`text-xs mt-3 flex items-center gap-1.5 font-medium ${tone === "up" ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-current/10">
          {tone === "up" ? "↗" : "↘"}
        </span>
        <span className="opacity-80">{delta}</span>
      </div>
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [riskDist, setRiskDist] = useState({ low: 0, medium: 0, high: 0, critical: 0 });

  // Fetch dashboard stats
  useEffect(() => {
    apiFetch(`${API_BASE}/api/stats/overview`)
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(() => {});

    apiFetch(`${API_BASE}/api/stats/risk-distribution`)
      .then(r => r.json())
      .then(data => setRiskDist(data))
      .catch(() => {});

    // Fetch recent sessions for the live feed
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
        }));
        setFeed(entries);
      })
      .catch(() => {});
  }, []);

  // Poll for new sessions every 5 seconds (simulates real-time without Supabase JS client)
  useEffect(() => {
    const interval = setInterval(() => {
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
          }));
          setFeed(entries);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const distribution = [
    { name: "Low Risk", value: riskDist.low, color: "#00C48C" },
    { name: "Medium", value: riskDist.medium, color: "#F5A623" },
    { name: "High Risk", value: riskDist.high + riskDist.critical, color: "#E8384F" },
  ];

  const flagged = feed.filter(f => f.action !== "ALLOW").slice(0, 6);

  const totalDisplay = stats ? stats.total_logins_today.toLocaleString() : "—";
  const highRiskDisplay = stats ? stats.high_risk_count.toString() : "—";
  const blockedDisplay = stats ? stats.blocked_count.toString() : "—";
  const fraudRingsDisplay = stats ? stats.fraud_rings_detected.toString() : "—";

  const flaggedOnboardingDisplay = stats ? stats.flagged_onboarding_count.toString() : "—";
  const flaggedRecoveryDisplay = stats ? stats.flagged_recovery_count.toString() : "—";
  const insiderAlertsDisplay = stats ? stats.insider_alerts_count.toString() : "—";

  return (
    <div>
      <DashHeader title="Operational Overview" subtitle="Live identity trust signals across Bank of Baroda digital channels."
        actions={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 shadow-sm backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse shadow-[0_0_8px_var(--color-success)]" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold text-white/70">Realtime · streaming</span>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <StatCard label="Total Logins (24h)" value={totalDisplay} delta={`+${stats?.delta.total_logins_last_hour || 0} last hour`} tone="up" accent="#F26522" gradient="from-[#F26522] to-yellow-500" />
        <StatCard label="High-Risk Sessions" value={highRiskDisplay} delta={`+${stats?.delta.high_risk_last_hour || 0} last hour`} tone="down" accent="#E8384F" gradient="from-[#E8384F] to-pink-500" />
        <StatCard label="Blocked Attempts" value={blockedDisplay} delta={`${stats?.otp_triggered_count || 0} OTP triggered`} tone="down" accent="#D4521A" gradient="from-orange-600 to-red-600" />
        <StatCard label="Fraud Rings Detected" value={fraudRingsDisplay} delta={`avg score: ${stats?.avg_trust_score?.toFixed(0) || 0}`} tone="down" accent="#A855F7" gradient="from-purple-500 to-indigo-500" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        <StatCard label="Flagged Onboarding" value={flaggedOnboardingDisplay} delta="High Risk" tone="down" accent="#F5A623" gradient="from-[#F5A623] to-[#E8384F]" />
        <StatCard label="Flagged Recovery" value={flaggedRecoveryDisplay} delta="Step-Up / Block" tone="down" accent="#00C48C" gradient="from-[#00C48C] to-[#00A070]" />
        <StatCard label="Insider Threat Alerts" value={insiderAlertsDisplay} delta="Privileged Access" tone="down" accent="#E8384F" gradient="from-[#E8384F] to-pink-500" />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 mb-8">
        <div className="bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-lg flex flex-col relative group">
          <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-1000 pointer-events-none" style={{ background: `radial-gradient(circle at top left, var(--color-bob-orange), transparent 50%)` }}></div>
          <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02] relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-[var(--color-bob-orange)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <div className="label-caps text-[var(--color-bob-orange)] tracking-widest text-[10px]">Live Session Feed</div>
              </div>
              <div className="text-sm font-semibold text-white/80">Most recent authentication events</div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 shadow-[0_0_10px_rgba(0,196,140,0.1)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse"></span>
              <span className="font-mono text-[10px] text-[var(--color-success)] uppercase tracking-widest font-bold">Live</span>
            </div>
          </div>
          <div className="divide-y divide-white/5 max-h-[460px] overflow-auto relative z-10 custom-scrollbar">
            {feed.length === 0 && (
              <div className="px-6 py-10 text-center text-white/40 text-sm font-medium">
                No login events yet. Try logging in via the portal.
              </div>
            )}
            {feed.map((f, i) => (
              <div key={`${f.t}-${i}`} className={`px-6 py-3.5 flex items-center gap-4 hover:bg-white/5 transition-colors ${i % 2 ? "bg-black/10" : ""} ${i === 0 ? "animate-fade-in" : ""}`}>
                <div className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-xs font-bold text-white/70 shadow-inner">
                  {f.user.split(" ").map(s=>s[0]).join("").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white/90 truncate">{f.user}</div>
                  <div className="font-mono text-[10px] text-white/40 mt-0.5 tracking-wider">{f.ip} · {f.loc}</div>
                </div>
                <div className="font-mono text-[10px] text-white/30 tracking-wider bg-black/20 px-2 py-1 rounded border border-white/5">{f.t}</div>
                <div className="mx-2"><MiniTrustRing score={f.score} /></div>
                <span className={`px-3 py-1 text-[10px] font-mono tracking-widest rounded-md uppercase font-bold border ${f.action === "ALLOW" ? "bg-[rgba(0,196,140,0.1)] text-[var(--color-success)] border-[var(--color-success)]/30" : f.action === "OTP" ? "bg-[rgba(245,166,35,0.1)] text-[var(--color-warning)] border-[var(--color-warning)]/30" : "bg-[rgba(232,56,79,0.1)] text-[var(--color-danger)] border-[var(--color-danger)]/30 shadow-[0_0_10px_rgba(232,56,79,0.2)]"}`}>{f.action}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-lg flex flex-col relative overflow-hidden group">
          <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-1000 pointer-events-none" style={{ background: `radial-gradient(circle at bottom right, var(--color-success), transparent 60%)` }}></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
              <div className="label-caps text-blue-400 tracking-widest text-[10px]">Risk Distribution</div>
            </div>
            <div className="text-sm font-semibold text-white/80 mb-6">All sessions</div>
          </div>
          <div className="h-[240px] relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribution} dataKey="value" innerRadius={65} outerRadius={100} paddingAngle={4}>
                  {distribution.map((d, i) => <Cell key={i} fill={d.color} stroke="rgba(255,255,255,0.05)" strokeWidth={2}/>)}
                </Pie>
                <Tooltip contentStyle={{ background: "rgba(10, 17, 26, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, backdropFilter: "blur(8px)", color: "white" }} itemStyle={{ color: "white" }}/>
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)", paddingTop: 20 }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center font-mono text-3xl font-extrabold mt-4 relative z-10 text-white/90">
            {riskDist.low + riskDist.medium + riskDist.high + riskDist.critical}
            <span className="text-[10px] text-white/40 ml-2 uppercase tracking-[0.2em] font-bold">total</span>
          </div>
        </div>
      </div>

      <div className="bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-lg relative group">
        <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-1000 pointer-events-none" style={{ background: `radial-gradient(circle at top right, var(--color-danger), transparent 60%)` }}></div>
        <div className="px-6 py-5 border-b border-white/5 bg-white/[0.02] relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <div className="label-caps text-[var(--color-danger)] tracking-widest text-[10px]">Flagged Events</div>
          </div>
          <div className="text-sm font-semibold text-white/80">Sessions requiring analyst attention</div>
        </div>
        <div className="overflow-x-auto relative z-10">
          <table className="w-full text-sm">
            <thead className="text-white/40 bg-black/40 border-b border-white/5">
              <tr className="text-left font-mono text-[10px] uppercase tracking-widest">
                <th className="px-6 py-4 font-semibold rounded-tl-lg">User</th>
                <th className="px-6 py-4 font-semibold">IP Address</th>
                <th className="px-6 py-4 font-semibold">Score</th>
                <th className="px-6 py-4 font-semibold">Risk Reason</th>
                <th className="px-6 py-4 font-semibold text-right rounded-tr-lg">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {flagged.map((f, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors group cursor-pointer">
                  <td className="px-6 py-4 font-medium text-white/90">{f.user}</td>
                  <td className="px-6 py-4 font-mono text-xs text-white/40 group-hover:text-white/60 transition-colors tracking-wider">{f.ip}</td>
                  <td className="px-6 py-4">
                    <span className={`font-mono text-lg font-bold drop-shadow-md ${f.score < 40 ? "text-[var(--color-danger)]" : "text-[var(--color-warning)]"}`}>{f.score}</span>
                  </td>
                  <td className="px-6 py-4 text-white/50 text-xs font-medium group-hover:text-white/70 transition-colors">
                    {f.score < 40 ? "Fraud ring · shared IP · typing anomaly" : "Unrecognized device fingerprint"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`px-3 py-1.5 text-[10px] font-mono tracking-widest rounded-md uppercase font-bold border shadow-sm ${f.action === "OTP" ? "bg-[rgba(245,166,35,0.1)] text-[var(--color-warning)] border-[var(--color-warning)]/30" : "bg-[rgba(232,56,79,0.1)] text-[var(--color-danger)] border-[var(--color-danger)]/30 shadow-[0_0_10px_rgba(232,56,79,0.2)]"}`}>{f.action === "OTP" ? "OTP Sent" : "Blocked"}</span>
                  </td>
                </tr>
              ))}
              {flagged.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-white/40 text-sm font-medium">No flagged events in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
