import { createFileRoute } from "@tanstack/react-router";
import { Fragment as FragmentRow, useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { MiniTrustRing } from "@/components/TrustRing";
import { ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/onboarding")({
  head: () => ({ meta: [{ title: "Onboarding review · TrustSphere" }] }),
  component: OnboardingPage,
});

const API_BASE = "http://localhost:8001";

type OnboardingRow = {
  id: string; name: string; email: string; phone: string; aadhaar_number: string; pan_number: string;
  device_hash: string; risk_score: number; decision: "ALLOW" | "MANUAL_REVIEW" | "REJECT";
  reason_codes: string[]; timestamp: string;
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
      .catch(() => setLoading(false));
  }, [page]);

  const decisionChip = (d: string) => d === "ALLOW" ? "chip-success" : d === "MANUAL_REVIEW" ? "chip-warning" : "chip-danger";

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">Onboarding review</h1>
        <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1">Evaluate pending KYC applications and automated bot-rejection signals for new accounts.</p>
      </div>

      <div className="surface-card">
        <div className="min-h-[340px]">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <span className="text-[13px] text-[var(--color-text-dim)]">Loading applications…</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-24 text-center text-[13px] text-[var(--color-text-dim)]">No onboarding attempts found.</div>
          ) : (
            rows.map((r) => {
              const isExpanded = expanded === r.id;
              const isReview = r.decision === "MANUAL_REVIEW";
              return (
                <FragmentRow key={r.id}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : r.id)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") setExpanded(isExpanded ? null : r.id); }}
                    className={`px-5 py-3.5 border-b border-[var(--color-border-default)] flex items-center gap-4 cursor-pointer transition-colors duration-100 ${isExpanded ? "bg-[var(--color-surface-sunken)]" : "hover:bg-[var(--color-surface-sunken)]"}`}
                  >
                    <ChevronRight size={14} strokeWidth={2} className={`shrink-0 text-[var(--color-text-dim)] transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />

                    <div className="flex-[1.4] min-w-0">
                      <div className="font-mono text-[11px] text-[var(--color-text-dim)] truncate">{r.id.substring(0, 8)}…</div>
                      <div className="text-[13.5px] font-medium text-[var(--color-text-main)] truncate">{r.name}</div>
                    </div>

                    <div className="flex-[1.8] hidden md:block min-w-0">
                      <div className="text-[12.5px] text-[var(--color-text-sub)] truncate">{r.email}</div>
                    </div>

                    <MiniTrustRing score={r.risk_score} />

                    <div className="w-32 flex justify-end">
                      <span className={`chip ${decisionChip(r.decision)}`}>{r.decision.replace("_", " ")}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 py-5 border-b border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
                      <div className="grid md:grid-cols-4 gap-4">
                        <Detail k="Phone number" v={r.phone} mono />
                        <Detail k="Aadhaar number" v={r.aadhaar_number} mono />
                        <Detail k="PAN number" v={r.pan_number} mono />
                        <Detail k="Device fingerprint" v={r.device_hash.substring(0, 16) + "…"} mono />
                        <Detail k="Timestamp" v={new Date(r.timestamp).toLocaleString()} mono />
                      </div>

                      {r.reason_codes.length > 0 ? (
                        <div className="mt-4 p-4 rounded-md" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <AlertTriangle size={13} strokeWidth={2} style={{ color: "var(--color-danger)" }} />
                            <span className="label-caps" style={{ color: "var(--color-danger)" }}>Engine risk factors</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {r.reason_codes.map((code, idx) => <span key={idx} className="chip chip-danger">{code}</span>)}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 p-4 rounded-md flex items-center gap-3" style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)" }}>
                          <CheckCircle2 size={18} strokeWidth={2} style={{ color: "var(--color-success)" }} />
                          <div className="text-[13px]" style={{ color: "var(--color-success)" }}>Clean application. No risk signals detected.</div>
                        </div>
                      )}

                      {isReview && (
                        <div className="mt-4 flex gap-2.5 border-t border-[var(--color-border-default)] pt-4">
                          <button className="flex-1 h-9 rounded-md text-[13px] font-medium transition-colors duration-100" style={{ background: "var(--color-success-bg)", color: "var(--color-success)", border: "1px solid var(--color-success-border)" }}>
                            Approve application
                          </button>
                          <button className="flex-1 h-9 rounded-md text-[13px] font-medium transition-colors duration-100" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger-border)" }}>
                            Reject application
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </FragmentRow>
              );
            })
          )}
        </div>

        <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-[12px] font-mono text-[var(--color-text-sub)]">
          <span>Page {page} of {pages || 1} · {total} total records</span>
          <div className="flex gap-1.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary h-7 px-2 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={13} /></button>
            <button onClick={() => setPage(p => Math.min(pages || 1, p + 1))} disabled={page >= (pages || 1)} className="btn-secondary h-7 px-2 disabled:opacity-40" aria-label="Next page"><ChevronRight size={13} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="p-3 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface)]">
      <div className="label-caps text-[var(--color-text-dim)] mb-1">{k}</div>
      <div className={`${mono ? "font-mono text-[12.5px] text-[var(--color-text-sub)]" : "text-[13.5px] text-[var(--color-text-main)] font-medium"}`}>{v}</div>
    </div>
  );
}
