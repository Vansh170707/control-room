import React from "react";
import { Settings2 } from "lucide-react";
import type { WorkspaceAgent } from "../../App";

interface TopBannerProps {
  selectedAgent: WorkspaceAgent | undefined;
  workspaceView: string;
  topPanelTitle: string;
  topPanelSubtitle: string;
  topPanelMetaLine: string;
  workspaceSyncMode: "local" | "syncing" | "live" | "fallback";
  handleEditAgent: (agent: WorkspaceAgent) => void;
  badge: React.ReactNode;
}

export function TopBanner({
  selectedAgent,
  workspaceView,
  topPanelTitle,
  topPanelSubtitle,
  topPanelMetaLine,
  handleEditAgent,
  badge,
}: TopBannerProps) {
  return (
    <div className="relative border-b border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,18,25,0.98),rgba(11,15,21,0.94))] px-5 py-3">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[360px] bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_62%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <div
            className="command-deck-orb relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.08] text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]"
            style={{ backgroundColor: selectedAgent?.accent || "#3b82f6" }}
          >
            {workspaceView === "channels"
              ? "#"
              : workspaceView === "council"
                ? "◌"
                : selectedAgent?.emoji || "🧠"}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold leading-5 text-[#eef3f8]">
                {topPanelTitle}
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#5f748a]">
                {topPanelSubtitle}
              </span>
            </div>
            <div className="mt-1.5 flex min-h-[18px] items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#60a5fa] shadow-[0_0_0_6px_rgba(59,130,246,0.12)]" />
              <span className="truncate text-[12px] text-[#97a9bc]">
                {topPanelMetaLine}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
        {badge}
        {selectedAgent && workspaceView === "chat" && (
          <button
            onClick={() => handleEditAgent(selectedAgent)}
            className="rounded-md border border-white/[0.08] bg-white/[0.02] p-1.5 text-[#8fa1b3] transition-colors hover:bg-white/[0.06] hover:text-[#e6edf3]"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
