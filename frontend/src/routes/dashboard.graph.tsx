import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { DashHeader } from "@/components/Sidebar";
import ForceGraph2D from "react-force-graph-2d";

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
  const fgRef = useRef<any>();

  useEffect(() => {
    setLoading(true);
    const filterParam = filter === "fraud" ? "fraud_only" : "all";
    apiFetch(`${API_BASE}/api/graph/nodes?filter=${filterParam}`)
      .then(r => r.json())
      .then(data => {
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
          color: e.suspicious ? "#E8384F55" : "#1E3248"
        }));

        if (nodes.length === 0) {
            const fallback = makeFallbackGraph();
            nodes = fallback.nodes;
            links = fallback.links;
        }

        setGraphData({ nodes, links });
        setLoading(false);
      })
      .catch(() => {
        setGraphData(makeFallbackGraph());
        setLoading(false);
      });
  }, [filter]);

  const nodes = graphData.nodes;
  const links = graphData.links;

  const showNode = (n: Node) => filter === "all" || !!n.fraud || links.some(e => e.fraud && ((typeof e.source === 'object' ? (e.source as any).id : e.source) === n.id || (typeof e.target === 'object' ? (e.target as any).id : e.target) === n.id));
  
  const visibleNodes = nodes.filter(showNode);
  const visibleLinks = links.filter(e => {
      const srcId = typeof e.source === 'object' ? (e.source as any).id : e.source;
      const tgtId = typeof e.target === 'object' ? (e.target as any).id : e.target;
      return visibleNodes.find(n => n.id === srcId) && visibleNodes.find(n => n.id === tgtId);
  });

  return (
    <div>
      <DashHeader title="Fraud Graph Explorer" subtitle="Identity relationships, shared devices, and detected fraud rings." />

      <div className="surface-card mb-4 p-3 flex items-center gap-3">
        <div className="flex bg-[var(--color-navy)] rounded-md p-1">
          {(["all","fraud"] as const).map(f => (
            <button key={f} onClick={()=>setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded font-medium transition ${filter===f ? "bg-[var(--color-bob-orange)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}>
              {f === "all" ? "All Nodes" : "Fraud Only"}
            </button>
          ))}
        </div>
        <input placeholder="Search UID, IP, device hash…"
          className="flex-1 max-w-xs px-3 py-1.5 bg-[var(--color-navy)] border border-[var(--color-navy-border)] rounded-md text-xs font-mono focus:border-[var(--color-bob-orange)] outline-none"/>
        <div className="ml-auto font-mono text-[10px] text-[var(--color-text-muted)]">{visibleNodes.length} nodes · {visibleLinks.length} edges</div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="surface-card relative overflow-hidden" style={{ background: "#060F1A", height: "560px" }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-[var(--color-text-secondary)] animate-pulse">Loading graph data…</div>
            </div>
          )}
          
          <ForceGraph2D
            ref={fgRef}
            width={800}
            height={560}
            graphData={{ nodes: visibleNodes, links: visibleLinks }}
            nodeLabel="label"
            nodeColor="color"
            linkColor="color"
            linkWidth={link => (link as any).fraud ? 1.5 : 1}
            onNodeClick={(node: any) => setSelected(node)}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = node.label;
              const fontSize = 12/globalScale;
              ctx.font = `${fontSize}px Sans-Serif`;
              const textWidth = ctx.measureText(label).width;
              const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

              ctx.fillStyle = 'rgba(6, 15, 26, 0.8)';
              ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2 + 10, bckgDimensions[0], bckgDimensions[1]);

              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#8FA3B4';
              ctx.fillText(label, node.x, node.y + 10);

              ctx.beginPath();
              ctx.arc(node.x, node.y, node.fraud ? 6 : 4, 0, 2 * Math.PI, false);
              ctx.fillStyle = node.color;
              ctx.fill();
              
              if (node.fraud) {
                  ctx.lineWidth = 1 / globalScale;
                  ctx.strokeStyle = '#E8384F';
                  ctx.stroke();
              }
            }}
          />

          {/* legend */}
          <div className="absolute bottom-4 right-4 surface-card p-3 text-[10px] z-10">
            <div className="label-caps text-[var(--color-text-muted)] mb-2">Legend</div>
            {([["User","user"],["Device","device"],["IP Address","ip"],["Fraud Node","fraud"]] as const).map(([l, t]) => (
              <div key={l} className="flex items-center gap-2 py-0.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[t as NodeType] }}/>
                <span className="text-[var(--color-text-secondary)]">{l}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card p-5 h-fit sticky top-6">
          {selected ? (
            <div className="animate-fade-in">
              <div className="label-caps text-[var(--color-text-muted)]">Node Detail</div>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-3 h-3 rounded-full" style={{ background: COLORS[selected.type] }}/>
                <div className="font-mono text-sm">{selected.id.length > 20 ? selected.id.slice(0, 18) + "…" : selected.id}</div>
              </div>
              <div className="text-xl font-bold tracking-tight mt-1">{selected.label}</div>
              <div className="grid grid-cols-2 gap-3 mt-5">
                <Stat l="Type" v={selected.type.toUpperCase()} />
                <Stat l="Connections" v={selected.connections || visibleLinks.filter(e=>(typeof e.source === 'object' ? (e.source as any).id : e.source)===selected.id||(typeof e.target === 'object' ? (e.target as any).id : e.target)===selected.id).length} />
                <Stat l="Risk" v={selected.fraud ? "HIGH" : "NORMAL"} danger={selected.fraud}/>
                <Stat l="Last seen" v="recent" />
              </div>
              {selected.fraud && (
                <div className="mt-4 chip chip-danger">Fraud ring member</div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">◌</div>
              <div className="label-caps text-[var(--color-text-muted)]">Select a node</div>
              <p className="text-xs text-[var(--color-text-secondary)] mt-2">Click any node in the graph to inspect its connections and risk profile.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ l, v, danger }: { l: string; v: React.ReactNode; danger?: boolean }) {
  return (
    <div className="bg-[var(--color-navy)] rounded-md p-2.5">
      <div className="label-caps text-[var(--color-text-muted)]">{l}</div>
      <div className={`font-mono text-sm mt-1 ${danger ? "text-[var(--color-danger)]" : ""}`}>{v}</div>
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
    if (a.id !== b.id) links.push({ source: a.id, target: b.id, relationship: "USES", color: "#1E3248" });
  }
  for (let i = 0; i < 6; i++) nodes.push({ id: `f${i}`, type: i===0?"ip":"user", label: i===0?"Shared IP":`Mule ${i}`, fraud:true, connections:0, color: i===0?COLORS.ip:COLORS.user });
  const hub = nodes[nodes.length-6].id;
  for (let i = 1; i < 6; i++) links.push({ source: hub, target: nodes[nodes.length-6+i].id, relationship: "SUSPECTED_MEMBER_OF", fraud: true, color: "#E8384F55" });
  links.push({ source: nodes[nodes.length-5].id, target: "u3", relationship: "LINKED_TO", fraud: true, color: "#E8384F55" });
  
  return { nodes, links };
}
