import { createFileRoute } from "@tanstack/react-router";
import { DashHeader } from "@/components/Sidebar";
import { MiniTrustRing } from "@/components/TrustRing";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/dashboard/users")({
  head: () => ({ meta: [{ title: "Users · TrustSphere" }] }),
  component: UsersPage,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

function UsersPage() {
  const [usersList, setUsersList] = useState<any[]>([]);
  const [freezeRequests, setFreezeRequests] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<"all" | "freeze">("all");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Analyst Review Modal state
  const [selectedFreezeRequest, setSelectedFreezeRequest] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const loadData = () => {
    setLoading(true);
    apiFetch(`${API_BASE}/api/stats/users`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setUsersList(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    apiFetch(`${API_BASE}/api/stats/freeze-requests`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setFreezeRequests(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("public:users_realtime_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        () => {
          loadData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "login_events" },
        () => {
          loadData();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      loadData();
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
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
        body: JSON.stringify({
          action: action,
          review_notes: reviewNotes,
        }),
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

  const pendingFreezeCount = freezeRequests.filter(
    r => r.risk_profile === "FROZEN" || r.freeze_status === "PENDING_REVIEW"
  ).length;

  return (
    <div className="space-y-10 pb-12 animate-fade-in-up relative z-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-20">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-1 bg-[var(--color-bob-orange)] rounded-full"></div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-bob-orange)] font-bold">Identity Graph</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--color-text-main)] drop-shadow-md">
            Customer Trust Registry
          </h1>
          <p className="text-[var(--color-text-sub)] mt-3 text-sm max-w-xl leading-relaxed">
            Per-customer trust profiles constructed from behavior, device, and network telemetry.
          </p>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex items-center gap-3 bg-[var(--color-panel-bg)] p-1.5 rounded-2xl border border-[var(--color-glass-border)] self-start">
          <button
            onClick={() => setActiveSubTab("all")}
            className={`px-5 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${activeSubTab === "all" ? "bg-[var(--color-bob-orange)] text-white shadow-[0_0_15px_rgba(242,101,34,0.3)]" : "text-[var(--color-text-sub)] hover:text-white"}`}
          >
            All Identities ({usersList.length})
          </button>

          <button
            onClick={() => setActiveSubTab("freeze")}
            className={`px-5 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeSubTab === "freeze" ? "bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]" : "text-[var(--color-text-sub)] hover:text-white"}`}
          >
            <span>Account Freeze Requests</span>
            {pendingFreezeCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-400 text-black shadow-md">
                {pendingFreezeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-glass-border)] rounded-[32px] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.1)] relative overflow-hidden group flex flex-col">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[var(--color-bob-orange)]/5 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[300px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none translate-y-1/2"></div>
        
        {activeSubTab === "all" ? (
          <>
            <div className="px-6 py-5 flex items-center justify-between relative z-10">
              <div className="relative flex-1 max-w-xl">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  placeholder="Search by identity, UUID, or telemetry signature..."
                  className="w-full pl-11 pr-5 py-3.5 bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-2xl text-sm font-mono focus:border-[var(--color-bob-orange)]/50 focus:bg-[var(--color-glass-hover)] outline-none text-[var(--color-text-main)] transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)] placeholder-[var(--color-text-dim)]"
                />
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-sub)] font-bold px-4 hidden sm:block">
                <span className="text-[var(--color-bob-orange)] text-lg mr-2">{filteredUsers.length}</span> ACTIVE IDENTITIES
              </div>
            </div>

            <div className="px-6 pb-4 pt-2 relative z-10 flex flex-col gap-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-6">
                  <div className="w-12 h-12 border-4 border-[var(--color-bob-orange)] border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(242,101,34,0.3)]"></div>
                  <span className="text-sm font-mono tracking-[0.2em] uppercase text-[var(--color-bob-orange)] font-bold">Synchronizing Nodes...</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-24 text-center text-[var(--color-text-dim)] font-mono text-sm uppercase tracking-widest border border-dashed border-[var(--color-glass-border)] rounded-2xl bg-[var(--color-glass-bg)]">
                  No identities found in current graph quadrant.
                </div>
              ) : (
                filteredUsers.map((u, i) => (
                  <div 
                    key={u.id} 
                    onClick={() => setSelectedUser(u)}
                    className={`shrink-0 relative overflow-hidden py-6 px-8 rounded-[28px] bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] hover:border-[var(--color-bob-orange)]/30 hover:bg-[var(--color-glass-hover)] transition-all duration-500 group cursor-pointer flex items-center gap-8 hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)] hover:-translate-y-1.5 ${i < 5 ? "animate-fade-in-up" : ""}`}
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    {/* Hover Glow Edge */}
                    <div className={`absolute left-0 top-6 bottom-6 w-1.5 rounded-r-lg transition-all duration-500 group-hover:h-[60%] opacity-0 group-hover:opacity-100 ${u.risk_profile === 'FROZEN' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]' : u.trust >= 80 ? 'bg-[var(--color-success)] shadow-[0_0_15px_var(--color-success)]' : u.trust >= 60 ? 'bg-[var(--color-warning)] shadow-[0_0_15px_var(--color-warning)]' : 'bg-[var(--color-danger)] shadow-[0_0_15px_var(--color-danger)]'}`}></div>

                    {/* Avatar */}
                    <div className="relative pl-2">
                      <div className="w-[72px] h-[72px] rounded-[1.4rem] bg-gradient-to-br from-[var(--color-text-main)]/10 to-[var(--color-text-main)]/5 border border-[var(--color-glass-border)] flex items-center justify-center text-2xl font-extrabold text-[var(--color-text-main)] shadow-[inset_0_0_20px_rgba(0,0,0,0.05)] group-hover:border-[var(--color-text-dim)] transition-all duration-500">
                        {u.name.split(" ").map((s: string)=>s[0]).join("").slice(0,2).toUpperCase()}
                      </div>
                      {/* Status dot */}
                      <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-[var(--color-page-bg)] shadow-md ${u.risk_profile === 'FROZEN' ? 'bg-red-500' : u.trust >= 80 ? 'bg-[var(--color-success)]' : u.trust >= 60 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-danger)]'}`}></div>
                    </div>
                    
                    {/* Identity Info */}
                    <div className="flex-[2.5] min-w-0 pl-4">
                      <div className="flex items-center gap-3 mb-1">
                        <div className="font-extrabold text-[var(--color-text-main)] text-[22px] group-hover:text-[var(--color-bob-orange)] transition-colors tracking-wide truncate leading-normal">{u.name}</div>
                        {u.risk_profile === 'FROZEN' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/40 uppercase">
                            Frozen
                          </span>
                        )}
                      </div>
                      <div className="text-[14px] text-[var(--color-text-sub)] font-mono tracking-wider flex items-center gap-3">
                        <span className="flex items-center gap-2"><svg className="w-4 h-4 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> {u.email}</span>
                      </div>
                    </div>

                {/* Device/Session Telemetry */}
                <div className="flex-[2] hidden md:block">
                  <div className="flex gap-5">
                    <div className="bg-[var(--color-glass-bg)] px-5 py-3 rounded-2xl border border-[var(--color-glass-border)] flex flex-col justify-center shadow-inner group-hover:bg-[var(--color-glass-hover)] transition-colors">
                      <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-sub)] font-bold mb-1">Sessions (30d)</div>
                      <div className="font-mono text-[19px] font-semibold text-[var(--color-text-main)]">{u.sessions}</div>
                    </div>
                    <div className="bg-[var(--color-glass-bg)] px-5 py-3 rounded-2xl border border-[var(--color-glass-border)] flex flex-col justify-center shadow-inner group-hover:bg-[var(--color-glass-hover)] transition-colors">
                      <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-sub)] font-bold mb-1">Devices</div>
                      <div className="font-mono text-[19px] font-semibold text-[var(--color-text-main)]">{u.devices}</div>
                    </div>
                  </div>
                </div>

                <div className="flex-[1] flex justify-end pr-8">
                  <span className={`px-5 py-2.5 text-[11px] font-mono tracking-[0.2em] rounded-xl uppercase font-extrabold border shadow-md ${u.role === 'analyst' ? 'bg-[rgba(168,85,247,0.15)] text-purple-600 dark:text-purple-300 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.1)]' : 'bg-[var(--color-glass-bg)] text-[var(--color-text-sub)] border-[var(--color-glass-border)]'}`}>
                    {u.type}
                  </span>
                </div>

                {/* Trust Score */}
                <div className="flex items-center gap-8 pl-10 border-l border-[var(--color-glass-border)] mr-6">
                  <div className="scale-[1.7] filter drop-shadow-xl">
                    <MiniTrustRing score={u.trust}/>
                  </div>
                  <div className="w-16 text-right">
                    <span className={`font-mono text-3xl font-extrabold tracking-tighter ${u.trust >= 80 ? 'text-[var(--color-success)]' : u.trust >= 60 ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]'}`}>
                      {u.trust}<span className="text-base opacity-50">%</span>
                    </span>
                  </div>
                </div>
              </div>
            ))
            )}
          </div>
        </>
        ) : (
          <div className="px-6 py-6 relative z-10 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
            {freezeRequests.length === 0 ? (
              <div className="py-24 text-center text-[var(--color-text-dim)] font-mono text-sm uppercase tracking-widest border border-dashed border-[var(--color-glass-border)] rounded-2xl bg-[var(--color-glass-bg)]">
                No active or pending account freeze requests.
              </div>
            ) : (
              freezeRequests.map((req, i) => (
                <div
                  key={req.id || i}
                  className="p-6 rounded-[28px] bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-red-500/30 transition-all shadow-sm"
                >
                  <div className="flex items-center gap-5 min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 flex items-center justify-center text-red-600 dark:text-red-400 font-extrabold text-xl shrink-0">
                      {req.name ? req.name.slice(0, 2).toUpperCase() : "US"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <h4 className="font-extrabold text-[var(--color-text-main)] text-lg truncate">{req.name}</h4>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase border ${req.freeze_status === "PENDING_REVIEW" || req.risk_profile === "FROZEN" ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40" : req.freeze_status === "REJECTED" ? "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40" : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40"}`}>
                          {req.freeze_status || "PENDING_REVIEW"}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-[var(--color-text-sub)] mt-1 truncate">
                        {req.email} • ID: {req.customer_id}
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300/90 font-mono mt-2 bg-red-50 dark:bg-black/30 p-2.5 rounded-xl border border-red-200 dark:border-red-500/20 max-w-xl">
                        <span className="font-bold text-red-800 dark:text-red-400">Reason:</span> {req.freeze_reason || "Emergency lock requested by user"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end gap-3 shrink-0">
                    <div className="text-right font-mono text-[11px] text-[var(--color-text-dim)]">
                      Requested: {req.freeze_requested_at ? new Date(req.freeze_requested_at).toLocaleString() : "N/A"}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedFreezeRequest(req);
                        setReviewNotes(req.freeze_review_notes || "");
                        setReviewError("");
                      }}
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase font-mono tracking-wider rounded-xl transition-all shadow-[0_4px_15px_rgba(220,38,38,0.3)] flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Review Request
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Slide-out Drawer */}
      {selectedUser && (
        <div className="fixed inset-0 z-40 bg-black/40 dark:bg-black/70 backdrop-blur-md animate-fade-in" onClick={() => setSelectedUser(null)}></div>
      )}
      
      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-[550px] bg-[var(--color-panel-bg)] backdrop-blur-3xl border-l border-[var(--color-glass-border)] shadow-[-20px_0_60px_rgba(0,0,0,0.2)] dark:shadow-[-20px_0_60px_rgba(0,0,0,0.8)] transform transition-transform duration-500 ease-[cubic-bezier(0.19,1,0.22,1)] ${selectedUser ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedUser && (
          <div className="h-full flex flex-col relative overflow-hidden">
            {/* Drawer Background Effects */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-[var(--color-bob-orange)]/10 to-transparent rounded-full blur-[140px] pointer-events-none -translate-y-1/2 translate-x-1/4"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none translate-y-1/2 -translate-x-1/4"></div>
            
            <div className="px-10 py-8 border-b border-[var(--color-glass-border)] flex justify-between items-center relative z-20 bg-[var(--color-glass-bg)] shadow-sm shrink-0">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-[1.3rem] bg-gradient-to-br from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] flex items-center justify-center text-xl font-extrabold text-white shadow-[0_4px_30px_rgba(242,101,34,0.3)] border border-white/20">
                  {selectedUser.name.split(" ").map((s: string)=>s[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-3xl font-extrabold text-[var(--color-text-main)] leading-tight tracking-wide">{selectedUser.name}</h3>
                  <div className="font-mono text-xs text-[var(--color-text-sub)] tracking-widest mt-1.5">{selectedUser.id}</div>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-3 text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-glass-hover)] rounded-full transition-all hover:rotate-90">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 space-y-10 relative z-10 custom-scrollbar">
              {/* Massive 3D Trust Score Hero */}
              <div className="flex flex-col items-center justify-center py-16 bg-[var(--color-glass-bg)] rounded-[40px] border border-[var(--color-glass-border)] relative overflow-hidden group hover:border-[var(--color-bob-orange)]/40 transition-colors duration-700 shadow-[inset_0_4px_40px_rgba(0,0,0,0.05)]">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 dark:opacity-10 mix-blend-overlay pointer-events-none"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-bob-orange)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"></div>
                
                <div className="scale-[2.2] mb-12 relative mt-4">
                  <div className="absolute inset-0 bg-[var(--color-bob-orange)] rounded-full blur-[40px] opacity-20 animate-pulse-shield"></div>
                  <div className="absolute inset-0 border-2 border-[var(--color-glass-border)] rounded-full scale-[1.2] animate-[spin_10s_linear_infinite]"></div>
                  <div className="absolute inset-0 border border-[var(--color-glass-border)] rounded-full scale-[1.4] animate-[spin_15s_linear_infinite_reverse] border-dashed"></div>
                  
                  <div className="drop-shadow-[0_0_25px_rgba(0,0,0,0.2)] dark:drop-shadow-[0_0_25px_rgba(0,0,0,0.8)]"><MiniTrustRing score={selectedUser.trust} /></div>
                </div>
                
                <div className="text-center relative z-10 mt-6">
                  <div className="text-[72px] leading-none font-extrabold text-[var(--color-text-main)] tracking-tighter drop-shadow-lg">
                    {selectedUser.trust}<span className="text-3xl text-[var(--color-text-sub)]">%</span>
                  </div>
                  <div className="text-xs uppercase tracking-[0.3em] text-[var(--color-bob-orange)] font-bold mt-5 shadow-sm py-1.5 px-6 rounded-full bg-[var(--color-bob-orange)]/10 border border-[var(--color-bob-orange)]/20 inline-block">Realtime Global Trust</div>
                </div>
              </div>
              
              {/* Analytics Bento Grid */}
              <div className="grid grid-cols-2 gap-5">
                <div className="bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-[32px] p-7 hover:bg-[var(--color-glass-hover)] transition-colors shadow-inner flex flex-col justify-center group">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-glass-bg)] flex items-center justify-center border border-[var(--color-glass-border)] group-hover:border-[var(--color-text-dim)] transition-colors">
                      <svg className="w-4 h-4 text-[var(--color-text-sub)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-sub)] font-bold group-hover:text-[var(--color-text-main)] transition-colors">Entity Type</div>
                  </div>
                  <div className="font-mono text-xl font-bold text-[var(--color-text-main)]">{selectedUser.type}</div>
                </div>
                
                <div className="bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-[32px] p-7 hover:bg-[var(--color-glass-hover)] transition-colors shadow-inner flex flex-col justify-center group">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-glass-bg)] flex items-center justify-center border border-[var(--color-glass-border)] group-hover:border-[var(--color-text-dim)] transition-colors">
                      <svg className="w-4 h-4 text-[var(--color-text-sub)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-sub)] font-bold group-hover:text-[var(--color-text-main)] transition-colors">Privilege Role</div>
                  </div>
                  <div className="font-mono text-xl font-bold text-[var(--color-text-main)] capitalize">{selectedUser.role}</div>
                </div>
                
                <div className="bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-[32px] p-7 hover:bg-[var(--color-glass-hover)] transition-colors shadow-inner flex flex-col justify-center group relative overflow-hidden h-[160px]">
                  <div className="absolute right-0 bottom-0 text-[120px] font-extrabold text-[var(--color-text-main)] opacity-[0.03] leading-none pointer-events-none translate-y-4">{selectedUser.sessions}</div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-sub)] font-bold mb-3 relative z-10 group-hover:text-[var(--color-text-main)] transition-colors">Sessions (30d)</div>
                  <div className="font-mono text-[48px] font-extrabold text-[var(--color-text-main)] relative z-10 tracking-tighter">{selectedUser.sessions}</div>
                </div>
                
                <div className="bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-[32px] p-7 hover:bg-[var(--color-glass-hover)] transition-colors shadow-inner flex flex-col justify-center group relative overflow-hidden h-[160px]">
                  <div className="absolute right-0 bottom-0 text-[120px] font-extrabold text-[var(--color-text-main)] opacity-[0.03] leading-none pointer-events-none translate-y-4">{selectedUser.devices}</div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-sub)] font-bold mb-3 relative z-10 group-hover:text-[var(--color-text-main)] transition-colors">Known Devices</div>
                  <div className="font-mono text-[48px] font-extrabold text-[var(--color-text-main)] relative z-10 tracking-tighter">{selectedUser.devices}</div>
                </div>
              </div>
              
              {/* Telemetry Snapshot */}
              <div>
                <h4 className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--color-text-sub)] mb-6 ml-2">Identity Telemetry</h4>
                <div className="space-y-4 bg-[var(--color-glass-bg)] p-7 rounded-[36px] border border-[var(--color-glass-border)] shadow-inner">
                  <div className="flex items-center justify-between p-4 rounded-3xl bg-[var(--color-panel-bg)] border border-[var(--color-glass-border)]">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--color-glass-bg)] flex items-center justify-center border border-[var(--color-glass-border)]">
                        <svg className="w-6 h-6 text-[var(--color-text-sub)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)] mb-1">Primary Contact</div>
                        <div className="text-[var(--color-text-main)] font-mono text-[15px] tracking-wide">{selectedUser.email}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 rounded-3xl bg-[var(--color-panel-bg)] border border-[var(--color-glass-border)] relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[var(--color-success)]"></div>
                    <div className="flex items-center gap-5 ml-1.5">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--color-success)]/10 flex items-center justify-center border border-[var(--color-success)]/20 shadow-[0_0_20px_rgba(0,196,140,0.1)]">
                        <svg className="w-6 h-6 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)] mb-1">Security Posture</div>
                        <div className="text-[var(--color-success)] font-bold text-[15px] tracking-wide">MFA Enrolled & Active</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-10 border-t border-[var(--color-glass-border)] bg-[var(--color-glass-bg)] backdrop-blur-3xl shrink-0 shadow-[0_-10px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_50px_rgba(0,0,0,0.5)] relative z-20">
              <button className="relative w-full overflow-hidden group rounded-[20px] p-[2px]">
                <span className="absolute inset-0 bg-gradient-to-r from-[var(--color-bob-orange)] to-purple-600 rounded-[20px] opacity-80 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></span>
                <div className="relative bg-[var(--color-page-bg)] group-hover:bg-transparent transition-colors duration-300 rounded-[18px] px-6 py-5 flex items-center justify-center gap-3">
                  <svg className="w-6 h-6 text-[var(--color-text-main)] group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  <span className="font-bold text-[var(--color-text-main)] group-hover:text-white tracking-[0.2em] uppercase text-sm transition-colors">Extract Audit Log</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Analyst Review Modal */}
      {selectedFreezeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setSelectedFreezeRequest(null)}></div>
          <div className="relative bg-[#0d1520] border-2 border-red-500/40 rounded-3xl p-8 max-w-lg w-full shadow-[0_0_50px_rgba(239,68,68,0.3)] animate-scale-up space-y-6 z-10">
            <div className="flex items-center justify-between border-b border-red-500/20 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 font-extrabold">
                  🔒
                </div>
                <div>
                  <h4 className="text-xl font-extrabold text-white">Review Freeze Request</h4>
                  <p className="text-xs text-red-400 font-mono">Security Analyst Decision Console</p>
                </div>
              </div>
              <button onClick={() => setSelectedFreezeRequest(null)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            {reviewError && (
              <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-xs text-red-300 font-mono">
                {reviewError}
              </div>
            )}

            <div className="space-y-4 bg-black/30 p-5 rounded-2xl border border-white/5 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">User Identity:</span>
                <span className="text-white font-bold">{selectedFreezeRequest.name} ({selectedFreezeRequest.customer_id})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Email:</span>
                <span className="text-white">{selectedFreezeRequest.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Request Date:</span>
                <span className="text-white">{selectedFreezeRequest.freeze_requested_at ? new Date(selectedFreezeRequest.freeze_requested_at).toLocaleString() : "N/A"}</span>
              </div>
              <div className="border-t border-white/10 pt-3">
                <span className="text-red-400 font-bold block mb-1">Reason Submitted by User:</span>
                <p className="text-red-200 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                  {selectedFreezeRequest.freeze_reason || "Emergency lock requested by user"}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-gray-300 mb-2 font-bold">
                Analyst Review Notes
              </label>
              <textarea
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Enter justification, identity verification details, or phone call notes..."
                rows={3}
                className="w-full px-4 py-3 bg-black/40 border border-gray-700 rounded-xl text-sm text-white focus:border-red-500 outline-none resize-none placeholder-gray-500"
              ></textarea>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={reviewing}
                onClick={() => handleReviewAction("REJECT")}
                className="w-full sm:w-auto px-5 py-2.5 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 rounded-xl text-xs font-mono font-bold uppercase transition-all"
              >
                {reviewing ? "Processing..." : "Reject Request (Keep Frozen)"}
              </button>
              
              <button
                type="button"
                disabled={reviewing}
                onClick={() => handleReviewAction("APPROVE")}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-mono font-bold uppercase transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)]"
              >
                {reviewing ? "Processing..." : "Approve & Reactivate Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
