import React from "react";
import { Menu, Settings2 } from "lucide-react";
import { useAppStore } from "@/store";
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
  const setIsMobileSidebarOpen = useAppStore((s) => s.setIsMobileSidebarOpen);
  const setIsActivityDrawerOpen = useAppStore((s) => s.setIsActivityDrawerOpen);
  const setActivityDrawerTab = useAppStore((s) => s.setActivityDrawerTab);

  return (
    <div className="relative border-b border-[#e0d2c0] bg-[#fbf7ef]/86 px-3 py-3 sm:px-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[360px] bg-[radial-gradient(circle_at_top_right,rgba(201,100,55,0.13),transparent_62%)]" />
      <div className="relative flex items-start justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-start gap-2 sm:gap-3.5">
          {/* Mobile hamburger menu */}
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[#d6b99f] bg-[#fffaf2] text-[#7d6b5a] transition-colors hover:bg-white hover:text-[#2f261f] lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div
            className="command-deck-orb relative hidden h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[#d6b99f] text-[15px] text-white shadow-[0_12px_28px_rgba(120,71,35,0.16)] lg:flex"
            style={{ backgroundColor: selectedAgent?.accent || "#c96437" }}
          >
            {workspaceView === "channels"
              ? "#"
              : workspaceView === "council"
                ? "◌"
                : selectedAgent?.emoji || "🧠"}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3">
              <span className="text-[14px] font-semibold leading-5 text-[#2f261f] sm:text-[15px]">
                {topPanelTitle}
              </span>
              <span className="hidden text-[10px] uppercase tracking-[0.18em] text-[#8f7b66] sm:inline">
                {topPanelSubtitle}
              </span>
            </div>
            <div className="mt-1 flex min-h-[18px] items-center gap-2 sm:mt-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c96437] shadow-[0_0_0_6px_rgba(201,100,55,0.12)]" />
              <span className="truncate text-[11px] text-[#7d6b5a] sm:text-[12px]">
                {topPanelMetaLine}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        {/* Mobile activity button */}
        <button
          type="button"
          onClick={() => {
            setActivityDrawerTab("activity");
            setIsActivityDrawerOpen(true);
          }}
          className="rounded-md border border-[#e0d2c0] bg-[#fffaf2] p-1.5 text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f] xl:hidden"
          aria-label="Open activity"
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <span className="h-2 w-2 rounded-full bg-[#c96437] animate-pulse-dot" />
          </span>
        </button>
        {badge}
        {selectedAgent && workspaceView === "chat" && (
          <button
            onClick={() => handleEditAgent(selectedAgent)}
            className="rounded-md border border-[#e0d2c0] bg-[#fffaf2] p-1.5 text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f]"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
