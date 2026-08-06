import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { MiniTrustRing } from "@/components/TrustRing";
import { useAuth } from "@/contexts/AuthContext";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  TrendingUp, TrendingDown, Minus, ArrowUpRight, ShieldAlert, ShieldCheck,
  Lock, Radio, AlertCircle,
} from "lucide-react";

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

function StatCard({ label, value, delta, tone }: { label: string; value: string; delta: string; tone: "up" | "down" | "neutral" }) {
  const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : Minus;
  const toneColor = tone === "up" ? "var(--color-success)" : tone === "down" ? "var(--color-danger)" : "var(--color-text-dim)";
  return (
    <div className="surface-card p-5">
      <div className="label-caps text-[var(--color-text-dim)] mb-3">{label}</div>
      <div className="font-mono text-[30px] font-semibold text-[var(--color-text-main)] leading-none tracking-tight">{value}</div>
      <div className="mt-3 flex items-center gap-1.5">
        <Icon size={13} strokeWidth={2.25} style={{ color: toneColor }} />
        <span className="text-[12.5px] text-[var(--color-text-sub)]">{delta}</span>
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
  const [liveGeo, setLiveGeo] = useState<{ ip: string; city: string; isp: string } | null>(null);

  const triggerFreeze = async () => {
    try {
      await apiFetch(`${API_BASE}/api/auth/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Emergency lock requested by customer from dashboard" }),
      });
      await supabase.auth.signOut();
      sessionStorage.clear();
      window.location.href = "/login?frozen=true";
    } catch {}
  };

  useEffect(() => {
    apiFetch(`${API_BASE}/api/stats/overview`).then(r => r.json()).then(setStats).catch(() => {});
    apiFetch(`${API_BASE}/api/stats/risk-distribution`).then(r => r.json()).then(setRiskDist).catch(() => {});

    if (isCustomer) {
      apiFetch(`${API_BASE}/api/sessions/devices/my`)
        .then(r => r.json())
        .then(data => setDevices(data.devices || []))
        .catch(() => {});

      fetch("https://ipapi.co/json/")
        .then(r => r.json())
        .then(data => {
          if (data.ip) {
            setLiveGeo({ ip: data.ip, city: `${data.city}, ${data.region_code || data.country}`, isp: data.org || data.asn || "broadband network" });
          }
        })
        .catch(() => {});
    }
  }, [isCustomer]);

  const fetchData = () => {
    if (isSimulating) return;
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
          flags: s.flags || [],
        }));
        setFeed(entries);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("public:overview_realtime_users")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "login_events" }, () => fetchData())
      .subscribe();
    const interval = setInterval(fetchData, 3000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulating]);

  const injectSimulatedTraffic = (channel: string) => {
    setIsSimulating(true);
    setTimeout(() => setIsSimulating(false), 20000);

    const attackPatterns = {
      ATM: [
        { u: "ATM Terminal 4A", s: 85, i: "192.168.1.104", a: "ALLOW", l: "Mumbai, IN" },
        { u: "ATM Terminal 4A", s: 42, i: "192.168.1.104", a: "OTP", l: "Mumbai, IN" },
        { u: "ATM Terminal 4A", s: 15, i: "192.168.1.104", a: "BLOCK", l: "Mumbai, IN" },
        { u: "ATM Terminal 2B", s: 12, i: "192.168.1.104", a: "BLOCK", l: "Delhi, IN" },
        { u: "ATM Terminal 9C", s: 8, i: "192.168.1.104", a: "BLOCK", l: "Pune, IN" },
      ],
      MOBILE: [
        { u: "Priya Mehta", s: 75, i: "49.36.14.22", a: "ALLOW", l: "Delhi, IN" },
        { u: "Priya Mehta", s: 45, i: "103.11.22.44", a: "OTP", l: "Moscow, RU" },
        { u: "Priya Mehta", s: 22, i: "103.11.22.45", a: "BLOCK", l: "Moscow, RU" },
        { u: "Priya Mehta", s: 18, i: "103.11.22.46", a: "BLOCK", l: "Moscow, RU" },
        { u: "Priya Mehta", s: 11, i: "103.11.22.47", a: "BLOCK", l: "Moscow, RU" },
      ],
      API: [
        { u: "B2B Sync Service", s: 92, i: "10.0.0.5", a: "ALLOW", l: "AWS-South-1" },
        { u: "B2B Sync Service", s: 90, i: "10.0.0.5", a: "ALLOW", l: "AWS-South-1" },
        { u: "Unknown Service", s: 35, i: "211.44.55.66", a: "BLOCK", l: "Shenzhen, CN" },
        { u: "Unknown Service", s: 21, i: "211.44.55.66", a: "BLOCK", l: "Shenzhen, CN" },
        { u: "Unknown Service", s: 5, i: "211.44.55.66", a: "BLOCK", l: "Shenzhen, CN" },
      ],
    };

    const pattern = attackPatterns[channel as keyof typeof attackPatterns] || attackPatterns["ATM"];
    let step = 0;
    const interval = setInterval(() => {
      if (step >= pattern.length) { clearInterval(interval); return; }
      const p = pattern[step];
      setFeed(prev => [{ user: p.u, score: p.s, ip: p.i, action: p.a, t: new Date().toLocaleTimeString("en-GB", { hour12: false }), loc: p.l }, ...prev].slice(0, 14));
      step++;
    }, 400);
  };

  const distribution = [
    { name: "Low risk", value: riskDist.low, color: "var(--color-success)" },
    { name: "Medium", value: riskDist.medium, color: "var(--color-warning)" },
    { name: "High risk", value: riskDist.high + riskDist.critical, color: "var(--color-danger)" },
  ];

  const flagged = feed.filter(f => f.action !== "ALLOW").slice(0, 6);
  const totalDisplay = stats ? stats.total_logins_today.toLocaleString() : "—";
  const highRiskDisplay = stats ? stats.high_risk_count.toString() : "—";
  const blockedDisplay = stats ? stats.blocked_count.toString() : "—";
  const fraudRingsDisplay = stats ? stats.fraud_rings_detected.toString() : "—";

  const actionChip = (action: string) =>
    action === "ALLOW" ? "chip-success" : action === "OTP" ? "chip-warning" : "chip-danger";

  if (isFrozen) {
    return (
      <div className="fixed inset-0 z-[100] bg-[var(--color-page-bg)] flex flex-col items-center justify-center p-6">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-5" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
          <Lock size={24} strokeWidth={2} style={{ color: "var(--color-danger)" }} />
        </div>
        <h1 className="text-[26px] font-semibold text-[var(--color-text-main)] mb-3 text-center">Account frozen</h1>
        <p className="text-[14px] text-[var(--color-text-sub)] max-w-md text-center mb-6 leading-relaxed">
          Your account has been locked for your protection. API calls, ATM withdrawals, and mobile sessions are blocked.
        </p>
        <p className="text-[13px] font-medium text-[var(--color-danger)] border rounded-md px-4 py-2.5" style={{ borderColor: "var(--color-danger-border)", background: "var(--color-danger-bg)" }}>
          Visit a branch or complete Video KYC to unlock.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">
            {isCustomer ? "Trust dashboard" : "Operational overview"}
          </h1>
          <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1">
            {isCustomer ? "Your personal digital banking security and trust metrics." : "Real-time identity trust signals across all channels."}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {isCustomer && (
            <button onClick={triggerFreeze} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium border transition-colors duration-100"
              style={{ borderColor: "var(--color-danger-border)", color: "var(--color-danger)", background: "var(--color-danger-bg)" }}>
              <ShieldAlert size={14} strokeWidth={2} />
              Freeze account
            </button>
          )}
          <div className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface)]">
            <Radio size={12} strokeWidth={2} style={{ color: "var(--color-success)" }} />
            <span className="text-[12px] font-medium text-[var(--color-text-sub)]">Live monitoring</span>
          </div>
        </div>
      </div>

      {isCustomer && (stats?.avg_trust_score || 0) > 90 && (
        <div className="rounded-md px-4 py-3.5 flex items-center gap-3" style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)" }}>
          <ShieldCheck size={18} strokeWidth={2} className="shrink-0" style={{ color: "var(--color-success)" }} />
          <div className="text-[13px] text-[var(--color-text-main)]">
            Your high trust score ({Math.round(stats?.avg_trust_score || 0)}) has temporarily unlocked a higher instant-transfer limit of <strong className="font-mono" style={{ color: "var(--color-success)" }}>₹5,00,000</strong>.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label={isCustomer ? "My authentications" : "Total traffic (24h)"} value={totalDisplay} delta={`+${stats?.delta.total_logins_last_hour || 0} this hour`} tone="up" />
        <StatCard label="High-risk signals" value={highRiskDisplay} delta={`+${stats?.delta.high_risk_last_hour || 0} this hour`} tone="down" />
        <StatCard label="Blocked threats" value={blockedDisplay} delta={`${stats?.otp_triggered_count || 0} OTP step-ups`} tone="down" />
        <StatCard
          label={isCustomer ? "My global trust" : "Active fraud rings"}
          value={isCustomer ? `${stats?.avg_trust_score?.toFixed(0) || "—"}` : fraudRingsDisplay}
          delta={isCustomer ? "Top 5% securely" : `Avg score: ${stats?.avg_trust_score?.toFixed(0) || 0}`}
          tone={isCustomer ? "up" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 surface-card flex flex-col min-h-[560px] xl:h-[calc(100vh-320px)]">
          <div className="px-5 h-14 border-b border-[var(--color-border-default)] flex items-center justify-between shrink-0">
            <div className="text-[13.5px] font-medium text-[var(--color-text-main)]">
              {isCustomer ? "Your authentication stream" : "Global authentication stream"}
            </div>
            {!isCustomer && (
              <div className="flex items-center gap-1.5">
                <span className="label-caps text-[var(--color-text-dim)] mr-1">Simulate</span>
                {["ATM", "MOBILE", "API"].map(ch => (
                  <button key={ch} onClick={() => injectSimulatedTraffic(ch)} className="btn-secondary h-7 px-2.5 text-[11px]">{ch}</button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {feed.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[13px] text-[var(--color-text-dim)]">Awaiting signals…</div>
            ) : (
              <table className="table-clean">
                <thead>
                  <tr>
                    <th>{isCustomer ? "Session" : "User"}</th>
                    <th>IP / location</th>
                    <th>Time</th>
                    <th>Decision</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.map((f, i) => (
                    <tr key={`${f.t}-${i}`}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[11px] font-semibold text-[var(--color-text-sub)] shrink-0">
                            {f.user.split(" ").map(s => s[0]).join("").slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{isCustomer ? "You" : f.user}</div>
                            {f.flags && f.flags.length > 0 && (
                              <div className="text-[11px] text-[var(--color-danger)] truncate">{f.flags[0]}{f.flags.length > 1 ? ` +${f.flags.length - 1}` : ""}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-[12px] text-[var(--color-text-sub)]">
                        {f.ip}<br /><span className="text-[var(--color-text-dim)]">{f.loc || "Unknown"}</span>
                      </td>
                      <td className="font-mono text-[12px] text-[var(--color-text-dim)]">{f.t}</td>
                      <td><span className={`chip ${actionChip(f.action)}`}>{f.action}</span></td>
                      <td><MiniTrustRing score={f.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 min-h-[560px] xl:h-[calc(100vh-320px)]">
          <div className="surface-card p-6 shrink-0">
            <div className="text-[13.5px] font-medium text-[var(--color-text-main)] mb-5">Session threat levels</div>
            <div className="h-[180px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution} dataKey="value" innerRadius={62} outerRadius={82} paddingAngle={3} stroke="none">
                    {distribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border-default)", borderRadius: 8, fontSize: 12.5 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="font-mono text-[26px] font-semibold text-[var(--color-text-main)]">{riskDist.low + riskDist.medium + riskDist.high + riskDist.critical}</div>
                <div className="label-caps text-[var(--color-text-dim)] mt-0.5">Total</div>
              </div>
            </div>
            <div className="flex justify-center gap-4 mt-4">
              {distribution.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="status-dot" style={{ background: d.color }} />
                  <span className="text-[12px] text-[var(--color-text-sub)]">{d.name}</span>
                </div>
              ))}
            </div>
          </div>

          {!isCustomer && (
            <div className="surface-card p-6 flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <AlertCircle size={16} strokeWidth={2} style={{ color: "var(--color-danger)" }} />
                <div className="text-[13.5px] font-medium text-[var(--color-text-main)]">Requires immediate attention</div>
              </div>
              <div className="space-y-2 flex-1 overflow-auto">
                {flagged.slice(0, 3).map((f, i) => (
                  <div key={i} className="flex justify-between items-center p-3 rounded-md border border-[var(--color-border-default)]">
                    <div>
                      <div className="text-[13px] font-medium text-[var(--color-text-main)]">{f.user}</div>
                      <div className="font-mono text-[11px] text-[var(--color-danger)]">Trust {f.score}</div>
                    </div>
                    <span className="chip chip-danger">Action req.</span>
                  </div>
                ))}
                {flagged.length === 0 && (
                  <div className="text-center text-[12.5px] text-[var(--color-text-dim)] py-8 border border-dashed border-[var(--color-border-default)] rounded-md">
                    No critical alerts requiring action.
                  </div>
                )}
              </div>
            </div>
          )}

          {isCustomer && (() => {
            const latestSession = feed.length > 0 ? feed[0] : null;
            const matchedDevice = latestSession ? devices.find(d => d.fingerprint_hash === latestSession.device_hash) : null;
            let deviceName = "Known secure device";
            if (matchedDevice?.platform) {
              deviceName = `${matchedDevice.platform} (${matchedDevice.user_agent?.includes("Mobi") ? "Mobile" : "Desktop"})`;
            } else if (typeof navigator !== "undefined") {
              const ua = navigator.userAgent;
              if (ua.includes("Win")) deviceName = "Windows laptop";
              else if (ua.includes("Mac")) deviceName = "MacBook (Apple Silicon)";
              else if (ua.includes("iPhone")) deviceName = "iPhone";
              else if (ua.includes("Linux")) deviceName = "Linux workstation";
            }
            const locName = liveGeo?.city || ((latestSession?.loc && latestSession.loc.trim() !== "") ? latestSession.loc : "Jaipur, IN");
            const ipAddress = liveGeo?.ip || latestSession?.ip || "117.236.127.225";
            const ispName = liveGeo?.isp || "known broadband network";

            return (
              <div className="surface-card p-6 flex-1 flex flex-col min-h-[260px]">
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <ShieldCheck size={16} strokeWidth={2} style={{ color: "var(--color-success)" }} />
                  <div className="text-[13.5px] font-medium text-[var(--color-text-main)]">Why am I trusted?</div>
                </div>
                <p className="text-[13px] text-[var(--color-text-sub)] leading-relaxed mb-4 flex-1">
                  We recognized your typing rhythm, your device — <strong className="text-[var(--color-text-main)]">{deviceName}</strong> — and your usual network,{" "}
                  <strong className="text-[var(--color-text-main)]">{ispName}</strong>{" "}
                  <span className="font-mono text-[12px] text-[var(--color-text-dim)]">({ipAddress})</span> in{" "}
                  <strong className="text-[var(--color-text-main)]">{locName}</strong>.
                </p>
                <div className="rounded-md px-3.5 py-2.5 text-center" style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)" }}>
                  <div className="text-[12px] font-medium" style={{ color: "var(--color-success)" }}>No OTP required for next transaction</div>
                  <div className="text-[11px] text-[var(--color-text-dim)] mt-0.5">Continuous evaluation active</div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
