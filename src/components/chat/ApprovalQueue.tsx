import React, { useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldX, ChevronDown, ChevronUp, Terminal, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePhase3Store } from "@/store/usePhase3Store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ApprovalQueueItem, RiskLevel } from "@/lib/phase3";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskBadgeVariant(level: RiskLevel): "default" | "amber" | "danger" {
  if (level === "danger") return "danger";
  if (level === "caution") return "amber";
  return "default";
}

function riskIcon(level: RiskLevel) {
  if (level === "danger") return <ShieldX className="h-4 w-4 text-red-400" />;
  if (level === "caution") return <ShieldAlert className="h-4 w-4 text-amber-400" />;
  return <ShieldCheck className="h-4 w-4 text-emerald-400" />;
}

function riskLabel(level: RiskLevel): string {
  if (level === "danger") return "Danger";
  if (level === "caution") return "Caution";
  return "Safe";
}

// ---------------------------------------------------------------------------
// ApprovalCard
// ---------------------------------------------------------------------------

interface ApprovalCardProps {
  item: ApprovalQueueItem;
  onApprove: () => void;
  onReject: () => void;
  onAutoApproveAll: () => void;
}

function ApprovalCard({ item, onApprove, onReject, onAutoApproveAll }: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isResolved = Boolean(item.decision);

  return (
    <div
      className={cn(
        "rounded-xl border bg-[#0d1117] transition-all",
        isResolved ? "border-[#21262d] opacity-50" : "border-[#30363d]",
        item.riskReport.riskLevel === "danger" && !isResolved && "border-red-500/30",
        item.riskReport.riskLevel === "caution" && !isResolved && "border-amber-500/25",
      )}
    >
      {/* Card header */}
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5">{riskIcon(item.riskReport.riskLevel)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-[#e6edf3]">
              {item.agentEmoji ?? "🤖"} {item.agentName}
            </span>
            <Badge variant={riskBadgeVariant(item.riskReport.riskLevel)}>
              {riskLabel(item.riskReport.riskLevel)}
            </Badge>
            {isResolved && (
              <Badge variant="muted">
                {item.decision === "approved" || item.decision === "auto_approved"
                  ? "Approved"
                  : "Rejected"}
              </Badge>
            )}
          </div>
          <pre className="mt-1.5 truncate rounded bg-[#161b22] px-2.5 py-1.5 font-mono text-[11px] text-emerald-400">
            $ {item.command}
          </pre>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 mt-0.5 flex-shrink-0 rounded p-0.5 text-[#6e7681] transition-colors hover:text-[#c9d1d9]"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-2 border-t border-[#21262d] px-3 pb-3 pt-2">
          {/* Blast radius */}
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6e7681]">
              Blast Radius
            </p>
            <p className="text-[12px] text-[#c9d1d9]">{item.riskReport.blastRadius}</p>
          </div>

          {/* Reasons */}
          {item.riskReport.reasons.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6e7681]">
                Why approval is needed
              </p>
              <ul className="space-y-0.5">
                {item.riskReport.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px] text-amber-300">
                    <span className="mt-1">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cwd */}
          <div className="flex items-center gap-1.5 text-[11px] text-[#6e7681]">
            <Terminal className="h-3 w-3" />
            <code className="text-[#79c0ff]">{item.cwd}</code>
          </div>
        </div>
      )}

      {/* Actions */}
      {!isResolved && (
        <div className="flex items-center justify-between border-t border-[#21262d] px-3 py-2">
          <button
            onClick={onAutoApproveAll}
            className="flex items-center gap-1 text-[10px] text-[#6e7681] transition-colors hover:text-[#c9d1d9]"
          >
            <CheckCheck className="h-3 w-3" />
            Auto-approve all from {item.agentName}
          </button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onReject}
              className="h-6 px-2 text-[11px] text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onApprove}
              className="h-6 px-2 text-[11px]"
            >
              Approve & Run
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApprovalQueue
// ---------------------------------------------------------------------------

interface ApprovalQueueProps {
  className?: string;
}

export function ApprovalQueue({ className }: ApprovalQueueProps) {
  const {
    approvalQueue,
    resolveApproval,
    dismissApproval,
    clearResolvedApprovals,
    setTrustPolicy,
    getTrustPolicy,
  } = usePhase3Store();

  const pending = approvalQueue.filter((item) => !item.decision);
  const resolved = approvalQueue.filter((item) => Boolean(item.decision));

  if (approvalQueue.length === 0) return null;

  function handleApprove(item: ApprovalQueueItem) {
    resolveApproval(item.id, "approved");
  }

  function handleReject(item: ApprovalQueueItem) {
    resolveApproval(item.id, "rejected");
  }

  function handleAutoApproveAll(item: ApprovalQueueItem) {
    const current = getTrustPolicy(item.agentId);
    setTrustPolicy(item.agentId, {
      ...current,
      autoApproveSafe: true,
    });
    // Also approve this one immediately
    resolveApproval(item.id, "auto_approved");
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[#30363d] bg-[#161b22]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#21262d] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-400" />
          <span className="text-[13px] font-semibold text-[#c9d1d9]">
            Approval Queue
          </span>
          {pending.length > 0 && (
            <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
              {pending.length}
            </span>
          )}
        </div>
        {resolved.length > 0 && (
          <button
            onClick={clearResolvedApprovals}
            className="text-[10px] text-[#6e7681] transition-colors hover:text-[#c9d1d9]"
          >
            Clear resolved
          </button>
        )}
      </div>

      {/* Queue items */}
      <div className="space-y-2 p-3">
        {pending.map((item) => (
          <ApprovalCard
            key={item.id}
            item={item}
            onApprove={() => handleApprove(item)}
            onReject={() => handleReject(item)}
            onAutoApproveAll={() => handleAutoApproveAll(item)}
          />
        ))}
        {resolved.map((item) => (
          <ApprovalCard
            key={item.id}
            item={item}
            onApprove={() => {}}
            onReject={() => {}}
            onAutoApproveAll={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
