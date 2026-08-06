import { createFileRoute } from "@tanstack/react-router";
import { MiniTrustRing } from "@/components/TrustRing";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Search, X, Lock, Mail, ShieldCheck, AlertTriangle, Download } from "lucide-react";

export const Route = createFileRoute("/dashboard/users")({
  head: () => ({ meta: [{ title: "Users · TrustSphere" }] }),
  component: UsersPage,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

function trustTone(score: number) {
  return score >= 80 ? "success" : score >= 60 ? "warning" : "danger";
}

function UsersPage() {
  const [usersList, setUsersList] = useState<any[]>([]);
  const [freezeRequests, setFreezeRequests] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<"all" | "freeze">("all");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const [selectedFreezeRequest, setSelectedFreezeRequest] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const loadData = () => {
    setLoading(true);
    apiFetch(`${API_BASE}/api/stats/users`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setUsersList(data); setLoading(false); })
      .catch(() => setLoading(false));

    apiFetch(`${API_BASE}/api/stats/freeze-requests`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setFreezeRequests(data); })
      .catch(() => {});
  };

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("public:users_realtime_channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "login_events" }, () => loadData())
      .subscribe();
    const interval = setInterval(loadData, 3000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReviewAction = async (action: "APPROVE" | "REJECT") => {
    if (!selectedFreezeRequest) return;
    setReviewing(true);
    setReviewError("");
    const userId = selectedFreezeRequest.id || selectedFreezeRequest.db_id || selectedFreezeRequest.customer_id;
    try {
      const res = await apiFetch(`${API_BASE}/api/stats/freeze-requests/${userId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, review_notes: reviewNotes }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Review submission failed.");
      }
      setSelectedFreezeRequest(null);
      setReviewNotes("");
      loadData();
    } catch (err: any) {
      setReviewError(err.message || "Failed to submit review");
    } finally {
      setReviewing(false);
    }
  };

  const filteredUsers = usersList.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.id.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const pendingFreezeCount = freezeRequests.filter(r => r.risk_profile === "FROZEN" || r.freeze_status === "PENDING_REVIEW").length;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">Customer trust registry</h1>
          <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1">Per-customer trust profiles built from behavior, device, and network telemetry.</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface)] self-start">
          <button onClick={() => setActiveSubTab("all")} className={`h-7 px-3 rounded text-[12px] font-medium transition-colors duration-100 ${activeSubTab === "all" ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-brand)]" : "text-[var(--color-text-sub)]"}`}>
            All identities ({usersList.length})
          </button>
          <button onClick={() => setActiveSubTab("freeze")} className={`h-7 px-3 rounded text-[12px] font-medium transition-colors duration-100 flex items-center gap-1.5 ${activeSubTab === "freeze" ? "bg-[var(--color-danger-bg)] text-[var(--color-danger)]" : "text-[var(--color-text-sub)]"}`}>
            Freeze requests
            {pendingFreezeCount > 0 && <span className="chip chip-warning">{pendingFreezeCount}</span>}
          </button>
        </div>
      </div>

      <div className="surface-card">
        {activeSubTab === "all" ? (
          <>
            <div className="px-5 py-4 flex items-center justify-between border-b border-[var(--color-border-default)]">
              <div className="relative flex-1 max-w-md">
                <Search size={15} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, UUID, or email…" className="input-field w-full pl-9" />
              </div>
              <div className="text-[12px] font-mono text-[var(--color-text-sub)] hidden sm:block">
                <span className="font-semibold text-[var(--color-text-main)]">{filteredUsers.length}</span> active identities
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-24"><span className="text-[13px] text-[var(--color-text-dim)]">Loading identities…</span></div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-24 text-center text-[13px] text-[var(--color-text-dim)]">No identities match this search.</div>
              ) : (
                filteredUsers.map((u) => (
                  <div key={u.id} onClick={() => setSelectedUser(u)} role="button" tabIndex={0}
                    className="px-5 py-3.5 border-b border-[var(--color-border-default)] last:border-b-0 flex items-center gap-4 cursor-pointer hover:bg-[var(--color-surface-sunken)] transition-colors duration-100">
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[12px] font-semibold text-[var(--color-text-sub)]">
                        {u.name.split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--color-surface)]" style={{ background: u.risk_profile === "FROZEN" ? "var(--color-danger)" : `var(--color-${trustTone(u.trust)})` }} />
                    </div>

                    <div className="flex-[2] min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-[13.5px] font-medium text-[var(--color-text-main)] truncate">{u.name}</div>
                        {u.risk_profile === "FROZEN" && <span className="chip chip-danger">Frozen</span>}
                      </div>
                      <div className="text-[12px] text-[var(--color-text-sub)] truncate">{u.email}</div>
                    </div>

                    <div className="hidden md:flex gap-4 flex-1">
                      <div>
                        <div className="label-caps text-[var(--color-text-dim)]">Sessions</div>
                        <div className="font-mono text-[13px] text-[var(--color-text-main)]">{u.sessions}</div>
                      </div>
                      <div>
                        <div className="label-caps text-[var(--color-text-dim)]">Devices</div>
                        <div className="font-mono text-[13px] text-[var(--color-text-main)]">{u.devices}</div>
                      </div>
                    </div>

                    <span className={`chip ${u.role === "analyst" ? "chip-info" : "chip-neutral"}`}>{u.type}</span>

                    <div className="flex items-center gap-2.5 pl-4 border-l border-[var(--color-border-default)]">
                      <MiniTrustRing score={u.trust} size={30} />
                      <span className="font-mono text-[16px] font-semibold w-9 text-right" style={{ color: `var(--color-${trustTone(u.trust)})` }}>{u.trust}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
            {freezeRequests.length === 0 ? (
              <div className="py-24 text-center text-[13px] text-[var(--color-text-dim)]">No active or pending account freeze requests.</div>
            ) : (
              freezeRequests.map((req, i) => (
                <div key={req.id || i} className="p-5 rounded-md border border-[var(--color-border-default)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center text-[13px] font-semibold shrink-0" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", color: "var(--color-danger)" }}>
                      {req.name ? req.name.slice(0, 2).toUpperCase() : "US"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[14px] font-medium text-[var(--color-text-main)] truncate">{req.name}</h4>
                        <span className={`chip ${req.freeze_status === "PENDING_REVIEW" || req.risk_profile === "FROZEN" ? "chip-warning" : req.freeze_status === "REJECTED" ? "chip-danger" : "chip-success"}`}>
                          {(req.freeze_status || "PENDING_REVIEW").replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-[12px] font-mono text-[var(--color-text-sub)] mt-0.5 truncate">{req.email} · {req.customer_id}</p>
                      <p className="text-[12px] text-[var(--color-danger)] mt-2 p-2 rounded" style={{ background: "var(--color-danger-bg)" }}>
                        <span className="font-medium">Reason: </span>{req.freeze_reason || "Emergency lock requested by user"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col md:items-end gap-2 shrink-0">
                    <div className="font-mono text-[11px] text-[var(--color-text-dim)]">
                      {req.freeze_requested_at ? new Date(req.freeze_requested_at).toLocaleString() : "N/A"}
                    </div>
                    <button onClick={() => { setSelectedFreezeRequest(req); setReviewNotes(req.freeze_review_notes || ""); setReviewError(""); }}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium text-white" style={{ background: "var(--color-danger)" }}>
                      <Lock size={13} strokeWidth={2} /> Review request
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Slide-out drawer */}
      {selectedUser && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSelectedUser(null)} />}
      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-[440px] bg-[var(--color-surface)] border-l border-[var(--color-border-default)] transform transition-transform duration-200 ease-out ${selectedUser ? "translate-x-0" : "translate-x-full"}`}>
        {selectedUser && (
          <div className="h-full flex flex-col">
            <div className="px-6 h-16 border-b border-[var(--color-border-default)] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[var(--color-accent-subtle)] flex items-center justify-center text-[13px] font-semibold" style={{ color: "var(--color-accent-brand)" }}>
                  {selectedUser.name.split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-[var(--color-text-main)] leading-tight">{selectedUser.name}</h3>
                  <div className="font-mono text-[11px] text-[var(--color-text-dim)]">{selectedUser.id}</div>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} aria-label="Close" className="p-1.5 rounded-md text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sunken)] transition-colors">
                <X size={17} strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex flex-col items-center justify-center py-8 border border-[var(--color-border-default)] rounded-md">
                <MiniTrustRing score={selectedUser.trust} size={72} />
                <div className="text-center mt-4">
                  <div className="font-mono text-[36px] leading-none font-semibold text-[var(--color-text-main)]">{selectedUser.trust}<span className="text-[16px] text-[var(--color-text-sub)]">%</span></div>
                  <div className="label-caps text-[var(--color-accent-brand)] mt-3">Realtime global trust</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-md border border-[var(--color-border-default)]">
                  <div className="label-caps text-[var(--color-text-dim)] mb-1.5">Entity type</div>
                  <div className="font-mono text-[14px] font-medium text-[var(--color-text-main)]">{selectedUser.type}</div>
                </div>
                <div className="p-4 rounded-md border border-[var(--color-border-default)]">
                  <div className="label-caps text-[var(--color-text-dim)] mb-1.5">Privilege role</div>
                  <div className="font-mono text-[14px] font-medium text-[var(--color-text-main)] capitalize">{selectedUser.role}</div>
                </div>
                <div className="p-4 rounded-md border border-[var(--color-border-default)]">
                  <div className="label-caps text-[var(--color-text-dim)] mb-1.5">Sessions (30d)</div>
                  <div className="font-mono text-[24px] font-semibold text-[var(--color-text-main)]">{selectedUser.sessions}</div>
                </div>
                <div className="p-4 rounded-md border border-[var(--color-border-default)]">
                  <div className="label-caps text-[var(--color-text-dim)] mb-1.5">Known devices</div>
                  <div className="font-mono text-[24px] font-semibold text-[var(--color-text-main)]">{selectedUser.devices}</div>
                </div>
              </div>

              <div>
                <h4 className="label-caps text-[var(--color-text-dim)] mb-3">Identity telemetry</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-md border border-[var(--color-border-default)]">
                    <Mail size={16} strokeWidth={1.75} className="text-[var(--color-text-sub)]" />
                    <div>
                      <div className="label-caps text-[var(--color-text-dim)] mb-0.5">Primary contact</div>
                      <div className="font-mono text-[13px] text-[var(--color-text-main)]">{selectedUser.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-md" style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)" }}>
                    <ShieldCheck size={16} strokeWidth={1.75} style={{ color: "var(--color-success)" }} />
                    <div>
                      <div className="label-caps text-[var(--color-text-dim)] mb-0.5">Security posture</div>
                      <div className="text-[13px] font-medium" style={{ color: "var(--color-success)" }}>MFA enrolled &amp; active</div>
                    </div>
                  </div>
                </div>
              </div>

              {(selectedUser.latest_flags?.length > 0 || selectedUser.xai_explanations?.length > 0) && (
                <div>
                  <h4 className="label-caps text-[var(--color-text-dim)] mb-3">Latest session risk profile</h4>
                  <div className="space-y-3">
                    {selectedUser.latest_flags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedUser.latest_flags.map((flag: string, idx: number) => <span key={idx} className="chip chip-danger">{flag}</span>)}
                      </div>
                    )}
                    {selectedUser.xai_explanations?.length > 0 && (
                      <div className="p-4 rounded-md" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <AlertTriangle size={13} strokeWidth={2} style={{ color: "var(--color-danger)" }} />
                          <span className="label-caps" style={{ color: "var(--color-danger)" }}>Explainable AI reasons</span>
                        </div>
                        <ul className="space-y-1.5 text-[12.5px] font-mono" style={{ color: "var(--color-danger)" }}>
                          {selectedUser.xai_explanations.map((exp: string, idx: number) => (
                            <li key={idx} className="flex gap-2"><span className="opacity-60">[{idx + 1}]</span> {exp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[var(--color-border-default)] shrink-0">
              <button className="btn-secondary w-full h-9 inline-flex items-center justify-center gap-2">
                <Download size={14} strokeWidth={2} /> Export audit log
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Review modal */}
      {selectedFreezeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedFreezeRequest(null)} />
          <div className="surface-card elevated relative max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
                  <Lock size={16} strokeWidth={2} style={{ color: "var(--color-danger)" }} />
                </div>
                <div>
                  <h4 className="text-[15px] font-semibold text-[var(--color-text-main)]">Review freeze request</h4>
                  <p className="text-[11.5px] text-[var(--color-text-dim)]">Security analyst decision</p>
                </div>
              </div>
              <button onClick={() => setSelectedFreezeRequest(null)} aria-label="Close" className="p-1.5 rounded-md text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sunken)]"><X size={16} /></button>
            </div>

            {reviewError && <div className="text-[13px] text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-md px-3 py-2">{reviewError}</div>}

            <div className="space-y-2.5 p-4 rounded-md border border-[var(--color-border-default)] text-[13px]">
              <div className="flex justify-between"><span className="text-[var(--color-text-dim)]">Identity</span><span className="font-medium text-[var(--color-text-main)]">{selectedFreezeRequest.name} ({selectedFreezeRequest.customer_id})</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-dim)]">Email</span><span className="text-[var(--color-text-main)]">{selectedFreezeRequest.email}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-dim)]">Requested</span><span className="text-[var(--color-text-main)]">{selectedFreezeRequest.freeze_requested_at ? new Date(selectedFreezeRequest.freeze_requested_at).toLocaleString() : "N/A"}</span></div>
              <div className="border-t border-[var(--color-border-default)] pt-2.5">
                <span className="text-[var(--color-danger)] font-medium block mb-1">Reason submitted by user</span>
                <p className="text-[var(--color-danger)] p-2.5 rounded" style={{ background: "var(--color-danger-bg)" }}>{selectedFreezeRequest.freeze_reason || "Emergency lock requested by user"}</p>
              </div>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-[var(--color-text-main)] mb-1.5">Analyst review notes</label>
              <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Enter justification, identity verification details, or call notes…" rows={3} className="input-field w-full resize-none" />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5">
              <button type="button" disabled={reviewing} onClick={() => handleReviewAction("REJECT")} className="w-full sm:w-auto btn-secondary h-9 px-4">
                {reviewing ? "Processing…" : "Reject (keep frozen)"}
              </button>
              <button type="button" disabled={reviewing} onClick={() => handleReviewAction("APPROVE")} className="w-full sm:w-auto h-9 px-4 rounded-md text-[13px] font-medium text-white transition-colors duration-100" style={{ background: "var(--color-success)" }}>
                {reviewing ? "Processing…" : "Approve & reactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
