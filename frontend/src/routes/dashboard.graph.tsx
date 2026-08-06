import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import ForceGraph3D from "react-force-graph-3d";
import { Search, AlertTriangle, ShieldAlert, ShieldCheck, Waypoints, Zap } from "lucide-react";

export const Route = createFileRoute("/dashboard/graph")({
  head: () => ({ meta: [{ title: "Fraud graph · TrustSphere" }] }),
  component: GraphPage,
});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

type NodeType = "user" | "device" | "ip" | "fraud" | "applicant";
type Node = { id: string; type: NodeType; label: string; fraud?: boolean; connections: number; val?: number; color?: string };
type Edge = { source: string; target: string; relationship: string; fraud?: boolean; color?: string };

const COLORS: Record<NodeType, string> = {
  user: "#4A8FE0", device: "#E07A3F", ip: "#9C7FD4", fraud: "#E5534B", applicant: "#3FBE82",
};

function mapNodeType(apiType: string): NodeType {
  switch (apiType) {
    case "USER": return "user";
    case "DEVICE": return "device";
    case "IP": return "ip";
    case "FRAUD_RING": return "fraud";
    case "APPLICANT": return "applicant";
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
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadData = async (currentFilter: "all" | "fraud") => {
    setLoading(true);
    setFetchError(null);
    try {
      const filterParam = currentFilter === "fraud" ? "fraud_only" : "all";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const r = await apiFetch(`${API_BASE}/api/graph/nodes?filter=${filterParam}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await r.json();

      let nodes: Node[] = (data.nodes || []).map((n: any) => {
        const type = mapNodeType(n.type);
        const isFraud = n.risk_flag || type === "fraud";
        return { id: n.id, type, label: n.label || n.id, fraud: isFraud, connections: n.connections || 0, val: isFraud ? 2 : 1, color: COLORS[type] };
      });
      let links: Edge[] = (data.edges || []).map((e: any) => ({
        source: e.source, target: e.target, relationship: e.relationship, fraud: e.suspicious,
        color: e.suspicious ? "rgba(229,83,75,0.4)" : "rgba(148,158,176,0.25)",
      }));

      if (nodes.length === 0) {
        const fallback = makeFallbackGraph();
        nodes = fallback.nodes; links = fallback.links;
      }
      setGraphData({ nodes, links });
    } catch (e: any) {
      setFetchError(e.name === "AbortError" ? "Connection timed out. Showing simulated topology." : "Connection failed. Showing simulated topology.");
      setGraphData(makeFallbackGraph());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(filter); }, [filter]);

  const { nodes, links } = graphData;

  const showNode = (n: Node) => {
    if (searchQuery && !n.label.toLowerCase().includes(searchQuery.toLowerCase()) && !n.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return filter === "all" || !!n.fraud || links.some(e => e.fraud && ((typeof e.source === "object" ? (e.source as any).id : e.source) === n.id || (typeof e.target === "object" ? (e.target as any).id : e.target) === n.id));
  };

  const handleSimulateFraud = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    try {
      await Promise.all([apiFetch(`${API_BASE}/api/graph/simulate`, { method: "POST" }), new Promise(resolve => setTimeout(resolve, 1500))]);
      setFilter("fraud");
    } catch (e) {
      console.error("Simulation failed", e);
    } finally {
      setIsSimulating(false);
    }
  };

  const visibleNodes = nodes.filter(showNode);
  const visibleLinks = links.filter(e => {
    const srcId = typeof e.source === "object" ? (e.source as any).id : e.source;
    const tgtId = typeof e.target === "object" ? (e.target as any).id : e.target;
    return visibleNodes.find(n => n.id === srcId) && visibleNodes.find(n => n.id === tgtId);
  });

  const LEGEND: [string, NodeType][] = [["User", "user"], ["Applicant", "applicant"], ["Device", "device"], ["IP address", "ip"], ["Fraud node", "fraud"]];

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-main)]">Fraud graph explorer</h1>
        <p className="text-[13.5px] text-[var(--color-text-sub)] mt-1">Visualizing identity relationships, shared device fingerprints, and detected fraud rings.</p>
      </div>

      <div className="surface-card">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-default)]">
          <div className="flex gap-1">
            {(["all", "fraud"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors duration-100 ${filter === f ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-brand)]" : "text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sunken)]"}`}>
                {f === "all" ? "All nodes" : "Fraud only"}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={15} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search UID, IP, device hash…" className="input-field w-full pl-9" />
          </div>

          <div className="flex items-center gap-4">
            <div className="font-mono text-[12px] text-[var(--color-text-sub)]">
              <span className="font-semibold text-[var(--color-text-main)]">{visibleNodes.length}</span> nodes · <span className="font-semibold text-[var(--color-text-main)]">{visibleLinks.length}</span> edges
            </div>
            <button onClick={handleSimulateFraud} disabled={isSimulating} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium text-white transition-colors duration-100 disabled:opacity-50" style={{ background: "var(--color-danger)" }}>
              {isSimulating ? "Injecting…" : <>Simulate fraud ring <Zap size={13} strokeWidth={2} /></>}
            </button>
          </div>
        </div>

        <div className="p-4 grid lg:grid-cols-[1fr_340px] gap-4">
          <div className="relative overflow-hidden rounded-md border border-[var(--color-border-default)]" style={{ height: "600px", background: "#0B0D11" }}>
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/40">
                <div className="text-[13px] font-medium text-white/80">Analyzing topology…</div>
              </div>
            )}
            {fetchError && !loading && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium" style={{ background: "rgba(227,166,62,0.15)", border: "1px solid rgba(227,166,62,0.3)", color: "#E3A63E" }}>
                <AlertTriangle size={13} strokeWidth={2} />
                {fetchError}
              </div>
            )}

            <ForceGraph3D
              ref={fgRef}
              width={800}
              height={600}
              graphData={{ nodes: visibleNodes, links: visibleLinks }}
              nodeLabel="label"
              nodeColor="color"
              linkColor="color"
              linkWidth={(link) => ((link as any).fraud ? 2 : 1)}
              onNodeClick={(node: any) => setSelected(node)}
              nodeResolution={16}
              backgroundColor="#0B0D11"
            />

            <div className="absolute bottom-4 right-4 bg-black/70 border border-white/10 p-4 rounded-md text-[11.5px]">
              <div className="label-caps text-white/40 mb-2.5">Legend</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {LEGEND.map(([l, t]) => (
                  <div key={l} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[t] }} />
                    <span className="text-white/75">{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="sticky top-6 h-fit">
            {selected ? (
              <div className="surface-card p-6">
                <div className="label-caps text-[var(--color-text-dim)] mb-3">Node inspector</div>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[selected.type] }} />
                  <span className="font-mono text-[12px] text-[var(--color-text-sub)] truncate">{selected.id.length > 28 ? selected.id.slice(0, 25) + "…" : selected.id}</span>
                </div>
                <div className="text-[17px] font-semibold text-[var(--color-text-main)] mb-5 leading-tight">{selected.label}</div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-md border border-[var(--color-border-default)]">
                    <div className="label-caps text-[var(--color-text-dim)] mb-1">Type</div>
                    <div className="font-mono text-[13px] text-[var(--color-text-main)]">{selected.type}</div>
                  </div>
                  <div className="p-3 rounded-md border border-[var(--color-border-default)]">
                    <div className="label-caps text-[var(--color-text-dim)] mb-1">Edges</div>
                    <div className="font-mono text-[18px] text-[var(--color-text-main)]">
                      {selected.connections || visibleLinks.filter(e => (typeof e.source === "object" ? (e.source as any).id : e.source) === selected.id || (typeof e.target === "object" ? (e.target as any).id : e.target) === selected.id).length}
                    </div>
                  </div>
                  <div className="col-span-2 p-3 rounded-md border flex items-center justify-between" style={{ borderColor: selected.fraud ? "var(--color-danger-border)" : "var(--color-border-default)", background: selected.fraud ? "var(--color-danger-bg)" : "transparent" }}>
                    <div>
                      <div className="label-caps text-[var(--color-text-dim)] mb-1">Risk posture</div>
                      <div className="text-[13px] font-medium" style={{ color: selected.fraud ? "var(--color-danger)" : "var(--color-success)" }}>{selected.fraud ? "High risk" : "Normal"}</div>
                    </div>
                    {selected.fraud ? <ShieldAlert size={20} strokeWidth={1.75} style={{ color: "var(--color-danger)" }} /> : <ShieldCheck size={20} strokeWidth={1.75} style={{ color: "var(--color-success)" }} />}
                  </div>
                </div>

                {selected.fraud && (
                  <div className="mt-4 p-3.5 rounded-md" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
                    <div className="text-[12.5px] font-medium" style={{ color: "var(--color-danger)" }}>Fraud ring member</div>
                    <p className="text-[12px] text-[var(--color-text-sub)] mt-1">This entity shares telemetry with known bad actors or suspicious clusters.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="surface-card p-8 flex flex-col items-center justify-center text-center min-h-[280px]">
                <Waypoints size={24} strokeWidth={1.5} className="text-[var(--color-text-dim)] mb-3" />
                <div className="label-caps text-[var(--color-text-dim)] mb-2">Graph inspector</div>
                <p className="text-[12.5px] text-[var(--color-text-sub)] leading-relaxed max-w-[220px]">Select any node in the topology to inspect its risk profile and edges.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function makeFallbackGraph(): { nodes: Node[]; links: Edge[] } {
  const nodes: Node[] = [];
  const links: Edge[] = [];
  for (let i = 0; i < 6; i++) nodes.push({ id: `u${i}`, type: "user", label: `User ${i + 1}`, connections: 0, color: COLORS.user });
  for (let i = 0; i < 4; i++) nodes.push({ id: `d${i}`, type: "device", label: `Device ${i + 1}`, connections: 0, color: COLORS.device });
  for (let i = 0; i < 3; i++) nodes.push({ id: `ip${i}`, type: "ip", label: `IP ${i + 1}`, connections: 0, color: COLORS.ip });
  for (let i = 0; i < 12; i++) {
    const a = nodes[Math.floor(Math.random() * nodes.length)];
    const b = nodes[Math.floor(Math.random() * nodes.length)];
    if (a.id !== b.id) links.push({ source: a.id, target: b.id, relationship: "USES", color: "rgba(148,158,176,0.25)" });
  }
  for (let i = 0; i < 6; i++) nodes.push({ id: `f${i}`, type: i === 0 ? "ip" : "user", label: i === 0 ? "Shared IP" : `Mule ${i}`, fraud: true, connections: 0, color: i === 0 ? COLORS.ip : COLORS.user });
  const hub = nodes[nodes.length - 6].id;
  for (let i = 1; i < 6; i++) links.push({ source: hub, target: nodes[nodes.length - 6 + i].id, relationship: "SUSPECTED_MEMBER_OF", fraud: true, color: "rgba(229,83,75,0.4)" });
  links.push({ source: nodes[nodes.length - 5].id, target: "u3", relationship: "LINKED_TO", fraud: true, color: "rgba(229,83,75,0.4)" });
  return { nodes, links };
}
