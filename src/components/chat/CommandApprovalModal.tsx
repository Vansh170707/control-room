import React from "react";
import { Terminal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PendingCommandApproval, WorkspaceAgent } from "../../App";

interface CommandApprovalModalProps {
  pendingCommandApproval: PendingCommandApproval | null;
  isProcessingCommandApproval: boolean;
  pendingApprovalAgent: WorkspaceAgent | undefined;
  handleCancelCommandApproval: () => void;
  handleApproveCommandApproval: () => Promise<void>;
}

export function CommandApprovalModal({
  pendingCommandApproval,
  isProcessingCommandApproval,
  pendingApprovalAgent,
  handleCancelCommandApproval,
  handleApproveCommandApproval,
}: CommandApprovalModalProps) {
  return (
    <Dialog
      open={pendingCommandApproval !== null}
      onOpenChange={(open) => {
        if (!open && !isProcessingCommandApproval) {
          handleCancelCommandApproval();
        }
      }}
    >
      <DialogContent className="max-w-2xl border border-[#30363d] bg-[#0d1117] text-[#c9d1d9]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#e6edf3]">
            <Terminal className="h-5 w-5 text-[#f59e0b]" />
            Command Approval Required
          </DialogTitle>
          <DialogDescription className="text-[#8b949e]">
            {pendingApprovalAgent?.name ?? "An agent"} wants to run a sandbox command that needs your approval first.
          </DialogDescription>
        </DialogHeader>

        {pendingCommandApproval && (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="amber">Approval required</Badge>
                <Badge variant="muted">{pendingCommandApproval.source}</Badge>
                {pendingCommandApproval.taskTitle ? (
                  <Badge variant="cyan">{pendingCommandApproval.taskTitle}</Badge>
                ) : null}
              </div>
              <p className="mt-3 text-[13px] text-[#c9d1d9]">
                Agent:{" "}
                <span className="font-medium text-[#e6edf3]">
                  {pendingApprovalAgent?.emoji}{" "}
                  {pendingApprovalAgent?.name ?? pendingCommandApproval.agentId}
                </span>
              </p>
              <p className="mt-1 text-[12px] text-[#8b949e]">
                Working directory:{" "}
                <code className="rounded bg-[#0b0f15] px-1.5 py-0.5 text-[#79c0ff]">
                  {pendingCommandApproval.cwd}
                </code>
              </p>
              {pendingCommandApproval.ownerName ? (
                <p className="mt-1 text-[12px] text-[#8b949e]">
                  Requested by:{" "}
                  <span className="text-[#c9d1d9]">
                    {pendingCommandApproval.ownerName}
                  </span>
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-[#30363d] bg-[#0b0f15] p-3">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-[#8b949e]">
                Command Preview
              </p>
              <pre className="whitespace-pre-wrap font-mono text-[12px] text-[#10b981]">
                $ {pendingCommandApproval.command}
              </pre>
            </div>

            {pendingCommandApproval.reasons.length > 0 ? (
              <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-[#8b949e]">
                  Why approval is needed
                </p>
                <div className="space-y-1.5">
                  {pendingCommandApproval.reasons.map((reason, index) => (
                    <div
                      key={`${pendingCommandApproval.requestedAt}-${index}`}
                      className="flex items-start gap-2 text-[13px] text-[#fcd34d]"
                    >
                      <span className="mt-1">•</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelCommandApproval}
                disabled={isProcessingCommandApproval}
                className="text-[#f87171] hover:bg-[#3f191f]/30 hover:text-[#fca5a5]"
              >
                Dismiss
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleApproveCommandApproval()}
                disabled={isProcessingCommandApproval}
              >
                {isProcessingCommandApproval ? "Approving..." : "Approve & Run"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
