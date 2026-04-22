import React from "react";
import { cn } from "@/lib/utils";

export function TerminalRenderer({ latestAgentRun }: { latestAgentRun: any }) {
  if (!latestAgentRun) {
    return (
      <div className="text-[#6e7681]">
        Ask the agent to do work and its sandbox activity will appear here live.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {latestAgentRun.activityLabel && (
        <div className="text-[#8b949e] text-[11px]">
          {latestAgentRun.activityLabel}
        </div>
      )}
      <div className="text-[#10b981]">
        $ {latestAgentRun.command}
      </div>
      {latestAgentRun.cwd && (
        <div className="text-[#6e7681]">
          cwd: {latestAgentRun.cwd}
        </div>
      )}
      {latestAgentRun.stdout && (
        <pre className="whitespace-pre-wrap text-[#c9d1d9] break-all">
          {latestAgentRun.stdout}
        </pre>
      )}
      {latestAgentRun.stderr && (
        <pre className="whitespace-pre-wrap text-[#fca5a5] break-all">
          {latestAgentRun.stderr}
        </pre>
      )}
      {latestAgentRun.status === "running" && (
        <div className="text-[#10b981] animate-pulse">
          █
        </div>
      )}
      {latestAgentRun.status !== "running" && (
        <div className="text-[#6e7681]">
          {latestAgentRun.status === "completed"
            ? "Completed"
            : latestAgentRun.status === "canceled"
              ? "Canceled"
              : "Failed"}
          {typeof latestAgentRun.exitCode === "number"
            ? ` · exit ${latestAgentRun.exitCode}`
            : ""}
          {typeof latestAgentRun.durationMs === "number"
            ? ` · ${latestAgentRun.durationMs}ms`
            : ""}
        </div>
      )}
    </div>
  );
}
