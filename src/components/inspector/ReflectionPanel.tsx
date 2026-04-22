import React, { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePhase4Store } from "@/store/usePhase4Store";
import { generatePromptPatch } from "@/lib/phase4";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FailurePattern, LearningEventType } from "@/lib/phase4";

interface ReflectionPanelProps {
  agentId: string;
  agentName?: string;
  currentSystemPrompt?: string;
  onApplyPatch?: (patchedPrompt: string) => void;
}

function patternLabel(type: LearningEventType): string {
  const map: Record<LearningEventType, string> = {
    critic_rejection: "Critic Rejections",
    user_correction: "User Corrections",
    tool_failure: "Tool Failures",
    handoff_declined: "Declined Handoffs",
    timeout: "Timeouts",
  };
  return map[type] ?? type;
}

function patternColor(type: LearningEventType): string {
  if (type === "critic_rejection") return "text-red-400 border-red-500/20 bg-red-500/8";
  if (type === "user_correction") return "text-amber-400 border-amber-500/20 bg-amber-500/8";
  if (type === "tool_failure") return "text-orange-400 border-orange-500/20 bg-orange-500/8";
  if (type === "handoff_declined") return "text-violet-400 border-violet-500/20 bg-violet-500/8";
  return "text-[#8b949e] border-[#30363d] bg-[#161b22]";
}

function FailurePatternCard({ pattern }: { pattern: FailurePattern }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("rounded-lg border px-3 py-2.5 transition-all", patternColor(pattern.type))}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="text-[12px] font-medium">{patternLabel(pattern.type)}</span>
          <span className="rounded-full bg-current/10 px-1.5 text-[10px] font-bold opacity-80">
            ×{pattern.count}
          </span>
        </div>
        {pattern.examples.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {expanded && pattern.examples.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-current/10 pt-2">
          {pattern.examples.map((ex, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px] opacity-80">
              <span className="mt-0.5 flex-shrink-0">•</span>
              <span>{ex}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReflectionPanel({
  agentId,
  agentName,
  currentSystemPrompt = "",
  onApplyPatch,
}: ReflectionPanelProps) {
  const { reflectionsByAgent, promptPatchesByAgent, setPromptPatch, learningEvents } =
    usePhase4Store();

  const report = reflectionsByAgent[agentId];
  const patch = promptPatchesByAgent[agentId];
  const [showPatch, setShowPatch] = useState(false);
  const [patching, setPatching] = useState(false);
  const [applied, setApplied] = useState(false);

  const agentEventCount = learningEvents.filter((e) => e.agentId === agentId).length;

  function handleGeneratePatch() {
    if (!report) return;
    const generated = generatePromptPatch(currentSystemPrompt, report);
    setPromptPatch(agentId, generated);
    setShowPatch(true);
  }

  function handleApply() {
    if (!patch || !onApplyPatch) return;
    setPatching(true);
    setTimeout(() => {
      onApplyPatch(patch);
      setPatching(false);
      setApplied(true);
      setTimeout(() => setApplied(false), 3000);
    }, 400);
  }

  const totalEvents = report?.totalEvents ?? agentEventCount;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-[#58a6ff]" />
        <span className="text-[13px] font-semibold text-[#c9d1d9]">
          Reflection{agentName ? ` — ${agentName}` : ""}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-[#21262d] bg-[#0d1117] p-3 text-center">
          <p className="text-[22px] font-bold text-[#e6edf3]">{totalEvents}</p>
          <p className="text-[10px] text-[#6e7681]">Total events logged</p>
        </div>
        <div className="rounded-lg border border-[#21262d] bg-[#0d1117] p-3 text-center">
          <p className="text-[22px] font-bold text-[#e6edf3]">
            {report?.failurePatterns.length ?? 0}
          </p>
          <p className="text-[10px] text-[#6e7681]">Failure pattern types</p>
        </div>
      </div>

      {/* No events state */}
      {totalEvents === 0 && (
        <div className="rounded-lg border border-[#21262d] bg-[#0d1117] py-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500/40" />
          <p className="text-[12px] text-[#6e7681]">No failure events logged yet.</p>
          <p className="mt-0.5 text-[11px] text-[#484f58]">
            Events accumulate as the agent runs critic loops and handles corrections.
          </p>
        </div>
      )}

      {/* Failure patterns */}
      {report && report.failurePatterns.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#6e7681]">
            Top Failure Patterns
          </p>
          {report.failurePatterns.slice(0, 4).map((pattern) => (
            <FailurePatternCard key={pattern.type} pattern={pattern} />
          ))}
        </div>
      )}

      {/* Patch generation */}
      {report && report.totalEvents > 0 && (
        <div className="rounded-lg border border-[#21262d] bg-[#0d1117] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-medium text-[#c9d1d9]">Prompt Patch</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleGeneratePatch}
              className="h-6 gap-1 px-2 text-[10px] text-[#58a6ff] hover:bg-[#58a6ff]/10"
            >
              <Wand2 className="h-3 w-3" />
              {patch ? "Regenerate" : "Generate"}
            </Button>
          </div>

          {patch && (
            <>
              <button
                onClick={() => setShowPatch((v) => !v)}
                className="mt-2 w-full text-left text-[10px] text-[#6e7681] transition-colors hover:text-[#c9d1d9]"
              >
                {showPatch ? "▼ Hide patch" : "▶ Show proposed patch"}
              </button>

              {showPatch && (
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-[#161b22] p-2 font-mono text-[10px] text-[#8b949e]">
                  {patch.slice(-600)}
                </pre>
              )}

              <div className="mt-2 flex items-center justify-end gap-2">
                {applied && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Applied
                  </span>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleApply}
                  disabled={patching || !onApplyPatch}
                  className="h-6 px-2 text-[11px]"
                >
                  {patching ? "Applying…" : "Apply Patch"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
