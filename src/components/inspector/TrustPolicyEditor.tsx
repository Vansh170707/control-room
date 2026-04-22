import React, { useState } from "react";
import { Shield, Plus, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePhase3Store } from "@/store/usePhase3Store";
import { Button } from "@/components/ui/button";
import { assessCommandRisk } from "@/lib/phase3";

interface TrustPolicyEditorProps {
  agentId: string;
  agentName?: string;
}

const EXAMPLE_COMMANDS = [
  "ls -la",
  "git status",
  "git push origin main",
  "rm -rf ./dist",
  "npm run build",
];

function PatternList({
  label,
  patterns,
  onAdd,
  onRemove,
  addPlaceholder,
  chipColor,
}: {
  label: string;
  patterns: string[];
  onAdd: (p: string) => void;
  onRemove: (p: string) => void;
  addPlaceholder: string;
  chipColor: string;
}) {
  const [draft, setDraft] = useState("");

  function handleAdd() {
    const trimmed = draft.trim();
    if (trimmed && !patterns.includes(trimmed)) {
      onAdd(trimmed);
      setDraft("");
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[#6e7681]">
        {label}
      </p>

      {patterns.length === 0 && (
        <p className="mb-2 text-[11px] text-[#484f58]">None configured</p>
      )}

      <div className="mb-2 flex flex-wrap gap-1.5">
        {patterns.map((p) => (
          <span
            key={p}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono",
              chipColor,
            )}
          >
            {p}
            <button
              onClick={() => onRemove(p)}
              className="ml-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={addPlaceholder}
          className="flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 font-mono text-[11px] text-[#c9d1d9] placeholder-[#484f58] outline-none focus:border-[#58a6ff]/50"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleAdd}
          disabled={!draft.trim()}
          className="h-7 px-2 text-[#58a6ff] hover:bg-[#58a6ff]/10"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function TrustPolicyEditor({ agentId, agentName }: TrustPolicyEditorProps) {
  const { getTrustPolicy, setTrustPolicy, resetTrustPolicy } = usePhase3Store();
  const policy = getTrustPolicy(agentId);

  function toggleAutoApprove() {
    setTrustPolicy(agentId, { autoApproveSafe: !policy.autoApproveSafe });
  }

  function addAllowed(pattern: string) {
    setTrustPolicy(agentId, {
      allowedPatterns: [...policy.allowedPatterns, pattern],
    });
  }

  function removeAllowed(pattern: string) {
    setTrustPolicy(agentId, {
      allowedPatterns: policy.allowedPatterns.filter((p) => p !== pattern),
    });
  }

  function addBlocked(pattern: string) {
    setTrustPolicy(agentId, {
      blockedPatterns: [...policy.blockedPatterns, pattern],
    });
  }

  function removeBlocked(pattern: string) {
    setTrustPolicy(agentId, {
      blockedPatterns: policy.blockedPatterns.filter((p) => p !== pattern),
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#58a6ff]" />
          <span className="text-[13px] font-semibold text-[#c9d1d9]">
            Trust Policy
            {agentName ? ` — ${agentName}` : ""}
          </span>
        </div>
        <button
          onClick={() => resetTrustPolicy(agentId)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[#6e7681] transition-colors hover:bg-[#21262d] hover:text-[#c9d1d9]"
          title="Reset to defaults"
        >
          <RefreshCw className="h-2.5 w-2.5" />
          Reset
        </button>
      </div>

      {/* Auto-approve toggle */}
      <div className="flex items-center justify-between rounded-lg border border-[#21262d] bg-[#0d1117] px-3 py-2.5">
        <div>
          <p className="text-[12px] font-medium text-[#c9d1d9]">
            Auto-approve safe commands
          </p>
          <p className="text-[11px] text-[#6e7681]">
            Skip approval for read-only and low-risk commands
          </p>
        </div>
        <button
          onClick={toggleAutoApprove}
          className={cn(
            "relative h-5 w-9 rounded-full border transition-colors",
            policy.autoApproveSafe
              ? "border-emerald-500 bg-emerald-500"
              : "border-[#30363d] bg-[#21262d]",
          )}
          role="switch"
          aria-checked={policy.autoApproveSafe}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all",
              policy.autoApproveSafe ? "left-[18px]" : "left-0.5",
            )}
          />
        </button>
      </div>

      {/* Allowed patterns */}
      <div className="rounded-lg border border-[#21262d] bg-[#0d1117] p-3">
        <PatternList
          label="Always Allowed (override caution → safe)"
          patterns={policy.allowedPatterns}
          onAdd={addAllowed}
          onRemove={removeAllowed}
          addPlaceholder="e.g. git status"
          chipColor="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
        />
      </div>

      {/* Blocked patterns */}
      <div className="rounded-lg border border-[#21262d] bg-[#0d1117] p-3">
        <PatternList
          label="Always Blocked (escalate to danger)"
          patterns={policy.blockedPatterns}
          onAdd={addBlocked}
          onRemove={removeBlocked}
          addPlaceholder="e.g. git push"
          chipColor="bg-red-500/10 text-red-400 border border-red-500/20"
        />
      </div>

      {/* Live preview */}
      <div className="rounded-lg border border-[#21262d] bg-[#0d1117] p-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#6e7681]">
          Live Policy Preview
        </p>
        <div className="space-y-1.5">
          {EXAMPLE_COMMANDS.map((cmd) => {
            const report = assessCommandRisk(cmd, "/workspace", policy);
            const icon =
              report.riskLevel === "safe"
                ? "🟢"
                : report.riskLevel === "caution"
                  ? "🟡"
                  : "🔴";
            const label =
              report.autoApprovable ? "auto-approve" : report.riskLevel;
            return (
              <div
                key={cmd}
                className="flex items-center justify-between gap-2"
              >
                <code className="truncate font-mono text-[11px] text-[#8b949e]">
                  {cmd}
                </code>
                <span className="flex-shrink-0 text-[10px] text-[#6e7681]">
                  {icon} {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
