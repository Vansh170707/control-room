import type { RefObject } from "react";
import {
  Activity,
  FileText,
  ImageIcon,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  activityBadgeClasses,
  presenceDotClasses,
  presenceTextClasses,
  slugifyLabel,
  insertMentionAtEnd,
  renderMessageHtml,
} from "@/lib/helpers";
import type {
  CollaborationChannel,
  ChannelMessage,
  ComposerAttachment,
  DelegationTask,
  PresenceTone,
  WorkspaceAgent,
} from "@/types";
import type { AppState } from "@/store/useAppStore";
import { delegationMeta, executionModeMeta } from "@/constants";

interface ChannelPresence {
  tone: PresenceTone;
  headline: string;
  timeline: string;
  stepLabels: string[];
  runCount: number;
}

interface ChannelStatusMeta {
  badgeVariant: "default" | "emerald" | "cyan" | "amber" | "danger" | "muted";
  label: string;
}

interface ChannelsViewProps {
  selectedChannel: CollaborationChannel | null;
  selectedChannelMembers: WorkspaceAgent[];
  selectedChannelMessages: ChannelMessage[];
  channelStatusMeta: ChannelStatusMeta;
  agentPresenceById: Record<string, ChannelPresence>;
  channelComposer: string;
  setChannelComposer: (value: string) => void;
  channelDraftAttachments: ComposerAttachment[];
  channelAttachmentError: string | null;
  setChannelAttachmentError: (value: string | null) => void;
  isChannelCollaborating: boolean;
  handleSendChannelMessage: (event: React.FormEvent<HTMLFormElement>) => void;
  ingestComposerFiles: (fileList: FileList | File[], target: "chat" | "channel") => Promise<void>;
  removeDraftAttachment: (target: "chat" | "channel", attachmentId: string) => void;
  channelFileInputRef: RefObject<HTMLInputElement>;
  channelMentionCandidates: WorkspaceAgent[];
  attachmentLibrary: Record<string, ComposerAttachment>;
  selectedChannelDelegations: DelegationTask[];
  updateChannelMemberTarget: (channelId: string, agentId: string, value: string) => void;
  allAgents: WorkspaceAgent[];
  setSelectedAgentId: (id: string) => void;
  setActivityDrawerTab: AppState["setActivityDrawerTab"];
  setIsActivityDrawerOpen: (open: boolean) => void;
}

export function ChannelsView({
  selectedChannel,
  selectedChannelMembers,
  selectedChannelMessages,
  channelStatusMeta,
  agentPresenceById,
  channelComposer,
  setChannelComposer,
  channelDraftAttachments,
  channelAttachmentError,
  isChannelCollaborating,
  handleSendChannelMessage,
  ingestComposerFiles,
  removeDraftAttachment,
  channelFileInputRef,
  channelMentionCandidates,
  attachmentLibrary,
  selectedChannelDelegations,
  updateChannelMemberTarget,
  allAgents,
  setSelectedAgentId,
  setActivityDrawerTab,
  setIsActivityDrawerOpen,
}: ChannelsViewProps) {
  return (
    <div className="mt-2 grid min-h-[780px] grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-[400px] flex-col overflow-hidden rounded-[20px] border border-white/6 bg-[linear-gradient(180deg,rgba(11,18,28,0.92),rgba(8,14,23,0.88))] shadow-[0_18px_48px_rgba(2,6,23,0.14)] sm:min-h-[760px] sm:rounded-[28px]">
        {selectedChannel ? (
          <>
            <div className="border-b border-white/6 bg-[linear-gradient(180deg,rgba(15,23,35,0.9),rgba(11,17,27,0.82))] px-4 py-4 sm:px-7 sm:py-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#3b82f6]/18 bg-[linear-gradient(180deg,rgba(37,99,235,0.88),rgba(29,78,216,0.66))] text-[12px] font-semibold text-white">
                      #
                    </div>
                    <div>
                      <p className="text-[20px] font-semibold text-[#f5fbff] sm:text-[26px]">
                        {selectedChannel.title}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                        {selectedChannelMembers.length} members · lead
                        @
                        {slugifyLabel(
                          selectedChannelMembers.find(
                            (agent) =>
                              agent.id ===
                              selectedChannel.leadAgentId,
                          )?.name || "agent",
                        )}
                      </p>
                    </div>
                  </div>
                  {selectedChannel.objective && (
                    <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[#8ea0b5]">
                      {selectedChannel.objective}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={channelStatusMeta.badgeVariant}>
                    {channelStatusMeta.label}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.04),transparent_22%)] px-8 py-8">
              {selectedChannelMessages.length === 0 ? (
                <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center">
                  <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#4f6880]">
                    Fresh room
                  </div>
                  <p className="mt-5 max-w-xl text-[28px] font-semibold tracking-[0.01em] text-[#edf4f8]">
                    Start the conversation.
                  </p>
                  <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-[#6e7f93]">
                    Mention an agent like @
                    {slugifyLabel(
                      selectedChannelMembers[0]?.name || "galaxy",
                    )}{" "}
                    to direct the first handoff, or just type
                    naturally and let the room begin.
                  </p>
                </div>
              ) : (
                <div className="space-y-7">
                  {selectedChannelMessages.map((message) => {
                    const isSystem = message.role === "system";
                    const isUser = message.role === "user";
                    const isAgent = !isSystem && !isUser;
                    const messagePresence = message.senderId
                      ? agentPresenceById[message.senderId]
                      : null;
                    const isTaskTimeline =
                      isSystem && message.kind === "task";
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-3",
                          isSystem
                            ? "justify-center"
                            : isUser
                              ? "justify-end"
                              : "justify-start",
                        )}
                      >
                        {!isUser && !isSystem && (
                          <div className="relative mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-[#3b82f6]/18 bg-[linear-gradient(180deg,rgba(37,99,235,0.9),rgba(29,78,216,0.68))] text-[11px] font-semibold text-white">
                            {message.sender.slice(0, 2).toUpperCase()}
                            {messagePresence && (
                              <span
                                className={cn(
                                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#0f1724]",
                                  presenceDotClasses(
                                    messagePresence.tone,
                                  ),
                                )}
                              />
                            )}
                          </div>
                        )}
                        <div
                          className={cn(
                            "min-w-0",
                            isSystem
                              ? "max-w-[720px]"
                              : "max-w-[820px]",
                          )}
                        >
                          {!isSystem && (
                            <div
                              className={cn(
                                "mb-2 flex flex-wrap items-center gap-2",
                                isUser
                                  ? "justify-end"
                                  : "justify-start",
                              )}
                            >
                              <span className="text-[14px] font-medium text-[#edf4f8]">
                                {message.sender}
                              </span>
                              <span className="text-[11px] text-[#70849a]">
                                {formatRelativeTime(
                                  message.timestamp,
                                )}
                              </span>
                              {messagePresence && (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px]",
                                    presenceTextClasses(
                                      messagePresence.tone,
                                    ),
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      presenceDotClasses(
                                        messagePresence.tone,
                                      ),
                                    )}
                                  />
                                  {messagePresence.tone === "running"
                                    ? "working"
                                    : messagePresence.tone ===
                                        "review"
                                      ? "ready"
                                      : messagePresence.tone ===
                                          "error"
                                        ? "attention"
                                        : "idle"}
                                </span>
                              )}
                              {message.kind !== "message" && (
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]",
                                    activityBadgeClasses(
                                      message.kind === "handoff"
                                        ? "delegation"
                                        : message.kind === "result"
                                          ? "typing"
                                          : "thinking",
                                    ),
                                  )}
                                >
                                  {message.kind}
                                </span>
                              )}
                            </div>
                          )}
                          <div
                            className={cn(
                              "rounded-[24px] border px-5 py-4 text-[14px] leading-7 whitespace-pre-wrap shadow-none",
                              isTaskTimeline
                                ? "border-[#38bdf8]/16 bg-[linear-gradient(180deg,rgba(11,22,35,0.92),rgba(10,18,27,0.88))] text-left text-[#b5c9d8]"
                                : isSystem
                                  ? "border-white/8 bg-white/[0.03] text-center text-[#9eb0c2]"
                                  : isUser
                                    ? "border-[#2c3a4c] bg-[linear-gradient(180deg,rgba(13,20,31,0.94),rgba(10,15,23,0.9))] text-[#e7eef6]"
                                    : isAgent
                                      ? "border-white/6 bg-[linear-gradient(180deg,rgba(17,25,37,0.92),rgba(11,17,26,0.86))] text-[#d8e2eb]"
                                      : "border-white/6 bg-[linear-gradient(180deg,rgba(17,25,37,0.92),rgba(11,17,26,0.86))] text-[#d8e2eb]",
                            )}
                          >
                            {isTaskTimeline ? (
                              <div className="flex items-start gap-3">
                                <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-2xl border border-[#38bdf8]/18 bg-[#0d1824] text-[#8fe7ff]">
                                  <Activity className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#6baec5]">
                                    Task Timeline
                                  </p>
                                  <p className="mt-2 text-[14px] leading-7 text-[#d8e7f0]">
                                    {message.content}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  "min-w-0 break-words [&_a]:text-[#8fd3ff] [&_a]:underline [&_code]:rounded-md [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.95em] [&_em]:text-[#dbe7f2] [&_h1]:mt-1 [&_h1]:text-[1.35rem] [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-[1.15rem] [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-[1.02rem] [&_h3]:font-semibold [&_li]:mt-1.5 [&_ol]:my-4 [&_ol]:pl-6 [&_p]:my-0 [&_p+_p]:mt-4 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-white/8 [&_pre]:bg-[#0b0f14] [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6",
                                  isUser
                                    ? "[&_a]:text-[#bfe2ff]"
                                    : "",
                                )}
                                dangerouslySetInnerHTML={{
                                  __html: renderMessageHtml(
                                    message.content,
                                  ),
                                }}
                              />
                            )}
                          </div>
                          {!!message.attachmentIds?.length && (
                            <div className="mt-3 flex flex-wrap gap-3">
                              {message.attachmentIds
                                .map(
                                  (attachmentId) =>
                                    attachmentLibrary[attachmentId],
                                )
                                .filter(Boolean)
                                .map((attachment) => (
                                  <div
                                    key={attachment.id}
                                    className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]"
                                  >
                                    {attachment.kind === "image" &&
                                    attachment.previewUrl ? (
                                      <div className="w-[180px]">
                                        <img
                                          src={attachment.previewUrl}
                                          alt={attachment.name}
                                          className="h-[120px] w-full object-cover"
                                        />
                                        <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[#a8bacb]">
                                          <ImageIcon className="h-3.5 w-3.5" />
                                          <span className="truncate">
                                            {attachment.name}
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex max-w-[280px] items-start gap-2 px-3 py-2.5 text-left text-[11px] text-[#a8bacb]">
                                        <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                                        <div className="min-w-0">
                                          <p className="truncate font-medium text-[#c9d1d9]">
                                            {attachment.name}
                                          </p>
                                          <p className="mt-1 line-clamp-2 text-[#6e7f93]">
                                            {attachment.kind ===
                                            "text"
                                              ? "Text extracted into agent context."
                                              : attachment.warning ||
                                                "Attached to the conversation."}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                            </div>
                          )}
                          {!isSystem && messagePresence && (
                            <div
                              className={cn(
                                "mt-2 flex flex-wrap items-center gap-2",
                                isUser
                                  ? "justify-end"
                                  : "justify-start",
                              )}
                            >
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[#8fa1b3]">
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    presenceDotClasses(
                                      messagePresence.tone,
                                    ),
                                  )}
                                />
                                {messagePresence.timeline}
                              </span>
                              {messagePresence.stepLabels.map(
                                (label) => (
                                  <span
                                    key={`${message.id}-${label}`}
                                    className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] text-[#a6b8c8]"
                                  >
                                    {label}
                                  </span>
                                ),
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (message.senderId) {
                                    setSelectedAgentId(
                                      message.senderId,
                                    );
                                  }
                                  setActivityDrawerTab("activity");
                                  setIsActivityDrawerOpen(true);
                                }}
                                className={cn(
                                  "text-[11px] text-[#4f6880] transition-colors hover:text-[#b9c7d6]",
                                  isUser ? "ml-auto" : "",
                                )}
                              >
                                view activity
                              </button>
                            </div>
                          )}
                        </div>
                        {isUser && (
                          <div className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#162334] text-[12px] font-semibold text-[#d7e2eb]">
                            You
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <form
              onSubmit={handleSendChannelMessage}
              className="border-t border-white/6 bg-[linear-gradient(180deg,rgba(13,21,31,0.96),rgba(10,16,24,0.94))] px-7 py-5"
            >
              <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,24,36,0.94),rgba(11,17,26,0.9))] shadow-none">
                <input
                  ref={channelFileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.txt,.md,.markdown,.json,.csv,.tsv,.js,.jsx,.ts,.tsx,.py,.sql,.html,.css,.xml,.yaml,.yml,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.length) {
                      void ingestComposerFiles(
                        event.target.files,
                        "channel",
                      );
                      event.target.value = "";
                    }
                  }}
                />
                {channelDraftAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-b border-white/8 px-4 py-3">
                    {channelDraftAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="inline-flex max-w-[280px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-[#d9e4ee]"
                      >
                        {attachment.kind === "image" ? (
                          <ImageIcon className="h-3.5 w-3.5 text-[#8fd3ff]" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-[#b5c7d8]" />
                        )}
                        <span className="truncate">
                          {attachment.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            removeDraftAttachment(
                              "channel",
                              attachment.id,
                            )
                          }
                          className="text-[#6e7f93] transition-colors hover:text-[#edf4f8]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={channelComposer}
                  onChange={(event) =>
                    setChannelComposer(event.target.value)
                  }
                  placeholder="Message the room. Mention @architect or another agent to direct the work."
                  className="min-h-[96px] w-full resize-none bg-transparent px-5 py-4 text-[14px] text-[#edf4f8] placeholder-[#70849a] focus:outline-none"
                  onPaste={(event) => {
                    if (event.clipboardData.files.length > 0) {
                      event.preventDefault();
                      void ingestComposerFiles(
                        event.clipboardData.files,
                        "channel",
                      );
                    }
                  }}
                />
                {channelAttachmentError && (
                  <div className="border-t border-white/8 px-4 py-3 text-[11px] text-[#f5a1a1]">
                    {channelAttachmentError}
                  </div>
                )}
                {channelMentionCandidates.length > 0 && (
                  <div className="border-t border-white/8 px-4 py-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-[#4f6880]">
                      Mention Agent
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {channelMentionCandidates
                        .slice(0, 6)
                        .map((agent) => (
                          <button
                            key={agent.id}
                            type="button"
                            onClick={() =>
                              setChannelComposer(
                                insertMentionAtEnd(
                                  channelComposer,
                                  slugifyLabel(agent.name),
                                )
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-[#d9e4ee] transition-colors hover:border-white/16 hover:bg-white/[0.05]"
                          >
                            <span>{agent.emoji}</span>
                            <span>{agent.name}</span>
                            <span className="text-[#6e7f93]">
                              @{slugifyLabel(agent.name)}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-white/8 px-4 py-3">
                  <div className="flex items-center gap-2 text-[11px] text-[#70849a]">
                    <button
                      type="button"
                      onClick={() =>
                        channelFileInputRef.current?.click()
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[#9fb0c3] transition-colors hover:border-white/16 hover:bg-white/[0.05] hover:text-[#edf4f8]"
                    >
                      <Paperclip className="h-3 w-3" />
                      Attach
                    </button>
                    <span>Mentions route work inside the room.</span>
                  </div>
                  <button
                    type="submit"
                    disabled={
                      (!channelComposer.trim() &&
                        channelDraftAttachments.length === 0) ||
                      isChannelCollaborating
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(180deg,rgba(59,130,246,0.95),rgba(37,99,235,0.85))] px-3.5 py-2 text-[12px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </button>
                </div>
              </div>
            </form>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-[13px] text-[#6e7f93]">
            Create or select a channel to coordinate agents on one
            shared task.
          </div>
        )}
      </div>

      <div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
        <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(15,23,35,0.9),rgba(10,16,24,0.86))] p-4 shadow-none">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#eef6fb]">
              Members
            </p>
            <span className="text-[11px] text-[#6e7f93]">
              {selectedChannelMembers.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {selectedChannelMembers.map((agent) => (
              <div
                key={agent.id}
                className="rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-[#edf4f8]">
                      {agent.emoji} {agent.name}
                    </p>
                    <p className="mt-1 text-[11px] text-[#6e7f93]">
                      {agent.role}
                    </p>
                  </div>
                  {selectedChannel?.leadAgentId === agent.id && (
                    <Badge variant="cyan">Lead</Badge>
                  )}
                </div>
                <textarea
                  value={
                    selectedChannel?.memberTargets[agent.id] || ""
                  }
                  onChange={(event) =>
                    selectedChannel &&
                    updateChannelMemberTarget(
                      selectedChannel.id,
                      agent.id,
                      event.target.value,
                    )
                  }
                  placeholder={`Target for ${agent.name} in this channel`}
                  className="mt-3 min-h-[48px] w-full resize-none rounded-xl border border-white/8 bg-[#0f1724] px-3 py-2 text-[11px] text-[#dce7f0] placeholder-[#6e8398] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]/35"
                />
              </div>
            ))}
          </div>
        </div>

        {selectedChannelDelegations.length > 0 && (
          <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(15,23,35,0.9),rgba(10,16,24,0.86))] p-4 shadow-none">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#eef6fb]">
                Linked Tasks
              </p>
              <span className="text-[11px] text-[#6e7f93]">
                {selectedChannelDelegations.length}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {selectedChannelDelegations.slice(0, 6).map((task) => (
                <div
                  key={task.id}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-[#edf4f8]">
                        {task.title}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-[#6e7f93]">
                        {allAgents.find(
                          (agent) => agent.id === task.fromAgentId,
                        )?.name || task.fromAgentId}{" "}
                        →{" "}
                        {allAgents.find(
                          (agent) => agent.id === task.assigneeId,
                        )?.name || task.assigneeId}
                      </p>
                      <p className="mt-1 truncate text-[10px] text-[#62758a]">
                        {task.notes || "Delegated from this room"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant={
                          delegationMeta[task.status].badgeVariant
                        }
                      >
                        {delegationMeta[task.status].label}
                      </Badge>
                      <Badge
                        variant={
                          executionModeMeta[task.executionMode]
                            .badgeVariant
                        }
                      >
                        {executionModeMeta[task.executionMode].label}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedChannel?.lastSummary && (
          <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(15,23,35,0.9),rgba(10,16,24,0.86))] p-4 shadow-none">
            <p className="text-sm font-semibold text-[#eef6fb]">
              Latest Summary
            </p>
            <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-[#8ea0b5]">
              {selectedChannel.lastSummary}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
