import React from "react";
import { MessageCircle, Orbit, Share2, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";
import { formatRouterIntentLabel } from "@/lib/router";
import type { ThreadRouteTurn } from "@/store/useRouterStore";
import { ThoughtBubble, splitThoughtFromContent } from "@/components/chat/ThoughtBubble";

interface ThreadMessage {
  id: string;
  agentId: string;
  role: "user" | "assistant" | "system";
  sender: string;
  content: string;
  timestamp: string;
  attachmentIds?: string[];
}

interface AttachmentLike {
  id: string;
  name: string;
  kind: "image" | "text" | "document";
  previewUrl?: string;
  warning?: string;
}

interface PresenceInfo {
  tone: "running" | "review" | "error" | "idle";
  timeline: string;
  stepLabels: string[];
}

interface SelectedAgentLike {
  id: string;
  name: string;
  emoji: string;
  provider: string;
  model: string;
}

interface ThreadTurnsProps {
  messages: ThreadMessage[];
  routeTurns: ThreadRouteTurn[];
  selectedAgent?: SelectedAgentLike;
  attachmentLibrary: Record<string, AttachmentLike | undefined>;
  agentPresenceById: Record<string, PresenceInfo | undefined>;
  renderMessageHtml: (content: string) => string;
  presenceDotClasses: (tone: PresenceInfo["tone"]) => string;
  presenceTextClasses: (tone: PresenceInfo["tone"]) => string;
  onViewActivity: () => void;
  onOpenChannel: (channelId: string) => void;
  onRunCodeBlock?: (input: { code: string; language: string }) => void;
}

function extractRunnableCodeBlock(raw: string) {
  const matches = [...raw.matchAll(/```([a-z0-9_-]+)?\n([\s\S]*?)```/gi)];
  const match = matches[matches.length - 1];
  if (!match?.[2]) {
    return null;
  }

  return {
    language: (match[1] || "bash").toLowerCase(),
    code: match[2].trim(),
  };
}

function renderAttachment(attachment: AttachmentLike) {
  return (
    <div
      key={attachment.id}
      className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]"
    >
      {attachment.kind === "image" && attachment.previewUrl ? (
        <div className="w-[180px]">
          <img
            src={attachment.previewUrl}
            alt={attachment.name}
            className="h-[120px] w-full object-cover"
          />
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[#a8bacb]">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
              <Orbit className="h-3 w-3" />
            </span>
            <span className="truncate">{attachment.name}</span>
          </div>
        </div>
      ) : (
        <div className="flex max-w-[280px] items-start gap-2 px-3 py-2.5 text-left text-[11px] text-[#a8bacb]">
          <MessageCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-medium text-[#c9d1d9]">{attachment.name}</p>
            <p className="mt-1 line-clamp-2 text-[#6e7f93]">
              {attachment.kind === "text"
                ? "Text extracted into agent context."
                : attachment.warning || "Attached to the conversation."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function renderThreadMessage(args: {
  message: ThreadMessage;
  isAssistant: boolean;
  selectedAgent?: SelectedAgentLike;
  presence?: PresenceInfo;
  attachmentLibrary: Record<string, AttachmentLike | undefined>;
  renderMessageHtml: (content: string) => string;
  presenceDotClasses: (tone: PresenceInfo["tone"]) => string;
  presenceTextClasses: (tone: PresenceInfo["tone"]) => string;
  onViewActivity: () => void;
  onRunCodeBlock?: (input: { code: string; language: string }) => void;
}) {
  const {
    message,
    isAssistant,
    selectedAgent,
    presence,
    attachmentLibrary,
    renderMessageHtml,
    presenceDotClasses,
    presenceTextClasses,
    onViewActivity,
    onRunCodeBlock,
  } = args;

  if (message.role === "system") {
    if (message.sender === "Sandbox") {
      return null;
    }

    return (
      <div key={message.id} className="ml-11 text-[13px] text-[#6e7f93]">
        <span className="italic">{message.content}</span>
      </div>
    );
  }

  return (
    <div key={message.id} className="flex max-w-[820px] gap-3">
      <div
        className={cn(
          "mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border text-[11px] font-semibold",
          isAssistant
            ? "border-[#3b82f6]/24 bg-[linear-gradient(180deg,rgba(37,99,235,0.9),rgba(29,78,216,0.72))] text-white"
            : "border-white/8 bg-[#1a2030] text-[#8fa1b3]",
        )}
      >
        <div className="relative flex h-full w-full items-center justify-center">
          {isAssistant ? selectedAgent?.emoji || "🤖" : "v"}
          {isAssistant && presence ? (
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#0f1724]",
                presenceDotClasses(presence.tone),
              )}
            />
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-medium tracking-tight text-[#e6edf3]">
            {message.sender}
          </span>
          {isAssistant && selectedAgent ? (
            <span className="text-[11px] text-[#4f6880]">
              {selectedAgent.provider} · {selectedAgent.model}
            </span>
          ) : null}
          {isAssistant && presence ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px]",
                presenceTextClasses(presence.tone),
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  presenceDotClasses(presence.tone),
                )}
              />
              {presence.tone === "running"
                ? "working"
                : presence.tone === "review"
                  ? "ready"
                  : presence.tone === "error"
                    ? "attention"
                    : "idle"}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "rounded-[22px] border px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap shadow-none",
            isAssistant
              ? "border-white/6 bg-[linear-gradient(180deg,rgba(17,25,37,0.9),rgba(11,17,26,0.84))] text-[#d7e1ea]"
              : "border-[#2c3a4c] bg-[linear-gradient(180deg,rgba(12,19,30,0.88),rgba(10,15,23,0.82))] text-[#c2ceda]",
          )}
        >
          {isAssistant ? (() => {
            const { thought, body } = splitThoughtFromContent(message.content);
            const runnableCodeBlock = extractRunnableCodeBlock(
              body || message.content,
            );
            return (
              <>
                {thought ? <ThoughtBubble thought={thought} /> : null}
                <div
                  className="min-w-0 break-words [&_a]:text-[#8fd3ff] [&_a]:underline [&_code]:rounded-md [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.95em] [&_em]:text-[#dbe7f2] [&_h1]:mt-1 [&_h1]:text-[1.35rem] [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-[1.15rem] [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-[1.02rem] [&_h3]:font-semibold [&_li]:mt-1.5 [&_ol]:my-4 [&_ol]:pl-6 [&_p]:my-0 [&_p+_p]:mt-4 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-white/8 [&_pre]:bg-[#0b0f14] [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
                  dangerouslySetInnerHTML={{ __html: renderMessageHtml(body || message.content) }}
                />
                {runnableCodeBlock && onRunCodeBlock ? (
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onRunCodeBlock(runnableCodeBlock)}
                      className="h-7 px-2.5 text-[11px]"
                    >
                      Run In Sandbox
                    </Button>
                  </div>
                ) : null}
              </>
            );
          })() : (
            message.content
          )}
        </div>
        {!!message.attachmentIds?.length ? (
          <div className="mt-3 flex flex-wrap gap-3">
            {message.attachmentIds
              .map((attachmentId) => attachmentLibrary[attachmentId])
              .filter(Boolean)
              .map((attachment) => renderAttachment(attachment as AttachmentLike))}
          </div>
        ) : null}
        {isAssistant ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {presence ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[#8fa1b3]">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      presenceDotClasses(presence.tone),
                    )}
                  />
                  {presence.timeline}
                </span>
                {presence.stepLabels.map((label) => (
                  <span
                    key={`${message.id}-${label}`}
                    className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] text-[#a6b8c8]"
                  >
                    {label}
                  </span>
                ))}
              </>
            ) : null}
            <button
              type="button"
              onClick={onViewActivity}
              className="text-[11px] text-[#4f6880] transition-colors hover:text-[#b9c7d6]"
            >
              view activity
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RouteDecisionCard({
  turn,
  onOpenChannel,
}: {
  turn: ThreadRouteTurn;
  onOpenChannel: (channelId: string) => void;
}) {
  return (
    <div className="rounded-[22px] border border-[#38bdf8]/14 bg-[linear-gradient(180deg,rgba(10,22,33,0.96),rgba(9,18,28,0.88))] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="cyan">Router</Badge>
        <Badge variant={turn.decision.lane === "channel" ? "amber" : "emerald"}>
          {turn.decision.lane}
        </Badge>
        <Badge variant="muted">
          {formatRouterIntentLabel(turn.decision.intent)}
        </Badge>
        <span className="text-[11px] text-[#4f6880]">
          {formatRelativeTime(turn.createdAt)}
        </span>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-[#e6edf3]">
        {turn.decision.reason}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#8fa1b3]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">
          <Workflow className="h-3.5 w-3.5" />
          lead {turn.decision.leadAgentId}
        </span>
        {turn.decision.collaboratorAgentIds.map((agentId) => (
          <span
            key={`${turn.id}-${agentId}`}
            className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1"
          >
            @{agentId}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[#6e7f93]">
        {turn.decision.promptExpansion.routingSummary}
      </p>
      {turn.openedChannelId ? (
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChannel(turn.openedChannelId as string)}
          >
            <Share2 className="h-3.5 w-3.5" />
            Open {turn.openedChannelId}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ThreadTurns({
  messages,
  routeTurns,
  selectedAgent,
  attachmentLibrary,
  agentPresenceById,
  renderMessageHtml,
  presenceDotClasses,
  presenceTextClasses,
  onViewActivity,
  onOpenChannel,
  onRunCodeBlock,
}: ThreadTurnsProps) {
  const userIndexes = messages.reduce<number[]>((indexes, message, index) => {
    if (message.role === "user") {
      indexes.push(index);
    }
    return indexes;
  }, []);

  const routeTurnByUserId = new Map(
    routeTurns.map((turn) => [turn.userMessageId, turn]),
  );

  const preludeMessages =
    userIndexes.length > 0 ? messages.slice(0, userIndexes[0]) : messages;

  const turns = userIndexes.map((userIndex, turnIndex) => {
    const nextUserIndex = userIndexes[turnIndex + 1] ?? messages.length;
    const slice = messages.slice(userIndex, nextUserIndex);
    return {
      id: slice[0]?.id || `turn-${turnIndex}`,
      turnNumber: turnIndex + 1,
      routeTurn: routeTurnByUserId.get(slice[0]?.id || ""),
      slice,
    };
  });

  return (
    <>
      {preludeMessages.map((message) =>
        renderThreadMessage({
          message,
          isAssistant: message.role === "assistant",
          selectedAgent,
          presence: agentPresenceById[message.agentId],
          attachmentLibrary,
          renderMessageHtml,
          presenceDotClasses,
          presenceTextClasses,
          onViewActivity,
          onRunCodeBlock,
        }),
      )}
      {turns.map(({ id, turnNumber, routeTurn, slice }) => (
        <div
          key={id}
          className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,18,28,0.62),rgba(10,15,23,0.5))] p-4 shadow-[0_12px_36px_rgba(2,6,23,0.12)]"
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="muted">Turn {turnNumber}</Badge>
            {routeTurn ? (
              <>
                <Badge variant="cyan">
                  {formatRouterIntentLabel(routeTurn.decision.intent)}
                </Badge>
                <Badge
                  variant={
                    routeTurn.decision.lane === "channel" ? "amber" : "emerald"
                  }
                >
                  {routeTurn.decision.lane}
                </Badge>
              </>
            ) : null}
          </div>
          <div className="space-y-4">
            {slice[0]
              ? renderThreadMessage({
                  message: slice[0],
                  isAssistant: false,
                  selectedAgent,
                  presence: agentPresenceById[slice[0].agentId],
                  attachmentLibrary,
                  renderMessageHtml,
                  presenceDotClasses,
                  presenceTextClasses,
                  onViewActivity,
                  onRunCodeBlock,
                })
              : null}
            {routeTurn ? (
              <RouteDecisionCard turn={routeTurn} onOpenChannel={onOpenChannel} />
            ) : null}
            {slice.slice(1).map((message) =>
              renderThreadMessage({
                message,
                isAssistant: message.role === "assistant",
                selectedAgent,
                presence: agentPresenceById[message.agentId],
                attachmentLibrary,
                renderMessageHtml,
                presenceDotClasses,
                presenceTextClasses,
                onViewActivity,
                onRunCodeBlock,
              }),
            )}
          </div>
        </div>
      ))}
    </>
  );
}
