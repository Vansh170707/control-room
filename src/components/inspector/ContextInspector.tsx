import { Activity, Bot, Brain, ChevronRight, Cpu, Orbit, Sparkles, Workflow, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatRelativeTime } from "@/lib/utils";
import { buildAgentCapabilityRegistry, formatRouterIntentLabel } from "@/lib/router";
import type { ThreadRouteTurn } from "@/store/useRouterStore";
import type { RouterDecision } from "@/lib/router/types";
import type { CriticResult } from "@/lib/phase2";
import type {
  MemorySnapshot,
  ReasoningSnapshot,
} from "@/store/useReasoningStore";

interface AgentLike {
  id: string;
  name: string;
  emoji: string;
  role: string;
  provider: string;
  model: string;
  objective: string;
  systemPrompt: string;
  specialties: string[];
  skills: string[];
  sandboxMode: string;
  permissions: {
    terminal: boolean;
    browser: boolean;
    files: boolean;
    git: boolean;
    delegation: boolean;
  };
  source: string;
}

interface ChannelLike {
  id: string;
  title: string;
  objective: string;
}

interface RuntimeHealthLike {
  ok: boolean;
  providers?: {
    browserUse?: boolean;
    githubModels?: boolean;
  };
  error?: string;
}

interface LiveActivityLike {
  id: string;
  label: string;
  detail: string;
  status: "running" | "completed" | "failed" | "idle";
  timestamp: string;
}

interface ToolResultLike {
  ok: boolean;
  tool: string;
  error?: string;
}

interface ContextInspectorProps {
  allAgents: AgentLike[];
  selectedAgent?: AgentLike;
  selectedChannel?: ChannelLike | null;
  latestThreadTurn?: ThreadRouteTurn | null;
  latestChannelDecision?: RouterDecision | null;
  latestThought?: ReasoningSnapshot | null;
  latestCritic?: CriticResult | null;
  latestMemory?: MemorySnapshot | null;
  runtimeHealth: RuntimeHealthLike;
  currentLiveActivities: LiveActivityLike[];
  currentAgentRunsCount: number;
  toolInvocationResults: ToolResultLike[];
  onToggle?: () => void;
}

function SectionTitle({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Bot;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[#8fa1b3]">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#e6edf3]">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#6e7f93]">{detail}</p>
      </div>
    </div>
  );
}

export function ContextInspector({
  allAgents,
  selectedAgent,
  selectedChannel,
  latestThreadTurn,
  latestChannelDecision,
  latestThought,
  latestCritic,
  latestMemory,
  runtimeHealth,
  currentLiveActivities,
  currentAgentRunsCount,
  toolInvocationResults,
  onToggle,
}: ContextInspectorProps) {
  const activeDecision = selectedChannel ? latestChannelDecision : latestThreadTurn?.decision;
  const capabilityRegistry = buildAgentCapabilityRegistry(allAgents);
  const leadAgent = activeDecision
    ? allAgents.find((agent) => agent.id === activeDecision.leadAgentId)
    : null;
  const matchedProfiles = activeDecision
    ? activeDecision.trace.scoredAgents
        .slice(0, 4)
        .map((entry) => ({
          entry,
          agent: allAgents.find((agent) => agent.id === entry.agentId),
        }))
        .filter((item) => item.agent)
    : [];
  const selectedProfile = selectedAgent
    ? capabilityRegistry.find((profile) => profile.agentId === selectedAgent.id)
    : null;

  return (
    <aside className="hidden w-[340px] shrink-0 border-l border-white/8 bg-[linear-gradient(180deg,rgba(11,17,25,0.96),rgba(10,16,23,0.92))] xl:flex xl:flex-col">
      <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(18,26,37,0.9),rgba(12,18,27,0.82))] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Orbit className="h-4 w-4 text-[#8fa1b3]" />
            <span className="text-[13px] font-semibold text-[#e6edf3]">
              Context Inspector
            </span>
          </div>
          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#8fa1b3] transition-colors hover:border-white/16 hover:bg-white/[0.08] hover:text-[#e6edf3]"
              aria-label="Close context inspector"
              title="Close inspector"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-[#6e7f93]">
          Router state, matched capabilities, and live runtime signal for the current workspace lane.
        </p>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-4 pb-6">
          <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(18,26,37,0.88),rgba(12,18,27,0.82))] p-4">
            <SectionTitle
              icon={Sparkles}
              title="Routing Overview"
              detail={
                activeDecision
                  ? selectedChannel
                    ? `Inspecting the route that opened ${selectedChannel.title}.`
                    : "Latest routed turn in the selected thread."
                  : "Send a request to populate the router decision for this lane."
              }
            />
            {activeDecision ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="cyan">
                    {formatRouterIntentLabel(activeDecision.intent)}
                  </Badge>
                  <Badge
                    variant={
                      activeDecision.lane === "channel" ? "amber" : "emerald"
                    }
                  >
                    {activeDecision.lane}
                  </Badge>
                  {latestThreadTurn ? (
                    <span className="text-[11px] text-[#4f6880]">
                      {formatRelativeTime(latestThreadTurn.createdAt)}
                    </span>
                  ) : null}
                </div>
                <p className="text-[13px] leading-relaxed text-[#c9d1d9]">
                  {activeDecision.reason}
                </p>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                    Prompt Expansion
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#c9d1d9]">
                    {activeDecision.promptExpansion.routingSummary}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#8fa1b3]">
                    {activeDecision.promptExpansion.leadInstruction}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                    Lead
                  </span>
                  {leadAgent ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[12px] text-[#c9d1d9]">
                      <span>{leadAgent.emoji}</span>
                      <span>{leadAgent.name}</span>
                    </span>
                  ) : null}
                  {activeDecision.collaboratorAgentIds.map((agentId) => {
                    const collaborator = allAgents.find((agent) => agent.id === agentId);
                    return collaborator ? (
                      <span
                        key={`collab-${agentId}`}
                        className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[12px] text-[#8fa1b3]"
                      >
                        <Workflow className="h-3.5 w-3.5" />
                        {collaborator.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(18,26,37,0.88),rgba(12,18,27,0.82))] p-4">
            <SectionTitle
              icon={Cpu}
              title="Matched Capabilities"
              detail={
                activeDecision
                  ? "Top router matches with scoring reasons."
                  : selectedAgent
                    ? `Capability registry entry for ${selectedAgent.name}.`
                    : "Select an agent or send a request to inspect capability matching."
              }
            />
            <div className="mt-4 space-y-3">
              {matchedProfiles.length > 0
                ? matchedProfiles.map(({ entry, agent }) => (
                    <div
                      key={`match-${entry.agentId}`}
                      className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-[#e6edf3]">
                            {agent?.emoji} {agent?.name}
                          </p>
                          <p className="mt-1 text-[11px] text-[#6e7f93]">
                            {agent?.role}
                          </p>
                        </div>
                        <Badge variant="muted">{entry.score}</Badge>
                      </div>
                      {entry.reasons.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.reasons.map((reason) => (
                            <span
                              key={`${entry.agentId}-${reason}`}
                              className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] text-[#8fa1b3]"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                : selectedProfile ? (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-[#e6edf3]">
                            {selectedAgent?.emoji} {selectedAgent?.name}
                          </p>
                          <p className="mt-1 text-[11px] text-[#6e7f93]">
                            {selectedAgent?.role}
                          </p>
                        </div>
                        <Badge variant="muted">{selectedAgent?.sandboxMode}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedProfile.capabilityTags.slice(0, 12).map((tag) => (
                          <span
                            key={`cap-${tag}`}
                            className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] text-[#8fa1b3]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-[12px] text-[#6e7f93]">
                      No routing match data yet.
                    </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(18,26,37,0.88),rgba(12,18,27,0.82))] p-4">
            <SectionTitle
              icon={Brain}
              title="Reasoning State"
              detail={
                selectedAgent
                  ? `Latest thought and memory hydration for ${selectedAgent.name}.`
                  : "Select an agent to inspect lightweight reasoning context."
              }
            />
            <div className="mt-4 space-y-3">
              {latestThought || latestMemory ? (
                <>
                  {latestThought ? (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                          Latest Thought
                        </p>
                        <span className="text-[10px] text-[#4f6880]">
                          {formatRelativeTime(latestThought.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-[#c9d1d9]">
                        {latestThought.thought}
                      </p>
                      {latestThought.command ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-[#8fa1b3]">
                          Command: {latestThought.command}
                        </p>
                      ) : null}
                      {latestThought.observation ? (
                        <p className="mt-1 text-[11px] leading-relaxed text-[#8fa1b3]">
                          Observation: {latestThought.observation}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {latestMemory ? (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                          Memory Context
                        </p>
                        <span className="text-[10px] text-[#4f6880]">
                          {formatRelativeTime(latestMemory.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-[#c9d1d9]">
                        {latestMemory.summary || "Thread memory is loaded, but no summary has been generated yet."}
                      </p>
                      {latestMemory.notes.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {latestMemory.notes.slice(0, 4).map((note) => (
                            <span
                              key={`memory-note-${note}`}
                              className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] text-[#8fa1b3]"
                            >
                              Note: {note}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {latestMemory.knowledge.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {latestMemory.knowledge.slice(0, 4).map((entry) => (
                            <span
                              key={`memory-knowledge-${entry}`}
                              className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] text-[#8fa1b3]"
                            >
                              Knowledge: {entry}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-[12px] text-[#6e7f93]">
                  Thought plans and memory hydration will appear here after the selected agent handles a routed turn.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(18,26,37,0.88),rgba(12,18,27,0.82))] p-4">
            <SectionTitle
              icon={Bot}
              title="Runtime Status"
              detail="Live tool and execution signal for the current workspace lane."
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                  Runtime
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      runtimeHealth.ok ? "bg-[#34d399]" : "bg-[#f59e0b]",
                    )}
                  />
                  <span className="text-[13px] text-[#e6edf3]">
                    {runtimeHealth.ok ? "Connected" : "Offline"}
                  </span>
                </div>
                {runtimeHealth.error ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-[#f5b4b4]">
                    {runtimeHealth.error}
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                  Browser Lane
                </p>
                <p className="mt-2 text-[13px] text-[#e6edf3]">
                  {runtimeHealth.providers?.browserUse ? "Ready" : "Unavailable"}
                </p>
                <p className="mt-1 text-[11px] text-[#6e7f93]">
                  GitHub Models {runtimeHealth.providers?.githubModels ? "ready" : "idle"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                  Runs
                </p>
                <p className="mt-2 text-[20px] font-semibold text-[#e6edf3]">
                  {currentAgentRunsCount}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                  Tool Calls
                </p>
                <p className="mt-2 text-[20px] font-semibold text-[#e6edf3]">
                  {toolInvocationResults.length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(18,26,37,0.88),rgba(12,18,27,0.82))] p-4">
            <SectionTitle
              icon={Activity}
              title="Live Activity"
              detail="Recent agent actions visible to the current lane."
            />
            <div className="mt-4 space-y-3">
              {currentLiveActivities.length > 0 ? (
                currentLiveActivities.slice(0, 6).map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[12px] font-medium text-[#e6edf3]">
                          {entry.label}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-[#6e7f93]">
                          {entry.detail}
                        </p>
                      </div>
                      <Badge
                        variant={
                          entry.status === "completed"
                            ? "emerald"
                            : entry.status === "failed"
                              ? "danger"
                              : entry.status === "running"
                                ? "cyan"
                                : "muted"
                        }
                      >
                        {entry.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[#4f6880]">
                      {formatRelativeTime(entry.timestamp)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-[12px] text-[#6e7f93]">
                  Activity will appear here as soon as the current lane starts working.
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
