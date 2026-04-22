import React, { useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThoughtBubbleProps {
  thought: string;
  /** Default expanded state */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Collapsible thought bubble rendered above the main agent reply.
 * Displays the content of a <thought>...</thought> block.
 */
export function ThoughtBubble({ thought, defaultOpen = false, className }: ThoughtBubbleProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!thought.trim()) return null;

  return (
    <div className={cn("mb-2 select-none", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.025] px-2.5 py-1 text-[11px] text-[#6e7a88] transition-colors hover:border-white/12 hover:text-[#8fa1b3]"
      >
        <Brain className="h-3 w-3 flex-shrink-0 text-violet-400/70" />
        <span className="font-medium">Thought</span>
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>

      {open && (
        <div className="mt-1.5 ml-2 rounded-xl border border-violet-500/12 bg-violet-500/[0.04] px-3.5 py-2.5">
          <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[#7f8fa3]">
            {thought}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Split raw assistant content into:
 *  - thought: content inside the first <thought>…</thought> block
 *  - body: everything else, with the <thought> block stripped
 */
export function splitThoughtFromContent(raw: string): {
  thought: string;
  body: string;
} {
  const match = raw.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (!match) {
    return { thought: "", body: raw };
  }
  const thought = match[1]?.trim() ?? "";
  const body = raw.replace(/<thought>[\s\S]*?<\/thought>/i, "").trim();
  return { thought, body };
}
