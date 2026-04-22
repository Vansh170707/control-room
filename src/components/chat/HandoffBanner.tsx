import React from "react";
import { ArrowRightLeft, CheckCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePhase4Store } from "@/store/usePhase4Store";
import { Button } from "@/components/ui/button";

interface HandoffBannerProps {
  /** The agent whose thread is currently being viewed */
  currentAgentId: string;
  /** Called when user accepts — should trigger a chat send with the handoff instruction */
  onAccept: (instruction: string, fromAgentName: string) => void;
}

export function HandoffBanner({ currentAgentId, onAccept }: HandoffBannerProps) {
  const { activeHandoffs, resolveHandoff } = usePhase4Store();
  const signal = activeHandoffs[currentAgentId];

  if (!signal) return null;

  function handleAccept() {
    resolveHandoff(currentAgentId, "accepted");
    onAccept(signal.instruction, signal.fromAgentName);
  }

  function handleDecline() {
    resolveHandoff(currentAgentId, "declined");
  }

  return (
    <div
      className={cn(
        "mx-3 mb-2 rounded-xl border border-violet-500/30 bg-violet-500/8",
        "flex items-start gap-3 px-3.5 py-3",
        "animate-in slide-in-from-bottom-2 duration-200",
      )}
    >
      {/* Icon */}
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
        <ArrowRightLeft className="h-3.5 w-3.5 text-violet-400" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-violet-300">
          Handoff from {signal.fromAgentName}
        </p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#8b949e]">
          {signal.instruction.slice(0, 200)}
        </p>
      </div>

      {/* Actions */}
      <div className="ml-2 flex flex-shrink-0 items-center gap-1.5">
        <button
          onClick={handleDecline}
          title="Decline handoff"
          className="rounded p-1 text-[#6e7681] transition-colors hover:bg-[#21262d] hover:text-red-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleAccept}
          className="h-6 gap-1 px-2 text-[11px] text-violet-300 hover:text-violet-200"
        >
          <CheckCheck className="h-3 w-3" />
          Accept
        </Button>
      </div>
    </div>
  );
}
