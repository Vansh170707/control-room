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
        <motion.aside
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ x: 24, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
          className="relative z-10 hidden shrink-0 flex-col border-l border-white/8 bg-[linear-gradient(180deg,rgba(12,18,28,0.98),rgba(10,15,23,0.96))] xl:flex"
          style={{ width: activityPanelWidth }}
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
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.08] transition-colors hover:bg-[#3b82f6]/50" />
          </button>

          <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(20,27,39,0.96),rgba(14,20,30,0.9))] px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <List className="h-4 w-4 text-[#8ea0b5]" />
                <span className="text-[17px] font-semibold tracking-[-0.02em] text-[#f1f6fb]">
                  Activity
                </span>
                <span className="inline-flex min-w-[28px] items-center justify-center rounded-md border border-white/8 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-[#8fa1b3]">
                  {activityCount}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium",
                    isRunning
                      ? "border border-[#3b82f6]/25 bg-[#1d4ed8]/15 text-[#7fb5ff]"
                      : "border border-white/8 bg-white/[0.04] text-[#93a4b8]",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isRunning ? "bg-[#3b82f6] animate-pulse-dot" : "bg-[#64748b]",
                    )}
                  />
                  {isRunning ? "Running" : "Idle"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsActivityDrawerOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#8fa1b3] transition-colors hover:border-white/16 hover:bg-white/[0.06] hover:text-[#edf4f8]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 flex items-center gap-5 border-t border-white/8 pt-3 text-[11px]">
              {(["activity", "files", "terminal", "browser"] as const).map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActivityDrawerTab(tab)}
                    className={cn(
                      "relative pb-2 text-[13px] capitalize transition-colors",
                      activityDrawerTab === tab
                        ? "text-[#edf4f8]"
                        : "text-[#7d90a5] hover:text-[#dce7f0]",
                    )}
                  >
                    {tab}
                    <span
                      className={cn(
                        "absolute inset-x-0 -bottom-[13px] h-0.5 rounded-full transition-opacity",
                        activityDrawerTab === tab
                          ? "bg-[#3b82f6] opacity-100"
                          : "bg-transparent opacity-0",
                      )}
                    />
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(13,18,28,0.92),rgba(10,15,23,0.96))] p-4">
            {selectedAgent ? (
              <>
                <div className="rounded-2xl border border-white/6 bg-[linear-gradient(180deg,rgba(18,26,37,0.88),rgba(12,18,27,0.82))] p-4 shadow-none">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#f4f8fb]">
                        {selectedAgent.emoji} {selectedAgent.name}
                      </p>
                      <p className="mt-1 text-[12px] text-[#8ea0b5]">
                        {selectedAgent.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedAgent.source === "custom" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditAgent(selectedAgent)}
                          className="h-7 px-2 text-[11px] text-[#6e7681] hover:text-[#e2e8f0]"
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
                  <p className="mt-3 text-[12px] leading-relaxed text-[#9da7b2]">
                    {selectedAgentWorkspaceLabel}
                  </p>
                </div>

                {activityDrawerTab === "activity" && (
                  <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-[#1e252e] flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                        Step-by-step activity
                      </span>
                      <span className="text-[10px] text-[#6e7681]">
                        {currentLiveActivities.length}
                      </span>
                    </div>
                    <div className="overflow-hidden">
                      {currentLiveActivities.length > 0 ? (
                        <motion.div 
                          className="divide-y divide-[#1e252e]"
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
                              className="px-3 py-3 hover:bg-white/[0.02] transition-colors"
                              variants={{
                                hidden: { y: 8, opacity: 0, filter: "blur(2px)" },
                                show: { y: 0, opacity: 1, filter: "blur(0px)", transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                  <span className="h-2.5 w-2.5 rounded-sm bg-[#22c55e]" />
                                  <span className="text-[13px] font-medium text-[#dfe8f2]">
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
                                            : "text-[#6e7681]",
                                    )}
                                  >
                                    {entry.status}
                                  </span>
                                </div>
                                <span className="text-[10px] text-[#6e7681] shrink-0 pt-0.5">
                                  {formatRelativeTime(entry.timestamp)}
                                </span>
                              </div>
                              <p className="mt-1.5 pl-4 text-[12px] leading-relaxed text-[#8ea0b5] line-clamp-3 break-words">
                                {entry.detail}
                              </p>
                            </motion.div>
                          ))}
                        </motion.div>
                      ) : (
                        <div className="px-3 py-4 text-center text-[12px] text-[#6e7681]">
                          Agent actions will appear here as they happen.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activityDrawerTab === "files" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 overflow-hidden">
                      <div className="px-3 py-2 border-b border-[#1e252e] flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                          Generated Files
                        </span>
                        <span className="text-[10px] text-[#6e7681]">
                          {currentAgentArtifacts.length}
                        </span>
                      </div>
                      {currentAgentArtifacts.length > 0 ? (
                        <div className="divide-y divide-[#1e252e]">
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
                                    <p className="truncate text-[13px] font-medium text-[#e2e8f0]">
                                      {artifact.name}
                                    </p>
                                    <p className="mt-1 break-all text-[11px] text-[#6e7681]">
                                      {filePath ||
                                        artifact.url ||
                                        "Generated artifact"}
                                    </p>
                                    {typeof artifact.size === "number" ? (
                                      <p className="mt-1 text-[10px] text-[#6e7681]">
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
                                        className="inline-flex h-7 items-center rounded-md border border-white/8 px-2.5 text-[11px] text-[#79c0ff] transition-colors hover:bg-white/[0.04]"
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
                        <div className="px-3 py-5 text-[12px] leading-relaxed text-[#8b949e]">
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
                      <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 overflow-hidden">
                        <div className="px-3 py-2 border-b border-[#1e252e] flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                            PDF Preview
                          </span>
                          <span className="truncate text-[10px] text-[#6e7681]">
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
                    <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 p-3 space-y-2">
                      <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
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
                          className="flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-[12px] text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]/35"
                        />
                        <button
                          type="submit"
                          disabled={
                            isBrowserSessionLoading || !browserTaskDraft.trim()
                          }
                          className="rounded-md border border-[#8b5cf6]/40 bg-[#8b5cf6]/15 px-3 py-1.5 text-[11px] font-medium text-[#c4b5fd] transition-colors hover:bg-[#8b5cf6]/25 disabled:opacity-40 disabled:cursor-not-allowed"
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
                      <div className="rounded-xl border border-[#8b5cf6]/30 bg-[#161b22]/60 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e252e] bg-[#111822]">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#8b5cf6] animate-pulse" />
                            <span className="text-[11px] font-medium text-[#c4b5fd]">
                              Live Browser View
                            </span>
                            <span className="text-[10px] text-[#6e7681]">
                              {activeBrowserSession.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <a
                              href={activeBrowserSession.liveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded px-1.5 py-0.5 text-[10px] text-[#79c0ff] hover:underline"
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
                                className="rounded px-1.5 py-0.5 text-[10px] text-[#f87171] hover:bg-[#3f191f]/30"
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
                          <div className="px-3 py-2 border-t border-[#1e252e] text-[11px] text-[#8b949e] truncate">
                            Task: {activeBrowserSession.task}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Session list */}
                    {browserSessions.length > 0 && (
                      <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 overflow-hidden">
                        <div className="px-3 py-2 border-b border-[#1e252e] flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                            Sessions
                          </span>
                          <span className="text-[10px] text-[#6e7681]">
                            {browserSessions.length}
                          </span>
                        </div>
                        <div className="divide-y divide-[#1e252e]">
                          {browserSessions.slice(0, 8).map((session: any) => (
                            <button
                              key={session.id}
                              type="button"
                              onClick={() =>
                                setActiveBrowserSessionId(session.id)
                              }
                              className={`w-full px-3 py-2 text-left transition-colors hover:bg-white/[0.03] ${
                                activeBrowserSessionId === session.id
                                  ? "bg-[#8b5cf6]/5"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-[12px] text-[#e2e8f0]">
                                  {session.task || "Browser session"}
                                </p>
                                <span
                                  className={`text-[10px] ${
                                    session.status === "running" ||
                                    session.status === "created"
                                      ? "text-[#8b5cf6]"
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
                                <p className="mt-0.5 text-[10px] text-[#6e7681] truncate">
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
                      <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 p-3 text-[12px] leading-relaxed text-[#8b949e]">
                        No browser sessions yet. Type a task above and hit
                        Launch to start an interactive browser session via
                        Browser Use.
                      </div>
                    )}
                  </div>
                )}

                {activityDrawerTab === "terminal" &&
                  (selectedAgent.source !== "custom" ? (
                    <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 p-3 text-[12px] text-[#8b949e]">
                      Connected agents can chat here, but sandbox execution is
                      only available for custom agents right now.
                    </div>
                  ) : !selectedAgent.permissions.terminal ? (
                    <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 p-3 text-[12px] text-[#8b949e]">
                      Enable terminal permission for this agent to run bash
                      commands from the workspace.
                    </div>
                  ) : (
                    <>
                      {commandError && (
                        <div className="rounded-lg border border-red-900/40 bg-[#3f191f]/30 px-3 py-2 text-[12px] text-[#fda4af]">
                          {commandError}
                        </div>
                      )}

                      <div className="rounded-xl border border-[#1e252e] bg-[#0b0f15] overflow-hidden">
                        <div className="px-3 py-2 border-b border-[#1e252e] bg-[#111822] flex items-center justify-between">
                          <span className="text-[11px] text-[#8b949e]">
                            Live Terminal
                          </span>
                          <span className="text-[10px] text-[#6e7681]">
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
                        <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 overflow-hidden">
                          <div className="px-3 py-2 border-b border-[#1e252e] flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                              Recent Runs
                            </span>
                            <span className="text-[10px] text-[#6e7681]">
                              {currentAgentRuns.length}
                            </span>
                          </div>
                          <div className="divide-y divide-[#1e252e]">
                            {currentAgentRuns.map((run: any) => (
                              <div key={run.id} className="px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-[12px] text-[#e2e8f0]">
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
                                <p className="mt-1 truncate text-[11px] text-[#6e7681]">
                                  {run.command}
                                </p>
                                <p className="mt-1 truncate text-[11px] text-[#6e7681]">
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
                  <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-[#1e252e] flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                        Tool Invocations
                      </span>
                      <span className="text-[10px] text-[#6e7681]">
                        {toolInvocationResults.length}
                      </span>
                    </div>
                    <div className="divide-y divide-[#1e252e]">
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
                              <p className="mt-1 text-[10px] text-[#6e7681]">
                                {Number(result.data.durationMs)}ms
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-[12px] text-[#6e7681]">
                          Tool invocations will appear here.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/40 p-3 text-[12px] text-[#8b949e]">
                Select an agent to inspect sandbox activity.
              </div>
            )}
          </div>

          <div className="border-t border-[#1e252e] bg-[#0d1117] px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#6e7f93]">
              <Server className="h-3.5 w-3.5" />
              Workspace lane
              {selectedAgent?.workspace ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#10b981]/25 bg-[#10b981]/10 px-2 py-0.5 text-[9px] normal-case tracking-normal text-[#6ee7b7]">
                  Active
                </span>
              ) : null}
            </div>
            <p className="mt-2 truncate text-[11px] text-[#8ea0b5]">
              {selectedAgent?.workspace || "No workspace path configured."}
            </p>
          </div>
        </motion.aside>

  );
}
