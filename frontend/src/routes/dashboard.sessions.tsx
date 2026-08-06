import { createFileRoute } from "@tanstack/react-router";
import { Fragment as FragmentRow, useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { MiniTrustRing } from "@/components/TrustRing";
import { useAuth } from "@/contexts/AuthContext";
import { Search, ChevronRight, AlertTriangle, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/dashboard/sessions")({
  head: () => ({ meta: [{ title: "Sessions · TrustSphere" }] }),
  component: SessionsPage,
});

const API_BASE = "http://localhost:8001";

type Row = {
  id: string; user: string; customerId: string; t: string; device: string; ip: string;
  loc: string; score: number; action: "ALLOW" | "OTP" | "BLOCK";
  fp: string; typing: number; mouse: number;
};

const RISK_TABS = [["all", "All"], ["low", "Low"], ["med", "Medium"], ["high", "High"], ["recovery", "Recovery"]] as const;

function SessionsPage() {
  const { role } = useAuth();
  const isCustomer = role === "customer";

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [risk, setRisk] = useState<"all" | "low" | "med" | "high" | "recovery">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (risk === "low") params.set("risk_level", "LOW");
    if (risk === "med") params.set("risk_level", "MEDIUM");
    if (risk === "high") params.set("risk_level", "HIGH");
    if (risk === "recovery") params.set("auth_action", "RECOVERY_");
    if (q) params.set("search", q);

    apiFetch(`${API_BASE}/api/sessions?${params}`)
      .then(r => r.json())
      .then(data => {
        setRows((data.sessions || []).map((s: any) => ({
          id: s.session_id,
          user: s.user_name || "Unknown",
          customerId: s.customer_id || "",
          t: s.timestamp ? new Date(s.timestamp).toLocaleString("en-GB", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "",
          device: "", ip: s.ip_address || "", loc: s.location || "", score: s.trust_score || 0,
          action: s.auth_action || "ALLOW", fp: "", typing: 0, mouse: 0,
        })));
        setTotal(data.total || 0);
        setPages(data.pages || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, risk, q]);

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setQ(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [detail, setDetail] = useState<any>(null);
  useEffect(() => {
    if (!expanded) { setDetail(null); return; }
    apiFetch(`${API_BASE}/api/sessions/${expanded}`).then(r => r.json()).then(setDetail).catch(() => {});
  }, [expanded]);

  const actionChip = (action: string) => {
    const isAllow = action === "ALLOW" || action === "RECOVERY_ALLOW";
    const isOTP = action === "OTP" || action === "RECOVERY_STEP_UP";
    return isAllow ? "chip-success" : isOTP ? "chip-warning" : "chip-danger";
  };

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">
          {isCustomer ? "My sessions" : "Session inspector"}
        </h1>
        <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1">
          {isCustomer ? "Review your recent login activity and security events." : "Drill into every authentication event across the bank."}
        </p>
      </div>

      <div className="surface-card">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-default)]">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={15} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder={isCustomer ? "Search IP, session ID…" : "Search user, IP, session ID…"}
              className="input-field w-full pl-9"
            />
          </div>
          <div className="flex gap-1">
            {RISK_TABS.map(([k, l]) => (
              <button key={k} onClick={() => { setRisk(k as any); setPage(1); }}
                className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors duration-100 ${risk === k ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-brand)]" : "text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sunken)]"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[340px]">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <span className="text-[13px] text-[var(--color-text-dim)]">Loading sessions…</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-24 text-center text-[13px] text-[var(--color-text-dim)]">No sessions match the current criteria.</div>
          ) : (
            rows.map((r) => {
              const isExpanded = expanded === r.id;
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
                      <div className="font-mono text-[11px] text-[var(--color-text-dim)] truncate">{r.id}</div>
                      {!isCustomer && <div className="text-[13.5px] font-medium text-[var(--color-text-main)] truncate">{r.user}</div>}
                    </div>

                    <div className="flex-[1.6] hidden md:block">
                      <div className="font-mono text-[12px] text-[var(--color-text-sub)]">{r.t}</div>
                    </div>

                    <div className="flex-[1.6] hidden lg:block min-w-0">
                      <div className="text-[12.5px] text-[var(--color-text-main)] truncate">{r.loc} <span className="font-mono text-[11px] text-[var(--color-text-dim)]">{r.ip}</span></div>
                    </div>

                    <MiniTrustRing score={r.score} />

                    <div className="w-24 flex justify-end">
                      <span className={`chip ${actionChip(r.action)}`}>{r.action}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 py-5 border-b border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
                      <div className="grid md:grid-cols-4 gap-4">
                        {!isCustomer && <Detail k="Customer ID" v={r.customerId || "—"} mono />}
                        <Detail k="Device fingerprint" v={detail?.event?.device_hash || "—"} mono />
                        <Detail k="Typing speed" v={detail?.event?.typing_speed_wpm ? `${detail.event.typing_speed_wpm} WPM` : "—"} mono />
                        <Detail k="Mouse speed" v={detail?.event?.mouse_speed_avg ? `${Math.round(detail.event.mouse_speed_avg)} px/s` : "—"} mono />
                      </div>

                      <div className="grid md:grid-cols-4 gap-4 mt-4 p-4 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface)]">
                        <Detail k="Device score" v={detail?.event?.device_score ?? "—"} mono />
                        <Detail k="Behavior score" v={detail?.event?.behavior_score ?? "—"} mono />
                        <Detail k="Network score" v={detail?.event?.network_score ?? "—"} mono />
                        <Detail k="Overall trust" v={`${r.score} / 100`} mono accent />
                      </div>

                      {detail?.event?.flags?.length > 0 && (
                        <div className="mt-4">
                          <div className="label-caps text-[var(--color-text-dim)] mb-2">Risk flags</div>
                          <div className="flex flex-wrap gap-1.5">
                            {detail.event.flags.map((flag: string, idx: number) => (
                              <span key={idx} className="chip chip-danger">{flag}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {detail?.event?.metadata?.xai_explanations?.length > 0 && (
                        <div className="mt-4 p-4 rounded-md" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <AlertTriangle size={13} strokeWidth={2} style={{ color: "var(--color-danger)" }} />
                            <span className="label-caps" style={{ color: "var(--color-danger)" }}>Explainable AI reasons</span>
                          </div>
                          <ul className="space-y-1.5 text-[12.5px] font-mono" style={{ color: "var(--color-danger)" }}>
                            {detail.event.metadata.xai_explanations.map((exp: string, idx: number) => (
                              <li key={idx} className="flex gap-2"><span className="opacity-60">[{idx + 1}]</span> {exp}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mt-5">
                        <div className="label-caps text-[var(--color-text-dim)] mb-3">Decision timeline</div>
                        <div className="flex items-center">
                          {["Fingerprint", "Behavior", "Network", "Score", "Decision"].map((s, i, arr) => (
                            <div key={s} className="flex items-center flex-1">
                              <div className="flex flex-col items-center gap-2 w-full">
                                <div className="flex items-center w-full relative">
                                  {i > 0 && <div className="absolute left-0 w-1/2 h-px bg-[var(--color-border-strong)] -translate-x-full" />}
                                  <div className="w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-accent-brand)] flex items-center justify-center text-[10.5px] font-mono font-semibold z-10 mx-auto" style={{ color: "var(--color-accent-brand)" }}>
                                    {i + 1}
                                  </div>
                                  {i < arr.length - 1 && <div className="absolute right-0 w-1/2 h-px bg-[var(--color-border-strong)] translate-x-full" />}
                                </div>
                                <div className="text-[10.5px] font-medium text-[var(--color-text-sub)]">{s}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
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
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary h-7 px-2 disabled:opacity-40" aria-label="Previous page">
              <ChevronLeft size={13} />
            </button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`h-7 w-7 rounded-md text-[12px] font-medium transition-colors duration-100 ${page === p ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-brand)]" : "text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sunken)]"}`}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(pages || 1, p + 1))} disabled={page >= (pages || 1)} className="btn-secondary h-7 px-2 disabled:opacity-40" aria-label="Next page">
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ k, v, mono, accent }: { k: string; v: React.ReactNode; mono?: boolean; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="label-caps text-[var(--color-text-dim)] mb-1 truncate">{k}</div>
      <div
        className={`truncate ${mono ? "font-mono text-[13px]" : "text-[13.5px]"} ${accent ? "font-semibold text-[16px]" : "font-medium"}`}
        style={{ color: accent ? "var(--color-accent-brand)" : "var(--color-text-main)" }}
        title={typeof v === "string" ? v : undefined}
      >
        {v}
      </div>
    </div>
  );
}
