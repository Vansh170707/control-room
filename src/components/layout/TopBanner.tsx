import React from "react";
import { Settings2 } from "lucide-react";
import type { WorkspaceAgent } from "../../App";

interface TopBannerProps {
  selectedAgent: WorkspaceAgent | undefined;
  workspaceView: string;
  topPanelTitle: string;
  workspaceSyncMode: "local" | "syncing" | "live" | "fallback";
  handleEditAgent: (agent: WorkspaceAgent) => void;
  badge: React.ReactNode;
}

export function TopBanner({
  selectedAgent,
  workspaceView,
  topPanelTitle,
  handleEditAgent,
  badge,
}: TopBannerProps) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,18,25,0.96),rgba(11,15,21,0.92))] px-5">
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          style={{ backgroundColor: selectedAgent?.accent || "#3b82f6" }}
        >
          {workspaceView === "channels"
            ? "#"
            : workspaceView === "council"
              ? "◌"
              : selectedAgent?.emoji || "🧠"}
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold leading-5 text-[#eef3f8]">
            {topPanelTitle}
          </span>
          <span className="text-[11px] text-[#7f90a3]">
            {workspaceView === "chat"
              ? "Direct thread"
              : workspaceView === "channels"
                ? "Shared workspace channel"
                : workspaceView === "council"
                  ? "Multi-agent council"
                  : "Workspace panel"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
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
  );
}
