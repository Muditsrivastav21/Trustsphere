import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { DashHeader } from "@/components/Sidebar";
import ForceGraph3D from "react-force-graph-3d";

export const Route = createFileRoute("/dashboard/graph")({
  head: () => ({ meta: [{ title: "Fraud Graph · TrustSphere" }] }),
  component: GraphPage,
});

const API_BASE = "http://localhost:8001";

type NodeType = "user" | "device" | "ip" | "fraud";
type Node = { id: string; type: NodeType; label: string; fraud?: boolean; connections: number; val?: number; color?: string };
type Edge = { source: string; target: string; relationship: string; fraud?: boolean; color?: string };

const COLORS: Record<NodeType, string> = {
  user: "#378ADD", device: "#F26522", ip: "#A855F7", fraud: "#E8384F",
};

function mapNodeType(apiType: string): NodeType {
  switch (apiType) {
    case "USER": return "user";
    case "DEVICE": return "device";
    case "IP": return "ip";
    case "FRAUD_RING": return "fraud";
    case "EMAIL": return "user";
    default: return "user";
  }
}

function GraphPage() {
  const [graphData, setGraphData] = useState<{ nodes: Node[]; links: Edge[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Node | null>(null);
  const [filter, setFilter] = useState<"all" | "fraud">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const fgRef = useRef<any>();
  const [isSimulating, setIsSimulating] = useState(false);

  const loadData = async (currentFilter: "all" | "fraud") => {
    setLoading(true);
    try {
      const filterParam = currentFilter === "fraud" ? "fraud_only" : "all";
      const r = await apiFetch(`${API_BASE}/api/graph/nodes?filter=${filterParam}`);
      const data = await r.json();
      
      const apiNodes = data.nodes || [];
      const apiEdges = data.edges || [];
      
      let nodes: Node[] = apiNodes.map((n: any) => {
        const type = mapNodeType(n.type);
        const isFraud = n.risk_flag || type === "fraud";
        return {
          id: n.id,
          type,
          label: n.label || n.id,
          fraud: isFraud,
          connections: n.connections || 0,
          val: isFraud ? 2 : 1, // Size
          color: COLORS[type]
        };
      });

      let links: Edge[] = apiEdges.map((e: any) => ({
        source: e.source,
        target: e.target,
        relationship: e.relationship,
        fraud: e.suspicious,
        color: e.suspicious ? "rgba(232,56,79,0.3)" : "rgba(143,163,180,0.2)"
      }));

      if (nodes.length === 0) {
          const fallback = makeFallbackGraph();
          nodes = fallback.nodes;
          links = fallback.links;
      }

      setGraphData({ nodes, links });
    } catch (e) {
      setGraphData(makeFallbackGraph());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(filter);
  }, [filter]);

  const nodes = graphData.nodes;
  const links = graphData.links;

  const showNode = (n: Node) => {
    if (searchQuery && !n.label.toLowerCase().includes(searchQuery.toLowerCase()) && !n.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return filter === "all" || !!n.fraud || links.some(e => e.fraud && ((typeof e.source === 'object' ? (e.source as any).id : e.source) === n.id || (typeof e.target === 'object' ? (e.target as any).id : e.target) === n.id));
  };
  
  const handleSimulateFraud = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    try {
      await Promise.all([
        apiFetch(`${API_BASE}/api/graph/simulate`, { method: "POST" }),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
      setFilter("fraud");
    } catch (e) {
      console.error("Simulation failed", e);
    } finally {
      setIsSimulating(false);
    }
  };
  
  const visibleNodes = nodes.filter(showNode);
  const visibleLinks = links.filter(e => {
      const srcId = typeof e.source === 'object' ? (e.source as any).id : e.source;
      const tgtId = typeof e.target === 'object' ? (e.target as any).id : e.target;
      return visibleNodes.find(n => n.id === srcId) && visibleNodes.find(n => n.id === tgtId);
  });

  return (
    <div className="space-y-10 pb-12 animate-fade-in-up relative z-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-20">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-1 bg-[var(--color-bob-orange)] rounded-full"></div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-bob-orange)] font-bold">Network Topology</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--color-text-main)] drop-shadow-md">
            Fraud Graph Explorer
          </h1>
          <p className="text-[var(--color-text-sub)] mt-3 text-sm max-w-xl leading-relaxed">
            Visualizing complex identity relationships, shared device fingerprints, and detected fraud rings.
          </p>
        </div>
      </div>

      <div className="bg-[var(--color-panel-bg)] backdrop-blur-3xl border border-[var(--color-glass-border)] rounded-[32px] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[var(--color-bob-orange)]/5 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none translate-y-1/2 -translate-x-1/2"></div>
        
        <div className="px-6 py-5 flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="flex bg-[var(--color-glass-bg)] rounded-[20px] p-1.5 border border-[var(--color-glass-border)] shadow-inner">
            {(["all","fraud"] as const).map(f => (
              <button key={f} onClick={()=>setFilter(f)}
                className={`px-4 py-2 text-xs rounded-[14px] font-bold tracking-wider transition-all duration-300 ${filter===f ? "bg-gradient-to-r from-[var(--color-bob-orange)] to-[var(--color-bob-orange-deep)] text-white shadow-[0_0_15px_rgba(242,101,34,0.4)]" : "text-[var(--color-text-sub)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-glass-hover)]"}`}>
                {f === "all" ? "All Nodes" : "Fraud Only"}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[240px] max-w-md">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search UID, IP, device hash…"
              className="w-full pl-11 pr-5 py-3.5 bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-2xl text-sm font-mono focus:border-[var(--color-bob-orange)]/50 focus:bg-[var(--color-glass-hover)] outline-none text-[var(--color-text-main)] transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)] placeholder-[var(--color-text-dim)]"
            />
          </div>
          
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-sub)] font-bold px-4 hidden sm:flex items-center gap-6">
            <div>
              <span className="text-[var(--color-bob-orange)] text-lg mr-2">{visibleNodes.length}</span> NODES · <span className="text-[var(--color-text-main)] text-lg ml-2 mr-2">{visibleLinks.length}</span> EDGES
            </div>
            
            <button 
              onClick={handleSimulateFraud}
              disabled={isSimulating}
              className="px-4 py-2 bg-gradient-to-r from-[var(--color-danger)] to-red-600 text-white rounded-xl font-bold tracking-widest shadow-[0_0_15px_rgba(232,56,79,0.3)] hover:shadow-[0_0_25px_rgba(232,56,79,0.6)] hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSimulating ? "Injecting Payload..." : "Simulate Fraud Ring"}
              {!isSimulating && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
            </button>
          </div>
        </div>

        <div className="p-4 grid lg:grid-cols-[1fr_400px] gap-6 relative z-10">
          {/* Graph Canvas Container */}
          <div className="relative overflow-hidden rounded-[24px] bg-[#0A111A] border border-[var(--color-glass-border)] shadow-inner" style={{ height: "650px" }}>
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(rgba(255,255,255,1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,1)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
            
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/50 backdrop-blur-sm">
                <div className="w-12 h-12 border-4 border-[var(--color-bob-orange)] border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(242,101,34,0.3)]"></div>
                <div className="text-sm font-mono tracking-[0.2em] uppercase text-[var(--color-bob-orange)] font-bold mt-6">Analyzing Topology…</div>
              </div>
            )}
            
            <ForceGraph3D
              ref={fgRef}
              width={800} // This would dynamically resize in a real app, keeping fixed for simplicity
              height={650}
              graphData={{ nodes: visibleNodes, links: visibleLinks }}
              nodeLabel="label"
              nodeColor="color"
              linkColor="color"
              linkWidth={link => (link as any).fraud ? 2 : 1}
              onNodeClick={(node: any) => setSelected(node)}
              nodeResolution={16}
              backgroundColor="#0A111A"
            />

            {/* Floating Legend */}
            <div className="absolute bottom-6 right-6 bg-black/60 backdrop-blur-xl border border-white/10 p-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-xs">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-4">Legend</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {([["User","user"],["Device","device"],["IP Address","ip"],["Fraud Node","fraud"]] as const).map(([l, t]) => (
                  <div key={l} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: COLORS[t as NodeType], color: COLORS[t as NodeType] }}/>
                    <span className="text-white/80 font-medium tracking-wide">{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar Details Bento */}
          <div className="relative">
            <div className="sticky top-6">
              {selected ? (
                <div className="bg-[var(--color-panel-bg)] backdrop-blur-2xl border border-[var(--color-glass-border)] rounded-[28px] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] animate-fade-in relative overflow-hidden group">
                  <div className={`absolute top-0 right-0 w-[200px] h-[200px] rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/2 transition-colors duration-1000 ${selected.fraud ? 'bg-[var(--color-danger)]/20' : 'bg-[var(--color-bob-orange)]/10'}`}></div>
                  
                  <div className="relative z-10">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)] font-bold mb-4">Node Inspector</div>
                    
                    <div className="flex items-center gap-4 mb-2">
                      <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shadow-lg" style={{ background: `${COLORS[selected.type]}20`, border: `1px solid ${COLORS[selected.type]}50` }}>
                        <div className="w-3 h-3 rounded-full" style={{ background: COLORS[selected.type] }}></div>
                      </div>
                      <div className="font-mono text-sm text-[var(--color-text-sub)] tracking-wider bg-[var(--color-glass-bg)] px-3 py-1.5 rounded-lg border border-[var(--color-glass-border)]">{selected.id.length > 25 ? selected.id.slice(0, 22) + "…" : selected.id}</div>
                    </div>
                    
                    <div className="text-2xl font-extrabold tracking-tight text-[var(--color-text-main)] mt-4 mb-8 leading-tight">{selected.label}</div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-2xl p-5 hover:bg-[var(--color-glass-hover)] transition-colors">
                        <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] mb-2">Type</div>
                        <div className="font-mono text-[15px] text-[var(--color-text-main)]">{selected.type.toUpperCase()}</div>
                      </div>
                      
                      <div className="bg-[var(--color-glass-bg)] border border-[var(--color-glass-border)] rounded-2xl p-5 hover:bg-[var(--color-glass-hover)] transition-colors relative overflow-hidden">
                        <div className="absolute right-0 bottom-0 text-[60px] font-extrabold text-[var(--color-text-main)] opacity-[0.03] leading-none pointer-events-none translate-y-2">{selected.connections || visibleLinks.filter(e=>(typeof e.source === 'object' ? (e.source as any).id : e.source)===selected.id||(typeof e.target === 'object' ? (e.target as any).id : e.target)===selected.id).length}</div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] mb-2 relative z-10">Edges</div>
                        <div className="font-mono text-[24px] text-[var(--color-text-main)] relative z-10 tracking-tighter">
                          {selected.connections || visibleLinks.filter(e=>(typeof e.source === 'object' ? (e.source as any).id : e.source)===selected.id||(typeof e.target === 'object' ? (e.target as any).id : e.target)===selected.id).length}
                        </div>
                      </div>
                      
                      <div className={`col-span-2 bg-[var(--color-glass-bg)] border rounded-2xl p-5 transition-colors flex items-center justify-between ${selected.fraud ? 'border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5' : 'border-[var(--color-glass-border)]'}`}>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] mb-2">Risk Posture</div>
                          <div className={`font-bold tracking-widest uppercase flex items-center gap-2 ${selected.fraud ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                            {selected.fraud && <div className="w-2 h-2 rounded-full bg-[var(--color-danger)] animate-pulse"></div>}
                            {selected.fraud ? "High Risk" : "Normal"}
                          </div>
                        </div>
                        <svg className={`w-8 h-8 opacity-30 ${selected.fraud ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={selected.fraud ? "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" : "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"} /></svg>
                      </div>
                    </div>

                    {selected.fraud && (
                      <div className="mt-6 p-4 rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 shadow-[inset_0_0_15px_rgba(232,56,79,0.1)] relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--color-danger)]"></div>
                        <div className="text-sm font-bold text-[var(--color-danger)] uppercase tracking-wider pl-2 flex items-center gap-2">
                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                           Fraud Ring Member
                        </div>
                        <p className="text-xs text-[var(--color-danger)]/70 mt-2 pl-2">This entity shares telemetry with known bad actors or suspicious clusters.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--color-glass-bg)] backdrop-blur-xl border border-[var(--color-glass-border)] rounded-[32px] p-10 h-full flex flex-col items-center justify-center text-center shadow-inner border-dashed">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-[var(--color-glass-border)] flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.25em] text-[var(--color-text-sub)] font-bold mb-3">Graph Inspector</div>
                  <p className="text-sm text-[var(--color-text-dim)] leading-relaxed max-w-[250px]">Select any node in the topology visualization to inspect its risk profile and edges.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function makeFallbackGraph(): { nodes: Node[]; links: Edge[] } {
  const nodes: Node[] = [];
  const links: Edge[] = [];
  for (let i = 0; i < 6; i++) nodes.push({ id: `u${i}`, type: "user", label: `User ${i+1}`, connections:0, color: COLORS.user });
  for (let i = 0; i < 4; i++) nodes.push({ id: `d${i}`, type: "device", label: `Device ${i+1}`, connections:0, color: COLORS.device });
  for (let i = 0; i < 3; i++) nodes.push({ id: `ip${i}`, type: "ip", label: `IP ${i+1}`, connections:0, color: COLORS.ip });
  for (let i = 0; i < 12; i++) {
    const a = nodes[Math.floor(Math.random()*nodes.length)];
    const b = nodes[Math.floor(Math.random()*nodes.length)];
    if (a.id !== b.id) links.push({ source: a.id, target: b.id, relationship: "USES", color: "rgba(143,163,180,0.2)" });
  }
  for (let i = 0; i < 6; i++) nodes.push({ id: `f${i}`, type: i===0?"ip":"user", label: i===0?"Shared IP":`Mule ${i}`, fraud:true, connections:0, color: i===0?COLORS.ip:COLORS.user });
  const hub = nodes[nodes.length-6].id;
  for (let i = 1; i < 6; i++) links.push({ source: hub, target: nodes[nodes.length-6+i].id, relationship: "SUSPECTED_MEMBER_OF", fraud: true, color: "rgba(232,56,79,0.3)" });
  links.push({ source: nodes[nodes.length-5].id, target: "u3", relationship: "LINKED_TO", fraud: true, color: "rgba(232,56,79,0.3)" });
  
  return { nodes, links };
}
