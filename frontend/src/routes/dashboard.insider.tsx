import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { DashHeader } from "@/components/Sidebar";

export const Route = createFileRoute("/dashboard/insider")({
  head: () => ({ meta: [{ title: "Insider Threat · TrustSphere" }] }),
  component: InsiderPage,
});

const API_BASE = "http://localhost:8001";

type Anomaly = {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
  metadata: {
    actor_id: string;
    original_event: string;
    anomaly_score: number;
    reason_codes: string[];
  };
};

function InsiderPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    apiFetch(`${API_BASE}/api/insider/anomalies`)
      .then((res) => res.json())
      .then((data) => {
        setAnomalies(data.anomalies || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <DashHeader 
        title="PrivGuard Insider Threat" 
        subtitle="Detect anomalous analyst and admin behavior through statistical baselining." 
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="surface-card p-4 flex items-center justify-between">
            <div>
              <div className="text-xl font-bold tracking-tight text-white">{total}</div>
              <div className="text-xs text-[var(--color-text-muted)] label-caps mt-1">Flagged Actions</div>
            </div>
            <div className="w-12 h-12 rounded-full bg-[var(--color-danger)]/20 flex items-center justify-center border border-[var(--color-danger)]/50 shadow-[0_0_15px_rgba(232,56,79,0.3)]">
              <svg className="w-6 h-6 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>

          <div className="surface-card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-navy)] text-[var(--color-text-muted)]">
                <tr className="label-caps">
                  <th className="px-5 py-4 font-medium">Timestamp</th>
                  <th className="px-5 py-4 font-medium">Actor UID</th>
                  <th className="px-5 py-4 font-medium">Original Event</th>
                  <th className="px-5 py-4 font-medium">Risk Score</th>
                  <th className="px-5 py-4 font-medium text-right">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-navy-border)]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-[var(--color-text-muted)]">
                      Analyzing behavior patterns...
                    </td>
                  </tr>
                ) : anomalies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-[var(--color-text-muted)] animate-fade-in">
                      <div className="text-3xl mb-3">🛡️</div>
                      <div className="text-sm">No insider threats detected.</div>
                      <div className="text-xs mt-1 opacity-70">Analyst behavior is within normal baselines.</div>
                    </td>
                  </tr>
                ) : (
                  anomalies.map((a) => (
                    <tr key={a.id} className="hover:bg-[var(--color-navy-mid)] transition-colors animate-fade-in-up">
                      <td className="px-5 py-4 font-mono text-[11px] text-[var(--color-text-secondary)]">
                        {new Date(a.created_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-[10px] px-2 py-1 bg-black/20 rounded border border-[var(--color-navy-border)]">
                          {a.metadata?.actor_id?.slice(0, 8) || "UNKNOWN"}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-medium text-[var(--color-text-primary)]">
                        {a.metadata?.original_event || "UNKNOWN_EVENT"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-black/30 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${a.metadata?.anomaly_score >= 70 ? "bg-[var(--color-danger)] shadow-[0_0_8px_rgba(232,56,79,0.5)]" : "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"}`} 
                              style={{ width: `${Math.max(10, a.metadata?.anomaly_score || 0)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs">{a.metadata?.anomaly_score || 0}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {(a.metadata?.reason_codes || []).map((rc) => (
                            <span key={rc} className="text-[10px] font-mono px-2 py-0.5 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded border border-[var(--color-danger)]/20">
                              {rc}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface-card p-5 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <h3 className="text-sm font-semibold text-white mb-4">PrivGuard Engine Status</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-secondary)]">Statistical Baselining</span>
                <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse shadow-[0_0_5px_rgba(40,167,69,0.6)]"></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-secondary)]">Time-of-Day Modeling</span>
                <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse shadow-[0_0_5px_rgba(40,167,69,0.6)]" style={{ animationDelay: '0.3s' }}></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-secondary)]">Velocity Tracking</span>
                <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse shadow-[0_0_5px_rgba(40,167,69,0.6)]" style={{ animationDelay: '0.6s' }}></span>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-[var(--color-navy-border)] text-[11px] text-[var(--color-text-muted)] leading-relaxed">
              The PrivGuard engine continuously monitors analyst actions (such as overriding scores or updating config thresholds) against expected behavioral baselines to detect potential insider threats or compromised admin credentials.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
