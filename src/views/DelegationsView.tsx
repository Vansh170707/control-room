import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  CollaborationChannel,
  DelegationExecutionMode,
  DelegationPriority,
  DelegationStatus,
  DelegationTask,
  WorkspaceAgent,
} from "@/types";

interface DelegationsViewProps {
  delegations: DelegationTask[];
  delegationMeta: Record<
    DelegationStatus,
    { label: string; badgeVariant: "cyan" | "emerald" | "amber" | "muted" }
  >;
  priorityMeta: Record<
    DelegationPriority,
    { label: string; badgeVariant: "muted" | "cyan" | "danger" }
  >;
  executionModeMeta: Record<
    DelegationExecutionMode,
    { label: string; badgeVariant: "muted" | "cyan" | "amber" }
  >;
  allAgents: WorkspaceAgent[];
  channels: CollaborationChannel[];
  dispatchDelegationTask: (task: DelegationTask) => Promise<void>;
  cycleDelegationStatus: (taskId: string) => void;
}

export function DelegationsView({
  delegations,
  delegationMeta,
  priorityMeta,
  executionModeMeta,
  allAgents,
  channels,
  dispatchDelegationTask,
  cycleDelegationStatus,
}: DelegationsViewProps) {
  return (
    <div className="mt-2 overflow-hidden rounded-3xl border border-white/8 bg-[linear-gradient(180deg,rgba(18,27,39,0.92),rgba(11,17,26,0.88))] shadow-[0_18px_48px_rgba(2,6,23,0.18)]">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-[#eef6fb]">
            Delegations
          </p>
          <p className="text-[12px] text-[#8296ab]">
            Every handoff across the workspace, including
            channel-created tasks.
          </p>
        </div>
        <Badge variant="cyan">{delegations.length} total</Badge>
      </div>
      <div className="divide-y divide-white/6">
        {delegations.length > 0 ? (
          delegations.map((task) => (
            <div key={task.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-medium text-[#edf4f8]">
                      {task.title}
                    </p>
                    <Badge
                      variant={
                        delegationMeta[task.status].badgeVariant
                      }
                    >
                      {delegationMeta[task.status].label}
                    </Badge>
                    <Badge
                      variant={
                        priorityMeta[task.priority].badgeVariant
                      }
                    >
                      {priorityMeta[task.priority].label}
                    </Badge>
                    <Badge
                      variant={
                        executionModeMeta[task.executionMode]
                          .badgeVariant
                      }
                    >
                      {executionModeMeta[task.executionMode].label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#8ea0b5]">
                    {task.notes || task.payload || "No extra notes."}
                  </p>
                  <p className="mt-2 text-[11px] text-[#70849a]">
                    {allAgents.find(
                      (agent) => agent.id === task.fromAgentId,
                    )?.name || task.fromAgentId}{" "}
                    →{" "}
                    {allAgents.find(
                      (agent) => agent.id === task.assigneeId,
                    )?.name || task.assigneeId}
                    {task.channelId
                      ? ` · channel ${channels.find((channel) => channel.id === task.channelId)?.title || task.channelId}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {task.status !== "done" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void dispatchDelegationTask(task)
                      }
                      className="h-8 rounded-xl border border-white/8 px-3 text-[11px] text-[#c3d0dc] hover:bg-white/[0.05]"
                    >
                      Dispatch
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cycleDelegationStatus(task.id)}
                    className="h-8 rounded-xl border border-white/8 px-3 text-[11px] text-[#c3d0dc] hover:bg-white/[0.05]"
                  >
                    Advance
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="px-5 py-10 text-[12px] text-[#6e7f93]">
            No delegations yet. Create one directly or let a channel
            round generate them.
          </div>
        )}
      </div>
    </div>
  );
}
