import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { DashHeader } from "@/components/Sidebar";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings · TrustSphere" }] }),
  component: SettingsPage,
});

const API_BASE = "http://localhost:8001";

const categories = ["Risk Thresholds", "Notification Rules", "Audit Log", "API Configuration"];

function SettingsPage() {
  const [tab, setTab] = useState(0);
  const [allow, setAllow] = useState(80);
  const [block, setBlock] = useState(40);
  const [wDevice, setWDevice] = useState(0.40);
  const [wBehavior, setWBehavior] = useState(0.35);
  const [wNetwork, setWNetwork] = useState(0.25);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggles, setToggles] = useState({ blockEmail: true, otpSms: true, highRiskWebhook: false, dailyReport: true });
  const [auditEntries, setAuditEntries] = useState<any[]>([]);

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

  // Load audit log when tab is active
  useEffect(() => {
    if (tab === 2) {
      apiFetch(`${API_BASE}/api/config/audit-log?page=1&limit=20`)
        .then(r => r.json())
        .then(data => setAuditEntries(data.entries || []))
        .catch(() => {});
    }
  }, [tab]);

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
    <div>
      <DashHeader title="Platform Configuration" subtitle="Tune thresholds, alerts, audit trails, and API keys." />
      <div className="grid grid-cols-[200px_1fr] gap-6">
        <nav className="flex flex-col gap-1">
          {categories.map((c, i) => (
            <button key={c} onClick={()=>setTab(i)}
              className={`text-left px-3 py-2 rounded-md text-sm transition ${tab===i ? "bg-[var(--color-bob-orange-muted)] text-[var(--color-bob-orange)] font-medium" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-navy-mid)]"}`}>
              {c}
            </button>
          ))}
        </nav>

        <div className="surface-card p-6 min-h-[400px]">
          {tab === 0 && (
            <div className="space-y-8">
              <div>
                <div className="label-caps text-[var(--color-text-muted)]">Risk Thresholds</div>
                <h3 className="text-lg font-semibold mt-1">Score cut-offs for adaptive auth</h3>
              </div>
              <SliderField label="Allow without challenge ≥" value={allow} setValue={setAllow} color="#00C48C"/>
              <SliderField label="Block outright ≤" value={block} setValue={setBlock} color="#E8384F"/>
              <div className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-navy)] rounded p-3 font-mono">
                Score &gt; {allow} → ALLOW · {block}–{allow} → OTP · &lt; {block} → BLOCK
              </div>

              <div className="border-t border-[var(--color-navy-border)] pt-6">
                <div className="label-caps text-[var(--color-text-muted)] mb-4">Scoring Weights</div>
                <div className="grid grid-cols-3 gap-4">
                  <WeightField label="Device" value={wDevice} setValue={setWDevice} color="#F26522"/>
                  <WeightField label="Behavior" value={wBehavior} setValue={setWBehavior} color="#378ADD"/>
                  <WeightField label="Network" value={wNetwork} setValue={setWNetwork} color="#A855F7"/>
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] mt-2 font-mono">
                  Sum: {(wDevice + wBehavior + wNetwork).toFixed(2)} (should be 1.00)
                </div>
              </div>

              <button onClick={saveThresholds} disabled={saving} className="btn-primary">
                {saving ? "Saving…" : saved ? "✓ Saved" : "Save Configuration"}
              </button>
            </div>
          )}

          {tab === 1 && (
            <div className="space-y-4">
              <div className="label-caps text-[var(--color-text-muted)]">Notification Rules</div>
              {[
                { k: "blockEmail", l: "Email on every BLOCK decision" },
                { k: "otpSms", l: "SMS to customer on OTP challenge" },
                { k: "highRiskWebhook", l: "Webhook to SIEM on high-risk score" },
                { k: "dailyReport", l: "Daily summary report to compliance" },
              ].map(t => (
                <div key={t.k} className="flex items-center justify-between py-3 border-b border-[var(--color-navy-border)]">
                  <div className="text-sm">{t.l}</div>
                  <Toggle on={(toggles as any)[t.k]} onChange={() => setToggles(s => ({ ...s, [t.k]: !(s as any)[t.k] }))}/>
                </div>
              ))}
            </div>
          )}

          {tab === 2 && (
            <div>
              <div className="label-caps text-[var(--color-text-muted)] mb-3">Audit Log</div>
              <div className="space-y-2 font-mono text-[11px]">
                {auditEntries.length === 0 && (
                  <div className="px-3 py-4 text-center text-[var(--color-text-muted)]">No audit log entries yet.</div>
                )}
                {auditEntries.map((entry, i) => (
                  <div key={entry.id || i} className="px-3 py-2 bg-[var(--color-navy)] rounded text-[var(--color-text-secondary)]">
                    <span className="text-[var(--color-text-muted)]">{new Date(entry.created_at).toLocaleString("en-GB", { hour12: false })}</span>
                    {" · "}
                    <span className="text-[var(--color-bob-orange)]">{entry.event_type}</span>
                    {" · "}
                    <span>{entry.description || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 3 && (
            <div>
              <div className="label-caps text-[var(--color-text-muted)]">API Configuration</div>
              <h3 className="text-lg font-semibold mt-1 mb-6">TrustSphere REST endpoints</h3>
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
                  <div key={e.m+e.p} className="flex items-center gap-3 px-4 py-2.5 bg-[var(--color-navy)] rounded font-mono text-xs">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${e.m === "GET" ? "bg-[var(--color-graph-user)]/20 text-[var(--color-graph-user)]" : e.m === "PUT" ? "bg-[var(--color-warning)]/20 text-[var(--color-warning)]" : "bg-[var(--color-bob-orange-muted)] text-[var(--color-bob-orange)]"}`}>{e.m}</span>
                    <span>{e.p}</span>
                  </div>
                ))}
                <div className="pt-4 mt-4 border-t border-[var(--color-navy-border)]">
                  <div className="label-caps text-[var(--color-text-muted)] mb-2">Backend URL</div>
                  <div className="font-mono text-xs bg-[var(--color-navy)] rounded px-3 py-2 text-[var(--color-text-secondary)]">{API_BASE}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SliderField({ label, value, setValue, color }: { label: string; value: number; setValue: (n: number) => void; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-2">
        <div className="text-sm text-[var(--color-text-secondary)]">{label}</div>
        <div className="font-mono text-sm" style={{ color }}>{value}</div>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={e=>setValue(+e.target.value)}
        className="w-full accent-[var(--color-bob-orange)]"/>
    </div>
  );
}

function WeightField({ label, value, setValue, color }: { label: string; value: number; setValue: (n: number) => void; color: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-text-secondary)] mb-1">{label}</div>
      <div className="font-mono text-lg" style={{ color }}>{value.toFixed(2)}</div>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={e=>setValue(+e.target.value / 100)}
        className="w-full accent-[var(--color-bob-orange)] mt-1"/>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className={`w-11 h-6 rounded-full transition relative ${on ? "bg-[var(--color-bob-orange)]" : "bg-[var(--color-navy-border)]"}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`}/>
    </button>
  );
}
