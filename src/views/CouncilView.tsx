import { Send } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useChatStore } from "@/store/useChatStore";
import type { WorkspaceAgent, CouncilSession } from "@/types";

interface CouncilIdentity {
  name: string;
  emoji: string;
  role: string;
}

interface CouncilViewProps {
  councilSessions: CouncilSession[];
  selectedCouncilSession: CouncilSession | undefined;
  selectedCouncilSessionId: string;
  setSelectedCouncilSessionId: (id: string) => void;
  isStartingCouncil: boolean;
  isSendingCouncilMessage: boolean;
  councilError: string | null;
  backendError: string | null;
  allAgents: WorkspaceAgent[];
  handleStartCouncilSession: () => Promise<void>;
  handleSendCouncilReply: () => Promise<void>;
}

export function CouncilView({
  councilSessions,
  selectedCouncilSession,
  selectedCouncilSessionId,
  setSelectedCouncilSessionId,
  isStartingCouncil,
  isSendingCouncilMessage,
  councilError,
  backendError,
  allAgents,
  handleStartCouncilSession,
  handleSendCouncilReply,
}: CouncilViewProps) {
  const councilDraft = useChatStore((s) => s.councilDraft);
  const setCouncilDraft = useChatStore((s) => s.setCouncilDraft);
  const councilReplyDraft = useChatStore((s) => s.councilReplyDraft);
  const setCouncilReplyDraft = useChatStore((s) => s.setCouncilReplyDraft);

  const councilIdentityById = useMemo(
    () => ({
      human: {
        name: "You",
        emoji: "🙂",
        role: "Human Operator",
      },
      main: {
        name: "Main",
        emoji: "🧭",
        role: "Lead Strategist",
      },
      pi2work: {
        name: "Pi2Work",
        emoji: "🛠️",
        role: "Engineering Specialist",
      },
      reacher: {
        name: "Reacher",
        emoji: "🔎",
        role: "Research Analyst",
      },
    }),
    [],
  );

  function resolveCouncilIdentity(agentId: string): CouncilIdentity {
    if (agentId === "human") {
      return councilIdentityById.human;
    }

    const knownAgent = allAgents.find((agent) => agent.id === agentId);
    if (knownAgent) {
      return {
        name: knownAgent.name,
        emoji: knownAgent.emoji,
        role: knownAgent.role,
      };
    }

    return (
      councilIdentityById[agentId as keyof typeof councilIdentityById] ?? {
        name: agentId,
        emoji: "🤖",
        role: "Council Member",
      }
    );
  }

  return (
    <div className="mt-2 grid min-h-[760px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-[720px] flex-col overflow-hidden rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(11,18,28,0.92),rgba(8,14,23,0.88))] shadow-[0_18px_48px_rgba(2,6,23,0.14)]">
        <div className="border-b border-white/6 bg-[linear-gradient(180deg,rgba(15,23,35,0.9),rgba(11,17,27,0.82))] px-7 py-6">
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#10b981]/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.9),rgba(5,150,105,0.68))] text-[12px] font-semibold text-white">
                  ◌
                </div>
                <div>
                  <p className="text-[26px] font-semibold text-[#f5fbff]">
                    {selectedCouncilSession?.question ||
                      "Council Chamber"}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                    {selectedCouncilSession
                      ? `${selectedCouncilSession.participants.length} agents · ${selectedCouncilSession.messages.length} messages`
                      : "Start a council discussion to collect multiple agent viewpoints"}
                  </p>
                </div>
              </div>
              <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[#8ea0b5]">
                Create a prompt, dispatch it to the council agents,
                and keep the discussion visible as replies arrive.
              </p>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,24,36,0.94),rgba(11,17,26,0.9))] shadow-none">
              <textarea
                value={councilDraft}
                onChange={(event) =>
                  setCouncilDraft(event.target.value)
                }
                placeholder="Ask the council a question..."
                className="min-h-[88px] w-full resize-none bg-transparent px-5 py-4 text-[14px] text-[#edf4f8] placeholder-[#70849a] focus:outline-none"
              />
              <div className="flex items-center justify-between border-t border-white/8 px-4 py-3">
                <span className="text-[11px] text-[#70849a]">
                  This will enqueue one prompt for each council agent.
                </span>
                <button
                  type="button"
                  onClick={() => void handleStartCouncilSession()}
                  disabled={!councilDraft.trim() || isStartingCouncil}
                  className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(180deg,rgba(16,185,129,0.95),rgba(5,150,105,0.85))] px-3.5 py-2 text-[12px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isStartingCouncil
                    ? "Starting..."
                    : "Start Council"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.04),transparent_22%)] px-8 py-8">
          {selectedCouncilSession ? (
            selectedCouncilSession.messages.length > 0 ? (
              <div className="space-y-6">
                {selectedCouncilSession.messages.map((message) => {
                  const identity = resolveCouncilIdentity(
                    message.agentId,
                  );
                  const isHuman = message.agentId === "human";

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex gap-3",
                        isHuman ? "justify-end" : "justify-start",
                      )}
                    >
                      {!isHuman && (
                        <div className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-[#10b981]/18 bg-[linear-gradient(180deg,rgba(16,185,129,0.9),rgba(5,150,105,0.68))] text-[12px] font-semibold text-white">
                          {identity.emoji}
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[820px]",
                          isHuman ? "items-end" : "items-start",
                        )}
                      >
                        <div
                          className={cn(
                            "mb-2 flex flex-wrap items-center gap-2",
                            isHuman ? "justify-end" : "justify-start",
                          )}
                        >
                          <span className="text-[14px] font-medium text-[#edf4f8]">
                            {identity.name}
                          </span>
                          <span className="text-[11px] text-[#70849a]">
                            {identity.role}
                          </span>
                          <span className="text-[11px] text-[#70849a]">
                            #{message.messageNumber}
                          </span>
                          <span className="text-[11px] text-[#70849a]">
                            {formatRelativeTime(message.timestamp)}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "rounded-[24px] border px-5 py-4 text-[14px] leading-7 whitespace-pre-wrap shadow-none",
                            isHuman
                              ? "border-[#2c3a4c] bg-[linear-gradient(180deg,rgba(13,20,31,0.94),rgba(10,15,23,0.9))] text-[#e7eef6]"
                              : "border-white/6 bg-[linear-gradient(180deg,rgba(17,25,37,0.92),rgba(11,17,26,0.86))] text-[#d8e2eb]",
                          )}
                        >
                          {message.content}
                        </div>
                      </div>
                      {isHuman && (
                        <div className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#162334] text-[12px] font-semibold text-[#d7e2eb]">
                          You
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center text-center">
                <div>
                  <p className="text-[24px] font-semibold text-[#edf4f8]">
                    Council created.
                  </p>
                  <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-[#6e7f93]">
                    Agent replies will appear here as their command
                    results are written back into the council feed.
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="flex min-h-[320px] items-center justify-center text-center">
              <div>
                <p className="text-[24px] font-semibold text-[#edf4f8]">
                  No council selected.
                </p>
                <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-[#6e7f93]">
                  Start a new council above or select an existing
                  session from the sidebar.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/6 bg-[linear-gradient(180deg,rgba(13,21,31,0.96),rgba(10,16,24,0.94))] px-7 py-5">
          <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,24,36,0.94),rgba(11,17,26,0.9))] shadow-none">
            <textarea
              value={councilReplyDraft}
              onChange={(event) =>
                setCouncilReplyDraft(event.target.value)
              }
              placeholder="Reply to the council..."
              disabled={!selectedCouncilSession}
              className="min-h-[96px] w-full resize-none bg-transparent px-5 py-4 text-[14px] text-[#edf4f8] placeholder-[#70849a] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="flex items-center justify-between border-t border-white/8 px-4 py-3">
              <span className="text-[11px] text-[#70849a]">
                Your reply is stored in `council_messages` and then
                re-broadcast to the council agents.
              </span>
              <button
                type="button"
                onClick={() => void handleSendCouncilReply()}
                disabled={
                  !selectedCouncilSession ||
                  !councilReplyDraft.trim() ||
                  isSendingCouncilMessage
                }
                className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(180deg,rgba(59,130,246,0.95),rgba(37,99,235,0.85))] px-3.5 py-2 text-[12px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {isSendingCouncilMessage
                  ? "Sending..."
                  : "Send Reply"}
              </button>
            </div>
          </div>
          {(councilError || backendError) && (
            <div className="mt-4 rounded-2xl border border-[#7f1d1d] bg-[#3f191f]/30 px-4 py-3 text-[12px] text-[#f2b2b8]">
              {councilError || backendError}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
        <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(15,23,35,0.9),rgba(10,16,24,0.86))] p-4 shadow-none">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#eef6fb]">
              Participants
            </p>
            <span className="text-[11px] text-[#6e7f93]">
              {selectedCouncilSession?.participants.length ?? 0}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {(selectedCouncilSession?.participants ?? []).map(
              (participant) => {
                const identity = resolveCouncilIdentity(
                  participant.agentId,
                );
                return (
                  <div
                    key={participant.agentId}
                    className="rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium text-[#edf4f8]">
                          {identity.emoji} {identity.name}
                        </p>
                        <p className="mt-1 text-[11px] text-[#6e7f93]">
                          {identity.role}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant={
                            participant.status === "complete"
                              ? "emerald"
                              : participant.status === "speaking"
                                ? "cyan"
                                : "amber"
                          }
                        >
                          {participant.status}
                        </Badge>
                        <span className="text-[10px] text-[#4f6880]">
                          {participant.sent}/{participant.limit}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(15,23,35,0.9),rgba(10,16,24,0.86))] p-4 shadow-none">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#eef6fb]">
              Recent Sessions
            </p>
            <span className="text-[11px] text-[#6e7f93]">
              {councilSessions.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {councilSessions.slice(0, 6).map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() =>
                  setSelectedCouncilSessionId(session.id)
                }
                className={cn(
                  "w-full rounded-2xl border px-3 py-2.5 text-left transition-colors",
                  selectedCouncilSession?.id === session.id
                    ? "border-[#10b981]/30 bg-[#0f1f1b]"
                    : "border-white/8 bg-white/[0.025] hover:bg-white/[0.04]",
                )}
              >
                <p className="line-clamp-2 text-[12px] font-medium text-[#edf4f8]">
                  {session.question}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#4f6880]">
                  {session.messages.length} messages ·{" "}
                  {session.status}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
