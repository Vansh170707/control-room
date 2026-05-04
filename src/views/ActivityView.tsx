import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  CommandRun,
  WorkspaceAgent,
  PresenceTone,
} from "@/types";
import { cn } from "@/lib/utils";
import {
  activityBadgeClasses,
  runCountsAsInFlight,
  runStatusTone,
} from "@/lib/helpers";
import { formatRelativeTime } from "@/lib/utils";
import { runStatusMeta, statusMeta } from "@/constants";
import { getRuntimeFileViewUrl } from "@/lib/agent-runtime";
import type { AppState } from "@/store/useAppStore";

interface ActivityMetricCard {
  label: string;
  value: string;
  detail: string;
  accent: string;
  icon: LucideIcon;
  iconClasses: string;
}

interface ActivityFocusPresence {
  tone: PresenceTone;
  headline: string;
  timeline: string;
  stepLabels: string[];
  runCount: number;
}

interface ActivityFocusCapabilityGroup {
  category: string;
  label: string;
  tools: Array<{ category: string }>;
}

interface ActivityViewProps {
  workspaceRuns: CommandRun[];
  workspaceInFlightCount: number;
  workspaceAttentionCount: number;
  activityMetricCards: ActivityMetricCard[];
  selectedActivityRun: CommandRun | null;
  refreshRuntimeRuns: () => void;
  isLoadingRuntimeRuns: boolean;
  runtimeRunsError: string | null;
  allAgents: WorkspaceAgent[];
  setSelectedActivityRunId: (id: string) => void;
  handleRetryRun: (run: CommandRun) => Promise<void>;
  handleResumeRun: (run: CommandRun) => Promise<void>;
  handleCancelRun: (run: CommandRun) => Promise<void>;
  isMutatingRunId: string | null;
  setSelectedFilePreviewPath: (path: string | null) => void;
  setActivityDrawerTab: AppState["setActivityDrawerTab"];
  activityFocusAgent: WorkspaceAgent | null;
  activityFocusPresence: ActivityFocusPresence | null;
  activityFocusRuns: CommandRun[];
  activityFocusCapabilityGroups: ActivityFocusCapabilityGroup[];
}

export function ActivityView({
  workspaceRuns,
  workspaceInFlightCount,
  workspaceAttentionCount,
  activityMetricCards,
  selectedActivityRun,
  refreshRuntimeRuns,
  isLoadingRuntimeRuns,
  runtimeRunsError,
  allAgents,
  setSelectedActivityRunId,
  handleRetryRun,
  handleResumeRun,
  handleCancelRun,
  isMutatingRunId,
  setSelectedFilePreviewPath,
  setActivityDrawerTab,
  activityFocusAgent,
  activityFocusPresence,
  activityFocusRuns,
  activityFocusCapabilityGroups,
}: ActivityViewProps) {
  return (
    <div className="mt-2 space-y-4">
      <div className="command-deck-panel relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,26,38,0.94),rgba(11,16,24,0.92))] px-5 py-5 shadow-[0_28px_70px_rgba(2,6,23,0.24)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[420px] bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_58%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#60a5fa]/18 bg-[#60a5fa]/8 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[#9dd7ff]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#60a5fa] command-deck-signal" />
              Live workspace command deck
            </div>
            <p className="mt-3 text-[28px] font-semibold tracking-[-0.02em] text-[#f5fbff]">
              Premium signal, not noisy telemetry.
            </p>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#8ea0b5]">
              The deck now leads with what matters first: active work,
              run health, and the agent currently shaping the
              workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="muted">
              {workspaceRuns.length} tracked runs
            </Badge>
            <Badge
              variant={workspaceInFlightCount > 0 ? "cyan" : "muted"}
            >
              {workspaceInFlightCount > 0
                ? `${workspaceInFlightCount} live`
                : "No active runs"}
            </Badge>
            {workspaceAttentionCount > 0 && (
              <Badge variant="danger">
                {workspaceAttentionCount} need attention
              </Badge>
            )}
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {activityMetricCards.map((card, index) => {
            const Icon = card.icon;

            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.32,
                  delay: index * 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="command-deck-metric group relative overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.09),transparent_42%)] opacity-70" />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#6e8398]">
                      {card.label}
                    </p>
                    <p
                      className={cn(
                        "mt-3 text-[30px] font-semibold tracking-[-0.03em]",
                        card.accent,
                      )}
                    >
                      {card.value}
                    </p>
                    <p className="mt-1 text-[12px] text-[#8ea0b5]">
                      {card.detail}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                      card.iconClasses,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(340px,0.82fr)]">
        <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,36,0.86),rgba(10,15,23,0.9))] p-3 shadow-[0_24px_60px_rgba(2,6,23,0.16)]">
          <div className="flex flex-col gap-3 rounded-[22px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,14,22,0.56),rgba(10,14,22,0.28))] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#eef6fb]">
                Activity Feed
              </p>
              <p className="mt-1 text-[12px] text-[#8b9bae]">
                Recent sandbox work, elevated by live state and
                operator priority.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="muted">
                {selectedActivityRun ? "Focused run selected" : "Browse recent work"}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refreshRuntimeRuns()}
                disabled={isLoadingRuntimeRuns}
                className="h-8 rounded-xl border border-white/8 px-3 text-[11px] text-[#c3d0dc] hover:bg-white/[0.05]"
              >
                {isLoadingRuntimeRuns ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
          {runtimeRunsError && (
            <div className="mx-1 mt-3 rounded-2xl border border-red-900/30 bg-[#3f191f]/20 px-4 py-3 text-[12px] text-[#fda4af]">
              {runtimeRunsError}
            </div>
          )}
          <div className="mt-3 space-y-2">
            {workspaceRuns.length > 0 ? (
              workspaceRuns.map((run) => {
                const tone = runStatusTone(run.status);
                const isSelected = selectedActivityRun?.id === run.id;
                const runAgent =
                  allAgents.find((agent) => agent.id === run.agentId) ||
                  null;

                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => setSelectedActivityRunId(run.id)}
                    className={cn(
                      "group relative w-full overflow-hidden rounded-[22px] border px-4 py-4 text-left transition-all duration-200",
                      tone.border,
                      tone.glow,
                      isSelected
                        ? "bg-[linear-gradient(180deg,rgba(21,33,49,0.94),rgba(12,18,28,0.94))] ring-1 ring-[#60a5fa]/20"
                        : "bg-[linear-gradient(180deg,rgba(17,23,34,0.82),rgba(10,15,23,0.78))] hover:-translate-y-[1px] hover:border-white/12 hover:bg-[linear-gradient(180deg,rgba(20,28,41,0.88),rgba(12,18,28,0.84))]",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none absolute inset-y-3 left-0 w-px rounded-full bg-gradient-to-b opacity-80",
                        tone.rail,
                        runCountsAsInFlight(run) &&
                          "command-deck-live-rail",
                      )}
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex h-6 items-center rounded-full border px-2.5 text-[10px] font-medium",
                              activityBadgeClasses(
                                run.activityKind || "sandbox",
                              ),
                            )}
                          >
                            {run.activityLabel || "Sandbox Run"}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.18em] text-[#617487]">
                            {formatRelativeTime(run.createdAt)}
                          </span>
                          {run.durationMs != null && (
                            <span className="text-[10px] text-[#7c8fa3]">
                              {run.durationMs}ms
                            </span>
                          )}
                        </div>
                        <p className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-[#eef6fb]">
                          {run.command}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#8ea0b5]">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                tone.dot,
                              )}
                            />
                            {runAgent?.name ||
                              run.agentName ||
                              run.agentId}
                          </span>
                          <span className="text-[#4f6880]">&bull;</span>
                          <span className="truncate">{run.cwd}</span>
                        </div>
                        {run.activitySummary && (
                          <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-[#7390a8]">
                            {run.activitySummary}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <Badge
                          variant={
                            runStatusMeta[run.status]?.badgeVariant ||
                            "danger"
                          }
                          className={cn(
                            "capitalize",
                            run.status === "running" &&
                              "nebula-chip-live",
                          )}
                        >
                          {runStatusMeta[run.status]?.label ||
                            run.status}
                        </Badge>
                        {isSelected && (
                          <span className="text-[10px] uppercase tracking-[0.18em] text-[#9dd7ff]">
                            Inspecting
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center text-[13px] text-[#6e7681]">
                No runtime runs yet. Ask a terminal-enabled agent to
                inspect the workspace and they'll appear here.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,36,0.9),rgba(10,15,23,0.92))] shadow-[0_24px_60px_rgba(2,6,23,0.18)] overflow-hidden">
            <div className="border-b border-white/8 px-4 py-4">
              <p className="text-sm font-semibold text-[#eef6fb]">
                Run Inspector
              </p>
              <p className="mt-1 text-[12px] text-[#8b9bae]">
                Status, output, and rerun controls for the current
                focus execution.
              </p>
            </div>
            {selectedActivityRun ? (
              <div className="p-4 space-y-4">
                <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,25,37,0.84),rgba(11,17,26,0.84))] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex h-6 items-center rounded-full border px-2.5 text-[10px] font-medium",
                            activityBadgeClasses(
                              selectedActivityRun.activityKind ||
                                "sandbox",
                            ),
                          )}
                        >
                          {selectedActivityRun.activityLabel ||
                            "Sandbox Run"}
                        </span>
                        <Badge
                          variant={
                            runStatusMeta[selectedActivityRun.status]
                              ?.badgeVariant || "danger"
                          }
                          className={cn(
                            "capitalize",
                            selectedActivityRun.status === "running" &&
                              "nebula-chip-live",
                          )}
                        >
                          {runStatusMeta[selectedActivityRun.status]
                            ?.label || selectedActivityRun.status}
                        </Badge>
                      </div>
                      <p className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-[#eef6fb]">
                        {selectedActivityRun.command}
                      </p>
                      <p className="mt-1 text-[12px] text-[#8ea0b5]">
                        {allAgents.find(
                          (agent) =>
                            agent.id === selectedActivityRun.agentId,
                        )?.name ||
                          selectedActivityRun.agentName ||
                          selectedActivityRun.agentId}{" "}
                        &middot; {formatRelativeTime(selectedActivityRun.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {["failed", "blocked", "canceled"].includes(
                        selectedActivityRun.status,
                      ) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void handleRetryRun(selectedActivityRun)
                          }
                          className="h-8 rounded-xl border border-white/8 px-3 text-[11px] text-[#c3d0dc] hover:bg-white/[0.05]"
                        >
                          Retry
                        </Button>
                      )}
                      {["blocked", "waiting_for_approval"].includes(
                        selectedActivityRun.status,
                      ) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            void handleResumeRun(selectedActivityRun)
                          }
                          disabled={
                            isMutatingRunId === selectedActivityRun.id
                          }
                          className="h-8 rounded-xl px-3 text-[11px]"
                        >
                          {isMutatingRunId === selectedActivityRun.id
                            ? "Resuming..."
                            : "Resume"}
                        </Button>
                      )}
                      {selectedActivityRun.status === "running" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void handleCancelRun(selectedActivityRun)
                          }
                          disabled={
                            isMutatingRunId === selectedActivityRun.id
                          }
                          className="h-8 rounded-xl border border-white/8 px-3 text-[11px] text-[#c3d0dc] hover:bg-white/[0.05]"
                        >
                          {isMutatingRunId === selectedActivityRun.id
                            ? "Stopping..."
                            : "Cancel"}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#62758a]">
                        Started
                      </p>
                      <p className="mt-1 text-[13px] text-[#dce7f2]">
                        {formatRelativeTime(
                          selectedActivityRun.createdAt,
                        )}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#62758a]">
                        Duration
                      </p>
                      <p className="mt-1 text-[13px] text-[#dce7f2]">
                        {selectedActivityRun.durationMs != null
                          ? `${selectedActivityRun.durationMs}ms`
                          : "Still running"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/8 bg-[#0b0f15] p-3 font-mono text-[12px] text-[#c5d2de] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="text-[#7ee7b0]">
                    $ {selectedActivityRun.command}
                  </div>
                  <div className="mt-2 text-[#6e7681]">
                    cwd: {selectedActivityRun.cwd}
                  </div>
                  {typeof selectedActivityRun.exitCode === "number" && (
                    <div className="mt-1 text-[#6e7681]">
                      exit: {selectedActivityRun.exitCode}
                    </div>
                  )}
                  {(selectedActivityRun.retryCount ?? 0) > 0 && (
                    <div className="mt-1 text-[#818cf8]">
                      retry: {selectedActivityRun.retryCount}/
                      {selectedActivityRun.maxRetries ?? 3}
                    </div>
                  )}
                  {selectedActivityRun.model && (
                    <div className="mt-1 text-[#6e7681]">
                      model: {selectedActivityRun.provider}/
                      {selectedActivityRun.model}
                    </div>
                  )}
                </div>

                <div className="overflow-hidden rounded-[22px] border border-white/8 bg-[#0b0f15]">
                  <div className="flex items-center justify-between border-b border-white/8 px-3 py-2 text-[11px] text-[#8b949e]">
                    <span>Output</span>
                    {selectedActivityRun.status === "running" && (
                      <span className="inline-flex items-center gap-1.5 text-[#8fd8ff]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8] command-deck-signal" />
                        streaming live
                      </span>
                    )}
                  </div>
                  <div className="min-h-[280px] max-h-[420px] overflow-auto space-y-3 p-3 font-mono text-[12px]">
                    {selectedActivityRun.stdout && (
                      <pre className="whitespace-pre-wrap text-[#c9d1d9]">
                        {selectedActivityRun.stdout}
                      </pre>
                    )}
                    {selectedActivityRun.stderr && (
                      <pre className="whitespace-pre-wrap text-[#fca5a5]">
                        {selectedActivityRun.stderr}
                      </pre>
                    )}
                    {!selectedActivityRun.stdout &&
                      !selectedActivityRun.stderr && (
                        <div className="text-[#6e7681]">
                          {selectedActivityRun.status === "running"
                            ? "Waiting for terminal output..."
                            : "No output captured for this run."}
                        </div>
                      )}
                    {selectedActivityRun.error && (
                      <div className="whitespace-pre-wrap text-[#f87171]">
                        {selectedActivityRun.error}
                      </div>
                    )}
                  </div>
                </div>

                {selectedActivityRun.artifacts &&
                  selectedActivityRun.artifacts.length > 0 && (
                    <div className="overflow-hidden rounded-[22px] border border-white/8 bg-[#0b0f15]">
                      <div className="border-b border-white/8 px-3 py-2 text-[11px] text-[#8b949e]">
                        Artifacts
                      </div>
                      <div className="divide-y divide-white/6">
                        {selectedActivityRun.artifacts.map(
                          (artifact) => {
                            const viewUrl = artifact.path
                              ? getRuntimeFileViewUrl(artifact.path)
                              : artifact.url || "";
                            return (
                              <div
                                key={`${artifact.name}-${artifact.path || artifact.url || "artifact"}`}
                                className="flex items-center justify-between gap-3 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-[12px] text-[#e2e8f0]">
                                    {artifact.name}
                                  </p>
                                  <p className="truncate text-[10px] text-[#6e7681]">
                                    {artifact.path ||
                                      artifact.url ||
                                      artifact.type}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {artifact.path &&
                                  /\.pdf$/i.test(artifact.path) ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedFilePreviewPath(
                                          artifact.path || null,
                                        );
                                        setActivityDrawerTab("files");
                                      }}
                                      className="h-7 rounded-lg px-2.5 text-[11px]"
                                    >
                                      View
                                    </Button>
                                  ) : null}
                                  {viewUrl ? (
                                    <a
                                      href={viewUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex h-7 items-center rounded-lg border border-white/8 px-2.5 text-[11px] text-[#79c0ff] transition-colors hover:bg-white/[0.04]"
                                    >
                                      Open
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              <div className="px-4 py-12 text-[13px] text-[#6e7681]">
                Select a run to inspect it here.
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,36,0.9),rgba(10,15,23,0.92))] shadow-[0_24px_60px_rgba(2,6,23,0.18)] overflow-hidden">
            <div className="border-b border-white/8 px-4 py-4">
              <p className="text-sm font-semibold text-[#eef6fb]">
                Focus Agent
              </p>
              <p className="mt-1 text-[12px] text-[#8b9bae]">
                The agent most relevant to the selected run and its
                current operating state.
              </p>
            </div>
            {activityFocusAgent ? (
              <div className="space-y-4 p-4">
                <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,25,37,0.84),rgba(11,17,26,0.84))] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className="command-deck-orb relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-white/10 text-[20px] shadow-[0_20px_42px_rgba(2,6,23,0.28)]"
                        style={{
                          backgroundColor:
                            activityFocusAgent.accent || "#3b82f6",
                        }}
                      >
                        {activityFocusAgent.emoji || "\uD83E\uDD16"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[15px] font-semibold text-[#eef6fb]">
                            {activityFocusAgent.name}
                          </p>
                          <Badge
                            variant={
                              statusMeta[activityFocusAgent.status]
                                .badgeVariant
                            }
                            className={cn(
                              "capitalize",
                              activityFocusPresence?.tone ===
                                "running" && "nebula-chip-live",
                            )}
                          >
                            {statusMeta[activityFocusAgent.status]
                              .label || activityFocusAgent.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[12px] text-[#8ea0b5]">
                          {activityFocusAgent.provider} &middot;{" "}
                          {activityFocusAgent.model} &middot;{" "}
                          {activityFocusAgent.role}
                        </p>
                        <p className="mt-2 text-[12px] leading-relaxed text-[#c5d2de]">
                          {activityFocusPresence?.headline ||
                            activityFocusAgent.objective}
                        </p>
                      </div>
                    </div>
                    <div className="hidden rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-right sm:block">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#62758a]">
                        Timeline
                      </p>
                      <p className="mt-1 text-[12px] text-[#dce7f2]">
                        {activityFocusPresence?.timeline ||
                          "Standing by"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#62758a]">
                        Runs
                      </p>
                      <p className="mt-1 text-[16px] font-semibold text-[#eef6fb]">
                        {activityFocusRuns.length}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#62758a]">
                        Live Steps
                      </p>
                      <p className="mt-1 text-[16px] font-semibold text-[#8fd8ff]">
                        {activityFocusPresence?.stepLabels.length || 0}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#62758a]">
                        Tool Groups
                      </p>
                      <p className="mt-1 text-[16px] font-semibold text-[#eef6fb]">
                        {activityFocusCapabilityGroups.length}
                      </p>
                    </div>
                  </div>
                </div>

                {activityFocusPresence?.stepLabels.length ? (
                  <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#62758a]">
                      Current Signals
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activityFocusPresence.stepLabels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-2 rounded-full border border-[#38bdf8]/18 bg-[#38bdf8]/8 px-3 py-1 text-[11px] text-[#a5e9ff]"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8] command-deck-signal" />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#62758a]">
                    Enabled Surfaces
                  </p>
                  {activityFocusCapabilityGroups.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activityFocusCapabilityGroups.map((group) => (
                        <span
                          key={group.category}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0d1117] px-3 py-1 text-[11px] text-[#d7e4ef]"
                        >
                          <span>{group.label}</span>
                          <span className="text-[#688196]">
                            {group.tools.length}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-[12px] text-[#6e7681]">
                      This agent does not have runtime tool groups
                      enabled yet.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-4 py-12 text-[13px] text-[#6e7681]">
                Select a run or agent to see a focused status panel.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
