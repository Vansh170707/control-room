import React from "react";
import { Badge } from "@/components/ui/badge";
import type { TaskTree, TaskTreeNode } from "@/lib/orchestration";
import { cn } from "@/lib/utils";

function statusVariant(status: TaskTreeNode["status"]): "emerald" | "cyan" | "amber" | "danger" | "muted" {
  if (status === "completed") return "emerald";
  if (status === "running" || status === "planning") return "cyan";
  if (status === "waiting_for_approval") return "amber";
  if (status === "failed" || status === "blocked") return "danger";
  return "muted";
}

export function TaskTreePanel({
  taskTrees,
  selectedTaskTreeId,
  onSelectTaskTree,
}: {
  taskTrees: TaskTree[];
  selectedTaskTreeId?: string | null;
  onSelectTaskTree?: (taskTreeId: string) => void;
}) {
  if (taskTrees.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 px-4 py-6 text-[12px] text-[#6e7681]">
        No task trees yet. Send a routed request to see the orchestration plan.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
      <div className="border-b border-[#1e252e] px-4 py-3">
        <p className="text-sm font-semibold text-[#e2e8f0]">Task Trees</p>
        <p className="text-[12px] text-[#8b949e]">
          Recursive orchestration plans, delegation slices, and verifier gates.
        </p>
      </div>
      <div className="divide-y divide-[#1e252e]">
        {taskTrees.map((taskTree) => (
          <button
            key={taskTree.id}
            type="button"
            onClick={() => onSelectTaskTree?.(taskTree.id)}
            className={cn(
              "w-full px-4 py-3 text-left transition-colors",
              selectedTaskTreeId === taskTree.id
                ? "bg-[#111827]"
                : "hover:bg-[#111827]/50",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-[#e2e8f0]">
                  {taskTree.rootPrompt}
                </p>
                <p className="mt-1 text-[11px] text-[#6e7681]">
                  {taskTree.nodes.length} nodes · root {taskTree.rootAgentId}
                </p>
              </div>
              <Badge variant={statusVariant(taskTree.status)}>
                {taskTree.status}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              {taskTree.nodes.slice(0, 5).map((node) => (
                <div
                  key={node.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-[#dbe7f2]">
                      {node.title}
                    </p>
                    <p className="mt-1 text-[11px] text-[#6e7681]">
                      {node.kind} · {node.assignedAgentId || "unassigned"}
                    </p>
                  </div>
                  <Badge variant={statusVariant(node.status)}>{node.status}</Badge>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
