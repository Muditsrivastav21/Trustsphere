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
    <div className="space-y-10 pb-12 animate-fade-in-up relative z-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-20">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-1 bg-[var(--color-danger)] rounded-full shadow-[0_0_10px_var(--color-danger)]"></div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-danger)] font-bold">PrivGuard Engine</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--color-text-main)] drop-shadow-md">
            Insider Threat Detection
          </h1>
          <p className="text-[var(--color-text-sub)] mt-3 text-sm max-w-xl leading-relaxed">
            Detect anomalous analyst and admin behavior through statistical baselining and continuous telemetry analysis.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6 flex flex-col">
          {/* Stats Bar */}
          <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-danger)]/20 rounded-[28px] p-6 shadow-[0_8px_32px_rgba(232,56,79,0.1)] relative overflow-hidden flex items-center justify-between group">
            <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-[var(--color-danger)]/10 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="relative z-10">
              <div className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-[0.2em] font-bold mb-1">Flagged Actions</div>
              <div className="text-5xl font-extrabold tracking-tight text-[var(--color-text-main)] drop-shadow-md">{total}</div>
            </div>
            
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-[1.2rem] bg-gradient-to-br from-[var(--color-danger)]/20 to-transparent flex items-center justify-center border border-[var(--color-danger)]/40 shadow-[0_0_20px_rgba(232,56,79,0.3)] group-hover:scale-110 transition-transform duration-500">
                <svg className="w-8 h-8 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
          </div>

          {/* List */}
          <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-glass-border)] rounded-[32px] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden flex-1 min-h-[400px]">
            <div className="px-5 py-4 border-b border-[var(--color-glass-border)] flex items-center justify-between mb-4 relative z-10">
              <div className="text-sm font-bold text-[var(--color-text-main)] uppercase tracking-wider">Threat Ledger</div>
              <div className="font-mono text-[10px] text-[var(--color-text-dim)] tracking-[0.1em]">{anomalies.length} ALERTS STREAMED</div>
            </div>

            <div className="space-y-4 px-3 pb-4 relative z-10">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-6">
                  <div className="w-10 h-10 border-4 border-[var(--color-danger)] border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(232,56,79,0.3)]"></div>
                  <span className="text-xs font-mono tracking-[0.2em] uppercase text-[var(--color-danger)] font-bold">Analyzing analyst baselines...</span>
                </div>
              ) : anomalies.length === 0 ? (
                <div className="py-24 text-center border border-dashed border-[var(--color-glass-border)] rounded-[20px] bg-[var(--color-glass-bg)] flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center border border-[var(--color-success)]/20 mb-6 shadow-[0_0_30px_rgba(0,196,140,0.15)]">
                    <svg className="w-10 h-10 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="text-lg font-bold text-[var(--color-text-main)] tracking-wide mb-2">No Insider Threats Detected</div>
                  <div className="text-sm text-[var(--color-text-sub)]">Analyst behavior is within normal statistical baselines.</div>
                </div>
              ) : (
                anomalies.map((a, i) => (
                  <div key={a.id} className={`relative overflow-hidden p-6 rounded-[20px] bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] hover:border-[var(--color-danger)]/40 hover:bg-[var(--color-glass-hover)] transition-all duration-300 group ${i < 10 ? "animate-fade-in-up" : ""}`} style={{ animationDelay: `${i * 0.05}s` }}>
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[var(--color-danger)] opacity-80 group-hover:opacity-100 shadow-[0_0_15px_var(--color-danger)] transition-opacity"></div>
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pl-3">
                      <div className="flex-[2] min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-1 bg-[var(--color-panel-bg)] rounded-lg border border-[var(--color-glass-border)] text-[var(--color-text-sub)]">
                            UID: {a.metadata?.actor_id?.slice(0, 8) || "UNKNOWN"}
                          </span>
                          <span className="font-mono text-[10px] text-[var(--color-text-dim)] tracking-[0.1em]">{new Date(a.created_at).toLocaleString()}</span>
                        </div>
                        <div className="font-bold text-[var(--color-text-main)] text-lg tracking-wide truncate">{a.metadata?.original_event || "UNKNOWN_EVENT"}</div>
                      </div>

                      <div className="flex-[1.5] flex flex-col justify-center">
                        <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] mb-2 font-bold flex items-center justify-between">
                          Anomaly Score
                          <span className={`font-mono font-bold ${a.metadata?.anomaly_score >= 70 ? 'text-[var(--color-danger)]' : 'text-[var(--color-warning)]'}`}>{a.metadata?.anomaly_score || 0}</span>
                        </div>
                        <div className="w-full h-2 bg-[var(--color-glass-bg)] rounded-full overflow-hidden border border-[var(--color-glass-border)] relative">
                          <div 
                            className={`absolute left-0 top-0 bottom-0 rounded-full transition-all duration-1000 ${a.metadata?.anomaly_score >= 70 ? "bg-[var(--color-danger)] shadow-[0_0_10px_var(--color-danger)]" : "bg-[var(--color-warning)] shadow-[0_0_10px_rgba(245,166,35,1)]"}`} 
                            style={{ width: `${Math.max(5, a.metadata?.anomaly_score || 0)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex-[1] flex flex-wrap justify-end gap-2 pr-2">
                        {(a.metadata?.reason_codes || []).map((rc) => (
                          <span key={rc} className="text-[10px] font-mono px-3 py-1.5 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-xl border border-[var(--color-danger)]/20 shadow-[0_0_10px_rgba(232,56,79,0.1)] font-bold">
                            {rc}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6 h-fit sticky top-6">
          <div className="bg-[var(--color-panel-bg)] backdrop-blur-2xl border border-[var(--color-glass-border)] rounded-[32px] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] animate-fade-in relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-purple-500/10 rounded-full blur-[60px] pointer-events-none -translate-y-1/2 translate-x-1/2 group-hover:bg-purple-500/20 transition-colors duration-1000"></div>
            
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--color-text-dim)] mb-8 flex items-center gap-3">
              <svg className="w-5 h-5 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Engine Status
            </h3>
            
            <div className="space-y-5">
              <div className="bg-[var(--color-glass-bg)] p-4 rounded-2xl border border-[var(--color-glass-border)] flex items-center justify-between group-hover:bg-[var(--color-glass-hover)] transition-colors">
                <span className="text-xs font-bold tracking-wide text-[var(--color-text-sub)]">Statistical Baselining</span>
                <div className="relative flex items-center justify-center w-4 h-4">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-[var(--color-success)] opacity-30 animate-ping"></span>
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]"></span>
                </div>
              </div>
              <div className="bg-[var(--color-glass-bg)] p-4 rounded-2xl border border-[var(--color-glass-border)] flex items-center justify-between group-hover:bg-[var(--color-glass-hover)] transition-colors">
                <span className="text-xs font-bold tracking-wide text-[var(--color-text-sub)]">Time-of-Day Modeling</span>
                <div className="relative flex items-center justify-center w-4 h-4">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-[var(--color-success)] opacity-30 animate-ping" style={{ animationDelay: '0.3s' }}></span>
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]"></span>
                </div>
              </div>
              <div className="bg-[var(--color-glass-bg)] p-4 rounded-2xl border border-[var(--color-glass-border)] flex items-center justify-between group-hover:bg-[var(--color-glass-hover)] transition-colors">
                <span className="text-xs font-bold tracking-wide text-[var(--color-text-sub)]">Velocity Tracking</span>
                <div className="relative flex items-center justify-center w-4 h-4">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-[var(--color-success)] opacity-30 animate-ping" style={{ animationDelay: '0.6s' }}></span>
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]"></span>
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-[var(--color-glass-border)] text-[12px] text-[var(--color-text-dim)] leading-relaxed font-mono">
              The PrivGuard engine continuously monitors analyst actions (such as overriding scores or updating config thresholds) against expected behavioral baselines to detect potential insider threats or compromised admin credentials.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
