import React from "react";
import { MessageCircle, Orbit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  selectedAgent?: SelectedAgentLike;
  attachmentLibrary: Record<string, AttachmentLike | undefined>;
  agentPresenceById: Record<string, PresenceInfo | undefined>;
  renderMessageHtml: (content: string) => string;
  presenceDotClasses: (tone: PresenceInfo["tone"]) => string;
  presenceTextClasses: (tone: PresenceInfo["tone"]) => string;
  onViewActivity: () => void;
  onRunCodeBlock?: (input: { code: string; language: string }) => void;
  showThinkingIndicator?: boolean;
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
    if (message.sender === "Runtime" || message.sender === "Sandbox") {
      return null;
    }

    return (
      <div key={message.id} className="ml-11 text-[13px] text-[#8f7b66]">
        <span className="italic">{message.content}</span>
      </div>
    );
  }

  return (
    <div key={message.id} className="flex max-w-[860px] gap-3">
      <div
        className={cn(
          "mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border text-[11px] font-semibold shadow-[0_8px_18px_rgba(120,71,35,0.10)]",
          isAssistant
            ? "border-[#d6b99f] bg-[linear-gradient(180deg,#d97745,#b65b31)] text-white"
            : "border-[#dccfbe] bg-[#fffaf2] text-[#8f7b66]",
        )}
      >
        <div className="relative flex h-full w-full items-center justify-center">
          {isAssistant ? selectedAgent?.emoji || "🤖" : "v"}
          {isAssistant && presence ? (
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#f4eee2]",
                presenceDotClasses(presence.tone),
              )}
            />
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-semibold tracking-tight text-[#2f261f]">
            {message.sender}
          </span>
          {isAssistant && selectedAgent ? (
            <span className="text-[11px] text-[#8f7b66]">
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
            "text-[15px] leading-7 shadow-none",
            isAssistant ? "" : "whitespace-pre-wrap",
            isAssistant
              ? "px-0 py-1 text-[#352b23]"
              : "px-0 py-1 text-[#4c4035]",
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
                  className="chat-message-markdown min-w-0 break-words"
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
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e0d2c0] bg-[#fffaf2] px-2.5 py-1 text-[11px] text-[#7d6b5a]">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      presenceDotClasses(presence.tone),
                    )}
                  />
                  {presence.timeline}
                </span>
                {presence.stepLabels.map((label, labelIndex) => (
                  <span
                    key={`${message.id}-${label}-${labelIndex}`}
                    className="inline-flex items-center rounded-full border border-[#e0d2c0] bg-[#fffaf2] px-2.5 py-1 text-[10px] text-[#7d6b5a]"
                  >
                    {label}
                  </span>
                ))}
              </>
            ) : null}
            <button
              type="button"
              onClick={onViewActivity}
              className="text-[11px] text-[#9a5f36] transition-colors hover:text-[#6f3b21]"
            >
              view activity
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function renderThinkingIndicator(selectedAgent?: SelectedAgentLike) {
  if (!selectedAgent) {
    return null;
  }

  return (
    <div className="flex max-w-[860px] gap-3">
      <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-[#d6b99f] bg-[linear-gradient(180deg,#d97745,#b65b31)] text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(120,71,35,0.10)]">
        {selectedAgent.emoji || "✦"}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[14px] font-semibold tracking-tight text-[#2f261f]">
            {selectedAgent.name}
          </span>
          <span className="text-[11px] text-[#8f7b66]">
            thinking
          </span>
        </div>
        <div className="claude-thinking-row inline-flex items-center gap-3 rounded-2xl border border-[#e0d2c0] bg-[#fffaf2]/88 px-3.5 py-2.5 font-serif shadow-[0_10px_24px_rgba(120,71,35,0.08)]">
          <span className="claude-thinking-shimmer" />
          <span className="flex items-center gap-1.5" aria-hidden="true">
            <span className="claude-thinking-dot" />
            <span className="claude-thinking-dot" />
            <span className="claude-thinking-dot" />
          </span>
          <span className="text-[13px] text-[#7d6b5a]">
            Working through it
          </span>
        </div>
      </div>
    </div>
  );
}

export function ThreadTurns({
  messages,
  selectedAgent,
  attachmentLibrary,
  agentPresenceById,
  renderMessageHtml,
  presenceDotClasses,
  presenceTextClasses,
  onViewActivity,
  onRunCodeBlock,
  showThinkingIndicator = false,
}: ThreadTurnsProps) {
  const userIndexes = messages.reduce<number[]>((indexes, message, index) => {
    if (message.role === "user") {
      indexes.push(index);
    }
    return indexes;
  }, []);

  const preludeMessages =
    userIndexes.length > 0 ? messages.slice(0, userIndexes[0]) : messages;

  const turns = userIndexes.map((userIndex, turnIndex) => {
    const nextUserIndex = userIndexes[turnIndex + 1] ?? messages.length;
    const slice = messages.slice(userIndex, nextUserIndex);
    return {
      id: slice[0]?.id || `turn-${turnIndex}`,
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
      {turns.map(({ id, slice }, turnIndex) => (
        <div
          key={id}
          className={cn(
            "space-y-4",
            turnIndex > 0 ? "border-t border-[#e3d7c8] pt-6" : "",
          )}
        >
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
      {showThinkingIndicator ? renderThinkingIndicator(selectedAgent) : null}
    </>
  );
}
