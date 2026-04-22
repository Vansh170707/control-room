import React, { useMemo } from "react";
import { Brain, Pin, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePhase3Store } from "@/store/usePhase3Store";
import { DEFAULT_CONTEXT_WINDOW_TOKENS } from "@/lib/phase3";

interface ContextMeterProps {
  agentId: string;
  onCompressNow?: () => void;
}

function getMeterColor(pct: number): string {
  if (pct >= 0.9) return "bg-red-500";
  if (pct >= 0.7) return "bg-amber-400";
  if (pct >= 0.5) return "bg-yellow-400";
  return "bg-emerald-500";
}

function getMeterGlow(pct: number): string {
  if (pct >= 0.9) return "shadow-[0_0_8px_rgba(239,68,68,0.6)]";
  if (pct >= 0.7) return "shadow-[0_0_8px_rgba(251,191,36,0.5)]";
  return "";
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function ContextMeter({ agentId, onCompressNow }: ContextMeterProps) {
  const { contextStatsByAgent, pinnedIdsByAgent } = usePhase3Store();

  const stats = contextStatsByAgent[agentId];
  const pinnedIds = pinnedIdsByAgent[agentId];
  const pinnedCount = pinnedIds?.size ?? 0;

  const pct = stats?.capacityPct ?? 0;
  const tokenCount = stats?.tokenCount ?? 0;
  const shouldCompress = pct >= 0.7;

  const barWidth = useMemo(() => `${Math.min(100, Math.round(pct * 100))}%`, [pct]);
  const barColor = getMeterColor(pct);
  const barGlow = getMeterGlow(pct);
  const pctLabel = `${Math.round(pct * 100)}%`;

  if (!stats) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[#21262d] bg-[#0d1117] px-3 py-2 text-[11px] text-[#6e7681]">
        <Brain className="h-3.5 w-3.5" />
        <span>Context window — no data yet</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-[#0d1117] px-3 py-2.5 transition-colors",
        shouldCompress ? "border-amber-500/40" : "border-[#21262d]",
      )}
    >
      {/* Header row */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Brain
            className={cn(
              "h-3.5 w-3.5",
              pct >= 0.9
                ? "text-red-400"
                : pct >= 0.7
                  ? "text-amber-400"
                  : "text-[#58a6ff]",
            )}
          />
          <span className="text-[11px] font-medium text-[#c9d1d9]">
            Context Window
          </span>
        </div>

        <div className="flex items-center gap-2">
          {pinnedCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-[#161b22] px-2 py-0.5 text-[10px] text-[#79c0ff]">
              <Pin className="h-2.5 w-2.5" />
              {pinnedCount} pinned
            </span>
          )}
          <span
            className={cn(
              "text-[11px] font-mono font-semibold",
              pct >= 0.9
                ? "text-red-400"
                : pct >= 0.7
                  ? "text-amber-400"
                  : "text-[#8b949e]",
            )}
          >
            {pctLabel}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#21262d]">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            barColor,
            barGlow,
          )}
          style={{ width: barWidth }}
        />
      </div>

      {/* Footer row */}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-[#6e7681]">
          {formatTokens(tokenCount)} / {formatTokens(DEFAULT_CONTEXT_WINDOW_TOKENS)} tokens
        </span>

        {shouldCompress && onCompressNow && (
          <button
            onClick={onCompressNow}
            className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium text-amber-400 transition-colors hover:bg-amber-400/10 hover:text-amber-300"
          >
            <Zap className="h-2.5 w-2.5" />
            Compress now
          </button>
        )}
      </div>

      {/* Warning banner */}
      {pct >= 0.9 && (
        <div className="mt-2 rounded bg-red-500/10 px-2 py-1 text-[10px] text-red-400">
          ⚠ Context almost full — compression recommended to avoid token cutoff.
        </div>
      )}
    </div>
  );
}
