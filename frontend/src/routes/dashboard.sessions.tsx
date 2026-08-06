import { createFileRoute } from "@tanstack/react-router";
import { Fragment as FragmentRow, useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { DashHeader } from "@/components/Sidebar";
import { MiniTrustRing } from "@/components/TrustRing";
import { useAuth } from "@/contexts/AuthContext";

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

function SessionsPage() {
  const { role } = useAuth();
  const isCustomer = role === "customer";

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [risk, setRisk] = useState<"all"|"low"|"med"|"high"|"recovery">("all");
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
        const sessions = (data.sessions || []).map((s: any) => ({
          id: s.session_id,
          user: s.user_name || "Unknown",
          customerId: s.customer_id || "",
          t: s.timestamp ? new Date(s.timestamp).toLocaleString("en-GB", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "",
          device: "",
          ip: s.ip_address || "",
          loc: s.location || "",
          score: s.trust_score || 0,
          action: s.auth_action || "ALLOW",
          fp: "",
          typing: 0,
          mouse: 0,
        }));
        setRows(sessions);
        setTotal(data.total || 0);
        setPages(data.pages || 0);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [page, risk, q]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setQ(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch session detail when expanded
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => {
    if (!expanded) { setDetail(null); return; }
    apiFetch(`${API_BASE}/api/sessions/${expanded}`)
      .then(r => r.json())
      .then(d => setDetail(d))
      .catch(() => {});
  }, [expanded]);

  return (
    <div className="space-y-10 pb-12 animate-fade-in-up relative z-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-20">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-1 bg-[var(--color-bob-orange)] rounded-full"></div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-bob-orange)] font-bold">Audit Log</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--color-text-main)] drop-shadow-md">
            {isCustomer ? "My Sessions" : "Session Inspector"}
          </h1>
          <p className="text-[var(--color-text-sub)] mt-3 text-sm max-w-xl leading-relaxed">
            {isCustomer ? "Review your recent login activity and security events." : "Drill into every authentication event across the bank."}
          </p>
        </div>
      </div>

      <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-glass-border)] rounded-[32px] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[var(--color-bob-orange)]/5 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
        
        <div className="px-6 py-5 flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="relative flex-1 min-w-[280px] max-w-xl">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input 
              value={searchInput} 
              onChange={e => setSearchInput(e.target.value)} 
              placeholder={isCustomer ? "Search IP, session id…" : "Search user, IP, session id…"}
              className="w-full pl-11 pr-5 py-3.5 bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-2xl text-sm font-mono focus:border-[var(--color-bob-orange)]/50 focus:bg-[var(--color-glass-hover)] outline-none text-[var(--color-text-main)] transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)] placeholder-[var(--color-text-dim)]"
            />
          </div>
          
          <div className="flex bg-[var(--color-glass-bg)] rounded-[20px] p-1.5 border border-[var(--color-glass-border)] shadow-inner">
            {([["all","All"],["low","Low"],["med","Medium"],["high","High"],["recovery","Recovery"]] as const).map(([k,l]) => (
              <button key={k} onClick={()=>{ setRisk(k as any); setPage(1); }}
                className={`px-4 py-2 text-xs rounded-[14px] font-bold tracking-wider transition-all duration-300 ${risk===k ? "bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] text-white shadow-[0_0_15px_rgba(242,101,34,0.4)]" : "text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-glass-hover)]"}`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-4 pt-2 relative z-10 flex flex-col gap-4 min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-6">
              <div className="w-12 h-12 border-4 border-[var(--color-bob-orange)] border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(242,101,34,0.3)]"></div>
              <span className="text-sm font-mono tracking-[0.2em] uppercase text-[var(--color-bob-orange)] font-bold">Streaming telemetry...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-32 text-center text-[var(--color-text-dim)] font-mono text-sm uppercase tracking-widest border border-dashed border-[var(--color-glass-border)] rounded-[24px] bg-[var(--color-glass-bg)]">
              No sessions match the current criteria.
            </div>
          ) : (
            rows.map((r, i) => {
              const isAllow = r.action === "ALLOW" || r.action === "RECOVERY_ALLOW";
              const isOTP = r.action === "OTP" || r.action === "RECOVERY_STEP_UP";
              const isExpanded = expanded === r.id;
              
              return (
                <FragmentRow key={r.id}>
                  <div 
                    onClick={() => setExpanded(isExpanded ? null : r.id)}
                    className={`relative overflow-hidden py-5 px-8 rounded-[24px] bg-[var(--color-glass-bg)] border ${isExpanded ? 'border-[var(--color-bob-orange)]/40 bg-[var(--color-glass-hover)]' : 'border-[var(--color-glass-border)] hover:border-[var(--color-text-dim)] hover:bg-[var(--color-glass-hover)]'} transition-all duration-300 group cursor-pointer flex items-center gap-6 hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] ${i < 10 ? "animate-fade-in-up" : ""}`}
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    {/* Hover Glow Edge */}
                    <div className={`absolute left-0 top-5 bottom-5 w-1.5 rounded-r-lg transition-all duration-300 ${isExpanded ? 'h-[70%] opacity-100' : 'group-hover:h-[60%] opacity-0 group-hover:opacity-100'} ${isAllow ? 'bg-[var(--color-success)] shadow-[0_0_15px_var(--color-success)]' : isOTP ? 'bg-[var(--color-warning)] shadow-[0_0_15px_var(--color-warning)]' : 'bg-[var(--color-danger)] shadow-[0_0_15px_var(--color-danger)]'}`}></div>
                    
                    {/* ID & User */}
                    <div className="flex-[1.5] pl-2 min-w-0">
                      <div className="font-mono text-[11px] text-[var(--color-text-dim)] tracking-[0.1em] mb-1 truncate">{r.id}</div>
                      {!isCustomer && <div className="font-bold text-[var(--color-text-main)] text-[16px] group-hover:text-[var(--color-bob-orange)] transition-colors truncate">{r.user}</div>}
                    </div>

                    {/* Metadata */}
                    <div className="flex-[2] hidden md:flex items-center gap-6">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] font-bold mb-1">Timestamp</div>
                        <div className="font-mono text-sm text-[var(--color-text-sub)]">{r.t}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] font-bold mb-1">Location / IP</div>
                        <div className="text-sm text-[var(--color-text-main)] truncate">{r.loc} <span className="font-mono text-[11px] text-[var(--color-text-dim)] ml-1">{r.ip}</span></div>
                      </div>
                    </div>

                    {/* Trust Score */}
                    <div className="flex items-center gap-4 pl-6 border-l border-[var(--color-glass-border)]">
                      <div className="scale-[1.2] filter drop-shadow-md"><MiniTrustRing score={r.score}/></div>
                    </div>

                    {/* Action Badge */}
                    <div className="flex-[1] flex justify-end pr-4">
                      <span className={`px-4 py-2 text-[10px] font-mono tracking-widest rounded-xl uppercase font-bold shadow-md border ${isAllow ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20 shadow-[0_0_10px_rgba(0,196,140,0.1)]' : isOTP ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20 shadow-[0_0_10px_rgba(245,166,35,0.1)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20 shadow-[0_0_10px_rgba(232,56,79,0.1)]'}`}>
                        {r.action}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Detail View */}
                  {isExpanded && (
                    <div className="relative mx-4 -mt-2 mb-4 p-8 bg-[var(--color-page-bg)] backdrop-blur-xl border border-[var(--color-bob-orange)]/20 rounded-b-[24px] rounded-t-lg shadow-[inset_0_10px_20px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_10px_20px_rgba(0,0,0,0.5)] animate-fade-in z-0">
                      <div className="grid md:grid-cols-4 gap-6 relative z-10">
                        {!isCustomer && <Detail k="Customer ID" v={r.customerId || "—"} mono/>}
                        <Detail k="Device fingerprint" v={detail?.event?.device_hash || "—"} mono/>
                        <Detail k="Typing speed" v={detail?.event?.typing_speed_wpm ? `${detail.event.typing_speed_wpm} WPM` : "—"} mono/>
                        <Detail k="Mouse speed" v={detail?.event?.mouse_speed_avg ? `${Math.round(detail.event.mouse_speed_avg)} px/s` : "—"} mono/>
                        
                        <div className="md:col-span-4 grid md:grid-cols-4 gap-4 bg-[var(--color-glass-bg)] p-5 rounded-2xl border border-[var(--color-glass-border)]">
                          <Detail k="Device score" v={detail?.event?.device_score ?? "—"} mono highlight/>
                          <Detail k="Behavior score" v={detail?.event?.behavior_score ?? "—"} mono highlight/>
                          <Detail k="Network score" v={detail?.event?.network_score ?? "—"} mono highlight/>
                          <Detail k="Overall Trust" v={`${r.score} / 100`} mono highlight orange/>
                        </div>

                        {detail?.event?.flags?.length > 0 && (
                          <div className="md:col-span-4 mt-2">
                             <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] font-bold mb-3">Risk Flags</div>
                             <div className="flex flex-wrap gap-3">
                               {detail.event.flags.map((flag: string, idx: number) => (
                                 <span key={idx} className="text-xs font-mono font-bold tracking-wide px-3 py-1.5 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-lg border border-[var(--color-danger)]/30 shadow-[0_0_10px_rgba(232,56,79,0.1)] flex items-center gap-2">
                                   <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)] animate-pulse"></div>
                                   {flag}
                                 </span>
                               ))}
                             </div>
                          </div>
                        )}
                        
                        {detail?.event?.metadata?.xai_explanations?.length > 0 && (
                          <div className="md:col-span-4 mt-2 bg-[var(--color-danger)]/5 border border-[var(--color-danger)]/20 p-5 rounded-2xl">
                             <div className="text-[10px] uppercase tracking-widest text-[var(--color-danger)] font-bold mb-3 flex items-center gap-2">
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                               Explainable AI (XAI) Reasons
                             </div>
                             <ul className="space-y-2 text-sm text-[var(--color-danger)] font-mono">
                               {detail.event.metadata.xai_explanations.map((exp: string, idx: number) => (
                                 <li key={idx} className="flex gap-3">
                                   <span className="opacity-50">[{idx+1}]</span> {exp}
                                 </li>
                               ))}
                             </ul>
                          </div>
                        )}
                        
                        <div className="md:col-span-4 mt-4">
                          <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] font-bold mb-4">Decision Timeline</div>
                          <div className="flex items-center gap-0 w-full">
                            {["Fingerprint","Behavior","Network","Score","Decision"].map((s, i, arr) => (
                              <div key={s} className="flex items-center flex-1">
                                <div className="flex flex-col items-center gap-3 w-full">
                                  <div className="flex items-center w-full relative">
                                    {i > 0 && <div className="absolute left-0 w-1/2 h-0.5 bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange)]/50 -translate-x-full"></div>}
                                    <div className="w-8 h-8 rounded-full bg-[var(--color-panel-bg)] border-2 border-[var(--color-bob-orange)] flex items-center justify-center text-xs font-mono font-bold text-[var(--color-bob-orange)] shadow-[0_0_15px_rgba(242,101,34,0.3)] z-10 mx-auto">
                                      {i+1}
                                    </div>
                                    {i < arr.length - 1 && <div className="absolute right-0 w-1/2 h-0.5 bg-gradient-to-l from-[var(--color-bob-orange)]/50 to-[var(--color-bob-orange)] translate-x-full"></div>}
                                  </div>
                                  <div className="text-[11px] font-bold text-[var(--color-text-sub)] tracking-wider uppercase">{s}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
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
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`px-4 py-2 border rounded-xl transition-all ${page === p ? "border-[var(--color-bob-orange)] bg-[var(--color-bob-orange)]/10 text-[var(--color-bob-orange)] shadow-[0_0_10px_rgba(242,101,34,0.2)]" : "border-[var(--color-glass-border)] bg-[var(--color-glass-bg)] hover:bg-[var(--color-glass-hover)] text-[var(--color-text-sub)]"}`}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(pages || 1, p + 1))} disabled={page >= (pages || 1)}
              className="px-4 py-2 bg-[var(--color-glass-bg)] hover:bg-[var(--color-glass-hover)] border border-[var(--color-glass-border)] rounded-xl disabled:opacity-30 transition-colors">Next ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ k, v, mono, highlight, orange }: { k: string; v: React.ReactNode; mono?: boolean; highlight?: boolean; orange?: boolean }) {
  return (
    <div className={`flex flex-col min-w-0 ${highlight ? "bg-[var(--color-glass-bg)] p-4 rounded-xl border border-[var(--color-glass-border)]" : ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] font-bold mb-1 truncate">{k}</div>
      <div className={`mt-1.5 text-base truncate ${mono ? "font-mono text-sm" : ""} ${orange ? "text-[var(--color-bob-orange)] font-extrabold text-xl" : "text-[var(--color-text-main)] font-medium"}`} title={typeof v === 'string' ? v : undefined}>{v}</div>
    </div>
  );
}
