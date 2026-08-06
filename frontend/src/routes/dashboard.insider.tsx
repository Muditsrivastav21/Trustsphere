import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ShieldAlert, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/dashboard/insider")({
  head: () => ({ meta: [{ title: "Insider threat · TrustSphere" }] }),
  component: InsiderPage,
});

const API_BASE = "http://localhost:8001";

type Anomaly = {
  id: string; event_type: string; description: string; created_at: string;
  metadata: { actor_id: string; original_event: string; anomaly_score: number; reason_codes: string[] };
};

const ENGINE_CHECKS = ["Statistical baselining", "Time-of-day modeling", "Velocity tracking"];

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
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">Insider threat detection</h1>
        <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1">
          Detect anomalous analyst and admin behavior through statistical baselining and continuous telemetry analysis.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="surface-card p-5 flex items-center justify-between">
            <div>
              <div className="label-caps text-[var(--color-text-dim)] mb-2">Flagged actions</div>
              <div className="font-mono text-[30px] font-semibold text-[var(--color-text-main)] leading-none">{total}</div>
            </div>
            <div className="w-11 h-11 rounded-md flex items-center justify-center" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
              <ShieldAlert size={20} strokeWidth={2} style={{ color: "var(--color-danger)" }} />
            </div>
          </div>

          <div className="surface-card">
            <div className="px-5 h-12 border-b border-[var(--color-border-default)] flex items-center justify-between">
              <div className="text-[13.5px] font-medium text-[var(--color-text-main)]">Threat ledger</div>
              <div className="font-mono text-[11px] text-[var(--color-text-dim)]">{anomalies.length} alerts</div>
            </div>

            <div className="min-h-[300px]">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <span className="text-[13px] text-[var(--color-text-dim)]">Analyzing analyst baselines…</span>
                </div>
              ) : anomalies.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center justify-center">
                  <ShieldCheck size={28} strokeWidth={1.75} style={{ color: "var(--color-success)" }} className="mb-3" />
                  <div className="text-[14px] font-medium text-[var(--color-text-main)] mb-1">No insider threats detected</div>
                  <div className="text-[12.5px] text-[var(--color-text-sub)]">Analyst behavior is within normal statistical baselines.</div>
                </div>
              ) : (
                anomalies.map((a) => (
                  <div key={a.id} className="px-5 py-4 border-b border-[var(--color-border-default)] last:border-b-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-[2] min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-mono text-[11px] text-[var(--color-text-dim)] px-2 py-0.5 rounded bg-[var(--color-surface-sunken)]">
                            {a.metadata?.actor_id?.slice(0, 8) || "unknown"}
                          </span>
                          <span className="font-mono text-[11px] text-[var(--color-text-dim)]">{new Date(a.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-[13.5px] font-medium text-[var(--color-text-main)] truncate">{a.metadata?.original_event || "Unknown event"}</div>
                      </div>

                      <div className="flex-[1.3]">
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className="label-caps text-[var(--color-text-dim)]">Anomaly score</span>
                          <span className="font-mono font-semibold" style={{ color: (a.metadata?.anomaly_score ?? 0) >= 70 ? "var(--color-danger)" : "var(--color-warning)" }}>{a.metadata?.anomaly_score || 0}</span>
                        </div>
                        <div className="w-full h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(5, a.metadata?.anomaly_score || 0)}%`, background: (a.metadata?.anomaly_score ?? 0) >= 70 ? "var(--color-danger)" : "var(--color-warning)" }} />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 justify-end flex-1">
                        {(a.metadata?.reason_codes || []).map((rc) => <span key={rc} className="chip chip-danger">{rc}</span>)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 h-fit sticky top-6">
          <div className="surface-card p-6">
            <h3 className="label-caps text-[var(--color-text-dim)] mb-5">Engine status</h3>
            <div className="space-y-2">
              {ENGINE_CHECKS.map((check) => (
                <div key={check} className="flex items-center justify-between p-3 rounded-md border border-[var(--color-border-default)]">
                  <span className="text-[12.5px] font-medium text-[var(--color-text-sub)]">{check}</span>
                  <span className="status-dot" style={{ background: "var(--color-success)" }} />
                </div>
              ))}
            </div>
            <p className="mt-5 pt-4 border-t border-[var(--color-border-default)] text-[12px] text-[var(--color-text-dim)] leading-relaxed">
              The PrivGuard engine continuously monitors analyst actions — score overrides, config changes — against expected behavioral baselines to detect insider threats or compromised admin credentials.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
