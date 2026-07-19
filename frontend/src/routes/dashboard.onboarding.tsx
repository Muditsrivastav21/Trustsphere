import { createFileRoute } from "@tanstack/react-router";
import { Fragment as FragmentRow, useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { DashHeader } from "@/components/Sidebar";
import { MiniTrustRing } from "@/components/TrustRing";

export const Route = createFileRoute("/dashboard/onboarding")({
  head: () => ({ meta: [{ title: "Onboarding Review · TrustSphere" }] }),
  component: OnboardingPage,
});

const API_BASE = "http://localhost:8001";

type OnboardingRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  id_number: string;
  device_hash: string;
  risk_score: number;
  decision: "ALLOW" | "MANUAL_REVIEW" | "REJECT";
  reason_codes: string[];
  timestamp: string;
};

function OnboardingPage() {
  const [rows, setRows] = useState<OnboardingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));

    apiFetch(`${API_BASE}/api/onboarding/attempts?${params}`)
      .then(r => r.json())
      .then(data => {
        setRows(data.attempts || []);
        setTotal(data.total || 0);
        setPages(data.pages || 0);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [page]);

  return (
    <div>
      <DashHeader title="Onboarding Review" subtitle="Review KYC applications and automated bot-rejection signals." />

      <div className="surface-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="text-[var(--color-text-muted)] bg-[var(--color-navy)]">
            <tr className="label-caps text-left">
              <th className="px-4 py-3 font-medium">Attempt ID</th>
              <th className="px-4 py-3 font-medium">Applicant</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium text-center">Score</th>
              <th className="px-4 py-3 font-medium text-right">Decision</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-[var(--color-text-muted)] text-sm">Loading attempts…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-[var(--color-text-muted)] text-sm">No onboarding attempts found.</td></tr>
            )}
            {!loading && rows.map(r => (
              <FragmentRow key={r.id}>
                <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="border-t border-[var(--color-navy-border)] hover:bg-[var(--color-bob-orange-muted)] cursor-pointer transition">
                  <td className="px-4 py-3 font-mono text-[11px] text-[var(--color-text-secondary)]">{r.id.substring(0,8)}...</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{r.email}</td>
                  <td className="px-4 py-3"><div className="flex justify-center"><MiniTrustRing score={r.risk_score}/></div></td>
                  <td className="px-4 py-3 text-right">
                    <span className={`chip ${r.decision === "ALLOW" ? "chip-success" : r.decision === "MANUAL_REVIEW" ? "chip-warning" : "chip-danger"}`}>{r.decision}</span>
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr className="bg-[var(--color-navy)] border-t border-[var(--color-navy-border)]">
                    <td colSpan={5} className="px-6 py-5">
                      <div className="grid md:grid-cols-4 gap-4 animate-fade-in">
                        <Detail k="Phone" v={r.phone} mono/>
                        <Detail k="ID Number" v={r.id_number} mono/>
                        <Detail k="Device Hash" v={r.device_hash} mono/>
                        <Detail k="Timestamp" v={new Date(r.timestamp).toLocaleString()} mono/>
                        
                        <div className="md:col-span-4 mt-2">
                           <div className="label-caps text-[var(--color-text-muted)] mb-2">Engine Reason Codes</div>
                           {r.reason_codes.length > 0 ? (
                             <div className="flex flex-wrap gap-2">
                               {r.reason_codes.map((code: string, idx: number) => (
                                 <span key={idx} className="px-2 py-1 bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/20 rounded font-mono text-[10px]">
                                   {code}
                                 </span>
                               ))}
                             </div>
                           ) : (
                             <div className="text-sm text-[var(--color-text-secondary)]">Clean application. No risks detected.</div>
                           )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </FragmentRow>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-[var(--color-navy-border)] flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
          <span>Page {page} of {pages || 1} ({total} total)</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1 border border-[var(--color-navy-border)] rounded disabled:opacity-40">‹ Prev</button>
            <button onClick={() => setPage(p => Math.min(pages || 1, p + 1))} disabled={page >= (pages || 1)}
              className="px-3 py-1 border border-[var(--color-navy-border)] rounded disabled:opacity-40">Next ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="label-caps text-[var(--color-text-muted)]">{k}</div>
      <div className={`mt-1 text-sm ${mono ? "font-mono text-[11px]" : ""}`}>{v}</div>
    </div>
  );
}
