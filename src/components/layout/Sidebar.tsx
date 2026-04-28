import React from "react";
import {
  Inbox,
  MonitorSmartphone,
  Orbit,
  Plus,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import type { WorkspaceAgent, CollaborationChannel } from "../../App";

interface SidebarProps {
  sidebarWidth: number;
  setIsCreateAgentOpen: (isOpen: boolean) => void;
  allAgents: WorkspaceAgent[];
  agentPresenceById: Record<string, { tone: string }>;
  selectedAgentId: string | null;
  workspaceView: string;
  setSelectedAgentId: (id: string) => void;
  setWorkspaceView: (view: any) => void;
  handleEditAgent: (agent: WorkspaceAgent) => void;
  setIsCreateChannelOpen: (isOpen: boolean) => void;
  channels: CollaborationChannel[];
  selectedChannel: CollaborationChannel | null;
  setSelectedChannelId: (id: string) => void;
  councilSessions: any[];
  selectedCouncilSession: any;
  setSelectedCouncilSessionId: (id: string) => void;
  viewItems: Array<{ id: string; label: string; icon: any }>;
  isResizingSidebarRef: React.MutableRefObject<boolean>;
}

export function Sidebar({
  sidebarWidth,
  setIsCreateAgentOpen,
  allAgents,
  agentPresenceById,
  selectedAgentId,
  workspaceView,
  setSelectedAgentId,
  setWorkspaceView,
  handleEditAgent,
  setIsCreateChannelOpen,
  channels,
  selectedChannel,
  setSelectedChannelId,
  councilSessions,
  selectedCouncilSession,
  setSelectedCouncilSessionId,
  viewItems,
  isResizingSidebarRef,
}: SidebarProps) {
  const setActivityDrawerTab = useAppStore((s) => s.setActivityDrawerTab);
  const setIsActivityDrawerOpen = useAppStore((s) => s.setIsActivityDrawerOpen);
  const isMobileSidebarOpen = useAppStore((s) => s.isMobileSidebarOpen);
  const setIsMobileSidebarOpen = useAppStore((s) => s.setIsMobileSidebarOpen);

  const sidebarContent = (
    <>
      <div className="border-b border-[#e0d2c0] px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d6b99f] bg-[#c96437]/10 text-[#b65b31]">
              <Orbit className="h-4 w-4" />
            </div>
            <span className="text-[18px] font-semibold tracking-[-0.02em] text-[#2f261f]">
              Control Room
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#e0d2c0] bg-[#fffaf2] text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f]"
              aria-label="Search workspace"
            >
              <Search className="h-4 w-4" />
            </button>
            {/* Close button on mobile */}
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#e0d2c0] bg-[#fffaf2] text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f] lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const selectAgentMobile = (id: string) => {
    setSelectedAgentId(id);
    setWorkspaceView("chat");
    setIsMobileSidebarOpen(false);
  };

  const selectChannelMobile = (id: string) => {
    setSelectedChannelId(id);
    setWorkspaceView("channels");
    setIsMobileSidebarOpen(false);
  };

  const selectViewMobile = (view: any) => {
    setWorkspaceView(view);
    setIsMobileSidebarOpen(false);
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Desktop sidebar — always visible on lg+ */}
      <aside
        className="claude-sidebar relative z-10 hidden h-[100dvh] min-h-0 shrink-0 flex-col overflow-hidden border-r border-[#e0d2c0] bg-[linear-gradient(180deg,#fbf7ef_0%,#f2eadf_100%)] shadow-[inset_-1px_0_0_rgba(120,71,35,0.06)] lg:flex"
        style={{ width: sidebarWidth }}
      >
      <div className="border-b border-[#e0d2c0] px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d6b99f] bg-[#c96437]/10 text-[#b65b31]">
              <Orbit className="h-4 w-4" />
            </div>
            <span className="text-[18px] font-semibold tracking-[-0.02em] text-[#2f261f]">
              Control Room
            </span>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#e0d2c0] bg-[#fffaf2] text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f]"
            aria-label="Search workspace"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sidebar — Agents Section */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-3.5 pt-5 pb-1">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#738396]">
              Agents
            </span>
            <button
              type="button"
              onClick={() => setIsCreateAgentOpen(true)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#e0d2c0] bg-[#fffaf2] text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-px">
            {allAgents.map((agent) => {
              const presence = agentPresenceById[agent.id];
              const isSelected =
                selectedAgentId === agent.id && workspaceView === "chat";
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setWorkspaceView("chat");
                  }}
                  className={cn(
                    "group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-all duration-150",
                    isSelected
                      ? "border border-[#dfc7ad] bg-[linear-gradient(90deg,rgba(201,100,55,0.15),rgba(255,250,242,0.74))] text-[#2f261f] shadow-[0_0_0_1px_rgba(201,100,55,0.10)]"
                      : "border border-transparent text-[#5f5042] hover:border-[#e0d2c0] hover:bg-[#fffaf2]",
                  )}
                >
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    style={{ backgroundColor: agent.accent || "#c96437" }}
                  >
                    {agent.emoji || "🤖"}
                  </div>
                  <span className="truncate text-[13.5px] font-medium tracking-[0.01em]">
                    {agent.name}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {presence?.tone === "running" && (
                      <span className="h-2 w-2 rounded-full bg-[#c96437] animate-pulse-dot" />
                    )}
                    {presence?.tone === "review" && (
                      <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
                    )}
                    {presence?.tone === "error" && (
                      <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                    )}
                    {agent.source === "custom" && (
                      <Settings2
                        className="h-3 w-3 flex-shrink-0 text-[#9a8978] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#2f261f]"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditAgent(agent);
                        }}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar — Channels Section */}
        <div className="px-3.5 pt-6 pb-1">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#738396]">
              Channels
            </span>
            <button
              type="button"
              onClick={() => setIsCreateChannelOpen(true)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#e0d2c0] bg-[#fffaf2] text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-px">
            {channels.length > 0 ? (
              channels.map((channel) => {
                const isSelected =
                  selectedChannel?.id === channel.id &&
                  workspaceView === "channels";
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => {
                      setSelectedChannelId(channel.id);
                      setWorkspaceView("channels");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left transition-all duration-150",
                      isSelected
                        ? "border-[#dfc7ad] bg-[linear-gradient(90deg,rgba(201,100,55,0.14),rgba(255,250,242,0.74))] text-[#2f261f]"
                        : "border-transparent text-[#5f5042] hover:border-[#e0d2c0] hover:bg-[#fffaf2]",
                    )}
                  >
                    <span className="text-[14px] text-[#9a8978]">#</span>
                    <span className="truncate text-[14px]">
                      {channel.title}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-2 py-2 text-[12px] text-[#9a8978]">
                No channels yet
              </p>
            )}
          </div>
        </div>

        {/* Sidebar — Council Section */}
        <div className="px-3.5 pt-6 pb-1">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#738396]">
              Council
            </span>
            <button
              type="button"
              onClick={() => setWorkspaceView("council")}
              className="text-[10px] text-[#8f7b66] transition-colors hover:text-[#2f261f]"
            >
              View
            </button>
          </div>
          <div className="space-y-px">
            {councilSessions.length > 0 ? (
              councilSessions.slice(0, 4).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    setSelectedCouncilSessionId(session.id);
                    setWorkspaceView("council");
                  }}
                  className={cn(
                    "w-full rounded-xl border px-2.5 py-2.5 text-left transition-all duration-150",
                    selectedCouncilSession?.id === session.id &&
                      workspaceView === "council"
                      ? "border-[#dfc7ad] bg-[linear-gradient(90deg,rgba(201,100,55,0.14),rgba(255,250,242,0.74))] text-[#2f261f]"
                      : "border-transparent text-[#5f5042] hover:border-[#e0d2c0] hover:bg-[#fffaf2]",
                  )}
                >
                  <p className="line-clamp-1 text-[13px]">
                    {session.question}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#9a8978]">
                    {session.messages.length} messages
                  </p>
                </button>
              ))
            ) : (
              <p className="px-2 py-2 text-[12px] text-[#9a8978]">
                No council sessions
              </p>
            )}
          </div>
        </div>

        {/* Sidebar — Views Section */}
        <div className="px-3.5 pt-6 pb-3">
          <div className="mb-2 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#738396]">
              Workspace
            </span>
          </div>
          <div className="space-y-px">
            {viewItems
              .filter(
                (item) =>
                  !["chat", "channels", "council", "activity"].includes(
                    item.id,
                  ),
              )
              .map((item) => {
                const Icon = item.icon;
                const isActive = workspaceView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setWorkspaceView(item.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition-all duration-150",
                      isActive
                        ? "border-[#dfc7ad] bg-[linear-gradient(90deg,rgba(201,100,55,0.14),rgba(255,250,242,0.74))] text-[#2f261f]"
                        : "border-transparent text-[#5f5042] hover:border-[#e0d2c0] hover:bg-[#fffaf2]",
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-[#9a8978]" />
                    <span className="truncate text-[14px]">{item.label}</span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {/* Sidebar — Footer */}
      <div className="border-t border-[#e0d2c0] bg-[#f7efe3] px-3.5 py-3">
        <div className="mb-3">
          <button
            type="button"
            onClick={() => {
              if (selectedAgentId) {
                setWorkspaceView("chat");
              }
              setActivityDrawerTab("activity");
              setIsActivityDrawerOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-[#e0d2c0] bg-[#fffaf2] px-3 py-2 text-left text-[12px] text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f]"
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-[#c96437] animate-pulse-dot" />
            Activity rail
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setWorkspaceView("accounts")}
            className="flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[12px] text-[#7d6b5a] transition-colors hover:border-[#e0d2c0] hover:bg-[#fffaf2] hover:text-[#2f261f]"
          >
            <Orbit className="h-3.5 w-3.5" />
            Mini Apps
          </button>
          <button
            onClick={() => setWorkspaceView("delegations")}
            className="flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[12px] text-[#7d6b5a] transition-colors hover:border-[#e0d2c0] hover:bg-[#fffaf2] hover:text-[#2f261f]"
          >
            <Inbox className="h-3.5 w-3.5" />
            Inbox
          </button>
          <button
            onClick={() => setWorkspaceView("observability")}
            className="flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[12px] text-[#7d6b5a] transition-colors hover:border-[#e0d2c0] hover:bg-[#fffaf2] hover:text-[#2f261f]"
          >
            <MonitorSmartphone className="h-3.5 w-3.5" />
            Devices
          </button>
          <button
            onClick={() => setWorkspaceView("accounts")}
            className="flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[12px] text-[#7d6b5a] transition-colors hover:border-[#e0d2c0] hover:bg-[#fffaf2] hover:text-[#2f261f]"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-[#586678]">
          <span className="cursor-pointer transition-colors hover:text-[#9eb1c5]">
            Docs
          </span>
          <span>·</span>
          <span className="cursor-pointer transition-colors hover:text-[#9eb1c5]">
            Privacy
          </span>
          <span>·</span>
          <span className="cursor-pointer transition-colors hover:text-[#9eb1c5]">
            Terms
          </span>
        </div>
      </div>

      {/* Sidebar resize handle */}
      <button
        type="button"
        aria-label="Resize sidebar"
        onMouseDown={() => {
          isResizingSidebarRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        className="absolute right-0 top-0 hidden h-full w-1.5 cursor-col-resize bg-transparent xl:block"
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#d7c8b7] transition-colors hover:bg-[#c96437]/40" />
      </button>
    </aside>

      {/* Mobile sidebar — slide-over panel on small screens */}
      <aside
        className={cn(
          "claude-sidebar fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-[320px] flex-col overflow-hidden border-r border-[#e0d2c0] bg-[linear-gradient(180deg,#fbf7ef_0%,#f2eadf_100%)] shadow-[4px_0_24px_rgba(0,0,0,0.15)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebarContent}

        {/* Mobile — Agents Section */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-3.5 pt-5 pb-1">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#738396]">
                Agents
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsCreateAgentOpen(true);
                  setIsMobileSidebarOpen(false);
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#e0d2c0] bg-[#fffaf2] text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-px">
              {allAgents.map((agent) => {
                const presence = agentPresenceById[agent.id];
                const isSelected =
                  selectedAgentId === agent.id && workspaceView === "chat";
                return (
                  <button
                    key={agent.id}
                    onClick={() => selectAgentMobile(agent.id)}
                    className={cn(
                      "group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-all duration-150",
                      isSelected
                        ? "border border-[#dfc7ad] bg-[linear-gradient(90deg,rgba(201,100,55,0.15),rgba(255,250,242,0.74))] text-[#2f261f] shadow-[0_0_0_1px_rgba(201,100,55,0.10)]"
                        : "border border-transparent text-[#5f5042] hover:border-[#e0d2c0] hover:bg-[#fffaf2]",
                    )}
                  >
                    <div
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      style={{ backgroundColor: agent.accent || "#c96437" }}
                    >
                      {agent.emoji || "🤖"}
                    </div>
                    <span className="truncate text-[13.5px] font-medium tracking-[0.01em]">
                      {agent.name}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      {presence?.tone === "running" && (
                        <span className="h-2 w-2 rounded-full bg-[#c96437] animate-pulse-dot" />
                      )}
                      {presence?.tone === "error" && (
                        <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile — Channels Section */}
          <div className="px-3.5 pt-6 pb-1">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#738396]">
                Channels
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsCreateChannelOpen(true);
                  setIsMobileSidebarOpen(false);
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#e0d2c0] bg-[#fffaf2] text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-px">
              {channels.length > 0 ? (
                channels.map((channel) => {
                  const isSelected =
                    selectedChannel?.id === channel.id &&
                    workspaceView === "channels";
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => selectChannelMobile(channel.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left transition-all duration-150",
                        isSelected
                          ? "border-[#dfc7ad] bg-[linear-gradient(90deg,rgba(201,100,55,0.14),rgba(255,250,242,0.74))] text-[#2f261f]"
                          : "border-transparent text-[#5f5042] hover:border-[#e0d2c0] hover:bg-[#fffaf2]",
                      )}
                    >
                      <span className="text-[14px] text-[#9a8978]">#</span>
                      <span className="truncate text-[14px]">
                        {channel.title}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="px-2 py-2 text-[12px] text-[#9a8978]">
                  No channels yet
                </p>
              )}
            </div>
          </div>

          {/* Mobile — Workspace Views */}
          <div className="px-3.5 pt-6 pb-3">
            <div className="mb-2 px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#738396]">
                Workspace
              </span>
            </div>
            <div className="space-y-px">
              {viewItems
                .filter(
                  (item) =>
                    !["chat", "channels", "council", "activity"].includes(
                      item.id,
                    ),
                )
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = workspaceView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectViewMobile(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition-all duration-150",
                        isActive
                          ? "border-[#dfc7ad] bg-[linear-gradient(90deg,rgba(201,100,55,0.14),rgba(255,250,242,0.74))] text-[#2f261f]"
                          : "border-transparent text-[#5f5042] hover:border-[#e0d2c0] hover:bg-[#fffaf2]",
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0 text-[#9a8978]" />
                      <span className="truncate text-[14px]">{item.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Mobile — Footer */}
        <div className="border-t border-[#e0d2c0] bg-[#f7efe3] px-3.5 py-3">
          <button
            type="button"
            onClick={() => {
              setActivityDrawerTab("activity");
              setIsActivityDrawerOpen(true);
              setIsMobileSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-[#e0d2c0] bg-[#fffaf2] px-3 py-2 text-left text-[12px] text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f]"
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-[#c96437] animate-pulse-dot" />
            Activity rail
          </button>
        </div>
      </aside>
    </>
  );
}
