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
    <div className="space-y-10 pb-12 animate-fade-in-up relative z-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-20">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-1 bg-[var(--color-bob-orange)] rounded-full"></div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-bob-orange)] font-bold">Identity Verification</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--color-text-main)] drop-shadow-md">
            Onboarding Review
          </h1>
          <p className="text-[var(--color-text-sub)] mt-3 text-sm max-w-xl leading-relaxed">
            Evaluate pending KYC applications and automated bot-rejection signals for new accounts.
          </p>
        </div>
      </div>

      <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-glass-border)] rounded-[32px] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[var(--color-bob-orange)]/5 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
        
        <div className="px-6 pb-4 pt-4 relative z-10 flex flex-col gap-4 min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-6">
              <div className="w-12 h-12 border-4 border-[var(--color-bob-orange)] border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(242,101,34,0.3)]"></div>
              <span className="text-sm font-mono tracking-[0.2em] uppercase text-[var(--color-bob-orange)] font-bold">Aggregating KYC Data...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-32 text-center text-[var(--color-text-dim)] font-mono text-sm uppercase tracking-widest border border-dashed border-[var(--color-glass-border)] rounded-[24px] bg-[var(--color-glass-bg)]">
              No pending onboarding attempts found.
            </div>
          ) : (
            rows.map((r, i) => {
              const isAllow = r.decision === "ALLOW";
              const isReview = r.decision === "MANUAL_REVIEW";
              const isExpanded = expanded === r.id;
              
              return (
                <FragmentRow key={r.id}>
                  <div 
                    onClick={() => setExpanded(isExpanded ? null : r.id)}
                    className={`relative overflow-hidden py-5 px-8 rounded-[24px] bg-[var(--color-glass-bg)] border ${isExpanded ? 'border-[var(--color-bob-orange)]/40 bg-[var(--color-glass-hover)]' : 'border-[var(--color-glass-border)] hover:border-[var(--color-text-dim)] hover:bg-[var(--color-glass-hover)]'} transition-all duration-300 group cursor-pointer flex items-center gap-6 hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] ${i < 10 ? "animate-fade-in-up" : ""}`}
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    {/* Hover Glow Edge */}
                    <div className={`absolute left-0 top-5 bottom-5 w-1.5 rounded-r-lg transition-all duration-300 ${isExpanded ? 'h-[70%] opacity-100' : 'group-hover:h-[60%] opacity-0 group-hover:opacity-100'} ${isAllow ? 'bg-[var(--color-success)] shadow-[0_0_15px_var(--color-success)]' : isReview ? 'bg-[var(--color-warning)] shadow-[0_0_15px_var(--color-warning)]' : 'bg-[var(--color-danger)] shadow-[0_0_15px_var(--color-danger)]'}`}></div>
                    
                    {/* ID & User */}
                    <div className="flex-[1.5] pl-2 min-w-0">
                      <div className="font-mono text-[11px] text-[var(--color-text-dim)] tracking-[0.1em] mb-1 truncate">ID: {r.id.substring(0,8)}...</div>
                      <div className="font-bold text-[var(--color-text-main)] text-[16px] group-hover:text-[var(--color-bob-orange)] transition-colors truncate">{r.name}</div>
                    </div>

                    {/* Metadata */}
                    <div className="flex-[2] hidden md:flex items-center gap-6">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] font-bold mb-1">Email</div>
                        <div className="text-sm text-[var(--color-text-main)] truncate">{r.email}</div>
                      </div>
                    </div>

                    {/* Trust Score */}
                    <div className="flex items-center gap-4 pl-6 border-l border-[var(--color-glass-border)]">
                      <div className="scale-[1.2] filter drop-shadow-md"><MiniTrustRing score={r.risk_score}/></div>
                    </div>

                    {/* Action Badge */}
                    <div className="flex-[1] flex justify-end pr-4">
                      <span className={`px-4 py-2 text-[10px] font-mono tracking-widest rounded-xl uppercase font-bold shadow-md border ${isAllow ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20 shadow-[0_0_10px_rgba(0,196,140,0.1)]' : isReview ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20 shadow-[0_0_10px_rgba(245,166,35,0.1)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20 shadow-[0_0_10px_rgba(232,56,79,0.1)]'}`}>
                        {r.decision}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Detail View */}
                  {isExpanded && (
                    <div className="relative mx-4 -mt-2 mb-4 p-8 bg-[var(--color-page-bg)] backdrop-blur-xl border border-[var(--color-bob-orange)]/20 rounded-b-[24px] rounded-t-lg shadow-[inset_0_10px_20px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_10px_20px_rgba(0,0,0,0.5)] animate-fade-in z-0">
                      <div className="grid md:grid-cols-4 gap-6 relative z-10">
                        <Detail k="Phone Number" v={r.phone} mono/>
                        <Detail k="National ID" v={r.id_number} mono/>
                        <Detail k="Device Fingerprint" v={r.device_hash.substring(0,16) + '...'} mono/>
                        <Detail k="Timestamp" v={new Date(r.timestamp).toLocaleString()} mono/>

                        {r.reason_codes.length > 0 ? (
                          <div className="md:col-span-4 mt-2 bg-[var(--color-danger)]/5 border border-[var(--color-danger)]/20 p-5 rounded-2xl">
                             <div className="text-[10px] uppercase tracking-widest text-[var(--color-danger)] font-bold mb-3 flex items-center gap-2">
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                               Engine Risk Factors
                             </div>
                             <div className="flex flex-wrap gap-3">
                               {r.reason_codes.map((code: string, idx: number) => (
                                 <span key={idx} className="text-xs font-mono font-bold tracking-wide px-3 py-1.5 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-lg border border-[var(--color-danger)]/30 shadow-[0_0_10px_rgba(232,56,79,0.15)] flex items-center gap-2">
                                   <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)] animate-pulse"></div>
                                   {code}
                                 </span>
                               ))}
                             </div>
                          </div>
                        ) : (
                          <div className="md:col-span-4 mt-2 bg-[var(--color-success)]/5 border border-[var(--color-success)]/20 p-5 rounded-2xl flex items-center gap-3">
                             <div className="w-8 h-8 rounded-full bg-[var(--color-success)]/20 flex items-center justify-center">
                               <svg className="w-4 h-4 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                             </div>
                             <div>
                               <div className="text-[10px] uppercase tracking-widest text-[var(--color-success)] font-bold mb-1">Status</div>
                               <div className="text-sm font-medium text-[var(--color-success)]/90">Clean application. No risks detected by automated systems.</div>
                             </div>
                          </div>
                        )}
                        
                        {isReview && (
                          <div className="md:col-span-4 mt-4 flex gap-4 border-t border-[var(--color-glass-border)] pt-6">
                            <button className="flex-1 py-3 bg-[var(--color-success)]/20 hover:bg-[var(--color-success)]/30 border border-[var(--color-success)]/40 text-[var(--color-success)] font-bold uppercase tracking-widest text-[11px] rounded-xl transition-all shadow-[0_0_15px_rgba(0,196,140,0.1)] hover:shadow-[0_0_20px_rgba(0,196,140,0.3)]">Approve Application</button>
                            <button className="flex-1 py-3 bg-[var(--color-danger)]/20 hover:bg-[var(--color-danger)]/30 border border-[var(--color-danger)]/40 text-[var(--color-danger)] font-bold uppercase tracking-widest text-[11px] rounded-xl transition-all shadow-[0_0_15px_rgba(232,56,79,0.1)] hover:shadow-[0_0_20px_rgba(232,56,79,0.3)]">Reject Application</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </FragmentRow>
              )
            })
          )}
        </div>

        <div className="px-8 py-5 border-t border-[var(--color-glass-border)] bg-[var(--color-glass-bg)] flex flex-wrap items-center justify-between text-xs font-mono text-[var(--color-text-sub)] relative z-10">
          <span>Page {page} of {pages || 1} ({total} total records)</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-4 py-2 bg-[var(--color-glass-bg)] hover:bg-[var(--color-glass-hover)] border border-[var(--color-glass-border)] rounded-xl disabled:opacity-30 transition-colors">‹ Prev</button>
            <button onClick={() => setPage(p => Math.min(pages || 1, p + 1))} disabled={page >= (pages || 1)}
              className="px-4 py-2 bg-[var(--color-glass-bg)] hover:bg-[var(--color-glass-hover)] border border-[var(--color-glass-border)] rounded-xl disabled:opacity-30 transition-colors">Next ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="bg-[var(--color-glass-bg)] p-4 rounded-xl border border-[var(--color-glass-border)]">
      <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] font-bold mb-1">{k}</div>
      <div className={`mt-1.5 text-[15px] ${mono ? "font-mono text-[var(--color-text-sub)]" : "text-[var(--color-text-main)] font-medium"}`}>{v}</div>
    </div>
  );
}
