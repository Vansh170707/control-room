import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { List, Server, Settings2, Terminal, X } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { TerminalRenderer } from "./TerminalRenderer";
import { useAppStore } from "../../store";

export function ActivityDrawer({ legacyProps }: { legacyProps: any }) {
  const {
    currentLiveActivities,
    formatRelativeTime,
    isExecutingCommand,
    selectedAgent,
    hasAgentRuntime,
    latestAgentRun,
    activeActionChips,
    activityBadgeClasses,
    currentAgentRuns,
    toolInvocationResults,
    selectedAgentWorkspaceLabel,
    handleEditAgent,
    currentAgentArtifacts,
    getRuntimeFileViewUrl,
    selectedFilePreviewArtifact,
    selectedFilePreviewUrl,
    setSelectedFilePreviewPath,
    browserTaskDraft,
    setBrowserTaskDraft,
    handleCreateBrowserSession,
    isBrowserSessionLoading,
    browserSessionError,
    activeBrowserSession,
    handleStopBrowserSession,
    browserSessions,
    setActiveBrowserSessionId,
    activeBrowserSessionId,
    commandError
  } = legacyProps;

  const isActivityDrawerOpen = useAppStore(s => s.isActivityDrawerOpen);
  const setIsActivityDrawerOpen = useAppStore(s => s.setIsActivityDrawerOpen);
  const activityPanelWidth = useAppStore(s => s.activityPanelWidth);
  const setActivityPanelWidth = useAppStore(s => s.setActivityPanelWidth);
  const activityDrawerTab = useAppStore(s => s.activityDrawerTab);
  const setActivityDrawerTab = useAppStore(s => s.setActivityDrawerTab);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current) return;
      const nextWidth = Math.min(
        760,
        Math.max(340, window.innerWidth - event.clientX),
      );
      setActivityPanelWidth(nextWidth);
    };

    const handleMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setActivityPanelWidth]);

  if (!isActivityDrawerOpen) {
    return null;
  }

  const activityCount = currentLiveActivities.length + currentAgentRuns.length;
  const isRunning =
    latestAgentRun?.status === "running" ||
    currentLiveActivities.some((entry: any) => entry.status === "running");

  return (
    <>
        {/* Mobile backdrop for activity drawer */}
        <div
          className={cn(
            "fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity xl:hidden",
            isActivityDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setIsActivityDrawerOpen(false)}
        />
        <motion.aside
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ x: 24, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
          className="claude-activity-drawer fixed inset-y-0 right-0 z-40 flex w-[92vw] max-w-[420px] shrink-0 flex-col border-l border-[#e0d2c0] bg-[linear-gradient(180deg,#fbf7ef,#f2eadf)] shadow-[-4px_0_24px_rgba(0,0,0,0.12)] xl:relative xl:z-10 xl:w-auto xl:max-w-none xl:shadow-none"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1280 ? activityPanelWidth : undefined }}
        >
          <button
            type="button"
            aria-label="Resize activity panel"
            onMouseDown={() => {
              isResizingRef.current = true;
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            className="absolute left-0 top-0 h-full w-2 -translate-x-1/2 cursor-col-resize bg-transparent"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#d7c8b7] transition-colors hover:bg-[#c96437]/50" />
          </button>

          <div className="claude-activity-header border-b border-[#e0d2c0] bg-[#fbf7ef]/90 px-5 py-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <List className="h-4 w-4 text-[#8f7b66]" />
                <span className="text-[17px] font-semibold tracking-[-0.02em] text-[#2f261f]">
                  Activity
                </span>
                <span className="inline-flex min-w-[28px] items-center justify-center rounded-md border border-[#e0d2c0] bg-[#fffaf2] px-1.5 py-0.5 text-[11px] text-[#7d6b5a]">
                  {activityCount}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium",
                    isRunning
                      ? "border border-[#c96437]/30 bg-[#c96437]/12 text-[#9a4f2c]"
                      : "border border-[#e0d2c0] bg-[#fffaf2] text-[#7d6b5a]",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isRunning ? "bg-[#c96437] animate-pulse-dot" : "bg-[#a99683]",
                    )}
                  />
                  {isRunning ? "Running" : "Idle"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsActivityDrawerOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#e0d2c0] bg-[#fffaf2] text-[#7d6b5a] transition-colors hover:border-[#cfbda8] hover:bg-white hover:text-[#2f261f]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 flex items-center gap-5 border-t border-[#e0d2c0] pt-3 text-[11px]">
              {(["activity", "files", "terminal", "browser"] as const).map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActivityDrawerTab(tab)}
                    className={cn(
                      "relative pb-2 text-[13px] capitalize transition-colors",
                      activityDrawerTab === tab
                        ? "text-[#2f261f]"
                        : "text-[#8f7b66] hover:text-[#5f5042]",
                    )}
                  >
                    {tab}
                    <span
                      className={cn(
                        "absolute inset-x-0 -bottom-[13px] h-0.5 rounded-full transition-opacity",
                        activityDrawerTab === tab
                          ? "bg-[#c96437] opacity-100"
                          : "bg-transparent opacity-0",
                      )}
                    />
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="claude-activity-body flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#f8f3ea,#f2eadf)] p-4">
            {selectedAgent ? (
              <>
                <div className="claude-activity-card rounded-2xl border border-[#e0d2c0] bg-[#fffaf2] p-4 shadow-[0_10px_26px_rgba(120,71,35,0.08)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#2f261f]">
                        {selectedAgent.emoji} {selectedAgent.name}
                      </p>
                      <p className="mt-1 text-[12px] text-[#8f7b66]">
                        {selectedAgent.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedAgent.source === "custom" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditAgent(selectedAgent)}
                          className="h-7 px-2 text-[11px] text-[#7d6b5a] hover:text-[#2f261f]"
                        >
                          <Settings2 className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                      )}
                      {selectedAgent.permissions.terminal && (
                        <Badge variant="emerald">Sandbox</Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-[#7d6b5a]">
                    {selectedAgentWorkspaceLabel}
                  </p>
                </div>

                {activityDrawerTab === "activity" && (
                  <div className="claude-activity-card overflow-hidden rounded-xl border border-[#e0d2c0] bg-[#fffaf2]">
                    <div className="claude-activity-card-header flex items-center justify-between border-b border-[#e0d2c0] px-3 py-2">
                      <span className="text-[11px] uppercase tracking-wider text-[#8f7b66]">
                        Step-by-step activity
                      </span>
                      <span className="text-[10px] text-[#9a8978]">
                        {currentLiveActivities.length}
                      </span>
                    </div>
                    <div className="overflow-hidden">
                      {currentLiveActivities.length > 0 ? (
                        <motion.div 
                          className="divide-y divide-[#eadfce]"
                          variants={{
                            hidden: {},
                            show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } }
                          }}
                          initial="hidden"
                          animate="show"
                        >
                          {currentLiveActivities.map((entry: any) => (
                            <motion.div 
                              key={entry.id}
                              className="px-3 py-3 hover:bg-[#fbf7ef] transition-colors"
                              variants={{
                                hidden: { y: 8, opacity: 0, filter: "blur(2px)" },
                                show: { y: 0, opacity: 1, filter: "blur(0px)", transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                  <span className="h-2.5 w-2.5 rounded-sm bg-[#22c55e]" />
                                  <span className="text-[13px] font-medium text-[#2f261f]">
                                    {entry.label}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[10px] font-medium shrink-0",
                                      entry.status === "running"
                                        ? "text-[#7fb5ff]"
                                        : entry.status === "completed"
                                          ? "text-[#34d399]"
                                          : entry.status === "failed"
                                            ? "text-[#f87171]"
                                            : "text-[#9a8978]",
                                    )}
                                  >
                                    {entry.status}
                                  </span>
                                </div>
                                <span className="text-[10px] text-[#9a8978] shrink-0 pt-0.5">
                                  {formatRelativeTime(entry.timestamp)}
                                </span>
                              </div>
                              <p className="mt-1.5 pl-4 text-[12px] leading-relaxed text-[#7d6b5a] line-clamp-3 break-words">
                                {entry.detail}
                              </p>
                            </motion.div>
                          ))}
                        </motion.div>
                      ) : (
                        <div className="px-3 py-4 text-center text-[12px] text-[#9a8978]">
                          Agent actions will appear here as they happen.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activityDrawerTab === "files" && (
                  <div className="space-y-3">
                    <div className="claude-activity-card overflow-hidden rounded-xl border border-[#e0d2c0] bg-[#fffaf2]">
                      <div className="claude-activity-card-header flex items-center justify-between border-b border-[#e0d2c0] px-3 py-2">
                        <span className="text-[11px] uppercase tracking-wider text-[#8f7b66]">
                          Generated Files
                        </span>
                        <span className="text-[10px] text-[#9a8978]">
                          {currentAgentArtifacts.length}
                        </span>
                      </div>
                      {currentAgentArtifacts.length > 0 ? (
                        <div className="divide-y divide-[#eadfce]">
                          {currentAgentArtifacts.map((artifact: any) => {
                            const filePath = artifact.path || "";
                            const isPdf = /\.pdf$/i.test(
                              filePath || artifact.name,
                            );
                            const viewUrl = filePath
                              ? getRuntimeFileViewUrl(filePath)
                              : artifact.url || "";
                            const isSelected =
                              selectedFilePreviewArtifact?.path === filePath;

                            return (
                              <div
                                key={`${artifact.name}-${filePath}`}
                                className="px-3 py-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-[13px] font-medium text-[#2f261f]">
                                      {artifact.name}
                                    </p>
                                    <p className="mt-1 break-all text-[11px] text-[#9a8978]">
                                      {filePath ||
                                        artifact.url ||
                                        "Generated artifact"}
                                    </p>
                                    {typeof artifact.size === "number" ? (
                                      <p className="mt-1 text-[10px] text-[#9a8978]">
                                        {Math.max(
                                          1,
                                          Math.round(artifact.size / 1024),
                                        )}{" "}
                                        KB
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {isPdf && viewUrl ? (
                                      <Button
                                        variant={
                                          isSelected ? "secondary" : "ghost"
                                        }
                                        size="sm"
                                        onClick={() =>
                                          setSelectedFilePreviewPath(filePath)
                                        }
                                        className="h-7 px-2.5 text-[11px]"
                                      >
                                        View
                                      </Button>
                                    ) : null}
                                    {viewUrl ? (
                                      <a
                                        href={viewUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex h-7 items-center rounded-md border border-[#e0d2c0] px-2.5 text-[11px] text-[#9a4f2c] transition-colors hover:bg-[#fffaf2]"
                                      >
                                        Open
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="px-3 py-5 text-[12px] leading-relaxed text-[#8f7b66]">
                          Generated files will appear here after this agent
                          creates artifacts like PDFs, docs, or exports.
                        </div>
                      )}
                    </div>

                    {selectedFilePreviewArtifact &&
                    /\.pdf$/i.test(
                      selectedFilePreviewArtifact.path ||
                        selectedFilePreviewArtifact.name,
                    ) &&
                    selectedFilePreviewUrl ? (
                      <div className="claude-activity-card overflow-hidden rounded-xl border border-[#e0d2c0] bg-[#fffaf2]">
                        <div className="claude-activity-card-header flex items-center justify-between border-b border-[#e0d2c0] px-3 py-2">
                          <span className="text-[11px] uppercase tracking-wider text-[#8f7b66]">
                            PDF Preview
                          </span>
                          <span className="truncate text-[10px] text-[#9a8978]">
                            {selectedFilePreviewArtifact.name}
                          </span>
                        </div>
                        <iframe
                          src={selectedFilePreviewUrl}
                          title={selectedFilePreviewArtifact.name}
                          className="w-full border-0 bg-white"
                          style={{ height: 420 }}
                        />
                      </div>
                    ) : null}
                  </div>
                )}

                {activityDrawerTab === "browser" && (
                  <div className="space-y-3">
                    {/* Create session form */}
                    <div className="claude-activity-card rounded-xl border border-[#e0d2c0] bg-[#fffaf2] p-3 space-y-2">
                      <p className="text-[11px] uppercase tracking-wider text-[#8f7b66]">
                        Launch Browser Session
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleCreateBrowserSession();
                        }}
                        className="flex gap-2"
                      >
                        <input
                          value={browserTaskDraft}
                          onChange={(e) => setBrowserTaskDraft(e.target.value)}
                          placeholder="e.g. Search for trending GitHub repos"
                          className="flex-1 rounded-md border border-[#d7c8b7] bg-[#fbf7ef] px-2.5 py-1.5 text-[12px] text-[#2f261f] placeholder-[#9a8978] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]/35"
                        />
                        <button
                          type="submit"
                          disabled={
                            isBrowserSessionLoading || !browserTaskDraft.trim()
                          }
                          className="rounded-md border border-[#c96437]/30 bg-[#c96437]/10 px-3 py-1.5 text-[11px] font-medium text-[#9a4f2c] transition-colors hover:bg-[#c96437]/15 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isBrowserSessionLoading ? "Starting…" : "Launch"}
                        </button>
                      </form>
                      {browserSessionError && (
                        <p className="text-[11px] text-[#f87171]">
                          {browserSessionError}
                        </p>
                      )}
                    </div>

                    {/* Active session live view */}
                    {activeBrowserSession?.liveUrl && (
                      <div className="claude-activity-card overflow-hidden rounded-xl border border-[#e0d2c0] bg-[#fffaf2]">
                        <div className="claude-activity-card-header flex items-center justify-between border-b border-[#e0d2c0] bg-[#f7efe3] px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#c96437] animate-pulse" />
                            <span className="text-[11px] font-medium text-[#9a4f2c]">
                              Live Browser View
                            </span>
                            <span className="text-[10px] text-[#9a8978]">
                              {activeBrowserSession.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <a
                              href={activeBrowserSession.liveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded px-1.5 py-0.5 text-[10px] text-[#9a4f2c] hover:underline"
                            >
                              Open ↗
                            </a>
                            {(activeBrowserSession.status === "running" ||
                              activeBrowserSession.status === "created") && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleStopBrowserSession(
                                    activeBrowserSession.id,
                                  )
                                }
                                className="rounded px-1.5 py-0.5 text-[10px] text-[#b84a35] hover:bg-[#c96437]/10"
                              >
                                Stop
                              </button>
                            )}
                          </div>
                        </div>
                        <iframe
                          src={activeBrowserSession.liveUrl}
                          title="Browser Use live view"
                          className="w-full border-0"
                          style={{ height: 340 }}
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        />
                        {activeBrowserSession.task && (
                          <div className="border-t border-[#e0d2c0] px-3 py-2 text-[11px] text-[#7d6b5a] truncate">
                            Task: {activeBrowserSession.task}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Session list */}
                    {browserSessions.length > 0 && (
                      <div className="claude-activity-card overflow-hidden rounded-xl border border-[#e0d2c0] bg-[#fffaf2]">
                        <div className="claude-activity-card-header flex items-center justify-between border-b border-[#e0d2c0] px-3 py-2">
                          <span className="text-[11px] uppercase tracking-wider text-[#8f7b66]">
                            Sessions
                          </span>
                          <span className="text-[10px] text-[#9a8978]">
                            {browserSessions.length}
                          </span>
                        </div>
                        <div className="divide-y divide-[#eadfce]">
                          {browserSessions.slice(0, 8).map((session: any) => (
                            <button
                              key={session.id}
                              type="button"
                              onClick={() =>
                                setActiveBrowserSessionId(session.id)
                              }
                              className={`w-full px-3 py-2 text-left transition-colors hover:bg-[#fbf7ef] ${
                                activeBrowserSessionId === session.id
                                  ? "bg-[#c96437]/5"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-[12px] text-[#2f261f]">
                                  {session.task || "Browser session"}
                                </p>
                                <span
                                  className={`text-[10px] ${
                                    session.status === "running" ||
                                    session.status === "created"
                                      ? "text-[#c96437]"
                                      : session.status === "completed"
                                        ? "text-[#34d399]"
                                        : session.status === "stopped"
                                          ? "text-[#94a3b8]"
                                          : "text-[#f87171]"
                                  }`}
                                >
                                  {session.status}
                                </span>
                              </div>
                              {session.agentName && (
                                <p className="mt-0.5 text-[10px] text-[#9a8978] truncate">
                                  Agent: {session.agentName}
                                </p>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty state */}
                    {browserSessions.length === 0 && !activeBrowserSession && (
                      <div className="claude-activity-card rounded-xl border border-[#e0d2c0] bg-[#fffaf2] p-3 text-[12px] leading-relaxed text-[#7d6b5a]">
                        No browser sessions yet. Type a task above and hit
                        Launch to start an interactive browser session via
                        Browser Use.
                      </div>
                    )}
                  </div>
                )}

                {activityDrawerTab === "terminal" &&
                  (selectedAgent.source !== "custom" ? (
                    <div className="claude-activity-card rounded-xl border border-[#e0d2c0] bg-[#fffaf2] p-3 text-[12px] text-[#7d6b5a]">
                      Connected agents can chat here, but sandbox execution is
                      only available for custom agents right now.
                    </div>
                  ) : !selectedAgent.permissions.terminal ? (
                    <div className="claude-activity-card rounded-xl border border-[#e0d2c0] bg-[#fffaf2] p-3 text-[12px] text-[#7d6b5a]">
                      Enable terminal permission for this agent to run bash
                      commands from the workspace.
                    </div>
                  ) : (
                    <>
                      {commandError && (
                        <div className="rounded-lg border border-[#d77b62]/35 bg-[#c96437]/10 px-3 py-2 text-[12px] text-[#9a4f2c]">
                          {commandError}
                        </div>
                      )}

                      <div className="claude-terminal-card overflow-hidden rounded-xl border border-[#d7c8b7] bg-[#fffaf2]">
                        <div className="claude-activity-card-header flex items-center justify-between border-b border-[#e0d2c0] bg-[#f7efe3] px-3 py-2">
                          <span className="text-[11px] text-[#8f7b66]">
                            Live Terminal
                          </span>
                          <span className="text-[10px] text-[#9a8978]">
                            {latestAgentRun
                              ? latestAgentRun.status === "running"
                                ? "streaming"
                                : latestAgentRun.status
                              : "idle"}
                          </span>
                        </div>
                        <div className="p-3 font-mono text-[12px] min-h-[280px] max-h-[360px] overflow-auto">
                          {activeActionChips.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                              {activeActionChips.map((entry: any) => (
                                <span
                                  key={entry.id}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px]",
                                    activityBadgeClasses(entry.kind),
                                  )}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"></span>
                                  {entry.label}
                                </span>
                              ))}
                            </div>
                          )}
                          <TerminalRenderer latestAgentRun={latestAgentRun} />
                        </div>
                      </div>

                      {currentAgentRuns.length > 0 && (
                        <div className="claude-activity-card overflow-hidden rounded-xl border border-[#e0d2c0] bg-[#fffaf2]">
                          <div className="claude-activity-card-header flex items-center justify-between border-b border-[#e0d2c0] px-3 py-2">
                            <span className="text-[11px] uppercase tracking-wider text-[#8f7b66]">
                              Recent Runs
                            </span>
                            <span className="text-[10px] text-[#9a8978]">
                              {currentAgentRuns.length}
                            </span>
                          </div>
                          <div className="divide-y divide-[#eadfce]">
                            {currentAgentRuns.map((run: any) => (
                              <div key={run.id} className="px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-[12px] text-[#2f261f]">
                                    {run.activityLabel || run.command}
                                  </p>
                                  <span
                                    className={cn(
                                      "text-[10px]",
                                      run.status === "running"
                                        ? "text-[#fbbf24]"
                                        : run.status === "completed"
                                          ? "text-[#34d399]"
                                          : run.status === "canceled"
                                            ? "text-[#94a3b8]"
                                            : "text-[#f87171]",
                                    )}
                                  >
                                    {run.status}
                                  </span>
                                </div>
                                <p className="mt-1 truncate text-[11px] text-[#9a8978]">
                                  {run.command}
                                </p>
                                <p className="mt-1 truncate text-[11px] text-[#9a8978]">
                                  {run.cwd}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ))}

                {activityDrawerTab === "activity" && (
                  <div className="claude-activity-card overflow-hidden rounded-xl border border-[#e0d2c0] bg-[#fffaf2]">
                    <div className="claude-activity-card-header flex items-center justify-between border-b border-[#e0d2c0] px-3 py-2">
                      <span className="text-[11px] uppercase tracking-wider text-[#8f7b66]">
                        Tool Invocations
                      </span>
                      <span className="text-[10px] text-[#9a8978]">
                        {toolInvocationResults.length}
                      </span>
                    </div>
                    <div className="divide-y divide-[#eadfce]">
                      {toolInvocationResults.length > 0 ? (
                        toolInvocationResults.slice(0, 5).map((result: any, i: any) => (
                          <div key={i} className="px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    "inline-flex h-4 items-center rounded border px-1 text-[9px] font-medium",
                                    result.ok
                                      ? "border-[#34d399]/30 bg-[#34d399]/10 text-[#6ee7b7]"
                                      : "border-[#f87171]/30 bg-[#f87171]/10 text-[#fca5a5]",
                                  )}
                                >
                                  {result.tool}
                                </span>
                                {result.approvalRequired && (
                                  <span className="text-[9px] text-[#fbbf24]">
                                    approval needed
                                  </span>
                                )}
                              </div>
                              <span
                                className={cn(
                                  "text-[10px]",
                                  result.ok
                                    ? "text-[#34d399]"
                                    : "text-[#f87171]",
                                )}
                              >
                                {result.ok ? "ok" : "failed"}
                              </span>
                            </div>
                            {result.error && (
                              <p className="mt-1 truncate text-[11px] text-[#f87171]">
                                {result.error}
                              </p>
                            )}
                            {result.data?.durationMs != null && (
                              <p className="mt-1 text-[10px] text-[#9a8978]">
                                {Number(result.data.durationMs)}ms
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-[12px] text-[#9a8978]">
                          Tool invocations will appear here.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="claude-activity-card rounded-xl border border-[#e0d2c0] bg-[#fffaf2] p-3 text-[12px] text-[#7d6b5a]">
                Select an agent to inspect sandbox activity.
              </div>
            )}
          </div>

          <div className="border-t border-[#e0d2c0] bg-[#f7efe3] px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#8f7b66]">
              <Server className="h-3.5 w-3.5" />
              Workspace lane
              {selectedAgent?.workspace ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#6f8b4d]/25 bg-[#6f8b4d]/10 px-2 py-0.5 text-[9px] normal-case tracking-normal text-[#58733a]">
                  Active
                </span>
              ) : null}
            </div>
            <p className="mt-2 truncate text-[11px] text-[#7d6b5a]">
              {selectedAgent?.workspace || "No workspace path configured."}
            </p>
          </div>
        </motion.aside>
    </>
  );
}
