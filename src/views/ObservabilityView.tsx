import { Badge } from "@/components/ui/badge";
import { MemoryGraphPanel } from "@/components/orchestration/MemoryGraphPanel";
import { TaskTreePanel } from "@/components/orchestration/TaskTreePanel";
import { VerifierPanel } from "@/components/orchestration/VerifierPanel";
import type {
  CircuitBreakerEvent,
  DispatcherDecision,
  KnowledgeGraph,
  PlanReviewRequest,
  TaskTree,
  VerifierReview,
} from "@/lib/orchestration";
import type { ToolDefinition, ToolInvocationResult } from "@/lib/tool-definitions";
import type {
  CommandRun,
  WorkspaceAgent,
} from "@/types";

interface ObservabilityViewProps {
  runtimeRuns: CommandRun[];
  toolInvocationResults: ToolInvocationResult[];
  selectedAgent: WorkspaceAgent | null;
  selectedAgentCapabilityGroups: Array<{
    category: ToolDefinition["category"];
    label: string;
    tools: ToolDefinition[];
  }>;
  taskTrees: TaskTree[];
  selectedTaskTree: TaskTree | null;
  setSelectedTaskTreeId: (id: string | null) => void;
  selectedKnowledgeGraph: KnowledgeGraph | null;
  selectedVerifierReviews: VerifierReview[];
  latestDispatcherDecision: DispatcherDecision | null;
  planReviews: PlanReviewRequest[];
  setActivePlanReviewId: (id: string | null) => void;
  circuitBreakerEvents: CircuitBreakerEvent[];
  runStatusMeta: Record<
    string,
    {
      label: string;
      badgeVariant: "emerald" | "amber" | "danger" | "muted" | "cyan";
    }
  >;
  formatRelativeTime: (date: string | Date) => string;
  deriveAgentHierarchy: (agent: WorkspaceAgent) => string;
}

export function ObservabilityView({
  runtimeRuns,
  toolInvocationResults,
  selectedAgent,
  selectedAgentCapabilityGroups,
  taskTrees,
  selectedTaskTree,
  setSelectedTaskTreeId,
  selectedKnowledgeGraph,
  selectedVerifierReviews,
  latestDispatcherDecision,
  planReviews,
  setActivePlanReviewId,
  circuitBreakerEvents,
  runStatusMeta,
  formatRelativeTime,
  deriveAgentHierarchy,
}: ObservabilityViewProps) {
  return (
    <div className="space-y-4 mt-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/50 p-3">
          <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
            Total Runs
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#e2e8f0]">
            {runtimeRuns.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/50 p-3">
          <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
            Completed
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#34d399]">
            {runtimeRuns.filter((r) => r.status === "completed").length}
          </p>
        </div>
        <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/50 p-3">
          <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
            Failed
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#f87171]">
            {runtimeRuns.filter((r) => r.status === "failed").length}
          </p>
        </div>
        <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/50 p-3">
          <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
            Avg Duration
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#e2e8f0]">
            {runtimeRuns.length > 0
              ? `${Math.round(runtimeRuns.reduce((s, r) => s + (r.durationMs || 0), 0) / runtimeRuns.filter((r) => r.durationMs).length)}ms`
              : "—"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e252e]">
          <p className="text-sm font-semibold text-[#e2e8f0]">
            Run Timeline
          </p>
          <p className="text-[12px] text-[#8b949e]">
            Replayable history of all agent executions.
          </p>
        </div>
        <div className="divide-y divide-[#1e252e]">
          {runtimeRuns.slice(0, 15).map((run) => {
            const rsm = runStatusMeta[run.status] || runStatusMeta.failed;
            return (
              <div
                key={run.id}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={
                      "w-2 h-2 rounded-full flex-shrink-0 " +
                      (run.status === "running" ||
                      run.status === "planning"
                        ? "bg-[#fbbf24] animate-pulse"
                        : run.status === "completed"
                          ? "bg-[#34d399]"
                          : run.status === "queued"
                            ? "bg-[#818cf8]"
                            : run.status === "waiting_for_approval"
                              ? "bg-[#f59e0b]"
                              : run.status === "blocked"
                                ? "bg-[#fb7185]"
                                : "bg-[#f87171]")
                    }
                  ></div>
                  <div className="min-w-0">
                    <p className="text-[13px] text-[#e2e8f0] truncate">
                      {run.command}
                    </p>
                    <p className="text-[11px] text-[#6e7681]">
                      {run.agentName || run.agentId} ·{" "}
                      {formatRelativeTime(run.createdAt)}
                      {run.model && ` · ${run.provider}/${run.model}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {run.durationMs != null && (
                    <span className="text-[10px] text-[#6e7681]">
                      {run.durationMs}ms
                    </span>
                  )}
                  {(run.retryCount ?? 0) > 0 && (
                    <span className="text-[9px] text-[#818cf8]">
                      retry {run.retryCount}
                    </span>
                  )}
                  <Badge variant={rsm.badgeVariant}>{rsm.label}</Badge>
                </div>
              </div>
            );
          })}
          {runtimeRuns.length === 0 && (
            <div className="px-4 py-8 text-center text-[12px] text-[#6e7681]">
              No runs recorded yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e252e]">
          <p className="text-sm font-semibold text-[#e2e8f0]">
            Tool Invocations
          </p>
          <p className="text-[12px] text-[#8b949e]">
            Recent tool calls across all agents.
          </p>
        </div>
        <div className="divide-y divide-[#1e252e]">
          {toolInvocationResults.slice(0, 10).map((result, i) => (
            <div
              key={i}
              className="px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className={
                    "inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium " +
                    (result.ok
                      ? "border-[#34d399]/30 bg-[#34d399]/10 text-[#6ee7b7]"
                      : "border-[#f87171]/30 bg-[#f87171]/10 text-[#fca5a5]")
                  }
                >
                  {result.tool}
                </span>
                {result.approvalRequired && (
                  <span className="text-[10px] text-[#fbbf24]">
                    approval needed
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {result.data?.durationMs != null && (
                  <span className="text-[10px] text-[#6e7681]">
                    {Number(result.data.durationMs)}ms
                  </span>
                )}
                <span
                  className={
                    "text-[10px] " +
                    (result.ok ? "text-[#34d399]" : "text-[#f87171]")
                  }
                >
                  {result.ok ? "ok" : "failed"}
                </span>
              </div>
            </div>
          ))}
          {toolInvocationResults.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-[#6e7681]">
              No tool invocations yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e252e]">
          <p className="text-sm font-semibold text-[#e2e8f0]">
            Agent Tool Surface
          </p>
          <p className="text-[12px] text-[#8b949e]">
            {selectedAgent
              ? `Capabilities currently enabled for ${selectedAgent.name}.`
              : "Select an agent to inspect its enabled tools."}
          </p>
        </div>
        {selectedAgent ? (
          <div className="space-y-4 px-4 py-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[#e2e8f0]">
                  {selectedAgent.emoji} {selectedAgent.name}
                </p>
                <p className="mt-1 text-[11px] text-[#6e7681]">
                  {selectedAgent.provider} · {selectedAgent.model} ·{" "}
                  {selectedAgent.role}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted">
                  {deriveAgentHierarchy(selectedAgent)}
                </Badge>
                <Badge
                  variant={
                    selectedAgent.sandboxMode === "workspace-write"
                      ? "emerald"
                      : selectedAgent.sandboxMode === "read-only"
                        ? "amber"
                        : "muted"
                  }
                >
                  {selectedAgent.sandboxMode}
                </Badge>
                <Badge
                  variant={
                    selectedAgent.status === "active"
                      ? "cyan"
                      : selectedAgent.status === "idle"
                        ? "muted"
                        : selectedAgent.status === "error"
                          ? "danger"
                          : "muted"
                  }
                >
                  {selectedAgent.status}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {selectedAgentCapabilityGroups.length > 0 ? (
                selectedAgentCapabilityGroups.map((group) => (
                  <div
                    key={group.category}
                    className="rounded-xl border border-white/8 bg-white/[0.02] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[13px] font-medium text-[#e2e8f0]">
                        {group.label}
                      </p>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-[#6e8398]">
                        {group.tools.length} tools
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.tools.map((tool) => (
                        <span
                          key={tool.name}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0d1117] px-2.5 py-1 text-[10px] text-[#c8d3de]"
                        >
                          <span>{tool.name}</span>
                          {tool.requiresApproval && (
                            <span className="rounded-full bg-[#f59e0b]/15 px-1.5 py-0.5 text-[9px] text-[#fbbf24]">
                              approval
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-[12px] text-[#6e7681] xl:col-span-2">
                  This agent does not have any runtime tools enabled yet.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-[12px] text-[#6e7681]">
            No agent selected.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TaskTreePanel
          taskTrees={selectedAgent ? taskTrees.filter((tree) => tree.rootAgentId === selectedAgent.id) : taskTrees}
          selectedTaskTreeId={selectedTaskTree?.id ?? null}
          onSelectTaskTree={setSelectedTaskTreeId}
        />
        <MemoryGraphPanel graph={selectedKnowledgeGraph} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <VerifierPanel
          reviews={selectedVerifierReviews}
          selectedAgentId={selectedAgent?.id ?? null}
        />
        <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
          <div className="border-b border-[#1e252e] px-4 py-3">
            <p className="text-sm font-semibold text-[#e2e8f0]">
              Plan Reviews & Circuit Breakers
            </p>
            <p className="text-[12px] text-[#8b949e]">
              Strategic review gates, dispatcher snapshots, and loop intervention signals.
            </p>
          </div>
          <div className="divide-y divide-[#1e252e]">
            {latestDispatcherDecision ? (
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-[#e2e8f0]">
                      Latest dispatch
                    </p>
                    <p className="mt-1 text-[11px] text-[#6e7681]">
                      {latestDispatcherDecision.intent} · {latestDispatcherDecision.lane} · score {latestDispatcherDecision.complexityScore}
                    </p>
                  </div>
                  <Badge
                    variant={
                      latestDispatcherDecision.riskLevel === "danger"
                        ? "danger"
                        : latestDispatcherDecision.riskLevel === "caution"
                          ? "amber"
                          : "emerald"
                    }
                  >
                    {latestDispatcherDecision.riskLevel}
                  </Badge>
                </div>
                <p className="mt-3 text-[12px] text-[#8b949e]">
                  {latestDispatcherDecision.reason}
                </p>
              </div>
            ) : null}
            {planReviews.slice(0, 3).map((review) => (
              <button
                key={review.id}
                type="button"
                onClick={() => setActivePlanReviewId(review.id)}
                className="w-full px-4 py-3 text-left transition-colors hover:bg-[#111827]/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-[#e2e8f0]">
                      {review.title}
                    </p>
                    <p className="mt-1 text-[11px] text-[#6e7681]">
                      {review.steps.length} steps · {review.status}
                    </p>
                  </div>
                  <Badge
                    variant={
                      review.status === "approved"
                        ? "emerald"
                        : review.status === "rejected"
                          ? "danger"
                          : "amber"
                    }
                  >
                    {review.status}
                  </Badge>
                </div>
              </button>
            ))}
            {circuitBreakerEvents.slice(0, 3).map((event) => (
              <div key={event.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-medium text-[#e2e8f0]">
                    Circuit breaker
                  </p>
                  <Badge variant="danger">{event.resolution}</Badge>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-[#8b949e]">
                  {event.reason}
                </p>
              </div>
            ))}
            {planReviews.length === 0 && circuitBreakerEvents.length === 0 && !latestDispatcherDecision ? (
              <div className="px-4 py-6 text-[12px] text-[#6e7681]">
                No orchestration reviews or intervention events yet.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
