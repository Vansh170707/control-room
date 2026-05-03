/**
 * Utility/helper functions for the Control Room workspace.
 * Extracted from App.tsx lines 2314-3895.
 */
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { Agent } from "@/data/mock-data";
import type { RuntimeExecuteResult, RuntimeHealth, BrowserUseSession } from "@/lib/agent-runtime";
import { fetchLatestGmailMessages } from "@/lib/agent-runtime";
import type { ToolDefinition, ToolName } from "@/lib/tool-definitions";
import { TOOL_DEFINITIONS } from "@/lib/tool-definitions";
import type { ToolInvocationResult } from "@/lib/tool-definitions";
import {
  accentPalette,
  BUILDER_AGENT_ID,
  CONVERSATION_RESET_VERSION,
  DEFAULT_AGENT_WORKSPACE,
  GALAXY_AGENT_ID,
  LEGACY_DEFAULT_WORKSPACES,
  PDF_RESUME_GENERATOR_PATH,
  STORAGE_KEYS,
  STORAGE_MAINTENANCE_VERSION,
  TRUSTED_PERSONAL_TERMINAL_ACCESS,
  blockedCommandPatterns,
  commandApprovalPatterns,
  connectorCatalog,
  automationOptionCatalog,
  providerPresets,
  readOnlyCommands,
  shellRiskPattern,
} from "@/constants";
import {
  normalizeAgentConnectors,
  normalizeAutomationOptions,
  normalizeAgentPermissions,
  deriveTools,
  resolveWorkspacePath,
  uniqueStrings,
} from "@/lib/data-mappers";
import type {
  ActivityKind,
  AgentConnectorKey,
  AgentPermissions,
  ChatMessage,
  ChannelMessage,
  CollaborationChannel,
  CommandReview,
  CommandRun,
  ComposerAttachment,
  DelegationTask,
  AgentExecutionPlan,
  PresenceTone,
  SandboxMode,
  WorkspaceAgent,
} from "@/types";

// parseList, uniqueStrings, toLiveActivityKind are exported from @/lib/data-mappers

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\\\''`)}'`;
}

export function encodePromptForShell(prompt: string) {
  if (typeof window === "undefined") return "";
  return window.btoa(unescape(encodeURIComponent(prompt)));
}

export function extractResumeName(prompt: string) {
  const explicitMatch =
    prompt.match(/\b(?:i am|my name is)\s+([a-z][a-z\s]+?)(?:\s+in\b|\s+from\b|,|\.|$)/i) ||
    prompt.match(/\bname\s*[:\-]\s*([a-z][a-z\s]+?)(?:\s+in\b|\s+from\b|,|\.|$)/i);
  const candidate = explicitMatch?.[1]?.trim();
  if (!candidate) return "Resume";
  return candidate.split(/\s+/).filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join("_");
}

export function shouldUseResumePdfSkill(prompt: string, contextMessages: ChatMessage[] = []) {
  const recentContext = contextMessages.slice(-8).map((m) => m.contextText || m.content).join("\n\n");
  const normalizedPrompt = prompt.toLowerCase();
  const normalizedContext = recentContext.toLowerCase();
  const combined = `${normalizedContext}\n${normalizedPrompt}`;
  const promptMentionsPdf = /\b(pdf|resume pdf|cv pdf)\b/.test(normalizedPrompt);
  const combinedMentionsPdf = /\b(pdf|resume pdf|cv pdf)\b/.test(combined);
  const combinedMentionsResume = /\b(resume|cv)\b/.test(combined);
  const promptWantsCreation = /\b(create|generate|make|build|save|export)\b/.test(normalizedPrompt);
  const followUpCreate = /\b(run it|do it yourself|create it|make it|save it|generate it|export it)\b/.test(normalizedPrompt);
  return (
    (promptMentionsPdf && promptWantsCreation) ||
    (combinedMentionsPdf && combinedMentionsResume && (promptWantsCreation || followUpCreate)) ||
    (combinedMentionsResume && promptWantsCreation && normalizedPrompt.includes("pdf"))
  );
}

export function buildResumePdfSkillPlan(prompt: string, contextMessages: ChatMessage[]): AgentExecutionPlan {
  const combinedPrompt = contextMessages.map((m) => m.contextText || m.content).concat(prompt).filter(Boolean).join("\n\n");
  const outputName = `${extractResumeName(combinedPrompt)}_Resume.pdf`;
  const outputPath = `${DEFAULT_AGENT_WORKSPACE}/Desktop/${outputName}`;
  const encodedPrompt = encodePromptForShell(combinedPrompt);
  const command = [
    "python3", shellQuote(PDF_RESUME_GENERATOR_PATH),
    "--output", shellQuote(outputPath),
    "--prompt-b64", shellQuote(encodedPrompt),
  ].join(" ");
  return {
    mode: "command", command, cwd: DEFAULT_AGENT_WORKSPACE,
    reasoning: "Using the bundled PDF generation skill to create the requested resume PDF on Desktop.",
  };
}

export function activityBadgeClasses(kind: ActivityKind) {
  if (kind === "typing") {
    return "border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd]";
  }

  if (kind === "thinking") {
    return "border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#fcd34d]";
  }

  if (kind === "search") {
    return "border-[#1f6feb]/30 bg-[#1f6feb]/10 text-[#79c0ff]";
  }

  if (kind === "read") {
    return "border-[#0ea5a4]/30 bg-[#0ea5a4]/10 text-[#99f6e4]";
  }

  if (kind === "git") {
    return "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#86efac]";
  }

  if (kind === "test") {
    return "border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#fde68a]";
  }

  if (kind === "build" || kind === "install") {
    return "border-[#94a3b8]/30 bg-[#94a3b8]/10 text-[#e2e8f0]";
  }

  return "border-[#1f6feb]/30 bg-[#1f6feb]/10 text-[#79c0ff]";
}

export function presenceDotClasses(tone: PresenceTone) {
  if (tone === "running") {
    return "bg-[#38bdf8] shadow-[0_0_0_5px_rgba(56,189,248,0.14)] animate-pulse";
  }

  if (tone === "review") {
    return "bg-[#f59e0b] shadow-[0_0_0_5px_rgba(245,158,11,0.14)]";
  }

  if (tone === "error") {
    return "bg-[#ef4444] shadow-[0_0_0_5px_rgba(239,68,68,0.12)]";
  }

  return "bg-[#516274]";
}

export function presenceTextClasses(tone: PresenceTone) {
  if (tone === "running") {
    return "text-[#a5e9ff]";
  }

  if (tone === "review") {
    return "text-[#f7c56c]";
  }

  if (tone === "error") {
    return "text-[#f5a1a1]";
  }

  return "text-[#4f6880]";
}

export function runIsInFlight(status?: string | null) {
  return (
    status === "queued" ||
    status === "planning" ||
    status === "running" ||
    status === "waiting_for_approval"
  );
}

const STALE_IN_FLIGHT_RUN_MS = 30 * 60 * 1000;

export function runCountsAsInFlight(run: CommandRun) {
  if (!runIsInFlight(run.status)) {
    return false;
  }

  const startedAt = Date.parse(run.createdAt);
  return Number.isNaN(startedAt)
    ? true
    : Date.now() - startedAt < STALE_IN_FLIGHT_RUN_MS;
}

export function runNeedsAttention(status?: string | null) {
  return status === "failed" || status === "blocked" || status === "canceled";
}

export function runStatusTone(status?: string | null) {
  if (status === "running" || status === "planning") {
    return {
      dot: "bg-[#38bdf8] shadow-[0_0_0_6px_rgba(56,189,248,0.12)]",
      text: "text-[#8fd8ff]",
      border: "border-[#38bdf8]/18",
      glow: "shadow-[0_0_0_1px_rgba(56,189,248,0.08),0_22px_48px_rgba(14,165,233,0.12)]",
      rail: "from-[#38bdf8] via-[#1d4ed8] to-transparent",
    };
  }

  if (status === "completed") {
    return {
      dot: "bg-[#34d399] shadow-[0_0_0_6px_rgba(52,211,153,0.12)]",
      text: "text-[#86efac]",
      border: "border-[#34d399]/16",
      glow: "shadow-[0_18px_38px_rgba(5,150,105,0.08)]",
      rail: "from-[#34d399] via-[#065f46] to-transparent",
    };
  }

  if (status === "queued" || status === "waiting_for_approval") {
    return {
      dot: "bg-[#f59e0b] shadow-[0_0_0_6px_rgba(245,158,11,0.12)]",
      text: "text-[#fcd34d]",
      border: "border-[#f59e0b]/18",
      glow: "shadow-[0_18px_38px_rgba(217,119,6,0.08)]",
      rail: "from-[#f59e0b] via-[#92400e] to-transparent",
    };
  }

  if (status === "blocked" || status === "failed") {
    return {
      dot: "bg-[#fb7185] shadow-[0_0_0_6px_rgba(251,113,133,0.12)]",
      text: "text-[#fda4af]",
      border: "border-[#fb7185]/18",
      glow: "shadow-[0_18px_38px_rgba(225,29,72,0.09)]",
      rail: "from-[#fb7185] via-[#9f1239] to-transparent",
    };
  }

  return {
    dot: "bg-[#64748b] shadow-[0_0_0_6px_rgba(100,116,139,0.10)]",
    text: "text-[#cbd5e1]",
    border: "border-white/8",
    glow: "shadow-[0_18px_38px_rgba(15,23,42,0.10)]",
    rail: "from-[#64748b] via-[#334155] to-transparent",
  };
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMessageHtml(content: string) {
  const raw = marked.parse(content, {
    async: false,
    breaks: true,
    gfm: true,
  }) as string;

  return DOMPurify.sanitize(raw);
}

export function isTextLikeMime(type: string) {
  return (
    type.startsWith("text/") ||
    [
      "application/json",
      "application/xml",
      "application/x-yaml",
      "application/yaml",
      "application/javascript",
      "application/typescript",
    ].includes(type)
  );
}

export function looksLikeTextDocument(name: string) {
  return /\.(txt|md|markdown|json|csv|tsv|js|jsx|ts|tsx|py|rb|go|java|c|cpp|h|hpp|css|html|xml|yaml|yml|sql)$/i.test(
    name,
  );
}

export function truncateAttachmentText(value: string, limit = 12000) {
  const normalized = value.trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit)}\n\n[Truncated after ${limit} characters]`;
}

export async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () =>
      reject(reader.error || new Error(`Failed to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export async function readFileAsText(file: File) {
  return await file.text();
}

export async function buildComposerAttachment(
  file: File,
): Promise<ComposerAttachment> {
  const baseAttachment: ComposerAttachment = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || "Untitled",
    mimeType: file.type || "application/octet-stream",
    kind: "document",
    size: file.size,
  };

  if (file.type.startsWith("image/")) {
    return {
      ...baseAttachment,
      kind: "image",
      previewUrl: await readFileAsDataUrl(file),
    };
  }

  if (isTextLikeMime(file.type) || looksLikeTextDocument(file.name)) {
    return {
      ...baseAttachment,
      kind: "text",
      textContent: truncateAttachmentText(await readFileAsText(file)),
    };
  }

  return {
    ...baseAttachment,
    kind: "document",
    warning:
      "Attached to the conversation, but binary text extraction is not available yet in the local runtime.",
  };
}

export function buildAttachmentContext(attachments: ComposerAttachment[]) {
  if (attachments.length === 0) {
    return "";
  }

  return [
    "Attached context:",
    ...attachments.map((attachment, index) => {
      if (attachment.kind === "text" && attachment.textContent) {
        return [
          `${index + 1}. ${attachment.name} (${attachment.mimeType || "text"})`,
          truncateText(attachment.textContent, 5000),
        ].join("\n");
      }

      if (attachment.kind === "image") {
        return `${index + 1}. ${attachment.name} (${attachment.mimeType || "image"})\nAn image is attached in the UI for visual reference. The current local runtime may not fully inspect image pixels for every provider yet, so rely on this image when a vision-capable path is available.`;
      }

      return `${index + 1}. ${attachment.name} (${attachment.mimeType || "document"})\n${attachment.warning || "A document is attached for reference."}`;
    }),
  ].join("\n\n");
}

export function mergePromptWithAttachments(
  prompt: string,
  attachments: ComposerAttachment[],
) {
  const attachmentContext = buildAttachmentContext(attachments);
  return attachmentContext ? `${prompt}\n\n${attachmentContext}` : prompt;
}

export function hasImageAttachments(attachments: ComposerAttachment[]) {
  return attachments.some(
    (attachment) =>
      attachment.kind === "image" && typeof attachment.previewUrl === "string",
  );
}

export function shouldConsiderSandboxExecution(prompt: string) {
  return /\b(create|make|write|save|export|edit|modify|delete|rename|move|copy|terminal|command|shell|run|execute|install|build|test|debug|fix|folder|directory|file|pdf|docx|csv|json|script|repo|git|read|inspect|check|list|open)\b/i.test(
    prompt,
  );
}

export function cleanRequestedPathName(value: string) {
  return value
    .replace(/\s+(?:please|thanks|thank you)$/i, "")
    .replace(/[.?!]+$/g, "")
    .trim()
    .replace(/[/:]/g, "-")
    .replace(/\s+/g, " ");
}

export function slugifyFileStem(value: string) {
  const slug = cleanRequestedPathName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "notes";
}

export function inferRecentLocalDirectory(
  messages: Array<Pick<ChatMessage, "content" | "contextText">> = [],
) {
  const pathPattern = /\/Users\/vanshsehrawat\/[^\n`]+/g;
  for (const message of [...messages].reverse()) {
    const text = `${message.contextText ?? ""}\n${message.content ?? ""}`;
    const matches = text.match(pathPattern) ?? [];
    for (const rawPath of matches.reverse()) {
      const cleaned = rawPath
        .replace(/[),.;\]]+$/g, "")
        .replace(/^['"`]+|['"`]+$/g, "")
        .trim();
      if (!cleaned) {
        continue;
      }
      return /\.[a-z0-9]{1,8}$/i.test(cleaned)
        ? cleaned.replace(/\/[^/]+$/, "")
        : cleaned;
    }
  }
  return "";
}

export function buildSimpleTextFileContent(topic: string, prompt: string) {
  const title = cleanRequestedPathName(topic || "Notes");
  return [
    title,
    "",
    `This text file was created from the request: ${prompt.trim()}`,
    "",
    topic
      ? `${title} is the subject requested for this note. You can edit or expand this file whenever you want.`
      : "You can edit or expand this file whenever you want.",
    "",
  ].join("\n");
}

export function buildDeterministicLocalCommand(
  prompt: string,
  previousThread: Array<Pick<ChatMessage, "content" | "contextText">> = [],
) {
  if (
    /\b(?:create|make)\b/i.test(prompt) &&
    /\b(?:folder|directory)\b/i.test(prompt)
  ) {
    const nameMatch =
      prompt.match(/\b(?:named|called)\s+["'`]?(.+?)["'`]?\s*$/i) ??
      prompt.match(/\b(?:folder|directory)\s+["'`]?([^"'`]+?)["'`]?\s*$/i);
    const requestedName = cleanRequestedPathName(nameMatch?.[1] ?? "");
    if (!requestedName) {
      return null;
    }

    const basePath = /\bdesktop\b/i.test(prompt)
      ? `${DEFAULT_AGENT_WORKSPACE}/Desktop`
      : /\bsame folder\b/i.test(prompt)
        ? inferRecentLocalDirectory(previousThread) || DEFAULT_AGENT_WORKSPACE
        : DEFAULT_AGENT_WORKSPACE;
    const targetPath = `${basePath}/${requestedName}`;

    return {
      kind: "create_folder" as const,
      targetPath,
      command: [
        `mkdir -p ${shellQuote(targetPath)}`,
        `test -d ${shellQuote(targetPath)}`,
        `printf ${shellQuote(`CREATED ${targetPath}\n`)}`,
      ].join(" && "),
      cwd: basePath,
      reasoning: `Create and verify the requested folder at ${targetPath}.`,
    };
  }

  if (
    /\b(?:create|make|write|generate|save)\b/i.test(prompt) &&
    /\b(?:txt|text file|\.txt|file)\b/i.test(prompt)
  ) {
    const topic =
      cleanRequestedPathName(
        prompt.match(/\b(?:about|describing|explaining)\s+(.+?)$/i)?.[1] ?? "",
      ) || "notes";
    const explicitName = cleanRequestedPathName(
      prompt.match(/\b(?:named|called)\s+["'`]?(.+?)["'`]?\s*$/i)?.[1] ?? "",
    );
    const fileName = /\.[a-z0-9]{1,8}$/i.test(explicitName)
      ? explicitName
      : `${slugifyFileStem(explicitName || topic)}.txt`;
    const basePath = /\bdesktop\b/i.test(prompt)
      ? `${DEFAULT_AGENT_WORKSPACE}/Desktop`
      : /\bsame folder\b/i.test(prompt)
        ? inferRecentLocalDirectory(previousThread) || DEFAULT_AGENT_WORKSPACE
        : DEFAULT_AGENT_WORKSPACE;
    const targetPath = `${basePath}/${fileName}`;
    const content = buildSimpleTextFileContent(topic, prompt);

    return {
      kind: "create_text_file" as const,
      targetPath,
      command: [
        `mkdir -p ${shellQuote(basePath)}`,
        `printf %s ${shellQuote(content)} > ${shellQuote(targetPath)}`,
        `test -f ${shellQuote(targetPath)}`,
        `printf ${shellQuote(`CREATED ${targetPath}\n`)}`,
      ].join(" && "),
      cwd: basePath,
      reasoning: `Create and verify the requested text file at ${targetPath}.`,
    };
  }

  return null;
}

export function formatDeterministicCommandReply(input: {
  plan: NonNullable<ReturnType<typeof buildDeterministicLocalCommand>>;
  result: RuntimeExecuteResult;
}) {
  const exitCode =
    typeof input.result.exitCode === "number"
      ? input.result.exitCode
      : input.result.ok
        ? 0
        : 1;

  if (input.plan.kind === "create_folder" && input.result.ok) {
    return [
      "Done - I created and verified the folder on your Mac:",
      "",
      `\`${input.plan.targetPath}\``,
      "",
      `Exit code: ${exitCode}.`,
    ].join("\n");
  }

  if (input.plan.kind === "create_text_file" && input.result.ok) {
    return [
      "Done - I created and verified the text file on your Mac:",
      "",
      `\`${input.plan.targetPath}\``,
      "",
      `Exit code: ${exitCode}.`,
    ].join("\n");
  }

  return [
    `I tried to create \`${input.plan.targetPath}\`, but the local bridge reported a failure.`,
    "",
    `Exit code: ${exitCode}.`,
    input.result.stderr ? `stderr:\n${input.result.stderr}` : "",
    input.result.error ? `error:\n${input.result.error}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function withVisionRuntimeAgent(
  agent: WorkspaceAgent,
  options: {
    hasImageInput: boolean;
    githubModelsReady: boolean;
  },
) {
  if (!options.hasImageInput) {
    return agent;
  }

  if (options.githubModelsReady) {
    return {
      ...agent,
      provider: "GitHub",
      model: "openai/gpt-4.1",
      systemPrompt: [
        agent.systemPrompt,
        "An image attachment is present in the current user turn.",
        "Inspect the image directly and answer from what you can see.",
      ].join("\n\n"),
    };
  }

  return {
    ...agent,
    systemPrompt: [
      agent.systemPrompt,
      "An image attachment is present in the current user turn.",
      "If you cannot inspect image pixels in this provider path, state that clearly and continue with whatever context is available.",
    ].join("\n\n"),
  };
}

export function toRuntimeConversation(
  messages: Array<
    Pick<
      ChatMessage,
      | "role"
      | "content"
      | "sender"
      | "timestamp"
      | "contextText"
      | "attachmentIds"
    >
  >,
  attachmentsById: Record<string, ComposerAttachment>,
) {
  return messages.map((message) => ({
    role: message.role,
    content: truncateText(message.contextText || message.content, 6000),
    sender: message.sender,
    timestamp: message.timestamp,
    attachments: (message.attachmentIds ?? [])
      .map((attachmentId) => attachmentsById[attachmentId])
      .filter((attachment): attachment is ComposerAttachment =>
        Boolean(
          attachment &&
          attachment.kind === "image" &&
          typeof attachment.previewUrl === "string",
        ),
      )
      .map((attachment) => ({
        type: "image" as const,
        url: attachment.previewUrl!,
        mimeType: attachment.mimeType,
        name: attachment.name,
      })),
  }));
}

export function reviewCommand(
  command: string,
  sandboxMode: SandboxMode,
): CommandReview {
  const trimmedCommand = command.trim();

  if (!trimmedCommand) {
    return { status: "safe", reasons: [] };
  }

  if (sandboxMode === "none") {
    return {
      status: "blocked",
      reasons: ["Sandbox execution is disabled for this agent."],
    };
  }

  if (TRUSTED_PERSONAL_TERMINAL_ACCESS && sandboxMode === "workspace-write") {
    return { status: "safe", reasons: [] };
  }

  for (const pattern of blockedCommandPatterns) {
    if (pattern.test(trimmedCommand)) {
      return {
        status: "blocked",
        reasons: [
          "This command is blocked by the local sandbox policy before it can run.",
        ],
      };
    }
  }

  if (sandboxMode === "read-only") {
    if (shellRiskPattern.test(trimmedCommand)) {
      return {
        status: "blocked",
        reasons: [
          "Read-only mode blocks shell operators, redirection, and command chaining.",
        ],
      };
    }

    const baseCommand = trimmedCommand.split(/\s+/)[0] ?? "";
    if (!readOnlyCommands.has(baseCommand)) {
      return {
        status: "blocked",
        reasons: [`Read-only mode does not allow "${baseCommand}".`],
      };
    }
  }

  const reasons = commandApprovalPatterns
    .filter((entry) => entry.pattern.test(trimmedCommand))
    .map((entry) => entry.reason);

  if (shellRiskPattern.test(trimmedCommand)) {
    reasons.push(
      "It uses shell operators, redirection, or variable expansion.",
    );
  }

  return {
    status: reasons.length > 0 ? "approval" : "safe",
    reasons: uniqueStrings(reasons),
  };
}

export function normalizeSandboxCommand(command: string) {
  return command.trim();
}

export function shouldAutoApproveWorkspaceCommand(agent: WorkspaceAgent) {
  return (
    agent.id === BUILDER_AGENT_ID ||
    (TRUSTED_PERSONAL_TERMINAL_ACCESS &&
      agent.source === "custom" &&
      agent.permissions.terminal &&
      agent.sandboxMode === "workspace-write")
  );
}

export function formatCommandReviewContent(
  command: string,
  reasons: string[],
  prefix: string,
) {
  return [
    prefix,
    `Command: \`${command}\``,
    "Why it was flagged:",
    ...reasons.map((reason) => `- ${reason}`),
  ].join("\n");
}

// deriveTools is exported from @/lib/data-mappers


export function getEnabledToolDefinitions(permissions: AgentPermissions) {
  const enabledToolNames: ToolName[] = [];

  if (permissions.browser) {
    enabledToolNames.push(
      "browser.fetch",
      "browser.extract",
      "browser.run",
      "http.request",
    );
  }
  if (permissions.files) {
    enabledToolNames.push(
      "filesystem.read",
      "filesystem.write",
      "filesystem.list",
      "code.search",
    );
  }
  if (permissions.git) {
    enabledToolNames.push("git.status", "git.diff", "git.log");
  }
  if (permissions.terminal) {
    enabledToolNames.push("shell.exec");
  }
  if (permissions.delegation) {
    enabledToolNames.push("delegate.task");
  }

  return TOOL_DEFINITIONS.filter((tool) =>
    enabledToolNames.includes(tool.name),
  );
}

export function capabilitySummary(permissions: AgentPermissions) {
  const enabledTools = getEnabledToolDefinitions(permissions);
  const categoryOrder: ToolDefinition["category"][] = [
    "browser",
    "filesystem",
    "code",
    "git",
    "shell",
    "http",
    "delegation",
  ];
  return categoryOrder
    .map((category) => {
      const categoryTools = enabledTools.filter(
        (tool) => tool.category === category,
      );
      if (categoryTools.length === 0) {
        return null;
      }

      const label =
        category === "browser"
          ? "Browser"
          : category === "filesystem"
            ? "Files"
            : category === "code"
              ? "Code Search"
              : category === "git"
                ? "Git"
                : category === "shell"
                  ? "Sandbox"
                  : category === "http"
                    ? "HTTP"
                    : "Delegation";

      return {
        category,
        label,
        tools: categoryTools,
      };
    })
    .filter(Boolean) as Array<{
    category: ToolDefinition["category"];
    label: string;
    tools: ToolDefinition[];
  }>;
}

export function enabledConnectorLabels(permissions: AgentPermissions) {
  const connectors = normalizeAgentConnectors(permissions.connectors);
  return connectorCatalog
    .filter((connector) => connectors[connector.key])
    .map((connector) => connector.label);
}

export function enabledAutomationLabels(permissions: AgentPermissions) {
  const automations = normalizeAutomationOptions(permissions.automations);
  return automationOptionCatalog
    .filter((automation) => automations[automation.key])
    .map((automation) => automation.label);
}

export function connectorStatusLabel(
  key: AgentConnectorKey,
  options: {
    hasAgentRuntime: boolean;
    hasSupabaseConfig: boolean;
    runtimeHealth: RuntimeHealth;
    copilotAuthenticated: boolean;
  },
) {
  if (options.runtimeHealth.connectors?.[key]) {
    return "Connected";
  }
  if (key === "localBridge") {
    return options.hasAgentRuntime ? "Connected" : "Runtime Offline";
  }
  if (key === "browser") {
    return options.runtimeHealth.providers?.browserUse
      ? "Connected"
      : options.hasAgentRuntime
        ? "Needs Key"
        : "Runtime Offline";
  }
  if (key === "composio") {
    return options.runtimeHealth.connectors?.composio
      ? "Connected"
      : options.hasAgentRuntime
        ? "Needs Key"
        : "Runtime Offline";
  }
  if (key === "github") {
    return options.copilotAuthenticated ||
      options.runtimeHealth.providers?.githubModels
      ? "Connected"
      : "Needs Auth";
  }
  if (key === "vercel" || key === "supabase") {
    return key === "supabase" && options.hasSupabaseConfig
      ? "Connected"
      : options.hasAgentRuntime
        ? "Needs Token"
        : "Needs Setup";
  }
  return options.hasAgentRuntime ? "Needs OAuth" : "Needs Setup";
}

export function connectorStatusVariant(status: string) {
  if (status === "Connected") return "emerald";
  if (status.includes("Needs")) return "amber";
  return "muted";
}

export function buildWelcomeThread(agent: WorkspaceAgent): ChatMessage[] {
  void agent;
  return [];
}

export function mapLiveAgentToWorkspaceAgent(agent: Agent): WorkspaceAgent {
  const livePermissions: AgentPermissions = {
    terminal: agent.status !== "offline",
    browser: false,
    files: true,
    git: false,
    delegation: true,
  };

  return {
    ...agent,
    source: "connected",
    provider: "Live runtime",
    model: "external bridge",
    objective:
      agent.currentActivity ||
      `${agent.name} is connected through the existing runtime bridge.`,
    systemPrompt: `Connected runtime profile for ${agent.name}.`,
    specialties: agent.skills.length > 0 ? agent.skills : ["Realtime sync"],
    tools: deriveTools(livePermissions),
    workspace: "Managed by connected runtime",
    sandboxMode: "workspace-write",
    permissions: livePermissions,
  };
}

export function loadStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return fallback;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

export function truncateText(value: string, limit = 6000) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n...[trimmed for local storage]`;
}

export function trimMessagesForStorage(
  messagesByAgent: Record<string, ChatMessage[]>,
  limitPerAgent = 30,
) {
  return Object.fromEntries(
    Object.entries(messagesByAgent).map(([agentId, messages]) => [
      agentId,
      messages.slice(-limitPerAgent).map((message) => ({
        ...message,
        content: truncateText(message.content, 4000),
      })),
    ]),
  );
}

export function trimChannelMessagesForStorage(
  channelMessagesById: Record<string, ChannelMessage[]>,
  limitPerChannel = 30,
) {
  return Object.fromEntries(
    Object.entries(channelMessagesById).map(([channelId, messages]) => [
      channelId,
      messages.slice(-limitPerChannel).map((message) => ({
        ...message,
        content: truncateText(message.content, 4000),
      })),
    ]),
  );
}

export function trimCommandRunsForStorage(commandRuns: CommandRun[], limit = 50) {
  return commandRuns.slice(0, limit).map((run) => ({
    ...run,
    stdout: truncateText(run.stdout ?? "", 2000),
    stderr: truncateText(run.stderr ?? "", 2000),
    artifacts: (run.artifacts ?? []).slice(0, 5),
  }));
}

export function safeSetStoredValue(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Skipping ${key} persistence after storage quota error.`, error);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Persistence is best-effort; keep the live app responsive.
    }
  }
}

export function runLocalStorageMaintenance() {
  if (typeof window === "undefined") {
    return;
  }

  const versionKey = "control-room.storage-maintenance-version";
  try {
    const orchestrationStore = window.localStorage.getItem("orchestration-store");
    if (orchestrationStore && orchestrationStore.length > 500_000) {
      window.localStorage.removeItem("orchestration-store");
      window.localStorage.removeItem(versionKey);
    }
  } catch {
    // Ignore cleanup failures; persistence is best-effort.
  }

  if (window.localStorage.getItem(versionKey) === STORAGE_MAINTENANCE_VERSION) {
    return;
  }

  [
    STORAGE_KEYS.messages,
    `${STORAGE_KEYS.messages}.reset-version`,
    STORAGE_KEYS.channelMessages,
    `${STORAGE_KEYS.channelMessages}.reset-version`,
    STORAGE_KEYS.commandRuns,
    "orchestration-store",
  ].forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore cleanup failures.
    }
  });

  try {
    window.localStorage.setItem(versionKey, STORAGE_MAINTENANCE_VERSION);
  } catch {
    // If even the version marker cannot be written, the safe setters below
    // will still prevent crashes during the current session.
  }
}

export function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function loadConversationStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const resetKey = `${key}.reset-version`;
  if (window.localStorage.getItem(resetKey) !== CONVERSATION_RESET_VERSION) {
    window.localStorage.removeItem(key);
    window.localStorage.setItem(resetKey, CONVERSATION_RESET_VERSION);
    return fallback;
  }

  return loadStoredValue(key, fallback);
}

export function createDefaultMessages(agents: WorkspaceAgent[]) {
  return Object.fromEntries(
    agents.map((agent) => [agent.id, [] satisfies ChatMessage[]]),
  ) as Record<string, ChatMessage[]>;
}

export function createDefaultChannelMessages(
  channels: CollaborationChannel[],
  _agents: WorkspaceAgent[],
) {
  return Object.fromEntries(
    channels.map((channel) => {
      return [channel.id, [] satisfies ChannelMessage[]];
    }),
  ) as Record<string, ChannelMessage[]>;
}

export function slugifyLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractMentionSlugs(text: string) {
  const matches = text.toLowerCase().match(/@[a-z0-9-]+/g) ?? [];
  return uniqueStrings(matches.map((match) => match.slice(1)));
}

export function findChannelMentionQuery(text: string) {
  const match = text.match(/(?:^|\s)@([a-z0-9-]*)$/i);
  return match ? match[1].toLowerCase() : null;
}

export function insertMentionAtEnd(text: string, slug: string) {
  if (!text.trim()) {
    return `@${slug} `;
  }

  if (/(?:^|\s)@[a-z0-9-]*$/i.test(text)) {
    return text.replace(/@[a-z0-9-]*$/i, `@${slug} `);
  }

  return `${text}${/\s$/.test(text) ? "" : " "}@${slug} `;
}

export function buildChannelTaskPrompt(
  lead: WorkspaceAgent,
  member: WorkspaceAgent,
  prompt: string,
  target: string,
  handoffContext?: string,
) {
  return [
    `Lead agent: ${lead.name}`,
    `Shared task: ${prompt}`,
    `Your role in this channel: ${member.role}`,
    `Your objective: ${member.objective}`,
    target ? `Your channel target: ${target}` : "",
    handoffContext ? `Handoff context:\n${handoffContext}` : "",
    "Reply with your slice of the work, what you checked, blockers if any, and the next handoff the room should know about.",
    "If you need another channel member, explicitly mention them like @builder and explain what they should take over.",
  ].join("\n\n");
}

export function buildChannelLeadSummary(
  lead: WorkspaceAgent,
  prompt: string,
  collaboratorOutputs: Array<{ agent: WorkspaceAgent; text: string }>,
) {
  const summaryLines = collaboratorOutputs.map(({ agent, text }) => {
    const compressed = text.replace(/\s+/g, " ").trim().slice(0, 180);
    return `@${slugifyLabel(agent.name)}: ${compressed}${compressed.length >= 180 ? "..." : ""}`;
  });

  return [
    `I opened collaboration on: ${prompt}`,
    summaryLines.length > 0 ? "Team updates:" : "",
    ...summaryLines,
    summaryLines.length > 0
      ? "Next move: keep the lead plan tight, then use the sandbox lane or direct threads for the heaviest slice."
      : `${lead.name} can continue solo from here.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildChannelRoundReview(
  lead: WorkspaceAgent,
  roundNumber: number,
  waveResults: Array<{
    collaborator: WorkspaceAgent;
    response: { text: string; ok: boolean };
  }>,
  pendingAssignments: Array<{ agent: WorkspaceAgent }>,
) {
  const successes = waveResults.filter(({ response }) => response.ok);
  const blockers = waveResults.filter(({ response }) => !response.ok);

  const reviewLines = [
    `Round ${roundNumber} review from ${lead.name}:`,
    successes.length > 0
      ? `Completed: ${successes.map(({ collaborator }) => `@${slugifyLabel(collaborator.name)}`).join(", ")}`
      : "",
    blockers.length > 0
      ? `Blocked: ${blockers.map(({ collaborator }) => `@${slugifyLabel(collaborator.name)}`).join(", ")}`
      : "",
    pendingAssignments.length > 0
      ? `Next up: ${pendingAssignments.map(({ agent }) => `@${slugifyLabel(agent.name)}`).join(", ")}`
      : "No more specialist follow-ups are needed. I’m stitching the room together now.",
  ].filter(Boolean);

  return reviewLines.join("\n\n");
}

export function toTitleCase(value: string) {
  return value.replace(
    /\w\S*/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1),
  );
}

export function buildGalaxyChannelTitle(prompt: string) {
  const cleaned = prompt.replace(/[#@]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned
    .split(" ")
    .filter(Boolean)
    .filter(
      (word) =>
        ![
          "please",
          "can",
          "you",
          "help",
          "with",
          "for",
          "the",
          "a",
          "an",
          "and",
        ].includes(word.toLowerCase()),
    )
    .slice(0, 5);

  if (words.length === 0) {
    return "New Channel";
  }

  return toTitleCase(words.join(" "));
}

export function formatChannelHandle(title: string) {
  return `#${slugifyLabel(title) || "channel"}`;
}

export function shouldGalaxyCreateChannel(prompt: string) {
  const normalized = prompt.toLowerCase();
  const simpleThreadSignals = [
    "read this image",
    "read this screenshot",
    "describe this image",
    "describe this screenshot",
    "what is in this image",
    "what's in this image",
    "what is in this screenshot",
    "what's in this screenshot",
    "look at this image",
    "look at this screenshot",
    "analyze this image",
    "analyze this screenshot",
    "what does this say",
    "transcribe this image",
    "caption this image",
    "summarize this",
    "quick question",
  ];
  const explicitSignals = [
    "split this",
    "delegate",
    "handoff",
  ];
  const specialistSignals = [
    "architecture",
    "refactor",
  ];
  const multiStepSignals = [
    " and ",
    " then ",
    " after that ",
    " compare ",
    " plan and ",
    " research and ",
    " build and ",
    " review and ",
  ];

  if (simpleThreadSignals.some((signal) => normalized.includes(signal))) {
    return false;
  }

  const mentionCount = extractMentionSlugs(prompt).length;
  if (
    mentionCount > 0 &&
    explicitSignals.some((signal) => normalized.includes(signal))
  ) {
    return true;
  }

  if (explicitSignals.some((signal) => normalized.includes(signal))) {
    return true;
  }

  const matchedSpecialists = specialistSignals.filter((signal) =>
    normalized.includes(signal),
  ).length;
  const hasMultiStepIntent = multiStepSignals.some((signal) =>
    normalized.includes(signal),
  );

  if (mentionCount > 0) {
    return matchedSpecialists >= 2 || hasMultiStepIntent;
  }

  return matchedSpecialists >= 2 && hasMultiStepIntent;
}

export function shouldUseInteractiveBrowser(
  agent: WorkspaceAgent,
  prompt: string,
  browserUseReady: boolean,
) {
  if (!agent.permissions.browser || !browserUseReady) {
    return false;
  }

  const normalized = prompt.toLowerCase();
  const explicitBrowserPatterns = [
    /\b(use|launch|open|start)\s+(the\s+)?browser\b/,
    /\b(browser\s+use|browser-use|live browser)\b/,
    /\b(use|launch|run)\s+(a\s+)?browser\s+(agent|session|tool)\b/,
    /\b(open|visit|go to|navigate to)\s+https?:\/\//,
    /\b(open|visit|go to|navigate to)\s+(the\s+)?(website|site|web page|page)\b/,
    /\b(click|press|tap)\s+.*\b(button|link|menu|tab)\b/,
    /\b(fill|type|enter|submit)\s+.*\b(form|field|input|login|sign in|checkout)\b/,
    /\b(log in|login|sign in)\s+(to|on)\s+.*\b(site|website|browser|page)\b/,
  ];

  return explicitBrowserPatterns.some((pattern) => pattern.test(normalized));
}

export function shouldUseGmailConnector(agent: WorkspaceAgent, prompt: string) {
  const connectors = normalizeAgentConnectors(agent.permissions.connectors);
  if (!connectors.gmail) {
    return false;
  }

  const normalized = prompt.toLowerCase();
  const hasMailTarget = /\b(gmail|email|emails|mail|inbox)\b/.test(normalized);
  const asksToRead = /\b(read|check|search|show|list|summari[sz]e|find|latest|recent|unread)\b/.test(
    normalized,
  );
  return hasMailTarget && asksToRead;
}

export function getGmailRequestOptions(prompt: string) {
  const normalized = prompt.toLowerCase();
  const countMatch = normalized.match(/\b(?:last|latest|recent|top|first)\s+(\d{1,2})\b/);
  const limit = Math.min(Math.max(Number(countMatch?.[1] || 5), 1), 10);
  const query = /\bunread\b/.test(normalized) ? "is:unread" : "";
  return { limit, query };
}

export function shouldSendGmailConnector(agent: WorkspaceAgent, prompt: string) {
  const connectors = normalizeAgentConnectors(agent.permissions.connectors);
  if (!connectors.gmail) {
    return false;
  }

  const normalized = prompt.toLowerCase();
  return (
    /\bsend\b/.test(normalized) &&
    /\b(email|mail|gmail)\b/.test(normalized) &&
    /\bto\b/.test(normalized) &&
    !/\b(draft|compose|write)\b/.test(normalized)
  );
}

export function shouldDraftGmailConnector(agent: WorkspaceAgent, prompt: string) {
  const connectors = normalizeAgentConnectors(agent.permissions.connectors);
  if (!connectors.gmail) {
    return false;
  }

  const normalized = prompt.toLowerCase();
  return (
    /\b(draft|compose|write)\b/.test(normalized) &&
    /\b(email|mail|gmail)\b/.test(normalized) &&
    /\bto\b/.test(normalized)
  );
}

export function parseGmailMessageRequest(prompt: string) {
  const normalized = prompt.trim();
  const toMatch =
    normalized.match(/\bto\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i) ||
    normalized.match(/\bemail\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (!toMatch) {
    return null;
  }

  const subjectMatch =
    normalized.match(/\bsubject\s*[:\-]?\s*["“]?([^"\n”]+)["”]?/i) ||
    normalized.match(/\babout\s+["“]?([^"\n”]+)["”]?/i);
  const bodyMatch =
    normalized.match(/\bbody\s*[:\-]?\s*([\s\S]+)/i) ||
    normalized.match(/\bsaying\s+([\s\S]+)/i) ||
    normalized.match(/\bmessage\s*[:\-]?\s*([\s\S]+)/i);

  const to = toMatch[1].trim();
  const subject = (subjectMatch?.[1] || "Message from Control Room").trim();
  const body = (bodyMatch?.[1] || "").trim();

  if (!body) {
    return null;
  }

  return { to, subject, body };
}

export function formatGmailDraftInvocationReply(result: ToolInvocationResult, parsed: { to: string; subject: string }) {
  if (!result.ok) {
    return result.error || "I couldn't create that Gmail draft.";
  }

  return `I drafted an email to ${parsed.to} with subject "${parsed.subject}".`;
}

export function formatGmailConnectorReply(result: Awaited<ReturnType<typeof fetchLatestGmailMessages>>) {
  if (!result.ok) {
    return result.error || "I could not read Gmail through Composio.";
  }

  if (!result.messages?.length) {
    return result.accountLabel
      ? `I checked ${result.accountLabel}, but found no matching emails.`
      : "I checked Gmail, but found no matching emails.";
  }

  const lines = result.messages.map((message, index) => {
    const labels = message.labels?.length ? ` (${message.labels.join(", ")})` : "";
    return `${index + 1}. ${message.subject}${labels}\nFrom: ${message.from || "Unknown"}\nDate: ${message.date || "Unknown"}\n${message.snippet || ""}`;
  });

  return [
    `I checked ${result.accountLabel || "Gmail"} through Composio. Latest ${result.messages.length} email${result.messages.length === 1 ? "" : "s"}:`,
    "",
    lines.join("\n\n"),
  ].join("\n");
}

export function formatGmailSendInvocationReply(result: ToolInvocationResult, parsed: { to: string; subject: string }) {
  if (result.approvalRequired) {
    return `I prepared the Gmail send for ${parsed.to} with subject "${parsed.subject}". Review the approval card to send it.`;
  }

  if (!result.ok) {
    return result.error || "I couldn't send that Gmail message.";
  }

  return `I sent the email to ${parsed.to} with subject "${parsed.subject}".`;
}

export function isBrowserUseSessionFinished(session: BrowserUseSession) {
  const status = session.status.toLowerCase();
  return [
    "completed",
    "idle",
    "stopped",
    "failed",
    "error",
    "timed_out",
    "timeout",
    "finished",
    "done",
  ].includes(status);
}

export function getBrowserUseSessionOutput(session: BrowserUseSession) {
  const directOutput =
    typeof session.output === "string"
      ? session.output.trim()
      : session.output
        ? JSON.stringify(session.output, null, 2)
        : "";

  if (directOutput) {
    return directOutput;
  }

  const messageOutput = (session.messages ?? [])
    .filter((message) =>
      ["assistant", "agent", "system"].includes(
        String(message.role || "").toLowerCase(),
      ),
    )
    .map((message) => message.summary || message.data || "")
    .filter(Boolean)
    .slice(-4)
    .join("\n\n")
    .trim();

  if (messageOutput) {
    return messageOutput;
  }

  if (session.error) {
    return `Browser Use error: ${session.error}`;
  }

  return "";
}

export function buildBrowserOperatorTask(input: {
  agent: WorkspaceAgent;
  prompt: string;
}) {
  return [
    `You are the live browser operator for ${input.agent.name}.`,
    "Use the browser directly: navigate, read the page, click buttons/links, type into fields, submit forms, scroll, and inspect results as needed.",
    "Do not stop after opening the site. Complete the user's browser task end-to-end when possible.",
    "If a login, payment, CAPTCHA, OTP, or sensitive credential is required, stop and report exactly what is needed.",
    "Return a concise final answer with what you did, what you found, and any relevant links or visible results.",
    "",
    "User task:",
    input.prompt,
  ].join("\n");
}

export function selectGalaxyChannelMembers(prompt: string, agents: WorkspaceAgent[]) {
  const normalized = prompt.toLowerCase();
  const selected = new Set<string>([GALAXY_AGENT_ID]);

  if (/(plan|architecture|system|roadmap|scope|design)/.test(normalized)) {
    selected.add("architect");
  }

  if (
    /(build|implement|code|refactor|fix|debug|terminal|sandbox|file|git|ship)/.test(
      normalized,
    )
  ) {
    selected.add("builder");
  }

  if (
    /(research|docs|compare|scrape|browser|website|search|market|analyze)/.test(
      normalized,
    )
  ) {
    selected.add("researcher");
  }

  if (/(review|qa|test|validate|regression|check)/.test(normalized)) {
    selected.add("qa-guard");
  }

  if (/(triage|ops|fast|quick|summarize|summary)/.test(normalized)) {
    selected.add("sprinter");
  }

  if (selected.size === 1) {
    selected.add("architect");
    selected.add("builder");
  }

  return agents.filter((agent) => selected.has(agent.id));
}

export function buildGalaxyMemberTargets(prompt: string, members: WorkspaceAgent[]) {
  return Object.fromEntries(
    members.map((member) => {
      const target =
        member.id === GALAXY_AGENT_ID
          ? `Lead the room for "${prompt}", keep the work coordinated, and review every specialist update before reporting back.`
          : member.id === "architect"
            ? `Turn "${prompt}" into a crisp plan, define the work slices, and identify the cleanest handoff order.`
            : member.id === "builder"
              ? `Own the implementation-heavy part of "${prompt}", including code, files, terminal work, and concrete next steps.`
              : member.id === "researcher"
                ? `Gather outside context for "${prompt}", including browsing, comparisons, docs, or scraping-style research if needed.`
                : member.id === "qa-guard"
                  ? `Review "${prompt}" for regressions, test gaps, and risky assumptions before sign-off.`
                  : member.id === "sprinter"
                    ? `Keep "${prompt}" moving with fast triage, concise summaries, and unblockers for the room.`
                    : member.objective;

      return [member.id, target];
    }),
  ) as Record<string, string>;
}

export function inferHandoffAgentsFromText(
  text: string,
  members: WorkspaceAgent[],
  currentAgentId: string,
) {
  const mentionSlugs = extractMentionSlugs(text);
  return members.filter((member) => {
    if (member.id === currentAgentId) {
      return false;
    }

    return mentionSlugs.includes(slugifyLabel(member.name));
  });
}

export function pickAccent(index: number) {
  return accentPalette[index % accentPalette.length];
}

export function presetDisplayModel(preset: (typeof providerPresets)[number]) {
  return "displayModel" in preset && preset.displayModel
    ? preset.displayModel
    : preset.model;
}

export function generateAgentReply(
  agent: WorkspaceAgent,
  prompt: string,
  delegations: DelegationTask[],
) {
  const ownQueue = delegations.filter(
    (task) => task.assigneeId === agent.id && task.status !== "done",
  ).length;
  const promptLower = prompt.toLowerCase();

  let opening =
    "I’d translate this into a clear next action with a small first slice.";

  if (promptLower.includes("bug") || promptLower.includes("fix")) {
    opening =
      "I’d start by isolating the failure and checking the smallest thing that can prove what is wrong.";
  } else if (promptLower.includes("design") || promptLower.includes("ui")) {
    opening =
      "I’d first pin down the experience you want, then shape the screen around the real workflow.";
  } else if (promptLower.includes("deploy") || promptLower.includes("ship")) {
    opening =
      "I’d keep the release path tight: smallest shippable slice, quick verification, clear rollback.";
  } else if (promptLower.includes("research")) {
    opening =
      "I’d gather a few strong reference points and turn them into a short, useful brief.";
  } else if (
    /\b(hey|hi|hello|yo|how are you|how r you|whats up|what's up)\b/i.test(
      prompt,
    )
  ) {
    return `Hey, I’m here. What do you want to work on?`;
  }

  const delegationLine = agent.permissions.delegation
    ? "If it grows, I can split it into smaller pieces and keep the thread tidy."
    : "I’ll stay focused on this thread and keep the next step simple.";

  return ownQueue > 0
    ? `${opening}\n\nI also see ${ownQueue} active ${ownQueue === 1 ? "item" : "items"} on my side, so I’ll keep this focused. ${delegationLine}`
    : `${opening}\n\n${delegationLine}`;
}

