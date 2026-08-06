import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { DashHeader } from "@/components/Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings · TrustSphere" }] }),
  component: SettingsPage,
});

const API_BASE = "http://localhost:8001";

function SettingsPage() {
  const { role } = useAuth();
  const isCustomer = role === "customer";
  const categories = isCustomer 
    ? ["Trusted Devices", "Security Rules", "Emergency Freeze"] 
    : ["Risk Thresholds", "Notification Rules", "Audit Log", "API Configuration"];

  const [tab, setTab] = useState(0);
  const [allow, setAllow] = useState(80);
  const [block, setBlock] = useState(40);
  const [wDevice, setWDevice] = useState(0.40);
  const [wBehavior, setWBehavior] = useState(0.35);
  const [wNetwork, setWNetwork] = useState(0.25);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggles, setToggles] = useState({ blockEmail: true, otpSms: true, highRiskWebhook: false, dailyReport: true });
  const [customerToggles, setCustomerToggles] = useState(() => {
    const saved = localStorage.getItem("trustsphere_customer_rules");
    return saved ? JSON.parse(saved) : { reqOtpOutsideInd: false, pushNightLogin: false, lockUnrecognized: true };
  });
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);

  // Emergency Freeze state
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false);
  const [freezeReasonSelect, setFreezeReasonSelect] = useState("Suspected unauthorized access");
  const [freezeDetail, setFreezeDetail] = useState("");
  const [freezing, setFreezing] = useState(false);
  const [freezeError, setFreezeError] = useState("");
  const [accountFrozenState, setAccountFrozenState] = useState(false);

  // Load thresholds from backend
  useEffect(() => {
    apiFetch(`${API_BASE}/api/config/thresholds`)
      .then(r => r.json())
      .then(data => {
        setAllow(data.threshold_allow ?? 80);
        setBlock(data.threshold_block ?? 40);
        setWDevice(data.weights?.device ?? 0.40);
        setWBehavior(data.weights?.behavior ?? 0.35);
        setWNetwork(data.weights?.network ?? 0.25);
      })
      .catch(() => {});
  }, []);

  // Load audit log or devices when tab is active
  useEffect(() => {
    if (!isCustomer && tab === 2) {
      apiFetch(`${API_BASE}/api/config/audit-log?page=1&limit=20`)
        .then(r => r.json())
        .then(data => setAuditEntries(data.entries || []))
        .catch(() => {});
    } else if (isCustomer && tab === 0) {
      apiFetch(`${API_BASE}/api/sessions/devices/my`)
        .then(r => r.json())
        .then(data => setDevices(data.devices || []))
        .catch(() => {});
    }
  }, [tab, isCustomer]);

  // Sync customer rules to local storage for the demo
  useEffect(() => {
    localStorage.setItem("trustsphere_customer_rules", JSON.stringify(customerToggles));
  }, [customerToggles]);

  const revokeDevice = async (id: string) => {
    try {
      await apiFetch(`${API_BASE}/api/sessions/devices/${id}/revoke`, { method: "POST" });
      setDevices(prev => prev.filter(d => d.id !== id));
    } catch {}
  };

  // Save thresholds
  const saveThresholds = async () => {
    setSaving(true);
    try {
      await apiFetch(`${API_BASE}/api/config/thresholds`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threshold_allow: allow,
          threshold_otp: Math.round((allow + block) / 2),
          threshold_block: block,
          weight_device: wDevice,
          weight_behavior: wBehavior,
          weight_network: wNetwork,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="space-y-10 pb-12 animate-fade-in-up relative z-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-20">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-1 bg-[var(--color-bob-orange)] rounded-full"></div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-bob-orange)] font-bold">Administration</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--color-text-main)] drop-shadow-md">
            Platform Configuration
          </h1>
          <p className="text-[var(--color-text-sub)] mt-3 text-sm max-w-xl leading-relaxed">
            Tune risk thresholds, alert rules, inspect audit trails, and manage API integrations.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-8">
        <nav className="flex flex-col gap-3">
          {categories.map((c, i) => (
            <button key={c} onClick={()=>setTab(i)}
              className={`text-left px-5 py-4 rounded-[20px] text-sm tracking-wide transition-all duration-300 relative overflow-hidden group ${tab===i ? "bg-[var(--color-glass-bg)] border border-[var(--color-bob-orange)]/40 text-[var(--color-text-main)] font-bold shadow-[0_4px_20px_rgba(242,101,34,0.15)]" : "bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] text-[var(--color-text-dim)] hover:bg-[var(--color-glass-hover)] hover:text-[var(--color-text-sub)]"}`}>
              {tab === i && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[var(--color-bob-orange)] to-purple-500 shadow-[0_0_10px_var(--color-bob-orange)]"></div>}
              {c}
            </button>
          ))}
        </nav>

        <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-glass-border)] rounded-[32px] shadow-[0_10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] relative overflow-hidden min-h-[500px]">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[var(--color-bob-orange)]/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="p-10 relative z-10">
            {/* --- CUSTOMER VIEWS --- */}
            {isCustomer && tab === 0 && (
              <div className="space-y-8 animate-fade-in">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)] font-bold">Security Hub</div>
                  <h3 className="text-2xl font-extrabold mt-1 text-[var(--color-text-main)]">Trusted Devices</h3>
                  <p className="text-sm text-[var(--color-text-sub)] mt-2">Manage the devices recognized by our behavioral AI engine.</p>
                </div>
                
                <div className="flex-1 space-y-3 font-mono text-xs overflow-y-auto custom-scrollbar max-h-[500px] pr-2">
                  {devices.length === 0 ? (
                    <div className="py-20 text-center text-[var(--color-text-dim)] uppercase tracking-widest border border-dashed border-[var(--color-glass-border)] rounded-2xl bg-[var(--color-glass-bg)]">
                      No trusted devices found.
                    </div>
                  ) : (
                    devices.map((d) => (
                      <div key={d.id} className="p-4 bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-2xl flex items-center gap-6 group hover:border-[var(--color-text-dim)] transition-colors">
                        <div className="text-[var(--color-bob-orange)] font-bold w-1/4 truncate">
                          {d.platform || "Unknown OS"} • {d.user_agent?.includes("Mobi") ? "Mobile" : "Desktop"}
                        </div>
                        <div className="text-[var(--color-text-sub)] flex-1 truncate">
                          {d.user_agent}
                        </div>
                        <div className="text-[var(--color-text-dim)] min-w-[120px] tracking-wider text-right">
                          {new Date(d.last_seen).toLocaleDateString()}
                        </div>
                        {d.trust_level !== "REVOKED" ? (
                          <button onClick={() => revokeDevice(d.id)} className="px-4 py-1.5 bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/20 rounded-lg hover:bg-[var(--color-danger)] hover:text-white transition-colors font-bold tracking-wider">
                            REVOKE
                          </button>
                        ) : (
                          <span className="px-4 py-1.5 text-[var(--color-danger)] font-bold tracking-wider opacity-50">
                            REVOKED
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {isCustomer && tab === 1 && (
              <div className="space-y-8 animate-fade-in">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)] font-bold">Preferences</div>
                  <h3 className="text-2xl font-extrabold mt-1 text-[var(--color-text-main)]">Custom Security Rules</h3>
                  <p className="text-sm text-[var(--color-text-sub)] mt-2">Take control of your own threat model with custom geofence and alert triggers.</p>
                </div>
                
                <div className="space-y-4 bg-[var(--color-glass-bg)] p-6 rounded-[24px] border border-[var(--color-glass-border)]">
                  {[
                    { k: "reqOtpOutsideInd", l: "Always require an OTP if my account is accessed outside of India" },
                    { k: "pushNightLogin", l: "Send me a push notification if a login attempt occurs between 12 AM and 6 AM" },
                    { k: "lockUnrecognized", l: "Automatically lock account on unrecognized device login" },
                  ].map(t => (
                    <div key={t.k} className="flex items-center justify-between p-4 bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-2xl hover:bg-[var(--color-glass-hover)] transition-colors group">
                      <div className="text-sm font-medium text-[var(--color-text-sub)] group-hover:text-[var(--color-text-main)] transition-colors">{t.l}</div>
                      <Toggle on={(customerToggles as any)[t.k]} onChange={() => setCustomerToggles((s: any) => ({ ...s, [t.k]: !(s as any)[t.k] }))}/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isCustomer && tab === 2 && (
              <div className="space-y-8 animate-fade-in">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-red-400 font-bold">Emergency Action</div>
                  <h3 className="text-2xl font-extrabold mt-1 text-[var(--color-text-main)]">Emergency Freeze (Kill Switch)</h3>
                  <p className="text-sm text-[var(--color-text-sub)] mt-2">
                    Immediately terminate all active sessions and block any future login attempts if you suspect account compromise or lost devices.
                  </p>
                </div>
                
                <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-[24px] space-y-6 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-mono uppercase tracking-widest text-[var(--color-text-dim)] font-bold">Account Security Status</div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase ${accountFrozenState ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'}`}>
                          <span className={`w-2 h-2 rounded-full ${accountFrozenState ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                          {accountFrozenState ? "Frozen - Pending Analyst Review" : "Active & Protected"}
                        </span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => setIsFreezeModalOpen(true)}
                      className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm tracking-wider uppercase rounded-xl transition-all shadow-[0_4px_20px_rgba(220,38,38,0.4)] hover:shadow-[0_6px_25px_rgba(220,38,38,0.6)] flex items-center gap-2 shrink-0"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Freeze Account
                    </button>
                  </div>

                  <div className="border-t border-red-500/20 pt-4 text-xs text-red-200/80 space-y-2 font-mono">
                    <p>⚡ <strong>What happens when you freeze your account:</strong></p>
                    <ul className="list-disc list-inside space-y-1 pl-2 text-red-300/70">
                      <li>All active web and mobile sessions will be terminated immediately.</li>
                      <li>Login via Password, Google OAuth, and MFA OTP will be strictly blocked.</li>
                      <li>A Security Analyst will review your request before your account can be reactivated.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* --- ADMIN VIEWS --- */}
            {!isCustomer && tab === 0 && (
              <div className="space-y-10 animate-fade-in">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)] font-bold">Adaptive Auth Engine</div>
                  <h3 className="text-2xl font-extrabold mt-1 text-[var(--color-text-main)]">Risk Score Thresholds</h3>
                  <p className="text-sm text-[var(--color-text-sub)] mt-2">Adjust the dynamic boundaries that dictate autonomous authentication challenges.</p>
                </div>
                
                <div className="space-y-8 bg-[var(--color-glass-bg)] p-8 rounded-[24px] border border-[var(--color-glass-border)] shadow-inner">
                  <SliderField label="Auto-Allow (Frictionless) ≥" value={allow} setValue={setAllow} color="var(--color-success)"/>
                  <SliderField label="Immediate Block (Deny) ≤" value={block} setValue={setBlock} color="var(--color-danger)"/>
                  
                  <div className="flex items-center gap-4 bg-[var(--color-page-bg)] rounded-2xl p-4 border border-[var(--color-glass-border)]">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-glass-bg)] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div className="flex-1 flex justify-between items-center text-xs font-mono">
                      <div className="flex flex-col"><span className="text-[var(--color-success)] font-bold">ALLOW</span><span className="text-[var(--color-text-dim)]">Score &gt; {allow}</span></div>
                      <div className="text-[var(--color-glass-border)]">|</div>
                      <div className="flex flex-col items-center"><span className="text-[var(--color-warning)] font-bold">STEP-UP (OTP)</span><span className="text-[var(--color-text-dim)]">Score {block} – {allow}</span></div>
                      <div className="text-[var(--color-glass-border)]">|</div>
                      <div className="flex flex-col items-end"><span className="text-[var(--color-danger)] font-bold">BLOCK</span><span className="text-[var(--color-text-dim)]">Score &lt; {block}</span></div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)] font-bold mb-4">Signal Weights</div>
                  <div className="grid grid-cols-3 gap-6">
                    <WeightField label="Device Fingerprint" value={wDevice} setValue={setWDevice} color="#F26522"/>
                    <WeightField label="Behavioral Biometrics" value={wBehavior} setValue={setWBehavior} color="#378ADD"/>
                    <WeightField label="Network & Context" value={wNetwork} setValue={setWNetwork} color="#A855F7"/>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)] mt-4 font-mono font-bold flex items-center gap-2">
                    Sum: {(wDevice + wBehavior + wNetwork).toFixed(2)} 
                    {Math.abs(1 - (wDevice + wBehavior + wNetwork)) > 0.01 && <span className="text-[var(--color-danger)]">(Weights must sum to 1.00)</span>}
                  </div>
                </div>

                <div className="pt-4">
                  <button onClick={saveThresholds} disabled={saving} className="w-full relative overflow-hidden group rounded-[20px] p-0.5">
                    <span className="absolute inset-0 bg-gradient-to-r from-[var(--color-bob-orange)] to-purple-600 rounded-[20px] opacity-80 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></span>
                    <div className="relative bg-[var(--color-page-bg)] group-hover:bg-transparent transition-colors duration-300 rounded-[18px] px-8 py-4 flex items-center justify-center gap-3">
                      <span className="font-bold text-white tracking-[0.2em] uppercase text-sm">
                        {saving ? "Deploying Configuration…" : saved ? "✓ Config Deployed" : "Save & Deploy Configuration"}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {!isCustomer && tab === 1 && (
              <div className="space-y-8 animate-fade-in">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)] font-bold">Alerting</div>
                  <h3 className="text-2xl font-extrabold mt-1 text-[var(--color-text-main)]">Notification Rules</h3>
                </div>
                
                <div className="space-y-4 bg-[var(--color-glass-bg)] p-6 rounded-[24px] border border-[var(--color-glass-border)]">
                  {[
                    { k: "blockEmail", l: "Email admin on every BLOCK decision" },
                    { k: "otpSms", l: "Send SMS to customer on OTP step-up" },
                    { k: "highRiskWebhook", l: "Trigger SIEM webhook on high-risk anomaly" },
                    { k: "dailyReport", l: "Generate daily summary report for compliance" },
                  ].map(t => (
                    <div key={t.k} className="flex items-center justify-between p-4 bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-2xl hover:bg-[var(--color-glass-hover)] transition-colors group">
                      <div className="text-sm font-medium text-[var(--color-text-sub)] group-hover:text-[var(--color-text-main)] transition-colors">{t.l}</div>
                      <Toggle on={(toggles as any)[t.k]} onChange={() => setToggles(s => ({ ...s, [t.k]: !(s as any)[t.k] }))}/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isCustomer && tab === 2 && (
              <div className="animate-fade-in h-full flex flex-col">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)] font-bold">Compliance</div>
                  <h3 className="text-2xl font-extrabold mt-1 text-[var(--color-text-main)] mb-6">System Audit Log</h3>
                </div>
                
                <div className="flex-1 space-y-3 font-mono text-xs overflow-y-auto custom-scrollbar max-h-[500px] pr-2">
                  {auditEntries.length === 0 && (
                    <div className="py-20 text-center text-[var(--color-text-dim)] uppercase tracking-widest border border-dashed border-[var(--color-glass-border)] rounded-2xl bg-[var(--color-glass-bg)]">
                      No audit log entries present.
                    </div>
                  )}
                  {auditEntries.map((entry, i) => (
                    <div key={entry.id || i} className="p-4 bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-2xl flex items-center gap-6 group hover:border-[var(--color-text-dim)] transition-colors">
                      <div className="text-[var(--color-text-dim)] min-w-[140px] tracking-wider">{new Date(entry.created_at).toLocaleString("en-GB", { hour12: false })}</div>
                      <div className="text-[var(--color-bob-orange)] font-bold w-1/4 truncate">{entry.event_type}</div>
                      <div className="text-[var(--color-text-sub)] flex-1">{entry.description || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isCustomer && tab === 3 && (
              <div className="animate-fade-in space-y-8">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)] font-bold">Integration</div>
                  <h3 className="text-2xl font-extrabold mt-1 text-[var(--color-text-main)]">API Configuration</h3>
                </div>
                
                <div className="bg-[var(--color-glass-bg)] p-8 rounded-[24px] border border-[var(--color-glass-border)]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)] font-bold mb-4">REST Endpoints Map</div>
                  <div className="space-y-3">
                    {[
                      { m: "POST", p: "/api/auth/login" },
                      { m: "POST", p: "/api/auth/verify-otp" },
                      { m: "GET",  p: "/api/score/:session_id" },
                      { m: "GET",  p: "/api/sessions" },
                      { m: "GET",  p: "/api/graph/nodes" },
                      { m: "GET",  p: "/api/stats/overview" },
                      { m: "GET",  p: "/api/config/thresholds" },
                      { m: "PUT",  p: "/api/config/thresholds" },
                    ].map(e => (
                      <div key={e.m+e.p} className="flex items-center gap-4 px-5 py-3 bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-xl font-mono text-sm hover:bg-[var(--color-glass-hover)] transition-colors">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-widest ${e.m === "GET" ? "bg-[var(--color-graph-user)]/20 text-[var(--color-graph-user)]" : e.m === "PUT" ? "bg-[var(--color-warning)]/20 text-[var(--color-warning)]" : "bg-[var(--color-bob-orange)]/20 text-[var(--color-bob-orange)]"}`}>{e.m}</span>
                        <span className="text-[var(--color-text-sub)]">{e.p}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 p-5 bg-[var(--color-page-bg)] border border-[var(--color-glass-border)] rounded-2xl">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)] font-bold mb-2">Active Target Backend URL</div>
                    <div className="font-mono text-lg text-[var(--color-success)] font-bold">{API_BASE}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Freeze Confirmation Modal */}
      {isFreezeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setIsFreezeModalOpen(false)}></div>
          <div className="relative bg-[#0d1520] border-2 border-red-500/40 rounded-3xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(239,68,68,0.3)] animate-scale-up space-y-6 z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h4 className="text-xl font-extrabold text-white">Emergency Lockout</h4>
                <p className="text-xs text-red-400 font-mono">Confirm Account Freeze</p>
              </div>
            </div>

            {freezeError && (
              <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-xs text-red-300 font-mono">
                {freezeError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-gray-300 mb-2 font-bold">Reason for Freeze</label>
                <select
                  value={freezeReasonSelect}
                  onChange={e => setFreezeReasonSelect(e.target.value)}
                  className="w-full px-4 py-3 bg-black/40 border border-gray-700 rounded-xl text-sm text-white focus:border-red-500 outline-none"
                >
                  <option value="Suspected unauthorized access">Suspected unauthorized access</option>
                  <option value="Lost device">Lost device</option>
                  <option value="Suspicious activity">Suspicious activity</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-gray-300 mb-2 font-bold">Additional Details (Optional)</label>
                <textarea
                  value={freezeDetail}
                  onChange={e => setFreezeDetail(e.target.value)}
                  placeholder="Provide any context for the security analyst..."
                  rows={3}
                  className="w-full px-4 py-3 bg-black/40 border border-gray-700 rounded-xl text-sm text-white focus:border-red-500 outline-none resize-none placeholder-gray-500"
                ></textarea>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsFreezeModalOpen(false)}
                className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={freezing}
                onClick={async () => {
                  setFreezing(true);
                  setFreezeError("");
                  try {
                    const fullReason = freezeDetail ? `${freezeReasonSelect}: ${freezeDetail}` : freezeReasonSelect;
                    const res = await apiFetch(`${API_BASE}/api/auth/freeze`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ reason: fullReason }),
                    });
                    if (!res.ok) {
                      const errData = await res.json().catch(() => ({}));
                      throw new Error(errData.detail || "Failed to freeze account.");
                    }
                    setAccountFrozenState(true);
                    await supabase.auth.signOut();
                    sessionStorage.clear();
                    window.location.href = "/login?frozen=true";
                  } catch (err: any) {
                    setFreezeError(err.message || "Failed to freeze account");
                    setFreezing(false);
                  }
                }}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)] flex items-center gap-2"
              >
                {freezing ? "Freezing..." : "Confirm Account Freeze"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SliderField({ label, value, setValue, color }: { label: string; value: number; setValue: (n: number) => void; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-3 items-end">
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--color-text-sub)]">{label}</div>
        <div className="font-mono text-3xl font-extrabold tracking-tighter" style={{ color }}>{value}</div>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={e=>setValue(+e.target.value)}
        className="w-full h-2 rounded-full appearance-none bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] outline-none" style={{ accentColor: color }}/>
    </div>
  );
}

function WeightField({ label, value, setValue, color }: { label: string; value: number; setValue: (n: number) => void; color: string }) {
  return (
    <div className="bg-[var(--color-page-bg)] p-5 rounded-2xl border border-[var(--color-glass-border)] shadow-inner">
      <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)] font-bold mb-2 h-6">{label}</div>
      <div className="font-mono text-2xl font-extrabold mb-4" style={{ color }}>{value.toFixed(2)}</div>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={e=>setValue(+e.target.value / 100)}
        className="w-full h-1.5 rounded-full appearance-none bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] outline-none" style={{ accentColor: color }}/>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className={`w-14 h-7 rounded-full transition-colors relative shadow-inner ${on ? "bg-gradient-to-r from-[var(--color-bob-orange)] to-purple-600 shadow-[0_0_10px_rgba(242,101,34,0.4)]" : "bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)]"}`}>
      <span className={`absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white transition-all shadow-md ${on ? "left-[31px]" : "left-[3px]"}`}/>
    </button>
  );
}
