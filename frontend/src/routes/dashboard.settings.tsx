import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Lock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings · TrustSphere" }] }),
  component: SettingsPage,
});

const API_BASE = "http://localhost:8001";

function SettingsPage() {
  const { role } = useAuth();
  const isCustomer = role === "customer";
  const categories = isCustomer
    ? ["Trusted devices", "Security rules", "Emergency freeze"]
    : ["Risk thresholds", "Notification rules", "Audit log", "API configuration"];

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

  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false);
  const [freezeReasonSelect, setFreezeReasonSelect] = useState("Suspected unauthorized access");
  const [freezeDetail, setFreezeDetail] = useState("");
  const [freezing, setFreezing] = useState(false);
  const [freezeError, setFreezeError] = useState("");
  const [accountFrozenState, setAccountFrozenState] = useState(false);

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

  useEffect(() => {
    if (!isCustomer && tab === 2) {
      apiFetch(`${API_BASE}/api/config/audit-log?page=1&limit=20`).then(r => r.json()).then(data => setAuditEntries(data.entries || [])).catch(() => {});
    } else if (isCustomer && tab === 0) {
      apiFetch(`${API_BASE}/api/sessions/devices/my`).then(r => r.json()).then(data => setDevices(data.devices || [])).catch(() => {});
    }
  }, [tab, isCustomer]);

  useEffect(() => {
    localStorage.setItem("trustsphere_customer_rules", JSON.stringify(customerToggles));
  }, [customerToggles]);

  const revokeDevice = async (id: string) => {
    try {
      await apiFetch(`${API_BASE}/api/sessions/devices/${id}/revoke`, { method: "POST" });
      setDevices(prev => prev.filter(d => d.id !== id));
    } catch {}
  };

  const saveThresholds = async () => {
    setSaving(true);
    try {
      await apiFetch(`${API_BASE}/api/config/thresholds`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threshold_allow: allow, threshold_otp: Math.round((allow + block) / 2), threshold_block: block,
          weight_device: wDevice, weight_behavior: wBehavior, weight_network: wNetwork,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">Platform configuration</h1>
        <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1">Tune risk thresholds, alert rules, inspect audit trails, and manage API integrations.</p>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-4">
        <nav className="flex flex-col gap-1">
          {categories.map((c, i) => (
            <button key={c} onClick={() => setTab(i)}
              className={`text-left px-3 py-2.5 rounded-md text-[13.5px] transition-colors duration-100 ${tab === i ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-brand)] font-medium" : "text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sunken)]"}`}>
              {c}
            </button>
          ))}
        </nav>

        <div className="surface-card p-7 min-h-[480px]">
          {isCustomer && tab === 0 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[17px] font-semibold text-[var(--color-text-main)]">Trusted devices</h3>
                <p className="text-[13px] text-[var(--color-text-sub)] mt-1">Manage the devices recognized by our behavioral AI engine.</p>
              </div>
              <div className="space-y-2 max-h-[440px] overflow-y-auto">
                {devices.length === 0 ? (
                  <div className="py-16 text-center text-[13px] text-[var(--color-text-dim)] border border-dashed border-[var(--color-border-default)] rounded-md">No trusted devices found.</div>
                ) : (
                  devices.map((d) => (
                    <div key={d.id} className="p-3.5 rounded-md border border-[var(--color-border-default)] flex items-center gap-4">
                      <div className="text-[13px] font-medium text-[var(--color-text-main)] w-1/4 truncate">{d.platform || "Unknown OS"} · {d.user_agent?.includes("Mobi") ? "Mobile" : "Desktop"}</div>
                      <div className="font-mono text-[11.5px] text-[var(--color-text-dim)] flex-1 truncate">{d.user_agent}</div>
                      <div className="font-mono text-[11.5px] text-[var(--color-text-dim)] shrink-0">{new Date(d.last_seen).toLocaleDateString()}</div>
                      {d.trust_level !== "REVOKED" ? (
                        <button onClick={() => revokeDevice(d.id)} className="chip chip-danger hover:opacity-80 transition-opacity shrink-0" style={{ cursor: "pointer" }}>Revoke</button>
                      ) : (
                        <span className="chip chip-neutral shrink-0">Revoked</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {isCustomer && tab === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[17px] font-semibold text-[var(--color-text-main)]">Custom security rules</h3>
                <p className="text-[13px] text-[var(--color-text-sub)] mt-1">Take control of your own threat model with custom geofence and alert triggers.</p>
              </div>
              <div className="space-y-2">
                {[
                  { k: "reqOtpOutsideInd", l: "Always require an OTP if my account is accessed outside of India" },
                  { k: "pushNightLogin", l: "Send me a push notification if a login attempt occurs between 12 AM and 6 AM" },
                  { k: "lockUnrecognized", l: "Automatically lock account on unrecognized device login" },
                ].map(t => (
                  <div key={t.k} className="flex items-center justify-between p-3.5 rounded-md border border-[var(--color-border-default)]">
                    <div className="text-[13px] text-[var(--color-text-main)] pr-4">{t.l}</div>
                    <Toggle on={(customerToggles as any)[t.k]} onChange={() => setCustomerToggles((s: any) => ({ ...s, [t.k]: !(s as any)[t.k] }))} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {isCustomer && tab === 2 && (
            <div className="space-y-5">
              <div>
                <div className="label-caps mb-1.5" style={{ color: "var(--color-danger)" }}>Emergency action</div>
                <h3 className="text-[17px] font-semibold text-[var(--color-text-main)]">Emergency freeze (kill switch)</h3>
                <p className="text-[13px] text-[var(--color-text-sub)] mt-1.5">Immediately terminate all active sessions and block future login attempts if you suspect compromise or a lost device.</p>
              </div>

              <div className="p-5 rounded-md space-y-5" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="label-caps text-[var(--color-text-dim)] mb-1.5">Account security status</div>
                    <span className={`chip ${accountFrozenState ? "chip-danger" : "chip-success"}`}>{accountFrozenState ? "Frozen — pending review" : "Active & protected"}</span>
                  </div>
                  <button onClick={() => setIsFreezeModalOpen(true)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-[13px] font-medium text-white shrink-0" style={{ background: "var(--color-danger)" }}>
                    <Lock size={14} strokeWidth={2} /> Freeze account
                  </button>
                </div>
                <div className="border-t pt-3.5 text-[12.5px] leading-relaxed" style={{ borderColor: "var(--color-danger-border)", color: "var(--color-danger)" }}>
                  <p className="font-medium mb-1.5">What happens when you freeze your account:</p>
                  <ul className="list-disc list-inside space-y-1 opacity-90">
                    <li>All active web and mobile sessions are terminated immediately.</li>
                    <li>Password, Google OAuth, and MFA OTP logins are strictly blocked.</li>
                    <li>A security analyst reviews your request before reactivation.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {!isCustomer && tab === 0 && (
            <div className="space-y-7">
              <div>
                <h3 className="text-[17px] font-semibold text-[var(--color-text-main)]">Risk score thresholds</h3>
                <p className="text-[13px] text-[var(--color-text-sub)] mt-1">Adjust the dynamic boundaries that dictate autonomous authentication challenges.</p>
              </div>

              <div className="space-y-6 p-5 rounded-md border border-[var(--color-border-default)]">
                <SliderField label="Auto-allow (frictionless) ≥" value={allow} setValue={setAllow} tone="success" />
                <SliderField label="Immediate block (deny) ≤" value={block} setValue={setBlock} tone="danger" />

                <div className="flex items-center justify-between p-4 rounded-md bg-[var(--color-surface-sunken)] text-[12px] font-mono">
                  <div className="flex flex-col"><span className="font-semibold" style={{ color: "var(--color-success)" }}>ALLOW</span><span className="text-[var(--color-text-dim)]">Score &gt; {allow}</span></div>
                  <div className="flex flex-col items-center"><span className="font-semibold" style={{ color: "var(--color-warning)" }}>STEP-UP</span><span className="text-[var(--color-text-dim)]">{block}–{allow}</span></div>
                  <div className="flex flex-col items-end"><span className="font-semibold" style={{ color: "var(--color-danger)" }}>BLOCK</span><span className="text-[var(--color-text-dim)]">&lt; {block}</span></div>
                </div>
              </div>

              <div>
                <div className="label-caps text-[var(--color-text-dim)] mb-3">Signal weights</div>
                <div className="grid grid-cols-3 gap-3">
                  <WeightField label="Device fingerprint" value={wDevice} setValue={setWDevice} />
                  <WeightField label="Behavioral biometrics" value={wBehavior} setValue={setWBehavior} />
                  <WeightField label="Network & context" value={wNetwork} setValue={setWNetwork} />
                </div>
                <div className="text-[12px] font-mono text-[var(--color-text-dim)] mt-3">
                  Sum: {(wDevice + wBehavior + wNetwork).toFixed(2)}
                  {Math.abs(1 - (wDevice + wBehavior + wNetwork)) > 0.01 && <span style={{ color: "var(--color-danger)" }}> (weights must sum to 1.00)</span>}
                </div>
              </div>

              <button onClick={saveThresholds} disabled={saving} className="btn-primary w-full h-9">
                {saving ? "Deploying configuration…" : saved ? "Configuration deployed" : "Save & deploy configuration"}
              </button>
            </div>
          )}

          {!isCustomer && tab === 1 && (
            <div className="space-y-6">
              <h3 className="text-[17px] font-semibold text-[var(--color-text-main)]">Notification rules</h3>
              <div className="space-y-2">
                {[
                  { k: "blockEmail", l: "Email admin on every BLOCK decision" },
                  { k: "otpSms", l: "Send SMS to customer on OTP step-up" },
                  { k: "highRiskWebhook", l: "Trigger SIEM webhook on high-risk anomaly" },
                  { k: "dailyReport", l: "Generate daily summary report for compliance" },
                ].map(t => (
                  <div key={t.k} className="flex items-center justify-between p-3.5 rounded-md border border-[var(--color-border-default)]">
                    <div className="text-[13px] text-[var(--color-text-main)] pr-4">{t.l}</div>
                    <Toggle on={(toggles as any)[t.k]} onChange={() => setToggles(s => ({ ...s, [t.k]: !(s as any)[t.k] }))} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isCustomer && tab === 2 && (
            <div className="h-full flex flex-col">
              <h3 className="text-[17px] font-semibold text-[var(--color-text-main)] mb-4">System audit log</h3>
              <div className="flex-1 space-y-2 max-h-[440px] overflow-y-auto">
                {auditEntries.length === 0 && <div className="py-16 text-center text-[13px] text-[var(--color-text-dim)] border border-dashed border-[var(--color-border-default)] rounded-md">No audit log entries present.</div>}
                {auditEntries.map((entry, i) => (
                  <div key={entry.id || i} className="p-3.5 rounded-md border border-[var(--color-border-default)] flex items-center gap-4">
                    <div className="font-mono text-[11px] text-[var(--color-text-dim)] shrink-0">{new Date(entry.created_at).toLocaleString("en-GB", { hour12: false })}</div>
                    <div className="font-mono text-[11.5px] font-medium shrink-0 w-1/4 truncate" style={{ color: "var(--color-accent-brand)" }}>{entry.event_type}</div>
                    <div className="text-[12.5px] text-[var(--color-text-sub)] truncate">{entry.description || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isCustomer && tab === 3 && (
            <div className="space-y-5">
              <h3 className="text-[17px] font-semibold text-[var(--color-text-main)]">API configuration</h3>
              <div className="p-5 rounded-md border border-[var(--color-border-default)]">
                <div className="label-caps text-[var(--color-text-dim)] mb-3">REST endpoints</div>
                <div className="space-y-1.5">
                  {[
                    { m: "POST", p: "/api/auth/login" }, { m: "POST", p: "/api/auth/verify-otp" },
                    { m: "GET", p: "/api/score/:session_id" }, { m: "GET", p: "/api/sessions" },
                    { m: "GET", p: "/api/graph/nodes" }, { m: "GET", p: "/api/stats/overview" },
                    { m: "GET", p: "/api/config/thresholds" }, { m: "PUT", p: "/api/config/thresholds" },
                  ].map(e => (
                    <div key={e.m + e.p} className="flex items-center gap-3 px-3 py-2 rounded-md bg-[var(--color-surface-sunken)] font-mono text-[12.5px]">
                      <span className={`chip ${e.m === "GET" ? "chip-info" : e.m === "PUT" ? "chip-warning" : "chip-success"}`} style={{ minWidth: 44, justifyContent: "center" }}>{e.m}</span>
                      <span className="text-[var(--color-text-sub)]">{e.p}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 p-3.5 rounded-md border border-[var(--color-border-default)]">
                  <div className="label-caps text-[var(--color-text-dim)] mb-1.5">Active target backend URL</div>
                  <div className="font-mono text-[14px] font-medium" style={{ color: "var(--color-success)" }}>{API_BASE}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isFreezeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsFreezeModalOpen(false)} />
          <div className="surface-card elevated relative max-w-md w-full p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
                <AlertTriangle size={18} strokeWidth={2} style={{ color: "var(--color-danger)" }} />
              </div>
              <div>
                <h4 className="text-[15px] font-semibold text-[var(--color-text-main)]">Emergency lockout</h4>
                <p className="text-[11.5px] text-[var(--color-danger)]">Confirm account freeze</p>
              </div>
            </div>

            {freezeError && <div className="text-[13px] text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-md px-3 py-2">{freezeError}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Reason for freeze</label>
                <select value={freezeReasonSelect} onChange={e => setFreezeReasonSelect(e.target.value)} className="input-field w-full">
                  <option value="Suspected unauthorized access">Suspected unauthorized access</option>
                  <option value="Lost device">Lost device</option>
                  <option value="Suspicious activity">Suspicious activity</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Additional details (optional)</label>
                <textarea value={freezeDetail} onChange={e => setFreezeDetail(e.target.value)} placeholder="Provide any context for the security analyst…" rows={3} className="input-field w-full resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button type="button" onClick={() => setIsFreezeModalOpen(false)} className="btn-secondary h-9 px-4">Cancel</button>
              <button
                type="button" disabled={freezing}
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
                className="h-9 px-4 rounded-md text-[13px] font-medium text-white transition-colors duration-100" style={{ background: "var(--color-danger)" }}
              >
                {freezing ? "Freezing…" : "Confirm account freeze"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SliderField({ label, value, setValue, tone }: { label: string; value: number; setValue: (n: number) => void; tone: "success" | "danger" }) {
  return (
    <div>
      <div className="flex justify-between mb-2 items-end">
        <div className="label-caps text-[var(--color-text-dim)]">{label}</div>
        <div className="font-mono text-[22px] font-semibold" style={{ color: `var(--color-${tone})` }}>{value}</div>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={e => setValue(+e.target.value)}
        className="w-full accent-[var(--color-accent-brand)]" />
    </div>
  );
}

function WeightField({ label, value, setValue }: { label: string; value: number; setValue: (n: number) => void }) {
  return (
    <div className="p-4 rounded-md border border-[var(--color-border-default)]">
      <div className="label-caps text-[var(--color-text-dim)] mb-2 h-8">{label}</div>
      <div className="font-mono text-[19px] font-semibold text-[var(--color-text-main)] mb-2.5">{value.toFixed(2)}</div>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={e => setValue(+e.target.value / 100)}
        className="w-full accent-[var(--color-accent-brand)]" />
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={onChange}
      className="w-10 h-[22px] rounded-full transition-colors duration-150 relative"
      style={{ background: on ? "var(--color-accent-brand)" : "var(--color-border-strong)" }}>
      <span className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all duration-150" style={{ left: on ? 20 : 3 }} />
    </button>
  );
}
