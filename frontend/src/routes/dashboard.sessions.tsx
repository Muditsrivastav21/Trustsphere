import { createFileRoute } from "@tanstack/react-router";
import { Fragment as FragmentRow, useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { DashHeader } from "@/components/Sidebar";
import { MiniTrustRing } from "@/components/TrustRing";

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
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [risk, setRisk] = useState<"all"|"low"|"med"|"high">("all");
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
    <div>
      <DashHeader title="Session Inspector" subtitle="Drill into every authentication event across the bank." />

      <div className="surface-card mb-4 p-3 flex flex-wrap items-center gap-3">
        <input value={searchInput} onChange={e=>setSearchInput(e.target.value)} placeholder="Search user, IP, session id…"
          className="flex-1 min-w-[240px] px-3 py-2 bg-[var(--color-navy)] border border-[var(--color-navy-border)] rounded-md text-xs font-mono focus:border-[var(--color-bob-orange)] outline-none"/>
        <div className="flex bg-[var(--color-navy)] rounded-md p-1">
          {([["all","All"],["low","Low"],["med","Medium"],["high","High"],["recovery","Recovery"]] as const).map(([k,l]) => (
            <button key={k} onClick={()=>{ setRisk(k as any); setPage(1); }}
              className={`px-3 py-1.5 text-xs rounded font-medium transition ${risk===k ? "bg-[var(--color-bob-orange)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}>{l}</button>
          ))}
        </div>
        <div className="ml-auto font-mono text-[10px] text-[var(--color-text-muted)]">{rows.length} of {total} sessions</div>
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="text-[var(--color-text-muted)] bg-[var(--color-navy)]">
            <tr className="label-caps text-left">
              <th className="px-4 py-3 font-medium">Session ID</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium text-center">Trust</th>
              <th className="px-4 py-3 font-medium text-right">Auth</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-[var(--color-text-muted)] text-sm">Loading sessions…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-[var(--color-text-muted)] text-sm">No sessions found.</td></tr>
            )}
            {!loading && rows.map(r => (
              <FragmentRow key={r.id}>
                <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="border-t border-[var(--color-navy-border)] hover:bg-[var(--color-bob-orange-muted)] cursor-pointer transition">
                  <td className="px-4 py-3 font-mono text-[11px] text-[var(--color-text-secondary)]">{r.id}</td>
                  <td className="px-4 py-3">{r.user}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[var(--color-text-secondary)]">{r.t}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[var(--color-text-secondary)]">{r.ip}</td>
                  <td className="px-4 py-3 text-[12px]">{r.loc}</td>
                  <td className="px-4 py-3"><div className="flex justify-center"><MiniTrustRing score={r.score}/></div></td>
                  <td className="px-4 py-3 text-right">
                    <span className={`chip ${r.action === "ALLOW" || r.action === "RECOVERY_ALLOW" ? "chip-success" : r.action === "OTP" || r.action === "RECOVERY_STEP_UP" ? "chip-warning" : "chip-danger"}`}>{r.action}</span>
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr className="bg-[var(--color-navy)] border-t border-[var(--color-navy-border)]">
                    <td colSpan={7} className="px-6 py-5">
                      <div className="grid md:grid-cols-4 gap-4 animate-fade-in">
                        <Detail k="Customer ID" v={r.customerId || "—"} mono/>
                        <Detail k="Device fingerprint" v={detail?.event?.device_hash || "—"} mono/>
                        <Detail k="Typing speed" v={detail?.event?.typing_speed_wpm ? `${detail.event.typing_speed_wpm} WPM` : "—"} mono/>
                        <Detail k="Mouse speed" v={detail?.event?.mouse_speed_avg ? `${Math.round(detail.event.mouse_speed_avg)} px/s` : "—"} mono/>
                        <Detail k="Device score" v={detail?.event?.device_score ?? "—"} mono/>
                        <Detail k="Behavior score" v={detail?.event?.behavior_score ?? "—"} mono/>
                        <Detail k="Network score" v={detail?.event?.network_score ?? "—"} mono/>
                        <Detail k="Trust score" v={`${r.score}/100`} mono/>
                        {detail?.event?.flags?.length > 0 && (
                          <div className="md:col-span-4 mt-2">
                             <div className="label-caps text-[var(--color-text-muted)] mb-2">Risk Flags</div>
                             <div className="flex flex-wrap gap-2">
                               {detail.event.flags.map((flag: string, idx: number) => (
                                 <span key={idx} className="text-[11px] font-mono px-2.5 py-1 bg-[var(--color-danger)]/15 text-[var(--color-danger)] rounded border border-[var(--color-danger)]/30 shadow-[0_0_8px_rgba(232,56,79,0.2)]">
                                   {flag}
                                 </span>
                               ))}
                             </div>
                          </div>
                        )}
                        {detail?.event?.metadata?.xai_explanations?.length > 0 && (
                          <div className="md:col-span-4 mt-2">
                             <div className="label-caps text-[var(--color-text-muted)] mb-2">Explainable AI (XAI) Reasons</div>
                             <ul className="list-disc pl-5 text-sm text-[var(--color-danger)]">
                               {detail.event.metadata.xai_explanations.map((exp: string, idx: number) => (
                                 <li key={idx} className="mb-1">{exp}</li>
                               ))}
                             </ul>
                          </div>
                        )}
                        <div className="md:col-span-4">
                          <div className="label-caps text-[var(--color-text-muted)] mb-2">Decision Timeline</div>
                          <div className="flex gap-2 items-center">
                            {["Fingerprint","Behavior","Network","Score","Decision"].map((s, i) => (
                              <div key={s} className="flex items-center gap-2 flex-1">
                                <div className="w-6 h-6 rounded-full bg-[var(--color-navy-mid)] border border-[var(--color-bob-orange)] flex items-center justify-center text-[10px] font-mono text-[var(--color-bob-orange)]">{i+1}</div>
                                <div className="text-[11px]">{s}</div>
                                {i < 4 && <div className="flex-1 h-px bg-[var(--color-navy-border)]"/>}
                              </div>
                            ))}
                          </div>
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
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`px-3 py-1 border rounded ${page === p ? "border-[var(--color-bob-orange)] text-[var(--color-bob-orange)]" : "border-[var(--color-navy-border)]"}`}>{p}</button>
            ))}
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
      <div className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{v}</div>
    </div>
  );
}
