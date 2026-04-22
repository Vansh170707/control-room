import React from "react";
import { Zap, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePhase3Store } from "@/store/usePhase3Store";
import type { ParallelBatchResult, ParallelToolStatus } from "@/lib/phase3";

interface ParallelBatchPanelProps {
  agentId: string;
}

function StatusIcon({ status }: { status: ParallelToolStatus }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "error":
      return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#58a6ff]" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-[#6e7681]" />;
  }
}

function statusBg(status: ParallelToolStatus): string {
  switch (status) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/5";
    case "error":
      return "border-red-500/30 bg-red-500/5";
    case "running":
      return "border-[#58a6ff]/30 bg-[#58a6ff]/5";
    default:
      return "border-[#21262d] bg-[#0d1117]";
  }
}

function ToolChip({ result }: { result: ParallelBatchResult }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] transition-colors",
        statusBg(result.status),
      )}
    >
      <StatusIcon status={result.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono font-medium text-[#c9d1d9]">
          {result.tool}
        </p>
        {result.status === "error" && result.error && (
          <p className="mt-0.5 truncate text-[10px] text-red-400">{result.error}</p>
        )}
        {result.status === "success" && result.durationMs !== undefined && (
          <p className="mt-0.5 text-[10px] text-[#6e7681]">
            {result.durationMs}ms
          </p>
        )}
      </div>
    </div>
  );
}

export function ParallelBatchPanel({ agentId }: ParallelBatchPanelProps) {
  const { parallelBatchByAgent, clearParallelBatch } = usePhase3Store();
  const batch = parallelBatchByAgent[agentId];

  if (!batch) return null;

  const total = batch.calls.length;
  const succeeded = batch.results.filter((r) => r.status === "success").length;
  const failed = batch.results.filter((r) => r.status === "error").length;
  const running = total - succeeded - failed;
  const isDone = batch.status === "done" || batch.status === "partial";

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/15">
            <Zap className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#c9d1d9]">
              Parallel Batch
            </p>
            <p className="text-[10px] text-[#6e7681]">
              {total} tool{total !== 1 ? "s" : ""} ·{" "}
              {isDone ? (
                <span>
                  <span className="text-emerald-400">{succeeded} ok</span>
                  {failed > 0 && (
                    <span className="text-red-400"> · {failed} failed</span>
                  )}
                </span>
              ) : (
                <span className="text-[#58a6ff]">{running} running…</span>
              )}
            </p>
          </div>
        </div>

        {isDone && (
          <button
            onClick={() => clearParallelBatch(agentId)}
            className="rounded px-2 py-0.5 text-[10px] text-[#6e7681] transition-colors hover:bg-[#21262d] hover:text-[#c9d1d9]"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Chips grid */}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {batch.calls.map((call, idx) => {
          const result = batch.results[idx] ?? {
            tool: call.tool,
            parameters: call.parameters,
            status: "queued" as const,
          };
          return <ToolChip key={`${batch.id}-${idx}`} result={result} />;
        })}
      </div>

      {/* Progress bar for in-flight batches */}
      {!isDone && total > 0 && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#21262d]">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-300"
            style={{
              width: `${Math.round(((succeeded + failed) / total) * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
