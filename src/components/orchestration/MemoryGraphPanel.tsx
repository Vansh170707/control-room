import React from "react";
import { Badge } from "@/components/ui/badge";
import type { KnowledgeGraph } from "@/lib/orchestration";

function nodeTone(type: string) {
  if (type === "agent") return "border-[#10b981]/20 bg-[#10b981]/10 text-[#86efac]";
  if (type === "technology") return "border-[#06b6d4]/20 bg-[#06b6d4]/10 text-[#67e8f9]";
  if (type === "channel") return "border-[#818cf8]/20 bg-[#818cf8]/10 text-[#c4b5fd]";
  return "border-white/8 bg-white/[0.03] text-[#cbd5e1]";
}

export function MemoryGraphPanel({
  graph,
}: {
  graph: KnowledgeGraph | null;
}) {
  return (
    <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
      <div className="border-b border-[#1e252e] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#e2e8f0]">Memory Graph</p>
            <p className="text-[12px] text-[#8b949e]">
              Global preferences, channel context, and agent memory provenance.
            </p>
          </div>
          {graph ? <Badge variant="cyan">{graph.nodes.length} nodes</Badge> : null}
        </div>
      </div>
      {graph ? (
        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {graph.nodes.slice(0, 18).map((node) => (
              <span
                key={node.id}
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${nodeTone(node.type)}`}
              >
                {node.label}
              </span>
            ))}
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#6e7681]">
              Relations
            </p>
            <div className="mt-3 space-y-2">
              {graph.edges.slice(0, 8).map((edge) => (
                <div
                  key={edge.id}
                  className="flex items-center gap-2 text-[12px] text-[#cbd5e1]"
                >
                  <span className="rounded-md bg-white/[0.04] px-2 py-1">
                    {graph.nodes.find((node) => node.id === edge.from)?.label || edge.from}
                  </span>
                  <span className="text-[#6e7681]">{edge.relation}</span>
                  <span className="rounded-md bg-white/[0.04] px-2 py-1">
                    {graph.nodes.find((node) => node.id === edge.to)?.label || edge.to}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 text-[12px] text-[#6e7681]">
          No graph built yet. Open an agent thread and memory provenance will appear here.
        </div>
      )}
    </div>
  );
}
