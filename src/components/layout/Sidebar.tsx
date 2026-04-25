import React from "react";
import {
  Inbox,
  MonitorSmartphone,
  Orbit,
  Plus,
  Search,
  Settings2,
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

  return (
    <aside
      className="relative z-10 flex h-[100dvh] min-h-0 shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-[linear-gradient(180deg,#0d1220_0%,#0b101a_100%)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.02)]"
      style={{ width: sidebarWidth }}
    >
      <div className="border-b border-white/[0.07] px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#60a5fa]/30 bg-[#60a5fa]/10 text-[#60a5fa]">
              <Orbit className="h-4 w-4" />
            </div>
            <span className="text-[18px] font-semibold tracking-[-0.02em] text-[#dfe7f1]">
              Control Room
            </span>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-[#93a4b8] transition-colors hover:bg-white/[0.06] hover:text-[#edf4f8]"
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
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] text-[#8fa1b3] transition-colors hover:bg-white/[0.06] hover:text-[#e6edf3]"
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
                      ? "border border-[#27415f] bg-[linear-gradient(90deg,rgba(37,99,235,0.20),rgba(18,25,39,0.30))] text-[#f2f7fb] shadow-[0_0_0_1px_rgba(59,130,246,0.10)]"
                      : "border border-transparent text-[#c9d1d9] hover:border-white/[0.06] hover:bg-[#161d2a]",
                  )}
                >
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    style={{ backgroundColor: agent.accent || "#3b82f6" }}
                  >
                    {agent.emoji || "🤖"}
                  </div>
                  <span className="truncate text-[13.5px] font-medium tracking-[0.01em]">
                    {agent.name}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {presence?.tone === "running" && (
                      <span className="h-2 w-2 rounded-full bg-[#3b82f6] animate-pulse-dot" />
                    )}
                    {presence?.tone === "review" && (
                      <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
                    )}
                    {presence?.tone === "error" && (
                      <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                    )}
                    {agent.source === "custom" && (
                      <Settings2
                        className="h-3 w-3 flex-shrink-0 text-[#6e7681] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#e6edf3]"
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
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] text-[#8fa1b3] transition-colors hover:bg-white/[0.06] hover:text-[#e6edf3]"
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
                        ? "border-[#27415f] bg-[linear-gradient(90deg,rgba(37,99,235,0.18),rgba(18,25,39,0.24))] text-[#eef5fc]"
                        : "border-transparent text-[#c9d1d9] hover:border-white/[0.06] hover:bg-[#161d2a]",
                    )}
                  >
                    <span className="text-[14px] text-[#8b949e]">#</span>
                    <span className="truncate text-[14px]">
                      {channel.title}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-2 py-2 text-[12px] text-[#6e7681]">
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
              className="text-[10px] text-[#8b949e] transition-colors hover:text-[#e6edf3]"
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
                      ? "border-[#27415f] bg-[linear-gradient(90deg,rgba(37,99,235,0.18),rgba(18,25,39,0.24))] text-[#eef5fc]"
                      : "border-transparent text-[#c9d1d9] hover:border-white/[0.06] hover:bg-[#161d2a]",
                  )}
                >
                  <p className="line-clamp-1 text-[13px]">
                    {session.question}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#6e7681]">
                    {session.messages.length} messages
                  </p>
                </button>
              ))
            ) : (
              <p className="px-2 py-2 text-[12px] text-[#6e7681]">
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
                        ? "border-[#27415f] bg-[linear-gradient(90deg,rgba(37,99,235,0.18),rgba(18,25,39,0.24))] text-[#eef5fc]"
                        : "border-transparent text-[#c9d1d9] hover:border-white/[0.06] hover:bg-[#161d2a]",
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-[#8b949e]" />
                    <span className="truncate text-[14px]">{item.label}</span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {/* Sidebar — Footer */}
      <div className="border-t border-white/[0.07] bg-[#0c111b] px-3.5 py-3">
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
            className="flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-left text-[12px] text-[#93a4b8] transition-colors hover:bg-white/[0.05] hover:text-[#edf4f8]"
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-[#3b82f6] animate-pulse-dot" />
            Activity rail
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setWorkspaceView("accounts")}
            className="flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[12px] text-[#8fa1b3] transition-colors hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-[#e6edf3]"
          >
            <Orbit className="h-3.5 w-3.5" />
            Mini Apps
          </button>
          <button
            onClick={() => setWorkspaceView("delegations")}
            className="flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[12px] text-[#8fa1b3] transition-colors hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-[#e6edf3]"
          >
            <Inbox className="h-3.5 w-3.5" />
            Inbox
          </button>
          <button
            onClick={() => setWorkspaceView("observability")}
            className="flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[12px] text-[#8fa1b3] transition-colors hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-[#e6edf3]"
          >
            <MonitorSmartphone className="h-3.5 w-3.5" />
            Devices
          </button>
          <button
            onClick={() => setWorkspaceView("accounts")}
            className="flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[12px] text-[#8fa1b3] transition-colors hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-[#e6edf3]"
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
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.06] transition-colors hover:bg-[#3b82f6]/40" />
      </button>
    </aside>
  );
}
